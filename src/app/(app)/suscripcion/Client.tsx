"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/client";
import type { Result } from "@/server/action";
import { cancelSubscription, resumeSubscription, saveBilling } from "./actions";
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

// ───────── Un solo plan: mensual/anual, precio y lo que incluye ─────────
export type PlanTexts = {
  monthlyLabel: string; yearlyLabel: string;
  month: { big: string; per: string; line: string };
  year: { big: string; per: string; line: string };
};

export function PlanCard({ m, texts }: { m: SubMessages; texts: PlanTexts }) {
  const [interval, setIv] = useState<Interval>("month");
  const p = m.plan;
  const t = interval === "month" ? texts.month : texts.year;
  return (
    <section aria-labelledby="planes" className={css.card} style={{ gap: 16 }}>
      <div className={css.head}>
        <h2 id="planes">{p.title}</h2>
        <div role="group" aria-label={p.frequency} className={css.seg}>
          <button type="button" aria-pressed={interval === "month"} onClick={() => setIv("month")}>{texts.monthlyLabel}</button>
          <button type="button" aria-pressed={interval === "year"} onClick={() => setIv("year")}>{texts.yearlyLabel}</button>
        </div>
      </div>
      <div className={css.planGrid}>
        <div className={css.priceCol}>
          <div className={css.priceRow}><span className={`num big ${css.bigPrice}`}>{t.big}</span><span className={css.per}>{t.per}</span></div>
          <span className={css.priceLine}>{t.line}</span>
          <span className={css.small} style={{ lineHeight: 1.5 }}>{p.usd}</span>
        </div>
        <ul className={css.incl}>
          {p.includes.map((i) => <li key={i}><span aria-hidden="true" className={css.tick}>✓</span>{i}</li>)}
        </ul>
      </div>
      <span className={css.small}>{p.note}</span>
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
