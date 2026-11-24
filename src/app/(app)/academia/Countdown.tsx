"use client";
// Cuenta regresiva hasta que se libera un curso programado. Arranca con la hora del servidor para no saltar al hidratar.
import { useEffect, useState } from "react";
import { fill } from "@/i18n";
import { countdown } from "./lib";

type T = { cd: { d: string; h: string; m: string; s: string }; cdAria: string; released: string };

export function Countdown({ targetMs, serverNowMs, t }: { targetMs: number; serverNowMs: number; t: T }) {
  const [now, setNow] = useState(serverNowMs);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const c = countdown(targetMs, now);
  if (targetMs <= now) return <span role="status" style={{ fontSize: 14, fontWeight: 600 }}>{t.released}</span>;
  const pad = (n: number) => String(n).padStart(2, "0");
  const boxes: [number, string][] = [[c.d, t.cd.d], [c.h, t.cd.h], [c.m, t.cd.m], [c.s, t.cd.s]];
  return (
    <div role="timer" aria-label={fill(t.cdAria, { d: c.d, h: c.h, m: c.m })} style={{ display: "flex", gap: 8 }}>
      {boxes.map(([v, l]) => (
        <div key={l} aria-hidden="true" style={{ width: 66, borderRadius: 12, border: "1px solid var(--linea)", background: "var(--papel)", padding: "8px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <span className="num big" style={{ fontSize: 26, fontWeight: 600 }}>{pad(v)}</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: "var(--amarillo-texto)" }}>{l}</span>
        </div>
      ))}
    </div>
  );
}
