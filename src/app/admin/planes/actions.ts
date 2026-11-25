"use server";
import type Stripe from "stripe";
import { z } from "zod";
import { getStripe } from "@/lib/stripe";
import type { Json } from "@/lib/supabase/database.types";
import { fail, ok } from "@/server/action";
import { must } from "@/server/data";
import type { Session } from "@/server/session";
import { couponExpired } from "@/app/(app)/suscripcion/lib";
import { adminAction, adminText, audit } from "../_shared/server";
import { checkBilling, checkCoupon, mergeBilling, stripeExpiry, type CouponData } from "./lib";
import { M } from "./messages";

const PATHS = ["/admin/planes", "/admin/actividad", "/admin", "/suscripcion"];
// Igual que scripts/stripe-setup.ts: así el script reconoce lo que crea esta pantalla.
const PRODUCT_TAG = "revolucion360_pro";

const SaveBody = z.object({ first: z.string().max(30), monthly: z.string().max(30), yearly: z.string().max(30), notifyDays: z.string().max(4) });

type StripeStatus = "ok" | "pending" | "off";
/** Acción del registro por cada clave de `billing` (empiezan por "plan": caen en el filtro "Precios"). */
const AUDIT_BILLING = { first_month_cents: "plan_precio_primer_mes", monthly_cents: "plan_precio_mensual", yearly_cents: "plan_precio_anual", notify_before_days: "plan_aviso_cobro" } as const;

/**
 * Guarda los precios en USD y los días de aviso en `app_config.billing`, mezclando con lo guardado
 * (conserva `notify_first_charge` y lo que el cobro agregue). El cobro lee esta clave al crear el pago en Stripe:
 * un cambio solo aplica a suscripciones nuevas.
 */
export async function saveBilling(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const m = M[s.locale], t = adminText(s);
    const p = SaveBody.safeParse(input);
    if (!p.success) return fail(t.errors.generic);
    const c = checkBilling(p.data);
    if (!c.ok) return fail(m.errors[c.error]);
    const row = must(await s.supabase.from("app_config").select("value").eq("key", "billing").maybeSingle());
    const { value, changed } = mergeBilling(row?.value, c.values);
    if (!changed.length) return ok({ changed: 0 });
    must(await s.supabase.from("app_config").upsert({ key: "billing", value: value as NonNullable<Json>, updated_at: new Date().toISOString() }, { onConflict: "key" }).select("key").single());
    // Una línea por precio que cambió (así se lee en el registro); nunca montos.
    for (const k of changed) await audit(s, AUDIT_BILLING[k as keyof typeof AUDIT_BILLING] ?? "plan_precios", null, {});
    return ok({ changed: changed.length });
  });
}

type CouponRow = Omit<CouponData, "applies_to"> & { id: string; active: boolean; stripe_coupon_id: string | null; stripe_promo_id: string | null };

/** Crea el cupón y su código de promoción en Stripe, guardando cada id apenas existe (igual que el script). */
async function pushToStripe(s: Session, stripe: Stripe, c: CouponRow): Promise<void> {
  const couponId = c.stripe_coupon_id ?? (await stripe.coupons.create({
    percent_off: c.percent_off, name: c.code,
    ...(c.duration_months ? { duration: "repeating" as const, duration_in_months: c.duration_months } : { duration: "forever" as const }),
    ...(c.max_redemptions ? { max_redemptions: c.max_redemptions } : {}),
    metadata: { app: PRODUCT_TAG, coupon_row: c.id },
  })).id;
  if (!c.stripe_coupon_id) must(await s.supabase.from("coupons").update({ stripe_coupon_id: couponId }).eq("id", c.id).select("id").single());
  const promo = await stripe.promotionCodes.create({ promotion: { type: "coupon", coupon: couponId }, code: c.code, active: c.active, ...stripeExpiry(c.expires_at), metadata: { app: PRODUCT_TAG } });
  must(await s.supabase.from("coupons").update({ stripe_promo_id: promo.id }).eq("id", c.id).select("id").single());
}

/** Crea un cupón. Primero en la base; luego en Stripe si está conectado (si falla, queda para el script). */
export async function createCoupon(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const m = M[s.locale], t = adminText(s);
    const p = z.object({ code: z.string().max(60), pct: z.string().max(5), months: z.string().max(5), max: z.string().max(8), appliesTo: z.string().max(10), until: z.string().max(20) }).safeParse(input);
    if (!p.success) return fail(t.errors.generic);
    const c = checkCoupon(p.data, s.today);
    if (!c.ok) return fail(m.errors[c.error]);
    const { data: row, error } = await s.supabase.from("coupons").insert(c.coupon).select("id, code, percent_off, duration_months, max_redemptions, expires_at, active, stripe_coupon_id, stripe_promo_id").single();
    if (error?.code === "23505") return fail(m.errors.taken);
    if (error || !row) throw new Error(error?.message ?? "cupón");
    await audit(s, "cupon_crear", null, { code: row.code, pct: row.percent_off, months: row.duration_months ?? undefined, applies: c.coupon.applies_to, until: row.expires_at ?? undefined });
    const stripe = getStripe();
    if (!stripe) return ok<{ stripe: StripeStatus }>({ stripe: "off" });
    try {
      await pushToStripe(s, stripe, row);
      return ok<{ stripe: StripeStatus }>({ stripe: "ok" });
    } catch (e) {
      console.error("[admin-cupon]", e instanceof Error ? e.message : "error"); // sin montos ni datos personales
      return ok<{ stripe: StripeStatus }>({ stripe: "pending" });
    }
  });
}

/** Crea en Stripe un cupón que quedó pendiente (sin código de promoción). */
export async function pushCoupon(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const m = M[s.locale], t = adminText(s);
    const p = z.object({ id: z.string().uuid() }).safeParse(input);
    if (!p.success) return fail(t.errors.generic);
    const row = must(await s.supabase.from("coupons").select("id, code, percent_off, duration_months, max_redemptions, expires_at, stripe_coupon_id, stripe_promo_id, active").eq("id", p.data.id).single());
    if (row.stripe_promo_id) return ok(undefined);
    if (couponExpired(row.expires_at)) return fail(m.errors.expired); // Stripe no acepta un código que ya venció
    const stripe = getStripe();
    if (!stripe) return fail(m.errors.stripeOff);
    try {
      await pushToStripe(s, stripe, row); // un cupón pausado nace pausado en Stripe
    } catch (e) {
      console.error("[admin-cupon]", e instanceof Error ? e.message : "error");
      return fail(m.errors.stripe);
    }
    await audit(s, "cupon_stripe", null, { code: row.code });
    return ok(undefined);
  });
}

/** Pausa o activa un cupón. Nunca se borra. El checkout valida el código en Stripe, así que se cambia allá primero. */
export async function setCouponActive(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const m = M[s.locale], t = adminText(s);
    const p = z.object({ id: z.string().uuid(), active: z.boolean() }).safeParse(input);
    if (!p.success) return fail(t.errors.generic);
    const row = must(await s.supabase.from("coupons").select("id, code, stripe_promo_id").eq("id", p.data.id).single());
    if (row.stripe_promo_id) {
      const stripe = getStripe();
      if (!stripe) return fail(m.errors.stripeOff);
      try {
        await stripe.promotionCodes.update(row.stripe_promo_id, { active: p.data.active });
      } catch (e) {
        console.error("[admin-cupon]", e instanceof Error ? e.message : "error");
        return fail(m.errors.stripe);
      }
    }
    must(await s.supabase.from("coupons").update({ active: p.data.active }).eq("id", row.id).select("id").single());
    await audit(s, p.data.active ? "cupon_activar" : "cupon_pausar", null, { code: row.code });
    return ok(undefined);
  });
}
