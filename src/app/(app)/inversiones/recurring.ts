import "server-only";
import { decFromDb, decToDb, qtyFor, recurringDue, carryLine } from "@/lib/engine/inversiones";
import type { Frequency, ISODate } from "@/lib/engine";
import { fetchAll, must, type Line } from "@/server/data";
import type { Session } from "@/server/session";
import { OP_COLS, untyped, type AssetRow, type OpRow } from "./lib";

type LineRow = { id: string; name: string; category_id: string; year: number; frequency: string; first_pay_date: string | null; archived_at: string | null };

/**
 * Compras recurrentes ligadas al plan: al abrir Inversiones se suman las que ya tocaban (una por mes, con el monto
 * de la celda del plan) y que todavía no estén. La restricción única (asset_id, recurring_month) impide duplicarlas
 * aunque dos pestañas lo hagan a la vez. Por unidades, la cantidad sale del precio de hoy escrito a mano; sin precio,
 * espera (la pantalla lo avisa). Cambio de año: si la línea es del año anterior, se termina ese año y se pasa a la
 * línea copiada en el año en curso. Devuelve las operaciones nuevas y los activos que se re-ligaron.
 */
export async function syncRecurring(s: Session, assets: AssetRow[], ops: OpRow[], currentLines: Line[]): Promise<{ added: OpRow[]; relinked: Map<string, string> }> {
  const added: OpRow[] = [], relinked = new Map<string, string>();
  const linked = assets.filter((a) => a.plan_line_id && a.recurring_from && !a.archived_at);
  if (!s.canEdit || linked.length === 0) return { added, relinked };
  const db = untyped(s.supabase);

  const lineIds = [...new Set(linked.map((a) => a.plan_line_id as string))];
  const lines = must(await s.supabase.from("plan_lines").select("id, name, category_id, year, frequency, first_pay_date, archived_at").in("id", lineIds)) as LineRow[];
  const byId = new Map(lines.map((l) => [l.id, l]));
  // Líneas del año en curso a las que se puede pasar una del año anterior
  const carried = new Map<string, LineRow>();
  for (const l of lines) {
    if (l.year >= s.year) continue;
    const next = carryLine({ id: l.id, name: l.name, categoryId: l.category_id, year: l.year }, currentLines.map((c) => ({ id: c.id, name: c.name, categoryId: c.categoryId, year: c.year })));
    const full = next ? currentLines.find((c) => c.id === next.id) : null;
    if (full) carried.set(l.id, { id: full.id, name: full.name, category_id: full.categoryId, year: full.year, frequency: full.frequency, first_pay_date: full.firstPayDate, archived_at: null });
  }
  const allIds = [...new Set([...lineIds, ...[...carried.values()].map((l) => l.id)])];
  const cells = await fetchAll<{ line_id: string; month: number; amount_cents: number }>((a, b) =>
    s.supabase.from("plan_cells").select("line_id, month, amount_cents").in("line_id", allIds).order("line_id").order("month").range(a, b));
  const cellOf = (lineId: string, month: number) => cells.find((c) => c.line_id === lineId && c.month === month)?.amount_cents ?? 0;

  for (const a of linked) {
    const price = decFromDb(a.unit_price_cents);
    if (a.by_units && (price === null || price <= BigInt(0))) continue; // sin precio no se sabe la cantidad: espera
    const done = new Set(ops.filter((o) => o.asset_id === a.id && o.recurring_month).map((o) => o.recurring_month as string));
    const own = byId.get(a.plan_line_id as string);
    if (!own) continue;
    const targets = [own, ...(carried.has(own.id) ? [carried.get(own.id) as LineRow] : [])].filter((l) => !l.archived_at); // una línea quitada del plan ya no suma
    const rows = targets.flatMap((l) => recurringDue({
      year: l.year, frequency: l.frequency as Frequency, firstPayDate: l.first_pay_date, monthCents: (mo) => cellOf(l.id, mo),
      from: a.recurring_from as ISODate, today: s.today, done,
    })).map((d) => {
      const qty = a.by_units && price !== null ? qtyFor(d.amountCents, price) : null;
      return {
        user_id: s.userId, asset_id: a.id, date: d.date, kind: "buy", amount_cents: d.amountCents, source: "recurring", recurring_month: d.month,
        quantity: qty === null ? null : decToDb(qty), unit_price_cents: qty === null || price === null ? null : decToDb(price),
      };
    }).filter((r) => !a.by_units || r.quantity !== null);
    if (rows.length) {
      const res = await db.from("asset_operations").upsert(rows, { onConflict: "asset_id,recurring_month", ignoreDuplicates: true }).select(OP_COLS);
      added.push(...(must(res) as OpRow[]));
    }
    const next = carried.get(own.id);
    if (next) {
      must(await db.from("assets").update({ plan_line_id: next.id }).eq("id", a.id).select("id"));
      relinked.set(a.id, next.id);
    }
  }
  return { added, relinked };
}
