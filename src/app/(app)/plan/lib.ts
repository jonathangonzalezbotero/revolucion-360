// Cálculos propios del Plan anual y del Detalle del mes. Funciones puras (sirven en el servidor, en el cliente y en las pruebas).
import { cellMap, cellOf, iso, isoWeekday, monthAmounts, type Cents, type Frequency, type ISODate, type PlanCell, type PlanLine } from "@/lib/engine";
import type { Category } from "@/server/data";

export type LineLite = Pick<PlanLine, "id" | "name" | "kind" | "categoryId" | "year" | "frequency" | "amountCents" | "firstPayDate">;
/** Los 12 meses de una línea: montos y cuáles se editaron a mano (índice 0 = enero). */
export type CellRow = { a: Cents[]; m: boolean[] };
export type CellState = Record<string, CellRow>;
export type SavedLine = { line: LineLite; row: CellRow };

// ───────── Año y meses ─────────
export type MonthState = "past" | "current" | "future";
/** Fondo de cada columna: meses pasados, mes actual y meses por venir, según el año que se mira. */
export function monthState(viewYear: number, month: number, curYear: number, curMonth: number): MonthState {
  if (viewYear !== curYear) return viewYear < curYear ? "past" : "future";
  return month < curMonth ? "past" : month === curMonth ? "current" : "future";
}

/** `?anio=`: solo el año en curso, el anterior y el siguiente. Cualquier otra cosa cae en el año en curso. */
export function clampYear(raw: string | string[] | undefined, curYear: number): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) && Math.abs(n - curYear) <= 1 ? n : curYear;
}
export const planHref = (year: number, curYear: number) => (year === curYear ? "/plan" : `/plan?anio=${year}`);
export const monthHref = (year: number, month: number, curYear: number) => `/plan/mes/${month}${year === curYear ? "" : `?anio=${year}`}`;

/** Mes anterior (−1) o siguiente (+1), cruzando de año. null si se sale de los años que se pueden ver. */
export function adjacentMonth(year: number, month: number, delta: -1 | 1, curYear: number): { year: number; month: number } | null {
  const total = year * 12 + (month - 1) + delta;
  const y = Math.floor(total / 12), m = (total % 12) + 1;
  return Math.abs(y - curYear) <= 1 ? { year: y, month: m } : null;
}

// ───────── Celdas ─────────
export function toCellState(lines: Pick<PlanLine, "id">[], cells: PlanCell[]): CellState {
  const map = cellMap(cells);
  const manual = new Set(cells.filter((c) => c.manual).map((c) => `${c.lineId}:${c.month}`));
  const out: CellState = {};
  for (const l of lines) out[l.id] = {
    a: Array.from({ length: 12 }, (_, i) => cellOf(map, l.id, i + 1)),
    m: Array.from({ length: 12 }, (_, i) => manual.has(`${l.id}:${i + 1}`)),
  };
  return out;
}
export function toPlanCells(state: CellState): PlanCell[] {
  return Object.entries(state).flatMap(([lineId, r]) => r.a.map((amountCents, i) => ({ lineId, month: i + 1, amountCents, manual: r.m[i] })));
}
/** Cambia una celda sin tocar las demás filas (las filas que no cambian conservan su identidad). */
export function patchCell(state: CellState, lineId: string, month: number, amountCents: Cents, manual: boolean): CellState {
  const row = state[lineId];
  if (!row) return state;
  const a = row.a.slice(), m = row.m.slice();
  a[month - 1] = amountCents;
  m[month - 1] = manual;
  return { ...state, [lineId]: { a, m } };
}
/** Lo que se escribe en una celda: sin separador de miles y vacío si es 0. */
export const cellText = (cents: Cents): string => (cents === 0 ? "" : cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));
/** Texto de una celda → centavos. Vacío es 0; un negativo queda en 0 (igual que `setCell`); null si no es un monto. */
export function parseCell(text: string, parse: (t: string) => Cents | null): Cents | null {
  if (!text.trim()) return 0;
  const v = parse(text);
  return v === null ? null : Math.max(0, v);
}
/** Celdas editadas a mano de una línea desde un mes (las que se conservan al cambiar la línea). */
export const manualCount = (row: CellRow | undefined, fromMonth = 1): number => (row ? row.m.filter((x, i) => x && i + 1 >= fromMonth).length : 0);

// ───────── Rejilla agrupada por categoría ─────────
export type GridRow = { line: LineLite; amounts: Cents[]; manual: boolean[]; total: Cents };
export type GridGroup = { category: Category; rows: GridRow[]; totals: Cents[]; total: Cents };
const ZERO = (): Cents[] => Array<Cents>(12).fill(0);
const add = (xs: Cents[]): Cents => xs.reduce((a, b) => a + b, 0);

export function buildGroups(categories: Category[], lines: LineLite[], state: CellState): GridGroup[] {
  return categories.map((category) => {
    const rows = lines.filter((l) => l.categoryId === category.id).map((line): GridRow => {
      const r = state[line.id] ?? { a: ZERO(), m: Array<boolean>(12).fill(false) };
      return { line, amounts: r.a, manual: r.m, total: add(r.a) };
    });
    const totals = ZERO();
    for (const r of rows) r.amounts.forEach((v, i) => { totals[i] += v; });
    return { category, rows, totals, total: add(totals) };
  });
}
export const negativeMonths = (months: { net: Cents }[]): number => months.filter((x) => x.net < 0).length;

/** +1.2k, −86: lo que sobra o falta de un mes en un botón pequeño. */
export function compactNet(cents: Cents): string {
  const v = Math.abs(cents) / 100;
  return (cents < 0 ? "−" : "+") + (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));
}
/** "20.7%" del ingreso; null si no hay ingreso contra qué comparar. */
export const sharePct = (part: Cents, whole: Cents): string | null => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : null);

// ───────── Línea nueva ─────────
export type NewMode = "once" | "range" | "all";
export type NewFrequency = "monthly" | "fortnightly" | "weekly";
export type NewLineForm = { mode: NewMode; from: number; to: number; frequency: NewFrequency; amountCents: Cents; firstPayDate: ISODate | null };

/** ¿El mes (1–12) entra en lo que eligió el usuario? */
export function inRange(f: Pick<NewLineForm, "mode" | "from" | "to">, month: number): boolean {
  if (f.mode === "all") return true;
  if (f.mode === "once") return month === f.from;
  return month >= Math.min(f.from, f.to) && month <= Math.max(f.from, f.to);
}

/** Primer día de la semana pedido (1 = lunes … 7 = domingo) del año. Por defecto, el primer viernes. */
export function firstWeekday(year: number, weekday = 5): ISODate {
  for (let d = 1; d <= 7; d++) if (isoWeekday(iso(year, 1, d)) === weekday) return iso(year, 1, d);
  return iso(year, 1, 1);
}

/**
 * Cómo se guarda una línea nueva y cuánto queda en cada mes. La vista previa y el servidor usan ESTA función.
 * - Todo el año → la frecuencia real (semanal y quincenal cuentan los días de pago de cada mes).
 * - Un mes, mensual → pago único ("once") en ese mes.
 * - Varios meses, o un mes con pagos semanales → montos mes a mes ("custom"), para que el rango no se pierda si luego se edita la línea.
 */
export function lineShape(f: NewLineForm, year: number): { frequency: Frequency; firstPayDate: ISODate | null; months: Cents[]; custom: boolean } {
  const date = f.frequency === "monthly" ? null : f.firstPayDate;
  if (f.mode === "all") return { frequency: f.frequency, firstPayDate: date, months: monthAmounts({ frequency: f.frequency, amountCents: f.amountCents, firstPayDate: date, year }), custom: false };
  if (f.mode === "once" && f.frequency === "monthly") {
    const d = iso(year, f.from, 1);
    return { frequency: "once", firstPayDate: d, months: monthAmounts({ frequency: "once", amountCents: f.amountCents, firstPayDate: d, year }), custom: false };
  }
  const base = monthAmounts({ frequency: f.frequency, amountCents: f.amountCents, firstPayDate: date, year });
  return { frequency: "custom", firstPayDate: date, months: base.map((v, i) => (inRange(f, i + 1) ? v : 0)), custom: true };
}
