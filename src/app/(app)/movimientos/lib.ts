// Cálculos puros de Movimientos (sin base de datos): recurrentes, filtros, totales del filtro y división.
import { addDays, daysInMonth, iso, normalize, parts, splitIsValid, type Cents, type ISODate } from "@/lib/engine";

export type RecFrequency = "weekly" | "fortnightly" | "monthly";

/** Día ancla de un recurrente mensual: el día del mes en que se creó (1–31). Semanal y quincenal no lo usan. */
export const anchorDayOf = (date: ISODate, frequency: RecFrequency): number | null => (frequency === "monthly" ? parts(date).d : null);

/**
 * Siguiente fecha de un recurrente. Mensual: el día ancla del mes siguiente, o el último día si el mes es más corto,
 * sin perder el ancla (31 ene → 28 feb → 31 mar). Sin ancla se usa el día de la fecha actual.
 */
export function nextRecurringDate(date: ISODate, frequency: RecFrequency, anchorDay?: number | null): ISODate {
  if (frequency === "weekly") return addDays(date, 7);
  if (frequency === "fortnightly") return addDays(date, 14);
  const p = parts(date);
  const y = p.m === 12 ? p.y + 1 : p.y, m = p.m === 12 ? 1 : p.m + 1;
  return iso(y, m, Math.min(anchorDay ?? p.d, daysInMonth(y, m)));
}

/**
 * Fechas vencidas de un recurrente (todas las que ya llegaron hasta hoy) y la próxima fecha que queda guardada.
 * `max` evita un ciclo eterno si alguien dejó un recurrente años sin abrir la app.
 */
export function dueDates(nextDate: ISODate, frequency: RecFrequency, today: ISODate, max = 120, anchorDay?: number | null): { due: ISODate[]; next: ISODate } {
  const due: ISODate[] = [];
  let d = nextDate;
  while (d <= today && due.length < max) {
    due.push(d);
    d = nextRecurringDate(d, frequency, anchorDay);
  }
  return { due, next: d };
}

// ───────── Filas de la lista ─────────
export type Part = { id: string; categoryId: string | null; lineId: string | null; amountCents: Cents };
export type MovRow = {
  id: string; date: ISODate; amountCents: Cents; description: string; raw: string; note: string;
  categoryId: string | null; accountId: string | null; lineId: string | null;
  kind: "normal" | "transfer"; status: "ok" | "review"; source: "manual" | "csv" | "recurring"; edited: boolean;
  /** El recurrente que lo generó o que nació de él (para no ofrecer "Se repite" dos veces). */
  recurringId: string | null;
  /** Si el movimiento está dividido: sus partes (la primera hereda categoría y línea del original). */
  parts: Part[];
};

type TxLike = {
  id: string; date: ISODate; amountCents: Cents; description: string; rawDescription: string; note: string;
  categoryId: string | null; accountId: string | null; planLineId: string | null;
  kind: "normal" | "transfer"; status: "ok" | "review"; source: "manual" | "csv" | "recurring"; edited: boolean;
  parentId: string | null; isSplit: boolean; recurringId: string | null; createdAt: string;
};

/**
 * Arma la lista: cada movimiento una fila; las partes de uno dividido van dentro de su fila (no sueltas),
 * en el orden en que se crearon (`createdAt`): la primera es la que hereda categoría y línea del original.
 */
export function buildRows(txs: TxLike[]): MovRow[] {
  const kids = new Map<string, Part[]>();
  const byCreation = txs.filter((t) => t.parentId).sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1));
  for (const t of byCreation) kids.set(t.parentId!, [...(kids.get(t.parentId!) ?? []), { id: t.id, categoryId: t.categoryId, lineId: t.planLineId, amountCents: t.amountCents }]);
  return txs.filter((t) => !t.parentId).map((t) => {
    const parts = t.isSplit ? kids.get(t.id) ?? [] : [];
    return {
      id: t.id, date: t.date, amountCents: t.amountCents, description: t.description, raw: t.rawDescription, note: t.note,
      categoryId: parts[0]?.categoryId ?? t.categoryId, accountId: t.accountId, lineId: parts[0]?.lineId ?? t.planLineId,
      kind: t.kind, status: t.status, source: t.source, edited: t.edited, recurringId: t.recurringId, parts,
    };
  });
}

export type StateFilter = "" | "revisar" | "plan" | "transfer" | "manual";
export const STATES: StateFilter[] = ["", "revisar", "plan", "transfer", "manual"];
export type Filter = { cat: string; account: string; state: StateFilter; q: string; line: string };
export const NO_FILTER: Filter = { cat: "", account: "", state: "", q: "", line: "" };

const hasLine = (r: MovRow, line?: string) => (line ? r.lineId === line || r.parts.some((p) => p.lineId === line) : !!r.lineId || r.parts.some((p) => !!p.lineId));
const hasCat = (r: MovRow, cat: string) => (r.parts.length ? r.parts.some((p) => p.categoryId === cat) : r.categoryId === cat);

export function matchRow(r: MovRow, f: Filter): boolean {
  if (f.cat && !hasCat(r, f.cat)) return false;
  if (f.account && r.accountId !== f.account) return false;
  if (f.line && !hasLine(r, f.line)) return false;
  if (f.state === "revisar" && r.status !== "review") return false;
  if (f.state === "plan" && !hasLine(r)) return false;
  if (f.state === "transfer" && r.kind !== "transfer") return false;
  if (f.state === "manual" && r.source !== "manual") return false;
  if (f.q.trim()) {
    const q = normalize(f.q);
    if (q && !normalize(`${r.description} ${r.raw} ${r.note}`).includes(q)) return false;
  }
  return true;
}

export type FilterTotals = { count: number; inCents: Cents; outCents: Cents };

/**
 * Totales del filtro: entra y sale. Las transferencias no cuentan; de un movimiento dividido cuentan sus partes
 * (solo las de la categoría o línea filtrada, si hay filtro), nunca el original.
 */
export function filterTotals(rows: MovRow[], f: Filter = NO_FILTER): FilterTotals {
  let inCents = 0, outCents = 0, count = 0;
  for (const r of rows) {
    if (!matchRow(r, f)) continue;
    count++;
    if (r.kind !== "normal") continue;
    const amounts = r.parts.length
      ? r.parts.filter((p) => (!f.cat || p.categoryId === f.cat) && (!f.line || p.lineId === f.line)).map((p) => p.amountCents)
      : [r.amountCents];
    for (const a of amounts) if (a > 0) inCents += a; else outCents += -a;
  }
  return { count, inCents, outCents };
}

/** Entra positivo, sale negativo. */
export const signed = (absCents: Cents, direction: "in" | "out"): Cents => (direction === "in" ? Math.abs(absCents) : -Math.abs(absCents));

/**
 * Divide un movimiento en dos: la segunda parte lleva el monto escrito y la primera el resto.
 * Devuelve null si las partes no suman el total, si alguna queda en cero o si cambia de sentido.
 */
export function splitInTwo(totalCents: Cents, secondAbsCents: Cents): [Cents, Cents] | null {
  if (totalCents === 0) return null;
  const second = Math.sign(totalCents) * Math.abs(secondAbsCents);
  const parts: [Cents, Cents] = [totalCents - second, second];
  return splitIsValid(totalCents, parts) ? parts : null;
}

/** Patrón de una regla: la descripción del banco sin tildes, signos ni mayúsculas. Muy corto no sirve de regla. */
export function rulePattern(description: string): string | null {
  const p = normalize(description);
  return p.length >= 3 ? p.slice(0, 80) : null;
}

/** Texto para un campo de monto: 133050 → "1330.50", 40000 → "400". */
export function moneyInput(cents: Cents): string {
  const abs = Math.abs(cents);
  return abs % 100 === 0 ? String(abs / 100) : (abs / 100).toFixed(2);
}

export type Query = { mes?: string; anio?: string; cat?: string; cuenta?: string; ver?: string; linea?: string; estado?: string };
/** Enlace a /movimientos con sus filtros (sin parámetros vacíos). Un `?nivel=` viejo ya no se usa: se ignora. */
export function movHref(q: Query): string {
  const sp = new URLSearchParams();
  for (const k of ["anio", "mes", "ver", "linea", "cat", "cuenta", "estado"] as const) if (q[k]) sp.set(k, q[k]!);
  const s = sp.toString();
  return s ? `/movimientos?${s}` : "/movimientos";
}

/**
 * Filtros plegados ("Más filtros"): cuenta, estado y año. Cuántos están puestos, para mostrarlo en el botón
 * y abrir el pliegue solo si llegaste con uno puesto (por ejemplo "Por revisar" desde Inicio).
 */
export function foldedActive(f: Pick<Filter, "account" | "state">, otherYear: boolean): number {
  return (f.account ? 1 : 0) + (f.state ? 1 : 0) + (otherYear ? 1 : 0);
}

/**
 * Meta de un movimiento que genera un recurrente: aporte ("in") a la meta del recurrente, solo si sigue activa
 * (ni archivada ni cumplida; igual que "Aporte a…" en Movimientos). Si no, el movimiento queda sin meta.
 */
export function recurringGoal(goalId: string | null | undefined, goals: { id: string; active: boolean }[]): { goal_id: string; goal_role: "in" } | null {
  if (!goalId) return null;
  return goals.some((g) => g.id === goalId && g.active) ? { goal_id: goalId, goal_role: "in" } : null;
}
