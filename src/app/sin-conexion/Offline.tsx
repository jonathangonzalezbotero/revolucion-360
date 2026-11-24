"use client";
import { useSyncExternalStore } from "react";
import type { M } from "./messages";

const subscribe = () => () => {};
/** La página es estática: el idioma sale del navegador (español por defecto). */
const browserLocale = () => (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("en") ? "en" : "es");

export function Offline({ m: all }: { m: typeof M }) {
  const locale = useSyncExternalStore(subscribe, browserLocale, () => "es" as const);
  const m = all[locale];
  return (
    <main lang={locale} className="page" style={{ margin: "0 auto", maxWidth: 520, minHeight: "100dvh", justifyContent: "center", alignItems: "flex-start" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo-360.png" alt={m.logoAlt} width={180} height={45} style={{ height: 45, width: "auto" }} />
      <h1 style={{ fontSize: 30, margin: 0 }}>{m.h1}</h1>
      <p className="muted" style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>{m.text}</p>
      <button type="button" className="btn" onClick={() => window.location.reload()}>{m.retry}</button>
    </main>
  );
}
