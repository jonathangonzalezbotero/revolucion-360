import type Stripe from "stripe";
import { z } from "zod";
import { appUrl, ensureCustomer, getStripe } from "@/lib/stripe";
import { getSession } from "@/server/session";
import { couponUsable, isPaying, isStudent, pickRegion, stripePriceFor, studentCouponId, type Grant, type PriceRegion } from "@/app/(app)/suscripcion/lib";
import { M } from "@/app/(app)/suscripcion/messages";

export const dynamic = "force-dynamic";

const Body = z.object({ interval: z.enum(["month", "year"]), coupon: z.string().trim().max(40).optional().default("") });
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

/**
 * POST /api/stripe/checkout { interval, coupon? } → { url } de Stripe Checkout (modo suscripción).
 * Exige sesión. Funciona también en solo lectura (es la forma de reactivar Pro). La tarjeta la maneja Stripe.
 * El estado del plan NO cambia aquí: lo cambia el aviso firmado de Stripe (webhook).
 */
export async function POST(request: Request) {
  const s = await getSession();
  if (!s) return json({ error: "Tu sesión terminó. Vuelve a entrar." }, 401);
  const m = M[s.locale].errors;
  const stripe = getStripe();
  if (!stripe) return json({ error: m.notActive }, 503);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: s.t.errors.generic }, 400);
  const { interval, coupon } = parsed.data;

  try {
    const [entRes, regionsRes, grantsRes] = await Promise.all([
      s.supabase.from("entitlements").select("stripe_customer_id, stripe_subscription_id, stripe_status").eq("user_id", s.userId).maybeSingle(),
      s.supabase.from("price_regions").select("*"),
      s.supabase.from("access_grants").select("kind, expires_at, revoked_at").eq("user_id", s.userId),
    ]);
    if (entRes.error || regionsRes.error || grantsRes.error) throw new Error("lectura");
    const ent = entRes.data;
    // Ya paga: se gestiona en el Portal, nunca una segunda suscripción.
    if (ent?.stripe_subscription_id && isPaying(ent.stripe_status)) return json({ error: m.alreadyPro }, 409);

    const region = pickRegion(s.profile.country, regionsRes.data as PriceRegion[]);
    const price = stripePriceFor(region, interval);
    if (!price) return json({ error: m.noPrice }, 409);

    let discounts: Stripe.Checkout.SessionCreateParams.Discount[] | undefined;
    if (coupon) {
      // La regla de frecuencia solo la conoce la tabla `coupons` (Stripe no la sabe). La función `coupon_rule`
      // devuelve solo `applies_to` y `expires_at` de ese código, con la sesión del usuario (sin clave de servicio).
      // Un código que existe en Stripe pero no en la tabla no tiene regla de frecuencia: lo valida solo Stripe.
      const rule = await s.supabase.rpc("coupon_rule" as never, { p_code: coupon } as never) as { data: { applies_to: string; expires_at: string | null }[] | null; error: unknown };
      if (rule.error) throw new Error("lectura cupón");
      const row = rule.data?.[0];
      if (row) {
        const use = couponUsable(row, interval);
        if (use === "expired") return json({ error: m.couponExpired }, 400);
        if (use === "interval") return json({ error: interval === "year" ? m.couponMonthly : m.couponYearly }, 400);
      }
      const promo = await stripe.promotionCodes.list({ code: coupon, active: true, limit: 1 });
      if (!promo.data[0]) return json({ error: m.badCoupon }, 400);
      discounts = [{ promotion_code: promo.data[0].id }];
    } else if (region && region.student_discount_pct > 0 && isStudent(grantsRes.data as Grant[])) {
      discounts = [{ coupon: studentCouponId(region.student_discount_pct) }];
    }

    const customer = await ensureCustomer(stripe, { id: s.userId, email: s.profile.email, name: s.profile.name }, ent?.stripe_customer_id ?? null);
    const base = appUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: s.userId,
      line_items: [{ price, quantity: 1 }],
      // Sin campo de códigos en Stripe: el cupón se escribe en la app, donde se revisa su frecuencia y vencimiento.
      ...(discounts ? { discounts } : {}),
      subscription_data: { metadata: { user_id: s.userId } },
      metadata: { user_id: s.userId },
      locale: s.locale === "en" ? "en" : "es",
      success_url: `${base}/suscripcion?estado=ok`,
      cancel_url: `${base}/suscripcion?estado=cancelado`,
    });
    if (!session.url) throw new Error("sin url");
    return json({ url: session.url });
  } catch (e) {
    console.error("[stripe-checkout]", e instanceof Error ? e.message : "error"); // sin montos ni datos personales
    return json({ error: s.t.errors.generic }, 500);
  }
}
