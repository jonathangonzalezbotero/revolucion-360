// Prepara Stripe en MODO PRUEBA para Revolución 360 (ver docs/STRIPE.md).
// Uso: npx tsx scripts/stripe-setup.ts   (lee .env; se niega a correr si la clave no empieza con sk_test_)
//
// 1. Crea (o reutiliza) el producto "Revolución 360 Pro".
// 2. Por cada región de price_regions con monto, crea (o reutiliza) los precios mensual y anual y guarda sus ids.
//    Los precios se identifican con lookup_key r360_pro_<región>_<month|year>; si cambió el monto, crea uno nuevo y le pasa la clave.
// 3. Crea los cupones de alumno (id alumno-<pct>) para cada student_discount_pct > 0.
// 4. Crea en Stripe los cupones de la tabla coupons que aún no tienen stripe_promo_id (cupón + código de promoción, con su vencimiento; los vencidos se omiten).
// Se puede correr varias veces: no duplica nada.
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { couponExpired, studentCouponId, toStripeAmount, type Interval } from "../src/app/(app)/suscripcion/lib";

process.loadEnvFile(".env");
const KEY = (process.env.STRIPE_SECRET_KEY ?? "").trim();
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!KEY.startsWith("sk_test_")) throw new Error("stripe-setup solo corre con una clave de PRUEBA (sk_test_…). Nunca con claves de producción.");
if (!URL || !SERVICE) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env");

const stripe = new Stripe(KEY, { appInfo: { name: "Revolucion 360 setup" } });
const db = createClient(URL, SERVICE, { auth: { persistSession: false } });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const must = (r: { data: any; error: { message: string } | null }): any => { if (r.error) throw new Error(r.error.message); return r.data; };

const PRODUCT_TAG = "revolucion360_pro";

async function product(): Promise<string> {
  // list (no search): la búsqueda de Stripe tarda en indexar y una segunda corrida podría duplicar el producto.
  for await (const p of stripe.products.list({ active: true, limit: 100 })) if (p.metadata?.app === PRODUCT_TAG) return p.id;
  const created = await stripe.products.create({ name: "Revolución 360 Pro", metadata: { app: PRODUCT_TAG } });
  console.log("Producto creado:", created.id);
  return created.id;
}

async function price(productId: string, region: string, currency: string, cents: number, interval: Interval): Promise<string> {
  const lookup = `r360_pro_${region.toLowerCase()}_${interval}`;
  const amount = toStripeAmount(cents, currency);
  const cur = currency.toLowerCase();
  const list = await stripe.prices.list({ lookup_keys: [lookup], active: true, limit: 1 });
  const p = list.data[0];
  if (p && p.unit_amount === amount && p.currency === cur && p.recurring?.interval === interval && (typeof p.product === "string" ? p.product : p.product.id) === productId) return p.id;
  const created = await stripe.prices.create({
    product: productId, currency: cur, unit_amount: amount, recurring: { interval },
    lookup_key: lookup, transfer_lookup_key: true, nickname: `Pro ${region} ${interval === "month" ? "mensual" : "anual"}`,
    metadata: { region, app: PRODUCT_TAG },
  });
  if (p) await stripe.prices.update(p.id, { active: false });
  console.log(`Precio ${region} ${interval}:`, created.id);
  return created.id;
}

async function studentCoupon(pct: number) {
  const id = studentCouponId(pct);
  try {
    await stripe.coupons.retrieve(id);
  } catch {
    await stripe.coupons.create({ id, percent_off: pct, duration: "forever", name: `Alumno ${pct}%`, metadata: { app: PRODUCT_TAG } });
    console.log("Cupón de alumno creado:", id);
  }
}

async function main() {
  const productId = await product();

  const regions = must(await db.from("price_regions").select("*")) as { region: string; currency: string; monthly_cents: number | null; yearly_cents: number | null; student_discount_pct: number }[];
  for (const r of regions) {
    const patch: Record<string, string> = {};
    if (r.monthly_cents && r.monthly_cents > 0) patch.stripe_price_monthly = await price(productId, r.region, r.currency, r.monthly_cents, "month");
    if (r.yearly_cents && r.yearly_cents > 0) patch.stripe_price_yearly = await price(productId, r.region, r.currency, r.yearly_cents, "year");
    if (Object.keys(patch).length) must(await db.from("price_regions").update(patch).eq("region", r.region).select("region"));
    else console.log(`Región ${r.region}: sin monto, se omite.`);
  }

  for (const pct of new Set(regions.map((r) => r.student_discount_pct).filter((p) => p > 0))) await studentCoupon(pct);

  const coupons = must(await db.from("coupons").select("*").is("stripe_promo_id", null).eq("active", true)) as { id: string; code: string; percent_off: number; duration_months: number | null; max_redemptions: number | null; stripe_coupon_id: string | null; expires_at: string | null }[];
  for (const c of coupons) {
    // Stripe no acepta un código que ya venció: se omite (en la app ya no se puede usar).
    if (couponExpired(c.expires_at)) { console.log(`Cupón ${c.code}: ya venció, se omite.`); continue; }
    const couponId = c.stripe_coupon_id ?? (await stripe.coupons.create({
      percent_off: c.percent_off, name: c.code,
      ...(c.duration_months ? { duration: "repeating" as const, duration_in_months: c.duration_months } : { duration: "forever" as const }),
      ...(c.max_redemptions ? { max_redemptions: c.max_redemptions } : {}),
      metadata: { app: PRODUCT_TAG, coupon_row: c.id },
    })).id;
    const promo = await stripe.promotionCodes.create({
      promotion: { type: "coupon", coupon: couponId }, code: c.code, metadata: { app: PRODUCT_TAG },
      ...(c.expires_at ? { expires_at: Math.floor(Date.parse(c.expires_at) / 1000) } : {}),
    });
    must(await db.from("coupons").update({ stripe_coupon_id: couponId, stripe_promo_id: promo.id }).eq("id", c.id).select("id"));
    console.log(`Cupón ${c.code}:`, promo.id);
  }

  console.log("Listo. Stripe (modo prueba) quedó configurado.");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
