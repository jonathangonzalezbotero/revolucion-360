// Plan anual: líneas, frecuencias y totales por mes. Es el centro de la app.
import { addDays, daysInMonth, diffDays, iso, parts, type ISODate } from "./dates";
import type { Cents } from "./money";

export type Frequency = "monthly" | "fortnightly" | "weekly" | "yearly" | "once" | "custom";
export type LineKind = "income" | "expense";

export type PlanLine = {
  id: string;
  name: string;
  kind: LineKind;
  categoryId: string;
  year: number;
  frequency: Frequency;
  amountCents: Cents;          // monto por pago
  firstPayDate: ISODate | null;
  sort?: number;
  debtId?: string | null;
  goalId?: string | null;
  investmentId?: string | null;
};
export type PlanCell = { lineId: string; month: number; amountCents: Cents; manual: boolean };

/** Días de pago reales que caen en un mes (semanal = cada 7 días, quincenal = cada 14, desde el primer pago). */
export function payDatesInMonth(frequency: Frequency, firstPayDate: ISODate | null, year: number, month: number): ISODate[] {
  const start = iso(year, month, 1), end = iso(year, month, daysInMonth(year, month));
  if (frequency === "monthly") {
    if (!firstPayDate) return [start];
    if (firstPayDate > end) return [];
    return [iso(year, month, Math.min(parts(firstPayDate).d, daysInMonth(year, month)))];
  }
  if (frequency === "yearly" || frequency === "once") {
    if (!firstPayDate) return month === 1 ? [start] : [];
    const p = parts(firstPayDate);
    if (frequency === "once") return p.y === year && p.m === month ? [firstPayDate] : [];
    return p.m === month && firstPayDate <= end ? [iso(year, month, Math.min(p.d, daysInMonth(year, month)))] : [];
  }
  if (frequency === "custom") return [];
  const step = frequency === "weekly" ? 7 : 14;
  const first = firstPayDate ?? start;
  if (first > end) return [];
  // primer pago en o después del día 1 del mes
  const gap = diffDays(start, first);
  let d = gap <= 0 ? first : addDays(first, Math.ceil(gap / step) * step);
  const out: ISODate[] = [];
  while (d <= end) {
    out.push(d);
    d = addDays(d, step);
  }
  return out;
}

/** Monto de cada uno de los 12 meses según la frecuencia de la línea. */
export function monthAmounts(line: Pick<PlanLine, "frequency" | "amountCents" | "firstPayDate" | "year">): Cents[] {
  return Array.from({ length: 12 }, (_, i) =>
    payDatesInMonth(line.frequency, line.firstPayDate, line.year, i + 1).length * line.amountCents);
}

/**
 * Regla cerrada: la celda editada a mano GANA. Al cambiar frecuencia o monto de la línea,
 * solo se recalculan las celdas no manuales; `overwriteManual` las pisa todas (con aviso en pantalla).
 */
export function recomputeCells(line: PlanLine, existing: PlanCell[], overwriteManual = false): PlanCell[] {
  const auto = monthAmounts(line);
  const byMonth = new Map(existing.map((c) => [c.month, c]));
  return auto.map((amountCents, i) => {
    const prev = byMonth.get(i + 1);
    if (line.frequency === "custom" && prev) return prev;
    if (prev?.manual && !overwriteManual) return prev;
    return { lineId: line.id, month: i + 1, amountCents, manual: false };
  });
}

export type MonthTotals = { income: Cents; expense: Cents; net: Cents };

export function cellMap(cells: PlanCell[]): Map<string, Cents> {
  const m = new Map<string, Cents>();
  for (const c of cells) m.set(`${c.lineId}:${c.month}`, c.amountCents);
  return m;
}
export const cellOf = (map: Map<string, Cents>, lineId: string, month: number): Cents => map.get(`${lineId}:${month}`) ?? 0;

/** Entra, sale y te sobra de cada mes (índice 0 = enero). */
export function yearTotals(lines: PlanLine[], cells: PlanCell[]): MonthTotals[] {
  const map = cellMap(cells);
  return Array.from({ length: 12 }, (_, i) => {
    let income = 0, expense = 0;
    for (const l of lines) {
      const v = cellOf(map, l.id, i + 1);
      if (l.kind === "income") income += v; else expense += v;
    }
    return { income, expense, net: income - expense };
  });
}

export function annualTotals(lines: PlanLine[], cells: PlanCell[]): MonthTotals {
  return yearTotals(lines, cells).reduce((a, m) => ({ income: a.income + m.income, expense: a.expense + m.expense, net: a.net + m.net }), { income: 0, expense: 0, net: 0 });
}

/** Total del mes por categoría (para el detalle del mes, diagnóstico y análisis). */
export function categoryTotals(lines: PlanLine[], cells: PlanCell[], month: number): Map<string, Cents> {
  const map = cellMap(cells);
  const out = new Map<string, Cents>();
  for (const l of lines) out.set(l.categoryId, (out.get(l.categoryId) ?? 0) + cellOf(map, l.id, month));
  return out;
}

// ───────── Estado de una línea en un mes ─────────
export type LineStatus = "pending" | "paid" | "paid_manual" | "partial" | "over" | "none";
export type LineMonth = { status: LineStatus; plannedCents: Cents; realCents: Cents; missingCents: Cents };

/**
 * - Sin plan en el mes y sin movimientos → none
 * - Con movimientos unidos: paid si cubre ≥ 99.5% del plan; partial si es menos; over si pasa del plan en más de 0.5%
 * - Sin movimientos y marcada a mano → paid_manual (cuenta el monto del plan)
 * - Un movimiento unido reemplaza la marca a mano: nunca se cuenta dos veces.
 */
export function lineMonthStatus(plannedCents: Cents, linkedTxCents: Cents[], markedManual: boolean): LineMonth {
  const real = Math.abs(linkedTxCents.reduce((a, b) => a + b, 0));
  if (linkedTxCents.length > 0) {
    const tol = Math.max(100, Math.round(plannedCents * 0.005));
    const status: LineStatus = real > plannedCents + tol ? "over" : real >= plannedCents - tol ? "paid" : "partial";
    return { status, plannedCents, realCents: real, missingCents: Math.max(0, plannedCents - real) };
  }
  if (markedManual) return { status: "paid_manual", plannedCents, realCents: plannedCents, missingCents: 0 };
  if (plannedCents === 0) return { status: "none", plannedCents, realCents: 0, missingCents: 0 };
  return { status: "pending", plannedCents, realCents: 0, missingCents: plannedCents };
}
