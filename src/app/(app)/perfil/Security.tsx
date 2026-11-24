"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fill } from "@/i18n";
import { ConfirmButton, useToast } from "@/components/ui/client";
import { mfaConfirm, mfaDisable, mfaStart, signOut } from "@/app/(auth)/actions";
import { changePassword, signOutEverywhere } from "./actions";
import { Alert, useAct } from "./Forms";
import { backupCodesText } from "./lib";
import type { PerfilMessages } from "./messages";
import css from "./perfil.module.css";

// Medidor copiado de src/app/(auth)/AuthForms.tsx (no es exportable), con colores de tokens.
const LEVEL_COLORS = ["var(--linea-campo)", "var(--rojo)", "var(--naranja)", "var(--teal)", "var(--tinta)"];
function score(pw: string) {
  let sc = 0;
  if (pw.length >= 8) sc++;
  if (pw.length >= 12) sc++;
  if (/[0-9]/.test(pw) && /[A-Za-z]/.test(pw)) sc++;
  if (/[^A-Za-z0-9]/.test(pw)) sc++;
  return sc;
}

function PasswordForm({ m, onDone }: { m: PerfilMessages; onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const { pending, error, act } = useAct();
  const sc = score(pw);
  return (
    <form className="stack" style={{ gap: 10, width: "100%" }} onSubmit={(e) => { e.preventDefault(); act(() => changePassword({ password: pw }), () => { setPw(""); onDone(); }, m.pwSaved); }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="row-between">
          <label htmlFor="new-pw" className="label">{m.newPassword}</label>
          <button type="button" onClick={() => setShow(!show)} className={css.textBtn}>{show ? m.hide : m.show}</button>
        </div>
        <input id="new-pw" className={css.input} type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required maxLength={200} />
        <div aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div aria-hidden="true" style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
            {[0, 1, 2, 3].map((i) => <span key={i} style={{ height: 5, borderRadius: 3, background: pw && i < sc ? LEVEL_COLORS[sc] : "var(--linea)" }} />)}
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: pw ? LEVEL_COLORS[sc] : "var(--gris)", minWidth: 80, textAlign: "right" }}>{m.pwLevels[pw ? sc : 0]}</span>
        </div>
        <span className="hint">{m.pwHint}</span>
      </div>
      <Alert text={error} />
      <div className="row wrap">
        <button className="btn" disabled={pending || sc < 3}>{pending ? m.saving : m.changePassword}</button>
        <button type="button" className="btn btn-secondary" onClick={onDone}>{m.mfaCancel}</button>
      </div>
    </form>
  );
}

type Enroll = { factorId: string; qr: string; secret: string };
function Mfa({ m, enabled, backupLeft, isAdmin }: { m: PerfilMessages; enabled: boolean; backupLeft: number; isAdmin: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [enroll, setEnroll] = useState<Enroll | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const digits = code.replace(/\D/g, "").slice(0, 6);
  const reset = () => { setEnroll(null); setDisabling(false); setCode(""); setError(""); };

  const begin = () => start(async () => {
    setError("");
    const r = await mfaStart();
    if (!r.ok) return setError(r.error);
    setEnroll({ factorId: r.factorId, qr: r.qr, secret: r.secret });
  });
  const confirm = () => enroll && start(async () => {
    setError("");
    const r = await mfaConfirm({ factorId: enroll.factorId, code: digits });
    if (!r.ok) return setError(r.error);
    setEnroll(null); setCode("");
    setCodes(r.backupCodes); // se muestran UNA sola vez
    toast(m.mfaEnabled);
    router.refresh(); // el estado "Activa" se actualiza; los códigos siguen a la vista
  });
  const disable = () => start(async () => {
    setError("");
    const r = await mfaDisable({ code: digits });
    if (!r.ok) return setError(r.error);
    reset();
    toast(m.mfaDisabled);
    router.refresh();
  });
  const copy = async () => { try { await navigator.clipboard.writeText(codes!.join("\n")); toast(m.copied); } catch { /* el navegador no dejó copiar: quedan a la vista */ } };
  const download = () => {
    const url = URL.createObjectURL(new Blob([backupCodesText(m.backupFile, codes!)], { type: "text/plain" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "revolucion360-codigos-de-respaldo.txt" });
    a.click();
    URL.revokeObjectURL(url);
  };

  const status = enabled ? m.mfaOn : m.mfaOff;
  const left = backupLeft === 0 ? m.mfaBackupNone : backupLeft === 1 ? m.mfaBackupOne : fill(m.mfaBackupLeft, { n: backupLeft });
  const codeInput = (
    <div className="field" style={{ maxWidth: 240 }}>
      <label htmlFor="mfa-code">{m.mfaCode}</label>
      <input id="mfa-code" className={`${css.input} num`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={digits} onChange={(e) => setCode(e.target.value)} />
    </div>
  );

  return (
    <div className={css.secRow}>
      <div className="row-between wrap" style={{ width: "100%" }}>
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <strong style={{ fontSize: 15 }}>{m.mfa}</strong>
          <span className="xs" style={{ fontWeight: 600, color: enabled ? "var(--verde-fuerte)" : "var(--gris)" }}>{status}{enabled ? ` · ${left}` : ""}</span>
        </span>
        {!enroll && !disabling && !codes ? (
          enabled ? (isAdmin ? <span className="xs muted">{m.mfaAdmin}</span> : <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setDisabling(true); setError(""); }}>{m.mfaDisable}</button>)
            : <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={begin}>{m.mfaEnable}</button>
        ) : null}
      </div>

      {enroll ? (
        <div className={css.mfaBox}>
          <p className="small">{m.mfaStep1}</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- el QR llega como SVG en data URL desde Supabase */}
          <img src={enroll.qr} alt={m.mfaQrAlt} width={180} height={180} style={{ background: "var(--blanco)", borderRadius: 12, border: "1px solid var(--linea)" }} />
          <span className="xs muted">{m.mfaSecret} <code className="num" style={{ fontWeight: 600, color: "var(--tinta)", overflowWrap: "anywhere" }}>{enroll.secret}</code></span>
          <p className="small">{m.mfaStep2}</p>
          {codeInput}
          <Alert text={error} />
          <div className="row wrap">
            <button type="button" className="btn" disabled={pending || digits.length !== 6} onClick={confirm}>{m.mfaConfirm}</button>
            <button type="button" className="btn btn-secondary" onClick={reset}>{m.mfaCancel}</button>
          </div>
        </div>
      ) : null}

      {disabling ? (
        <div className={css.mfaBox}>
          <p className="small">{m.mfaDisableText}</p>
          {codeInput}
          <Alert text={error} />
          <div className="row wrap">
            <button type="button" className="btn btn-danger" disabled={pending || digits.length !== 6} onClick={disable}>{m.mfaDisable}</button>
            <button type="button" className="btn btn-secondary" onClick={reset}>{m.mfaCancel}</button>
          </div>
        </div>
      ) : null}

      {codes ? (
        <div className={css.mfaBox} role="region" aria-label={m.backupTitle}>
          <strong style={{ fontSize: 15 }}>{m.backupTitle}</strong>
          <p className="small" style={{ lineHeight: 1.5 }}>{m.backupText}</p>
          <ol className={css.codes}>{codes.map((c) => <li key={c} className="num">{c}</li>)}</ol>
          <div className="row wrap">
            <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>{m.copy}</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={download}>{m.download}</button>
            <button type="button" className="btn btn-sm" onClick={() => { setCodes(null); router.refresh(); }}>{m.backupDone}</button>
          </div>
        </div>
      ) : null}
      {!enroll && !disabling && error ? <Alert text={error} /> : null}
    </div>
  );
}

export function Security({ m, mfa, isAdmin, passwordChanged }: { m: PerfilMessages; mfa: { enabled: boolean; backupLeft: number }; isAdmin: boolean; passwordChanged: string | null }) {
  const router = useRouter();
  const [pwOpen, setPwOpen] = useState(false);
  const { error, act } = useAct();
  return (
    <section className={css.section} style={{ gap: 16 }}>
      <div className={css.secRow} style={{ borderTop: 0, paddingTop: 0 }}>
        <div className="row-between wrap" style={{ width: "100%" }}>
          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><strong style={{ fontSize: 15 }}>{m.password}</strong><span className="xs muted">{passwordChanged ? fill(m.passwordChanged, { date: passwordChanged }) : m.passwordNever}</span></span>
          {!pwOpen ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPwOpen(true)}>{m.changePassword}</button> : null}
        </div>
        {pwOpen ? <PasswordForm m={m} onDone={() => setPwOpen(false)} /> : null}
      </div>
      <Mfa m={m} enabled={mfa.enabled} backupLeft={mfa.backupLeft} isAdmin={isAdmin} />
      <div className={css.secRow}>
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><strong style={{ fontSize: 15 }}>{m.sessions}</strong><span className="xs muted">{m.sessionsSub}</span></span>
        <ConfirmButton className="btn btn-danger btn-sm" label={m.signOutAll} confirmLabel={m.signOutAllConfirm}
          onConfirm={() => act(() => signOutEverywhere(), () => router.push("/entrar"))} />
        <Alert text={error} />
      </div>
      <div className={css.secRow}>
        <div className="row-between wrap" style={{ width: "100%" }}>
          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><strong style={{ fontSize: 15 }}>{m.signOut}</strong><span className="xs muted">{m.signOutSub}</span></span>
          <form action={signOut}><button type="submit" className="btn btn-secondary btn-sm">{m.signOut}</button></form>
        </div>
      </div>
    </section>
  );
}
