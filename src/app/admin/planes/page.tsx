import type { Metadata } from "next";
import { fill } from "@/i18n";
import { addDays, formatDate } from "@/lib/engine";
import { getStripe, loadStripePrices } from "@/lib/stripe";
import { fetchAll, must } from "@/server/data";
import { requireAdmin } from "@/server/session";
import { asAppliesTo } from "@/app/(app)/suscripcion/lib";
import css from "../_shared/admin.module.css";
import { A } from "../_shared/messages";
import { billingFrom, billingToInput, couponExpiry } from "./lib";
import { M } from "./messages";
import { PlansView, type CouponView } from "./PlansView";

export const metadata: Metadata = { title: "Planes y precios" };
const MAX_STRIPE_LOOKUPS = 100;

export default async function AdminPlanes() {
  const s = await requireAdmin();
  const t = A[s.locale], m = M[s.locale];
  const [billingRes, coupons] = await Promise.all([
    // `billing` puede no existir todavía: se muestran los valores aprobados ($1, $8, $80, 3 días).
    s.supabase.from("app_config").select("value").eq("key", "billing").maybeSingle(),
    fetchAll((a, b) => s.supabase.from("coupons").select("*").order("created_at", { ascending: false }).order("id").range(a, b)),
  ]);
  const billing = billingFrom(must(billingRes)?.value);

  // ── Stripe (solo lectura): cuántas veces se usó cada código ──
  const stripe = getStripe();
  const promos = new Map<string, number>();
  if (stripe) {
    const promoIds = coupons.map((c) => c.stripe_promo_id).filter((x): x is string => !!x).slice(0, MAX_STRIPE_LOOKUPS);
    await Promise.all(promoIds.map(async (id) => {
      try { promos.set(id, (await stripe.promotionCodes.retrieve(id)).times_redeemed); } catch { /* se muestra solo el tope */ }
    }));
  }

  // ¿Los precios de Stripe dicen lo mismo que esta pantalla? Si no, el pago se niega hasta correr scripts/stripe-setup.ts.
  let sync: "ok" | "pending" | "unknown" | null = null;
  if (stripe) {
    try {
      const ids = await loadStripePrices(s.supabase);
      const want = [[ids.first, billing.first_month_cents], [ids.monthly, billing.monthly_cents], [ids.yearly, billing.yearly_cents]] as const;
      if (want.some(([id]) => !id)) sync = "pending";
      else {
        const got = await Promise.all(want.map(([id]) => stripe.prices.retrieve(id!).catch(() => null)));
        sync = got.every((p, i) => !!p && p.active && p.unit_amount === want[i][1] && p.currency.toLowerCase() === "usd") ? "ok" : "pending";
      }
    } catch { sync = "unknown"; }
  }

  const now = new Date();
  const couponRows: CouponView[] = coupons.map((c) => {
    const pct = c.percent_off, n = c.duration_months;
    const used = c.stripe_promo_id ? promos.get(c.stripe_promo_id) : undefined;
    const exp = couponExpiry(c.expires_at, now);
    return {
      id: c.id, code: c.code, active: c.active, inStripe: !!c.stripe_promo_id,
      discount: !n ? fill(m.cup.forever, { pct }) : n === 1 ? fill(m.cup.forOne, { pct }) : fill(m.cup.forMonths, { pct, n }),
      uses: `${used ?? t.none} / ${c.max_redemptions ?? m.cup.unlimited}`,
      applies: m.cup.applies[asAppliesTo(c.applies_to)],
      until: exp.kind === "none" ? m.cup.noDate : formatDate(exp.day, s.locale),
      expired: exp.kind === "expired",
    };
  });
  const prices = billingToInput(billing);

  return (
    <main className={css.page}>
      {/* La clave cambia cuando cambia lo guardado: después de guardar, el formulario arranca de los valores nuevos. */}
      <PlansView key={JSON.stringify(prices)} m={m} stripeOn={!!stripe} prices={prices} sync={sync} coupons={couponRows} minUntil={addDays(s.today, 1)} />
    </main>
  );
}
