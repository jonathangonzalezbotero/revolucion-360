"use client";
import { useState, useTransition } from "react";
import { fill, type Locale } from "@/i18n";
import { ConfirmButton, useToast } from "@/components/ui/client";
import { Icon } from "@/components/ui/Icon";
import { formatDate, formatMoney, type Cents, type ISODate, type MoneyFormat } from "@/lib/engine";
import { addTaxEntry, deleteTaxEntry, setTaxEnabled, setTaxPercent } from "./actions";
import { percentText, type TaxStatus } from "./lib";
import type { DeudasMessages } from "./messages";
import css from "./deudas.module.css";

type Entry = { id: string; date: ISODate; kind: "ingreso" | "apartado" | "pago"; amountCents: Cents; note: string };
type Props = {
  /** Aviso del país (admin, Contenido por país). Si tiene texto, reemplaza el aviso general. */
  note: string;
  enabled: boolean; percentBps: number; status: TaxStatus; entries: Entry[]; freelance: string; retirement: string; taxOffice: string;
  year: number; today: ISODate; canEdit: boolean; m: DeudasMessages; fmt: MoneyFormat; locale: Locale;
};
const KINDS = ["ingreso", "apartado", "pago"] as const;

/** Apartado para impuestos: solo si el usuario lo activa. El % lo da su contador; la app calcula cuánto apartar. */
export function Impuestos(p: Props) {
  const { m, fmt, locale, status: st, freelance, canEdit } = p;
  const toast = useToast();
  const [pending, start] = useTransition();
  const [pct, setPct] = useState(p.percentBps ? percentText(p.percentBps) : "");
  const [f, setF] = useState({ kind: "ingreso" as Entry["kind"], amount: "", date: p.today, note: "" });
  const [error, setError] = useState("");
  const money = (c: Cents) => formatMoney(c, fmt);
  const go = (fn: () => Promise<{ ok: boolean; error?: string }>, done: () => void) => start(async () => {
    setError("");
    const r = await fn();
    if (r.ok) done(); else setError(r.error ?? "");
  });
  const kindLabel = (k: Entry["kind"]) => fill(m.taxKinds[k], { freelance, taxOffice: p.taxOffice });

  return (
    <section id="impuestos" aria-labelledby="abn-t" className={css.section}>
      <div className={css.secHead}>
        <span aria-hidden="true" className={css.secIcon} style={{ background: "var(--ambar-fondo)" }}><Icon name="receipt" size={22} color="var(--amarillo-oscuro)" /></span>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><h2 id="abn-t">{fill(m.taxTitle, { freelance })}</h2><span className="small muted">{fill(m.taxSub, { freelance, retirement: p.retirement })}</span></div>
      </div>

      {!p.enabled ? (
        <div className="row wrap" style={{ gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{fill(m.taxQ, { freelance })}</span>
          {canEdit ? <button type="button" className="btn" disabled={pending} onClick={() => go(() => setTaxEnabled({ enabled: true }), () => toast(m.tTaxOn))}>{m.taxYes}</button> : null}
          <span className="small muted">{m.taxIgnore}</span>
          {error ? <p role="alert" className="error">{error}</p> : null}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className={css.taxGrid}>
            <div className={css.ledgerCell} style={{ borderTop: 0, borderBottom: 0 }}><span>{fill(m.monthIncome, { freelance })}</span><strong className="num" style={{ fontSize: 22 }}>{money(st.monthIncomeCents)}</strong></div>
            <form className="field" onSubmit={(e) => { e.preventDefault(); go(() => setTaxPercent({ percent: pct }), () => toast(m.tPct)); }}>
              <label htmlFor="abn-pct">{m.pct}</label>
              <span className="row" style={{ gap: 8 }}>
                <input id="abn-pct" className={`${css.input} num`} style={{ fontWeight: 600, fontSize: 16 }} inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder={m.pctPh} disabled={!canEdit} />
                {canEdit ? <button type="submit" className="btn btn-secondary" disabled={pending || pct === (p.percentBps ? percentText(p.percentBps) : "")} style={{ minHeight: 46, flex: "none" }}>{m.pctSave}</button> : null}
              </span>
            </form>
            <div className={css.ledgerCell}><span>{m.setAside}</span><strong className="num big">{money(st.monthToSetAsideCents)}</strong></div>
          </div>
          {p.percentBps === 0 ? <p className="small muted">{m.needPct}</p> : null}
          <p className={css.warn} style={p.note ? { whiteSpace: "pre-line" } : undefined}>{p.note || fill(m.taxWarn, { retirement: p.retirement })}</p>

          <div className={css.yearRow}>
            <div><span>{fill(m.yIncome, { year: p.year })}</span><strong className="num">{money(st.yearIncomeCents)}</strong></div>
            <div><span>{m.yShould}</span><strong className="num">{money(st.shouldCents)}</strong></div>
            <div><span>{m.yHave}</span><strong className="num">{money(st.haveCents)}</strong></div>
            <div><span>{st.missingCents > 0 ? m.yMissing : m.yOk}</span><strong className={`num ${st.missingCents > 0 ? "neg" : ""}`}>{st.missingCents > 0 ? money(st.missingCents) : "✓"}</strong></div>
          </div>

          {canEdit ? (
            <form className={css.entryForm} onSubmit={(e) => {
              e.preventDefault();
              go(() => addTaxEntry(f), () => { setF({ ...f, amount: "", note: "" }); toast(m.tEntry); });
            }}>
              <div role="radiogroup" aria-label={m.taxKindAria} className={css.seg}>
                {KINDS.map((k) => <button key={k} type="button" role="radio" aria-checked={f.kind === k} onClick={() => setF({ ...f, kind: k })}>{kindLabel(k)}</button>)}
              </div>
              <div className={css.entryFields}>
                <div className="field"><label htmlFor="tx-a">{m.amount}</label><input id="tx-a" className={`${css.input} num`} inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder={formatMoney(0, fmt)} required /></div>
                <div className="field"><label htmlFor="tx-d">{m.date}</label><input id="tx-d" className={css.input} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
                <div className="field"><label htmlFor="tx-n">{m.note}</label><input id="tx-n" className={css.input} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder={m.notePh} maxLength={120} /></div>
                <button type="submit" className="btn" disabled={pending} style={{ minHeight: 46 }}>{m.taxReg}</button>
              </div>
              {error ? <p role="alert" className="error">{error}</p> : null}
            </form>
          ) : null}

          <div>
            <h3 className="label">{m.taxRecent}</h3>
            {p.entries.length === 0 ? <p className="small muted" style={{ paddingTop: 6 }}>{fill(m.taxNone, { freelance })}</p> : (
              <ul className={css.list}>
                {p.entries.map((e) => (
                  <li key={e.id}>
                    <span><strong style={{ fontSize: 14 }}>{kindLabel(e.kind)}</strong><span className="xs muted">{formatDate(e.date, locale, "short")}{e.note ? ` · ${e.note}` : ""}</span></span>
                    <span className="row" style={{ gap: 8 }}>
                      <strong className={`num ${e.kind === "ingreso" ? "pos" : ""}`}>{money(e.amountCents)}</strong>
                      {canEdit ? <ConfirmButton label={m.delEntry} confirmLabel={m.delEntryConfirm} className="btn btn-ghost btn-sm" onConfirm={async () => { const r = await deleteTaxEntry({ id: e.id }); if (r.ok) toast(m.tEntryDel); else setError(r.error); }} /> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {canEdit ? <button type="button" className="link" style={{ alignSelf: "flex-start", minHeight: 44, color: "var(--gris)" }} disabled={pending} onClick={() => go(() => setTaxEnabled({ enabled: false }), () => toast(m.tTaxOff))}>{m.taxOff}</button> : null}
        </div>
      )}
    </section>
  );
}
