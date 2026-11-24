// Suscripción: cálculos puros (sin red ni base de datos). Los usan la pantalla, las rutas de Stripe y las pruebas.
import type { PlanState } from "@/lib/engine";

export type Interval = "month" | "year";

// ───────── Precios por región ─────────
export type PriceRegion = {
  region: string;            // código de país, 'EU' o 'DEFAULT'
  currency: string;
  monthly_cents: number | null;
  yearly_cents: number | null;
  stripe_price_monthly: string | null;
  stripe_price_yearly: string | null;
  student_discount_pct: number;
};

/** Países que pagan con la región 'EU' cuando no tienen una región propia. */
export const EU_COUNTRIES = new Set(["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"]);

/** Región del usuario: su país; si es de la Unión Europea, 'EU'; si no, 'DEFAULT'. */
export function pickRegion(country: string | null | undefined, regions: PriceRegion[]): PriceRegion | null {
  const code = (country ?? "").trim().toUpperCase();
  const by = new Map(regions.map((r) => [r.region.toUpperCase(), r]));
  if (code && by.has(code)) return by.get(code)!;
  if (EU_COUNTRIES.has(code) && by.has("EU")) return by.get("EU")!;
  return by.get("DEFAULT") ?? null;
}

/** Precio de la región para la frecuencia elegida (centavos), o null si aún no tiene monto. */
export function priceFor(r: PriceRegion | null, interval: Interval): number | null {
  if (!r) return null;
  const v = interval === "month" ? r.monthly_cents : r.yearly_cents;
  return v != null && v > 0 ? v : null;
}

/** Id del precio en Stripe para la frecuencia elegida. */
export function stripePriceFor(r: PriceRegion | null, interval: Interval): string | null {
  if (!r) return null;
  return (interval === "month" ? r.stripe_price_monthly : r.stripe_price_yearly) || null;
}

/** Cuánto ahorra el anual frente a 12 meses (porcentaje entero), o null si no hay ahorro o faltan precios. */
export function yearlySavingsPct(monthly: number | null, yearly: number | null): number | null {
  if (!monthly || !yearly || monthly <= 0 || yearly <= 0) return null;
  const pct = Math.round((1 - yearly / (monthly * 12)) * 100);
  return pct > 0 ? pct : null;
}

/** El anual expresado por mes (centavos redondeados). */
export const monthlyEquivalent = (yearly: number) => Math.round(yearly / 12);

/** Precio con un descuento porcentual (centavos redondeados). */
export function discounted(cents: number, pct: number): number {
  const p = Math.min(100, Math.max(0, Math.round(pct)));
  return Math.round((cents * (100 - p)) / 100);
}

/** Id del cupón de alumno en Stripe (lo crea scripts/stripe-setup.ts, uno por porcentaje). */
export const studentCouponId = (pct: number) => `alumno-${Math.round(pct)}`;

// ───────── Accesos gratis (alumno / fundador) ─────────
export type Grant = { kind: "alumno" | "fundador"; expires_at: string | null; revoked_at: string | null };

/** El acceso gratis vigente que mejor le sirve: fundador antes que alumno; el que vence más tarde (de por vida gana). */
export function activeGrant(grants: Grant[], now: Date = new Date()): { state: "alumno" | "fundador"; accessUntil: string | null } | null {
  const live = grants.filter((g) => !g.revoked_at && (!g.expires_at || new Date(g.expires_at) > now));
  if (!live.length) return null;
  const rank = (g: Grant) => (g.kind === "fundador" ? 2 : 1);
  const end = (g: Grant) => (g.expires_at ? new Date(g.expires_at).getTime() : Infinity);
  const best = [...live].sort((a, b) => rank(b) - rank(a) || end(b) - end(a))[0];
  return { state: best.kind, accessUntil: best.expires_at };
}

/** A qué estado vuelve cuando la suscripción termina: el acceso gratis vigente, o solo lectura (nunca se borra nada). */
export function stateAfterSubscription(grants: Grant[], now: Date = new Date()): { state: PlanState; accessUntil: string | null } {
  return activeGrant(grants, now) ?? { state: "read_only", accessUntil: null };
}

/** ¿Es alumno para el descuento? Tiene (o tuvo) un acceso de alumno que no le quitaron. */
export const isStudent = (grants: Grant[]) => grants.some((g) => g.kind === "alumno" && !g.revoked_at);

// ───────── Suscripción de Stripe → entitlements ─────────
/** Lo mínimo de una suscripción de Stripe que hace falta para decidir el estado. */
export type SubLike = {
  id: string;
  status: string;                       // active | trialing | past_due | unpaid | canceled | incomplete | incomplete_expired | paused
  cancel_at_period_end: boolean;
  cancel_at: number | null;             // segundos
  current_period_end: number | null;    // segundos (de los ítems, API 2025+)
  interval: string | null;              // month | year
};

export type EntitlementPatch = {
  state?: PlanState;
  pro_until?: string | null;
  access_until?: string | null;
  billing_interval?: Interval | null;
  stripe_subscription_id: string;
  stripe_status: string;
  cancel_at_period_end: boolean;
};

const PAYING = new Set(["active", "trialing", "past_due"]);
const ENDED = new Set(["canceled", "unpaid", "incomplete_expired", "paused"]);

export const isPaying = (status: string | null | undefined) => !!status && PAYING.has(status);

const toIso = (sec: number | null) => (sec ? new Date(sec * 1000).toISOString() : null);
const asInterval = (v: string | null): Interval | null => (v === "month" || v === "year" ? v : null);

/**
 * Traduce la suscripción de Stripe al estado del plan.
 * - active / trialing / past_due → pro (past_due sigue con Pro mientras Stripe reintenta el cobro).
 * - canceled / unpaid / incomplete_expired / paused → si venía de Pro: acceso gratis vigente (alumno o fundador) o solo lectura.
 *   Si nunca llegó a Pro (primer pago que no se completó) no cambia el estado: nadie queda en solo lectura sin haber pagado.
 * - incomplete (el primer pago no terminó) → no cambia el estado; solo guarda el estado de Stripe.
 */
export function mapSubscription(sub: SubLike, grants: Grant[], prevState: PlanState, now: Date = new Date()): EntitlementPatch {
  const base = {
    stripe_subscription_id: sub.id,
    stripe_status: sub.status,
    cancel_at_period_end: sub.cancel_at_period_end || sub.cancel_at != null,
  };
  if (PAYING.has(sub.status)) {
    return { ...base, state: "pro", pro_until: toIso(sub.current_period_end), billing_interval: asInterval(sub.interval) };
  }
  if (ENDED.has(sub.status)) {
    if (prevState !== "pro") return { ...base, cancel_at_period_end: false };
    const after = stateAfterSubscription(grants, now);
    const patch: EntitlementPatch = { ...base, state: after.state, cancel_at_period_end: false };
    if (after.state !== "read_only") patch.access_until = after.accessUntil;
    return patch;
  }
  return base;
}

/**
 * ¿Hay que ignorar el aviso? Sí cuando habla de una suscripción vieja que terminó
 * mientras la que tiene guardada sigue pagando (llega tarde el aviso de la anterior).
 */
export function isStaleEvent(storedSubId: string | null, storedStatus: string | null, sub: SubLike): boolean {
  if (!storedSubId || storedSubId === sub.id) return false;
  return !PAYING.has(sub.status) && isPaying(storedStatus);
}

/** Respuesta de la encuesta de cancelación → valor que entiende Stripe. */
export const CANCEL_REASONS = { caro: "too_expensive", no_uso: "unused", falta: "missing_features" } as const;
export type CancelReason = keyof typeof CANCEL_REASONS;

// ───────── Prueba gratis ─────────
export function canStartTrial(trial: { enabled: boolean; days: number }, e: { state: PlanState; trialUsed: boolean }): boolean {
  return trial.enabled && trial.days > 0 && !e.trialUsed && e.state === "free";
}

/** Fin de la prueba: ahora + días. */
export const trialEnd = (days: number, now: Date = new Date()) => new Date(now.getTime() + days * 86_400_000).toISOString();

// ───────── Montos en Stripe ─────────
/** Monedas sin decimales en Stripe: ahí el monto va en unidades enteras, no en centavos. */
const STRIPE_ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
/** Centavos de la app → monto que espera Stripe. */
export const toStripeAmount = (cents: number, currency: string) => (STRIPE_ZERO_DECIMAL.has(currency.toUpperCase()) ? Math.round(cents / 100) : cents);
/** Monto de Stripe → centavos de la app. */
export const fromStripeAmount = (amount: number, currency: string) => (STRIPE_ZERO_DECIMAL.has(currency.toUpperCase()) ? amount * 100 : amount);

// ───────── Historial ─────────
/** Un periodo de factura de más de 40 días es anual. */
export const invoiceInterval = (start: number | null, end: number | null): Interval => (start && end && end - start > 40 * 86_400 ? "year" : "month");
