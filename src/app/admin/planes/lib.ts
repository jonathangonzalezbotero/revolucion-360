// Planes y precios: cálculos puros (sin red ni base de datos). Probados en tests/admin-planes.test.ts.
import { parseMoney, type Cents, type FeatureKey, type MoneyFormat, type Tier } from "@/lib/engine";

// ───────── Regiones ─────────
/** Orden del mockup; las regiones nuevas van al final, por código. */
export const REGION_ORDER = ["AU", "DEFAULT", "CO", "MX", "EU"];
export const sortRegions = <T extends { region: string }>(rows: T[]): T[] => {
  const idx = (r: string) => { const i = REGION_ORDER.indexOf(r.toUpperCase()); return i < 0 ? REGION_ORDER.length : i; };
  return [...rows].sort((a, b) => idx(a.region) - idx(b.region) || a.region.localeCompare(b.region));
};

/** Cómo se escriben los números de cada moneda (igual que la sesión). */
const CURRENCY_LOCALE: Record<string, string> = { AUD: "en-AU", USD: "en-US", NZD: "en-NZ", GBP: "en-GB", EUR: "es-ES", COP: "es-CO", MXN: "es-MX", CLP: "es-CL", PEN: "es-PE", ARS: "es-AR", CAD: "en-CA" };
export const currencyFmt = (currency: string): MoneyFormat => ({ currency, numberLocale: CURRENCY_LOCALE[currency.toUpperCase()] ?? "en-US" });

/** Centavos → texto del campo, sin separador de miles (así `parseMoney` lo lee igual al volver). */
export function centsToInput(cents: Cents | null | undefined): string {
  if (cents == null) return "";
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

const MAX_PRICE: Cents = 100_000_000_00; // 100 millones (cubre COP)
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

export type RegionRow = { region: string; monthly_cents: number | null; yearly_cents: number | null; student_discount_pct: number };
export type RegionInput = { region: string; monthly: string; yearly: string; student: string };
export type RegionPatch = Partial<Pick<RegionRow, "monthly_cents" | "yearly_cents" | "student_discount_pct">>;
export type RegionCheck = { ok: true; patch: RegionPatch } | { ok: false; error: "monthly" | "yearly" | "student" };

/** Compara lo escrito con lo guardado y devuelve solo lo que cambió. */
export function regionPatch(row: RegionRow, input: RegionInput): RegionCheck {
  const m = parsePrice(input.monthly);
  if (!m.ok) return { ok: false, error: "monthly" };
  const y = parsePrice(input.yearly);
  if (!y.ok) return { ok: false, error: "yearly" };
  const st = input.student.trim() === "" ? 0 : parseIntIn(input.student, 0, 100);
  if (st === null) return { ok: false, error: "student" };
  const patch: RegionPatch = {};
  if (m.cents !== row.monthly_cents) patch.monthly_cents = m.cents;
  if (y.cents !== row.yearly_cents) patch.yearly_cents = y.cents;
  if (st !== row.student_discount_pct) patch.student_discount_pct = st;
  return { ok: true, patch };
}

/** ¿El precio guardado en Stripe corresponde al monto de la región? */
export type SyncState = "ok" | "pending" | "none" | "unknown";
export function priceSync(cents: number | null, priceId: string | null, stripe: { amount: number | null; currency: string } | null | undefined, expectedAmount: number | null, currency: string): SyncState {
  if (!cents) return "none";
  if (!priceId) return "pending";
  if (stripe === undefined) return "unknown";
  if (stripe === null) return "pending";
  return stripe.amount === expectedAmount && stripe.currency.toUpperCase() === currency.toUpperCase() ? "ok" : "pending";
}
/** Estado de la región: pendiente si cualquiera de sus precios lo está. */
export function regionSync(states: SyncState[]): SyncState {
  const with$ = states.filter((x) => x !== "none");
  if (!with$.length) return "none";
  if (with$.includes("pending")) return "pending";
  if (with$.includes("unknown")) return "unknown";
  return "ok";
}

// ───────── Prueba gratis ─────────
export const TRIAL_MAX_DAYS = 90;
export type TrialCheck = { ok: true; trial: { enabled: boolean; days: number } } | { ok: false };
export function checkTrial(enabled: boolean, days: string | number): TrialCheck {
  const d = parseIntIn(days, 1, TRIAL_MAX_DAYS);
  return d === null ? { ok: false } : { ok: true, trial: { enabled, days: d } };
}

// ───────── Qué incluye cada plan ─────────
/** Las funciones que muestra el mockup (las demás se editan en Menú y funciones). */
export const PLAN_FEATURES = ["plan", "diag", "metas", "proy", "mov", "ana", "inv", "cierre", "acad"] as const satisfies readonly FeatureKey[];
export type PlanFeature = (typeof PLAN_FEATURES)[number];
export const tierOf = (cfg: Partial<Record<string, Tier>>, key: string): Tier => (cfg[key] === "pro" ? "pro" : "free");

/** Solo las funciones que el admin movió (así no pisa lo que otra pantalla cambió mientras tanto). */
export function changedFeatures(initial: Partial<Record<string, Tier>>, current: Partial<Record<string, Tier>>): Partial<Record<PlanFeature, Tier>> {
  const out: Partial<Record<PlanFeature, Tier>> = {};
  for (const k of PLAN_FEATURES) if (tierOf(current, k) !== tierOf(initial, k)) out[k] = tierOf(current, k);
  return out;
}

// ───────── Cupones ─────────
/** Igual que el mockup: solo letras y números, en mayúsculas. */
export const cleanCouponCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");
export type CouponInput = { code: string; pct: string; months: string; max: string };
export type CouponData = { code: string; percent_off: number; duration_months: number | null; max_redemptions: number | null };
export type CouponCheck = { ok: true; coupon: CouponData } | { ok: false; error: "code" | "pct" | "months" | "max" };
export function checkCoupon(input: CouponInput): CouponCheck {
  const code = cleanCouponCode(input.code);
  if (code.length < 3 || code.length > 40 || code !== input.code.trim().toUpperCase()) return { ok: false, error: "code" };
  const pct = parseIntIn(input.pct, 1, 100);
  if (pct === null) return { ok: false, error: "pct" };
  const months = input.months.trim() === "" ? 0 : parseIntIn(input.months, 0, 36);
  if (months === null) return { ok: false, error: "months" };
  const max = input.max.trim() === "" ? null : parseIntIn(input.max, 1, 100_000);
  if (max === null && input.max.trim() !== "") return { ok: false, error: "max" };
  return { ok: true, coupon: { code, percent_off: pct, duration_months: months === 0 ? null : months, max_redemptions: max } };
}
