import "server-only";
import { addDays, findDuplicate, parts, suggestLine, type ISODate, type LineCandidate } from "@/lib/engine";
import { fetchAll, loadMonthView, must, toTx, type Tx } from "@/server/data";
import { setMark } from "@/server/plan-write";
import type { Session } from "@/server/session";
import { nextRecurringDate, type RecFrequency } from "./lib";

type Row = Parameters<typeof toTx>[0];
type Page = PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;
const yearOf = (d: ISODate) => parts(d).y;

/** Movimientos vivos entre dos fechas, sin pasar por la memoria de la petición (para comparar duplicados justo antes de escribir). */
export async function txBetween(s: Session, from: ISODate, to: ISODate): Promise<Tx[]> {
  const rows = await fetchAll<Row>((a, b) => s.supabase.from("transactions").select("*").is("deleted_at", null).gte("date", from).lte("date", to)
    .order("date", { ascending: false }).order("created_at", { ascending: false }).order("id").range(a, b) as unknown as Page);
  return rows.map(toTx);
}

/**
 * Movimientos sin límite de fecha: todos los "por revisar" o todos los unidos a una línea.
 * Completa los divididos: trae el original de cada parte y todas las partes de cada original.
 */
export async function txAnyDate(s: Session, by: { review: true } | { lineId: string }): Promise<Tx[]> {
  const base = await fetchAll<Row>((a, b) => {
    const q = s.supabase.from("transactions").select("*").is("deleted_at", null);
    return ("review" in by ? q.eq("status", "review") : q.eq("plan_line_id", by.lineId))
      .order("date", { ascending: false }).order("created_at", { ascending: false }).order("id").range(a, b) as unknown as Page;
  });
  const have = new Set(base.map((r) => r.id));
  const parentIds = [...new Set(base.map((r) => r.parent_id).filter((id): id is string => !!id && !have.has(id)))];
  const parents = parentIds.length ? must(await s.supabase.from("transactions").select("*").in("id", parentIds).is("deleted_at", null)) as unknown as Row[] : [];
  const splitIds = [...base, ...parents].filter((r) => r.is_split).map((r) => r.id);
  const kids = splitIds.length
    ? await fetchAll<Row>((a, b) => s.supabase.from("transactions").select("*").in("parent_id", splitIds).is("deleted_at", null)
        .order("date", { ascending: false }).order("created_at", { ascending: false }).order("id").range(a, b) as unknown as Page)
    : [];
  const out: Row[] = [];
  const seen = new Set<string>();
  for (const r of [...kids, ...base, ...parents]) if (!seen.has(r.id)) { seen.add(r.id); out.push(r); }
  const top = out.filter((r) => !r.parent_id).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return [...out.filter((r) => r.parent_id), ...top].map(toTx);
}

/**
 * Sugerencia de línea del plan para un movimiento (reglas de `s.config.matching`). Solo se muestra: el usuario confirma.
 * Una línea "Pagada · a mano" sigue siendo candidata (el movimiento la reemplaza); una ya cubierta por otro movimiento no.
 */
export async function suggestionFor(s: Session, tx: { id?: string; accountId: string | null; date: ISODate; amountCents: number; description: string }): Promise<{ lineId: string; name: string; month: number } | null> {
  const { y, m } = parts(tx.date);
  const view = await loadMonthView(s, y, m);
  const candidates: LineCandidate[] = view.groups.flatMap((g) => g.lines).map((l) => ({
    id: l.line.id, name: l.line.name, kind: l.line.kind, plannedCents: l.plannedCents,
    alreadyPaid: l.txIds.filter((id) => id !== tx.id).length > 0 && (l.status === "paid" || l.status === "over"),
  }));
  const hit = suggestLine(tx, m, candidates, s.config.matching);
  return hit ? { lineId: hit.id, name: hit.name, month: m } : null;
}

/** La línea debe ser del plan del mismo año que la fecha del movimiento (las líneas son por año). */
export async function lineOfYear(s: Session, lineId: string, date: ISODate): Promise<{ id: string; categoryId: string; name: string } | null> {
  const l = must(await s.supabase.from("plan_lines").select("id, year, category_id, name").eq("id", lineId).is("archived_at", null).limit(1))[0];
  if (!l || l.year !== yearOf(date)) return null;
  return { id: l.id, categoryId: l.category_id, name: l.name };
}

/**
 * Una línea guardada en una regla o en un recurrente es de UN año. Para un movimiento de otro año
 * se busca la línea con el mismo nombre y categoría en el plan de ese año; si no existe, queda sin línea.
 */
export async function lineForDate(s: Session, lineId: string | null, date: ISODate): Promise<string | null> {
  if (!lineId) return null;
  const l = must(await s.supabase.from("plan_lines").select("id, year, name, category_id, archived_at").eq("id", lineId).limit(1))[0];
  if (!l) return null;
  if (l.year === yearOf(date)) return l.archived_at ? null : l.id;
  const same = must(await s.supabase.from("plan_lines").select("id").eq("year", yearOf(date)).eq("name", l.name).eq("category_id", l.category_id).is("archived_at", null).limit(1));
  return same[0]?.id ?? null;
}

/** Al unir un movimiento a una línea, la marca "Pagado · a mano" de ese mes sobra: el movimiento la reemplaza. */
export async function clearMark(s: Session, lineId: string | null, date: ISODate): Promise<void> {
  if (lineId) await setMark(s, lineId, parts(date).m, false);
}

/**
 * Genera los recurrentes que ya vencieron (next_date <= hoy) como movimientos `source = 'recurring'` y avanza su fecha.
 * - Primero "reclama" la fecha (update con la fecha anterior como condición): dos pestañas abiertas no lo generan dos veces.
 * - Si ya existe un movimiento parecido (por ejemplo, llegó por CSV), no lo duplica, pero igual avanza la fecha.
 * Devuelve cuántos movimientos creó.
 */
export async function generateDueRecurring(s: Session): Promise<number> {
  const due = must(await s.supabase.from("recurring").select("*").eq("active", true).lte("next_date", s.today).order("next_date"));
  if (due.length === 0) return 0;
  const pad = s.config.matching.duplicateDays;
  const existing = (await txBetween(s, addDays(due[0].next_date, -pad), addDays(s.today, pad))).filter((t) => !t.parentId);
  let created = 0;
  for (const r of due) {
    const freq = r.frequency as RecFrequency;
    let date = r.next_date;
    for (let i = 0; i < 120 && date <= s.today; i++) {
      const next = nextRecurringDate(date, freq, r.anchor_day);
      const claimed = must(await s.supabase.from("recurring").update({ next_date: next }).eq("id", r.id).eq("next_date", date).eq("active", true).select("id"));
      if (claimed.length === 0) break; // otra pestaña ya lo hizo
      const candidate = { accountId: r.account_id, date, amountCents: r.amount_cents, description: r.description };
      if (!findDuplicate(candidate, existing, s.config.matching)) {
        const lineId = await lineForDate(s, r.plan_line_id, date);
        const row = must(await s.supabase.from("transactions").insert({
          user_id: s.userId, account_id: r.account_id, date, amount_cents: r.amount_cents, description: r.description, category_id: r.category_id,
          plan_line_id: lineId, source: "recurring", recurring_id: r.id, status: r.category_id || lineId ? "ok" : "review",
        }).select("id").single());
        await clearMark(s, lineId, date);
        existing.push({ ...candidate, id: row.id } as Tx);
        created++;
      }
      date = next;
    }
  }
  return created;
}
