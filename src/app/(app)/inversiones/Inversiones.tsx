"use client";
import { useState, useTransition } from "react";
import { fill, type Locale } from "@/i18n";
import { Empty, PageHeader } from "@/components/ui/basics";
import { ConfirmButton, useToast } from "@/components/ui/client";
import { formatCompact, formatDate, formatMoney, investmentResult, type Cents, type ISODate, type MoneyFormat } from "@/lib/engine";
import type { Result } from "@/server/action";
import { addInvestmentEntry, createInvestment, setArchived, updateInvestment } from "./actions";
import { chartPoints, distribution, INV_TYPES, invTotals, TYPE_COLOR, type EntryKind, type InvType } from "./lib";
import type { InversionesMessages } from "./messages";
import css from "./inversiones.module.css";

export type InvView = {
  id: string; platform: string; type: InvType; contributedCents: Cents; valueCents: Cents; valueDate: ISODate; archived: boolean;
  line: { id: string; name: string; yearCents: Cents } | null;
  entries: { id: string; date: ISODate; kind: EntryKind; amountCents: Cents }[];
};
type LineOpt = { id: string; name: string; takenBy: string | null };
type Props = {
  items: InvView[]; series: { date: ISODate; cents: Cents }[]; lines: LineOpt[]; planCents: Cents; incomeCents: Cents; types: Record<InvType, string>; retirement: string; showSuper: boolean;
  fmt: MoneyFormat; locale: Locale; today: ISODate; year: number; canEdit: boolean; planOn: boolean; category: string;
  m: InversionesMessages; t: { cancel: string; save: string; add: string; disclaimer: string };
};
type Run = <T>(fn: () => Promise<Result<T>>, after: (r: Extract<Result<T>, { ok: true }>) => void, onError: (e: string) => void) => void;

const resultText = (contributed: Cents, value: Cents, fmt: MoneyFormat) => {
  const r = investmentResult(contributed, value);
  return `${formatMoney(r.gainCents, fmt, { sign: true })}${contributed > 0 ? ` (${(r.gainPct * 100).toFixed(1)}%)` : ""}`;
};
const tone = (gain: Cents) => (gain < 0 ? "var(--ambar-texto)" : gain > 0 ? "var(--verde-fuerte)" : "var(--gris)");

export function Inversiones(p: Props) {
  const { m, fmt, canEdit } = p;
  const toast = useToast();
  const [pending, start] = useTransition();
  const [showNew, setShowNew] = useState(false);
  const run: Run = (fn, after, onError) => start(async () => {
    const r = await fn();
    if (r.ok) after(r); else onError(r.error);
  });
  const active = p.items.filter((i) => !i.archived), archived = p.items.filter((i) => i.archived);
  const tot = invTotals(active);
  const dist = distribution(active);
  const money = (c: Cents) => formatMoney(c, fmt);
  const result = tot.contributedCents || tot.valueCents ? resultText(tot.contributedCents, tot.valueCents, fmt) : money(0);

  return (
    <>
      <PageHeader title={m.title} eyebrow={<><span className="only-desktop">{m.eyebrow}</span><span className="only-mobile">{m.eyebrowShort}</span></>}>
        {canEdit ? (
          <>
            <button type="button" className="btn only-desktop" aria-expanded={showNew} onClick={() => setShowNew(!showNew)}>{m.add}</button>
            <button type="button" className={`${css.plus} only-mobile`} aria-expanded={showNew} aria-label={m.addAria} onClick={() => setShowNew(!showNew)}>+</button>
          </>
        ) : null}
      </PageHeader>

      <section aria-label={m.totals} className={css.totals}>
        <div><span className={css.k}>{m.worth}</span><span className={`num big ${css.vMain}`}>{money(tot.valueCents)}</span></div>
        <div className={css.deskOnly}><span className={css.k}>{m.put}</span><span className={`num big ${css.v}`}>{money(tot.contributedCents)}</span></div>
        <div className={css.deskOnly}><span className={css.k}>{m.result}</span><span className={`num big ${css.v}`} style={{ color: tot.gainCents < 0 ? "var(--rojo)" : tot.gainCents > 0 ? "var(--verde)" : undefined }}>{result}</span></div>
        <div className={css.deskOnly}>
          <span className={css.k}>{fill(m.planYear, { year: p.year })}</span><span className={`num big ${css.v}`}>{money(p.planCents)}</span>
          {p.incomeCents > 0 ? <span className={css.note}>{fill(m.ofIncome, { pct: `${((p.planCents / p.incomeCents) * 100).toFixed(1)}%` })}</span> : null}
        </div>
        <div className={css.mobileRow}>
          <span>{m.put} <strong className="num" style={{ color: "var(--tinta)" }}>{money(tot.contributedCents)}</strong></span>
          <span>{m.result} <strong className="num" style={{ color: tot.gainCents < 0 ? "var(--rojo)" : tot.gainCents > 0 ? "var(--verde)" : "var(--tinta)" }}>{result}</strong></span>
        </div>
      </section>

      {showNew && canEdit ? <InvForm p={p} run={run} pending={pending} onClose={() => setShowNew(false)} onSaved={(warn) => { setShowNew(false); toast(warn || m.tCreated); }} /> : null}

      {active.length === 0 ? (
        <Empty icon="sprout" title={m.emptyTitle} text={m.emptyText}>{canEdit && !showNew ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowNew(true)}>{m.emptyCta}</button> : null}</Empty>
      ) : (
        <div className={css.cards}>
          {active.map((i) => <InvCard key={i.id} i={i} p={p} total={tot.valueCents} run={run} pending={pending} toast={toast} />)}
        </div>
      )}

      {active.length ? <Chart p={p} /> : null}

      <div className={css.bottom}>
        <section aria-labelledby="dist" className={css.dist}>
          <h2 id="dist">{m.dist}</h2>
          {dist.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div aria-hidden="true" className={css.stack}>{dist.map((d) => <div key={d.type} style={{ background: TYPE_COLOR[d.type], width: `${(d.share * 100).toFixed(1)}%` }} />)}</div>
              {dist.map((d) => (
                <div key={d.type} className={css.distRow}>
                  <span aria-hidden="true" className={css.swatch} style={{ background: TYPE_COLOR[d.type] }} />
                  <span style={{ flex: 1 }}>{p.types[d.type]}</span>
                  <span className="num muted">{(d.share * 100).toFixed(0)}%</span>
                  <strong className="num" style={{ minWidth: 80, textAlign: "right" }}>{money(d.valueCents)}</strong>
                </div>
              ))}
            </div>
          ) : <p className="small muted" style={{ lineHeight: 1.5 }}>{m.distEmpty}</p>}
        </section>
        <div className="stack">
          {p.showSuper ? <p className={css.note}><strong>{fill(m.superNote1, { retirement: p.retirement })}</strong> {m.superNote2}</p> : null}
          <p className="xs muted">{m.tracking}</p>
          <p className="xs muted">{p.t.disclaimer}</p>
        </div>
      </div>

      {archived.length ? (
        <details className={css.archived}>
          <summary>{fill(m.archived, { n: archived.length })}</summary>
          <ul>
            {archived.map((i) => (
              <li key={i.id}>
                <span>{i.platform} <span className="xs muted">· {p.types[i.type]} · {money(i.valueCents)}</span></span>
                {canEdit ? <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => setArchived({ id: i.id, archived: false }), () => toast(m.tRestored), (e) => toast(e))}>{m.restore}</button> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

function LinkSelect({ p, id, value, onChange, own }: { p: Props; id: string; value: string; onChange: (v: string) => void; own?: string }) {
  const { m } = p;
  const opts = p.lines.filter((l) => !l.takenBy || l.takenBy === own);
  return (
    <select id={id} className={css.input} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{m.noLink}</option>
      {opts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      <option value="new">{fill(m.newLine, { category: p.category })}</option>
    </select>
  );
}

function InvForm({ p, run, pending, onClose, onSaved, inv }: { p: Props; run: Run; pending: boolean; onClose: () => void; onSaved: (warn: string) => void; inv?: InvView }) {
  const { m, fmt } = p;
  const uid = inv?.id ?? "new";
  const [f, setF] = useState({ platform: inv?.platform ?? "", type: inv?.type ?? ("super" as InvType), contributed: "", value: "", link: inv?.line?.id ?? "", monthly: "" });
  const [error, setError] = useState("");
  const zero = formatMoney(0, fmt);
  return (
    <form aria-labelledby={`if-${uid}`} className={inv ? "stack" : css.form} style={inv ? { gap: 14 } : undefined} onSubmit={(e) => {
      e.preventDefault(); setError("");
      if (inv) run(() => updateInvestment({ id: inv.id, platform: f.platform, type: f.type, link: f.link, monthly: f.monthly }), () => onSaved(""), setError);
      else run(() => createInvestment(f), (r) => onSaved(r.data.linkError ?? ""), setError);
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 id={`if-${uid}`} className={inv ? "label" : css.formTitle}>{inv ? fill(m.editTitle, { name: inv.platform }) : m.newTitle}</h2>
        {inv ? null : <span className="small muted">{m.newSub}</span>}
      </div>
      <div className={inv ? "stack" : css.grid2}>
        <div className="field"><label htmlFor={`in-${uid}`}>{m.name}</label><input id={`in-${uid}`} className={css.input} value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value })} placeholder={m.namePh} maxLength={80} required /></div>
        {p.planOn ? <div className="field"><label htmlFor={`il-${uid}`}>{m.link}</label><LinkSelect p={p} id={`il-${uid}`} value={f.link} onChange={(link) => setF({ ...f, link })} own={inv?.id} /></div> : null}
        {f.link === "new" ? <div className="field"><label htmlFor={`im-${uid}`}>{m.monthly}</label><input id={`im-${uid}`} className={`${css.input} num`} inputMode="decimal" value={f.monthly} onChange={(e) => setF({ ...f, monthly: e.target.value })} placeholder={zero} required /><span className="hint">{m.monthlyHint}</span></div> : null}
        {inv ? null : <>
          <div className="field"><label htmlFor={`ia-${uid}`}>{m.contributed}</label><input id={`ia-${uid}`} className={`${css.input} num`} inputMode="decimal" value={f.contributed} onChange={(e) => setF({ ...f, contributed: e.target.value })} placeholder={zero} /></div>
          <div className="field"><label htmlFor={`iv-${uid}`}>{m.value}</label><input id={`iv-${uid}`} className={`${css.input} num`} inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder={zero} /></div>
        </>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span id={`it-${uid}`} className="label">{m.type}</span>
        <div role="radiogroup" aria-labelledby={`it-${uid}`} className={css.chips}>
          {INV_TYPES.map((t) => <button key={t} type="button" role="radio" aria-checked={f.type === t} className={css.chip} onClick={() => setF({ ...f, type: t })}>{p.types[t]}</button>)}
        </div>
      </div>
      {error ? <p role="alert" className="error">{error}</p> : null}
      <div className={css.actions} style={inv ? { justifyContent: "space-between" } : undefined}>
        {inv ? <ConfirmButton label={m.archive} confirmLabel={m.archiveConfirm} className="btn btn-danger" onConfirm={async () => { const r = await setArchived({ id: inv.id, archived: true }); if (r.ok) onSaved(m.tArchived); else setError(r.error); }} /> : null}
        <span className="row" style={{ gap: 10 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{p.t.cancel}</button>
          <button type="submit" className="btn" disabled={pending}>{inv ? p.t.save : p.t.add}</button>
        </span>
      </div>
      {inv ? <p className="xs muted">{m.archiveHint}</p> : null}
    </form>
  );
}

function InvCard({ i, p, total, run, pending, toast }: { i: InvView; p: Props; total: Cents; run: Run; pending: boolean; toast: (t: string, pts?: number) => void }) {
  const { m, fmt, locale, canEdit, today } = p;
  const [open, setOpen] = useState<"" | "log" | "history" | "edit">("");
  const [value, setValue] = useState("");
  const [log, setLog] = useState({ kind: "aporte" as EntryKind, amount: "", date: today });
  const [error, setError] = useState("");
  const has = i.contributedCents > 0 || i.valueCents > 0;
  const gain = i.valueCents - i.contributedCents;
  const toggle = (k: typeof open) => { setOpen(open === k ? "" : k); setError(""); };
  return (
    <article className={`${css.card} ${open === "edit" ? css.cardOpen : ""}`}>
      <div className="row">
        <span aria-hidden="true" className={css.avatar} style={{ background: TYPE_COLOR[i.type], color: i.type === "cripto" ? "var(--tinta)" : "var(--blanco)" }}>{i.platform.charAt(0).toUpperCase()}</span>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <h3>{i.platform}</h3>
          <span className="xs muted">{p.types[i.type]}{total > 0 ? ` · ${fill(m.share, { pct: ((i.valueCents / total) * 100).toFixed(0) })}` : ""}</span>
        </div>
      </div>
      {open === "edit" ? <InvForm p={p} inv={i} run={run} pending={pending} onClose={() => setOpen("")} onSaved={(text) => { setOpen(""); toast(text || m.tSaved); }} /> : <>
        <div className={css.boxes}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}><span className={css.lbl}>{m.put}</span><span className={`${css.box} num`}>{formatMoney(i.contributedCents, fmt)}</span></div>
          <form style={{ display: "flex", flexDirection: "column", gap: 5 }} onSubmit={(e) => {
            e.preventDefault(); setError("");
            run(() => addInvestmentEntry({ id: i.id, kind: "valor", amount: value, date: "" }), () => { setValue(""); toast(m.tValue); }, setError);
          }}>
            <label htmlFor={`v-${i.id}`}>{m.worth}</label>
            <span className={css.valueRow}>
              <input id={`v-${i.id}`} className={`${css.box} num`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={formatMoney(i.valueCents, fmt)} disabled={!canEdit} aria-label={fill(m.valueAria, { name: i.platform })} />
              {canEdit && value.trim() ? <button type="submit" className="btn" disabled={pending}>{m.saveValue}</button> : null}
            </span>
          </form>
        </div>
        <div className="row-between small"><span className="muted">{m.result}</span><strong className="num" style={{ color: has ? tone(gain) : "var(--gris)" }}>{has ? resultText(i.contributedCents, i.valueCents, fmt) : m.resultEmpty}</strong></div>
        {i.line ? <span className={css.linked}>{fill(m.linked, { line: i.line.name, amount: formatMoney(i.line.yearCents, fmt), year: p.year })}</span> : null}
        <span className="xs muted">{fill(m.updated, { date: formatDate(i.valueDate, locale, "short") })}</span>
        {error && open !== "log" ? <p role="alert" className="error">{error}</p> : null}
        <div className={css.cardBtns}>
          {canEdit ? <button type="button" className="btn" aria-expanded={open === "log"} onClick={() => toggle("log")}>{m.register}</button> : null}
          <button type="button" className="btn btn-secondary" aria-expanded={open === "history"} onClick={() => toggle("history")}>{open === "history" ? m.hideHistory : m.history}</button>
          {canEdit ? <button type="button" className="btn btn-secondary" aria-expanded={false} onClick={() => toggle("edit")}>{m.edit}</button> : null}
        </div>
        {open === "log" ? (
          <form className={css.panel} onSubmit={(e) => {
            e.preventDefault(); setError("");
            run(() => addInvestmentEntry({ id: i.id, ...log }), () => { setOpen(""); setLog({ ...log, amount: "" }); toast(m.tEntry); }, setError);
          }}>
            <div role="radiogroup" aria-label={m.kindAria} className={css.modes}>
              {(["aporte", "retiro", "valor"] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={log.kind === k} onClick={() => setLog({ ...log, kind: k })}>{m.kinds[k]}</button>)}
            </div>
            <div className={css.boxes}>
              <div className="field"><label htmlFor={`la-${i.id}`}>{m.amount}</label><input id={`la-${i.id}`} className={`${css.input} num`} inputMode="decimal" value={log.amount} onChange={(e) => setLog({ ...log, amount: e.target.value })} placeholder={formatMoney(0, fmt)} required /></div>
              <div className="field"><label htmlFor={`ld-${i.id}`}>{m.date}</label><input id={`ld-${i.id}`} className={css.input} type="date" value={log.date} max={today} onChange={(e) => setLog({ ...log, date: e.target.value })} /></div>
            </div>
            {error ? <p role="alert" className="error">{error}</p> : null}
            <div className={css.actions} style={{ gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => toggle("log")}>{p.t.cancel}</button>
              <button type="submit" className="btn" disabled={pending}>{m.register}</button>
            </div>
          </form>
        ) : null}
        {open === "history" ? (
          i.entries.length ? (
            <ul className={css.history}>
              {i.entries.map((e) => <li key={e.id}><span>{m.kindsPast[e.kind]} · <span className="muted">{formatDate(e.date, locale, "short")} {e.date.slice(0, 4)}</span></span><strong className="num">{e.kind === "retiro" ? "−" : e.kind === "aporte" ? "+" : ""}{formatMoney(e.amountCents, fmt)}</strong></li>)}
            </ul>
          ) : <p className="small muted">{m.noHistory}</p>
        ) : null}
      </>}
    </article>
  );
}

/** Evolución de lo que vale todo (SVG a mano). Con menos de 2 fechas, explica qué falta: nunca un gráfico vacío. */
function Chart({ p }: { p: Props }) {
  const { m, fmt, locale, series } = p;
  const g = chartPoints(series);
  return (
    <section aria-labelledby="evo" className={css.chartCard}>
      <h2 id="evo">{m.chart}</h2>
      {series.length < 2 ? <p className="small muted" style={{ lineHeight: 1.5 }}>{m.chartEmpty}</p> : (
        <>
          <div className={css.chart} role="img" aria-label={m.chartAria}>
            {[0, 1, 2, 3, 4].map((k) => <div key={k} className={css.grid} style={{ bottom: `${k * 25}%`, borderTopStyle: k === 0 ? "solid" : "dashed" }}><span className="num">{formatCompact((g.max / 4) * k)}</span></div>)}
            <svg aria-hidden="true" viewBox="0 0 1000 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
              <polyline points={g.points.map((pt) => `${pt.x},${pt.y}`).join(" ")} fill="none" stroke="var(--tinta)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </svg>
            {g.points.map((pt, k) => <span key={k} aria-hidden="true" className={css.dot} style={{ left: `${pt.x / 10}%`, top: `${pt.y}%` }} title={fill(m.chartPoint, { date: formatDate(series[k].date, locale, "short"), amount: formatMoney(series[k].cents, fmt) })} />)}
          </div>
          <div className={css.xAxis} aria-hidden="true"><span>{formatDate(series[0].date, locale, "short")} {series[0].date.slice(0, 4)}</span><span>{formatDate(series[series.length - 1].date, locale, "short")} {series[series.length - 1].date.slice(0, 4)}</span></div>
          <ul className="sr-only">{series.map((s) => <li key={s.date}>{fill(m.chartPoint, { date: formatDate(s.date, locale), amount: formatMoney(s.cents, fmt) })}</li>)}</ul>
        </>
      )}
    </section>
  );
}
