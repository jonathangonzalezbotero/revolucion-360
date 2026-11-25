"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { oauth, recover, resend, setNewPassword, signIn, signUp, useBackupCode as redeemBackupCode, verifyCode, type AuthResult } from "./actions";
import type { AuthMessages } from "./messages";
import css from "./auth.module.css";

const OAUTH = { google: process.env.NEXT_PUBLIC_OAUTH_GOOGLE === "true", apple: process.env.NEXT_PUBLIC_OAUTH_APPLE === "true" };
const LEVEL_COLORS = ["var(--linea-campo)", "#C2410C", "var(--naranja)", "#3E8C7A", "var(--tinta)"];

function score(pw: string) {
  let sc = 0;
  if (pw.length >= 8) sc++;
  if (pw.length >= 12) sc++;
  if (/[0-9]/.test(pw) && /[A-Za-z]/.test(pw)) sc++;
  if (/[^A-Za-z0-9]/.test(pw)) sc++;
  return sc;
}

function useSubmit() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const submit = (fn: () => Promise<AuthResult>, after?: () => void) => start(async () => {
    setError("");
    const r = await fn();
    if (!r.ok) return setError(r.error);
    after?.();
    if (r.next) { router.push(r.next); router.refresh(); }
  });
  return { error, setError, pending, submit };
}

const Head = ({ title, sub }: { title: string; sub: string }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <h1 style={{ fontSize: 30 }}>{title}</h1>
    <p className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>{sub}</p>
  </div>
);
const Alert = ({ text }: { text: string }) => (text ? <p role="alert" className={css.alert}>{text}</p> : null);

function Oauth({ m }: { m: AuthMessages }) {
  if (!OAUTH.google && !OAUTH.apple) return null;
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: OAUTH.google && OAUTH.apple ? "1fr 1fr" : "1fr", gap: 10 }}>
        {OAUTH.google ? <form action={oauth.bind(null, "google")}><button className={css.oauth}><span aria-hidden="true" style={{ fontWeight: 600, color: "var(--azul-oscuro)" }}>G</span>Google</button></form> : null}
        {OAUTH.apple ? <form action={oauth.bind(null, "apple")}><button className={css.oauth}>Apple</button></form> : null}
      </div>
      <div className="xs muted" style={{ display: "flex", alignItems: "center", gap: 12 }}><span style={{ flex: 1, height: 1, background: "var(--linea)" }} />{m.or}<span style={{ flex: 1, height: 1, background: "var(--linea)" }} /></div>
    </>
  );
}

function Password({ m, id, label, value, onChange, meter, autoComplete }: { m: AuthMessages; id: string; label: string; value: string; onChange: (v: string) => void; meter?: boolean; autoComplete: string }) {
  const [show, setShow] = useState(false);
  const sc = score(value);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="row-between">
        <label htmlFor={id} className="label">{label}</label>
        <button type="button" onClick={() => setShow(!show)} style={{ fontSize: 12, fontWeight: 600, border: 0, background: "transparent", minHeight: 32 }}>{show ? m.hide : m.show}</button>
      </div>
      <input id={id} name={id} className={css.input} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required />
      {meter ? (
        <>
          <div aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div aria-hidden="true" style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
              {[0, 1, 2, 3].map((i) => <span key={i} style={{ height: 5, borderRadius: 3, background: value && i < sc ? LEVEL_COLORS[sc] : "var(--linea)" }} />)}
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: value ? LEVEL_COLORS[sc] : "var(--gris)", minWidth: 80, textAlign: "right" }}>{value ? m.pwLevels[sc] : m.pwLevels[0]}</span>
          </div>
          <span className="hint">{m.pwHint}</span>
        </>
      ) : null}
    </div>
  );
}

export function RegisterForm({ m, invite }: { m: AuthMessages; invite?: string }) {
  const [f, setF] = useState({ name: "", email: "", password: "", terms: false, invite: invite ?? "", marketing: false });
  const { error, pending, submit } = useSubmit();
  return (
    <form style={{ display: "contents" }} onSubmit={(e) => { e.preventDefault(); submit(() => signUp(f)); }}>
      <Head title={m.reg.title} sub={m.reg.sub} />
      <Oauth m={m} />
      <div className="field"><label htmlFor="name">{m.name}</label><input id="name" className={css.input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={m.namePh} autoComplete="given-name" required /></div>
      <div className="field"><label htmlFor="email">{m.email}</label><input id="email" className={css.input} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder={m.emailPh} autoComplete="email" required /></div>
      <Password m={m} id="password" label={m.password} value={f.password} onChange={(password) => setF({ ...f, password })} meter autoComplete="new-password" />
      <div className="field"><label htmlFor="invite">{m.reg.invite} · <span style={{ fontWeight: 400 }}>{m.reg.optional}</span></label><input id="invite" className={css.input} value={f.invite} onChange={(e) => setF({ ...f, invite: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "") })} placeholder={m.reg.invitePh} autoComplete="off" /></div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <button type="button" role="checkbox" aria-checked={f.terms} aria-labelledby="terms-label" onClick={() => setF({ ...f, terms: !f.terms })} style={{ width: 24, height: 24, flex: "none", borderRadius: 7, border: "2px solid var(--tinta)", background: f.terms ? "var(--tinta)" : "var(--blanco)", color: "var(--blanco)", fontSize: 14, fontWeight: 600, padding: 0, marginTop: 1 }}>{f.terms ? "✓" : ""}</button>
        <span id="terms-label" style={{ fontSize: 13, color: "#3A3D36", lineHeight: 1.5 }}>{m.reg.accept1} <Link href="/legal/terminos" target="_blank">{m.reg.accept2}</Link> {m.reg.accept3} <Link href="/legal/privacidad" target="_blank">{m.reg.accept4}</Link>{m.reg.accept5}</span>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <button type="button" role="checkbox" aria-checked={f.marketing} aria-labelledby="marketing-label" aria-describedby="marketing-hint" onClick={() => setF({ ...f, marketing: !f.marketing })} style={{ width: 24, height: 24, flex: "none", borderRadius: 7, border: "2px solid var(--tinta)", background: f.marketing ? "var(--tinta)" : "var(--blanco)", color: "var(--blanco)", fontSize: 14, fontWeight: 600, padding: 0, marginTop: 1 }}>{f.marketing ? "✓" : ""}</button>
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><span id="marketing-label" style={{ fontSize: 13, color: "var(--tinta-2)", lineHeight: 1.5 }}>{m.reg.marketing}</span><span id="marketing-hint" className="xs muted">{m.reg.marketingHint}</span></span>
      </div>
      <Alert text={error} />
      <button className={css.cta} disabled={pending}>{m.reg.cta}</button>
      <p className="muted" style={{ fontSize: 14, textAlign: "center" }}>{m.reg.have} <Link href="/entrar" className={css.textBtn}>{m.reg.signIn}</Link></p>
    </form>
  );
}

export function SignInForm({ m, next, initialError }: { m: AuthMessages; next?: string; initialError?: string }) {
  const [f, setF] = useState({ email: "", password: "" });
  const { error, pending, submit } = useSubmit();
  return (
    <form style={{ display: "contents" }} onSubmit={(e) => { e.preventDefault(); submit(() => signIn({ ...f, next })); }}>
      <Head title={m.in.title} sub={m.in.sub} />
      <Oauth m={m} />
      <div className="field"><label htmlFor="email">{m.email}</label><input id="email" className={css.input} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder={m.emailPh} autoComplete="email" required /></div>
      <Password m={m} id="password" label={m.password} value={f.password} onChange={(password) => setF({ ...f, password })} autoComplete="current-password" />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -8 }}><Link href="/recuperar" className={css.textBtn}>{m.in.forgot}</Link></div>
      <Alert text={error || initialError || ""} />
      <button className={css.cta} disabled={pending}>{m.in.cta}</button>
      <p className="muted" style={{ fontSize: 14, textAlign: "center" }}>{m.in.first} <Link href="/registro" className={css.textBtn}>{m.in.create}</Link></p>
    </form>
  );
}

export function RecoverForm({ m }: { m: AuthMessages }) {
  const [email, setEmail] = useState("");
  const { error, pending, submit } = useSubmit();
  return (
    <form style={{ display: "contents" }} onSubmit={(e) => { e.preventDefault(); submit(() => recover({ email })); }}>
      <Head title={m.rec.title} sub={m.rec.sub} />
      <div className="field"><label htmlFor="email">{m.email}</label><input id="email" className={css.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={m.emailPh} autoComplete="email" required /></div>
      <Alert text={error} />
      <button className={css.cta} disabled={pending}>{m.rec.cta}</button>
      <p style={{ textAlign: "center" }}><Link href="/entrar" className={css.textBtn}>{m.rec.back}</Link></p>
    </form>
  );
}

export function CheckMail({ m, email, reason }: { m: AuthMessages; email: string; reason: "registro" | "recuperar" }) {
  const { error, pending, submit } = useSubmit();
  const [sent, setSent] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, alignItems: "flex-start" }}>
      <span aria-hidden="true" style={{ width: 64, height: 64, borderRadius: 14, background: "var(--amarillo-pastel)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ width: 30, height: 22, border: "3px solid var(--tinta)", borderRadius: 4, display: "block" }} /></span>
      <Head title={reason === "registro" ? m.mail.titleReg : m.mail.titleRec} sub={reason === "registro" ? m.mail.textReg : m.mail.textRec} />
      <p style={{ fontSize: 14, background: "var(--papel)", borderRadius: 12, padding: "12px 14px" }}>{m.mail.sentTo} <strong>{email || m.mail.yourEmail}</strong></p>
      <span className="small muted" style={{ lineHeight: 1.5 }}>{m.mail.noArrive}</span>
      <Alert text={error} />
      {sent ? <p role="status" className="small" style={{ fontWeight: 600 }}>{m.mail.resent}</p> : null}
      <button type="button" className="btn btn-secondary" disabled={pending || !email} onClick={() => submit(() => resend({ email, reason }), () => setSent(true))}>{m.mail.resend}</button>
      <Link href={reason === "registro" ? "/registro" : "/recuperar"} className={css.textBtn}>{m.mail.other}</Link>
    </div>
  );
}

export function CodeForm({ m, next }: { m: AuthMessages; next?: string }) {
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const { error, setError, pending, submit } = useSubmit();
  const digits = code.replace(/\D/g, "").slice(0, 6);
  if (backup) {
    return (
      <form style={{ display: "contents" }} onSubmit={(e) => { e.preventDefault(); submit(() => redeemBackupCode({ code: backupCode, next })); }}>
        <Head title={m.code.backupTitle} sub={m.code.backupSub} />
        <div className="field"><label htmlFor="backup">{m.code.backupLabel}</label><input id="backup" className={`${css.input} num`} value={backupCode} onChange={(e) => setBackupCode(e.target.value.toUpperCase())} placeholder="XXXXX-XXXXX" autoComplete="off" required /></div>
        <Alert text={error} />
        <button className={css.cta} disabled={pending}>{m.code.backupCta}</button>
        <button type="button" className={css.textBtn} onClick={() => { setBackup(false); setError(""); }}>{m.code.useApp}</button>
      </form>
    );
  }
  return (
    <form style={{ display: "contents" }} onSubmit={(e) => { e.preventDefault(); if (digits.length === 6) submit(() => verifyCode({ code: digits, next })); }}>
      <Head title={m.code.title} sub={m.code.sub} />
      <div style={{ position: "relative" }}>
        <label htmlFor="code" className="sr-only">{m.code.label}</label>
        <input id="code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={digits} onChange={(e) => setCode(e.target.value)} autoFocus style={{ position: "absolute", inset: 0, opacity: 0, fontSize: 16, width: "100%", cursor: "text" }} />
        <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, pointerEvents: "none" }}>
          {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className={`${css.codeBox} num`} style={{ border: `2px solid ${i === digits.length ? "var(--tinta)" : "var(--linea-campo)"}` }}>{digits.charAt(i)}</span>)}
        </div>
      </div>
      <Alert text={error} />
      {digits.length === 6
        ? <button className={css.cta} disabled={pending}>{m.code.cta}</button>
        : <span className="small muted" style={{ textAlign: "center", minHeight: 52, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 12, background: "var(--linea-2)" }}>{m.code.wait}</span>}
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <button type="button" className={css.textBtn} onClick={() => { setBackup(true); setError(""); }}>{m.code.backup}</button>
        <Link href="/entrar" className={css.textBtn}>{m.code.back}</Link>
      </div>
      <span className="hint" style={{ lineHeight: 1.5 }}>{m.code.lost}</span>
    </form>
  );
}

export function NewPasswordForm({ m }: { m: AuthMessages }) {
  const [password, setPassword] = useState("");
  const { error, pending, submit } = useSubmit();
  return (
    <form style={{ display: "contents" }} onSubmit={(e) => { e.preventDefault(); submit(() => setNewPassword({ password })); }}>
      <Head title={m.neu.title} sub={m.neu.sub} />
      <Password m={m} id="password" label={m.neu.label} value={password} onChange={setPassword} meter autoComplete="new-password" />
      <Alert text={error} />
      <button className={css.cta} disabled={pending}>{m.neu.cta}</button>
    </form>
  );
}
