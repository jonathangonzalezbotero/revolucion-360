import "server-only";
import { cache } from "react";
import {
  cellMap, cellOf, daysInMonth, iso, lineMonthStatus,
  type AccountKind, type AccountLite, type Cents, type Frequency, type ISODate, type LineMonth, type PlanCell, type PlanLine,
} from "@/lib/engine";
import { recomputeCells, parts, addDays, diffDays } from "@/lib/engine";
import type { Session } from "./session";

/** Una consulta que falla NUNCA se pinta como "sin datos" o "$0": se lanza y la atrapa `run()` o la página de error. */
export function must<T>(r: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (r.error) throw new Error(`db: ${r.error.message}`);
  return r.data as NonNullable<T>;
}
/** Supabase devuelve máximo 1,000 filas por consulta. Esto trae TODAS, de a 1,000, para que ningún total quede truncado. */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const SIZE = 1000, out: T[] = [];
  for (let from = 0; ; from += SIZE) {
    const rows = must(await page(from, from + SIZE - 1));
    out.push(...rows);
    if (rows.length < SIZE) return out;
  }
}

// Cargadores compartidos. Todas las pantallas leen el plan, las cuentas y los movimientos por aquí,
// para que un mismo número salga igual en Inicio, Plan, Detalle del mes, Cierre, Diagnóstico y Proyección.

export type CategoryKind = "income" | "expense" | "debt" | "saving" | "goal";
export type Category = { id: string; name: string; kind: CategoryKind; color: string; isBasic: boolean; sort: number };
export type Line = PlanLine & { sort: number };
export type PlanData = { year: number; categories: Category[]; lines: Line[]; cells: PlanCell[]; marks: Set<string> };

export const loadCategories = cache(async (s: Session): Promise<Category[]> => {
  const data = must(await s.supabase.from("categories").select("id, name, kind, color, is_basic, sort").order("sort").order("created_at"));
  return data.map((c) => ({ id: c.id, name: c.name, kind: c.kind as CategoryKind, color: c.color, isBasic: c.is_basic, sort: c.sort }));
});

type LineRow = { id: string; name: string; kind: string; category_id: string; year: number; frequency: string; amount_cents: number; first_pay_date: string | null; sort: number; debt_id: string | null; goal_id: string | null; investment_id: string | null };
const toLine = (l: LineRow): Line => ({
  id: l.id, name: l.name, kind: l.kind as Line["kind"], categoryId: l.category_id, year: l.year, frequency: l.frequency as Frequency,
  amountCents: l.amount_cents, firstPayDate: l.first_pay_date, sort: l.sort, debtId: l.debt_id, goalId: l.goal_id, investmentId: l.investment_id,
});
const loadLines = async (s: Session, year: number) =>
  fetchAll<LineRow>((a, b) => s.supabase.from("plan_lines").select("*").eq("year", year).is("archived_at", null).order("sort").order("created_at").range(a, b));

/**
 * Cambio de año: si `year` no tiene plan y el año anterior sí, se copia UNA sola vez.
 * - semanal y quincenal: siguen su cadencia real (el primer pago del año nuevo respeta el ciclo de 7 o 14 días)
 * - mensual y anual: mismo día, año nuevo · pagos únicos ("once"): no se copian
 * - líneas editadas mes a mes ("custom"): se copian sus 12 montos como punto de partida
 * `plan_years` evita que dos pestañas lo copien dos veces.
 */
export async function ensurePlanYear(s: Session, year: number): Promise<boolean> {
  if (!s.canEdit) return false;
  const claim = await s.supabase.from("plan_years").insert({ user_id: s.userId, year, copied_from: year - 1 });
  if (claim.error) return false; // ya existe: otro proceso lo creó
  const prev = (await loadLines(s, year - 1)).map(toLine).filter((l) => l.frequency !== "once");
  if (prev.length === 0) return false;
  const prevCells = await fetchAll<{ line_id: string; month: number; amount_cents: number }>((a, b) =>
    s.supabase.from("plan_cells").select("line_id, month, amount_cents").in("line_id", prev.map((l) => l.id)).range(a, b));
  const jan1 = `${year}-01-01`;
  for (const l of prev) {
    let first = l.firstPayDate;
    if (first && (l.frequency === "weekly" || l.frequency === "fortnightly")) {
      const step = l.frequency === "weekly" ? 7 : 14, gap = diffDays(jan1, first);
      first = gap <= 0 ? first : addDays(first, Math.ceil(gap / step) * step);
    } else if (first) {
      const p = parts(first);
      first = `${year}-${String(p.m).padStart(2, "0")}-${String(Math.min(p.d, 28)).padStart(2, "0")}`;
      if (l.frequency === "monthly") first = `${year}-01-${String(Math.min(p.d, 28)).padStart(2, "0")}`;
    }
    const row = must(await s.supabase.from("plan_lines").insert({
      user_id: s.userId, year, category_id: l.categoryId, name: l.name, kind: l.kind, frequency: l.frequency, amount_cents: l.amountCents,
      first_pay_date: first, sort: l.sort, debt_id: l.debtId ?? null, goal_id: l.goalId ?? null, investment_id: l.investmentId ?? null,
    }).select("id").single());
    const cells = l.frequency === "custom"
      ? prevCells.filter((c) => c.line_id === l.id).map((c) => ({ lineId: row.id, month: c.month, amountCents: c.amount_cents, manual: false }))
      : recomputeCells({ ...l, id: row.id, year, firstPayDate: first }, []);
    if (cells.length) must(await s.supabase.from("plan_cells").insert(cells.map((c) => ({ line_id: row.id, user_id: s.userId, month: c.month, amount_cents: c.amountCents, manual: false }))).select("month"));
  }
  return true;
}

/** Plan anual completo de un año: categorías, líneas, celdas y marcas de "Pagado · a mano". Crea el año nuevo si hace falta. */
export const loadPlan = cache(async (s: Session, year: number): Promise<PlanData> => {
  const categories = await loadCategories(s);
  let lines = await loadLines(s, year);
  if (lines.length === 0 && (year === s.year || year === s.year + 1) && (await ensurePlanYear(s, year))) lines = await loadLines(s, year);
  const ids = lines.map((l) => l.id);
  const [cells, marks] = ids.length
    ? await Promise.all([
        fetchAll<{ line_id: string; month: number; amount_cents: number; manual: boolean }>((a, b) => s.supabase.from("plan_cells").select("line_id, month, amount_cents, manual").in("line_id", ids).order("line_id").order("month").range(a, b)),
        fetchAll<{ line_id: string; month: number }>((a, b) => s.supabase.from("plan_marks").select("line_id, month").in("line_id", ids).order("line_id").order("month").range(a, b)),
      ])
    : [[], []];
  return {
    year, categories, lines: lines.map(toLine),
    cells: cells.map((c) => ({ lineId: c.line_id, month: c.month, amountCents: c.amount_cents, manual: c.manual })),
    marks: new Set(marks.map((m) => `${m.line_id}:${m.month}`)),
  };
});

export type Account = AccountLite & { name: string; institution: string; isEmergencyFund: boolean; sort: number };
export const loadAccounts = cache(async (s: Session): Promise<Account[]> => {
  const data = must(await s.supabase.from("accounts").select("*").is("archived_at", null).order("sort").order("created_at"));
  return data.map((a) => ({
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
  const rows = await fetchAll<TxRow>((a, b) => s.supabase.from("transactions").select("*").is("deleted_at", null).gte("date", from).lte("date", to)
    .order("date", { ascending: false }).order("created_at", { ascending: false }).order("id").range(a, b) as unknown as PromiseLike<{ data: TxRow[] | null; error: { message: string } | null }>);
  return rows.map(toTx);
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
  const [plan, accounts, goalsRes] = await Promise.all([
    loadPlan(s, year), loadAccounts(s),
    s.supabase.from("goals").select("id, is_emergency_fund, goal_entries(amount_cents)").eq("is_emergency_fund", true).is("archived_at", null),
  ]);
  const goals = must(goalsRes);
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
