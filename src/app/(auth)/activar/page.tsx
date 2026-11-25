import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { fill } from "@/i18n";
import { formatDate, todayIn } from "@/lib/engine";
import { customerId, getStripe, loadBilling, loadStripePrices, stripeReady } from "@/lib/stripe";
import { must } from "@/server/data";
import { requireUser } from "@/server/session";
import { firstMonthApplies, freeMonths, isPaying, monthlyEquivalent, renewalDate, usdFull, usdShort, type Interval } from "@/app/(app)/suscripcion/lib";
import { Activate, AwaitActivation, type PlanOption } from "./Activate";
import { M } from "./messages";

export const metadata: Metadata = { title: "Activa tu cuenta" };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * /activar — "Activa tu cuenta" (Acceso.dc.html, paso de pago), dentro del layout de acceso (bloque oscuro permitido).
 * La ven: sin activar (free), solo lectura (reactivar) y alumno/fundador con fecha (pagar antes de que venza).
 * Toda otra ruta de la app manda aquí a quien no ha activado (requireUser). El estado lo cambia solo el aviso de Stripe.
 * ?pago=<id de la sesión de Checkout>: vuelta de Stripe. ?plan=anual: llega con el anual elegido.
 */
export default async function ActivarPage({ searchParams }: { searchParams: Search }) {
  const s = await requireUser({ allowOnboarding: true });
  const m = M[s.locale];
  const q = await searchParams;
  const e = s.entitlement;
  const gift = s.plan === "alumno" || s.plan === "fundador";
  // Ya activa: nada que pagar aquí (quien paga gestiona en /suscripcion).
  if (s.plan === "pro" || s.plan === "trial" || (gift && !e.accessUntil)) redirect("/inicio");

  const ent = must(await s.supabase.from("entitlements").select("stripe_customer_id, stripe_subscription_id").eq("user_id", s.userId).maybeSingle());
  const stripe = getStripe();
  let initialError = "";
  let confirming = false;

  // Vuelta de Stripe: si el pago se completó, esperamos el aviso (webhook) y la página redirige sola cuando la cuenta queda activa.
  const pago = one(q.pago);
  if (pago && stripe && ent?.stripe_customer_id && /^cs_[A-Za-z0-9_]+$/.test(pago)) {
    try {
      const cs = await stripe.checkout.sessions.retrieve(pago);
      if (customerId(cs.customer) === ent.stripe_customer_id) {
        if (cs.status === "complete") confirming = true;
        else initialError = m.notComplete;
      }
    } catch {
      initialError = m.notComplete;
    }
  }

  // Pagó pero el aviso de Stripe aún no llega (sigue sin activar): nunca se le ofrece pagar de nuevo.
  if (!confirming && stripe && ent?.stripe_customer_id && s.plan === "free") {
    try {
      const subs = await stripe.subscriptions.list({ customer: ent.stripe_customer_id, status: "all", limit: 10 });
      confirming = subs.data.some((x) => isPaying(x.status));
    } catch {
      // Stripe no respondió: se muestra el pago; la ruta de pago vuelve a revisar antes de cobrar.
    }
  }
  if (confirming) return <Head title={m.title} lead=""><AwaitActivation m={m} /></Head>;

  const [billing, prices] = await Promise.all([loadBilling(s.supabase), loadStripePrices(s.supabase)]);
  const first = firstMonthApplies(s.plan, !!ent?.stripe_subscription_id);
  const tz = s.profile.timezone || "Australia/Sydney";
  const day = (d: Date) => formatDate(todayIn(tz, d), s.locale);
  const price = usdShort(billing.monthlyCents), yearly = usdShort(billing.yearlyCents), firstP = usdShort(billing.firstMonthCents);
  const free = freeMonths(billing.monthlyCents, billing.yearlyCents);
  const options: Record<Interval, PlanOption> = {
    month: {
      label: m.monthly, badge: "",
      sub: first ? fill(m.monthlyFirst, { first: firstP, price }) : fill(m.monthlyPlain, { price }),
      big: first ? firstP : price,
      today: usdFull(first ? billing.firstMonthCents : billing.monthlyCents),
      then: first
        ? fill(m.thenFirst, { date: day(renewalDate("month", true)), price, days: billing.notifyBeforeDays })
        : fill(m.thenMonthly, { date: day(renewalDate("month", false)) }),
    },
    year: {
      label: m.yearly, badge: free === 1 ? m.yearlyBadgeOne : free > 1 ? fill(m.yearlyBadge, { n: free }) : "",
      sub: fill(m.yearlySub, { perMonth: usdShort(monthlyEquivalent(billing.yearlyCents)) }),
      big: yearly,
      today: usdFull(billing.yearlyCents),
      then: fill(m.thenYearly, { date: day(renewalDate("year", false)) }),
    },
  };

  const publishableKey = (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "").trim() || null;
  const paymentsActive = stripeReady() && !!publishableKey && !!prices.monthly && !!prices.yearly && (!first || !!prices.first);
  const back = s.plan !== "free" || !first;
  const title = back && !gift ? m.titleBack : m.title;
  const lead = gift && e.accessUntil ? fill(m.giftNote, { date: day(new Date(e.accessUntil)) })
    : back ? fill(m.leadBack, { price, yearly }) : fill(m.lead, { first: firstP, price });

  return (
    <Head title={title} lead={lead}>
      <Activate m={m} options={options} initial={one(q.plan) === "anual" ? "year" : "month"} publishableKey={publishableKey} paymentsActive={paymentsActive} initialError={initialError} />
    </Head>
  );
}

function Head({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h1 style={{ fontSize: 30 }}>{title}</h1>
        {lead ? <p className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>{lead}</p> : null}
      </div>
      {children}
    </div>
  );
}
