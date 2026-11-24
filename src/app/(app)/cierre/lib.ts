// Cálculos propios del Cierre de mes (puros: sin base de datos). Los del motor se prueban en engine.test.ts.
import { daysInMonth, iso, type Cents, type ISODate } from "@/lib/engine";

export type Period = { year: number; month: number };
export const ymRef = (p: Period) => `${p.year}-${String(p.month).padStart(2, "0")}`;
export const nextPeriod = (p: Period): Period => (p.month === 12 ? { year: p.year + 1, month: 1 } : { year: p.year, month: p.month + 1 });
export const prevPeriod = (p: Period): Period => (p.month === 1 ? { year: p.year - 1, month: 12 } : { year: p.year, month: p.month - 1 });
const idx = (p: Period) => p.year * 12 + (p.month - 1);

/** Mes que se pide por la URL: entero, 1–12, nunca en el futuro, ni antes de que existiera la cuenta (`min`), y a lo sumo 2 años atrás. Si no sirve, null. */
export function parsePeriod(anio: unknown, mes: unknown, today: Period, min?: Period): Period | null {
  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
  const y = Number(one(anio)), m = Number(one(mes));
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return null;
  const p = { year: y, month: m };
  if (idx(p) > idx(today) || idx(today) - idx(p) > 24 || (min && idx(p) < idx(min))) return null;
  return p;
}

/** Tarjeta: el usuario escribe lo que debe en positivo; se guarda en negativo. */
export const cardSigned = (kind: string, cents: Cents): Cents => (kind === "card" && cents > 0 ? -cents : cents);
/** Al revés, para mostrarlo en el campo: lo que debes, en positivo. */
export const cardShown = (kind: string, cents: Cents): Cents => (kind === "card" ? Math.abs(cents) : cents);

/** Aviso del saldo escrito frente al esperado (menos de $1 no se avisa). */
export function balanceGap(statedCents: Cents, expectedCents: Cents): { state: "ok" | "missing" | "extra"; cents: Cents } {
  const d = statedCents - expectedCents;
  if (Math.abs(d) < 100) return { state: "ok", cents: 0 };
  return d < 0 ? { state: "missing", cents: -d } : { state: "extra", cents: d };
}

/** Monto para un campo de texto: 158300 → "1583", 12350 → "123.50". */
export const moneyInput = (cents: Cents): string => {
  const a = Math.abs(cents), whole = Math.floor(a / 100), frac = a % 100;
  return `${cents < 0 ? "-" : ""}${whole}${frac ? `.${String(frac).padStart(2, "0")}` : ""}`;
};

// ───────── Revisa ─────────
export type PendingOpt = "paid" | "move" | "skip";
/** Qué se puede hacer con una línea pendiente o parcial. "Ya la pagué" solo sin movimientos (un movimiento unido reemplaza la marca). */
export function pendingOptions(status: string, canMove: boolean): PendingOpt[] {
  const out: PendingOpt[] = [];
  if (status === "pending") out.push("paid");
  if (canMove) out.push("move");
  out.push("skip");
  return out;
}
/** Celdas que escribe cada opción: el mes queda con lo que de verdad se pagó y, si se mueve, el faltante pasa al mes siguiente. */
export function pendingWrites(opt: Exclude<PendingOpt, "paid">, realCents: Cents, missingCents: Cents, nextCurrentCents: Cents): { thisMonth: Cents; nextMonth: Cents | null } {
  return { thisMonth: Math.max(0, realCents), nextMonth: opt === "move" ? Math.max(0, nextCurrentCents) + Math.max(0, missingCents) : null };
}

// ───────── Compara ─────────
export type CatKind = "income" | "expense" | "debt" | "saving" | "goal";
export type CatInput = { id: string; name: string; kind: CatKind; plannedCents: Cents; linesRealCents: Cents };
export type UnplannedInput = { categoryId: string | null; amountCents: Cents };
export type CatResult = { id: string; name: string; kind: CatKind; plannedCents: Cents; realCents: Cents };

/**
 * Lo real de cada categoría:
 * - si escribió el total del mes (nivel "totales"), manda ese total;
 * - si no, lo pagado en sus líneas + los movimientos sin línea de esa categoría (un reembolso resta).
 */
export function categoryReal(cats: CatInput[], unplanned: UnplannedInput[], totals: Map<string, Cents>): CatResult[] {
  return cats.map((c) => {
    const typed = totals.get(c.id);
    if (typed !== undefined) return { id: c.id, name: c.name, kind: c.kind, plannedCents: c.plannedCents, realCents: Math.abs(typed) };
    const extra = unplanned.filter((u) => u.categoryId === c.id).reduce((a, u) => a + (c.kind === "income" ? u.amountCents : -u.amountCents), 0);
    return { id: c.id, name: c.name, kind: c.kind, plannedCents: c.plannedCents, realCents: c.linesRealCents + extra };
  });
}

export type Totals = { income: Cents; expense: Cents; net: Cents };
/** Totales reales: categorías + movimientos sin categoría (entra si es positivo, sale si es negativo). */
export function realTotals(cats: CatResult[], unplanned: UnplannedInput[], known: Set<string>): Totals {
  let income = 0, expense = 0;
  for (const c of cats) if (c.kind === "income") income += c.realCents; else expense += c.realCents;
  for (const u of unplanned) if (!u.categoryId || !known.has(u.categoryId)) { if (u.amountCents > 0) income += u.amountCents; else expense += -u.amountCents; }
  return { income, expense, net: income - expense };
}

export type Deviation = { id: string; name: string; diffCents: Cents };
/** Dónde más se desvió: solo lo que sale, ordenado por el tamaño del desvío. Positivo = sobre el plan. Menos de $1 no cuenta. */
export function deviations(cats: CatResult[], limit = 3): Deviation[] {
  return cats.filter((c) => c.kind !== "income")
    .map((c) => ({ id: c.id, name: c.name, diffCents: c.realCents - c.plannedCents }))
    .filter((d) => Math.abs(d.diffCents) >= 100)
    .sort((a, b) => Math.abs(b.diffCents) - Math.abs(a.diffCents) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// ───────── Ajusta el mes siguiente ─────────
/** Lo que entra menos lo que sale con los montos escritos (un campo vacío o inválido cuenta como su valor anterior). */
export function adjustedNet(incomeCents: Cents, lines: { cents: Cents; typed: Cents | null }[]): { out: Cents; net: Cents } {
  const out = lines.reduce((a, l) => a + Math.max(0, l.typed ?? l.cents), 0);
  return { out, net: incomeCents - out };
}
/** Solo las líneas que cambiaron: escribir una celda la marca como editada a mano. */
export function changedCells(lines: { lineId: string; cents: Cents; typed: Cents | null }[]): { lineId: string; cents: Cents }[] {
  return lines.filter((l) => l.typed !== null && Math.max(0, l.typed) !== l.cents).map((l) => ({ lineId: l.lineId, cents: Math.max(0, l.typed as Cents) }));
}

// ───────── Cerrar ─────────
export type Snapshot = {
  v: 1; closedOn: ISODate;
  plan: Totals; real: Totals;
  categories: { id: string; name: string; plannedCents: Cents; realCents: Cents }[];
  balances: { id: string; name: string; kind: string; cents: Cents }[];
  investments: { id: string; name: string; cents: Cents }[];
};
export function buildSnapshot(input: { today: ISODate; plan: Totals; cats: CatResult[]; unplanned: UnplannedInput[]; accounts: { id: string; name: string; kind: string; balanceCents: Cents }[]; investments?: { id: string; name: string; valueCents: Cents }[] }): Snapshot {
  const known = new Set(input.cats.map((c) => c.id));
  return {
    v: 1, closedOn: input.today,
    plan: { income: input.plan.income, expense: input.plan.expense, net: input.plan.income - input.plan.expense },
    real: realTotals(input.cats, input.unplanned, known),
    categories: input.cats.filter((c) => c.plannedCents !== 0 || c.realCents !== 0).map((c) => ({ id: c.id, name: c.name, plannedCents: c.plannedCents, realCents: c.realCents })),
    balances: input.accounts.map((a) => ({ id: a.id, name: a.name, kind: a.kind, cents: a.balanceCents })),
    investments: (input.investments ?? []).map((i) => ({ id: i.id, name: i.name, cents: i.valueCents })),
  };
}

/** Lee un snapshot guardado sin confiar en su forma (puede venir `{}` o de una versión anterior). */
export function readSnapshot(raw: unknown): Snapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0);
  const tot = (v: unknown): Totals | null => {
    if (!v || typeof v !== "object") return null;
    const t = v as Record<string, unknown>;
    const income = num(t.income), expense = num(t.expense);
    return { income, expense, net: income - expense };
  };
  const plan = tot(r.plan), real = tot(r.real);
  if (!plan || !real) return null;
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : []);
  return {
    v: 1, closedOn: typeof r.closedOn === "string" ? r.closedOn : "", plan, real,
    categories: arr(r.categories).map((c) => ({ id: String(c.id ?? ""), name: String(c.name ?? ""), plannedCents: num(c.plannedCents), realCents: num(c.realCents) })),
    balances: arr(r.balances).map((b) => ({ id: String(b.id ?? ""), name: String(b.name ?? ""), kind: String(b.kind ?? ""), cents: num(b.cents) })),
    investments: arr(r.investments).map((i) => ({ id: String(i.id ?? ""), name: String(i.name ?? ""), cents: num(i.cents) })),
  };
}

/** Cierres seguidos que terminan en `p` (los reabiertos no cuentan; cruza el cambio de año). */
export function closureStreak(rows: { year: number; month: number; reopened: boolean }[], p: Period): number {
  const closed = new Set(rows.filter((r) => !r.reopened).map((r) => idx(r)));
  let n = 0;
  for (let i = idx(p); closed.has(i); i--) n++;
  return n;
}

/** Día en que se recuerda el cierre del mes siguiente: cuando empiezan sus últimos 10 días. Si ese día ya pasó, null (no se promete un recordatorio pasado). */
export function reminderDate(closed: Period, today: ISODate): ISODate | null {
  const n = nextPeriod(closed);
  const d = iso(n.year, n.month, daysInMonth(n.year, n.month) - 9);
  return d > today ? d : null;
}
/** Mes en que se creó la cuenta (no se cierran meses anteriores). */
export const periodOfDate = (d: string): Period => ({ year: Number(d.slice(0, 4)), month: Number(d.slice(5, 7)) });
