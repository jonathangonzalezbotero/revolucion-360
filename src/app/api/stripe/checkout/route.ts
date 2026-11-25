import type Stripe from "stripe";
import { z } from "zod";
import { appUrl, ensureCustomer, getStripe, loadBilling, loadStripePrices, pricesInSync } from "@/lib/stripe";
import { getSession } from "@/server/session";
import { checkoutPlan, couponUsable, firstMonthApplies, isPaying } from "@/app/(app)/suscripcion/lib";
import { M } from "@/app/(app)/suscripcion/messages";

export const dynamic = "force-dynamic";

const Body = z.object({ interval: z.enum(["month", "year"]), coupon: z.string().trim().max(40).optional().default("") });
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

/**
 * POST /api/stripe/checkout { interval, coupon? } → { clientSecret } de Stripe Embedded Checkout (la tarjeta se pone dentro de /activar).
 * Un solo plan en USD:
 * - mensual: suscripción de $8 con 30 días de prueba + cargo único de $1 en el mismo pago (solo la primera vez: ver firstMonthApplies).
 * - anual: suscripción de $80 sin prueba.
 * El cupón se escribe en la app (se revisa su frecuencia y vencimiento) y se aplica con un código de promoción.
 * Exige sesión. Funciona en sin activar y en solo lectura (es la forma de reactivar). El estado NO cambia aquí: lo cambia el aviso de Stripe.
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
    const [entRes, billing, prices] = await Promise.all([
      s.supabase.from("entitlements").select("state, stripe_customer_id, stripe_subscription_id, stripe_status").eq("user_id", s.userId).maybeSingle(),
      loadBilling(s.supabase),
      loadStripePrices(s.supabase),
    ]);
    if (entRes.error) throw new Error("lectura");
    const ent = entRes.data;
    // Ya paga: se gestiona en /suscripcion, nunca una segunda suscripción.
    if (ent?.stripe_subscription_id && isPaying(ent.stripe_status)) return json({ error: m.alreadyPro }, 409);
    // Acceso gratis de por vida: no necesita pagar. Uno con fecha sí puede pagar antes de que venza (empieza a pagar hoy).
    if ((s.plan === "alumno" || s.plan === "fundador") && !s.entitlement.accessUntil) return json({ error: m.alreadyActive }, 409);

    // El aviso de Stripe puede tardar: si el cliente ya tiene una suscripción viva, no se abre otra.
    if (ent?.stripe_customer_id) {
      const live = await stripe.subscriptions.list({ customer: ent.stripe_customer_id, status: "all", limit: 10 });
      if (live.data.some((x) => isPaying(x.status))) return json({ error: m.alreadyPro }, 409);
    }

    const first = firstMonthApplies(s.plan, !!ent?.stripe_subscription_id);
    const plan = checkoutPlan(interval, first, prices, billing);
    if (!plan) return json({ error: m.notActive }, 503);
    if (!(await pricesInSync(stripe, plan, interval, billing))) {
      console.error("[stripe-checkout] precios de Stripe distintos a app_config.billing: correr scripts/stripe-setup.ts");
      return json({ error: m.notActive }, 503);
    }

    let discounts: Stripe.Checkout.SessionCreateParams.Discount[] | undefined;
    if (coupon) {
      // La regla de frecuencia solo la conoce la tabla `coupons` (Stripe no la sabe). `coupon_rule` devuelve solo
      // `applies_to` y `expires_at` de ese código, con la sesión del usuario (sin clave de servicio).
      const rule = await s.supabase.rpc("coupon_rule", { p_code: coupon });
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
    }

    const customer = await ensureCustomer(stripe, { id: s.userId, email: s.profile.email, name: s.profile.name }, ent?.stripe_customer_id ?? null);
    const session = await stripe.checkout.sessions.create({
      // "embedded_page" es el nombre de Embedded Checkout en la API que fija el SDK instalado (antes "embedded").
      ui_mode: "embedded_page",
      mode: "subscription",
      customer,
      client_reference_id: s.userId,
      line_items: plan.lineItems,
      // Sin campo de códigos en Stripe: el cupón se escribe en la app, donde se revisa su frecuencia y vencimiento.
      ...(discounts ? { discounts } : {}),
      subscription_data: {
        metadata: { user_id: s.userId },
        ...(plan.trialDays ? { trial_period_days: plan.trialDays } : {}),
      },
      metadata: { user_id: s.userId, interval, first_month: plan.firstMonth ? "1" : "0" },
      locale: s.locale === "en" ? "en" : "es",
      return_url: `${appUrl()}/activar?pago={CHECKOUT_SESSION_ID}`,
    });
    if (!session.client_secret) throw new Error("sin client_secret");
    return json({ clientSecret: session.client_secret });
  } catch (e) {
    console.error("[stripe-checkout]", e instanceof Error ? e.message : "error"); // sin montos ni datos personales
    return json({ error: s.t.errors.generic }, 500);
  }
}
