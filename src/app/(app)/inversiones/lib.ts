// Inversiones: lectura de las tablas nuevas y formato. Los cálculos viven en src/lib/engine/inversiones.ts (con pruebas).
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatMoney, type Cents, type ISODate, type MoneyFormat } from "@/lib/engine";
import { DEC_ONE, decFromDb, decToDb, formatDec, hasSubCent, unitPriceToCents, type AssetKind, type AssetOp, type AssetState, type Dec, type OpKind } from "@/lib/engine/inversiones";

/**
 * `assets` y `asset_operations` vienen en la migración 20261125000032 (aún sin aplicar): los tipos generados no las tienen.
 * Mientras se regeneran (`npm run db:types`), se consultan con un cliente sin tipos; las filas se tipan abajo a mano.
 */
export const untyped = (db: unknown) => db as SupabaseClient;

export const ASSET_COLS = "id, name, kind, platform, by_units, unit_price_cents::text, balance_cents, price_date, price_at, plan_line_id, recurring_from, archived_at, created_at";
export type AssetRow = {
  id: string; name: string; kind: AssetKind; platform: string | null; by_units: boolean; unit_price_cents: string | null; balance_cents: number | null;
  price_date: ISODate | null; price_at: string | null; plan_line_id: string | null; recurring_from: ISODate | null; archived_at: string | null; created_at: string;
};
export const OP_COLS = "id, asset_id, date, kind, quantity::text, unit_price_cents::text, amount_cents, source, recurring_month, created_at";
export type OpRow = {
  id: string; asset_id: string; date: ISODate; kind: OpKind; quantity: string | null; unit_price_cents: string | null; amount_cents: number;
  source: "manual" | "recurring" | "migrated"; recurring_month: string | null; created_at: string;
};

export const toOp = (o: OpRow): AssetOp => ({ id: o.id, date: o.date, kind: o.kind, qty: decFromDb(o.quantity), amountCents: o.amount_cents, createdAt: o.created_at });
export const toState = (a: AssetRow, ops: OpRow[]): AssetState => ({
  byUnits: a.by_units, unitPriceCents: decFromDb(a.unit_price_cents), balanceCents: a.balance_cents, priceDate: a.price_date, priceAt: a.price_at, ops: ops.map(toOp),
});

/** Color de cada tipo (solo tokens; Fondo usa el azul más cercano al del mockup). */
export const KIND_COLOR: Record<AssetKind, string> = {
  etf: "var(--teal)", stocks: "var(--tinta)", crypto: "var(--amarillo-oscuro)", fund: "var(--azul)",
  retirement: "var(--azul-oscuro)", property: "var(--naranja)", other: "var(--gris-5)",
};
/** Texto sobre el color del tipo: en el amarillo, tinta (el blanco no se lee). */
export const KIND_INK: Record<AssetKind, string> = { ...Object.fromEntries(Object.keys(KIND_COLOR).map((k) => [k, "var(--blanco)"])) as Record<AssetKind, string>, crypto: "var(--tinta)" };

/** Precio por unidad (centavos, Dec) → "$552.10", o con más decimales si tiene fracción de centavo ("$0.0004"). */
export function formatUnitPrice(p: Dec, fmt: MoneyFormat): string {
  if (!hasSubCent(p)) return formatMoney(unitPriceToCents(p), fmt);
  return `$${formatDec(p / BigInt(100), fmt.numberLocale, 6)}`;
}

/** Costo promedio por unidad: a centavos ("$481.05"); con más decimales solo si es menos de 1 centavo. */
export function formatAvgPrice(p: Dec, fmt: MoneyFormat): string {
  return p >= DEC_ONE ? formatMoney(unitPriceToCents(p), fmt, { cents: true }) : formatUnitPrice(p, fmt);
}

/** Precio por unidad → texto para el campo ("552.10"; "552,10" donde la coma es decimal), al menos 2 decimales. */
export function priceInputText(p: Dec, numberLocale = "en-AU"): string {
  const t = decToDb(p / BigInt(100));
  const [w, f = ""] = t.split(".");
  const sep = (1.5).toLocaleString(numberLocale).includes(",") ? "," : ".";
  return `${w}${sep}${f.padEnd(2, "0")}`;
}

/** Centavos → texto para el campo ("48200.50" o "48200"). */
export const centsInputText = (c: Cents) => (c % 100 === 0 ? String(c / 100) : `${Math.trunc(c / 100)}.${String(Math.abs(c % 100)).padStart(2, "0")}`);

/** Resultado como en el mockup: "+$183 (+14.8%)". Sin costo, solo el monto. */
export function resultText(gainCents: Cents, costCents: Cents, fmt: MoneyFormat): string {
  const money = gainCents === 0 ? formatMoney(0, fmt) : formatMoney(gainCents, fmt, { sign: true });
  if (costCents <= 0) return money;
  const pct = (gainCents / costCents) * 100;
  return `${money} (${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(1)}%)`;
}
/** Verde si ganó, ámbar si perdió (estados siempre con signo además del color). */
export const resultTone = (gain: Cents) => (gain < 0 ? "var(--ambar-texto)" : "var(--verde-fuerte)");
