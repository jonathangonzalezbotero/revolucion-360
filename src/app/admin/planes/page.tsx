import type { Metadata } from "next";
import { fill } from "@/i18n";
import { formatMoney } from "@/lib/engine";
import { getStripe } from "@/lib/stripe";
import { fetchAll, must } from "@/server/data";
import { requireAdmin } from "@/server/session";
import { discounted, toStripeAmount, yearlySavingsPct } from "@/app/(app)/suscripcion/lib";
import css from "../_shared/admin.module.css";
import { A } from "../_shared/messages";
import { PLAN_FEATURES, centsToInput, currencyFmt, priceSync, regionSync, sortRegions, tierOf } from "./lib";
import { M } from "./messages";
import { PlansView, type CouponView, type RegionView } from "./PlansView";

export const metadata: Metadata = { title: "Planes y precios" };
const MAX_STRIPE_LOOKUPS = 100;

type StripePrice = { amount: number | null; currency: string } | null;

export default async function AdminPlanes() {
  const s = await requireAdmin();
  const t = A[s.locale], m = M[s.locale];
  const [regionsRes, coupons] = await Promise.all([
    s.supabase.from("price_regions").select("*"),
    fetchAll((a, b) => s.supabase.from("coupons").select("*").order("created_at", { ascending: false }).order("id").range(a, b)),
  ]);
  const regions = sortRegions(must(regionsRes));

  // ── Stripe (solo lectura): ¿los precios guardados coinciden con los montos? ¿cuántas veces se usó cada código? ──
  const stripe = getStripe();
  const prices = new Map<string, StripePrice>();
  const promos = new Map<string, number>();
  if (stripe) {
    const priceIds = [...new Set(regions.flatMap((r) => [r.stripe_price_monthly, r.stripe_price_yearly]).filter((x): x is string => !!x))].slice(0, MAX_STRIPE_LOOKUPS);
    const promoIds = coupons.map((c) => c.stripe_promo_id).filter((x): x is string => !!x).slice(0, MAX_STRIPE_LOOKUPS);
    await Promise.all([
      ...priceIds.map(async (id) => {
        try {
          const p = await stripe.prices.retrieve(id);
          prices.set(id, p.active ? { amount: p.unit_amount, currency: p.currency } : null);
        } catch { /* sin respuesta: queda "no pudimos revisar" */ }
      }),
      ...promoIds.map(async (id) => {
        try { promos.set(id, (await stripe.promotionCodes.retrieve(id)).times_redeemed); } catch { /* se muestra solo el tope */ }
      }),
    ]);
  }
  const stripeState = (id: string | null): StripePrice | undefined => (id ? (prices.has(id) ? prices.get(id)! : undefined) : null);

  const regionRows: RegionView[] = regions.map((r) => {
    const fmt = currencyFmt(r.currency);
    const expect = (c: number | null) => (c ? toStripeAmount(c, r.currency) : null);
    const sync = stripe
      ? regionSync([
        priceSync(r.monthly_cents, r.stripe_price_monthly, stripeState(r.stripe_price_monthly), expect(r.monthly_cents), r.currency),
        priceSync(r.yearly_cents, r.stripe_price_yearly, stripeState(r.stripe_price_yearly), expect(r.yearly_cents), r.currency),
      ])
      : (r.monthly_cents || r.yearly_cents ? null : "none");
    const savings = yearlySavingsPct(r.monthly_cents, r.yearly_cents);
    const info = [
      savings ? fill(m.prices.savings, { pct: savings }) : "",
      r.student_discount_pct > 0 && r.monthly_cents ? fill(m.prices.studentPrice, { amount: formatMoney(discounted(r.monthly_cents, r.student_discount_pct), fmt) }) : "",
      sync ? m.prices.sync[sync] : "",
    ].filter(Boolean).join(" · ");
    return {
      region: r.region, name: m.prices.names[r.region.toUpperCase()] ?? r.region, currency: r.currency,
      monthly: centsToInput(r.monthly_cents), yearly: centsToInput(r.yearly_cents), student: String(r.student_discount_pct),
      info, pending: sync === "pending",
    };
  });

  const couponRows: CouponView[] = coupons.map((c) => {
    const pct = c.percent_off, n = c.duration_months;
    const used = c.stripe_promo_id ? promos.get(c.stripe_promo_id) : undefined;
    return {
      id: c.id, code: c.code, active: c.active, inStripe: !!c.stripe_promo_id,
      discount: !n ? fill(m.cup.forever, { pct }) : n === 1 ? fill(m.cup.forOne, { pct }) : fill(m.cup.forMonths, { pct, n }),
      uses: `${used ?? t.none} / ${c.max_redemptions ?? m.cup.unlimited}`,
    };
  });

  const features = Object.fromEntries(PLAN_FEATURES.map((k) => [k, tierOf(s.config.features, k)]));

  return (
    <main className={css.page}>
      {/* La clave cambia cuando cambia lo guardado: después de guardar, el formulario arranca de los valores nuevos. */}
      <PlansView key={JSON.stringify([regionRows.map((r) => [r.region, r.monthly, r.yearly, r.student]), s.config.trial, features])} m={m} stripeOn={!!stripe} regions={regionRows} coupons={couponRows}
        trial={{ enabled: s.config.trial.enabled !== false, days: String(s.config.trial.days ?? 14) }}
        features={features} freeGoals={s.config.limits.free_goals} />
    </main>
  );
}
