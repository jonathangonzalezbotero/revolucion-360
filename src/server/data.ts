import "server-only";
import { cache } from "react";
import {
  cellMap, cellOf, daysInMonth, iso, lineMonthStatus,
  type AccountKind, type AccountLite, type Cents, type Frequency, type ISODate, type LineMonth, type PlanCell, type PlanLine,
} from "@/lib/engine";
import type { Session } from "./session";

// Cargadores compartidos. Todas las pantallas leen el plan, las cuentas y los movimientos por aquí,
// para que un mismo número salga igual en Inicio, Plan, Detalle del mes, Cierre, Diagnóstico y Proyección.

export type CategoryKind = "income" | "expense" | "debt" | "saving" | "goal";
export type Category = { id: string; name: string; kind: CategoryKind; color: string; isBasic: boolean; sort: number };
export type Line = PlanLine & { sort: number };
export type PlanData = { year: number; categories: Category[]; lines: Line[]; cells: PlanCell[]; marks: Set<string> };

export const loadCategories = cache(async (s: Session): Promise<Category[]> => {
  const { data } = await s.supabase.from("categories").select("id, name, kind, color, is_basic, sort").order("sort").order("created_at");
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, kind: c.kind, color: c.color, isBasic: c.is_basic, sort: c.sort }));
});

/** Plan anual completo de un año: categorías, líneas, celdas y marcas de "Pagado · a mano". */
export const loadPlan = cache(async (s: Session, year: number): Promise<PlanData> => {
  const [categories, { data: lines }] = await Promise.all([
    loadCategories(s),
    s.supabase.from("plan_lines").select("*").eq("year", year).is("archived_at", null).order("sort").order("created_at"),
  ]);
  const ids = (lines ?? []).map((l) => l.id);
  const [{ data: cells }, { data: marks }] = ids.length
    ? await Promise.all([
        s.supabase.from("plan_cells").select("line_id, month, amount_cents, manual").in("line_id", ids),
        s.supabase.from("plan_marks").select("line_id, month").in("line_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  return {
    year, categories,
    lines: (lines ?? []).map((l) => ({
      id: l.id, name: l.name, kind: l.kind, categoryId: l.category_id, year: l.year, frequency: l.frequency as Frequency,
      amountCents: l.amount_cents, firstPayDate: l.first_pay_date, sort: l.sort, debtId: l.debt_id, goalId: l.goal_id, investmentId: l.investment_id,
    })),
    cells: (cells ?? []).map((c) => ({ lineId: c.line_id, month: c.month, amountCents: c.amount_cents, manual: c.manual })),
    marks: new Set((marks ?? []).map((m) => `${m.line_id}:${m.month}`)),
  };
});

export type Account = AccountLite & { name: string; institution: string; isEmergencyFund: boolean; sort: number };
export const loadAccounts = cache(async (s: Session): Promise<Account[]> => {
  const { data } = await s.supabase.from("accounts").select("*").is("archived_at", null).order("sort").order("created_at");
  return (data ?? []).map((a) => ({
    id: a.id, name: a.name, kind: a.kind as AccountKind, institution: a.institution, balanceCents: a.balance_cents, balanceDate: a.balance_date,
    inNetworth: a.in_networth, inForecast: a.in_forecast, isEmergencyFund: a.is_emergency_fund, sort: a.sort,
  }));
});

export type Tx = {
  id: string; accountId: string | null; date: ISODate; amountCents: Cents; description: string; rawDescription: string;
  categoryId: string | null; planLineId: string | null; kind: "normal" | "transfer"; status: "ok" | "review";
  source: "manual" | "csv" | "recurring"; parentId: string | null; isSplit: boolean; note: string; edited: boolean;
};
type TxRow = { id: string; account_id: string | null; date: string; amount_cents: number; description: string; raw_description: string; category_id: string | null; plan_line_id: string | null; kind: "normal" | "transfer"; status: "ok" | "review"; source: "manual" | "csv" | "recurring"; parent_id: string | null; is_split: boolean; note: string; edited_at: string | null };
export const toTx = (r: TxRow): Tx => ({
  id: r.id, accountId: r.account_id, date: r.date, amountCents: r.amount_cents, description: r.description, rawDescription: r.raw_description,
  categoryId: r.category_id, planLineId: r.plan_line_id, kind: r.kind, status: r.status, source: r.source, parentId: r.parent_id, isSplit: r.is_split, note: r.note, edited: !!r.edited_at,
});

/** Movimientos vivos entre dos fechas (sin eliminados). Los padres divididos vienen con isSplit = true y NO cuentan en sumas. */
export const loadTx = cache(async (s: Session, from: ISODate, to: ISODate): Promise<Tx[]> => {
  const { data } = await s.supabase.from("transactions").select("*").is("deleted_at", null).gte("date", from).lte("date", to)
    .order("date", { ascending: false }).order("created_at", { ascending: false }).limit(5000);
  return ((data ?? []) as TxRow[]).map(toTx);
});
export const monthRange = (year: number, month: number): [ISODate, ISODate] => [iso(year, month, 1), iso(year, month, daysInMonth(year, month))];
/** Movimientos que cuentan como ingreso o gasto: ni transferencias ni padres divididos. */
export const counts = (t: Tx) => t.kind === "normal" && !t.isSplit;

// ───────── Vista de un mes: plan frente a lo real, línea por línea ─────────
export type MonthLine = LineMonth & { line: Line; txIds: string[] };
export type MonthGroup = { category: Category; lines: MonthLine[]; plannedCents: Cents; realCents: Cents };
export type MonthView = {
  year: number; month: number; groups: MonthGroup[];
  plan: { income: Cents; expense: Cents; net: Cents };
  real: { income: Cents; expense: Cents; net: Cents };   // lo pagado o recibido (movimientos unidos + marcado a mano)
  paidCents: Cents;       // gastos del plan ya pagados
  missingCents: Cents;    // gastos del plan que faltan por pagar
  pending: MonthLine[];   // líneas de gasto pendientes o parciales, de mayor a menor
  unplanned: Tx[];        // movimientos del mes sin línea del plan
};

export const loadMonthView = cache(async (s: Session, year: number, month: number): Promise<MonthView> => {
  const [plan, txs] = await Promise.all([loadPlan(s, year), loadTx(s, ...monthRange(year, month))]);
  const map = cellMap(plan.cells);
  const live = txs.filter(counts);
  const byLine = new Map<string, Tx[]>();
  for (const t of live) if (t.planLineId) byLine.set(t.planLineId, [...(byLine.get(t.planLineId) ?? []), t]);

  const groups: MonthGroup[] = plan.categories.map((category) => {
    const lines = plan.lines.filter((l) => l.categoryId === category.id).map((line): MonthLine => {
      const linked = byLine.get(line.id) ?? [];
      const st = lineMonthStatus(cellOf(map, line.id, month), linked.map((t) => t.amountCents), plan.marks.has(`${line.id}:${month}`));
      return { ...st, line, txIds: linked.map((t) => t.id) };
    });
    return { category, lines, plannedCents: lines.reduce((a, l) => a + l.plannedCents, 0), realCents: lines.reduce((a, l) => a + l.realCents, 0) };
  }).filter((g) => g.lines.length > 0);

  const all = groups.flatMap((g) => g.lines);
  const inc = all.filter((l) => l.line.kind === "income"), exp = all.filter((l) => l.line.kind === "expense");
  const sumBy = (xs: MonthLine[], k: "plannedCents" | "realCents" | "missingCents") => xs.reduce((a, l) => a + l[k], 0);
  const planT = { income: sumBy(inc, "plannedCents"), expense: sumBy(exp, "plannedCents"), net: 0 };
  planT.net = planT.income - planT.expense;
  const realT = { income: sumBy(inc, "realCents"), expense: sumBy(exp, "realCents"), net: 0 };
  realT.net = realT.income - realT.expense;
  return {
    year, month, groups, plan: planT, real: realT,
    paidCents: exp.reduce((a, l) => a + Math.min(l.realCents, l.plannedCents), 0),
    missingCents: sumBy(exp, "missingCents"),
    pending: exp.filter((l) => l.missingCents > 0).sort((a, b) => b.missingCents - a.missingCents),
    unplanned: live.filter((t) => !t.planLineId),
  };
});

/** Datos para el diagnóstico de un mes, tomados del plan y de las cuentas y metas. */
export async function loadDiagnosticInput(s: Session, year: number, month: number) {
  const [plan, accounts, { data: goals }] = await Promise.all([
    loadPlan(s, year), loadAccounts(s),
    s.supabase.from("goals").select("id, is_emergency_fund, goal_entries(amount_cents)").eq("is_emergency_fund", true).is("archived_at", null),
  ]);
  const map = cellMap(plan.cells);
  const cat = new Map(plan.categories.map((c) => [c.id, c]));
  let income = 0, expense = 0, saving = 0, debt = 0, basic = 0, largest = 0;
  for (const l of plan.lines) {
    const v = cellOf(map, l.id, month), c = cat.get(l.categoryId);
    if (l.kind === "income") { income += v; largest = Math.max(largest, v); continue; }
    expense += v;
    if (c?.kind === "saving" || c?.kind === "goal") saving += v;
    if (c?.kind === "debt") debt += v;
    if (c?.isBasic) basic += v;
  }
  const fundFromGoals = (goals ?? []).reduce((a, g) => a + ((g.goal_entries as { amount_cents: number }[]) ?? []).reduce((x, e) => x + e.amount_cents, 0), 0);
  const fundFromAccounts = accounts.filter((a) => a.isEmergencyFund).reduce((a, x) => a + x.balanceCents, 0);
  return { incomeCents: income, expenseCents: expense, savingCents: saving, debtPaymentsCents: debt, basicExpensesCents: basic, emergencyFundCents: Math.max(fundFromGoals, fundFromAccounts), largestIncomeCents: largest };
}
