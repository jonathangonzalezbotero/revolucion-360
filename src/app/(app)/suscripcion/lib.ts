// Suscripción: cálculos puros (sin red ni base de datos). Los usan la pantalla, /activar, las rutas de Stripe y las pruebas.
import type { PlanState } from "@/lib/engine";

export type Interval = "month" | "year";

// ───────── Un solo plan en USD (desde el 25 nov 2026) ─────────
/**
 * `app_config.billing` (lo edita el admin). Montos en centavos de USD.
 * Cambiar un monto solo afecta suscripciones NUEVAS: hay que volver a correr scripts/stripe-setup.ts (crea el precio nuevo).
 */
export type BillingConfig = { firstMonthCents: number; monthlyCents: number; yearlyCents: number; notifyBeforeDays: number; notifyFirstCharge: boolean };
export const BILLING_DEFAULTS: BillingConfig = { firstMonthCents: 100, monthlyCents: 800, yearlyCents: 8000, notifyBeforeDays: 3, notifyFirstCharge: true };
export const BILLING_CURRENCY = "USD";
/** Días del primer mes (prueba de Stripe sobre la suscripción mensual; el $1 se cobra hoy como cargo único). */
export const FIRST_MONTH_DAYS = 30;

/** Lee `app_config.billing` con valores por defecto: un valor faltante, negativo o roto nunca deja la pantalla sin precio. */
export function readBilling(raw: unknown): BillingConfig {
  const v = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const cents = (x: unknown, d: number, min: number) => (typeof x === "number" && Number.isInteger(x) && x >= min ? x : d);
  return {
    firstMonthCents: cents(v.first_month_cents, BILLING_DEFAULTS.firstMonthCents, 0),
    monthlyCents: cents(v.monthly_cents, BILLING_DEFAULTS.monthlyCents, 1),
    yearlyCents: cents(v.yearly_cents, BILLING_DEFAULTS.yearlyCents, 1),
    notifyBeforeDays: cents(v.notify_before_days, BILLING_DEFAULTS.notifyBeforeDays, 1),
    notifyFirstCharge: typeof v.notify_first_charge === "boolean" ? v.notify_first_charge : BILLING_DEFAULTS.notifyFirstCharge,
  };
}

/** "$8" / "$6.67": dólares sin ".00" cuando son exactos (textos como "$8 USD al mes"). Centavos enteros, nunca decimales sueltos. */
export function usdShort(cents: number): string {
  const c = Math.round(cents);
  const a = Math.abs(c);
  const whole = Math.floor(a / 100).toLocaleString("en-US");
  return `${c < 0 ? "-" : ""}$${whole}${a % 100 === 0 ? "" : `.${String(a % 100).padStart(2, "0")}`}`;
}
/** "$1.00 USD": siempre con centavos (Hoy pagas, historial). */
export function usdFull(cents: number): string {
  const c = Math.round(cents);
  const a = Math.abs(c);
  return `${c < 0 ? "-" : ""}$${Math.floor(a / 100).toLocaleString("en-US")}.${String(a % 100).padStart(2, "0")} ${BILLING_CURRENCY}`;
}

/** Meses gratis del anual frente a 12 mensuales ($80 contra 12 × $8 = 2 meses). 0 si no hay ahorro. */
export function freeMonths(monthlyCents: number, yearlyCents: number): number {
  if (monthlyCents <= 0 || yearlyCents <= 0) return 0;
  return Math.max(0, Math.round((monthlyCents * 12 - yearlyCents) / monthlyCents));
}

/** Ids de los precios en Stripe (fila 'DEFAULT' de price_regions, los guarda scripts/stripe-setup.ts). */
export type StripePrices = { monthly: string | null; yearly: string | null; first: string | null };

/**
 * ¿Le toca el primer mes a $1? Solo a quien nunca activó (estado free) y nunca tuvo suscripción.
 * Quien vuelve (solo lectura, acceso gratis vencido o ya pagó antes) paga $8 o $80 desde hoy, sin primer mes.
 */
export const firstMonthApplies = (state: PlanState, hadSubscription: boolean) => state === "free" && !hadSubscription;

/** Lo que se le pide a Stripe Checkout (sin cliente, cupón ni URLs): precios, prueba y lo que paga hoy. */
export type CheckoutPlan = {
  lineItems: { price: string; quantity: 1 }[];
  trialDays: number | null;
  todayCents: number;           // lo que paga hoy (antes de cupón)
  thenCents: number;            // lo que paga en cada renovación
  firstMonth: boolean;
};

/**
 * Armado puro del pago:
 * - mensual con primer mes: suscripción de $8 con 30 días de prueba + cargo único de $1 en el mismo pago (se cobra hoy).
 * - mensual sin primer mes: $8 hoy. Anual: $80 hoy, sin prueba.
 * Devuelve null si falta un precio en Stripe (la pantalla dice que los pagos aún no están activos).
 */
export function checkoutPlan(interval: Interval, first: boolean, prices: StripePrices, b: BillingConfig): CheckoutPlan | null {
  if (interval === "year") {
    if (!prices.yearly) return null;
    return { lineItems: [{ price: prices.yearly, quantity: 1 }], trialDays: null, todayCents: b.yearlyCents, thenCents: b.yearlyCents, firstMonth: false };
  }
  if (!prices.monthly) return null;
  if (!first) return { lineItems: [{ price: prices.monthly, quantity: 1 }], trialDays: null, todayCents: b.monthlyCents, thenCents: b.monthlyCents, firstMonth: false };
  if (!prices.first) return null;
  return {
    lineItems: [{ price: prices.monthly, quantity: 1 }, { price: prices.first, quantity: 1 }],
    trialDays: FIRST_MONTH_DAYS, todayCents: b.firstMonthCents, thenCents: b.monthlyCents, firstMonth: true,
  };
}

/** ¿El precio guardado en Stripe sigue diciendo lo mismo que Administración? Si no, no se cobra (hay que correr stripe-setup). */
export function priceMatches(p: { unit_amount: number | null; currency: string; active: boolean; recurring: { interval: string } | null } | null, cents: number, interval: Interval | "once"): boolean {
  if (!p || !p.active || p.unit_amount !== cents || p.currency.toUpperCase() !== BILLING_CURRENCY) return false;
  return interval === "once" ? !p.recurring : p.recurring?.interval === interval;
}

/** Fecha en que termina el primer mes / se renueva (ahora + días o + 1 año). Para "Desde el {date}…" antes de pagar. */
export function renewalDate(interval: Interval, first: boolean, now: Date = new Date()): Date {
  const d = new Date(now.getTime());
  if (interval === "year") { d.setUTCFullYear(d.getUTCFullYear() + 1); return d; }
  if (first) return new Date(now.getTime() + FIRST_MONTH_DAYS * 86_400_000);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

/** Qué ve el usuario en "Tu suscripción" (bloque superior de /suscripcion). */
export type SubView = "first" | "monthly" | "yearly" | "failed" | "ending" | "gift" | "read_only" | "inactive";
export function subView(a: { state: PlanState; stripeStatus: string | null; interval: string | null; paymentFailed: boolean; cancelPending: boolean }): SubView {
  if (a.state === "read_only") return "read_only";
  if (a.state === "alumno" || a.state === "fundador" || a.state === "trial") return "gift"; // 'trial': filas viejas, ya no se usa
  if (a.state !== "pro") return "inactive";
  if (a.paymentFailed && isPaying(a.stripeStatus)) return "failed";
  if (a.cancelPending) return "ending";
  if (a.stripeStatus === "trialing") return "first";
  return a.interval === "year" ? "yearly" : "monthly";
}

/** Concepto de una factura: el primer pago mensual lleva el cargo único de $1 ("Primer mes"); si no, mensual o anual por su periodo. */
export function invoiceConcept(i: { billingReason: string | null; hasOneTime: boolean; periodStart: number | null; periodEnd: number | null }): "first" | Interval {
  if (i.hasOneTime && i.billingReason === "subscription_create") return "first";
  return invoiceInterval(i.periodStart, i.periodEnd);
}

// ───────── Precios por región (ya no se usan para cobrar: siempre la fila DEFAULT en USD) ─────────
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

// ───────── Cupones ─────────
/** A qué frecuencia aplica un cupón (columna `coupons.applies_to`). */
export type CouponAppliesTo = "month" | "year" | "both";
export const COUPON_APPLIES: readonly CouponAppliesTo[] = ["month", "year", "both"];
export const asAppliesTo = (v: string | null | undefined): CouponAppliesTo => (v === "month" || v === "year" ? v : "both");

/** ¿Ya venció? `expires_at` null = no vence; vence justo en el instante guardado. */
export const couponExpired = (expiresAt: string | null, now: Date = new Date()) => !!expiresAt && new Date(expiresAt).getTime() <= now.getTime();

/** ¿Se puede usar este cupón para la frecuencia elegida? "interval" = es de la otra frecuencia; "expired" = venció. */
export function couponUsable(c: { applies_to: string | null; expires_at: string | null }, interval: Interval, now: Date = new Date()): "ok" | "interval" | "expired" {
  if (couponExpired(c.expires_at, now)) return "expired";
  const a = asAppliesTo(c.applies_to);
  return a === "both" || a === interval ? "ok" : "interval";
}

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
