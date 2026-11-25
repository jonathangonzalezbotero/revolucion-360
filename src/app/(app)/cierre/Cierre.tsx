"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { fill, type Locale } from "@/i18n";
import { ConfirmButton, useToast } from "@/components/ui/client";
import { Empty } from "@/components/ui/basics";
import { formatDate, formatMoney, monthName, parseMoney, type Cents, type MoneyFormat } from "@/lib/engine";
import { parseUnitPrice } from "@/lib/engine/inversiones";
import { closeMonth, reopenMonth, resolvePending, saveNext, undoPending, type CloseResult, type Undo } from "./actions";
import css from "./cierre.module.css";
import { adjustedNet, balanceGap, cardSigned, changedCells, moneyInput, type Deviation, type PendingOpt, type Period, type Snapshot, type Totals } from "./lib";
import type { CierreText } from "./messages";
import { Leftover } from "./Leftover";
import { ILLU } from "@/lib/images";

type Pending = { lineId: string; name: string; status: string; plannedCents: Cents; realCents: Cents; missingCents: Cents; opts: PendingOpt[] };
export type CierreProps = {
  period: Period; name: string; nextName: string; lower: string; nextLower: string;
  canEdit: boolean; fmt: MoneyFormat; locale: Locale; m: CierreText; actions: { save: string };
  closed: { closedOn: string | null; snapshot: Snapshot | null } | null; reopened: boolean; hasPlan: boolean;
  pending: Pending[]; over: { lineId: string; name: string; overCents: Cents }[]; review: number; unplanned: number;
  compare: { plan: Totals; real: Totals; devs: Deviation[] };
  adjust: { year: number; month: number; income: Cents; lines: { lineId: string; name: string; cents: Cents }[] };
  /** Activos de Inversiones: por unidades se escribe el precio por unidad de hoy; por saldo, el saldo de hoy. `note`: último dato escrito. */
  investments: { id: string; name: string; byUnits: boolean; note: string }[];
  balances: { id: string; name: string; kind: string; card: boolean; balanceCents: Cents; shownCents: Cents; expectedCents: Cents; reconcile: boolean; dateLabel: string }[];
  list: { month: number; label: string; reopened: boolean; href: string; current: boolean }[];
  links: { review: string | null; monthPlan: string; nextPlan: string; cuentas: string };
  /** Metas activas para mandar lo que sobró, y si ya se decidió qué hacer con lo de este mes. */
  leftover: { goals: { id: string; name: string }[]; decided: boolean; closedCents: Cents };
};

export function Cierre(p: CierreProps) {
  const { m, fmt } = p;
  const toast = useToast();
  const money = (c: Cents) => formatMoney(c, fmt);
  const key = `${p.period.year}-${p.period.month}`;
  const [seen, setSeen] = useState(key);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<CloseResult | null>(null);
  const [done, setDone] = useState<Record<string, { opt: PendingOpt; item: Pending; undo: Undo }>>({});
  const [adjust, setAdjust] = useState<Record<string, string>>({}); // solo lo que el usuario escribió
  const [bal, setBal] = useState<Record<string, string>>({});
  const [inv, setInv] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Otro mes (enlace de la lista): el asistente vuelve a empezar, salvo que se esté mostrando el éxito.
  if (seen !== key) {
    setSeen(key);
    setResult(null); setStep(0); setDone({}); setAdjust({}); setBal({}); setInv({}); setError(null);
  }

  // ───────── Éxito (se pinta con lo que devolvió la acción, no con las props que se recargan) ─────────
  if (result) {
    const rLower = monthName(result.month, p.locale).toLowerCase();
    const rNext = monthName(result.month === 12 ? 1 : result.month + 1, p.locale).toLowerCase();
    return (
      <div className={css.wrap}>
        <section className={css.success} aria-live="polite">
          <Image src={ILLU.celCierre} alt="" aria-hidden="true" width={120} height={120} sizes="120px" className={css.celImg} />
          <h2 className={css.h2}>{fill(m.doneTitle, { month: rLower })}</h2>
          <p className={css.successText}>
            {result.points > 0 ? <><span className={css.pts}>{fill(m.points, { n: result.points })}</span>{" "}</> : null}
            <strong>{result.streak > 1 ? fill(m.streak, { n: result.streak }) : m.streakOne}</strong>{" "}
            {result.reminder ? fill(m.remind, { next: rNext, date: formatDate(result.reminder, p.locale) }) : null}
          </p>
          {p.canEdit && !p.leftover.decided && result.leftoverCents > 0
            ? <Leftover lf={{ year: result.year, month: result.month, monthLabel: rLower, cents: result.leftoverCents, goals: p.leftover.goals }} fmt={fmt} m={m} /> : null}
          <div className={css.ctas}>
            <Link href="/diagnostico" className={css.ctaMain}>{m.seeDiag}</Link>
            <Link href="/inicio" className={css.ctaAlt}>{m.backHome}</Link>
          </div>
        </section>
      </div>
    );
  }

  const listBlock = (
    <section aria-labelledby="cerrados" className={css.section}>
      <h2 id="cerrados" style={{ fontSize: 18 }}>{fill(m.listTitle, { year: p.period.year })}</h2>
      {p.list.length === 0 ? <p className={css.para}>{fill(m.listEmpty, { year: p.period.year })}</p> : (
        <ul className={css.list}>
          {p.list.map((r) => (
            <li key={r.month}>
              <Link href={r.href} aria-current={r.current ? "page" : undefined}>
                <span>{r.label}</span>
                <span className={css.listRight}>
                  <span className={`pill ${r.reopened ? "pill-warn" : "pill-ok"}`}>{r.reopened ? m.reopenedPill : m.closedPill}</span>
                  <span className="xs muted">{r.current ? m.current : m.see}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  // ───────── Mes ya cerrado: resumen y reabrir ─────────
  if (p.closed) {
    const sn = p.closed.snapshot;
    return (
      <div className={css.wrap}>
        <section className={css.section} aria-labelledby="cerrado">
          <h2 id="cerrado" className={css.h2}>{fill(m.closedTitle, { month: p.name, year: p.period.year })}</h2>
          {p.closed.closedOn ? <p className={css.lead}>{fill(m.closedOn, { date: p.closed.closedOn })}</p> : null}
          {sn ? <div className={css.grid2}>
            <div className={css.stat}><span className={css.k}>{m.closedPlan} · {sn.plan.net < 0 ? m.short : m.left}</span><span className={`num big ${css.v}`}>{money(Math.abs(sn.plan.net))}</span><span className="xs muted">{fill(m.inOutPlan, { in: money(sn.plan.income), out: money(sn.plan.expense) })}</span></div>
            <div className={css.stat}><span className={css.k}>{m.closedReal} · {sn.real.net < 0 ? m.short : m.left}</span><span className={`num ${css.v2}`} style={{ color: sn.real.net < 0 ? "var(--rojo)" : "var(--tinta)" }}>{money(Math.abs(sn.real.net))}</span><span className="xs muted">{fill(m.inOut, { in: money(sn.real.income), out: money(sn.real.expense) })}</span></div>
          </div> : null}
          {sn && (sn.balances.length || sn.investments.length) ? (
            <div className={css.rows}>
              <h3>{m.balancesAt}</h3>
              {sn.balances.map((b) => <div key={b.id} className={css.row}><span>{b.name}</span><strong className="num">{money(b.cents)}</strong></div>)}
              {sn.investments.map((i) => <div key={i.id} className={css.row}><span>{fill(m.invLabel, { name: i.name })}</span><strong className="num">{money(i.cents)}</strong></div>)}
            </div>
          ) : null}
          {p.canEdit && !p.leftover.decided && p.leftover.closedCents > 0
            ? <Leftover lf={{ year: p.period.year, month: p.period.month, monthLabel: p.lower, cents: p.leftover.closedCents, goals: p.leftover.goals }} fmt={fmt} m={m} /> : null}
          <Link href={p.links.monthPlan} className="link small" style={{ fontWeight: 600 }}>{fill(m.planLink, { month: p.lower })}</Link>
          {p.canEdit ? (
            <div className="banner" style={{ alignItems: "center" }}>
              <span>{m.reopenWarn}</span>
              <ConfirmButton className="btn btn-secondary btn-sm" label={m.reopen} confirmLabel={m.reopenConfirm} onConfirm={async () => {
                const r = await reopenMonth({ year: p.period.year, month: p.period.month });
                if (r.ok) toast(fill(m.reopened, { month: p.name })); else setError(r.error);
              }} />
            </div>
          ) : null}
          {error ? <p className={css.error} role="alert">{error}</p> : null}
        </section>
        {listBlock}
      </div>
    );
  }

  // ───────── Asistente de 4 pasos ─────────
  const labels = m.steps.map((l) => fill(l, { next: p.nextLower }));
  const shownPending: { item: Pending; picked: PendingOpt | null }[] = [
    ...p.pending.map((it) => ({ item: it, picked: done[it.lineId]?.opt ?? null })),
    ...Object.values(done).filter((d) => !p.pending.some((x) => x.lineId === d.item.lineId)).map((d) => ({ item: d.item, picked: d.opt })),
  ];

  const pick = async (it: Pending, opt: PendingOpt) => {
    if (!p.canEdit || done[it.lineId]) return;
    setBusy(it.lineId); setError(null);
    const r = await resolvePending({ year: p.period.year, month: p.period.month, lineId: it.lineId, opt });
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setDone((d) => ({ ...d, [it.lineId]: { opt, item: it, undo: r.data } }));
  };
  /** Deshacer (mientras el mes no se cierre): vuelven las celdas o la marca como estaban. */
  const undo = async (lineId: string) => {
    const d = done[lineId];
    if (!d || !p.canEdit) return;
    setBusy(lineId); setError(null);
    const r = await undoPending({ year: p.period.year, month: p.period.month, undo: d.undo });
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setDone((x) => { const n = { ...x }; delete n[lineId]; return n; });
  };

  const adjRows = p.adjust.lines.map((l) => {
    const raw = adjust[l.lineId] ?? moneyInput(l.cents);
    const typed = raw.trim() === "" ? null : parseMoney(raw);
    return { lineId: l.lineId, name: l.name, cents: l.cents, raw, typed };
  });
  const adj = adjustedNet(p.adjust.income, adjRows);

  const goNext = async () => {
    setError(null);
    if (step === 2 && p.canEdit) {
      const bad = adjRows.find((r) => r.raw.trim() !== "" && (r.typed === null || r.typed < 0));
      if (bad) return setError(fill(m.badAmount, { name: bad.name }));
      const cells = changedCells(adjRows);
      if (cells.length) {
        setBusy("next");
        const r = await saveNext({ year: p.adjust.year, month: p.adjust.month, cells: cells.map((c) => ({ lineId: c.lineId, amount: moneyInput(c.cents) })) });
        setBusy(null);
        if (!r.ok) return setError(r.error);
      }
    }
    if (step === 3) {
      if (!p.canEdit) return;
      const bad = p.balances.find((b) => (bal[b.id] ?? "").trim() !== "" && parseMoney(bal[b.id]) === null);
      if (bad) return setError(fill(m.badBalance, { name: bad.name }));
      const badInv = p.investments.find((i) => (inv[i.id] ?? "").trim() !== "" && (i.byUnits ? parseUnitPrice(inv[i.id], fmt.numberLocale) === null : (parseMoney(inv[i.id]) ?? -1) < 0));
      if (badInv) return setError(fill(m.badBalance, { name: badInv.name }));
      setBusy("close");
      const r = await closeMonth({ year: p.period.year, month: p.period.month, balances: p.balances.map((b) => ({ id: b.id, amount: bal[b.id] ?? "" })), investments: p.investments.map((i) => ({ id: i.id, amount: inv[i.id] ?? "" })) });
      setBusy(null);
      if (!r.ok) return setError(r.error);
      setResult(r.data);
      toast(fill(m.toastDone, { month: p.name }), r.data.points || undefined);
      return;
    }
    setStep((s) => Math.min(3, s + 1));
  };

  return (
    <div className={css.wrap}>
      <ol aria-label={m.stepsAria} className={css.steps}>
        {labels.map((l, i) => (
          <li key={l} data-on={i <= step} aria-current={i === step ? "step" : undefined}>
            <span aria-hidden="true" className={css.bar} />
            <span className={css.label}>{i + 1}. {l}</span>
          </li>
        ))}
      </ol>
      {!p.canEdit ? <div className="banner" role="note">{m.readOnly}</div> : null}
      {p.reopened ? <div className="banner banner-info" role="note">{m.reopenedBanner}</div> : null}

      {step === 0 ? (
        <section className={css.section} aria-labelledby="paso">
          <h2 id="paso" className={css.h2}>{fill(m.reviewTitle, { month: p.lower })}</h2>
          {p.review > 0 && p.links.review ? (
            <Link href={p.links.review} className={css.alert}>{p.review === 1 ? m.toReviewOne : fill(m.toReview, { n: p.review })} <span aria-hidden="true">›</span></Link>
          ) : null}
          {p.unplanned > 0 ? (
            <Link href={p.links.monthPlan} className={css.soft}>{p.unplanned === 1 ? m.unplannedOne : fill(m.unplanned, { n: p.unplanned })} <span aria-hidden="true">›</span></Link>
          ) : null}
          {!p.hasPlan ? (
            <Empty icon="plan" title={fill(m.noPlanTitle, { month: p.lower })} text={m.noPlanText}><Link href="/asistente" className="btn btn-secondary btn-sm">{m.noPlanCta}</Link></Empty>
          ) : shownPending.length === 0 ? (
            <p className={css.lead}>{fill(m.allClear, { month: p.lower })}</p>
          ) : shownPending.map(({ item, picked }) => (
            <div key={item.lineId} className={css.box}>
              <div className={css.boxHead}>
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <strong>{item.name}</strong>
                  <span className={css.sub}>{item.status === "partial" ? fill(m.partialSub, { paid: money(item.realCents), planned: money(item.plannedCents) }) : m.pendingSub}</span>
                </span>
                <span className="num" style={{ fontWeight: 600 }}>{money(item.missingCents)}</span>
              </div>
              <div role="group" aria-label={fill(m.whatHappened, { name: item.name })} className={css.opts}>
                {item.opts.map((o) => (
                  <button key={o} type="button" className={css.opt} aria-pressed={picked === o} disabled={!p.canEdit || !!picked || busy === item.lineId} onClick={() => pick(item, o)}>
                    {fill(m.opts[o], { next: p.nextLower })}
                  </button>
                ))}
              </div>
              {picked ? (
                <span className={css.doneRow}>
                  <span className={css.note} role="status">{fill(m.done[picked], { next: p.nextLower, month: p.lower })}</span>
                  {p.canEdit ? <button type="button" className={css.undo} disabled={busy === item.lineId} onClick={() => undo(item.lineId)}>{m.undo}</button> : null}
                </span>
              ) : null}
            </div>
          ))}
          {p.over.length ? (
            <div className={css.rows}>
              <h3>{m.overTitle}</h3>
              {p.over.map((o) => <div key={o.lineId} className={css.row}><span>{o.name}</span><span className={css.overTxt}>{fill(m.overLine, { amount: money(o.overCents) })}</span></div>)}
            </div>
          ) : null}
        </section>
      ) : null}

      {step === 1 ? (
        <section className={css.section} aria-labelledby="paso">
          <h2 id="paso" className={css.h2}>{m.compareTitle}</h2>
          <div className={css.grid2}>
            <div className={css.stat}>
              <span className={css.k}>{p.compare.plan.net < 0 ? m.plannedShort : m.plannedLeft}</span>
              <span className={`num big ${css.v}`}>{money(Math.abs(p.compare.plan.net))}</span>
              <span className="xs muted">{fill(m.inOutPlan, { in: money(p.compare.plan.income), out: money(p.compare.plan.expense) })}</span>
            </div>
            <div className={css.stat}>
              <span className={css.k}>{p.compare.real.net < 0 ? m.realShort : m.realLeft}</span>
              <span className={`num ${css.v2}`} style={{ color: p.compare.real.net < 0 ? "var(--rojo)" : "var(--tinta)" }}>{money(Math.abs(p.compare.real.net))}</span>
              <span className="xs muted">{fill(m.inOut, { in: money(p.compare.real.income), out: money(p.compare.real.expense) })}</span>
            </div>
          </div>
          <div className={css.rows}>
            <h3>{m.deviationTitle}</h3>
            {p.compare.devs.length === 0 ? <div className={css.row}><span className="muted">{m.noDeviation}</span></div> : p.compare.devs.map((d) => (
              <div key={d.id} className={css.row}>
                <span>{d.name}</span>
                <strong className={d.diffCents > 0 ? css.overTxt : css.underTxt}>{fill(d.diffCents > 0 ? m.over : m.under, { amount: money(Math.abs(d.diffCents)) })}</strong>
              </div>
            ))}
          </div>
          <p className={css.para}>{fill(m.compareNote, { next: p.nextLower })}</p>
        </section>
      ) : null}

      {step === 2 ? (
        <section className={css.section} aria-labelledby="paso">
          <h2 id="paso" className={css.h2}>{fill(m.adjustTitle, { next: p.nextLower })}</h2>
          {p.adjust.lines.length === 0 ? (
            <Empty icon="plan" title={fill(m.adjustEmpty, { next: p.nextLower })} text={m.adjustEmptyText}><Link href={p.links.nextPlan} className="btn btn-secondary btn-sm">{fill(m.seeNext, { next: p.nextLower }).replace(" ›", "")}</Link></Empty>
          ) : (
            <>
              <div className={css.netBar} data-neg={adj.net < 0} aria-live="polite">
                <span>{fill(m.adjustBar, { in: money(p.adjust.income), out: money(adj.out) })}</span>
                <strong className="num">{formatMoney(adj.net, fmt)}</strong>
              </div>
              {adj.net < 0 ? <span className={css.warn}>{fill(m.adjustNeg, { next: p.nextLower })}</span> : null}
              <div className={css.fields}>
                {adjRows.map((r) => (
                  <div key={r.lineId} className={css.field}>
                    <label htmlFor={`adj-${r.lineId}`}>{r.name}</label>
                    <input id={`adj-${r.lineId}`} className="num" type="text" inputMode="decimal" value={r.raw} readOnly={!p.canEdit}
                      onChange={(e) => setAdjust((a) => ({ ...a, [r.lineId]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <Link href={p.links.nextPlan} className="small" style={{ fontWeight: 600 }}>{fill(m.seeNext, { next: p.nextLower })}</Link>
            </>
          )}
        </section>
      ) : null}

      {step === 3 ? (
        <section className={css.section} aria-labelledby="paso">
          <h2 id="paso" className={css.h2}>{m.balTitle}</h2>
          <p className={css.lead}>{m.balText}</p>
          {p.balances.length === 0 && p.investments.length === 0 ? (
            <Empty icon="wallet" title={m.balEmpty} text={m.balEmptyText}><Link href={p.links.cuentas} className="btn btn-secondary btn-sm">{m.balEmptyCta}</Link></Empty>
          ) : (
            <>
              <div className={css.fields}>
                {p.balances.map((b) => {
                  const raw = bal[b.id] ?? "";
                  const typed = raw.trim() ? parseMoney(raw) : null;
                  const g = typed !== null && b.reconcile ? balanceGap(cardSigned(b.kind, typed), b.expectedCents) : null;
                  return (
                    <div key={b.id} className={css.field}>
                      <label htmlFor={`bal-${b.id}`}>{b.name}{b.card ? m.cardSuffix : ""}</label>
                      <input id={`bal-${b.id}`} className="num" type="text" inputMode="decimal" placeholder={money(0)} value={raw} readOnly={!p.canEdit}
                        aria-describedby={`bal-n-${b.id}`} onChange={(e) => setBal((x) => ({ ...x, [b.id]: e.target.value }))} />
                      <span id={`bal-n-${b.id}`} className={css.fieldNote}>{fill(m.lastBal, { amount: money(b.shownCents), date: b.dateLabel })}</span>
                      {g ? <span className={css.gap} data-ok={g.state === "ok"} role="status">{g.state === "ok" ? m.gapOk : fill(g.state === "missing" ? m.gapMissing : m.gapExtra, { amount: money(g.cents) })}</span> : null}
                    </div>
                  );
                })}
                {p.investments.map((i) => (
                  <div key={i.id} className={css.field}>
                    <label htmlFor={`inv-${i.id}`}>{fill(i.byUnits ? m.invPriceLabel : m.invLabel, { name: i.name })}</label>
                    <input id={`inv-${i.id}`} className="num" type="text" inputMode="decimal" placeholder={money(0)} value={inv[i.id] ?? ""} readOnly={!p.canEdit}
                      aria-describedby={`inv-n-${i.id}`} onChange={(e) => setInv((x) => ({ ...x, [i.id]: e.target.value }))} />
                    <span id={`inv-n-${i.id}`} className={css.fieldNote}>{i.note}</span>
                  </div>
                ))}
              </div>
              <p className={css.para}>{m.balHint}</p>
            </>
          )}
        </section>
      ) : null}

      {error ? <p className={css.error} role="alert">{error}</p> : null}
      <div className={css.nav}>
        {step > 0 ? <button type="button" className={css.backBtn} onClick={() => { setError(null); setStep((s) => Math.max(0, s - 1)); }}>{m.back}</button> : null}
        {step < 3 || p.canEdit ? (
          <button type="button" className={css.nextBtn} onClick={goNext} disabled={!!busy}>{busy === "next" || busy === "close" ? m.saving : step === 3 ? m.finish : m.next}</button>
        ) : null}
      </div>

      {listBlock}
    </div>
  );
}
