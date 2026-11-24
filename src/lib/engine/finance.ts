// Cuentas, metas, deudas, impuestos e inversiones.
import { addDays, addMonths, monthsUntil, type ISODate } from "./dates";
import type { Cents } from "./money";

// ───────── Cuentas y conciliación ─────────
export type AccountKind = "bank" | "savings" | "card" | "cash" | "business";
export type AccountLite = { id: string; kind: AccountKind; balanceCents: Cents; balanceDate: ISODate; inNetworth: boolean; inForecast: boolean };
export type TxLite = { accountId: string | null; date: ISODate; amountCents: Cents };

/** Saldo esperado = último saldo escrito + movimientos posteriores a esa fecha. */
export function expectedBalance(account: AccountLite, txs: TxLite[]): Cents {
  return account.balanceCents + txs.filter((t) => t.accountId === account.id && t.date > account.balanceDate).reduce((a, t) => a + t.amountCents, 0);
}
/** Diferencia entre lo que el usuario dice tener hoy y lo que dan los movimientos: "te faltan $X por registrar". */
export const unregistered = (statedCents: Cents, expectedCents: Cents): Cents => statedCents - expectedCents;

/** Patrimonio: cuentas marcadas (la de empresa queda fuera por defecto; tarjetas en negativo). */
export const netWorth = (accounts: AccountLite[]): Cents => accounts.filter((a) => a.inNetworth).reduce((s, a) => s + a.balanceCents, 0);
export const cashToday = (accounts: AccountLite[]): Cents => accounts.filter((a) => a.inNetworth && a.kind !== "card").reduce((s, a) => s + a.balanceCents, 0);
export const cardDebt = (accounts: AccountLite[]): Cents => accounts.filter((a) => a.kind === "card").reduce((s, a) => s + Math.min(0, a.balanceCents), 0);

// ───────── Metas ─────────
export type GoalPlan = { savedCents: Cents; remainingCents: Cents; progress: number; monthlyCents: Cents | null; weeklyCents: Cents | null; monthsLeft: number | null; reached: boolean };

/** ahorrado = aportes − usos. Aporte mensual = (monto − ahorrado) / meses que faltan; semanal = mensual × 12 / 52. */
export function goalPlan(targetCents: Cents, entries: Cents[], targetDate: ISODate | null, today: ISODate): GoalPlan {
  const savedCents = entries.reduce((a, b) => a + b, 0);
  const remainingCents = Math.max(0, targetCents - savedCents);
  const progress = targetCents > 0 ? Math.min(1, Math.max(0, savedCents / targetCents)) : 0;
  const reached = targetCents > 0 && savedCents >= targetCents;
  if (!targetDate || reached) return { savedCents, remainingCents, progress, monthlyCents: null, weeklyCents: null, monthsLeft: null, reached };
  const monthsLeft = Math.max(1, monthsUntil(today, targetDate));
  const monthlyCents = Math.ceil(remainingCents / monthsLeft);
  return { savedCents, remainingCents, progress, monthlyCents, weeklyCents: Math.ceil((monthlyCents * 12) / 52), monthsLeft, reached };
}

// ───────── Deudas ─────────
export type Payoff = { months: number | null; endDate: ISODate | null; interestCents: Cents; neverEnds: boolean };

/** Con saldo, tasa anual y cuota mensual: cuándo terminas y cuánto interés pagas. */
export function debtPayoff(balanceCents: Cents, rateBps: number, monthlyPaymentCents: Cents, today: ISODate): Payoff {
  if (balanceCents <= 0) return { months: 0, endDate: today, interestCents: 0, neverEnds: false };
  if (monthlyPaymentCents <= 0) return { months: null, endDate: null, interestCents: 0, neverEnds: true };
  const r = rateBps / 10_000 / 12;
  let bal = balanceCents, months = 0, interest = 0;
  while (bal > 0 && months < 1200) {
    const i = Math.round(bal * r);
    if (monthlyPaymentCents <= i) return { months: null, endDate: null, interestCents: 0, neverEnds: true };
    interest += i;
    bal = bal + i - monthlyPaymentCents;
    months++;
  }
  return { months, endDate: addMonths(today, months), interestCents: interest, neverEnds: false };
}
export const toMonthly = (cents: Cents, freq: "weekly" | "fortnightly" | "monthly"): Cents =>
  freq === "weekly" ? Math.round((cents * 52) / 12) : freq === "fortnightly" ? Math.round((cents * 26) / 12) : cents;

/** Afterpay / Zip: 4 pagos iguales cada 2 semanas; el primero el día de la compra. */
export function bnplSchedule(totalCents: Cents, firstDate: ISODate): { date: ISODate; amountCents: Cents; paid: boolean }[] {
  const base = Math.floor(totalCents / 4);
  return [0, 1, 2, 3].map((i) => ({ date: addDays(firstDate, i * 14), amountCents: i === 3 ? totalCents - base * 3 : base, paid: false }));
}

// ───────── Impuestos (ABN): solo calcula cuánto apartar con el % que dio el contador ─────────
export const taxToSetAside = (incomeCents: Cents, percentBps: number): Cents => Math.round((incomeCents * percentBps) / 10_000);

// ───────── Inversiones: aportado frente a valor actual, escrito a mano ─────────
export function investmentResult(contributedCents: Cents, valueCents: Cents) {
  const gainCents = valueCents - contributedCents;
  return { gainCents, gainPct: contributedCents > 0 ? gainCents / contributedCents : 0 };
}
