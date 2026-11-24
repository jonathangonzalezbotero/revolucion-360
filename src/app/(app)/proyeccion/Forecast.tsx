"use client";
import { useMemo, useState, useTransition } from "react";
import { fill, type Locale } from "@/i18n";
import { ConfirmButton, Segmented, Switch, useToast } from "@/components/ui/client";
import { Icon } from "@/components/ui/Icon";
import { formatCompact, formatMoney, monthShort, parseMoney, type Cents, type MoneyFormat } from "@/lib/engine";
import type { Result } from "@/server/action";
import { deleteScenario, renameScenario, saveScenario } from "./actions";
import {
  buildSeries, chartScale, EMPTY, firstNegative, isActive, lowestIndex, MAX_EXTRAS, polyline, presets, sameConfig, toggleLines, xOf, yPct,
  type HorizonMonth, type ScenarioConfig, type SeriesPoint, type YearPlan,
} from "./lib";
import type { ProyeccionMessages } from "./messages";
import css from "./proyeccion.module.css";

type Saved = { id: string; name: string; config: ScenarioConfig };
type Props = {
  months: HorizonMonth[]; plan1: YearPlan; plan2: YearPlan | null; startCents: Cents; savingLineIds: string[];
  usesDecember: boolean; nextYear: number; scenarios: Saved[]; canScenarios: boolean; canEdit: boolean;
  fmt: MoneyFormat; locale: Locale; m: ProyeccionMessages; lock: React.ReactNode;
};

export function Forecast(p: Props) {
  const { months, plan1, plan2, m, fmt, locale } = p;
  const toast = useToast();
  const [pending, start] = useTransition();
  const [startText, setStartText] = useState(formatMoney(p.startCents, fmt));
  const [cfg, setCfg] = useState<ScenarioConfig>(EMPTY);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [naming, setNaming] = useState<null | "new" | "rename">(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const short = (h: HorizonMonth) => monthShort(h.month, locale);
  const full = (h: HorizonMonth) => `${monthShort(h.month, locale).toLowerCase()} ${h.year}`;
  const money = (c: Cents) => formatMoney(c, fmt);

  const parsed = parseMoney(startText);
  const hasStart = startText.trim() !== "" && parsed !== null;
  const startC = parsed ?? 0;
  const lines = useMemo(() => toggleLines(months, plan1, plan2), [months, plan1, plan2]);
  const quick = useMemo(() => presets(months, lines, new Set(p.savingLineIds), m.moreName), [months, lines, p.savingLineIds, m.moreName]);
  const base = useMemo(() => buildSeries(startC, months, plan1, plan2), [startC, months, plan1, plan2]);
  const scen = useMemo(() => (isActive(cfg) ? buildSeries(startC, months, plan1, plan2, cfg) : null), [startC, months, plan1, plan2, cfg]);
  const shown = scen ?? base;
  const last = shown[shown.length - 1];
  const lowI = lowestIndex(shown);
  const low = shown[lowI];
  const neg = firstNegative(shown);
  const avgNet = Math.round(shown.reduce((a, x) => a + x.netCents, 0) / Math.max(1, shown.length));
  const heroVal = hasStart ? last.balanceCents : last.balanceCents - startC;
  const active = p.scenarios.find((x) => x.id === activeId) ?? null;
  const dirty = active ? !sameConfig(cfg, active.config) : isActive(cfg);

  function act<T>(fn: () => Promise<Result<T>>, done: (r: Extract<Result<T>, { ok: true }>) => void) {
    setError("");
    start(async () => {
      const r = await fn();
      if (r.ok) done(r); else setError(r.error);
    });
  }
  const pick = (next: ScenarioConfig, id: string | null = activeId) => { setCfg(next); setActiveId(id); setNaming(null); setError(""); };
  const toggle = (id: string) => pick({ ...cfg, off: cfg.off.includes(id) ? cfg.off.filter((x) => x !== id) : [...cfg.off, id] });

  const heroLabel = hasStart ? fill(m.heroEnd, { month: full(last) }) : shown.length === 1 ? m.heroChangeOne : fill(m.heroChange, { n: shown.length });
  const explain = !hasStart ? m.explainNoStart
    : neg ? fill(m.explainNeg, { month: full(neg), amount: money(neg.balanceCents) })
    : fill(m.explainPos, { month: full(low), amount: money(low.balanceCents) });

  const startBlock = (id: string, show: string) => (
    <div className={`field ${show}`} style={{ gap: 6 }}>
      <label htmlFor={id} style={{ fontSize: 13, fontWeight: 600, color: "var(--tinta)" }}>{m.start}</label>
      <input id={id} className={`input num ${css.startInput}`} inputMode="decimal" value={startText} onChange={(e) => setStartText(e.target.value)} placeholder={m.startPh} aria-describedby={`${id}-hint`} />
      <span id={`${id}-hint`} className={startText.trim() === "" ? css.warn : "xs muted"}>{startText.trim() === "" ? m.noStart : m.startHint}</span>
      {startText !== formatMoney(p.startCents, fmt) ? <button type="button" className={css.textBtn} onClick={() => setStartText(formatMoney(p.startCents, fmt))}>{m.resetStart}</button> : null}
    </div>
  );

  return (
    <div className={css.wrap}>
      {startBlock("start-m", "only-mobile-flex")}
      <div className={css.left}>
        <section aria-label={m.result} className={css.hero}>
          <div>
            <span className={css.k}>{heroLabel}</span>
            <span className={`num big ${css.heroVal}`} style={{ color: heroVal < 0 ? "var(--rojo)" : "var(--tinta)" }}>{formatMoney(heroVal, fmt, { sign: !hasStart })}</span>
          </div>
          <div>
            <span className={css.k}>{m.low}</span>
            <span className={css.sub}>{full(low)} · <span className="num">{money(low.balanceCents)}</span></span>
            {hasStart ? <span className={css.flag} style={{ color: low.balanceCents < 0 ? "var(--rojo)" : "var(--verde)" }}>{low.balanceCents < 0 ? m.lowNeg : m.lowPos}</span> : null}
          </div>
          <div className="only-desktop">
            <span className={css.k}>{m.perMonth}</span>
            <span className={`num ${css.sub}`}>{formatMoney(avgNet, fmt, { sign: true })}</span>
          </div>
          <p className={css.explain}>{explain}</p>
        </section>

        <section aria-label={m.chart} className={css.chartCard}>
          <Chart months={months} base={base} scen={scen} lowI={lowI} neg={neg} hasStart={hasStart} fmt={fmt} m={m} short={short} full={full} />
        </section>

        {p.canScenarios && quick.length ? (
          <section aria-labelledby="pq" className="stack" style={{ gap: 10 }}>
            <h2 id="pq" className={css.h3}>{m.quick}</h2>
            <div role="group" aria-labelledby="pq" className={css.chips}>
              {quick.map((q) => {
                const on = sameConfig(q.cfg, cfg);
                return (
                  <button key={q.id} type="button" className={css.chip} aria-pressed={on} onClick={() => pick(on ? EMPTY : q.cfg, null)}>
                    {q.id === "lose" ? fill(m.presetLose, { name: q.name ?? "" }) : q.id === "save" ? m.presetSave : m.presetMore}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <details className={css.help}>
          <summary>{m.howTo}</summary>
          <ul>
            <li>{m.how1}</li>
            <li>{m.how2a}<strong>{m.how2b}</strong>{m.how2c}</li>
            <li>{m.how3}</li>
            {p.usesDecember ? <li>{fill(m.how4, { year: p.nextYear })}</li> : null}
          </ul>
        </details>
      </div>

      <aside aria-labelledby="qps" className={css.aside}>
        {startBlock("start-d", "only-desktop")}
        {!p.canScenarios ? (
          <>
            <h2 id="qps" className={css.h2}>{m.whatIf}</h2>
            {p.lock}
          </>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <h2 id="qps" className={css.h2}>{m.whatIf}</h2>
              <span className="xs muted">{m.whatIfSub}</span>
            </div>
            {lines.length === 0 ? <span className="small muted">{m.noLines}</span> : (
              <ul className={css.lines}>
                {lines.map((l) => {
                  const on = !cfg.off.includes(l.id);
                  return (
                    <li key={l.id} data-off={!on}>
                      <Switch checked={on} onChange={() => toggle(l.id)} label={fill(m.include, { name: l.name })} />
                      <span className={css.lineName}>{l.name}</span>
                      <span className={`num ${css.lineAmt}`} style={{ color: l.kind === "income" ? "var(--verde-fuerte)" : "var(--tinta-2)" }}>{formatMoney(l.kind === "income" ? l.amountCents : -l.amountCents, fmt, { sign: true })}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <Extras key={`${months[0].idx}-${months.length}`} months={months} cfg={cfg} onChange={(next) => pick(next)} m={m} fmt={fmt} full={full} />
            <section aria-labelledby="esc" className={css.section}>
              <h2 id="esc" className={css.h3}>{m.scenarios}</h2>
              <div role="group" aria-labelledby="esc" className={css.chips}>
                <button type="button" className={css.chip} aria-pressed={activeId === null && !isActive(cfg)} onClick={() => pick(EMPTY, null)}>{m.base}</button>
                {p.scenarios.map((x) => <button key={x.id} type="button" className={css.chip} aria-pressed={activeId === x.id} onClick={() => pick(x.config, x.id)}>{x.name}</button>)}
              </div>
              {dirty ? <span className="xs muted">{m.unsaved}</span> : null}
              {p.canEdit && naming ? (
                <form className={css.form} onSubmit={(e) => {
                  e.preventDefault();
                  if (naming === "rename" && active) act(() => renameScenario({ id: active.id, name }), () => { setNaming(null); toast(m.renamed); });
                  else act(() => saveScenario({ name, config: cfg }), (r) => { setActiveId(r.data); setNaming(null); toast(m.saved); });
                }}>
                  <div className="field">
                    <label htmlFor="esc-name">{m.scenarioName}</label>
                    <input id="esc-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={m.scenarioNamePh} maxLength={60} required autoFocus />
                  </div>
                  <div className={css.actions}>
                    <button type="submit" className="btn btn-sm" disabled={pending}>{pending ? m.saving : naming === "rename" ? m.rename : m.saveNew}</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNaming(null)}>{m.cancel}</button>
                  </div>
                </form>
              ) : null}
              {p.canEdit && !naming ? (
                <div className={css.actions}>
                  {active && dirty ? <button type="button" className="btn btn-sm" disabled={pending} onClick={() => act(() => saveScenario({ id: active.id, name: active.name, config: cfg }), () => toast(m.updated))}>{m.saveChanges}</button> : null}
                  {dirty && isActive(cfg) ? <button type="button" className={active ? "btn btn-secondary btn-sm" : "btn btn-sm"} onClick={() => { setName(""); setNaming("new"); }}>{active ? m.saveAsNew : m.saveNew}</button> : null}
                  {active ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setName(active.name); setNaming("rename"); }}>{m.rename}</button> : null}
                  {active ? <ConfirmButton className="btn btn-danger btn-sm" label={m.remove} confirmLabel={m.removeConfirm} onConfirm={() => act(() => deleteScenario(active.id), () => { pick(EMPTY, null); toast(m.removed); })} /> : null}
                  {isActive(cfg) ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => pick(EMPTY, null)}>{m.clear}</button> : null}
                </div>
              ) : null}
              {error ? <p role="alert" className={css.error}>{error}</p> : null}
            </section>
          </>
        )}
      </aside>
    </div>
  );
}

// ───────── Gráfico de saldo (SVG a mano, como el mockup) ─────────
function Chart({ months, base, scen, lowI, neg, hasStart, fmt, m, short, full }: {
  months: HorizonMonth[]; base: SeriesPoint[]; scen: SeriesPoint[] | null; lowI: number; neg: SeriesPoint | null; hasStart: boolean;
  fmt: MoneyFormat; m: ProyeccionMessages; short: (h: HorizonMonth) => string; full: (h: HorizonMonth) => string;
}) {
  const shown = scen ?? base;
  const n = shown.length;
  const vals = shown.map((x) => x.balanceCents);
  const scale = chartScale([...vals, ...(scen ? base.map((x) => x.balanceCents) : [])]);
  const color = vals[n - 1] < 0 ? "var(--rojo)" : "var(--verde)";
  const pts = polyline(vals, scale);
  const zero = yPct(0, scale).toFixed(2);
  const area = `M${xOf(0, n).toFixed(1)},${zero} L${pts.split(" ").join(" L")} L${xOf(n - 1, n).toFixed(1)},${zero} Z`;
  const negI = neg ? shown.findIndex((x) => x.idx === neg.idx) : -1;
  const leftPct = (i: number) => `${(((i + 0.5) / n) * 100).toFixed(2)}%`;
  const tagX = lowI > n - 4 ? "translate(calc(-100% + 6px), 12px)" : lowI < 2 ? "translate(-6px, 12px)" : "translate(-50%, 12px)";
  const aria = fill(m.chartAria, { list: shown.map((x, i) => `${full(months[i])}: ${formatMoney(x.balanceCents, fmt)}`).join("; ") });
  return (
    <>
      <div className={css.scroll}>
        <div className={css.plot} role="img" aria-label={aria}>
          {scale.ticks.map((t) => (
            <div key={t} className={`${css.tick} ${t === 0 ? css.tickZero : ""}`} style={{ bottom: `${(100 - yPct(t, scale)).toFixed(2)}%` }}>
              <span className={`num ${css.tickLbl}`}>{formatCompact(t)}</span>
            </div>
          ))}
          {negI >= 0 && hasStart ? <span aria-hidden="true" className={css.negLine} style={{ left: leftPct(negI) }} /> : null}
          <svg aria-hidden="true" viewBox="0 0 1000 100" preserveAspectRatio="none" className={css.svg}>
            <path d={area} fill={color} fillOpacity={0.1} stroke="none" />
            {scen ? <polyline points={polyline(base.map((x) => x.balanceCents), scale)} fill="none" stroke="var(--gris-4)" strokeWidth={1.6} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" /> : null}
            <polyline points={pts} fill="none" stroke={color} strokeWidth={2.2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
          {vals.map((v, i) => {
            const big = i === lowI || i === negI;
            const sz = big ? 12 : 8;
            return <span key={i} aria-hidden="true" className={css.dot} style={{ left: leftPct(i), top: `${yPct(v, scale).toFixed(2)}%`, width: sz, height: sz, margin: `${-sz / 2}px 0 0 ${-sz / 2}px`, background: big ? "var(--rojo)" : "var(--blanco)", borderColor: color }} />;
          })}
          <span className={css.tag} style={{ left: leftPct(lowI), top: `${yPct(vals[lowI], scale).toFixed(2)}%`, transform: tagX }}>
            {negI === lowI && hasStart ? `${m.negTag} · ` : null}{fill(m.lowTag, { amount: formatMoney(vals[lowI], fmt) })}
          </span>
          {negI >= 0 && hasStart && negI !== lowI ? (
            <span className={css.tag} style={{ left: leftPct(negI), top: 4, transform: negI > n - 4 ? "translateX(calc(-100% - 4px))" : "translateX(4px)" }}>{m.negTag}</span>
          ) : null}
        </div>
        <div aria-hidden="true" className={css.axis} style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {shown.map((x, i) => (
            <span key={x.idx} className={css.col}>
              <span style={{ fontWeight: i === lowI ? 700 : 600 }}>{short(months[i])}</span>
              <span className={`num ${css.val}`}>{formatMoney(x.balanceCents, fmt)}</span>
            </span>
          ))}
        </div>
      </div>
      {scen ? (
        <div className={css.legend}>
          <span><span aria-hidden="true" style={{ width: 16, height: 0, borderTop: `2px solid ${color}` }} />{m.legendScenario}</span>
          <span><span aria-hidden="true" style={{ width: 16, height: 0, borderTop: "2px dashed var(--gris-4)" }} />{fill(m.baseEnd, { amount: formatMoney(base[base.length - 1].balanceCents, fmt) })}</span>
        </div>
      ) : null}
    </>
  );
}

// ───────── Ingresos o gastos extra por un rango de meses ─────────
function Extras({ months, cfg, onChange, m, fmt, full }: { months: HorizonMonth[]; cfg: ScenarioConfig; onChange: (c: ScenarioConfig) => void; m: ProyeccionMessages; fmt: MoneyFormat; full: (h: HorizonMonth) => string }) {
  const first = months[0].idx, lastIdx = months[months.length - 1].idx;
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", amount: "", kind: "out" as "in" | "out", from: first, to: lastIdx });
  const [error, setError] = useState("");
  const label = (idx: number) => full({ idx, year: months[0].year + (idx > 12 ? 1 : 0), month: idx > 12 ? idx - 12 : idx });
  const visible = cfg.extra.map((e, i) => ({ e, i }));
  return (
    <section aria-labelledby="extras" className={css.section}>
      <h2 id="extras" className={css.h3}>{m.extras}</h2>
      {visible.length ? (
        <ul className={css.extras}>
          {visible.map(({ e, i }) => (
            <li key={i}>
              <span>
                <strong>{e.name}</strong>
                <span className="xs muted">{e.from === e.to ? fill(m.extraOne, { month: label(e.from) }) : fill(m.extraRange, { from: label(e.from), to: label(e.to) })}</span>
              </span>
              <span className={`num ${e.amount_cents > 0 ? "pos" : ""}`} style={{ fontWeight: 600 }}>{formatMoney(e.amount_cents, fmt, { sign: true })}</span>
              <button type="button" className={css.iconBtn} aria-label={fill(m.extraRemove, { name: e.name })} onClick={() => onChange({ ...cfg, extra: cfg.extra.filter((_, j) => j !== i) })}><Icon name="x" size={16} /></button>
            </li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <form className={css.form} onSubmit={(e) => {
          e.preventDefault();
          const cents = parseMoney(f.amount);
          if (!f.name.trim()) return setError(m.errors.name);
          if (!cents) return setError(m.errors.amount);
          if (f.to < f.from) return setError(m.errors.extraMonths);
          if (cfg.extra.length >= MAX_EXTRAS) return setError(fill(m.errors.max, { n: MAX_EXTRAS }));
          const amount = Math.abs(cents) * (f.kind === "in" ? 1 : -1);
          onChange({ ...cfg, extra: [...cfg.extra, { name: f.name.trim().slice(0, 60), amount_cents: amount, from: f.from, to: f.to }] });
          setF({ name: "", amount: "", kind: "out", from: first, to: lastIdx }); setError(""); setOpen(false);
        }}>
          <div className="field"><label htmlFor="ex-name">{m.extraName}</label><input id="ex-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={m.extraNamePh} maxLength={60} /></div>
          <div className={css.grid2}>
            <div className="field"><label htmlFor="ex-amt">{m.extraAmount}</label><input id="ex-amt" className="input num" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder={formatMoney(0, fmt)} /></div>
            <div className="field"><span className="label">{m.extraKind}</span><Segmented label={m.extraKind} value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[{ value: "out", label: m.extraOut }, { value: "in", label: m.extraIn }]} /></div>
            <div className="field"><label htmlFor="ex-from">{m.extraFrom}</label>
              <select id="ex-from" className="select" value={f.from} onChange={(e) => { const v = Number(e.target.value); setF({ ...f, from: v, to: Math.max(v, f.to) }); }}>
                {months.map((h) => <option key={h.idx} value={h.idx}>{full(h)}</option>)}
              </select>
            </div>
            <div className="field"><label htmlFor="ex-to">{m.extraTo}</label>
              <select id="ex-to" className="select" value={f.to} onChange={(e) => setF({ ...f, to: Number(e.target.value) })}>
                {months.filter((h) => h.idx >= f.from).map((h) => <option key={h.idx} value={h.idx}>{full(h)}</option>)}
              </select>
            </div>
          </div>
          {error ? <p role="alert" className={css.error}>{error}</p> : null}
          <div className={css.actions}>
            <button type="submit" className="btn btn-sm">{m.extraAddBtn}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setOpen(false); setError(""); }}>{m.cancel}</button>
          </div>
        </form>
      ) : cfg.extra.length < MAX_EXTRAS ? (
        <button type="button" className="btn btn-dashed btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setOpen(true)}>{m.addExtra}</button>
      ) : null}
    </section>
  );
}
