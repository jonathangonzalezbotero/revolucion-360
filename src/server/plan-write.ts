import "server-only";
import { recomputeCells, type Cents, type Frequency, type ISODate, type PlanCell } from "@/lib/engine";
import { must, type Category, type CategoryKind, type Line } from "./data";
import type { Session } from "./session";

// Escritura del plan anual. TODAS las pantallas que crean o cambian líneas pasan por aquí
// (asistente, plan anual, cierre de mes, metas, deudas, inversiones), para que la regla
// "la celda editada a mano gana" se cumpla igual en todas partes.

export type NewLine = {
  year: number; categoryId: string; name: string; kind: "income" | "expense"; frequency: Frequency;
  amountCents: Cents; firstPayDate: ISODate | null;
  /** Para frequency "custom": monto de cada mes (12 valores) */
  months?: Cents[];
  /** Solo aplica el monto entre estos meses (1–12), el resto queda en 0 */
  fromMonth?: number; toMonth?: number;
  debtId?: string | null; goalId?: string | null; investmentId?: string | null;
};

export async function createLine(s: Session, n: NewLine): Promise<string> {
  const sort = must(await s.supabase.from("plan_lines").select("sort").eq("year", n.year).eq("category_id", n.categoryId).order("sort", { ascending: false }).limit(1))[0]?.sort ?? -1;
  const row = must(await s.supabase.from("plan_lines").insert({
    user_id: s.userId, year: n.year, category_id: n.categoryId, name: n.name.trim().slice(0, 80), kind: n.kind, frequency: n.frequency,
    amount_cents: n.amountCents, first_pay_date: n.firstPayDate, sort: sort + 1, debt_id: n.debtId ?? null, goal_id: n.goalId ?? null, investment_id: n.investmentId ?? null,
  }).select("id").single());
  let cells: PlanCell[] = n.frequency === "custom"
    ? Array.from({ length: 12 }, (_, i) => ({ lineId: row.id, month: i + 1, amountCents: n.months?.[i] ?? 0, manual: false }))
    : recomputeCells({ id: row.id, name: n.name, kind: n.kind, categoryId: n.categoryId, year: n.year, frequency: n.frequency, amountCents: n.amountCents, firstPayDate: n.firstPayDate }, []);
  if (n.fromMonth || n.toMonth) cells = cells.map((c) => (c.month < (n.fromMonth ?? 1) || c.month > (n.toMonth ?? 12) ? { ...c, amountCents: 0 } : c));
  must(await s.supabase.from("plan_cells").insert(cells.map((c) => ({ line_id: row.id, user_id: s.userId, month: c.month, amount_cents: c.amountCents, manual: false }))).select("month"));
  await s.supabase.from("plan_years").upsert({ user_id: s.userId, year: n.year }, { onConflict: "user_id,year", ignoreDuplicates: true });
  return row.id;
}

/** Edita una celda suelta: queda marcada como manual y gana sobre la frecuencia. */
export async function setCell(s: Session, lineId: string, month: number, amountCents: Cents): Promise<void> {
  must(await s.supabase.from("plan_cells").upsert({ line_id: lineId, user_id: s.userId, month, amount_cents: Math.max(0, amountCents), manual: true }, { onConflict: "line_id,month" }).select("month"));
}

/** Aplica un monto a un rango de meses de una línea (ej. "ajusta el mes siguiente" o "de aquí a diciembre"). */
export async function setCells(s: Session, lineId: string, fromMonth: number, toMonth: number, amountCents: Cents): Promise<void> {
  const rows = [];
  for (let m = fromMonth; m <= toMonth; m++) rows.push({ line_id: lineId, user_id: s.userId, month: m, amount_cents: Math.max(0, amountCents), manual: true });
  if (rows.length) must(await s.supabase.from("plan_cells").upsert(rows, { onConflict: "line_id,month" }).select("month"));
}

export type LinePatch = Partial<Pick<Line, "name" | "kind" | "frequency" | "amountCents" | "firstPayDate" | "categoryId" | "debtId" | "goalId" | "investmentId">>;

/**
 * Cambia la línea. Si cambia frecuencia, monto o fecha, recalcula SOLO las celdas no manuales;
 * con `overwriteManual` las pisa todas ("aplicar a todos los meses"). `fromMonth` protege los meses pasados.
 * `kind` (ingreso ↔ gasto): quien llama comprueba antes que la línea no tenga movimientos unidos (Plan anual, `editLine`).
 * Devuelve cuántas celdas manuales se conservaron (para avisar en pantalla).
 */
export async function updateLine(s: Session, lineId: string, patch: LinePatch, opts: { overwriteManual?: boolean; fromMonth?: number } = {}): Promise<{ keptManual: number }> {
  const cur = must(await s.supabase.from("plan_lines").select("*").eq("id", lineId).single());
  const next = {
    name: patch.name?.trim().slice(0, 80) ?? cur.name, kind: patch.kind ?? cur.kind, frequency: patch.frequency ?? cur.frequency, amount_cents: patch.amountCents ?? cur.amount_cents,
    first_pay_date: patch.firstPayDate === undefined ? cur.first_pay_date : patch.firstPayDate, category_id: patch.categoryId ?? cur.category_id,
    debt_id: patch.debtId === undefined ? cur.debt_id : patch.debtId, goal_id: patch.goalId === undefined ? cur.goal_id : patch.goalId,
    investment_id: patch.investmentId === undefined ? cur.investment_id : patch.investmentId,
  };
  must(await s.supabase.from("plan_lines").update(next).eq("id", lineId).select("id"));
  const recalc = next.frequency !== cur.frequency || next.amount_cents !== cur.amount_cents || next.first_pay_date !== cur.first_pay_date;
  if (!recalc || next.frequency === "custom") return { keptManual: 0 };
  const existing = must(await s.supabase.from("plan_cells").select("month, amount_cents, manual").eq("line_id", lineId));
  const from = opts.fromMonth ?? 1;
  const cells = recomputeCells(
    { id: lineId, name: next.name, kind: cur.kind as "income" | "expense", categoryId: next.category_id, year: cur.year, frequency: next.frequency as Frequency, amountCents: next.amount_cents, firstPayDate: next.first_pay_date },
    existing.map((c) => ({ lineId, month: c.month, amountCents: c.amount_cents, manual: c.manual })), !!opts.overwriteManual,
  ).filter((c) => c.month >= from);
  must(await s.supabase.from("plan_cells").upsert(cells.map((c) => ({ line_id: lineId, user_id: s.userId, month: c.month, amount_cents: c.amountCents, manual: c.manual })), { onConflict: "line_id,month" }).select("month"));
  return { keptManual: opts.overwriteManual ? 0 : cells.filter((c) => c.manual).length };
}

/**
 * Reparte montos calculados (no editados a mano) desde `fromMonth`: los meses anteriores y las celdas editadas a mano
 * no se tocan ("la celda editada a mano gana"). Lo usa el asistente para el aporte a una meta, que va solo entre dos meses.
 */
export async function setAutoCells(s: Session, lineId: string, months: Cents[], fromMonth: number): Promise<void> {
  const manual = new Set(must(await s.supabase.from("plan_cells").select("month, manual").eq("line_id", lineId)).filter((c) => c.manual).map((c) => c.month));
  const rows = months.map((v, i) => ({ month: i + 1, v })).filter((c) => c.month >= fromMonth && !manual.has(c.month))
    .map((c) => ({ line_id: lineId, user_id: s.userId, month: c.month, amount_cents: Math.max(0, c.v), manual: false }));
  if (rows.length) must(await s.supabase.from("plan_cells").upsert(rows, { onConflict: "line_id,month" }).select("month"));
}

/**
 * "Tipo de gasto" de una línea de gasto: null = automático (regla de src/lib/engine/habito.ts), true = fijo, false = del día a día.
 * Va aparte de `updateLine` a propósito: así ninguna otra escritura de líneas nombra la columna `fixed` (migración 20261125000035)
 * y nada se rompe si esa migración aún no está aplicada. `as never` puntual hasta regenerar los tipos.
 */
export async function setLineFixed(s: Session, lineId: string, fixed: boolean | null): Promise<void> {
  must(await s.supabase.from("plan_lines").update({ fixed } as never).eq("id", lineId).eq("kind", "expense").select("id"));
}

/** Quita una línea del plan sin perder su historia (los movimientos unidos conservan su categoría). */
export async function archiveLine(s: Session, lineId: string): Promise<void> {
  must(await s.supabase.from("plan_lines").update({ archived_at: new Date().toISOString() }).eq("id", lineId).select("id"));
}

/** "Pendiente" ↔ "Pagado · a mano". Es el mismo dato que el nivel "Solo mi plan" de Movimientos. */
export async function setMark(s: Session, lineId: string, month: number, paid: boolean): Promise<void> {
  if (paid) must(await s.supabase.from("plan_marks").upsert({ line_id: lineId, user_id: s.userId, month }, { onConflict: "line_id,month" }).select("month"));
  else must(await s.supabase.from("plan_marks").delete().eq("line_id", lineId).eq("month", month).select("month"));
}

/** Categorías sugeridas del país (se crean una vez, en el onboarding). */
export async function createDefaultCategories(s: Session, countryCode: string): Promise<Category[]> {
  const existing = must(await s.supabase.from("categories").select("id").limit(1));
  if (existing.length === 0) {
    const country = must(await s.supabase.from("countries").select("categories").in("code", [countryCode, "OTHER"]).order("sort").limit(1))[0];
    const list = ((country?.categories ?? []) as { name: string; kind: CategoryKind; color: string; is_basic?: boolean }[])
      .filter((c) => s.config.flags.remesas || c.name !== "Familia y remesas");
    if (list.length) must(await s.supabase.from("categories").insert(list.map((c, i) => ({ user_id: s.userId, name: c.name, kind: c.kind, color: c.color, is_basic: !!c.is_basic, sort: i }))).select("id"));
  }
  const rows = must(await s.supabase.from("categories").select("id, name, kind, color, is_basic, sort").order("sort"));
  return rows.map((c) => ({ id: c.id, name: c.name, kind: c.kind as CategoryKind, color: c.color, isBasic: c.is_basic, sort: c.sort }));
}
