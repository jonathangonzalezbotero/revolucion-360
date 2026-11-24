"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Locale } from "@/i18n";
import { M } from "./messages";
import css from "./pwa.module.css";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const PROD = process.env.NODE_ENV === "production";
const DISMISS_KEY = "r360-pwa-later";
const DISMISS_DAYS = 30;

/** Registra el service worker (solo en producción: en desarrollo cachearía pantallas a medio hacer). No pinta nada. */
export function PwaRegister() {
  useEffect(() => {
    if (!PROD || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => { /* sin service worker la app funciona igual */ });
  }, []);
  return null;
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const noop = () => () => {};
function canAskPush(): boolean {
  return PROD && !!VAPID && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && Notification.permission === "default";
}
function laterActive(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}
function vapidKey(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Aviso para "Instalar la app" (evento beforeinstallprompt) y "Activar notificaciones" (push con NEXT_PUBLIC_VAPID_PUBLIC_KEY,
 * guardado en push_subscriptions vía /api/push/subscribe). Va dentro de la app con sesión. "Ahora no" lo esconde 30 días.
 */
export function PwaPrompts({ locale }: { locale: Locale }) {
  const m = M[locale];
  const [installEvt, setInstallEvt] = useState<InstallEvent | null>(null);
  const [hidden, setHidden] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pushAskable = useSyncExternalStore(noop, canAskPush, () => false);
  const later = useSyncExternalStore(noop, laterActive, () => true);

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvt(e as InstallEvent); };
    const onInstalled = () => setInstallEvt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* sin almacenamiento: solo se esconde ahora */ }
    setHidden(true);
  };

  const install = async () => {
    if (!installEvt) return;
    await installEvt.prompt();
    await installEvt.userChoice.catch(() => null);
    setInstallEvt(null);
  };

  const enablePush = async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setStatus(m.notifyDenied); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey(VAPID) }));
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      setStatus(res.ok ? m.notifyOn : m.notifyError);
    } catch {
      setStatus(m.notifyError);
    } finally {
      setBusy(false);
    }
  };

  if (hidden) return null;
  if (status) {
    return (
      <aside className={css.card} aria-label={m.label} role="status">
        <p className={css.status}>{status}</p>
        <div className={css.actions}><button type="button" className="btn btn-secondary btn-sm" onClick={() => setHidden(true)}>{m.later}</button></div>
      </aside>
    );
  }
  if (later) return null;
  const mode = installEvt ? "install" : pushAskable ? "notify" : null;
  if (!mode) return null;
  return (
    <aside className={css.card} aria-label={m.label}>
      <span className={css.label}>{m.label}</span>
      <p className={css.title}>{mode === "install" ? m.installTitle : m.notifyTitle}</p>
      <p className={css.text}>{mode === "install" ? m.installText : m.notifyText}</p>
      <div className={css.actions}>
        {mode === "install"
          ? <button type="button" className="btn btn-sm" onClick={install}>{m.install}</button>
          : <button type="button" className="btn btn-sm" onClick={enablePush} disabled={busy} aria-busy={busy}>{m.notify}</button>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={dismiss}>{m.later}</button>
      </div>
    </aside>
  );
}
