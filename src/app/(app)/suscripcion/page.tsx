import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import type Stripe from "stripe";
import { fill } from "@/i18n";
import { Empty, PageHeader } from "@/components/ui/basics";
import { formatDate, formatMoney, todayIn } from "@/lib/engine";
import { getStripe, loadBilling, loadStripePrices, stripeReady, toSubLike } from "@/lib/stripe";
import { must } from "@/server/data";
import { requireUser } from "@/server/session";
import { BillingForm, CancelFlow, PlanCard, PortalButton, ResumeButton } from "./Client";
import { freeMonths, fromStripeAmount, invoiceConcept, isPaying, monthlyEquivalent, subView, usdFull, usdShort, type Grant } from "./lib";
import { M } from "./messages";
import css from "./suscripcion.module.css";

export const metadata: Metadata = { title: "Suscripción" };

type HistRow = { key: string; date: string; concept: string; amount: string; status: string; tone: "ok" | "warn" | "bad" | "neutral"; href: string | null; sort: number };

/**
 * Suscripción (docs/mockup/Suscripcion*.dc.html): un solo plan en USD, estado actual, método de pago, facturación, historial y cancelar.
 * Una cuenta sin activar no llega aquí (requireUser la lleva a /activar). Solo lectura ve el botón para reactivar.
 */
export default async function SuscripcionPage() {
  const s = await requireUser();
  if (s.plan === "free") redirect("/activar");
  const m = M[s.locale];
  const [entRes, grantsRes, billing, prices] = await Promise.all([
    s.supabase.from("entitlements").select("stripe_customer_id, stripe_subscription_id, stripe_status").eq("user_id", s.userId).maybeSingle(),
    s.supabase.from("access_grants").select("kind, expires_at, revoked_at, created_at").eq("user_id", s.userId).order("created_at", { ascending: false }),
    loadBilling(s.supabase),
    loadStripePrices(s.supabase),
  ]);
  const ent = must(entRes);
  const grants = must(grantsRes) as (Grant & { created_at: string })[];
  const e = s.entitlement;
  const tz = s.profile.timezone || "Australia/Sydney";
  const date = (ts: string | number | null | undefined) => (ts == null ? null : formatDate(todayIn(tz, new Date(typeof ts === "number" ? ts * 1000 : ts)), s.locale));
  const now = new Date();
  const ready = stripeReady();
  const paymentsActive = ready && !!prices.monthly && !!prices.yearly && !!prices.first;

  // ── Datos de Stripe (solo si hay clave y cliente). La tarjeta nunca pasa por la app: solo marca, últimos 4 y vencimiento. ──
  let card: { brand: string; last4: string; exp: string } | null = null;
  let billingName = s.profile.name, taxId = "";
  let invoices: Stripe.Invoice[] = [];
  let stripeError = false;
  // Lo que dice Stripe ahora (el aviso puede tardar unos segundos) y lo que de verdad paga (su precio, aunque Administración lo haya cambiado).
  let live: { cancel: boolean; end: number | null; status: string; interval: string | null; cents: number | null } | null = null;
  const stripe = getStripe();
  if (stripe && ent?.stripe_customer_id) {
    try {
      const [cust, inv, sub] = await Promise.all([
        stripe.customers.retrieve(ent.stripe_customer_id, { expand: ["invoice_settings.default_payment_method"] }),
        stripe.invoices.list({ customer: ent.stripe_customer_id, limit: 24 }),
        ent.stripe_subscription_id ? stripe.subscriptions.retrieve(ent.stripe_subscription_id, { expand: ["default_payment_method"] }) : Promise.resolve(null),
      ]);
      if (sub) {
        const l = toSubLike(sub);
        const item = sub.items?.data?.[0];
        const unit = item?.price?.unit_amount;
        live = { cancel: l.cancel_at_period_end || l.cancel_at != null, end: l.current_period_end, status: sub.status, interval: l.interval, cents: unit != null && item?.price?.currency === "usd" ? unit * (item.quantity ?? 1) : null };
      }
      invoices = inv.data.filter((i) => i.status && i.status !== "draft");
      if (!cust.deleted) {
        billingName = cust.name || billingName;
        taxId = (cust.metadata?.tax_id as string | undefined) ?? cust.invoice_settings?.custom_fields?.[0]?.value ?? "";
        const pm = [cust.invoice_settings?.default_payment_method, sub?.default_payment_method].find((x): x is Stripe.PaymentMethod => !!x && typeof x !== "string" && !!x.card);
        if (pm?.card) card = { brand: pm.card.brand, last4: pm.card.last4, exp: `${String(pm.card.exp_month).padStart(2, "0")}/${String(pm.card.exp_year).slice(-2)}` };
      }
    } catch (err) {
      console.error("[suscripcion]", err instanceof Error ? err.message : "error");
      stripeError = true;
    }
  }

  // ── Historial: accesos gratis ($0) + facturas de Stripe ──
  const hist: HistRow[] = [
    ...grants.map((g, i): HistRow => {
      const st = g.revoked_at ? "revoked" : g.expires_at && new Date(g.expires_at) <= now ? "expired" : "active";
      return { key: `g${i}`, date: date(g.created_at) ?? "", concept: m.history[g.kind], amount: usdFull(0), status: m.history.st[st], tone: st === "active" ? "ok" : "neutral", href: null, sort: new Date(g.created_at).getTime() };
    }),
    ...invoices.map((inv): HistRow => {
      const lines = inv.lines?.data ?? [];
      const sub = lines.find((l) => l.parent?.type === "subscription_item_details") ?? lines[0];
      const concept = invoiceConcept({ billingReason: inv.billing_reason, hasOneTime: lines.some((l) => l.parent?.type === "invoice_item_details"), periodStart: sub?.period?.start ?? null, periodEnd: sub?.period?.end ?? null });
      const st = (inv.status ?? "open") as "paid" | "open" | "uncollectible" | "void";
      const cents = st === "paid" ? inv.amount_paid : inv.amount_due;
      const amount = inv.currency === "usd" ? usdFull(cents) : formatMoney(fromStripeAmount(cents, inv.currency), { currency: inv.currency.toUpperCase(), numberLocale: s.fmt.numberLocale });
      return {
        key: inv.id ?? String(inv.created), date: date(inv.created) ?? "", concept: m.history[concept], amount,
        status: m.history.st[st] ?? st, tone: st === "paid" ? "ok" : st === "open" ? "warn" : st === "uncollectible" ? "bad" : "neutral",
        href: inv.invoice_pdf ?? inv.hosted_invoice_url ?? null, sort: inv.created * 1000,
      };
    }),
  ].sort((a, b) => b.sort - a.sort);

  const paying = !!ent?.stripe_subscription_id && isPaying(live?.status ?? ent.stripe_status);
  const cancelPending = live ? live.cancel : e.cancelAtPeriodEnd;
  const periodEnd = live?.end ? new Date(live.end * 1000).toISOString() : e.proUntil;
  const interval = live?.interval ?? e.billingInterval;
  const view = subView({ state: s.plan, stripeStatus: live?.status ?? ent?.stripe_status ?? null, interval, paymentFailed: !!e.paymentFailedAt, cancelPending });
  const generic = s.t.errors.generic;
  const taxTerm = s.profile.terms.freelance;
  const taxLabel = taxTerm && /^[A-Z]{2,6}$/.test(taxTerm) ? taxTerm : "";
  const pillTone = (t: HistRow["tone"]) => (t === "neutral" ? "pill" : `pill pill-${t}`);

  // ── Bloque "Tu suscripción" ──
  const v = m.view;
  const yearlyPaid = interval === "year";
  const paidCents = live?.cents ?? (yearlyPaid ? billing.yearlyCents : billing.monthlyCents);
  const price = usdShort(paidCents);
  const endDate = date(periodEnd);
  const portalCta = (label: string, flow: "home" | "payment_method_update") => <PortalButton label={label} flow={flow} className={css.cta} disabled={!ready || stripeError} genericError={generic} />;
  let cur: { tag: string; title: string; text: string; cta: React.ReactNode; warn?: boolean };
  switch (view) {
    case "first":
      cur = { tag: v.first.tag, title: fill(v.first.title, { first: usdShort(billing.firstMonthCents) }), text: endDate ? fill(v.first.text, { date: endDate, price, days: billing.notifyBeforeDays }) : fill(v.first.textNoDate, { price, days: billing.notifyBeforeDays }), cta: portalCta(v.first.cta, "home") };
      break;
    case "monthly":
      cur = { tag: v.monthly.tag, title: fill(v.monthly.title, { price }), text: endDate ? fill(v.monthly.text, { date: endDate }) : v.monthly.textNoDate, cta: portalCta(v.monthly.cta, "home") };
      break;
    case "yearly": {
      const perMonth = usdShort(monthlyEquivalent(paidCents));
      cur = { tag: v.yearly.tag, title: fill(v.yearly.title, { price }), text: endDate ? fill(v.yearly.text, { date: endDate, perMonth }) : fill(v.yearly.textNoDate, { perMonth }), cta: portalCta(v.yearly.cta, "home") };
      break;
    }
    case "ending": {
      const k = yearlyPaid ? v.yearly : v.monthly;
      cur = { tag: k.tag, title: fill(k.title, { price }), text: endDate ? fill(v.ending.text, { date: endDate }) : v.ending.textNoDate, cta: null };
      break;
    }
    case "failed":
      cur = { tag: v.failed.tag, title: fill(v.failed.title, { price }), text: v.failed.text, cta: portalCta(v.failed.cta, "payment_method_update"), warn: true };
      break;
    case "gift": {
      const until = s.plan === "trial" ? e.trialEndsAt : e.accessUntil; // 'trial': filas viejas (ya no se usa)
      cur = { tag: s.plan === "fundador" ? v.gift.fundador : v.gift.alumno, title: v.gift.title, text: until ? fill(v.gift.until, { date: date(until) ?? "" }) : v.gift.life, cta: null };
      break;
    }
    default: {
      // Solo lectura: reactivar lleva a /activar (mismo pago embebido). Nunca se borra nada.
      const hadGift = !ent?.stripe_subscription_id && grants.length > 0;
      cur = {
        tag: v.readOnly.tag, title: hadGift ? v.readOnly.titleGift : v.readOnly.title, text: v.readOnly.text, warn: true,
        cta: <span className={css.ctaRow}><Link href="/activar" className={css.cta}>{fill(v.readOnly.cta, { price: usdShort(billing.monthlyCents) })}</Link><Link href="/perfil#privacidad" className="link" style={{ fontSize: 14, fontWeight: 600 }}>{v.readOnly.export}</Link></span>,
      };
    }
  }

  const free = freeMonths(billing.monthlyCents, billing.yearlyCents);
  const perMonthYear = usdShort(monthlyEquivalent(billing.yearlyCents));
  const p = m.plan;
  const planTexts = {
    monthlyLabel: p.monthly,
    yearlyLabel: free === 1 ? p.yearlyFreeOne : free > 1 ? fill(p.yearlyFree, { n: free }) : p.yearly,
    month: { big: usdShort(billing.monthlyCents), per: p.perMonth, line: fill(p.lineFirst, { first: usdShort(billing.firstMonthCents) }) },
    year: { big: usdShort(billing.yearlyCents), per: p.perYear, line: free === 1 ? fill(p.lineYearlyOne, { perMonth: perMonthYear }) : free > 1 ? fill(p.lineYearly, { perMonth: perMonthYear, n: free }) : fill(p.lineYearlyPlain, { perMonth: perMonthYear }) },
  };

  return (
    <main className="page">
      <PageHeader title={m.title} eyebrow={<><span className="only-desktop">{m.eyebrow}</span><span className="only-mobile">{m.eyebrowShort}</span></>}>
        <Link href="/mas" className={`only-mobile ${css.back}`}>{m.back}</Link>
      </PageHeader>

      {!paymentsActive && view === "read_only" ? <div className="banner banner-info"><span>{m.banners.notActive}</span></div> : null}

      <section aria-label={m.current} className={css.current}>
        <div className={css.currentText}>
          <span className={`${css.badge} ${cur.warn ? css.badgeRo : ""}`}>{cur.tag}</span>
          <h2>{cur.title}</h2>
          <span className={css.sub}>{cur.text}</span>
          {cur.cta}
        </div>
        <Image src="/brand/sello.png" alt={m.sello} width={88} height={88} className={css.sello} />
      </section>

      <PlanCard m={m} texts={planTexts} />

      <div className={css.grid}>
        <section aria-labelledby="metodo" className={`${css.card} ${css.m1}`}>
          <h2 id="metodo">{m.method.title}</h2>
          {stripeError ? <p className={css.sub} style={{ margin: 0 }}>{m.method.unavailable}</p> : card ? (
            <div className={css.cardRow}>
              <span aria-hidden="true" className={css.cardChip} />
              <span className={css.cardText}>
                <strong style={{ fontSize: 14 }}>{fill(m.method.cardBrand, { brand: card.brand.charAt(0).toUpperCase() + card.brand.slice(1), last4: card.last4 })}</strong>
                <span className={css.small}>{fill(m.method.expires, { exp: card.exp })}</span>
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: 6 }}><PortalButton label={m.method.change} flow="payment_method_update" className="btn btn-secondary btn-sm" disabled={!ready} genericError={generic} /></span>
            </div>
          ) : <p className={css.sub} style={{ margin: 0 }}>{ready ? m.method.none : m.banners.notActive}</p>}
          {ent?.stripe_customer_id && ready && !stripeError ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <PortalButton label={m.method.add} flow="payment_method_update" className="btn btn-dashed btn-sm" genericError={generic} />
              <PortalButton label={m.method.manage} flow="home" className="btn btn-ghost btn-sm" genericError={generic} />
            </div>
          ) : null}
          <span className={css.small}>{m.method.note}</span>
        </section>

        <section aria-labelledby="fact" className={`${css.card} ${css.m3}`} style={{ gap: 12 }}>
          <h2 id="fact">{m.billing.title}</h2>
          <BillingForm m={m} name={billingName} taxId={taxId} taxLabel={taxLabel} fieldLabel={taxLabel ? fill(m.billing.taxId, { term: taxLabel }) : m.billing.taxIdPlain} enabled={ready && !stripeError} />
        </section>

        <section aria-labelledby="hist" className={`${css.card} ${css.m2} ${css.wide}`} style={{ gap: 12 }}>
          <h2 id="hist">{m.history.title}</h2>
          {hist.length === 0 ? <Empty icon="receipt" title={m.history.empty} text={stripeError ? m.method.unavailable : m.history.emptyText} /> : (
            <>
              <div className="table-scroll">
                <table className={css.hist}>
                  <thead><tr><th scope="col">{m.history.date}</th><th scope="col">{m.history.concept}</th><th scope="col" className={css.right}>{m.history.amount}</th><th scope="col">{m.history.status}</th><th scope="col">{m.history.invoice}</th></tr></thead>
                  <tbody>
                    {hist.map((h) => (
                      <tr key={h.key}>
                        <td>{h.date}</td><td>{h.concept}</td><td className={`num ${css.right}`}>{h.amount}</td>
                        <td><span className={pillTone(h.tone)} style={{ fontSize: 12, padding: "3px 9px" }}>{h.status}</span></td>
                        <td>{h.href ? <a href={h.href} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600 }}>{m.history.download}</a> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <span className={css.small}>{m.history.note}</span>
            </>
          )}
        </section>
      </div>

      {paying ? (
        <section aria-labelledby="canc" className={css.card} style={{ gap: 12 }}>
          <h2 id="canc">{m.cancel.title}</h2>
          {cancelPending ? (
            <>
              <p className={css.cancelText}>{endDate ? fill(m.cancel.pending, { date: endDate }) : m.cancel.pendingNoDate}</p>
              {ready ? <ResumeButton m={m} /> : null}
            </>
          ) : (
            <>
              <p className={css.cancelText}>{m.cancel.text}</p>
              {ready ? <CancelFlow m={m} /> : null}
            </>
          )}
        </section>
      ) : null}
    </main>
  );
}
