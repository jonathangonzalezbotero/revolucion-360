// Cálculos propios de Deudas e impuestos (puros, con pruebas en tests/deudas-inversiones.test.ts).
import { addDays, addMonths, debtPayoff, parts, taxToSetAside, toMonthly, type Cents, type ISODate, type Payoff } from "@/lib/engine";

export const DEBT_KINDS = ["loan", "card", "bnpl", "personal", "other"] as const;
export type DebtKind = (typeof DEBT_KINDS)[number];
export type PayFreq = "weekly" | "fortnightly" | "monthly";
export const PAY_FREQS: PayFreq[] = ["monthly", "fortnightly", "weekly"];
export type PayMode = "cuota" | "abono" | "total";

// ───────── Calendario de compra ahora, paga después ─────────
export type SchedItem = { date: ISODate; amountCents: Cents; paid: boolean };

/** `debts.schedule` es JSON: se lee con cuidado (acepta amount_cents o amountCents) y se ignora lo que no cuadre. */
export function parseSchedule(json: unknown): SchedItem[] | null {
  if (!Array.isArray(json)) return null;
  const out: SchedItem[] = [];
  for (const raw of json) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const amount = Number(r.amount_cents ?? r.amountCents);
    if (typeof r.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !Number.isFinite(amount)) continue;
    out.push({ date: r.date, amountCents: Math.round(amount), paid: r.paid === true });
  }
  return out.length ? out : null;
}
/** Forma que se guarda en la base (la del comentario de la migración). */
export const scheduleJson = (items: SchedItem[]) => items.map((i) => ({ date: i.date, amount_cents: i.amountCents, paid: i.paid }));

/** Marca pagados, en orden, los pagos del calendario que cubre lo pagado hasta hoy (saldo inicial − saldo). */
export function scheduleAfter(items: SchedItem[], paidSoFarCents: Cents): SchedItem[] {
  let acc = 0;
  return items.map((i) => {
    acc += i.amountCents;
    return { ...i, paid: acc <= paidSoFarCents };
  });
}
export const nextUnpaid = (items: SchedItem[] | null): SchedItem | null => items?.find((i) => !i.paid) ?? null;

/** Monto de cada mes del año para la línea del plan de un calendario (frecuencia "custom"). */
export function scheduleMonths(items: SchedItem[], year: number): Cents[] {
  const out = Array.from({ length: 12 }, () => 0);
  for (const i of items) {
    const p = parts(i.date);
    if (p.y === year) out[p.m - 1] += i.amountCents;
  }
  return out;
}

// ───────── Una deuda ─────────
export type DebtLite = {
  id: string; kind: DebtKind; balanceCents: Cents; startBalanceCents: Cents; rateBps: number;
  paymentCents: Cents; paymentFrequency: PayFreq; schedule: SchedItem[] | null; closed: boolean;
};
export type DebtState = "closed" | "noBalance" | "active";

/** Las deudas que creó el asistente nacen sin saldo: no se puede calcular cuándo terminan hasta que se escriba. */
export const debtState = (d: Pick<DebtLite, "closed" | "balanceCents">): DebtState => (d.closed ? "closed" : d.balanceCents <= 0 ? "noBalance" : "active");

/** Cuota llevada a mensual. Una tarjeta sin cuota fija da 0 ("Variable"). */
export const monthlyPayment = (d: Pick<DebtLite, "paymentCents" | "paymentFrequency">): Cents => toMonthly(d.paymentCents, d.paymentFrequency);

/** Cuándo terminas y cuánto interés pagas. Con calendario: el último pago pendiente y sin interés. null si falta el saldo. */
export function payoffOf(d: DebtLite, today: ISODate, extraMonthlyCents = 0): Payoff | null {
  const st = debtState(d);
  if (st === "closed") return { months: 0, endDate: today, interestCents: 0, neverEnds: false };
  if (st === "noBalance") return null;
  const pending = d.schedule?.filter((i) => !i.paid) ?? [];
  if (pending.length && extraMonthlyCents <= 0) {
    const end = pending[pending.length - 1].date;
    const p = parts(end), t = parts(today);
    return { months: Math.max(0, (p.y - t.y) * 12 + (p.m - t.m)), endDate: end < today ? today : end, interestCents: 0, neverEnds: false };
  }
  return debtPayoff(d.balanceCents, d.rateBps, monthlyPayment(d) + Math.max(0, extraMonthlyCents), today);
}

/** Avance desde el saldo con el que empezó (0 a 1). */
export const progressOf = (d: Pick<DebtLite, "balanceCents" | "startBalanceCents" | "closed">): number =>
  d.closed ? 1 : d.startBalanceCents > 0 ? Math.min(1, Math.max(0, 1 - d.balanceCents / d.startBalanceCents)) : 0;

/** Simulador "si pagas $X más al mes": cuándo terminas, cuántos meses antes y cuánto interés te ahorras. */
export function simulate(d: DebtLite, extraMonthlyCents: Cents, today: ISODate) {
  const base = payoffOf(d, today), sim = payoffOf(d, today, extraMonthlyCents);
  if (!base || !sim) return null;
  const monthsSaved = base.months !== null && sim.months !== null ? Math.max(0, base.months - sim.months) : null;
  const interestSaved = !base.neverEnds && !sim.neverEnds ? Math.max(0, base.interestCents - sim.interestCents) : null;
  return { base, sim, monthsSaved, interestSaved };
}

// ───────── Resumen tipo libro contable ─────────
export type DebtSummary = { totalCents: Cents; monthlyCents: Cents; freeDate: ISODate | null; neverEnds: boolean; missing: number; open: number };

/** Total que debes, cuotas del mes y fecha en que terminas la última. `neverEnds` si alguna no se acaba con su cuota. */
export function debtSummary(debts: DebtLite[], today: ISODate): DebtSummary {
  const open = debts.filter((d) => !d.closed);
  let freeDate: ISODate | null = null, neverEnds = false, missing = 0;
  for (const d of open) {
    if (d.kind === "card" && d.paymentCents <= 0 && d.balanceCents > 0) continue; // tarjeta de saldo variable: sin fecha que calcular
    const p = payoffOf(d, today);
    if (!p) { missing++; continue; }
    if (p.neverEnds) neverEnds = true;
    else if (p.endDate && (!freeDate || p.endDate > freeDate)) freeDate = p.endDate;
  }
  return {
    totalCents: open.reduce((a, d) => a + Math.max(0, d.balanceCents), 0),
    monthlyCents: open.reduce((a, d) => a + monthlyPayment(d), 0),
    freeDate, neverEnds, missing, open: open.length,
  };
}

// ───────── Registrar un pago ─────────
/** Monto que se registra: nunca más que el saldo; "total" es el saldo completo. null si no hay monto válido. */
export function paymentAmount(mode: PayMode, typedCents: Cents | null, balanceCents: Cents): Cents | null {
  if (balanceCents <= 0) return null;
  if (mode === "total") return balanceCents;
  if (typedCents === null || typedCents <= 0) return null;
  return Math.min(typedCents, balanceCents);
}
export const balanceAfter = (balanceCents: Cents, amountCents: Cents) => {
  const next = Math.max(0, balanceCents - amountCents);
  return { balanceCents: next, closed: next === 0 };
};

/** Saldo inicial al escribir o editar el saldo: si no había, o si el nuevo es mayor, el nuevo pasa a ser el inicial. */
export const startBalanceFor = (currentStart: Cents, newBalance: Cents): Cents => (currentStart <= 0 || newBalance > currentStart ? newBalance : currentStart);

// ───────── Meses del plan que dura la cuota ─────────
/**
 * Meses del año en que va la cuota: desde el mes del primer pago (o el actual) hasta el último pago.
 * El último sale del número de cuotas; si no lo hay, de cuándo terminas (debtPayoff); si tampoco, hasta diciembre.
 * null si la deuda no tiene pagos este año.
 */
export function planMonths(o: { year: number; start: ISODate; count: number | null; payoffMonths: number | null; freq: PayFreq }): { fromMonth: number; toMonth: number } | null {
  const s = parts(o.start);
  if (s.y > o.year) return null;
  const fromMonth = s.y < o.year ? 1 : s.m;
  let end: ISODate | null = null;
  if (o.count && o.count > 0) end = o.freq === "monthly" ? addMonths(o.start, o.count - 1) : addDays(o.start, (o.count - 1) * (o.freq === "weekly" ? 7 : 14));
  else if (o.payoffMonths && o.payoffMonths > 0) end = addMonths(o.start, o.payoffMonths - 1);
  if (!end) return { fromMonth, toMonth: 12 };
  const e = parts(end);
  if (e.y < o.year) return null;
  return { fromMonth, toMonth: e.y > o.year ? 12 : Math.max(fromMonth, e.m) };
}

// ───────── Impuestos (ABN) ─────────
export type TaxEntry = { date: ISODate; kind: "ingreso" | "apartado" | "pago"; amountCents: Cents };
export type TaxStatus = { monthIncomeCents: Cents; monthToSetAsideCents: Cents; yearIncomeCents: Cents; shouldCents: Cents; setAsideCents: Cents; paidCents: Cents; haveCents: Cents; missingCents: Cents };

/**
 * Con el % que dio el contador: cuánto apartar este mes y en el año, frente a lo apartado.
 * - deberías tener = % de lo cobrado en el año − lo ya pagado a la oficina de impuestos
 * - tienes = apartados − pagos del año (los pagos salen de lo apartado)
 * - falta = deberías − tienes (nunca negativo)
 */
export function taxStatus(entries: TaxEntry[], percentBps: number, year: number, month: number): TaxStatus {
  const inYear = entries.filter((e) => parts(e.date).y === year);
  const sumOf = (k: TaxEntry["kind"], xs = inYear) => xs.filter((e) => e.kind === k).reduce((a, e) => a + e.amountCents, 0);
  const monthIncomeCents = sumOf("ingreso", inYear.filter((e) => parts(e.date).m === month));
  const yearIncomeCents = sumOf("ingreso"), setAsideCents = sumOf("apartado"), paidCents = sumOf("pago");
  const shouldCents = Math.max(0, taxToSetAside(yearIncomeCents, percentBps) - paidCents);
  const haveCents = setAsideCents - paidCents;
  return { monthIncomeCents, monthToSetAsideCents: taxToSetAside(monthIncomeCents, percentBps), yearIncomeCents, shouldCents, setAsideCents, paidCents, haveCents, missingCents: Math.max(0, shouldCents - haveCents) };
}

/** "25" | "25,5" | "12.75 %" → puntos básicos (2500). null si no es un % entre 0 y 100. */
export function parsePercent(input: string): number | null {
  const t = input.trim().replace("%", "").replace(",", ".").trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const bps = Math.round(Number(t) * 100);
  return bps >= 0 && bps <= 10_000 ? bps : null;
}
export const percentText = (bps: number) => String(+(bps / 100).toFixed(2));

// ───────── Cuenta con la empresa ─────────
export const COMPANY_CLASSES = ["sueldo", "dividendo", "devolucion", "prestamo"] as const;
export type CompanyClass = (typeof COMPANY_CLASSES)[number] | "sin_clasificar";
export type CompanyEntry = { date: ISODate; kind: "aporte" | "retiro"; class: CompanyClass; amountCents: Cents };

/** Aportes y retiros del año, neto (retiros − aportes), retiros por tipo en el año y sin clasificar (de siempre). */
export function companySummary(entries: CompanyEntry[], year: number) {
  const inYear = entries.filter((e) => parts(e.date).y === year);
  const inCents = inYear.filter((e) => e.kind === "aporte").reduce((a, e) => a + e.amountCents, 0);
  const outCents = inYear.filter((e) => e.kind === "retiro").reduce((a, e) => a + e.amountCents, 0);
  const byClass = Object.fromEntries(COMPANY_CLASSES.map((c) => [c, inYear.filter((e) => e.kind === "retiro" && e.class === c).reduce((a, e) => a + e.amountCents, 0)])) as Record<(typeof COMPANY_CLASSES)[number], Cents>;
  const unclassifiedCents = entries.filter((e) => e.kind === "retiro" && e.class === "sin_clasificar").reduce((a, e) => a + e.amountCents, 0);
  return { inCents, outCents, netCents: outCents - inCents, byClass, unclassifiedCents };
}

// ───────── Apartado para impuestos según el país ─────────
/**
 * Qué hace el país con el apartado de impuestos de independientes (`countries.tax_reserve_*`).
 * Sin fila del país: se muestra, sin aviso propio (comportamiento de siempre). Apagado: no se muestra,
 * pero los datos del usuario (tax_settings, tax_entries) quedan intactos.
 */
export function taxReserveOf(row: { tax_reserve_enabled?: boolean | null; tax_reserve_note?: string | null } | null | undefined): { show: boolean; note: string } {
  if (!row) return { show: true, note: "" };
  return { show: row.tax_reserve_enabled !== false, note: typeof row.tax_reserve_note === "string" ? row.tax_reserve_note.trim() : "" };
}
