import "server-only";
import { addDays, lineMonthStatus, parts, type ISODate } from "@/lib/engine";
import {
  dailyAllowance, fixedLineIds, fixedOverrides, fixedSlots, flexibleBudget, flexibleSpend, upcomingPayments,
  type Allowance, type DuePayment, type HabitCategory, type HabitLine, type HabitTx, type LinkedTx,
} from "@/lib/engine/habito";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Admin } from "@/lib/email/cron";
import type { PlanCell } from "@/lib/engine";

// Datos del plan de UNA persona para los avisos del hábito, leídos con la clave de servicio (la tarea no tiene sesión).
// La clave de servicio salta RLS: CADA consulta filtra por user_id. Los montos solo se usan para armar el aviso;
// nunca se registran ni salen en la respuesta de la tarea.

const PAGE = 1000;
async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await q(from, from + PAGE - 1);
    if (error) throw new Error(`db: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return out;
  }
}

export type HabitPlan = { lines: HabitLine[]; cells: PlanCell[]; fixed: Set<string>; paid: Set<string>; categories: HabitCategory[]; monthTx: HabitTx[]; linkedMonth: LinkedTx[]; planNet: number };

/** Plan del año, qué es fijo y qué está pagado. null si no tiene plan este año. */
export async function loadHabitPlan(db: Admin, userId: string, today: ISODate): Promise<HabitPlan | null> {
  const { y, m } = parts(today);
  // select("*") a propósito: trae `fixed` (migración 20261125000035, "Tipo de gasto" en Plan) cuando existe; mientras no esté aplicada
  // la columna no llega y todo queda en automático, sin romper la tarea. Tipo puntual hasta regenerar los tipos.
  const linesRows = await all<{ id: string; name: string; kind: string; category_id: string; year: number; frequency: string; amount_cents: number; first_pay_date: string | null; debt_id: string | null; goal_id: string | null; investment_id: string | null; fixed?: boolean | null }>((a, b) =>
    db.from("plan_lines").select("*").eq("user_id", userId).eq("year", y).is("archived_at", null).order("id").range(a, b));
  if (!linesRows.length) return null;
  const lines: HabitLine[] = linesRows.map((l) => ({
    id: l.id, name: l.name, kind: l.kind as HabitLine["kind"], categoryId: l.category_id, year: l.year, frequency: l.frequency as HabitLine["frequency"],
    amountCents: l.amount_cents, firstPayDate: l.first_pay_date, debtId: l.debt_id, goalId: l.goal_id, investmentId: l.investment_id,
  }));
  const ids = lines.map((l) => l.id);
  const [cats, cells, marks, rec, txs] = await Promise.all([
    all<{ id: string; kind: string }>((a, b) => db.from("categories").select("id, kind").eq("user_id", userId).order("id").range(a, b)),
    all<{ line_id: string; month: number; amount_cents: number; manual: boolean }>((a, b) => db.from("plan_cells").select("line_id, month, amount_cents, manual").eq("user_id", userId).in("line_id", ids).order("line_id").order("month").range(a, b)),
    all<{ line_id: string; month: number }>((a, b) => db.from("plan_marks").select("line_id, month").eq("user_id", userId).in("line_id", ids).order("line_id").order("month").range(a, b)),
    all<{ plan_line_id: string | null }>((a, b) => db.from("recurring").select("plan_line_id").eq("user_id", userId).eq("active", true).not("plan_line_id", "is", null).order("id").range(a, b)),
    // Movimientos del año: los unidos a una línea (para saber qué es fijo y qué está pagado) y los del mes (gasto del día a día).
    all<{ date: string; amount_cents: number; category_id: string | null; plan_line_id: string | null; kind: string; is_split: boolean }>((a, b) =>
      db.from("transactions").select("date, amount_cents, category_id, plan_line_id, kind, is_split").eq("user_id", userId).is("deleted_at", null)
        .gte("date", `${y}-01-01`).lte("date", `${y}-12-31`).order("date").order("id").range(a, b)),
  ]);
  // "Dar por cerrado" (tabla `plan_closes`, migración 20261125000042): un parcial cerrado ya no se avisa como pendiente.
  // Si la tabla aún no existe, no hay ninguno.
  const closesRes = await (db as unknown as SupabaseClient).from("plan_closes").select("line_id, month").eq("user_id", userId).in("line_id", ids).not("closed_at", "is", null);
  if (closesRes.error && closesRes.error.code !== "PGRST205" && closesRes.error.code !== "42P01") throw new Error(`db: ${closesRes.error.message}`);
  const closeSet = new Set(((closesRes.error ? [] : closesRes.data) ?? []).map((c: { line_id: string; month: number }) => `${c.line_id}:${c.month}`));
  const categories: HabitCategory[] = cats.map((c) => ({ id: c.id, kind: c.kind as HabitCategory["kind"] }));
  const planCells: PlanCell[] = cells.map((c) => ({ lineId: c.line_id, month: c.month, amountCents: c.amount_cents, manual: c.manual }));
  const allTx: HabitTx[] = txs.map((t) => ({ date: t.date, amountCents: t.amount_cents, categoryId: t.category_id, planLineId: t.plan_line_id, kind: t.kind === "transfer" ? "transfer" : "normal", isSplit: t.is_split }));
  const linked: LinkedTx[] = allTx.filter((t) => t.planLineId && t.kind === "normal" && !t.isSplit).map((t) => ({ lineId: t.planLineId!, date: t.date, amountCents: t.amountCents }));
  const markKeys = marks.map((k) => `${k.line_id}:${k.month}`);
  const fixed = fixedLineIds({ lines, categories, cells: planCells, marks: markKeys, recurringLineIds: rec.map((r) => r.plan_line_id!).filter(Boolean), linked, overrides: fixedOverrides(linesRows) });

  // Pagado por línea y mes, con la misma regla que el detalle del mes (`lineMonthStatus`).
  const markSet = new Set(markKeys);
  const cellBy = new Map(planCells.map((c) => [`${c.lineId}:${c.month}`, c.amountCents]));
  const linkedBy = new Map<string, number[]>();
  for (const t of linked) { const k = `${t.lineId}:${parts(t.date).m}`; linkedBy.set(k, [...(linkedBy.get(k) ?? []), t.amountCents]); }
  const paid = new Set<string>();
  let income = 0, expense = 0;
  for (const l of lines) {
    for (const mm of [m, m === 12 ? 12 : m + 1]) {
      const k = `${l.id}:${mm}`;
      const st = lineMonthStatus(cellBy.get(k) ?? 0, linkedBy.get(k) ?? [], markSet.has(k), closeSet.has(k));
      if (st.status === "paid" || st.status === "paid_manual" || st.status === "over") paid.add(k);
    }
    const v = cellBy.get(`${l.id}:${m}`) ?? 0;
    if (l.kind === "income") income += v; else expense += v;
  }
  const monthTx = allTx.filter((t) => parts(t.date).m === m);
  const linkedMonth = linked.filter((t) => parts(t.date).m === m);
  return { lines, cells: planCells, fixed, paid, categories, monthTx, linkedMonth, planNet: income - expense };
}

/** Lo que le queda del día a día (misma regla que "Disponible del mes" en Inicio; el aviso diario usa `remainingCents`). */
export function allowanceOf(p: HabitPlan, today: ISODate): Allowance {
  const { m } = parts(today);
  const budget = flexibleBudget(p.lines, p.cells, m, p.fixed);
  const spent = flexibleSpend(p.monthTx, p.lines, p.categories, p.fixed, fixedSlots(p.lines, p.cells, m, p.fixed, p.linkedMonth));
  return dailyAllowance({ budgetCents: budget.totalCents, spentCents: spent.totalCents, today, planNetCents: p.planNet });
}

/** Pagos fijos con fecha de verdad que caen mañana y siguen sin pagar. */
export function dueTomorrow(p: HabitPlan, today: ISODate): DuePayment[] {
  const tomorrow = addDays(today, 1);
  return upcomingPayments({ lines: p.lines, cells: p.cells, fixed: p.fixed, paid: p.paid, from: tomorrow, to: tomorrow, explicitOnly: true });
}
