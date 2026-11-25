// Planes y precios: cálculos puros (sin red ni base de datos). Probados en tests/admin-planes.test.ts.
// Un solo plan, cobrado en USD (decisión del 25 nov 2026). Los valores viven en `app_config.billing`.
import { formatMoney, parseMoney, type Cents, type ISODate } from "@/lib/engine";
import { couponExpired, type CouponAppliesTo } from "@/app/(app)/suscripcion/lib";
import { endOfDay, expiryDay, expiryFrom } from "../_shared/lib";

/** Texto del campo ↔ centavos, sin separador de miles (así `parseMoney` lo lee igual al volver). */
export function centsToInput(cents: Cents | null | undefined): string {
  if (cents == null) return "";
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

const MAX_PRICE: Cents = 1_000_000; // USD 10,000: más que eso es un error de tipeo
export type PriceCheck = { ok: true; cents: Cents | null } | { ok: false };
/** Precio escrito por el admin: vacío = sin precio (null); cero, negativo o absurdo = error. */
export function parsePrice(text: string): PriceCheck {
  if (!text.trim()) return { ok: true, cents: null };
  const c = parseMoney(text);
  if (c === null || c <= 0 || c > MAX_PRICE) return { ok: false };
  return { ok: true, cents: c };
}

/** Entero dentro de un rango, escrito como texto. */
export function parseIntIn(text: string | number, min: number, max: number): number | null {
  const s = String(text).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
}

// ───────── Precios (app_config.billing) ─────────
export type Billing = { first_month_cents: Cents; monthly_cents: Cents; yearly_cents: Cents; notify_before_days: number; notify_first_charge: boolean };
/** Lo aprobado el 25 nov 2026: $1 el primer mes, $8 al mes, $80 al año, aviso 3 días antes. */
export const BILLING_DEFAULTS: Billing = { first_month_cents: 100, monthly_cents: 800, yearly_cents: 8000, notify_before_days: 3, notify_first_charge: true };
export const NOTIFY_MAX_DAYS = 30;
export const USD = { currency: "USD", numberLocale: "en-US" } as const;
/** Monto en USD para los textos del panel: "$8", "$6.67". */
export const usd = (cents: Cents) => formatMoney(cents, USD);

const posInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;
/** Lo guardado (o nada, si la clave aún no existe) → valores completos. Un valor raro cae al valor por defecto. */
export function billingFrom(raw: unknown): Billing {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = BILLING_DEFAULTS;
  return {
    first_month_cents: posInt(o.first_month_cents) ? o.first_month_cents : d.first_month_cents,
    monthly_cents: posInt(o.monthly_cents) ? o.monthly_cents : d.monthly_cents,
    yearly_cents: posInt(o.yearly_cents) ? o.yearly_cents : d.yearly_cents,
    notify_before_days: typeof o.notify_before_days === "number" && Number.isInteger(o.notify_before_days) && o.notify_before_days >= 0 && o.notify_before_days <= NOTIFY_MAX_DAYS ? o.notify_before_days : d.notify_before_days,
    notify_first_charge: typeof o.notify_first_charge === "boolean" ? o.notify_first_charge : d.notify_first_charge,
  };
}

/** Lo que escribe el admin en la pantalla (texto). `notify_first_charge` no tiene control: se conserva como está. */
export type BillingInput = { first: string; monthly: string; yearly: string; notifyDays: string };
export const billingToInput = (b: Billing): BillingInput => ({
  first: centsToInput(b.first_month_cents), monthly: centsToInput(b.monthly_cents), yearly: centsToInput(b.yearly_cents), notifyDays: String(b.notify_before_days),
});
export type BillingEdit = Pick<Billing, "first_month_cents" | "monthly_cents" | "yearly_cents" | "notify_before_days">;
export type BillingCheck = { ok: true; values: BillingEdit } | { ok: false; error: "first" | "monthly" | "yearly" | "notify" };
/** Los tres precios son obligatorios y mayores a cero; el aviso va de 1 a 30 días. */
export function checkBilling(input: BillingInput): BillingCheck {
  const req = (t: string) => { const p = parsePrice(t); return p.ok && p.cents !== null ? p.cents : null; };
  const first = req(input.first);
  if (first === null) return { ok: false, error: "first" };
  const monthly = req(input.monthly);
  if (monthly === null) return { ok: false, error: "monthly" };
  const yearly = req(input.yearly);
  if (yearly === null) return { ok: false, error: "yearly" };
  const days = parseIntIn(input.notifyDays, 1, NOTIFY_MAX_DAYS);
  if (days === null) return { ok: false, error: "notify" };
  return { ok: true, values: { first_month_cents: first, monthly_cents: monthly, yearly_cents: yearly, notify_before_days: days } };
}

/**
 * Mezcla lo editado sobre lo guardado: conserva `notify_first_charge` y cualquier clave que esta pantalla no conoce
 * (la usa el cobro). `changed` lista las claves que cambiaron (para el registro; nunca valores).
 */
export function mergeBilling(raw: unknown, edit: BillingEdit): { value: Record<string, unknown>; changed: string[] } {
  const cur = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const before = billingFrom(raw);
  const changed = (Object.keys(edit) as (keyof BillingEdit)[]).filter((k) => before[k] !== edit[k] || cur[k] === undefined);
  return { value: { ...BILLING_DEFAULTS, ...cur, ...edit }, changed };
}

/** "Anual equivale a $6.67 al mes · ahorro de 17%". Centavos al mes (redondeados) y % de ahorro frente a 12 meses. */
export function yearlyEquivalent(monthly: Cents, yearly: Cents): { perMonth: Cents; savingsPct: number } {
  const perMonth = Math.round(yearly / 12);
  const savingsPct = monthly > 0 ? Math.max(0, Math.round((1 - yearly / (monthly * 12)) * 100)) : 0;
  return { perMonth, savingsPct };
}

/** Ingreso estimado de un mes en USD: primer mes × su precio + mensual × precio + anual × precio ÷ 12. */
export function monthlyIncome(b: Pick<Billing, "first_month_cents" | "monthly_cents" | "yearly_cents">, n: { firstMonth: number; monthly: number; yearly: number }): Cents {
  return n.firstMonth * b.first_month_cents + n.monthly * b.monthly_cents + Math.round((n.yearly * b.yearly_cents) / 12);
}

// ───────── Cupones ─────────
/** Igual que el mockup: solo letras y números, en mayúsculas. */
export const cleanCouponCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");
export type CouponInput = { code: string; pct: string; months: string; max: string; appliesTo: string; until: string };
export type CouponData = { code: string; percent_off: number; duration_months: number | null; max_redemptions: number | null; applies_to: CouponAppliesTo; expires_at: string | null };
export type CouponCheck = { ok: true; coupon: CouponData } | { ok: false; error: "code" | "pct" | "months" | "max" | "applies" | "until" | "untilPast" };
/** Valida el cupón. `today` es hoy en la zona del admin: la fecha de vencimiento tiene que ser después de hoy y se guarda el final de ese día. */
export function checkCoupon(input: CouponInput, today: ISODate): CouponCheck {
  const code = cleanCouponCode(input.code);
  if (code.length < 3 || code.length > 40 || code !== input.code.trim().toUpperCase()) return { ok: false, error: "code" };
  const pct = parseIntIn(input.pct, 1, 100);
  if (pct === null) return { ok: false, error: "pct" };
  const months = input.months.trim() === "" ? 0 : parseIntIn(input.months, 0, 36);
  if (months === null) return { ok: false, error: "months" };
  const max = input.max.trim() === "" ? null : parseIntIn(input.max, 1, 100_000);
  if (max === null && input.max.trim() !== "") return { ok: false, error: "max" };
  const applies = input.appliesTo.trim();
  if (applies !== "month" && applies !== "year" && applies !== "both") return { ok: false, error: "applies" };
  let expires: string | null = null;
  if (input.until.trim()) {
    const e = expiryFrom("fecha", { until: input.until }, today);
    if (!e.ok) return { ok: false, error: e.error === "past" ? "untilPast" : "until" };
    expires = endOfDay(e.until);
  }
  return { ok: true, coupon: { code, percent_off: pct, duration_months: months === 0 ? null : months, max_redemptions: max, applies_to: applies, expires_at: expires } };
}

/** Vencimiento para Stripe (`promotionCodes.create`): segundos Unix, o nada si no vence. */
export const stripeExpiry = (expiresAt: string | null): { expires_at: number } | Record<string, never> =>
  (expiresAt ? { expires_at: Math.floor(Date.parse(expiresAt) / 1000) } : {});

/** Columna "Vence" de la tabla: sin fecha, vencido, o el día que eligió el admin. */
export type CouponExpiry = { kind: "none" } | { kind: "expired"; day: ISODate } | { kind: "date"; day: ISODate };
export function couponExpiry(expiresAt: string | null, now: Date = new Date()): CouponExpiry {
  if (!expiresAt) return { kind: "none" };
  return { kind: couponExpired(expiresAt, now) ? "expired" : "date", day: expiryDay(expiresAt) };
}
