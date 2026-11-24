"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { fill } from "@/i18n";
import { useToast } from "@/components/ui/client";
import type { Result } from "@/server/action";
import { cancelSubscription, resumeSubscription, saveBilling, startTrial } from "./actions";
import type { CancelReason, Interval } from "./lib";
import type { SubMessages } from "./messages";
import css from "./suscripcion.module.css";

const Alert = ({ text }: { text: string }) => (text ? <p role="alert" className={css.alert}>{text}</p> : null);

/** Acción del servidor con aviso y refresco. */
function useAct() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const act = <T,>(fn: () => Promise<Result<T>>, msg?: (data: T) => string, onOk?: () => void) => start(async () => {
    setError("");
    const r = await fn();
    if (!r.ok) return setError(r.error);
    if (msg) toast(msg(r.data));
    onOk?.();
    router.refresh();
  });
  return { pending, error, act };
}

/** Pide a una ruta de Stripe la URL alojada (Checkout o Portal) y lleva al usuario allá. */
function useRedirect() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const go = async (url: string, body: unknown, fallback: string) => {
    setPending(true); setError("");
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.ok && data.url) { window.location.assign(data.url); return; }
      setError(data.error || fallback);
    } catch {
      setError(fallback);
    }
    setPending(false);
  };
  return { pending, error, go };
}

// ───────── Planes: tabla, mensual/anual, cupón, pagar y prueba gratis ─────────
export type FeatureRow = { key: string; name: string; free: string | true | false; pro: string | true };
export type PlanPrices = {
  month: string | null; year: string | null; monthlyEquiv: string | null; savings: number | null; currency: string | null;
  student: { pct: number; month: string | null; year: string | null } | null;
};

export function Plans({ m, rows, prices, mode, paymentsActive, canTrial, trialDays, hasCustomer, genericError }: {
  m: SubMessages; rows: FeatureRow[]; prices: PlanPrices; mode: "buy" | "have" | "gift";
  paymentsActive: boolean; canTrial: boolean; trialDays: number; hasCustomer: boolean; genericError: string;
}) {
  const [interval, setIv] = useState<Interval>("month");
  const [coupon, setCoupon] = useState("");
  const checkout = useRedirect();
  const portal = useRedirect();
  const trial = useAct();
  const p = m.plans;
  const price = interval === "month" ? prices.month : prices.year;
  const priceLabel = fill(interval === "month" ? p.perMonth : p.perYear, { price: price ?? p.placeholder });
  const note = interval === "month" ? p.noteMonthly
    : prices.savings ? fill(p.noteYearly, { price: prices.monthlyEquiv ?? p.placeholder, pct: prices.savings })
    : prices.monthlyEquiv ? fill(p.noteYearlyNoSave, { price: prices.monthlyEquiv }) : fill(p.noteYearly, { price: p.placeholder, pct: "[X]" });
  const studentPrice = prices.student ? (interval === "month" ? prices.student.month : prices.student.year) : null;
  const cell = (v: string | boolean) => v === true ? <><span aria-hidden="true">✓</span><span className="sr-only">{p.yes}</span></>
    : v === false ? <><span aria-hidden="true">—</span><span className="sr-only">{p.no}</span></> : v;

  return (
    <section aria-labelledby="planes" className={css.card} style={{ gap: 16 }}>
      <div className={css.head}>
        <h2 id="planes">{p.title}</h2>
        <div role="group" aria-label={p.frequency} className={css.seg}>
          <button type="button" aria-pressed={interval === "month"} onClick={() => setIv("month")}>{p.monthly}</button>
          <button type="button" aria-pressed={interval === "year"} onClick={() => setIv("year")}>{p.yearly}</button>
        </div>
      </div>
      <div className="table-scroll">
        <table className={css.table}>
          <thead><tr>
            <th scope="col">{p.includes}</th>
            <th scope="col"><span className={css.colHead}><span className={css.colName}>{p.free}</span><span className={css.colPrice}>{p.zero}</span></span></th>
            <th scope="col" className={css.proCol}><span className={css.colHead}><span className={css.colName}>{p.pro}</span><span className={`num ${css.colPrice}`}>{priceLabel}</span></span></th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row" className={css.rowHead}>{r.name}</th>
                <td className={r.free === false ? css.muted : undefined}>{cell(r.free)}</td>
                <td className={css.proCol}>{cell(r.pro)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className={css.small}>{note}.{prices.currency ? ` ${fill(p.currency, { currency: prices.currency })}` : ""}</span>
      {prices.student && studentPrice ? <span className={css.small} style={{ color: "var(--tinta)", fontWeight: 600 }}>{fill(p.student, { pct: prices.student.pct, price: fill(interval === "month" ? p.perMonth : p.perYear, { price: studentPrice }) })}</span> : null}

      {mode === "buy" ? (
        <form className={css.buy} onSubmit={(e) => { e.preventDefault(); checkout.go("/api/stripe/checkout", { interval, coupon }, genericError); }}>
          <div className={`field ${css.coupon}`}>
            <label htmlFor="s-coupon">{p.coupon}</label>
            <input id="s-coupon" className="input" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder={p.couponPh} maxLength={40} autoComplete="off" disabled={!paymentsActive} />
          </div>
          <div className={css.actions}>
            <button type="submit" className="btn" disabled={!paymentsActive || checkout.pending} aria-describedby="s-buy-note">{checkout.pending ? p.buying : p.buy}</button>
            {canTrial ? <button type="button" className="btn btn-secondary" disabled={trial.pending} onClick={() => trial.act(() => startTrial(), (d) => fill(p.trialDone, { days: d }))}>{fill(p.trial, { days: trialDays })}</button> : null}
          </div>
          <span id="s-buy-note" className={css.small} style={{ flexBasis: "100%" }}>{paymentsActive ? p.buyNote : m.banners.notActive}{canTrial ? ` ${p.trialNote}` : ""} {p.termsPre} <Link href="/legal/terminos" className="link">{p.termsLink}</Link>.</span>
          <div style={{ flexBasis: "100%" }}><Alert text={checkout.error || trial.error} /></div>
        </form>
      ) : (
        <div className={css.buy}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{p.havePro}</span>
          {mode === "have" && hasCustomer ? <button type="button" className={`btn btn-secondary btn-sm ${css.tap}`} disabled={!paymentsActive || portal.pending} onClick={() => portal.go("/api/stripe/portal", { flow: "home" }, genericError)}>{p.manage}</button> : null}
          <div style={{ flexBasis: "100%" }}><Alert text={portal.error} /></div>
        </div>
      )}
    </section>
  );
}

// ───────── Botón al Customer Portal ─────────
export function PortalButton({ label, flow, className, disabled, genericError }: { label: string; flow: "home" | "payment_method_update"; className: string; disabled?: boolean; genericError: string }) {
  const portal = useRedirect();
  return (
    <>
      <button type="button" className={`${className} ${css.tap}`} disabled={disabled || portal.pending} onClick={() => portal.go("/api/stripe/portal", { flow }, genericError)}>{label}</button>
      <Alert text={portal.error} />
    </>
  );
}

// ───────── Datos de facturación ─────────
export function BillingForm({ m, name, taxId, taxLabel, fieldLabel, enabled }: { m: SubMessages; name: string; taxId: string; taxLabel: string; fieldLabel: string; enabled: boolean }) {
  const [f, setF] = useState({ name, taxId });
  const { pending, error, act } = useAct();
  return (
    <form style={{ display: "flex", flexDirection: "column", gap: 12 }} onSubmit={(e) => { e.preventDefault(); act(() => saveBilling({ ...f, taxLabel }), (msg) => msg); }}>
      <div className={css.fields}>
        <div className="field"><label htmlFor="f-nom">{m.billing.name}</label><input id="f-nom" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} autoComplete="name" required disabled={!enabled} /></div>
        <div className="field"><label htmlFor="f-tax">{fieldLabel}</label><input id="f-tax" className="input" value={f.taxId} onChange={(e) => setF({ ...f, taxId: e.target.value })} maxLength={60} disabled={!enabled} /></div>
      </div>
      <div className="row wrap" style={{ gap: 12, alignItems: "center" }}>
        <button type="submit" className={`btn btn-secondary btn-sm ${css.tap}`} disabled={!enabled || pending}>{pending ? m.billing.saving : m.billing.save}</button>
        <span className={css.small}>{enabled ? m.billing.note : m.banners.notActive}</span>
      </div>
      <Alert text={error} />
    </form>
  );
}

// ───────── Cancelar con encuesta corta (al final del periodo, sin borrar nada) ─────────
export function CancelFlow({ m }: { m: SubMessages }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<CancelReason | null>(null);
  const { pending, error, act } = useAct();
  const c = m.cancel;
  return (
    <>
      <button type="button" className={css.cancelBtn} aria-expanded={open} aria-controls="s-survey" onClick={() => setOpen(!open)}>{c.open}</button>
      {open ? (
        <div id="s-survey" className={css.survey}>
          <span className={css.surveyTitle} id="s-why">{c.why}</span>
          <div className={css.chips} role="group" aria-labelledby="s-why">
            {(Object.keys(c.reasons) as CancelReason[]).map((k) => (
              <button key={k} type="button" className={css.chip} aria-pressed={reason === k} onClick={() => setReason(reason === k ? null : k)}>{c.reasons[k]}</button>
            ))}
          </div>
          <button type="button" className={css.confirm} disabled={pending} onClick={() => act(() => cancelSubscription({ reason }), (msg) => msg, () => setOpen(false))}>{pending ? c.confirming : c.confirm}</button>
          <Alert text={error} />
        </div>
      ) : null}
    </>
  );
}

export function ResumeButton({ m }: { m: SubMessages }) {
  const { pending, error, act } = useAct();
  return (
    <>
      <button type="button" className={`btn btn-secondary btn-sm ${css.tap}`} style={{ alignSelf: "flex-start" }} disabled={pending} onClick={() => act(() => resumeSubscription(), (msg) => msg)}>{m.cancel.resume}</button>
      <Alert text={error} />
    </>
  );
}

/** Al volver de Stripe el aviso puede tardar unos segundos: refresca la pantalla hasta que llegue (máx. ~30 s). */
export function AwaitConfirmation({ text, refresh }: { text: string; refresh: string }) {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (tries >= 10) return;
    const id = window.setTimeout(() => { setTries((n) => n + 1); router.refresh(); }, 3000);
    return () => window.clearTimeout(id);
  }, [tries, router]);
  return (
    <div className="banner banner-info" role="status">
      <span>{text}</span>
      <button type="button" className={`btn btn-secondary btn-sm ${css.tap}`} onClick={() => router.refresh()}>{refresh}</button>
    </div>
  );
}
