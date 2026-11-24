"use client";
import { useState, useTransition } from "react";
import { fill, type Locale } from "@/i18n";
import { Empty, PageHeader } from "@/components/ui/basics";
import { ConfirmButton, useToast } from "@/components/ui/client";
import { Icon } from "@/components/ui/Icon";
import { formatDate, formatMoney, monthName, monthShort, parseMoney, parts, type Cents, type ISODate, type MoneyFormat } from "@/lib/engine";
import type { Result } from "@/server/action";
import { addDebtToPlan, createDebt, deleteDebt, payDebt, settleDebtLine, updateDebt } from "./actions";
import {
  DEBT_KINDS, debtState, debtSummary, monthlyPayment, nextUnpaid, PAY_FREQS, payoffOf, percentText, progressOf, simulate,
  type DebtKind, type DebtLite, type PayFreq, type PayMode, type SchedItem,
} from "./lib";
import type { DeudasMessages } from "./messages";
import css from "./deudas.module.css";

export type DebtView = {
  id: string; name: string; kind: DebtKind; balanceCents: Cents; startBalanceCents: Cents; rateBps: number; paymentCents: Cents; paymentFrequency: PayFreq;
  nextDue: ISODate | null; schedule: SchedItem[] | null; closed: boolean; closedDate: ISODate | null;
  paidYearCents: Cents; range: [Cents, Cents] | null; inPlan: boolean; askRemove: boolean;
};
type Props = {
  debts: DebtView[]; monthIncomeCents: Cents; yearIncomeCents: Cents; paidYearCents: Cents;
  fmt: MoneyFormat; locale: Locale; today: ISODate; year: number; canEdit: boolean; m: DeudasMessages; t: { cancel: string; save: string }; bnpl: string; category: string; planOn: boolean;
};
export type Run = <T>(fn: () => Promise<Result<T>>, after: (r: Extract<Result<T>, { ok: true }>) => void, onError: (e: string) => void) => void;

export const toLite = (d: DebtView): DebtLite => ({
  id: d.id, kind: d.kind, balanceCents: d.balanceCents, startBalanceCents: d.startBalanceCents, rateBps: d.rateBps,
  paymentCents: d.paymentCents, paymentFrequency: d.paymentFrequency, schedule: d.schedule, closed: d.closed,
});
const pctText = (x: number) => `${(x * 100).toFixed(1)}%`;
const monthYear = (d: ISODate, locale: Locale, short = false) => `${(short ? monthShort : monthName)(parts(d).m, locale)} ${parts(d).y}`;
const moneyInput = (c: Cents, fmt: MoneyFormat) => (c ? formatMoney(c, fmt) : "");

export function Deudas(p: Props) {
  const { m, fmt, locale, today, year, canEdit } = p;
  const toast = useToast();
  const [pending, start] = useTransition();
  const [showNew, setShowNew] = useState(false);
  const [open, setOpen] = useState<{ id: string; mode: "pay" | "edit" } | null>(null);
  const [answered, setAnswered] = useState<Record<string, "yes" | "no">>({});
  const [errorOf, setErrorOf] = useState<Record<string, string>>({});
  const run: Run = (fn, after, onError) => start(async () => {
    const r = await fn();
    if (r.ok) after(r); else onError(r.error);
  });
  const money = (c: Cents) => formatMoney(c, fmt);
  const active = p.debts.filter((d) => !d.closed);
  const settled = p.debts.filter((d) => d.closed && ((d.closedDate && parts(d.closedDate).y === year) || d.askRemove || answered[d.id]));
  const sum = debtSummary(p.debts.map(toLite), today);
  const kindLabel = (k: DebtKind) => (k === "bnpl" ? p.bnpl : m.kinds[k]);
  const setErr = (id: string) => (e: string) => setErrorOf((x) => ({ ...x, [id]: e }));
  const toggle = (id: string, mode: "pay" | "edit") => { setOpen(open?.id === id && open.mode === mode ? null : { id, mode }); setErrorOf({}); };

  // Sin fecha si falta algún saldo o si alguna deuda no termina con su cuota: nunca una fecha engañosa.
  const free = sum.open === 0 ? m.freeNone : sum.neverEnds ? m.freeNever
    : sum.missing > 0 ? (sum.missing === 1 ? m.freeMissingOne : fill(m.freeMissing, { n: sum.missing }))
    : sum.freeDate ? monthYear(sum.freeDate, locale) : "—";

  return (
    <>
      <PageHeader title={m.title} eyebrow={<span className="only-desktop">{m.eyebrow}</span>}>
        {canEdit ? (
          <>
            <button type="button" className="btn only-desktop" aria-expanded={showNew} onClick={() => setShowNew(!showNew)}>{m.add}</button>
            <button type="button" className={`${css.plus} only-mobile`} aria-expanded={showNew} aria-label={m.addAria} onClick={() => setShowNew(!showNew)}>+</button>
          </>
        ) : null}
      </PageHeader>

      {showNew && canEdit ? <NewDebt p={p} run={run} pending={pending} onClose={() => setShowNew(false)} onSaved={(inPlan) => { setShowNew(false); toast(inPlan ? m.tCreatedPlan : m.tCreated); }} /> : null}

      <section aria-label={m.sumAria} className={css.summary}>
        <div className="only-desktop"><span className={css.k}>{m.sumTotal}</span><span className={`num ${css.v}`}>{money(sum.totalCents)}</span></div>
        <div>
          <span className={css.k}>{m.sumMonthly}</span><span className={`num big ${css.v} ${css.vBig}`}>{money(sum.monthlyCents)}</span>
          {p.monthIncomeCents > 0 ? <span className={css.note}><span className="only-desktop">{fill(m.ofIncome, { pct: pctText(sum.monthlyCents / p.monthIncomeCents) })}</span><span className="only-mobile">{fill(m.ofIncomeShort, { pct: pctText(sum.monthlyCents / p.monthIncomeCents) })}</span></span> : null}
        </div>
        <div className="only-mobile"><span className={css.k}>{m.sumTotalShort}</span><span className={`num ${css.v}`}>{money(sum.totalCents)}</span></div>
        <div className="only-desktop">
          <span className={css.k}>{fill(m.sumPaid, { year })}</span><span className={`num big ${css.v} ${css.vBig}`}>{money(p.paidYearCents)}</span>
          {p.yearIncomeCents > 0 ? <span className={css.note}>{fill(m.ofIncome, { pct: pctText(p.paidYearCents / p.yearIncomeCents) })}</span> : null}
        </div>
        <div className="only-desktop"><span className={css.k}>{m.sumFree}</span><span className={css.v}>{free}</span></div>
      </section>

      {active.length === 0 && settled.length === 0 ? (
        <Empty icon="receipt" title={m.emptyTitle} text={m.emptyText}>{canEdit && !showNew ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowNew(true)}>{m.emptyCta}</button> : null}</Empty>
      ) : null}

      {active.length ? (
        <div className={css.grid}>
          {active.map((d) => (
            <DebtCard key={d.id} d={d} p={p} kindLabel={kindLabel(d.kind)} mode={open?.id === d.id ? open.mode : null} toggle={toggle} run={run} pending={pending}
              error={errorOf[d.id] ?? ""} setError={setErr(d.id)}
              onPaid={(r) => {
                setOpen(null);
                if (r.closed) toast(fill(m.tPaidOff, { name: r.name }), r.points);
                else toast(fill(m.tPaid, { amount: money(r.amountCents) }), r.points);
              }}
              onSaved={(text) => { setOpen(null); toast(text); }} />
          ))}
        </div>
      ) : null}

      {settled.length ? (
        <section aria-labelledby="sald-d" className={css.settled}>
          <h2 id="sald-d" style={{ fontSize: 16, fontFamily: "var(--sans)", fontWeight: 600, letterSpacing: 0 }}>{m.settledTitle}</h2>
          {settled.map((d) => {
            const quota = monthlyPayment(d);
            const when = d.closedDate ?? today;
            const sub = quota <= 0 ? fill(m.settledNoQuota, { date: formatDate(when, locale, "day") }) : when === today ? fill(m.settledToday, { amount: money(quota) }) : fill(m.settledOn, { date: formatDate(when, locale, "day"), amount: money(quota) });
            const a = answered[d.id];
            return (
              <div key={d.id} className={css.settledRow}>
                <div className="row" role={when === today ? "status" : undefined}>
                  <span aria-hidden="true" className={css.tick}>✓</span>
                  <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}><strong style={{ fontSize: 15 }}>{d.name}</strong><span className="xs muted">{sub}</span></span>
                </div>
                {a ? <span className={css.doneText}>{a === "yes" ? m.doneYes : m.doneNo}</span> : d.askRemove && canEdit ? (
                  <div className={css.ask}>
                    <span>{m.ask}</span>
                    <button type="button" className="btn" disabled={pending} onClick={() => run(() => settleDebtLine({ id: d.id, remove: true }), () => setAnswered((x) => ({ ...x, [d.id]: "yes" })), (e) => toast(e))}>{m.askYes}</button>
                    <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => run(() => settleDebtLine({ id: d.id, remove: false }), () => setAnswered((x) => ({ ...x, [d.id]: "no" })), (e) => toast(e))}>{m.askNo}</button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      ) : null}
    </>
  );
}

function NewDebt({ p, run, pending, onClose, onSaved }: { p: Props; run: Run; pending: boolean; onClose: () => void; onSaved: (inPlan: boolean) => void }) {
  const { m, fmt, today } = p;
  const [f, setF] = useState({ kind: "loan" as DebtKind, name: "", balance: "", payment: "", rate: "", first: "", count: "", toPlan: p.planOn });
  const [error, setError] = useState("");
  const bnpl = f.kind === "bnpl";
  const zero = formatMoney(0, fmt);
  return (
    <form aria-labelledby="nd-t" className={css.newForm} onSubmit={(e) => {
      e.preventDefault(); setError("");
      run(() => createDebt({ ...f, addToPlan: f.toPlan }), (r) => onSaved(r.data.inPlan), setError);
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 id="nd-t" className={css.newTitle}>{m.newTitle}</h2>
        <span className="small muted only-desktop">{m.newSub}</span>
      </div>
      <div role="radiogroup" aria-label={m.kindAria} className={css.chips}>
        {DEBT_KINDS.map((k) => <button key={k} type="button" role="radio" aria-checked={f.kind === k} className={css.chip} onClick={() => setF({ ...f, kind: k })}>{k === "bnpl" ? p.bnpl : m.kinds[k]}</button>)}
      </div>
      <div className={css.fields}>
        <div className={`field ${css.wide}`}><label htmlFor="nd-name">{m.name}</label><input id="nd-name" className={css.input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={m.namePh} maxLength={80} required /></div>
        <div className="field"><label htmlFor="nd-saldo">{bnpl ? m.bnplTotal : m.balanceToday}</label><input id="nd-saldo" className={`${css.input} num`} inputMode="decimal" value={f.balance} onChange={(e) => setF({ ...f, balance: e.target.value })} placeholder={zero} required={bnpl} /></div>
        {bnpl ? null : <div className="field"><label htmlFor="nd-cuota">{m.payment}</label><input id="nd-cuota" className={`${css.input} num`} inputMode="decimal" value={f.payment} onChange={(e) => setF({ ...f, payment: e.target.value })} placeholder={zero} /></div>}
        {bnpl ? null : <div className="field"><label htmlFor="nd-tasa">{m.rate}</label><input id="nd-tasa" className={`${css.input} num`} inputMode="decimal" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} placeholder={m.ratePh} /></div>}
        <div className="field"><label htmlFor="nd-ini">{bnpl ? m.bnplDate : m.first}</label><input id="nd-ini" className={css.input} type="date" value={f.first} onChange={(e) => setF({ ...f, first: e.target.value })} placeholder={today} /></div>
        {bnpl ? null : <div className="field"><label htmlFor="nd-n">{m.count}</label><input id="nd-n" className={`${css.input} num`} inputMode="numeric" value={f.count} onChange={(e) => setF({ ...f, count: e.target.value.replace(/\D/g, "").slice(0, 3) })} placeholder={m.countPh} /></div>}
      </div>
      {bnpl ? <p className="small muted" style={{ lineHeight: 1.5 }}>{m.bnplHint}</p> : null}
      {p.planOn ? (
        <label className={css.toPlan}>
          <input type="checkbox" checked={f.toPlan} onChange={(e) => setF({ ...f, toPlan: e.target.checked })} />
          <span><strong>{m.toPlan}</strong><span className="small only-desktop" style={{ color: "var(--tinta-2)" }}>{fill(m.toPlanSub, { category: p.category })}</span></span>
        </label>
      ) : null}
      {error ? <p role="alert" className="error">{error}</p> : null}
      <div className={css.actions}>
        <button type="button" className="btn btn-secondary only-desktop" onClick={onClose}>{p.t.cancel}</button>
        <button type="submit" className="btn" disabled={pending} style={{ flex: "0 1 auto" }}>{m.saveNew}</button>
      </div>
    </form>
  );
}

type PaidData = { closed: boolean; askRemove: boolean; amountCents: number; name: string; points?: number };

function DebtCard({ d, p, kindLabel, mode, toggle, run, pending, error, setError, onPaid, onSaved }: {
  d: DebtView; p: Props; kindLabel: string; mode: "pay" | "edit" | null; toggle: (id: string, mode: "pay" | "edit") => void; run: Run; pending: boolean;
  error: string; setError: (e: string) => void; onPaid: (r: PaidData) => void; onSaved: (text: string) => void;
}) {
  const { m, fmt, locale, today, year, canEdit } = p;
  const money = (c: Cents) => formatMoney(c, fmt);
  const lite = toLite(d);
  const st = debtState(lite);
  const payoff = payoffOf(lite, today);
  const monthly = monthlyPayment(lite);
  const card = d.kind === "card";
  const ends = st === "noBalance" ? m.noBalance : !payoff || (card && monthly <= 0) ? "—" : payoff.neverEnds ? m.never : payoff.endDate ? monthYear(payoff.endDate, locale, true) : "—";
  const range = d.range ? (d.range[0] === d.range[1] ? money(d.range[0]) : `${money(d.range[0])} – ${money(d.range[1])}`) : null;
  const sub = card ? fill(m.cardSub, { kind: kindLabel }) : kindLabel;

  return (
    <article className={`${css.debt} ${mode === "edit" ? css.debtOpen : ""}`}>
      <div className={css.head}>
        <div className={css.who}>
          <span aria-hidden="true" className={css.iconBox}><Icon name="card" size={22} color="var(--naranja)" /></span>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}><h2>{d.name}</h2><span className="small muted">{sub}</span></div>
        </div>
        {canEdit ? (
          <div className={css.btns}>
            <button type="button" className="btn" aria-expanded={mode === "pay"} onClick={() => toggle(d.id, "pay")}>{m.payBtn}</button>
            <button type="button" className="btn btn-secondary" aria-expanded={mode === "edit"} onClick={() => toggle(d.id, "edit")}>{mode === "edit" ? m.editing : m.edit}</button>
          </div>
        ) : null}
      </div>

      {mode === "edit" ? <EditDebt d={d} p={p} run={run} pending={pending} onClose={() => toggle(d.id, "edit")} onSaved={onSaved} /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {st === "noBalance" ? (
            <div className={css.missing}><span>{m.noBalanceText}</span>{canEdit ? <button type="button" className={css.linkBtn} onClick={() => toggle(d.id, "edit")}>{m.writeBalance}</button> : null}</div>
          ) : (
            <div className="only-desktop"><div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="row-between small muted"><span>{m.progress}</span><span className="num">{Math.round(progressOf(lite) * 100)}%</span></div>
              <div className={css.track} role="progressbar" aria-label={m.progress} aria-valuenow={Math.round(progressOf(lite) * 100)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.round(progressOf(lite) * 100)}%` }} /></div>
            </div></div>
          )}
          <dl className={css.dl}>
            <div><dt>{m.balance}</dt><dd className="num">{st === "noBalance" ? "—" : money(d.balanceCents)}</dd></div>
            <div><dt>{m.quota}</dt><dd className="num">{monthly > 0 ? money(monthly) : m.variable}{monthly > 0 && d.paymentFrequency !== "monthly" ? <small>{money(d.paymentCents)} {m.perFreq[d.paymentFrequency]}</small> : null}</dd></div>
            <div className={css.deskOnly}><dt>{m.rateShort}</dt><dd className="num">{d.schedule ? "0%" : `${percentText(d.rateBps)}%`}</dd></div>
            <div><dt>{m.ends}</dt><dd>{ends}</dd></div>
            <div><dt>{fill(m.paidYear, { year })}</dt><dd className="num">{money(d.paidYearCents)}</dd></div>
            <div className={range ? css.deskOnly : undefined}><dt>{fill(m.planYear, { year })}</dt><dd className="num">
              {range ?? (canEdit && p.planOn && (monthly > 0 || d.schedule) ? <button type="button" className={css.linkBtn} disabled={pending} onClick={() => run(() => addDebtToPlan({ id: d.id }), () => onSaved(m.tPlan), setError)}>{m.addPlan}</button> : "—")}
            </dd></div>
          </dl>
          {payoff && !payoff.neverEnds && payoff.interestCents > 0 ? <p className="xs muted">{fill(m.interest, { amount: money(payoff.interestCents) })}</p> : null}
          {d.schedule ? (
            <div>
              <h3 className="label" style={{ marginBottom: 4 }}>{m.sched}</h3>
              <ul className={css.sched}>
                {d.schedule.map((i, n) => (
                  <li key={i.date + n}><span>{fill(m.schedN, { n: n + 1, total: d.schedule!.length })} · {formatDate(i.date, locale, "short")}</span><span className="row" style={{ gap: 10 }}><strong className="num">{money(i.amountCents)}</strong><span className={`pill ${i.paid ? "pill-ok" : ""}`}>{i.paid ? m.schedPaid : m.schedPending}</span></span></li>
                ))}
              </ul>
            </div>
          ) : null}
          {st === "active" && !d.schedule ? <Simulator d={lite} p={p} /> : null}
          {error && mode !== "pay" ? <p role="alert" className="error">{error}</p> : null}
        </div>
      )}

      {mode === "pay" ? <PayDebt d={d} p={p} run={run} pending={pending} error={error} setError={setError} onClose={() => toggle(d.id, "pay")} onPaid={onPaid} /> : null}
    </article>
  );
}

function Simulator({ d, p }: { d: DebtLite; p: Props }) {
  const { m, fmt, locale, today } = p;
  const [extra, setExtra] = useState("");
  const cents = parseMoney(extra) ?? 0;
  const r = cents > 0 ? simulate(d, cents, today) : null;
  const months = (n: number) => (n === 1 ? m.oneMonth : fill(m.months, { n }));
  let out = m.simHint;
  if (r) {
    if (r.sim.neverEnds || !r.sim.endDate) out = m.simNever;
    else if (r.base.neverEnds) out = fill(m.simRescue, { date: monthYear(r.sim.endDate, locale) });
    else out = r.monthsSaved ? fill(m.simResult, { date: monthYear(r.sim.endDate, locale), months: months(r.monthsSaved) }) : fill(m.simResultSame, { date: monthYear(r.sim.endDate, locale) });
  }
  return (
    <details className={css.sim}>
      <summary>{m.simTitle}</summary>
      <div className={css.simBody}>
        <div className="field" style={{ maxWidth: 260 }}><label htmlFor={`sim-${d.id}`}>{m.simLabel}</label><input id={`sim-${d.id}`} className={`${css.input} num`} inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder={formatMoney(10_000, fmt)} /></div>
        <p className={css.simOut} aria-live="polite">{out}{r && r.interestSaved ? <> <strong>{fill(m.simInterest, { amount: formatMoney(r.interestSaved, fmt) })}</strong></> : null}</p>
      </div>
    </details>
  );
}

function EditDebt({ d, p, run, pending, onClose, onSaved }: { d: DebtView; p: Props; run: Run; pending: boolean; onClose: () => void; onSaved: (text: string) => void }) {
  const { m, fmt, canEdit } = p;
  const [f, setF] = useState({
    name: d.name, balance: moneyInput(d.balanceCents, fmt), payment: moneyInput(d.paymentCents, fmt), frequency: d.paymentFrequency,
    rate: d.rateBps ? percentText(d.rateBps) : "", nextDue: d.nextDue ?? "",
  });
  const [error, setError] = useState("");
  const zero = formatMoney(0, fmt);
  const sch = !!d.schedule;
  return (
    <form className="stack" style={{ gap: 14 }} aria-label={fill(m.editTitle, { name: d.name })} onSubmit={(e) => {
      e.preventDefault(); setError("");
      run(() => updateDebt({ id: d.id, ...f }), () => onSaved(m.tSaved), setError);
    }}>
      <div className={css.fields2}>
        <div className="field"><label htmlFor={`e-${d.id}-n`}>{m.name}</label><input id={`e-${d.id}-n`} className={css.inputSoft} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} required /></div>
        <div className="field"><label htmlFor={`e-${d.id}-s`}>{m.balancePending}</label><input id={`e-${d.id}-s`} className={`${css.inputSoft} num`} inputMode="decimal" value={f.balance} onChange={(e) => setF({ ...f, balance: e.target.value })} placeholder={zero} /></div>
        {sch ? null : <>
          <div className="field"><label htmlFor={`e-${d.id}-c`}>{m.paymentEach}</label><input id={`e-${d.id}-c`} className={`${css.inputSoft} num`} inputMode="decimal" value={f.payment} onChange={(e) => setF({ ...f, payment: e.target.value })} placeholder={zero} /></div>
          <div className="field"><label htmlFor={`e-${d.id}-f`}>{m.freq}</label>
            <select id={`e-${d.id}-f`} className={css.inputSoft} value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value as PayFreq })}>
              {PAY_FREQS.map((x) => <option key={x} value={x}>{m.freqs[x]}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor={`e-${d.id}-t`}>{m.rate}</label><input id={`e-${d.id}-t`} className={`${css.inputSoft} num`} inputMode="decimal" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} placeholder={m.ratePh} /></div>
          <div className="field"><label htmlFor={`e-${d.id}-d`}>{m.nextDue}</label><input id={`e-${d.id}-d`} className={css.inputSoft} type="date" value={f.nextDue} onChange={(e) => setF({ ...f, nextDue: e.target.value })} /></div>
        </>}
      </div>
      {error ? <p role="alert" className="error">{error}</p> : null}
      <div className={css.actions} style={{ justifyContent: "space-between" }}>
        {canEdit ? <ConfirmButton label={m.remove} confirmLabel={m.removeConfirm} className="btn btn-danger" onConfirm={() => new Promise<void>((res) => run(() => deleteDebt({ id: d.id }), () => { onSaved(m.tDeleted); res(); }, (e) => { setError(e); res(); }))} /> : <span />}
        <span className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{p.t.cancel}</button>
          <button type="submit" className="btn" disabled={pending}>{p.t.save}</button>
        </span>
      </div>
      <p className="xs muted" style={{ lineHeight: 1.5 }}>{m.removeHint}</p>
    </form>
  );
}

function PayDebt({ d, p, run, pending, error, setError, onClose, onPaid }: { d: DebtView; p: Props; run: Run; pending: boolean; error: string; setError: (e: string) => void; onClose: () => void; onPaid: (r: PaidData) => void }) {
  const { m, fmt, locale } = p;
  const card = d.kind === "card";
  const order: PayMode[] = card ? ["abono", "cuota", "total"] : ["cuota", "abono", "total"];
  const labels = card ? m.cardModes : m.modes;
  const [mode, setMode] = useState<PayMode>(order[0]);
  const [amount, setAmount] = useState("");
  const next = nextUnpaid(d.schedule);
  const suggested = next?.amountCents ?? d.paymentCents;
  const noBalance = d.balanceCents <= 0;
  return (
    <form className={css.payBox} onSubmit={(e) => {
      e.preventDefault(); setError("");
      run(() => payDebt({ id: d.id, mode, amount }), (r) => onPaid({ ...r.data, points: r.points }), setError);
    }}>
      <div role="radiogroup" aria-label={m.payAria} className={css.modes}>
        {order.map((k) => <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)}>{labels[k]}</button>)}
      </div>
      {noBalance ? <p className="small" style={{ color: "var(--ambar-texto)" }}>{m.errBalanceFirst}</p> : mode === "total" ? (
        <p className="small" style={{ color: "var(--verde-fuerte)", lineHeight: 1.5 }}>{fill(m.totalNote, { amount: formatMoney(d.balanceCents, fmt) })}</p>
      ) : (
        <div className="field"><label htmlFor={`pay-${d.id}`}>{m.amountPaid}</label><input id={`pay-${d.id}`} className={`${css.input} num`} style={{ fontWeight: 600, fontSize: 16 }} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={suggested ? formatMoney(suggested, fmt) : formatMoney(0, fmt)} required={!(mode === "cuota" && suggested > 0)} /></div>
      )}
      {next && mode === "cuota" && d.schedule ? <p className="xs muted">{fill(m.bnplNote, { n: d.schedule.indexOf(next) + 1, total: d.schedule.length, date: formatDate(next.date, locale, "short") })}</p> : null}
      {card ? <p className="xs" style={{ color: "var(--azul-texto)", lineHeight: 1.5 }}>{m.cardNote}</p> : null}
      {error ? <p role="alert" className="error">{error}</p> : null}
      <div className={css.actions} style={{ gap: 8 }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>{p.t.cancel}</button>
        <button type="submit" className="btn" disabled={pending || noBalance}>{m.register}</button>
      </div>
    </form>
  );
}
