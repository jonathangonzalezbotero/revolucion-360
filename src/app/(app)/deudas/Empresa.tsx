"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { fill, type Locale } from "@/i18n";
import { ConfirmButton, useToast } from "@/components/ui/client";
import { Icon } from "@/components/ui/Icon";
import { formatDate, formatMoney, type Cents, type ISODate, type MoneyFormat } from "@/lib/engine";
import { addCompanyEntry, classifyCompanyEntry, deleteCompanyEntry } from "./actions";
import { COMPANY_CLASSES, type CompanyClass } from "./lib";
import type { DeudasMessages } from "./messages";
import css from "./deudas.module.css";

type Klass = (typeof COMPANY_CLASSES)[number];
type Entry = { id: string; date: ISODate; kind: "aporte" | "retiro"; cls: CompanyClass; amountCents: Cents; note: string };
type Props = {
  title: string; summaryLabel: string; note: string; retirement: string; taxOffice: string;
  sum: { inCents: Cents; outCents: Cents; netCents: Cents; byClass: Record<Klass, Cents>; unclassifiedCents: Cents };
  unclassified: Entry[]; recent: Entry[]; year: number; today: ISODate; canEdit: boolean; m: DeudasMessages; fmt: MoneyFormat; locale: Locale;
};

/** Cuenta con la empresa: sección avanzada plegada. Se abre sola al llegar con /deudas#empresa (enlace del Inicio). */
export function Empresa(p: Props) {
  const { m, fmt, locale, sum, canEdit } = p;
  const toast = useToast();
  const ref = useRef<HTMLDetailsElement>(null);
  const [pending, start] = useTransition();
  const [pick, setPick] = useState<Record<string, Klass | "">>({});
  const [f, setF] = useState({ kind: "retiro" as Entry["kind"], amount: "", date: p.today, cls: "sin_clasificar" as CompanyClass, note: "" });
  const [error, setError] = useState("");
  const money = (c: Cents) => formatMoney(c, fmt);
  const cls = (k: Klass) => ({ t: m.classes[k].t, d: fill(m.classes[k].d, { retirement: p.retirement, taxOffice: p.taxOffice }) });
  const go = (fn: () => Promise<{ ok: boolean; error?: string }>, done: () => void) => start(async () => {
    setError("");
    const r = await fn();
    if (r.ok) done(); else setError(r.error ?? "");
  });

  useEffect(() => {
    const openIfHash = () => {
      if (window.location.hash !== "#empresa" || !ref.current) return;
      ref.current.open = true;
      ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    openIfHash();
    window.addEventListener("hashchange", openIfHash);
    return () => window.removeEventListener("hashchange", openIfHash);
  }, []);

  const netNote = sum.netCents > 0 ? m.netMore : sum.netCents < 0 ? m.netLess : m.netEven;
  const label = (e: Entry) => (e.kind === "aporte" ? m.coKinds.aporte : e.cls === "sin_clasificar" ? m.unclassified : m.classes[e.cls].t);

  return (
    <details ref={ref} id="empresa" className={css.details}>
      <summary>{p.summaryLabel}</summary>
      <section aria-labelledby="co-t" className={css.coBody}>
        <div className={css.coHead}>
          <div className="row">
            <span aria-hidden="true" className={css.secIcon} style={{ background: "var(--azul-fondo)" }}><Icon name="home" size={22} color="var(--azul-oscuro)" /></span>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><h2 id="co-t" style={{ fontSize: 18, fontFamily: "var(--sans)", fontWeight: 600, letterSpacing: 0 }}>{p.title}</h2><span className="small muted">{m.coSub}</span></div>
          </div>
          {sum.unclassifiedCents > 0 ? <span className="pill pill-warn" style={{ fontSize: 12, padding: "6px 12px" }}>{fill(m.coUnclassified, { amount: money(sum.unclassifiedCents) })}</span> : null}
        </div>

        <div className={css.coCards}>
          <div className={css.coCard} style={{ background: "var(--azul-fondo)" }}><span style={{ color: "var(--azul-texto)" }}>{m.coIn}</span><span className="num big">{money(sum.inCents)}</span><span style={{ color: "var(--azul-texto)" }}>{m.coInSub}</span></div>
          <div className={css.coCard} style={{ background: "var(--verde-fondo)" }}><span style={{ color: "var(--verde-fuerte)" }}>{m.coOut}</span><span className="num big">{money(sum.outCents)}</span><span style={{ color: "var(--verde-fuerte)" }}>{m.coOutSub}</span></div>
          <div className={css.coCard} style={{ background: "var(--papel)" }}><span style={{ color: "var(--tinta-2)" }}>{fill(m.coNet, { year: p.year })}</span><span className="num big">{formatMoney(sum.netCents, fmt, { sign: true })}</span><span style={{ color: "var(--tinta-2)" }}>{netNote}</span></div>
        </div>

        <div className="stack" style={{ gap: 10 }}>
          <h3 style={{ fontSize: 15, fontFamily: "var(--sans)", fontWeight: 600, letterSpacing: 0 }}>{m.classifyTitle}</h3>
          <div className={`${css.classGrid} only-desktop`}>
            {COMPANY_CLASSES.map((k) => (
              <div key={k}><span style={{ fontSize: 14, fontWeight: 600 }}>{cls(k).t}</span><span className="xs muted" style={{ lineHeight: 1.4 }}>{cls(k).d}</span><span className="num" style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{money(sum.byClass[k])}</span></div>
            ))}
          </div>
          {p.unclassified.length === 0 ? <p className="small muted">{m.classifyNone}</p> : (
            <ul className={css.list}>
              {p.unclassified.map((e) => {
                const v = pick[e.id] ?? "";
                const aria = fill(m.classifyAria, { amount: money(e.amountCents), date: formatDate(e.date, locale, "short") });
                return (
                  <li key={e.id}>
                    <span><strong className="num" style={{ fontSize: 15 }}>{money(e.amountCents)}</strong><span className="xs muted">{formatDate(e.date, locale, "short")}{e.note ? ` · ${e.note}` : ""}</span></span>
                    {canEdit ? (
                      <span className={css.classify}>
                        <select aria-label={aria} value={v} onChange={(ev) => setPick({ ...pick, [e.id]: ev.target.value as Klass | "" })}>
                          <option value="">{m.pickClass}</option>
                          {COMPANY_CLASSES.map((k) => <option key={k} value={k}>{cls(k).t}</option>)}
                        </select>
                        <button type="button" className="btn btn-secondary btn-sm" disabled={pending || !v} onClick={() => go(() => classifyCompanyEntry({ id: e.id, cls: v }), () => toast(m.tClassified))}>{m.classifyBtn}</button>
                      </span>
                    ) : <span className="pill pill-warn">{m.unclassified}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {canEdit ? (
          <form className={css.entryForm} onSubmit={(e) => {
            e.preventDefault();
            go(() => addCompanyEntry(f), () => { setF({ ...f, amount: "", note: "" }); toast(m.tEntry); });
          }}>
            <h3 className="label">{m.coReg}</h3>
            <div role="radiogroup" aria-label={m.coKindAria} className={css.seg}>
              {(["retiro", "aporte"] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={f.kind === k} onClick={() => setF({ ...f, kind: k })}>{m.coKinds[k]}</button>)}
            </div>
            <div className={css.entryFields}>
              <div className="field"><label htmlFor="co-a">{m.amount}</label><input id="co-a" className={`${css.input} num`} inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder={formatMoney(0, fmt)} required /></div>
              <div className="field"><label htmlFor="co-d">{m.date}</label><input id="co-d" className={css.input} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
              {f.kind === "retiro" ? (
                <div className="field"><label htmlFor="co-c">{m.coClass}</label>
                  <select id="co-c" className={css.input} value={f.cls} onChange={(e) => setF({ ...f, cls: e.target.value as CompanyClass })}>
                    <option value="sin_clasificar">{m.unclassified}</option>
                    {COMPANY_CLASSES.map((k) => <option key={k} value={k}>{cls(k).t}</option>)}
                  </select>
                </div>
              ) : null}
              <div className="field"><label htmlFor="co-n">{m.note}</label><input id="co-n" className={css.input} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder={m.notePh} maxLength={120} /></div>
              <button type="submit" className="btn" disabled={pending} style={{ minHeight: 46 }}>{m.taxReg}</button>
            </div>
          </form>
        ) : null}
        {error ? <p role="alert" className="error">{error}</p> : null}

        {p.recent.length ? (
          <div>
            <h3 className="label">{m.coRecent}</h3>
            <ul className={css.list}>
              {p.recent.map((e) => (
                <li key={e.id}>
                  <span><strong style={{ fontSize: 14 }}>{label(e)}</strong><span className="xs muted">{formatDate(e.date, locale, "short")}{e.note ? ` · ${e.note}` : ""}</span></span>
                  <span className="row" style={{ gap: 8 }}>
                    <strong className="num">{e.kind === "aporte" ? "−" : "+"}{money(e.amountCents)}</strong>
                    {canEdit ? <ConfirmButton label={m.delEntry} confirmLabel={m.delEntryConfirm} className="btn btn-ghost btn-sm" onConfirm={async () => { const r = await deleteCompanyEntry({ id: e.id }); if (r.ok) toast(m.tEntryDel); else setError(r.error); }} /> : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : <p className="small muted">{m.coNone}</p>}

        <p className={css.warn} style={{ borderRadius: "var(--r-xl)", padding: "14px 16px", lineHeight: 1.55 }}>{p.note}</p>
      </section>
    </details>
  );
}
