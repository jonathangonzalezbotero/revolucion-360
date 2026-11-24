// Cálculos propios de Cuentas (puros, con pruebas en tests/cuentas-metas.test.ts).
import { unregistered, type AccountKind, type Cents, type ISODate } from "@/lib/engine";

export const KINDS: AccountKind[] = ["bank", "savings", "card", "cash", "business", "other"];

/** Color del cuadro con la inicial, por tipo de cuenta (solo tokens). */
export const KIND_COLOR: Record<AccountKind, string> = {
  bank: "var(--tinta)", savings: "var(--teal)", card: "var(--naranja)", cash: "var(--gris-verde)", business: "var(--azul-oscuro)", other: "var(--gris-5)",
};

/** La cuenta de empresa nace fuera del patrimonio y de la proyección: ese dinero no es del usuario. */
export const defaultsFor = (kind: AccountKind) => ({ inNetworth: kind !== "business", inForecast: kind !== "business" });

/** Tarjetas en negativo: si el usuario escribe lo que debe sin signo, se guarda como deuda. */
export const cardBalance = (kind: AccountKind, cents: Cents): Cents => (kind === "card" && cents > 0 ? -cents : cents);

/** Una transferencia mueve los dos saldos escritos: resta en la cuenta de salida y suma en la de llegada. */
export const transferBalances = (fromCents: Cents, toCents: Cents, amountCents: Cents) => {
  const amount = Math.abs(amountCents);
  return { from: fromCents - amount, to: toCents + amount };
};

export const initialOf = (name: string) => name.trim().charAt(0).toUpperCase();

export type BalanceCheck = { state: "ok" | "missing" | "extra"; cents: Cents };
/**
 * Compara el saldo que el usuario escribe con el que dan sus movimientos.
 * - escribe menos de lo esperado → le faltan gastos por registrar
 * - escribe más → registró de más (o le falta un ingreso)
 * Diferencias de menos de $1 no se avisan.
 */
export function balanceCheck(statedCents: Cents, expectedCents: Cents): BalanceCheck {
  const d = unregistered(statedCents, expectedCents);
  if (Math.abs(d) < 100) return { state: "ok", cents: 0 };
  return d < 0 ? { state: "missing", cents: -d } : { state: "extra", cents: d };
}

export type TransferError = "same" | "amount" | null;
export function transferError(fromId: string, toId: string, amountCents: Cents | null): TransferError {
  if (!fromId || !toId || fromId === toId) return "same";
  if (amountCents === null || amountCents <= 0) return "amount";
  return null;
}

type Ref = { id: string; name: string };
export type TransferRow = {
  user_id: string; account_id: string; date: ISODate; amount_cents: Cents; description: string;
  kind: "transfer"; transfer_pair_id: string; status: "ok"; source: "manual";
};
/**
 * Una transferencia entre cuentas propias son DOS movimientos con el mismo par:
 * sale de una (negativo) y entra a la otra (positivo). Suman cero: no es ingreso ni gasto.
 */
export function transferRows(userId: string, from: Ref, to: Ref, amountCents: Cents, date: ISODate, pairId: string, labels: { to: string; from: string }): [TransferRow, TransferRow] {
  const amount = Math.abs(amountCents);
  const base = { user_id: userId, date, kind: "transfer" as const, transfer_pair_id: pairId, status: "ok" as const, source: "manual" as const };
  return [
    { ...base, account_id: from.id, amount_cents: -amount, description: labels.to.replace("{name}", to.name) },
    { ...base, account_id: to.id, amount_cents: amount, description: labels.from.replace("{name}", from.name) },
  ];
}
