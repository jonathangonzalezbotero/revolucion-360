import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type Stripe from "stripe";
import { fill } from "@/i18n";
import { Empty, PageHeader } from "@/components/ui/basics";
import { daysLeft, formatDate, formatMoney, todayIn, type FeatureKey, type MoneyFormat } from "@/lib/engine";
import { getStripe, stripeReady, toSubLike } from "@/lib/stripe";
import type { MenuKey } from "@/server/config";
import { must } from "@/server/data";
import { requireUser, type Session } from "@/server/session";
import { BillingForm, CancelFlow, Plans, PortalButton, ResumeButton, AwaitConfirmation, type FeatureRow } from "./Client";
import { canStartTrial, discounted, fromStripeAmount, invoiceInterval, isPaying, isStudent, monthlyEquivalent, pickRegion, priceFor, stripePriceFor, yearlySavingsPct, type Grant, type PriceRegion } from "./lib";
import { M } from "./messages";
import css from "./suscripcion.module.css";

export const metadata: Metadata = { title: "Suscripción" };

/** Orden de las filas de la tabla. Qué es Gratis o Pro sale de app_config.features, nunca de aquí. */
const ORDER: FeatureKey[] = ["plan", "diag", "metas", "proy", "escenarios", "mov", "csv", "recurrentes", "ana", "inv", "cierre", "acad", "deudas"];
const MENU_OF: Partial<Record<FeatureKey, MenuKey>> = {
  plan: "plan", metas: "metas", proy: "proyeccion", escenarios: "proyeccion", mov: "movimientos", csv: "movimientos", recurrentes: "movimientos",
  ana: "analisis", inv: "inversiones", cierre: "cierre", acad: "academia", deudas: "deudas",
};

type HistRow = { key: string; date: string; concept: string; amount: string; status: string; tone: "ok" | "warn" | "bad" | "neutral"; href: string | null; sort: number };

export default async function SuscripcionPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const s = await requireUser();
  const m = M[s.locale];
  const { estado } = await searchParams;
  const [entRes, regionsRes, grantsRes] = await Promise.all([
    s.supabase.from("entitlements").select("stripe_customer_id, stripe_subscription_id, stripe_status").eq("user_id", s.userId).maybeSingle(),
    s.supabase.from("price_regions").select("*"),
    s.supabase.from("access_grants").select("kind, expires_at, revoked_at, created_at").eq("user_id", s.userId).order("created_at", { ascending: false }),
  ]);
  const ent = must(entRes);
  const regions = must(regionsRes) as PriceRegion[];
  const grants = must(grantsRes) as (Grant & { created_at: string })[];
  const e = s.entitlement;
  const tz = s.profile.timezone || "Australia/Sydney";
  const date = (ts: string | number | null | undefined) => (ts == null ? null : formatDate(todayIn(tz, new Date(typeof ts === "number" ? ts * 1000 : ts)), s.locale));
  const now = new Date();

  // ── Precio de la región ──
  const region = pickRegion(s.profile.country, regions);
  const rfmt: MoneyFormat = { currency: region?.currency ?? s.fmt.currency, numberLocale: s.fmt.numberLocale };
  const monthly = priceFor(region, "month"), yearly = priceFor(region, "year");
  const money = (c: number | null) => (c == null ? null : formatMoney(c, rfmt));
  const studentPct = region && region.student_discount_pct > 0 && isStudent(grants) ? region.student_discount_pct : 0;
  const prices = {
    month: money(monthly), year: money(yearly), monthlyEquiv: yearly ? money(monthlyEquivalent(yearly)) : null,
    savings: yearlySavingsPct(monthly, yearly),
    currency: region && region.currency !== s.profile.currency ? region.currency : null,
    student: studentPct ? { pct: studentPct, month: monthly ? money(discounted(monthly, studentPct)) : null, year: yearly ? money(discounted(yearly, studentPct)) : null } : null,
  };
  const ready = stripeReady();
  const paymentsActive = ready && !!stripePriceFor(region, "month") && !!stripePriceFor(region, "year");

  // ── Filas Gratis vs Pro (de app_config.features) ──
  const rows: FeatureRow[] = ORDER.filter((k) => k in s.config.features && (!MENU_OF[k] || s.config.menu[MENU_OF[k]!] !== "off")).map((k) => {
    const free = (s.config.features[k] ?? "free") === "free";
    if (k === "metas" && free) return { key: k, name: m.plans.features[k], free: String(s.config.limits.free_goals), pro: m.plans.unlimited };
    return { key: k, name: m.plans.features[k], free, pro: true };
  });
  rows.push({ key: "export", name: m.plans.export, free: true, pro: true });

  // ── Estado de la suscripción ──
  const paying = !!ent?.stripe_subscription_id && isPaying(ent.stripe_status);
  const giftLive = (e.state === "alumno" || e.state === "fundador") && s.tier === "pro";
  const mode: "buy" | "have" | "gift" = paying || e.state === "pro" ? "have" : giftLive && (e.state === "fundador" || !e.accessUntil) ? "gift" : "buy";
  const canTrial = canStartTrial(s.config.trial, e);
  const hasCustomer = !!ent?.stripe_customer_id;

  // ── Datos de Stripe (solo si hay clave y cliente). La tarjeta nunca pasa por la app: solo marca, últimos 4 y vencimiento. ──
  let card: { brand: string; last4: string; exp: string } | null = null;
  let billingName = s.profile.name, taxId = "";
  let invoices: Stripe.Invoice[] = [];
  let stripeError = false;
  let live: { cancel: boolean; end: number | null } | null = null; // lo que dice Stripe ahora (el aviso puede tardar unos segundos)
  const stripe = getStripe();
  if (stripe && ent?.stripe_customer_id) {
    try {
      const [cust, inv, sub] = await Promise.all([
        stripe.customers.retrieve(ent.stripe_customer_id, { expand: ["invoice_settings.default_payment_method"] }),
        stripe.invoices.list({ customer: ent.stripe_customer_id, limit: 24 }),
        ent.stripe_subscription_id ? stripe.subscriptions.retrieve(ent.stripe_subscription_id, { expand: ["default_payment_method"] }) : Promise.resolve(null),
      ]);
      if (sub) { const l = toSubLike(sub); live = { cancel: l.cancel_at_period_end || l.cancel_at != null, end: l.current_period_end }; }
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
  const zero = formatMoney(0, s.fmt);
  const hist: HistRow[] = [
    ...grants.map((g, i): HistRow => {
      const st = g.revoked_at ? "revoked" : g.expires_at && new Date(g.expires_at) <= now ? "expired" : "active";
      return { key: `g${i}`, date: date(g.created_at) ?? "", concept: m.history[g.kind], amount: zero, status: m.history.st[st], tone: st === "active" ? "ok" : "neutral", href: null, sort: new Date(g.created_at).getTime() };
    }),
    ...invoices.map((inv): HistRow => {
      const line = inv.lines?.data?.[0];
      const interval = invoiceInterval(line?.period?.start ?? null, line?.period?.end ?? null);
      const st = (inv.status ?? "open") as "paid" | "open" | "uncollectible" | "void";
      const cents = st === "paid" ? inv.amount_paid : inv.amount_due;
      return {
        key: inv.id ?? String(inv.created), date: date(inv.created) ?? "", concept: fill(m.history.pro, { interval: m.intervals[interval] }),
        amount: formatMoney(fromStripeAmount(cents, inv.currency), { currency: inv.currency.toUpperCase(), numberLocale: s.fmt.numberLocale }),
        status: m.history.st[st] ?? st, tone: st === "paid" ? "ok" : st === "open" ? "warn" : st === "uncollectible" ? "bad" : "neutral",
        href: inv.invoice_pdf ?? inv.hosted_invoice_url ?? null, sort: inv.created * 1000,
      };
    }),
  ].sort((a, b) => b.sort - a.sort);

  const cancelPending = live ? live.cancel : e.cancelAtPeriodEnd;
  const periodEnd = live?.end ? new Date(live.end * 1000).toISOString() : e.proUntil;
  const generic = s.t.errors.generic;
  const taxTerm = s.profile.terms.freelance;
  const taxLabel = taxTerm && /^[A-Z]{2,6}$/.test(taxTerm) ? taxTerm : "";
  const pillTone = (t: HistRow["tone"]) => (t === "neutral" ? "pill" : `pill pill-${t}`);

  return (
    <main className="page">
      <PageHeader title={m.title} eyebrow={<><span className="only-desktop">{m.eyebrow}</span><span className="only-mobile">{m.eyebrowShort}</span></>}>
        <Link href="/mas" className={`only-mobile ${css.back}`}>{m.back}</Link>
      </PageHeader>

      {estado === "ok" ? (e.state === "pro" ? <div className="banner banner-info" role="status"><span>{m.banners.okDone}</span></div> : <AwaitConfirmation text={m.banners.ok} refresh={m.banners.refresh} />) : null}
      {estado === "cancelado" ? <div className="banner banner-info" role="status"><span>{m.banners.cancelled}</span></div> : null}
      {e.paymentFailedAt && paying ? (
        <div className="banner" role="alert"><span>{m.banners.failed}</span><span style={{ display: "flex", flexDirection: "column", gap: 6 }}><PortalButton label={m.banners.failedCta} flow="payment_method_update" className="btn btn-sm" disabled={!ready} genericError={generic} /></span></div>
      ) : null}
      {!paymentsActive && mode === "buy" ? <div className="banner banner-info"><span>{m.banners.notActive}</span></div> : null}

      <CurrentPlan s={s} m={m} date={date} canTrial={canTrial} cancelPending={cancelPending} periodEnd={periodEnd} />

      <Plans m={m} rows={rows} prices={prices} mode={mode} paymentsActive={paymentsActive} canTrial={canTrial} trialDays={s.config.trial.days} hasCustomer={hasCustomer} genericError={generic} />

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
          {hasCustomer && ready && !stripeError ? (
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
          )}
        </section>
      </div>

      {paying ? (
        <section aria-labelledby="canc" className={css.card} style={{ gap: 12 }}>
          <h2 id="canc">{m.cancel.title}</h2>
          {cancelPending ? (
            <>
              <p className={css.cancelText}>{periodEnd ? fill(m.cancel.pending, { date: date(periodEnd)! }) : m.cancel.pendingNoDate}</p>
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

/** Bloque "Tu plan actual": estado, próximo cobro o fin de prueba, vencimiento del acceso, solo lectura con su explicación. */
function CurrentPlan({ s, m, date, canTrial, cancelPending, periodEnd }: { s: Session; m: (typeof M)["es"]; date: (ts: string | null) => string | null; canTrial: boolean; cancelPending: boolean; periodEnd: string | null }) {
  const e = s.entitlement;
  const p = m.plan;
  let badge = m.states[e.state], badgeCls = css.badge, title = "", sub = "", note: React.ReactNode = null;
  switch (e.state) {
    case "trial": {
      const left = daysLeft(e.trialEndsAt);
      if (s.tier === "pro" && left != null) {
        title = p.trialTitle;
        sub = fill(left === 1 ? p.trialTextOne : p.trialText, { date: date(e.trialEndsAt) ?? "", n: left });
        note = p.trialNote;
      } else {
        badge = m.states.free; badgeCls = `${css.badge} ${css.badgeFree}`; title = p.freeTitle; sub = fill(p.trialOver, { date: date(e.trialEndsAt) ?? "" });
      }
      break;
    }
    case "pro":
      badge = e.billingInterval === "year" || e.billingInterval === "month" ? `${m.states.pro} · ${m.intervals[e.billingInterval]}` : m.states.pro;
      title = p.proTitle;
      sub = periodEnd ? fill(cancelPending ? p.proEnds : p.proNext, { date: date(periodEnd) ?? "" }) : p.proNextNone;
      note = p.proNote;
      break;
    case "alumno":
    case "fundador":
      if (s.tier === "pro") {
        title = p.giftTitle; sub = e.accessUntil ? fill(p.giftUntil, { date: date(e.accessUntil) ?? "" }) : p.giftLife; note = p.giftNote;
      } else {
        badge = m.states.free; badgeCls = `${css.badge} ${css.badgeFree}`; title = p.freeTitle; sub = fill(p.giftOver, { date: date(e.accessUntil) ?? "" });
      }
      break;
    case "read_only":
      badgeCls = `${css.badge} ${css.badgeRo}`; title = p.roTitle; sub = p.roText;
      note = <>{p.roNote} <Link href="/perfil#privacidad" className="link">{p.export}</Link></>;
      break;
    default:
      badgeCls = `${css.badge} ${css.badgeFree}`; title = p.freeTitle; sub = p.freeText; note = canTrial ? fill(p.freeTrial, { days: s.config.trial.days }) : null;
  }
  return (
    <section aria-label={m.current} className={css.current}>
      <div className={css.currentText}>
        <span className={badgeCls}>{badge}</span>
        <h2>{title}</h2>
        <span className={css.sub}>{sub}</span>
        {note ? <span className={css.note}>{note}</span> : null}
      </div>
      <Image src="/brand/sello.png" alt={m.sello} width={88} height={88} className={css.sello} />
    </section>
  );
}
