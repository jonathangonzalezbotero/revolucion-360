"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { fill } from "@/i18n";
import { useToast } from "@/components/ui/client";
import { formatMoney, type MoneyFormat } from "@/lib/engine";
import css from "../onboarding.module.css";
import { commitPlan, saveProgress } from "./actions";
import {
  averageSummary, BASIC_KEYS, buildDrafts, cents, DEBT_KEYS, DEBT_TYPES, HOME_TYPES, MAX_ROWS, monthlyAverage, restOfPlan, summarize, visibleSteps, withRest,
  type Answers, type Ctx, type DebtType, type Freq, type StepKey,
} from "./lib";
import type { WizardMessages } from "./messages";

type Props = {
  m: WizardMessages; fmt: MoneyFormat; ctx: Ctx; monthLabel: string; redo: boolean; initial: Answers;
  /** Arrancó con el plan que ya tenía: guardar actualiza esas líneas */
  loaded: boolean;
  /** Las líneas del plan del año y su monto en el mes que muestra el resumen */
  existing: { id: string; kind: "income" | "expense"; monthCents: number }[];
  freelance: string; currencyName: string; familyCategory: string; taxSection: string; taxReserve: boolean; yes: string; no: string;
};
const FREQS: Freq[] = ["weekly", "fortnightly", "monthly"];
const GREEN: React.CSSProperties = { fontSize: 12, color: "var(--verde-fuerte)", fontWeight: 600 };

export function Wizard({ m, fmt, ctx, monthLabel, redo: redoNow, loaded, existing, initial, freelance, currencyName, familyCategory, taxSection, taxReserve, yes, no }: Props) {
  const router = useRouter();
  const toast = useToast();
  const steps = useMemo(() => visibleSteps(ctx.remesas), [ctx.remesas]);
  const [a, setA] = useState<Answers>(() => (steps.includes(initial.step) ? initial : { ...initial, step: "goals" }));
  const [redo] = useState(redoNow); // no cambia a mitad de camino, aunque el plan se cree
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false); // ya se creó: los botones no vuelven a encenderse mientras navega

  const idx = steps.indexOf(a.step);
  const isPlan = a.step === "plan";
  const drafts = useMemo(() => buildDrafts(a, ctx), [a, ctx]);
  // Lo que el asistente no cubre de tu plan (líneas que ninguna respuesta cambia), en el mes del resumen.
  const rest = useMemo(() => restOfPlan(existing, drafts), [existing, drafts]);
  // Mientras responde: promedio mensual. En el último paso: el motor, mes real (lo mismo que verá en Inicio).
  const sum = withRest(isPlan ? summarize(drafts, ctx.year, ctx.month) : averageSummary(drafts), rest);
  const known = useMemo(() => new Set(existing.map((l) => l.id)), [existing]);
  const toUpdate = drafts.lines.filter((l) => l.lineId && known.has(l.lineId)).length, toAdd = drafts.lines.length - toUpdate;
  const nLines = (n: number) => (n === 1 ? m.plan.linesOne : fill(m.plan.lines, { n }));
  const money = (c: number) => formatMoney(c, fmt);
  const netLabel = sum.net < 0 ? m.missing : m.surplus;
  // Un ingreso que el asistente no sabe leer (mes a mes, anual, único) sigue en tu plan: también cuenta.
  const hasIncome = drafts.lines.some((l) => l.kind === "income") || existing.some((l) => l.kind === "income");

  const set = (patch: Partial<Answers>) => setA((cur) => ({ ...cur, ...patch }));
  const go = (step: StepKey) => {
    setError("");
    const next = { ...a, step };
    setA(next);
    void saveProgress(next); // el avance se guarda en cada paso
    window.scrollTo({ top: 0 });
  };
  const forward = () => {
    if (a.step === "income" && !hasIncome) return setError(m.errors.income);
    go(steps[idx + 1]);
  };
  const commit = (to: "diagnostico" | "plan") => start(async () => {
    if (sent) return;
    setError("");
    const r = await commitPlan({ answers: a, to });
    if (!r.ok) return setError(r.error);
    setSent(true);
    toast(m.done, r.points);
    router.push(r.data.next);
    router.refresh();
  });

  const freqSelect = (id: string, value: Freq, onChange: (f: Freq) => void, label: string) => (
    <>
      <label htmlFor={id} className="sr-only">{label}</label>
      <select id={id} className={css.sel} value={value} onChange={(e) => onChange(e.target.value as Freq)}>
        {FREQS.map((f) => <option key={f} value={f}>{m.freqs[f]}</option>)}
      </select>
    </>
  );
  const moneyInput = (id: string, value: string, onChange: (v: string) => void, placeholder: string, style?: React.CSSProperties) => (
    <input id={id} className={`${css.inp} num`} type="text" inputMode="decimal" maxLength={20} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={style} />
  );
  const lead = (title: string, text?: string) => (
    <>
      <h2 className={css.wzH2}>{title}</h2>
      {text ? <p style={{ fontSize: 14, color: "var(--gris)", lineHeight: 1.5 }}>{text}</p> : null}
    </>
  );

  const upIncome = (i: number, patch: Partial<Answers["incomes"][number]>) => set({ incomes: a.incomes.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const upExtra = (i: number, patch: Partial<Answers["extraDebts"][number]>) => set({ extraDebts: a.extraDebts.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const upGoal = (i: number, patch: Partial<Answers["goals"][number]>) => set({ goals: a.goals.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const debtName = (k: (typeof DEBT_KEYS)[number]) => ctx.labels.debts[k];

  return (
    <div className={css.wz}>
      <Image className={css.wzLogo} src="/brand/logo-360.webp" alt={m.logoAlt} width={900} height={219} priority style={{ height: 36, width: "auto", alignSelf: "flex-start" }} />
      <div className={css.wzTop}>
        <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}><span className="only-desktop">{m.titleLong}</span><span className="only-mobile">{m.title}</span></span>
        <ol aria-label={m.stepsLabel} style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", gap: 5, flex: 1 }}>
          {steps.map((k, i) => <li key={k} aria-current={i === idx ? "step" : undefined} style={{ flex: i === idx ? 2 : 1, height: 6, borderRadius: 3, background: i <= idx ? "var(--tinta)" : "var(--linea-campo)" }}><span className="sr-only">{m.steps[k]}</span></li>)}
        </ol>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--gris)", whiteSpace: "nowrap" }}>{fill(m.stepOf, { n: idx + 1, total: steps.length })}</span>
      </div>
      {redo ? <div className="banner banner-info"><span style={{ flex: "1 1 280px" }}>{loaded ? fill(m.redoLoaded, { year: ctx.year, month: monthLabel }) : m.redo}</span><Link href="/inicio" className="link">{m.backHome}</Link></div> : null}

      <div className={css.wzCols}>
        <div className={css.wzStrip}>
          <span style={{ fontSize: 13, color: "var(--gris)" }}>{fill(m.perMonth, { label: netLabel })}</span>
          <strong className="num" style={{ fontSize: 20 }}>{money(Math.abs(sum.net))}</strong>
        </div>

        <main className={css.wzForm}>
          {a.step === "income" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {lead(m.income.title, m.income.text)}
              {a.incomes.map((r, i) => (
                <div key={i} className={css.card}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <label htmlFor={`gi-n${i}`} className="sr-only">{m.income.name}</label>
                    <input id={`gi-n${i}`} className={css.inp} type="text" maxLength={80} value={r.name} onChange={(e) => upIncome(i, { name: e.target.value })} placeholder={m.income.namePh} />
                    {a.incomes.length > 1 ? <button type="button" className={css.x} aria-label={m.income.remove} onClick={() => set({ incomes: a.incomes.filter((_, j) => j !== i) })}>×</button> : null}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <label htmlFor={`gi-a${i}`} className="sr-only">{m.amount}</label>
                    {moneyInput(`gi-a${i}`, r.amount, (v) => upIncome(i, { amount: v }), m.amountPh, { flex: 1 })}
                    {freqSelect(`gi-f${i}`, r.freq, (f) => upIncome(i, { freq: f }), m.frequency)}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label htmlFor={`gi-d${i}`} style={{ fontSize: 13, fontWeight: 600 }}>{m.income.payDate}</label>
                    <input id={`gi-d${i}`} className={css.inp} type="date" value={r.payDate} onChange={(e) => upIncome(i, { payDate: e.target.value })} />
                    <span className="hint">{m.income.payDateHint}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <button type="button" role="switch" aria-checked={r.freelance} className={`${css.chip} ${css.chipSm}`} onClick={() => upIncome(i, { freelance: !r.freelance })}>{fill(m.income.freelance, { term: freelance })}</button>
                    <span className="num" style={GREEN}>{cents(r.amount) > 0 ? fill(m.approx, { amount: money(monthlyAverage(cents(r.amount), r.freq)) }) : ""}</span>
                  </div>
                </div>
              ))}
              {taxReserve && a.incomes.some((r) => r.freelance) ? <p className={css.warn}>{fill(m.income.freelanceNote, { term: freelance, section: taxSection })}</p> : null}
              {a.incomes.length < MAX_ROWS ? <button type="button" className={css.dashed} onClick={() => set({ incomes: [...a.incomes, { name: "", amount: "", freq: "monthly", payDate: "", freelance: false }] })}>{m.income.add}</button> : null}
            </div>
          ) : null}

          {a.step === "home" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {lead(m.home.title)}
              <div role="group" aria-label={m.home.group} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {HOME_TYPES.map((t) => <button key={t} type="button" aria-pressed={a.home.type === t} className={css.chip} onClick={() => set({ home: { ...a.home, type: t } })}>{m.home.types[t]}</button>)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label htmlFor="gv-a" style={{ fontSize: 13, fontWeight: 600 }}>{m.home.amount}</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {moneyInput("gv-a", a.home.amount, (v) => set({ home: { ...a.home, amount: v } }), m.amountPh, { flex: 1 })}
                  {freqSelect("gv-f", a.home.freq, (f) => set({ home: { ...a.home, freq: f } }), m.frequency)}
                </div>
                <span className="num" style={GREEN}>{fill(m.approx, { amount: money(monthlyAverage(cents(a.home.amount), a.home.freq)) })}</span>
                {a.home.type === "mortgage" ? <span className={css.info} style={{ marginTop: 4 }}>{m.home.mortgageNote}</span> : null}
              </div>
            </div>
          ) : null}

          {a.step === "basics" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {lead(m.basics.title, m.basics.text)}
              {BASIC_KEYS.map((k) => (
                <div key={k} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label htmlFor={`gb-a-${k}`} style={{ fontSize: 13, fontWeight: 600 }}>{m.basics.names[k]}</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {moneyInput(`gb-a-${k}`, a.basics[k].amount, (v) => set({ basics: { ...a.basics, [k]: { ...a.basics[k], amount: v } } }), m.amountPh, { flex: 1 })}
                    {freqSelect(`gb-f-${k}`, a.basics[k].freq, (f) => set({ basics: { ...a.basics, [k]: { ...a.basics[k], freq: f } } }), fill(m.frequencyOf, { name: m.basics.names[k] }))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {a.step === "debts" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {lead(m.debts.title, m.debts.text)}
              {DEBT_KEYS.map((k) => {
                const d = a.debts[k];
                return (
                  <div key={k} className={css.debtRow} data-on={d.on}>
                    <button type="button" role="checkbox" aria-checked={d.on} className={css.debtToggle} onClick={() => set({ debts: { ...a.debts, [k]: { ...d, on: !d.on } } })}>
                      <span aria-hidden="true" className={css.debtMark}>{d.on ? "✓" : "+"}</span>{debtName(k)}
                    </button>
                    {d.on ? (
                      <>
                        <label htmlFor={`gd-${k}`} className="sr-only">{fill(m.debts.payment, { name: debtName(k) })}</label>
                        {moneyInput(`gd-${k}`, d.amount, (v) => set({ debts: { ...a.debts, [k]: { ...d, amount: v } } }), m.debts.paymentPh, { width: 120, flex: "none" })}
                      </>
                    ) : null}
                  </div>
                );
              })}
              {a.extraDebts.map((x, i) => (
                <div key={i} className={css.cardOpen}>
                  <label htmlFor={`gx-n${i}`} style={{ fontSize: 12, fontWeight: 500, color: "var(--gris)" }}>{m.debts.name}</label>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input id={`gx-n${i}`} className={css.inp} type="text" maxLength={80} value={x.name} onChange={(e) => upExtra(i, { name: e.target.value })} placeholder={m.debts.namePh} />
                    <button type="button" className={css.x} aria-label={m.debts.remove} onClick={() => set({ extraDebts: a.extraDebts.filter((_, j) => j !== i) })}>×</button>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <label htmlFor={`gx-t${i}`} className="sr-only">{m.debts.type}</label>
                    <select id={`gx-t${i}`} className={css.sel} style={{ flex: 1 }} value={x.type} onChange={(e) => upExtra(i, { type: e.target.value as DebtType })}>
                      {DEBT_TYPES.map((t) => <option key={t} value={t}>{m.debts.types[t]}</option>)}
                    </select>
                    <label htmlFor={`gx-v${i}`} className="sr-only">{m.debts.monthly}</label>
                    {moneyInput(`gx-v${i}`, x.amount, (v) => upExtra(i, { amount: v }), m.debts.paymentPh, { width: 120, flex: "none" })}
                  </div>
                </div>
              ))}
              {a.extraDebts.length < MAX_ROWS ? <button type="button" className={css.dashed} onClick={() => set({ extraDebts: [...a.extraDebts, { name: "", type: "mortgage", amount: "" }] })}>{m.debts.add}</button> : null}
            </div>
          ) : null}

          {a.step === "family" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {lead(m.family.title)}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                <button type="button" aria-pressed={a.family.on === true} className={css.yesNo} onClick={() => set({ family: { ...a.family, on: true } })}>{yes}</button>
                <button type="button" aria-pressed={a.family.on === false} className={css.yesNo} onClick={() => set({ family: { ...a.family, on: false } })}>{no}</button>
              </div>
              {a.family.on ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label htmlFor="gr-a" style={{ fontSize: 13, fontWeight: 600 }}>{fill(m.family.amount, { currency: currencyName })}</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {moneyInput("gr-a", a.family.amount, (v) => set({ family: { ...a.family, amount: v } }), m.amountPh, { flex: 1 })}
                    {freqSelect("gr-f", a.family.freq, (f) => set({ family: { ...a.family, freq: f } }), m.frequency)}
                  </div>
                  <span className="hint">{fill(m.family.note, { category: familyCategory })}</span>
                </div>
              ) : null}
            </div>
          ) : null}

          {a.step === "goals" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {lead(m.goals.title, m.goals.text)}
              {a.goals.map((g, i) => (
                <div key={i} className={css.card} style={{ gap: 8 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <label htmlFor={`gm-n${i}`} className="sr-only">{m.goals.name}</label>
                    <input id={`gm-n${i}`} className={css.inp} type="text" maxLength={80} value={g.name} onChange={(e) => upGoal(i, { name: e.target.value })} placeholder={m.goals.namePh} />
                    <button type="button" className={css.x} aria-label={m.goals.remove} onClick={() => set({ goals: a.goals.filter((_, j) => j !== i) })}>×</button>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <label htmlFor={`gm-a${i}`} className="sr-only">{m.goals.amount}</label>
                    {moneyInput(`gm-a${i}`, g.amount, (v) => upGoal(i, { amount: v }), m.goals.amountPh, { flex: 1 })}
                    <label htmlFor={`gm-f${i}`} className="sr-only">{m.goals.date}</label>
                    <input id={`gm-f${i}`} className={css.inp} type="month" min={ctx.today.slice(0, 7)} value={g.date} onChange={(e) => upGoal(i, { date: e.target.value })} style={{ width: 150, flex: "none" }} />
                  </div>
                </div>
              ))}
              {a.goals.length < MAX_ROWS ? <button type="button" className={css.dashed} onClick={() => set({ goals: [...a.goals, { name: "", amount: "", date: "" }] })}>{m.goals.add}</button> : null}
            </div>
          ) : null}

          {isPlan ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {lead(toUpdate > 0 ? m.plan.titleLoaded : m.plan.title)}
              {toUpdate > 0 ? (
                <p style={{ fontSize: 14, color: "var(--gris)", lineHeight: 1.5 }}>{m.plan.leadUpdate} <strong style={{ color: "var(--tinta)" }}>{nLines(toUpdate)}</strong>{toAdd > 0 ? <> {m.plan.leadAdd} <strong style={{ color: "var(--tinta)" }}>{nLines(toAdd)}</strong></> : null}. {m.plan.tailLoaded}</p>
              ) : (
                <p style={{ fontSize: 14, color: "var(--gris)", lineHeight: 1.5 }}>{m.plan.lead} <strong style={{ color: "var(--tinta)" }}>{nLines(sum.lines)}</strong> {m.plan.tail}</p>
              )}
              <div className={css.totals}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 12, color: "var(--gris)" }}>{m.plan.in}</span><span className="num" style={{ fontSize: 18, fontWeight: 600 }}>{money(sum.income)}</span></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 12, color: "var(--gris)" }}>{m.plan.out}</span><span className="num" style={{ fontSize: 18, fontWeight: 600 }}>{money(sum.expense)}</span></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 12, color: "var(--gris)" }}>{netLabel}</span><span className="num" style={{ fontSize: 18, fontWeight: 600 }}>{money(Math.abs(sum.net))}</span></div>
              </div>
              <span className="hint only-mobile">{fill(m.aside.noteReal, { month: monthLabel })}</span>
              {error || !hasIncome ? <p role="alert" className={css.alert}>{error || m.errors.incomeFirst}</p> : null}
              <button type="button" className={css.cta} disabled={pending || sent || !hasIncome} onClick={() => commit("diagnostico")}>{pending || sent ? (toUpdate > 0 ? m.plan.savingLoaded : m.plan.saving) : m.plan.cta}</button>
              <button type="button" className={css.textLink} disabled={pending || sent || !hasIncome} onClick={() => commit("plan")}>{m.plan.toPlan}</button>
            </div>
          ) : error ? <p role="alert" className={css.alert}>{error}</p> : null}

          <div className={css.wzNav}>
            <button type="button" className={css.back} onClick={() => go(steps[idx - 1])} disabled={pending || sent} style={{ visibility: idx === 0 ? "hidden" : "visible" }}><span aria-hidden="true">‹ </span>{m.nav.back}</button>
            {isPlan ? null : <button type="button" className={css.next} onClick={forward}>{steps[idx + 1] === "plan" ? m.nav.create : m.nav.next}</button>}
          </div>
        </main>

        <aside aria-label={m.aside.title} className={css.wzAside}>
          <span style={{ fontSize: 13, color: "var(--gris)", fontWeight: 600 }}>{m.aside.title}</span>
          <div className={css.asideRow} style={{ color: "var(--tinta)" }}><span>{m.aside.in}</span><strong className="num">{money(sum.income)}</strong></div>
          <div className={css.asideRow}><span>{m.aside.home}</span><span className="num">{money(sum.home)}</span></div>
          <div className={css.asideRow}><span>{m.aside.basics}</span><span className="num">{money(sum.basics)}</span></div>
          <div className={css.asideRow}><span>{m.aside.debts}</span><span className="num">{money(sum.debts)}</span></div>
          {ctx.remesas ? <div className={css.asideRow}><span>{m.aside.family}</span><span className="num">{money(sum.family)}</span></div> : null}
          {sum.goals > 0 ? <div className={css.asideRow}><span>{m.aside.goals}</span><span className="num">{money(sum.goals)}</span></div> : null}
          {rest.expense > 0 ? <div className={css.asideRow}><span>{m.aside.rest}</span><span className="num">{money(rest.expense)}</span></div> : null}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: "1px solid var(--linea)", paddingTop: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{netLabel}</span><strong className="num big" style={{ fontSize: 26 }}>{money(Math.abs(sum.net))}</strong>
          </div>
          <span style={{ fontSize: 12, color: "var(--gris)", lineHeight: 1.5 }}>{isPlan ? fill(m.aside.noteReal, { month: monthLabel }) : m.aside.note}</span>
        </aside>
      </div>
    </div>
  );
}
