import "server-only";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { priceMatches, readBilling, type BillingConfig, type CheckoutPlan, type Interval, type StripePrices, type SubLike } from "@/app/(app)/suscripcion/lib";

/**
 * Stripe solo en el servidor. Sin STRIPE_SECRET_KEY la app sigue funcionando: los pagos se muestran como "aún no activos".
 * Nunca se usa una clave de producción en desarrollo.
 */
let client: Stripe | null = null;

export function stripeKey(): string {
  return (process.env.STRIPE_SECRET_KEY ?? "").trim();
}

/** ¿Se pueden hacer cobros? Hace falta la clave secreta (y, en local, que sea de prueba). */
export function stripeReady(): boolean {
  const key = stripeKey();
  if (!key) return false;
  if (process.env.NODE_ENV !== "production" && !key.startsWith("sk_test_") && !key.startsWith("rk_test_")) return false;
  return true;
}

/** Cliente de Stripe, o null si no hay clave. Se crea la primera vez que se pide, nunca al cargar el módulo. */
export function getStripe(): Stripe | null {
  if (!stripeReady()) return null;
  if (!client) client = new Stripe(stripeKey(), { appInfo: { name: "Revolucion 360" } });
  return client;
}

/** Dirección pública de la app para las URLs de vuelta. */
export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Cliente de Stripe del usuario: reutiliza el guardado o crea uno con metadata.user_id.
 * Guardar stripe_customer_id exige la clave de servicio (el usuario no puede escribir entitlements):
 * se escribe solo esa columna y solo si estaba vacía.
 */
export async function ensureCustomer(stripe: Stripe, user: { id: string; email: string; name: string }, existing: string | null): Promise<string> {
  if (existing) return existing;
  const customer = await stripe.customers.create({ email: user.email, name: user.name || undefined, metadata: { user_id: user.id } });
  const admin = createAdminClient();
  const { data, error } = await admin.from("entitlements").update({ stripe_customer_id: customer.id, updated_at: new Date().toISOString() })
    .eq("user_id", user.id).is("stripe_customer_id", null).select("stripe_customer_id");
  if (error) throw new Error("No se pudo guardar el cliente de Stripe");
  if (data?.length) return customer.id;
  // Otra petición lo guardó primero: se usa ese.
  const { data: row, error: e2 } = await admin.from("entitlements").select("stripe_customer_id").eq("user_id", user.id).single();
  if (e2 || !row?.stripe_customer_id) throw new Error("No se pudo leer el cliente de Stripe");
  return row.stripe_customer_id;
}

/** Suscripción de Stripe → la forma mínima que entiende mapSubscription (el fin del periodo vive en los ítems desde 2025). */
export function toSubLike(sub: Stripe.Subscription): SubLike {
  const items = sub.items?.data ?? [];
  const ends = items.map((i) => i.current_period_end).filter((n): n is number => typeof n === "number");
  return {
    id: sub.id,
    status: sub.status,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    cancel_at: sub.cancel_at ?? null,
    current_period_end: ends.length ? Math.max(...ends) : null,
    interval: items[0]?.price?.recurring?.interval ?? null,
  };
}

export const customerId = (c: string | { id: string } | null | undefined) => (typeof c === "string" ? c : c?.id ?? null);

// ───────── Un solo plan en USD: configuración y precios ─────────
type Db = Pick<ReturnType<typeof createAdminClient>, "from">;

/**
 * `app_config.billing` → montos del plan (con valores por defecto). Con la sesión del usuario (RLS deja leer app_config)
 * o con la clave de servicio en páginas públicas y avisos de Stripe.
 */
export async function loadBilling(db: Db): Promise<BillingConfig> {
  const { data, error } = await db.from("app_config").select("value").eq("key", "billing").maybeSingle();
  if (error) throw new Error(`db: ${error.message}`);
  return readBilling(data?.value);
}

/**
 * Ids de los precios de Stripe: fila 'DEFAULT' (USD) de price_regions. El de $1 vive en la columna nueva
 * `stripe_price_first` (migración 20261125000028_cobro.sql); se lee sin tipo hasta regenerar database.types.ts.
 */
export async function loadStripePrices(db: Db): Promise<StripePrices> {
  const { data, error } = await db.from("price_regions").select("*").eq("region", "DEFAULT").maybeSingle();
  if (error) throw new Error(`db: ${error.message}`);
  const row = (data ?? {}) as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" && x ? x : null);
  return { monthly: str(row.stripe_price_monthly), yearly: str(row.stripe_price_yearly), first: str(row.stripe_price_first) };
}

/**
 * Comprueba en Stripe que cada precio del pago diga lo mismo que Administración (monto, USD, frecuencia, activo).
 * Si el admin cambió un monto y nadie corrió stripe-setup, no se cobra un precio distinto al que ve el usuario.
 */
export async function pricesInSync(stripe: Stripe, plan: CheckoutPlan, interval: Interval, b: BillingConfig): Promise<boolean> {
  const want = plan.lineItems.map((li, i) => ({ id: li.price, cents: i === 0 ? (interval === "year" ? b.yearlyCents : b.monthlyCents) : b.firstMonthCents, kind: (i === 0 ? interval : "once") as Interval | "once" }));
  const got = await Promise.all(want.map((w) => stripe.prices.retrieve(w.id).catch(() => null)));
  return want.every((w, i) => {
    const p = got[i];
    return priceMatches(p ? { unit_amount: p.unit_amount, currency: p.currency, active: p.active, recurring: p.recurring ? { interval: p.recurring.interval } : null } : null, w.cents, w.kind);
  });
}
