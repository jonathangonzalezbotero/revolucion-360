import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fill } from "@/i18n";
import { Empty, Money, Pill, type PillTone } from "@/components/ui/basics";
import { Icon } from "@/components/ui/Icon";
import { formatDate, formatMoney, monthName, type LineStatus } from "@/lib/engine";
import { loadMonthView, type MonthLine } from "@/server/data";
import { requireUser } from "@/server/session";
import { adjacentMonth, clampYear, monthHref, planHref, sharePct } from "../../lib";
import { M } from "../../messages";
import css from "../../plan.module.css";
import { Soon } from "../../Soon";
import { MarkButton, type MarkText } from "./MarkButton";

export const metadata: Metadata = { title: "Detalle del mes" };

const TONE: Record<LineStatus, PillTone> = { paid: "ok", paid_manual: "yellow", partial: "warn", over: "bad", pending: "neutral", none: "neutral" };
const ICON: Record<LineStatus, string> = { paid: css.ok, paid_manual: css.hand, partial: css.warn, over: css.warn, pending: "", none: "" };
const UNPLANNED_MAX = 8;

export default async function MesPage({ params, searchParams }: { params: Promise<{ mes: string }>; searchParams: Promise<{ anio?: string | string[] }> }) {
  const s = await requireUser();
  const m = M[s.locale], t = m.mes;
  if (s.config.menu.plan !== "on") return <Soon title={s.t.nav.plan} t={m.soon} />;
  const month = Number((await params).mes);
  if (!Number.isInteger(month) || month < 1 || month > 12) notFound();
  const year = clampYear((await searchParams).anio, s.year);
  const view = await loadMonthView(s, year, month);

  const name = monthName(month, s.locale);
  const title = fill(t.title, { month: name, year });
  const prev = adjacentMonth(year, month, -1, s.year), next = adjacentMonth(year, month, 1, s.year);
  const plan = planHref(year, s.year);
  const txHref = (lineId: string) => `/movimientos?linea=${lineId}&mes=${month}${year === s.year ? "" : `&anio=${year}`}`;
  const allTx = `/movimientos?mes=${month}${year === s.year ? "" : `&anio=${year}`}`;
  const money = (c: number) => formatMoney(c, s.fmt);
  const paidShare = view.plan.expense > 0 ? Math.min(1, view.paidCents / view.plan.expense) : 0;
  const net = view.plan.net;
  const groups = view.groups.map((g) => ({ ...g, lines: g.lines.filter((l) => l.status !== "none") })).filter((g) => g.lines.length > 0);
  const unplannedTotal = view.unplanned.reduce((a, x) => a + x.amountCents, 0);
  const markText: MarkText = { pending: s.t.status.pending, paidManual: s.t.status.paidManual, mark: t.mark, undo: t.undo, hintMark: t.hintMark, hintUndo: t.hintUndo, actAria: t.actAria, marked: t.marked, unmarked: t.unmarked };

  const arrow = (to: { year: number; month: number } | null, label: string, glyph: string) => to
    ? <Link href={monthHref(to.year, to.month, s.year)} className={css.navBtn} aria-label={label}><span aria-hidden="true">{glyph}</span></Link>
    : <span className={css.navBtn} aria-disabled="true" aria-label={label} role="link"><span aria-hidden="true">{glyph}</span></span>;

  /** Texto del estado. Un ingreso sin movimiento se lee "Sin movimiento aún", no "Pendiente". */
  const label = (l: MonthLine): string => {
    if (l.status === "paid") return s.t.status.paid;
    if (l.status === "paid_manual") return s.t.status.paidManual;
    if (l.status === "partial") return s.t.status.partial;
    if (l.status === "over") return s.t.status.over;
    return l.line.kind === "income" ? t.noTx : s.t.status.pending;
  };
  const detail = (l: MonthLine): string | null =>
    l.status === "partial" ? fill(t.missingAmt, { amount: money(l.missingCents) }) : l.status === "over" ? fill(t.overAmt, { amount: money(l.realCents - l.plannedCents) }) : null;
  const tappable = (l: MonthLine) => s.canEdit && (l.status === "pending" || l.status === "paid_manual");
  const byTx = (l: MonthLine) => l.status === "paid" || l.status === "partial" || l.status === "over";
  const real = (l: MonthLine) => (l.status === "pending" ? "—" : money(l.realCents));
  const progress = (l: MonthLine) => (l.plannedCents > 0 ? Math.min(1, l.realCents / l.plannedCents) : l.realCents > 0 ? 1 : 0);

  return (
    <main className="page">
      <header className="page-header only-desktop">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Link href={plan} className={css.back}>{t.back}</Link>
          <h1>{title}</h1>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {arrow(prev, t.prev, "‹")}{arrow(next, t.next, "›")}
          <Link href={plan} className="btn" style={{ marginLeft: 6 }}>{t.adjust}</Link>
        </div>
      </header>
      <header className="only-mobile">
        <div className={css.mesHeadMobile}>
          <Link href={plan} className={css.back} style={{ padding: "6px 0", alignSelf: "flex-start" }}>{t.backShort}</Link>
          <div>
            {arrow(prev, t.prev, "‹")}
            <div><span className="xs muted">{t.vsReal}</span><h1>{title}</h1></div>
            {arrow(next, t.next, "›")}
          </div>
        </div>
      </header>

      {groups.length === 0 && view.unplanned.length === 0 ? (
        <Empty icon="plan" title={fill(t.emptyTitle, { month: name.toLowerCase() })} text={t.emptyText}><Link href={plan} className="btn btn-secondary btn-sm">{t.emptyCta}</Link></Empty>
      ) : (
        <section aria-label={t.progress} className={css.progress}>
          <div className={css.progressTop}>
            <div>
              <span><span className="only-desktop">{fill(t.paidOf, { amount: money(view.plan.expense) })}</span><span className="only-mobile">{fill(t.paidOfShort, { amount: money(view.plan.expense) })}</span></span>
              <span className={`num big ${css.progressBig}`}>{money(view.paidCents)}</span>
            </div>
            <div className={css.stats}>
              <div><span><span className="only-desktop">{t.income}</span><span className="only-mobile">{t.incomeShort}</span></span><span className="num">{money(view.plan.income)}</span></div>
              <div><span>{t.pending}</span><span className="num">{money(view.missingCents)}</span></div>
              <div><span>{net < 0 ? t.missing : t.left}</span><span className="num">{money(Math.abs(net))}</span></div>
            </div>
          </div>
          <div className={css.progressBar} role="progressbar" aria-label={t.progress} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(paidShare * 100)}><span style={{ width: `${paidShare * 100}%` }} /></div>
        </section>
      )}

      {groups.map((g) => {
        const share = g.category.kind === "income" ? null : sharePct(g.plannedCents, view.plan.income);
        return (
          <section key={g.category.id} className={css.mesGroup} aria-labelledby={`g-${g.category.id}`}>
            <div className={css.mesGroupHead}>
              <h2 id={`g-${g.category.id}`}><span aria-hidden="true" className={css.soft}><span className={css.dot} style={{ background: g.category.color }} /></span>{g.category.name}</h2>
              <span className="num"><strong>{money(g.plannedCents)}</strong>{share ? <span className="only-desktop"> · {fill(t.share, { pct: share })}</span> : null}</span>
            </div>

            <div className="only-desktop">
              <div className="table-scroll">
                <table className={css.mesTable}>
                  <thead><tr><th scope="col">{t.cols.concept}</th><th scope="col">{t.cols.planned}</th><th scope="col">{t.cols.real}</th><th scope="col">{t.cols.progress}</th><th scope="col">{t.cols.status}</th></tr></thead>
                  <tbody>
                    {g.lines.map((l) => (
                      <tr key={l.line.id}>
                        <td>{l.line.name}</td>
                        <td className="num">{money(l.plannedCents)}</td>
                        <td className="num" style={{ fontWeight: 600 }}>{real(l)}{detail(l) ? <span className={css.sub}>{detail(l)}</span> : null}</td>
                        <td><div aria-hidden="true" className={css.track}><span style={{ width: `${progress(l) * 100}%`, background: g.category.color }} /></div></td>
                        <td>
                          {tappable(l)
                            ? <MarkButton key={`${l.line.id}-${l.status}`} lineId={l.line.id} month={month} name={l.line.name} paid={l.status === "paid_manual"} variant="pill" t={{ ...markText, pending: label({ ...l, status: "pending" }) }} />
                            : byTx(l)
                              ? <Link href={txHref(l.line.id)} className={css.statusLink} title={t.hintTx}><Pill tone={TONE[l.status]}>{label(l)} ›</Pill></Link>
                              : <Pill tone={TONE[l.status]}>{label(l)}</Pill>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="only-mobile">
              <ul className={css.mesList}>
                {g.lines.map((l) => (
                  <li key={l.line.id}>
                    <span aria-hidden="true" className={`${css.ico} ${ICON[l.status]}`}>{l.status === "pending" ? "·" : <Icon name="tick" size={13} />}</span>
                    <span>{l.line.name}<span className={css.sub}>{label(l)}{detail(l) ? ` · ${detail(l)}` : ""}</span></span>
                    <span className={`num ${css.amt}`}>{money(l.plannedCents)}</span>
                    {tappable(l)
                      ? <MarkButton key={`${l.line.id}-${l.status}`} lineId={l.line.id} month={month} name={l.line.name} paid={l.status === "paid_manual"} variant="action" t={markText} />
                      : byTx(l) ? <Link href={txHref(l.line.id)} className={css.navBtn} aria-label={`${t.seeTx}: ${l.line.name}`} title={t.hintTx}><Icon name="chevron" size={16} /></Link> : null}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        );
      })}

      {view.unplanned.length > 0 ? (
        <section className={css.mesGroup} aria-labelledby="sin-linea">
          <div className={css.mesGroupHead}>
            <h2 id="sin-linea">{t.unplanned}</h2>
            <span className="num"><strong>{formatMoney(unplannedTotal, s.fmt, { sign: true })}</strong></span>
          </div>
          <p className="small muted">{t.unplannedSub}</p>
          <ul className={`${css.mesList} ${css.unplanned}`} style={{ marginTop: 8 }}>
            {view.unplanned.slice(0, UNPLANNED_MAX).map((x) => (
              <li key={x.id}>
                <span className="xs muted num" style={{ flex: "none", width: 52 }}>{formatDate(x.date, s.locale, "short")}</span>
                <span>{x.description || x.rawDescription}</span>
                <Money cents={x.amountCents} fmt={s.fmt} sign className={x.amountCents > 0 ? "pos" : undefined} style={{ fontWeight: 600 }} />
              </li>
            ))}
          </ul>
          <div className="row-between wrap" style={{ padding: "10px 0 6px" }}>
            <span className="xs muted">{view.unplanned.length > UNPLANNED_MAX ? fill(t.more, { n: view.unplanned.length - UNPLANNED_MAX }) : ""}</span>
            <Link href={allTx} className="link">{t.unplannedCta} ›</Link>
          </div>
        </section>
      ) : null}

      {groups.length > 0 ? <p className="xs muted">{t.note}</p> : null}
    </main>
  );
}
