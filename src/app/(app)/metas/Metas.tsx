"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { fill, type Locale } from "@/i18n";
import { Empty, PageHeader } from "@/components/ui/basics";
import { ConfirmButton, Switch, useToast } from "@/components/ui/client";
import { Icon } from "@/components/ui/Icon";
import { formatDate, formatMoney, goalPlan, parseMoney, type Cents, type GoalPlan, type ISODate, type MoneyFormat } from "@/lib/engine";
import { MILESTONES, type Milestone } from "@/lib/engine/metas";
import type { Result } from "@/server/action";
import { addEntry, addToPlan, archiveGoal, completeGoal, createGoal, dismissObjective, sendLeftover, updateGoal } from "./actions";
import { joinChallenge } from "../retos/actions";
import type { GoalKey } from "@/app/(onboarding)/bienvenida/lib";
import type { MetasReto } from "../retos/server";
import { CONTRIB_FREQS, GOAL_TYPES, monthOptions, resolveTargetDate, TYPE_COLOR, TYPE_IMG, whenLabel, ymOf, type ContribFreq, type Contribution, type GoalStatus, type GoalType, type MetaOutlook } from "./lib";
import type { MetasMessages } from "./messages";
import css from "./metas.module.css";
import { ILLU } from "@/lib/images";

export type GoalView = {
  /** `kind` es lo guardado (puede ser una clave vieja como 'invest'); en pantalla siempre va `kindLabel`, y en el formulario `custom`. */
  id: string; name: string; kind: string; kindLabel: string; custom: string; why: string; type: GoalType; targetCents: Cents; targetDate: ISODate | null; isEmergencyFund: boolean;
  accountId: string | null; accountName: string; accountMode: "auto" | "shared" | "none";
  completed: boolean; inPlan: boolean; plan: GoalPlan; status: GoalStatus; outlook: MetaOutlook;
  /** El aporte de su línea del plan (año en curso), si tiene. */
  contribution: Contribution | null;
  reached: Milestone[]; next: { pct: Milestone; missingCents: Cents } | null;
  entries: { id: string; date: ISODate; amountCents: Cents; label: string }[];
  savedCents: Cents;
};
export type Suggestion = { key: GoalKey; type: GoalType };
type Preset = { key: GoalKey; type: GoalType; name: string };
type Props = {
  goals: GoalView[]; accounts: { id: string; name: string }[]; fmt: MoneyFormat; locale: Locale; today: ISODate; canEdit: boolean; m: MetasMessages; openNew: boolean;
  points: { contrib: number; done: number; milestone: number } | null; planHref: string | null; wall: React.ReactNode;
  monthIn: Cents;
  leftover: { year: number; month: number; monthLabel: string; cents: Cents } | null;
  /** Retos opcionales (migración 20261125000037_retos.sql): hasta 3, primero los tuyos activos. */
  challenges: MetasReto[];
  /** Hitos que se cruzaron al poner al día las transferencias automáticas: se celebran una vez al abrir. */
  crossed: { text: string; points: number }[];
  /** Objetivos de la bienvenida que aún no son meta (profiles.prefs.objectives). */
  suggestions: Suggestion[];
};
type Run = <T>(fn: () => Promise<Result<T>>, after: (r: Extract<Result<T>, { ok: true }>) => void, onError: (e: string) => void) => void;
const HISTORY = 6;

type Saved = { inPlan: boolean; contribution: Contribution | null };

function GoalForm({ p, goal, preset, run, pending, onClose, onSaved }: { p: Props; goal?: GoalView; preset?: Preset | null; run: Run; pending: boolean; onClose: () => void; onSaved: (r: Saved) => void }) {
  const { m, fmt, locale, today } = p;
  const uid = goal?.id ?? "new";
  const base = monthOptions(today);
  const [f, setF] = useState({
    type: goal?.type ?? preset?.type ?? ("trip" as GoalType),
    custom: goal?.type === "other" ? goal.custom : "",
    name: goal?.name ?? preset?.name ?? "", why: goal?.why ?? "", target: goal?.targetCents ? formatMoney(goal.targetCents, fmt) : "",
    month: goal ? (goal.targetDate ? ymOf(goal.targetDate) : "") : base[12],
    fund: goal?.isEmergencyFund ?? preset?.type === "fund", account: goal?.accountId ?? "",
    contrib: goal?.contribution ? formatMoney(goal.contribution.amountCents, fmt) : "", freq: (goal?.contribution?.frequency ?? "monthly") as ContribFreq,
  });
  const [error, setError] = useState("");
  const months = f.month && !base.includes(f.month) ? [f.month, ...base] : base;
  const targetCents = parseMoney(f.target) ?? 0;
  const date = resolveTargetDate(f.month, goal?.targetDate ?? null);
  const calc = targetCents > 0 && date ? goalPlan(targetCents, [goal?.plan.savedCents ?? 0], date, today) : null;
  const kind = f.type === "other" ? f.custom.trim() || m.types.other : m.types[f.type];
  const fields = { name: f.name, kind, target: f.target, month: f.month, isEmergencyFund: f.fund, accountId: f.account, why: f.why, contribution: f.contrib, contribFreq: f.freq };
  const accounts = goal?.accountId && !p.accounts.some((a) => a.id === goal.accountId) ? [{ id: goal.accountId, name: goal.accountName }, ...p.accounts] : p.accounts;

  return (
    <form aria-labelledby={`gf-${uid}`} className={goal ? "stack" : "form-open"} style={goal ? { gap: 14 } : undefined} onSubmit={(e) => {
      e.preventDefault(); setError("");
      if (goal) run(() => updateGoal({ id: goal.id, ...fields }), (r) => onSaved({ inPlan: false, ...r.data }), setError);
      else run(() => createGoal({ ...fields, ...(preset ? { objective: preset.key } : {}) }), (r) => onSaved({ inPlan: r.data.inPlan, contribution: null }), setError);
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 id={`gf-${uid}`} className={css.formTitle}>{goal ? m.editTitle : m.newTitle}</h2>
        {goal ? null : <span className="small muted" style={{ lineHeight: 1.5 }}>{m.newSub}</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span id={`gt-${uid}`} className="label">{m.type}</span>
        <div role="radiogroup" aria-labelledby={`gt-${uid}`} className={css.chips}>
          {GOAL_TYPES.map((t) => <button key={t} type="button" role="radio" aria-checked={f.type === t} className={css.chip} onClick={() => setF({ ...f, type: t, fund: t === "fund" })}>{m.types[t]}</button>)}
        </div>
      </div>
      <div className={css.grid2}>
        {f.type === "other" ? <div className="field"><label htmlFor={`gk-${uid}`}>{m.customType}</label><input id={`gk-${uid}`} className="input" value={f.custom} onChange={(e) => setF({ ...f, custom: e.target.value })} placeholder={m.customTypePh} maxLength={40} /></div> : null}
        <div className="field"><label htmlFor={`gn-${uid}`}>{m.name}</label><input id={`gn-${uid}`} className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={m.namePh} maxLength={80} required /></div>
        <div className="field"><label htmlFor={`gy-${uid}`}>{m.why}</label><input id={`gy-${uid}`} className="input" value={f.why} onChange={(e) => setF({ ...f, why: e.target.value })} placeholder={m.whyPh} maxLength={160} /></div>
        <div className="field"><label htmlFor={`gm-${uid}`}>{m.target}</label><input id={`gm-${uid}`} className="input num" inputMode="decimal" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} placeholder={formatMoney(0, fmt)} /></div>
        <div className="field"><label htmlFor={`gw-${uid}`}>{m.when}</label>
          <select id={`gw-${uid}`} className="select" value={f.month} onChange={(e) => setF({ ...f, month: e.target.value })}>
            <option value="">{m.noDate}</option>
            {months.map((ym) => <option key={ym} value={ym}>{whenLabel(ym, locale)}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor={`gc-${uid}`}>{m.account}</label>
          <select id={`gc-${uid}`} className="select" value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })}>
            <option value="">{m.noAccount}</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>
      {calc?.monthlyCents && calc.weeklyCents ? (
        <div className={css.calc} aria-live="polite">
          <span className="small">{fill(m.calcA, { when: whenLabel(f.month, locale) })}</span>
          <strong className="num">{fill(m.calcM, { amount: formatMoney(calc.monthlyCents, fmt) })}</strong>
          <span className="num small muted">{fill(m.calcW, { amount: formatMoney(calc.weeklyCents, fmt) })}</span>
        </div>
      ) : null}
      {goal?.completed ? null : (
        <fieldset className={css.contrib}>
          <legend style={{ fontSize: 14, fontWeight: 600 }}>{m.contrib}</legend>
          <span className="xs muted" style={{ lineHeight: 1.5 }}>{m.contribSub}</span>
          <div className={css.grid2}>
            <div className="field"><label htmlFor={`gca-${uid}`}>{m.contribAmount}</label><input id={`gca-${uid}`} className="input num" inputMode="decimal" value={f.contrib} onChange={(e) => setF({ ...f, contrib: e.target.value })} placeholder={formatMoney(0, fmt)} /></div>
            <div className="field"><label htmlFor={`gcf-${uid}`}>{m.contribFreq}</label>
              <select id={`gcf-${uid}`} className="select" value={f.freq} onChange={(e) => setF({ ...f, freq: e.target.value as ContribFreq })}>
                {CONTRIB_FREQS.map((x) => <option key={x} value={x}>{m.freqs[x]}</option>)}
              </select>
            </div>
          </div>
          {calc?.monthlyCents ? (
            <button type="button" className={css.textBtn} style={{ alignSelf: "flex-start" }} onClick={() => setF({ ...f, contrib: formatMoney(calc.monthlyCents!, fmt), freq: "monthly" })}>
              {fill(m.useCalc, { amount: formatMoney(calc.monthlyCents, fmt) })}
            </button>
          ) : null}
        </fieldset>
      )}
      <div className={css.option}>
        <span><span style={{ fontSize: 14, fontWeight: 600 }}>{m.fund}</span><span className="xs muted">{m.fundSub}</span></span>
        <Switch checked={f.fund} onChange={(fund) => setF({ ...f, fund })} label={m.fund} />
      </div>
      {error ? <p role="alert" className="error">{error}</p> : null}
      <div className="row wrap" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>{m.cancel}</button>
        <button className="btn" disabled={pending}>{goal ? m.save : m.create}</button>
      </div>
    </form>
  );
}

export function Metas(p: Props) {
  const { goals, fmt, locale, canEdit, m, points } = p;
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showNew, setShowNew] = useState(p.openNew);
  /** Formulario abierto desde una sugerencia: ya trae tipo y nombre. */
  const [preset, setPreset] = useState<Preset | null>(null);
  const [openId, setOpenId] = useState("");
  const [editId, setEditId] = useState("");
  const [act, setAct] = useState<{ mode: "in" | "out"; amount: string } | null>(null);
  const [error, setError] = useState("");
  const [full, setFull] = useState("");
  const [ask, setAsk] = useState<{ id: string; what: "archive" | "complete" } | null>(null);
  const [leftError, setLeftError] = useState("");

  // Hitos cruzados por transferencias automáticas: se celebran una vez al abrir la pantalla.
  const celebrated = useRef(false);
  useEffect(() => {
    if (celebrated.current || p.crossed.length === 0) return;
    celebrated.current = true;
    const last = p.crossed[p.crossed.length - 1];
    toast(last.text, p.crossed.reduce((a, c) => a + c.points, 0) || undefined, ILLU.celHito);
  }, [p.crossed, toast]);

  const run: Run = (fn, after, onError) => start(async () => {
    const r = await fn();
    if (r.ok) after(r); else onError(r.error);
  });
  const active = goals.filter((g) => !g.completed), done = goals.filter((g) => g.completed);
  const total = active.reduce((a, g) => a + g.plan.savedCents, 0);
  const closeNew = () => { setShowNew(false); setPreset(null); if (p.openNew) router.replace("/metas", { scroll: false }); };
  const toggleNew = () => {
    if (showNew) return closeNew();
    setPreset(null);
    setShowNew(true);
  };
  const fromSuggestion = (sg: Suggestion) => {
    setPreset({ key: sg.key, type: sg.type, name: m.sgNames[sg.key] });
    setShowNew(true);
    setTimeout(() => document.getElementById("gf-new")?.scrollIntoView({ block: "start", behavior: "smooth" }), 60);
  };
  const toggle = (id: string) => { setOpenId(openId === id ? "" : id); setEditId(""); setAct(null); setError(""); setAsk(null); };
  const finish = (g: GoalView, what: "archive" | "complete", removeLine: boolean, onError: (e: string) => void, done?: () => void) => {
    setAsk(null);
    if (what === "complete") run(() => completeGoal({ id: g.id, removeLine }), (r) => { setOpenId(""); toast(fill(m.tDone, { name: g.name }), r.points); done?.(); }, (e) => { onError(e); done?.(); });
    else run(() => archiveGoal({ id: g.id, removeLine }), () => { setOpenId(""); toast(m.tArchived); done?.(); }, (e) => { onError(e); done?.(); });
  };
  /** Igual que con las deudas: al cumplir o archivar una meta que está en el plan, se pregunta si quitar su línea. */
  const askBox = (g: GoalView) => (ask?.id === g.id ? (
    <div className="banner banner-info" role="group" aria-label={m.askLine}>
      <span>{m.askLine}</span>
      <div className="row wrap">
        <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => finish(g, ask.what, false, (e) => toast(e))}>{m.askNo}</button>
        <button type="button" className="btn" disabled={pending} onClick={() => finish(g, ask.what, true, (e) => toast(e))}>{m.askYes}</button>
      </div>
    </div>
  ) : null);
  const money = (c: Cents) => formatMoney(c, fmt);

  /** Siempre en positivo: ritmo y fecha, nunca "vas atrasado". */
  const statusText = (g: GoalView) => {
    const o = g.outlook;
    switch (o.kind) {
      case "setup": return m.stSetup;
      case "reached": return m.stReached;
      case "pace": return fill(m.stPace, { when: whenLabel(o.when, locale) });
      case "date": return fill(m.stDate, { amount: money(o.monthlyCents), when: whenLabel(o.when, locale) });
      case "plan": return fill(m.stPlan, { amount: money(o.amountCents), per: m.per[o.frequency], when: whenLabel(o.when, locale) });
      default: return fill(m.stOpen, { amount: money(o.remainingCents) });
    }
  };
  const statusColor = (o: MetaOutlook) => (o.kind === "reached" || o.kind === "pace" ? "var(--verde-fuerte)" : o.kind === "date" || o.kind === "plan" ? "var(--tinta-2)" : "var(--gris)");
  const acctText = (g: GoalView) => (g.accountMode === "auto" ? fill(m.acctNote, { account: g.accountName }) : g.accountMode === "shared" ? fill(m.acctShared, { account: g.accountName }) : m.acctNone);

  const pickLeftover = (goalId: string | null) => {
    if (!p.leftover) return;
    setLeftError("");
    const lf = p.leftover;
    run(() => sendLeftover({ year: lf.year, month: lf.month, goalId }), (r) => {
      const c = r.data.crossed.at(-1);
      toast(goalId ? (c ? fill(m.tMilestone, { pct: c.pct, name: c.name }) : fill(m.tLeftover, { amount: money(r.data.amountCents), name: r.data.name })) : m.tNotNow, r.points, goalId && c ? ILLU.celHito : undefined);
    }, setLeftError);
  };

  return (
    <main className="page">
      <PageHeader title={m.title} eyebrow={m.eyebrow}>
        {canEdit ? (
          <>
            <button type="button" className="btn only-desktop" aria-expanded={showNew} onClick={toggleNew}>{m.newGoal}</button>
            <button type="button" className={`${css.plus} only-mobile`} aria-expanded={showNew} aria-label={m.newGoalShort} onClick={toggleNew}><Icon name="plus" size={22} /></button>
          </>
        ) : null}
      </PageHeader>

      <section aria-label={m.summary} className={css.summary}>
        <div>
          <span className={css.k}>{m.total}</span>
          <span className={`num big ${css.v}`}>{money(total)}</span>
          <span className={`num ${css.monthIn}`}><span className="only-desktop">{fill(m.monthIn, { amount: money(p.monthIn) })}</span><span className="only-mobile">{fill(m.monthInShort, { amount: money(p.monthIn) })}</span></span>
        </div>
        {points && (points.contrib > 0 || points.done > 0) ? <p>{m.pointsA} <strong className="num">{fill(m.pointsN, { n: points.contrib })}</strong>{fill(m.pointsB, { ms: points.milestone, done: points.done })}</p> : null}
      </section>

      {p.leftover && canEdit && active.length > 0 ? (
        <section aria-labelledby="lf-h" className={css.leftover}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <h2 id="lf-h" className={css.lfTitle}>{fill(m.lfTitle, { month: p.leftover.monthLabel })} <span className="num">{money(p.leftover.cents)}</span></h2>
            <span className={css.lfText}>{m.lfText}</span>
          </div>
          <div className={css.lfPicks}>
            {active.map((g) => <button key={g.id} type="button" className={css.lfGoal} disabled={pending} onClick={() => pickLeftover(g.id)}>{g.name}</button>)}
            <button type="button" className={css.lfNo} disabled={pending} onClick={() => pickLeftover(null)}>{m.notNow}</button>
          </div>
          {leftError ? <p role="alert" className="error">{leftError}</p> : null}
        </section>
      ) : null}

      {canEdit && p.suggestions.length ? (
        <section aria-labelledby="sg-h" className="stack" style={{ gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <h2 id="sg-h" className={css.rtTitle}>{m.sgTitle}</h2>
            <span className="small muted">{m.sgSub}</span>
          </div>
          <ul className={css.suggestions}>
            {p.suggestions.map((sg) => (
              <li key={sg.key} className={css.suggestion}>
                <Image src={TYPE_IMG[sg.type]} alt="" aria-hidden="true" width={48} height={48} sizes="48px" className={css.sgImg} />
                <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: 15 }}>{m.sgNames[sg.key]}</strong>
                  <span className="small muted" style={{ lineHeight: 1.45 }}>{m.sgAsk[sg.key]}</span>
                </div>
                <div className={css.sgActions}>
                  <button type="button" className="btn btn-secondary btn-sm" aria-expanded={showNew && preset?.key === sg.key} disabled={pending} onClick={() => fromSuggestion(sg)}>{m.sgCreate}</button>
                  <button type="button" className={css.textBtn} aria-label={fill(m.sgDismissAria, { name: m.sgNames[sg.key] })} disabled={pending}
                    onClick={() => run(() => dismissObjective({ key: sg.key }), () => { if (preset?.key === sg.key) closeNew(); toast(m.tDismissed); }, (e) => toast(e))}>{m.sgDismiss}</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {showNew && canEdit ? (
        p.wall ?? <GoalForm key={preset?.key ?? "new"} p={p} preset={preset} run={run} pending={pending} onClose={closeNew} onSaved={(r) => { closeNew(); toast(r.inPlan ? m.tCreatedPlan : m.tCreated); }} />
      ) : null}

      {active.length === 0 ? (
        showNew && canEdit ? null : (
          <Empty icon="target" image={ILLU.vacioMetas} title={m.emptyTitle} text={m.emptyText}>
            {canEdit ? <button type="button" className="btn" onClick={() => setShowNew(true)}>{m.emptyCta}</button> : null}
          </Empty>
        )
      ) : (
        <div className={css.grid}>
          {active.map((g) => {
            const open = openId === g.id, color = TYPE_COLOR[g.type];
            const shown = full === g.id ? g.entries : g.entries.slice(0, HISTORY);
            const tip = g.outlook.kind === "pace" ? g.outlook.tip : null;
            const saving = g.savedCents > 0;
            return (
              <article key={g.id} className={`${css.goal} ${saving ? css.saving : ""}`} aria-labelledby={`g-${g.id}`}>
                <div className="row">
                  <Image src={TYPE_IMG[g.type]} alt="" aria-hidden="true" width={64} height={64} sizes="64px" className={css.typeImg} />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <h3 id={`g-${g.id}`} style={{ fontSize: 16 }}>{g.name}</h3>
                    <span className="xs muted">{g.kindLabel}{g.isEmergencyFund && g.type !== "fund" ? ` · ${m.in}` : ""}{g.accountName ? ` · ${fill(m.inAccount, { account: g.accountName })}` : ""}</span>
                  </div>
                  {g.targetCents > 0 ? <span className="num" style={{ fontSize: 14, fontWeight: 600 }}>{Math.round(g.plan.progress * 100)}%</span> : null}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span className="num big" style={{ fontSize: 26 }}>{money(g.plan.savedCents)}</span>
                  <span className="num muted" style={{ fontSize: 14 }}>{g.targetCents > 0 ? fill(m.of, { target: money(g.targetCents) }) : m.noTarget} · {g.targetDate ? whenLabel(g.targetDate, locale) : m.noDate}</span>
                </div>
                {g.targetCents > 0 || !saving ? (
                  <div className={css.track} role="progressbar" aria-label={fill(m.progress, { name: g.name })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(g.plan.progress * 100)}>
                    <span style={{ width: `${Math.round(g.plan.progress * 100)}%`, background: color }} />
                  </div>
                ) : (
                  // Sin monto objetivo no hay porcentaje, pero sí avance: se muestra lo que lleva.
                  <span className={`num ${css.savedTag}`}>{fill(m.savedSoFar, { amount: money(g.plan.savedCents) })}</span>
                )}
                {g.targetCents > 0 ? (
                  <ul aria-label={m.msAria} className={css.milestones}>
                    {MILESTONES.map((pct) => {
                      const on = g.reached.includes(pct);
                      return <li key={pct} className="num" data-on={on} aria-label={fill(on ? m.msOn : m.msOff, { p: pct })}>{pct}%</li>;
                    })}
                  </ul>
                ) : null}
                {g.why ? <p className={css.why}>&ldquo;{g.why}&rdquo;</p> : null}
                <span style={{ fontSize: 13, fontWeight: 600, color: statusColor(g.outlook) }}>{statusText(g)}</span>
                {tip ? <span className={css.tip}>{fill(m.tip, { amount: money(tip.boostCents), when: whenLabel(tip.when, locale) })}</span> : null}
                <button type="button" className={css.more} aria-expanded={open} onClick={() => toggle(g.id)}>{m.more}</button>
                {open ? (
                  editId === g.id ? (
                    <div className={css.panel}>
                      <GoalForm p={p} goal={g} run={run} pending={pending} onClose={() => setEditId("")} onSaved={(r) => {
                        setEditId("");
                        toast(r.contribution ? fill(m.tSavedContrib, { amount: money(r.contribution.amountCents), per: m.per[r.contribution.frequency] }) : m.tSaved);
                      }} />
                    </div>
                  ) : (
                    <div className={css.panel}>
                      {canEdit ? (
                        <div className="row wrap" style={{ gap: 8 }}>
                          {g.status === "reached" ? (
                            <button type="button" className="btn btn-yellow" disabled={pending} onClick={() => { setError(""); if (g.inPlan) setAsk({ id: g.id, what: "complete" }); else finish(g, "complete", false, setError); }}>{m.complete}</button>
                          ) : null}
                          <button type="button" className="btn btn-dashed" aria-pressed={act?.mode === "in"} onClick={() => { setError(""); setAct({ mode: "in", amount: "" }); }}>{m.contribute}</button>
                          <button type="button" className="btn btn-secondary" aria-pressed={act?.mode === "out"} onClick={() => { setError(""); setAct({ mode: "out", amount: "" }); }}>{m.use}</button>
                          {g.inPlan ? (p.planHref ? <Link href={p.planHref} className={css.planLink}>{m.seePlan}</Link> : null)
                            : g.status === "saving" || g.status === "late" ? (
                              <button type="button" className={css.planLink} disabled={pending} onClick={() => { setError(""); run(() => addToPlan({ id: g.id }), (r) => toast(fill(m.tPlan, { amount: money(r.data.monthlyCents) })), setError); }}>{m.addPlan}</button>
                            ) : null}
                        </div>
                      ) : g.inPlan && p.planHref ? <Link href={p.planHref} className={css.planLink}>{m.seePlan}</Link> : null}
                      {act && canEdit ? (
                        <form className="row wrap" style={{ gap: 10, alignItems: "flex-end" }} onSubmit={(e) => {
                          e.preventDefault(); setError("");
                          const mode = act.mode;
                          run(() => addEntry({ goalId: g.id, amount: act.amount, mode }), (r) => {
                            setAct(null);
                            const c = r.data.crossed.at(-1);
                            toast(c ? fill(m.tMilestone, { pct: c.pct, name: c.name }) : mode === "in" ? fill(m.tContrib, { amount: money(r.data.amountCents) }) : m.tUsed, r.points, c ? ILLU.celHito : undefined);
                          }, setError);
                        }}>
                          <div className="field" style={{ flex: "1 1 160px" }}>
                            <label htmlFor={`ga-${g.id}`}>{act.mode === "in" ? m.howMuchIn : m.howMuchOut}</label>
                            <input id={`ga-${g.id}`} className="input num" inputMode="decimal" value={act.amount} onChange={(e) => setAct({ ...act, amount: e.target.value })} placeholder={money(0)} required autoFocus />
                          </div>
                          <button className="btn" disabled={pending}>{m.saveEntry}</button>
                        </form>
                      ) : null}
                      {askBox(g)}
                      {error ? <p role="alert" className="error">{error}</p> : null}
                      {g.next ? <span className="num" style={{ fontSize: 13, fontWeight: 600, color: "var(--tinta-2)" }}>{fill(m.nextMs, { p: g.next.pct, amount: money(g.next.missingCents) })}</span> : null}
                      <span className="xs muted" style={{ lineHeight: 1.5 }}>{acctText(g)}</span>
                      <h4 className="small muted" style={{ margin: "4px 0 0", fontWeight: 600 }}>{m.history}</h4>
                      {g.entries.length === 0 ? <span className="small muted">{m.noHistory}</span> : (
                        <ul className={css.history}>
                          {shown.map((x) => (
                            <li key={x.id}><span>{x.label} <span className="xs muted">· {formatDate(x.date, locale, "short")}</span></span><strong className="num">{formatMoney(x.amountCents, fmt, { sign: true })}</strong></li>
                          ))}
                        </ul>
                      )}
                      {g.entries.length > HISTORY && full !== g.id ? <button type="button" className={css.textBtn} style={{ alignSelf: "flex-start" }} onClick={() => setFull(g.id)}>{fill(m.allHistory, { n: g.entries.length })}</button> : null}
                      {canEdit ? (
                        <div className="row wrap">
                          <button type="button" className={css.textBtn} onClick={() => { setError(""); setAct(null); setEditId(g.id); }}>{m.edit}</button>
                          {g.inPlan
                            ? <button type="button" className={css.textBtn} onClick={() => { setError(""); setAsk({ id: g.id, what: "archive" }); }}>{m.archive}</button>
                            : <ConfirmButton className={css.textBtn} label={m.archive} confirmLabel={m.archiveConfirm} onConfirm={() => new Promise<void>((res) => finish(g, "archive", false, setError, res))} />}
                        </div>
                      ) : null}
                    </div>
                  )
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      <section aria-labelledby="rt-h" className="stack" style={{ gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <h2 id="rt-h" className={css.rtTitle}>{m.rtTitle}</h2>
          <span className="small muted">{m.rtSub} <Link href="/retos" style={{ fontWeight: 600 }}>{m.rtAll}</Link></span>
        </div>
        {p.challenges.length ? (
        <div className={css.retos}>
          {p.challenges.map((c) => (
            <article key={c.challengeId} className={css.reto}>
              <strong style={{ fontSize: 15 }}>{c.title}</strong>
              <span className="small muted" style={{ lineHeight: 1.5 }}>{c.text}</span>
              {c.memberId ? (
                // "Estás dentro" abre el reto en /retos (salir de un reto solo se hace allá).
                <Link href={`/retos?reto=${c.challengeId}`} className={css.retoBtn} data-on="true" aria-label={fill(m.rtInAria, { name: c.title })}>{m.rtIn} <span aria-hidden="true">›</span></Link>
              ) : canEdit ? (
                <button type="button" className={css.retoBtn} disabled={pending}
                  onClick={() => run(() => joinChallenge({ challengeId: c.challengeId }), (r) => toast(fill(m.tJoin, { name: c.title }), r.points), (e) => toast(e))}>
                  {m.rtJoin}
                </button>
              ) : null}
            </article>
          ))}
        </div>
        ) : null}
      </section>

      {done.length > 0 ? (
        <section aria-labelledby="done-h" className="stack" style={{ gap: 10 }}>
          <h2 id="done-h" style={{ fontSize: 17 }}>{m.done}</h2>
          {done.map((d) => (
            <div key={d.id} className="stack" style={{ gap: 8 }}>
            <div className={css.doneRow}>
              <span style={{ fontWeight: 600, flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}><Image src={ILLU.celMeta} alt="" aria-hidden="true" width={56} height={56} sizes="56px" className={css.doneImg} />{d.name}</span>
              <span className={`${css.tag} num`}>{fill(m.doneTag, { amount: money(d.plan.savedCents) })}</span>
              {!canEdit ? null : d.inPlan
                ? <button type="button" className={css.textBtn} onClick={() => setAsk({ id: d.id, what: "archive" })}>{m.archiveShort}</button>
                : <ConfirmButton className={css.textBtn} label={m.archiveShort} confirmLabel={m.archiveConfirm} onConfirm={() => new Promise<void>((res) => finish(d, "archive", false, (e) => toast(e), res))} />}
            </div>
            {askBox(d)}
            </div>
          ))}
        </section>
      ) : null}
    </main>
  );
}
