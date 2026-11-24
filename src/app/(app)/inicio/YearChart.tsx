"use client";
import { useState } from "react";
import { fill } from "@/i18n";
import { formatCompact, formatMoney, monthName, monthShort, type MoneyFormat } from "@/lib/engine";

type T = { thisMonth: string; plan: string; left: string; missing: string; pickMonth: string; legendOut: string; legendIn: string; aria: string; in: string; out: string };

/** Tu año, mes a mes: barras = sale, línea verde = entra. Toca o pasa por un mes para ver su detalle. */
export function YearChart({ months, current, fmt, locale, t }: { months: { income: number; expense: number }[]; current: number; fmt: MoneyFormat; locale: "es" | "en"; t: T }) {
  const [sel, setSel] = useState(current - 1);
  const top = Math.max(...months.flatMap((m) => [m.income, m.expense]), 100);
  const step = niceStep(top / 4);
  const max = step * 4;
  const net = months[sel].income - months[sel].expense;
  const points = months.map((m, i) => `${(((i + 0.5) / 12) * 1000).toFixed(1)},${(100 - (m.income / max) * 100).toFixed(2)}`).join(" ");
  const tip = monthName(sel + 1, locale) + (sel === current - 1 ? ` · ${t.thisMonth}` : sel > current - 1 ? ` · ${t.plan}` : "");
  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 28px", alignItems: "baseline", fontSize: 13, color: "var(--gris)" }}>
        <strong style={{ fontSize: 15, color: "var(--tinta)" }}>{tip}</strong>
        <span>{t.in} <strong className="num" style={{ color: "var(--tinta)" }}>{formatMoney(months[sel].income, fmt)}</strong></span>
        <span>{t.out} <strong className="num" style={{ color: "var(--tinta)" }}>{formatMoney(months[sel].expense, fmt)}</strong></span>
        <span>{net < 0 ? t.missing : t.left} <strong className={`num ${net < 0 ? "neg" : "pos"}`}>{formatMoney(Math.abs(net), fmt)}</strong></span>
      </div>
      <div style={{ position: "relative", height: 220, margin: "6px 0 0 40px" }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ position: "absolute", left: 0, right: 0, bottom: `${i * 25}%`, borderTop: `1px ${i === 0 ? "solid" : "dashed"} #E2DFD6` }}>
            <span className="num" style={{ position: "absolute", left: 0, top: -9, transform: "translateX(-100%)", paddingRight: 8, fontSize: 11, color: "var(--gris-4)" }}>{formatCompact(step * i)}</span>
          </div>
        ))}
        <svg aria-hidden="true" viewBox="0 0 1000 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none", zIndex: 2 }}>
          <polyline points={points} fill="none" stroke="var(--verde)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
        <div role="radiogroup" aria-label={t.pickMonth} style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))" }}>
          {months.map((m, i) => (
            <button key={i} type="button" role="radio" aria-checked={i === sel} onClick={() => setSel(i)} onMouseEnter={() => setSel(i)}
              aria-label={fill(t.aria, { month: monthName(i + 1, locale), in: formatMoney(m.income, fmt), out: formatMoney(m.expense, fmt) })}
              style={{ position: "relative", border: 0, background: "transparent", padding: 0, height: "100%" }}>
              <span style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "46%", height: `${(m.expense / max) * 100}%`, background: i === sel ? "var(--tinta)" : i < current - 1 ? "var(--linea-punteada)" : "#DEDAD0", borderRadius: "4px 4px 0 0", transition: "background-color .15s ease" }} />
              <span style={{ position: "absolute", bottom: `${(m.income / max) * 100}%`, left: "50%", width: 8, height: 8, margin: "0 0 -4px -4px", borderRadius: "50%", background: "var(--blanco)", border: "2px solid var(--verde)", zIndex: 3 }} />
            </button>
          ))}
        </div>
      </div>
      <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", marginLeft: 40 }}>
        {months.map((m, i) => {
          const n = m.income - m.expense;
          return (
            <span key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, paddingTop: 8 }}>
              <span style={{ fontSize: 12, color: i === sel ? "var(--tinta)" : "#7A7D73", fontWeight: i === sel ? 600 : 400 }}><span className="only-desktop">{monthShort(i + 1, locale)}</span><span className="only-mobile">{monthShort(i + 1, locale).charAt(0)}</span></span>
              <span className={`num only-desktop ${n < 0 ? "neg" : "pos"}`} style={{ fontSize: 11 }}>{n < 0 ? "−" : "+"}{formatCompact(Math.abs(n))}</span>
            </span>
          );
        })}
      </div>
      <div className="xs muted" style={{ display: "flex", gap: 18 }}>
        <span className="row" style={{ gap: 6 }}><span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 2, background: "var(--linea-punteada)" }} />{t.legendOut}</span>
        <span className="row" style={{ gap: 6 }}><span aria-hidden="true" style={{ width: 14, height: 2, background: "var(--verde)" }} />{t.legendIn}</span>
      </div>
    </>
  );
}

/** Paso "redondo" para el eje: 1, 2, 2.5 o 5 × 10ⁿ (en centavos). */
function niceStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}
