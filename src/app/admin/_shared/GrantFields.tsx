"use client";
import { fill } from "@/i18n";
import { formatDate } from "@/lib/engine";
import css from "./admin.module.css";
import { expiryFrom, type DurationMode } from "./lib";
import type { AdminText } from "./messages";

export type GrantValue = { kind: "alumno" | "fundador"; mode: DurationMode; months: string; until: string };
export const GRANT_DEFAULT: GrantValue = { kind: "alumno", mode: "meses", months: "12", until: "" };

/** Tipo de acceso + duración + vista previa del vencimiento. Lo usan Usuarios, Grupos y la ficha del usuario. */
export function GrantFields({ t, locale, today, from, value, onChange, idPrefix, showKind = true }: {
  t: AdminText; locale: string; today: string; from?: string; value: GrantValue; onChange: (v: GrantValue) => void; idPrefix: string; showKind?: boolean;
}) {
  const g = t.grant;
  const set = (p: Partial<GrantValue>) => onChange({ ...value, ...p });
  const e = expiryFrom(value.mode, value, today, from);
  const preview = e.ok
    ? (e.until ? fill(g.expires, { date: formatDate(e.until, locale) }) : t.never)
    : value.mode === "meses" ? g.typeMonths : value.until && e.error === "past" ? t.errors.past : g.pickDate;
  return (
    <>
      {showKind ? (
        <div className="stack" style={{ gap: 8 }}>
          <span id={`${idPrefix}-k`} style={{ fontSize: 13, fontWeight: 600 }}>{g.kind}</span>
          <div role="radiogroup" aria-labelledby={`${idPrefix}-k`} className={css.radios}>
            {(["alumno", "fundador"] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={value.kind === k} className={css.radio} onClick={() => set({ kind: k })}>{t.kinds[k]}</button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="stack" style={{ gap: 8 }}>
        <span id={`${idPrefix}-d`} style={{ fontSize: 13, fontWeight: 600 }}>{g.dur}</span>
        <div role="radiogroup" aria-labelledby={`${idPrefix}-d`} className={css.radios}>
          {(["vida", "meses", "fecha"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={value.mode === m} className={css.radio} onClick={() => set({ mode: m })}>{g[m]}</button>
          ))}
        </div>
        <div className="row wrap" style={{ gap: 12 }}>
          {value.mode === "meses" ? (
            <><label htmlFor={`${idPrefix}-m`} style={{ fontSize: 13, fontWeight: 600 }}>{g.months}</label>
              <input id={`${idPrefix}-m`} className="input num" inputMode="numeric" value={value.months} onChange={(ev) => set({ months: ev.target.value.replace(/\D/g, "").slice(0, 3) })} style={{ width: 90 }} /></>
          ) : null}
          {value.mode === "fecha" ? (
            <><label htmlFor={`${idPrefix}-f`} style={{ fontSize: 13, fontWeight: 600 }}>{g.until}</label>
              <input id={`${idPrefix}-f`} className="input" type="date" min={today} value={value.until} onChange={(ev) => set({ until: ev.target.value })} style={{ width: "auto" }} /></>
          ) : null}
          <span className={css.preview} aria-live="polite">{preview}</span>
        </div>
      </div>
    </>
  );
}
