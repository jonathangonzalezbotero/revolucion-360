// Prepara Stripe en MODO PRUEBA para Revolución 360 (ver docs/STRIPE.md). Un solo plan en USD (desde el 25 nov 2026).
// Uso: npx tsx scripts/stripe-setup.ts   (lee .env; se niega a correr si la clave no empieza con sk_test_)
//
// 1. Crea (o reutiliza) el producto "Revolución 360" (el plan) y el producto "Revolución 360 · Primer mes" (el cargo único de $1;
//    va aparte para que un cupón aplicado al plan no lo descuente).
// 2. Lee los montos de app_config.billing (first_month_cents, monthly_cents, yearly_cents; por defecto $1, $8 y $80) y crea
//    (o reutiliza) 3 precios en USD con lookup_key r360_plan_usd_month | r360_plan_usd_year | r360_plan_usd_first.
//    Si cambió un monto, crea el precio nuevo, le pasa la lookup_key y desactiva el viejo: las suscripciones existentes siguen con el suyo.
// 3. Guarda los ids (y los montos) en la fila 'DEFAULT' de price_regions: stripe_price_monthly, stripe_price_yearly y
//    stripe_price_first (columna de la migración 20261125000028_cobro.sql). Solo esa fila; nunca borra nada.
// 4. Crea en Stripe los cupones de la tabla coupons que aún no tienen stripe_promo_id (cupón + código de promoción, con su
//    vencimiento; los vencidos se omiten). Los cupones nuevos aplican SOLO al producto del plan (no al $1).
// Se puede correr varias veces: no duplica nada. Los productos y precios viejos ("Revolución 360 Pro", por región) se conservan.
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { BILLING_CURRENCY, couponExpired, readBilling, toStripeAmount } from "../src/app/(app)/suscripcion/lib";

process.loadEnvFile(".env");
const KEY = (process.env.STRIPE_SECRET_KEY ?? "").trim();
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!KEY.startsWith("sk_test_")) throw new Error("stripe-setup solo corre con una clave de PRUEBA (sk_test_…). Nunca con claves de producción.");
if (!URL || !SERVICE) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env");

const stripe = new Stripe(KEY, { appInfo: { name: "Revolucion 360 setup" } });
const db = createClient(URL, SERVICE, { auth: { persistSession: false } });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const must = (r: { data: any; error: { message: string } | null }): any => { if (r.error) throw new Error(r.error.message); return r.data; };

const PLAN_TAG = "revolucion360_plan";
const FIRST_TAG = "revolucion360_first";

async function product(tag: string, name: string): Promise<string> {
  // list (no search): la búsqueda de Stripe tarda en indexar y una segunda corrida podría duplicar el producto.
  for await (const p of stripe.products.list({ active: true, limit: 100 })) if (p.metadata?.app === tag) return p.id;
  const created = await stripe.products.create({ name, metadata: { app: tag } });
  console.log(`Producto "${name}" creado:`, created.id);
  return created.id;
}

type Kind = "month" | "year" | "first";
async function price(productId: string, kind: Kind, cents: number): Promise<string> {
  const lookup = `r360_plan_usd_${kind}`;
  const cur = BILLING_CURRENCY.toLowerCase();
  const amount = toStripeAmount(cents, BILLING_CURRENCY);
  const interval = kind === "first" ? null : kind;
  const list = await stripe.prices.list({ lookup_keys: [lookup], active: true, limit: 1 });
  const p = list.data[0];
  const same = p && p.unit_amount === amount && p.currency === cur && (typeof p.product === "string" ? p.product : p.product.id) === productId
    && (interval ? p.recurring?.interval === interval : !p.recurring);
  if (same) return p.id;
  const created = await stripe.prices.create({
    product: productId, currency: cur, unit_amount: amount, ...(interval ? { recurring: { interval } } : {}),
    lookup_key: lookup, transfer_lookup_key: true,
    nickname: kind === "month" ? "Mensual (USD)" : kind === "year" ? "Anual (USD)" : "Primer mes (USD, cargo único)",
    metadata: { app: PLAN_TAG, kind },
  });
  if (p) await stripe.prices.update(p.id, { active: false });
  console.log(`Precio ${kind}:`, created.id);
  return created.id;
}

async function main() {
  const planProduct = await product(PLAN_TAG, "Revolución 360");
  const firstProduct = await product(FIRST_TAG, "Revolución 360 · Primer mes");

  const cfg = must(await db.from("app_config").select("value").eq("key", "billing").maybeSingle()) as { value: unknown } | null;
  const b = readBilling(cfg?.value);
  if (!cfg) console.log("app_config.billing no existe aún (¿aplicaste la migración 20261125000028_cobro.sql?): se usan $1, $8 y $80.");
  if (b.firstMonthCents <= 0) throw new Error("first_month_cents debe ser mayor que 0 (Stripe no acepta un cargo único de $0).");

  const patch = {
    monthly_cents: b.monthlyCents,
    yearly_cents: b.yearlyCents,
    stripe_price_monthly: await price(planProduct, "month", b.monthlyCents),
    stripe_price_yearly: await price(planProduct, "year", b.yearlyCents),
    stripe_price_first: await price(firstProduct, "first", b.firstMonthCents),
  };
  // Solo la fila DEFAULT (USD). `stripe_price_first` es columna nueva: sin tipo hasta regenerar database.types.ts.
  const upd = must(await db.from("price_regions").update(patch as never).eq("region", "DEFAULT").select("region")) as unknown[];
  if (!upd.length) must(await db.from("price_regions").insert({ region: "DEFAULT", currency: BILLING_CURRENCY, ...patch } as never).select("region"));
  console.log("Fila DEFAULT de price_regions actualizada.");

  const coupons = must(await db.from("coupons").select("*").is("stripe_promo_id", null).eq("active", true)) as { id: string; code: string; percent_off: number; duration_months: number | null; max_redemptions: number | null; stripe_coupon_id: string | null; expires_at: string | null }[];
  for (const c of coupons) {
    // Stripe no acepta un código que ya venció: se omite (en la app ya no se puede usar).
    if (couponExpired(c.expires_at)) { console.log(`Cupón ${c.code}: ya venció, se omite.`); continue; }
    const couponId = c.stripe_coupon_id ?? (await stripe.coupons.create({
      percent_off: c.percent_off, name: c.code,
      applies_to: { products: [planProduct] }, // al precio recurrente, nunca al cargo de $1
      ...(c.duration_months ? { duration: "repeating" as const, duration_in_months: c.duration_months } : { duration: "forever" as const }),
      ...(c.max_redemptions ? { max_redemptions: c.max_redemptions } : {}),
      metadata: { app: PLAN_TAG, coupon_row: c.id },
    })).id;
    const promo = await stripe.promotionCodes.create({
      promotion: { type: "coupon", coupon: couponId }, code: c.code, metadata: { app: PLAN_TAG },
      ...(c.expires_at ? { expires_at: Math.floor(Date.parse(c.expires_at) / 1000) } : {}),
    });
    must(await db.from("coupons").update({ stripe_coupon_id: couponId, stripe_promo_id: promo.id }).eq("id", c.id).select("id"));
    console.log(`Cupón ${c.code}:`, promo.id);
  }

  console.log("Listo. Stripe (modo prueba) quedó configurado: un solo plan en USD.");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
