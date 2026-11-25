"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { fill } from "@/i18n";
import type { Interval } from "@/app/(app)/suscripcion/lib";
import { signOut } from "../actions";
import { redeemCode } from "./actions";
import type { ActivarMessages } from "./messages";
import css from "../auth.module.css";
import own from "./activar.module.css";

const Alert = ({ text }: { text: string }) => (text ? <p role="alert" className={css.alert}>{text}</p> : null);

/** Stripe.js se carga una sola vez por clave publicable (nunca al importar el módulo: solo en el navegador). */
let stripePromise: Promise<Stripe | null> | null = null;
let stripeKey = "";
function getStripeJs(key: string) {
  if (!stripePromise || stripeKey !== key) { stripeKey = key; stripePromise = loadStripe(key); }
  return stripePromise;
}

export type PlanOption = { today: string; then: string; label: string; sub: string; big: string; badge: string };
export type ActivateProps = {
  m: ActivarMessages;
  options: Record<Interval, PlanOption>;
  initial: Interval;
  publishableKey: string | null;   // null → pagos aún no activos (solo el código de alumno)
  paymentsActive: boolean;
  initialError: string;
};

/** Paso "Activa tu cuenta": mensual o anual, tarjeta dentro de la app (Stripe Embedded Checkout), cupón y código de alumno. */
export function Activate({ m, options, initial, publishableKey, paymentsActive, initialError }: ActivateProps) {
  const [interval, setIv] = useState<Interval>(initial);
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponText, setCouponText] = useState("");
  const [coupon, setCoupon] = useState(""); // el aplicado: cambia el pago
  const o = options[interval];
  const canPay = paymentsActive && !!publishableKey;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div role="radiogroup" aria-label={m.choose} className={own.plans}>
        {(["month", "year"] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={interval === k} onClick={() => setIv(k)} className={own.plan}>
            <span className={own.planText}>
              <strong style={{ fontSize: 15 }}>{options[k].label}{options[k].badge ? <span className={own.badge}>{options[k].badge}</span> : null}</strong>
              <span className={own.planSub}>{options[k].sub}</span>
            </span>
            <span className={`num ${own.planPrice}`}>{options[k].big}</span>
          </button>
        ))}
      </div>

      <div className={own.today}>
        <div className="row-between" style={{ fontSize: 14 }}><span>{m.today}</span><strong className="num">{o.today}</strong></div>
        <span className={own.small}>{o.then}</span>
      </div>

      {canPay ? (
        <>
          {couponOpen ? (
            <form className={own.couponRow} onSubmit={(e) => { e.preventDefault(); setCoupon(couponText.trim().toUpperCase()); }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
                <label htmlFor="act-coupon" className={own.label}>{m.couponLabel}</label>
                <input id="act-coupon" className={css.input} value={couponText} onChange={(e) => setCouponText(e.target.value.toUpperCase())} placeholder={m.couponPh} maxLength={40} autoComplete="off" />
              </div>
              <button type="submit" className={own.smallBtn} disabled={!couponText.trim()}>{m.couponApply}</button>
            </form>
          ) : (
            <button type="button" className={css.textBtn} style={{ alignSelf: "flex-start" }} onClick={() => setCouponOpen(true)}>{m.couponAsk}</button>
          )}
          {coupon ? (
            <p className={own.small} style={{ margin: 0 }}>{fill(m.couponApplied, { code: coupon })} <button type="button" className={css.textBtn} style={{ minHeight: 32, padding: "4px" }} onClick={() => { setCoupon(""); setCouponText(""); }}>{m.couponRemove}</button></p>
          ) : null}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className={own.label}>{m.card}</span>
            <Checkout key={`${interval}|${coupon}`} m={m} interval={interval} coupon={coupon} publishableKey={publishableKey!} />
            <span className={own.small}>{m.cardNote} {m.termsPre} <Link href="/legal/terminos" className="link">{m.termsLink}</Link>.</span>
          </div>
        </>
      ) : <p className={own.small} style={{ margin: 0 }}>{m.notActive}</p>}

      <Alert text={initialError} />

      <StudentCode m={m} />

      <div className={own.foot}>
        <Link href="/diagnostico" className={css.textBtn}>{m.diag}</Link>
        <Link href="/perfil" className={css.textBtn}>{m.profile}</Link>
        <form action={signOut}><button type="submit" className={css.textBtn}>{m.signOut}</button></form>
      </div>
    </div>
  );
}

/** Pide la sesión de pago al servidor (con el plan y el cupón) y monta Stripe Embedded Checkout. Stripe vuelve a /activar?pago=… al terminar. */
function Checkout({ m, interval, coupon, publishableKey }: { m: ActivarMessages; interval: Interval; coupon: string; publishableKey: string }) {
  const stripe = useMemo(() => getStripeJs(publishableKey), [publishableKey]);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/stripe/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interval, coupon }) });
        const data = (await res.json().catch(() => ({}))) as { clientSecret?: string; error?: string };
        if (!alive) return;
        if (res.ok && data.clientSecret) setSecret(data.clientSecret);
        else setError(data.error || m.notComplete);
      } catch {
        if (alive) setError(m.notComplete);
      }
    })();
    return () => { alive = false; };
  }, [interval, coupon, tries, m.notComplete]);

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Alert text={error} />
        <button type="button" className={css.textBtn} style={{ alignSelf: "flex-start" }} onClick={() => { setError(""); setSecret(null); setTries((n) => n + 1); }}>{m.retry}</button>
      </div>
    );
  }
  if (!secret) return <div aria-label={m.cardAria} aria-busy="true" className={own.cardBox}>{m.cardLoading}</div>;
  return (
    <div aria-label={m.cardAria} className={own.embed}>
      <EmbeddedCheckoutProvider stripe={stripe} options={{ clientSecret: secret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}

/** "¿Eres alumno? Tengo un código": canjea el código y entra sin tarjeta. */
function StudentCode({ m }: { m: ActivarMessages }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [pending, start] = useTransition();
  const submit = () => start(async () => {
    setError("");
    const r = await redeemCode({ code });
    if (!r.ok) return setError(r.error);
    setDone(r.data);
    router.push("/inicio");
    router.refresh();
  });

  if (!open) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: 14, textAlign: "center" }}>
        {m.studentAsk} <button type="button" className={css.textBtn} onClick={() => setOpen(true)}>{m.studentToggle}</button>
      </p>
    );
  }
  return (
    <form className={own.student} onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <label htmlFor="act-code" className={own.label}>{m.studentLabel}</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input id="act-code" className={css.input} style={{ flex: 1, minWidth: 0, fontSize: 16, height: 48 }} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={m.studentPh} maxLength={40} autoComplete="off" required />
        <button type="submit" className={own.useBtn} disabled={pending || !code.trim()}>{pending ? m.studentUsing : m.studentUse}</button>
      </div>
      <span className={own.small}>{m.studentNote}</span>
      {done ? <p role="status" className={own.ok}>{done}</p> : null}
      <Alert text={error} />
    </form>
  );
}

/** Al volver de Stripe el aviso puede tardar unos segundos: refresca hasta que la cuenta quede activa (la página redirige sola). */
export function AwaitActivation({ m }: { m: ActivarMessages }) {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (tries >= 20) return;
    const id = window.setTimeout(() => { setTries((n) => n + 1); router.refresh(); }, 3000);
    return () => window.clearTimeout(id);
  }, [tries, router]);
  return (
    <div className={own.today} role="status">
      <span style={{ fontSize: 15, lineHeight: 1.5 }}>{m.confirming}</span>
      <div className="row wrap" style={{ gap: 12, alignItems: "center" }}>
        <button type="button" className={own.smallBtn} onClick={() => router.refresh()}>{m.refresh}</button>
        {tries >= 20 ? <span className={own.small}>{m.slow}</span> : null}
      </div>
    </div>
  );
}
