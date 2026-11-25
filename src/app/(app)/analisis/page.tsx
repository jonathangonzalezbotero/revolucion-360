import type { Metadata } from "next";
import Link from "next/link";
import { fill } from "@/i18n";
import { Empty, PageHeader } from "@/components/ui/basics";
import { formatMoney, monthName, monthShort } from "@/lib/engine";
import { counts, loadPlan, loadTx, must } from "@/server/data";
import { requireUser } from "@/server/session";
import { Filters } from "./Filters";
import {
  analisisHref, bestMonth, biggestVariation, incomeSources, inMonth, MAX_WATCHED, merchantRanking, monthTotals, planByCategory, share, spendByCategory, totals, watchedStats, type TxA,
} from "./lib";
import { M } from "./messages";
import { Watched } from "./Watched";
import css from "./analisis.module.css";
import { ILLU } from "@/lib/images";

export const metadata: Metadata = { title: "Análisis" };
type Search = Promise<{ anio?: string; mes?: string }>;

const pctText = (v: number, numberLocale: string, digits = 1) => `${(v * 100).toLocaleString(numberLocale, { maximumFractionDigits: digits })}%`;

export default async function AnalisisPage({ searchParams }: { searchParams: Search }) {
  const s = await requireUser();
  const m = M[s.locale];
  const q = await searchParams;
  if (s.config.menu.analisis !== "on") {
    return (
      <main className="page">
        <PageHeader title={m.title} />
        <Empty icon="pie" title={m.soonTitle} text={m.soonText}><Link href="/inicio" className="btn btn-secondary btn-sm">{m.goHome}</Link></Empty>
      </main>
    );
  }

  // Años con movimientos (del primero al actual), nunca fijos en el código.
  const first = must(await s.supabase.from("transactions").select("date").is("deleted_at", null).order("date").limit(1));
  const minYear = Math.max(s.year - 9, first.length ? Number(first[0].date.slice(0, 4)) : s.year);
  const years = Array.from({ length: s.year - Math.min(minYear, s.year) + 1 }, (_, i) => Math.min(minYear, s.year) + i);
  const askedYear = Number(q.anio);
  const year = years.includes(askedYear) ? askedYear : s.year;
  const askedMonth = Number(q.mes);
  const month = Number.isInteger(askedMonth) && askedMonth >= 1 && askedMonth <= 12 ? askedMonth : null;

  const all = (await loadTx(s, `${year}-01-01`, `${year}-12-31`)).filter(counts);
  const txs: TxA[] = all.map((t) => ({ date: t.date, amountCents: t.amountCents, description: t.description, rawDescription: t.rawDescription, categoryId: t.categoryId, planLineId: t.planLineId }));
  const period = inMonth(txs, month);
  const periodName = month ? `${monthName(month, s.locale).toLowerCase()} ${year}` : String(year);
  const eyebrow = month ? fill(m.eyebrowMonth, { month: monthName(month, s.locale).toLowerCase(), year }) : fill(m.eyebrowYear, { year });

  const header = (
    <PageHeader title={m.title} eyebrow={eyebrow}>
      <Link href="/mas" className="only-mobile" style={{ fontSize: 14, fontWeight: 600, padding: "10px 0", textDecoration: "none", color: "var(--tinta)" }}>{m.back}</Link>
      <Filters years={years} year={year} month={month} current={s.year} locale={s.locale} m={m} />
    </PageHeader>
  );

  if (txs.length === 0) {
    return (
      <main className="page">
        {header}
        <Empty icon="mov" image={ILLU.vacioAnalisis} title={fill(m.emptyTitle, { year })} text={m.emptyText}><Link href="/movimientos" className="btn btn-secondary btn-sm">{m.emptyCta}</Link></Empty>
        <p className="xs muted">{s.t.disclaimer}</p>
      </main>
    );
  }

  const comercios = s.config.flags.comercios;
  const [plan, watchedRows] = await Promise.all([
    loadPlan(s, year),
    comercios ? s.supabase.from("watched_merchants").select("id, name, pattern, limit_cents").order("created_at") : Promise.resolve({ data: [], error: null }),
  ]);
  const watched = must(watchedRows) as { id: string; name: string; pattern: string; limit_cents: number | null }[];
  const cat = new Map(plan.categories.map((c) => [c.id, c]));
  const catName = new Map(plan.categories.map((c) => [c.id, c.name]));
  const lineName = new Map(plan.lines.map((l) => [l.id, l.name]));

  const tot = totals(period);
  const months = monthTotals(txs);
  const best = month ? null : bestMonth(months);
  const spend = spendByCategory(period);
  const savingCats = plan.categories.filter((c) => c.kind === "saving" || c.kind === "goal");
  const savedCents = spend.filter((x) => x.categoryId && savingCats.some((c) => c.id === x.categoryId)).reduce((a, x) => a + x.cents, 0);
  const savedShare = share(savedCents, tot.income);
  const planCat = planByCategory(plan.lines, plan.cells, month);
  const sources = incomeSources(period, lineName, catName);
  const topShare = sources.length ? share(sources[0].cents, tot.income) : 0;
  const ranking = comercios ? merchantRanking(period) : [];
  const statMonth = month ?? (year === s.year ? s.month : 12);
  const monthLabel = year === s.year && statMonth === s.month ? m.thisMonth : monthName(statMonth, s.locale);
  const variation = month ? [] : biggestVariation(txs, year === s.year ? s.month : 12);

  // A dónde fue cada dólar: sobre lo que entró (con "te sobró") o, si salió más de lo que entró, sobre lo que salió.
  const denom = Math.max(tot.income, tot.expense, 1);
  const split = [
    ...spend.map((x) => ({ key: x.categoryId ?? "none", name: x.categoryId ? catName.get(x.categoryId) ?? m.noCategory : m.noCategory, color: (x.categoryId && cat.get(x.categoryId)?.color) || "var(--gris-5)", cents: x.cents, plan: x.categoryId ? planCat.get(x.categoryId) ?? 0 : 0, isCat: !!x.categoryId })),
    ...(tot.net > 0 ? [{ key: "left", name: m.leftOver, color: "var(--linea)", cents: tot.net, plan: 0, isCat: false }] : []),
  ];
  const maxMonth = Math.max(...months.flatMap((x) => [x.income, x.expense]), 1);
  const ring = (
    <div role="img" aria-label={fill(m.savingAria, { pct: pctText(savedShare, s.fmt.numberLocale) })} className={css.ring} style={{ background: `conic-gradient(var(--teal) 0 ${(savedShare * 100).toFixed(2)}%, var(--linea) ${(savedShare * 100).toFixed(2)}% 100%)` }}>
      <div className="num">{pctText(savedShare, s.fmt.numberLocale)}<span className={css.ringSub}>{m.savingShort}</span></div>
    </div>
  );

  return (
    <main className="page">
      {header}

      <section aria-label={month ? m.numbersMonth : m.numbers} className={css.hero}>
        <div className="only-desktop" style={{ flex: "1 1 500px" }}>
          <div className={css.heroGrid}>
            <div><span className={css.k}>{m.in}</span><span className={`num big ${css.heroVal}`}>{formatMoney(tot.income, s.fmt)}</span></div>
            <div><span className={css.k}>{m.out}</span><span className={`num big ${css.heroVal}`}>{formatMoney(tot.expense, s.fmt)}</span><span className={css.note}>{m.outSub}</span></div>
            <div>
              <span className={css.k}>{tot.net < 0 ? m.missing : m.left}</span>
              <span className={`num big ${css.heroVal}`} style={{ color: tot.net < 0 ? "var(--rojo)" : undefined }}>{formatMoney(Math.abs(tot.net), s.fmt)}</span>
              {best && tot.net > 0 ? <span className={css.note}>{fill(m.bestMonth, { amount: formatMoney(months[best - 1].net, s.fmt), month: monthName(best, s.locale).toLowerCase() })}</span> : null}
            </div>
          </div>
        </div>
        <div className={`only-desktop ${css.ringBox}`}>
          {ring}
          <div className={css.ringText}>
            <span className={css.k}>{m.saving}</span>
            <span className="num" style={{ fontSize: 20, fontWeight: 600 }}>{formatMoney(savedCents, s.fmt)}</span>
            <span className={css.note}>{savingCats.length && savedCents > 0 ? savingCats.filter((c) => spend.some((x) => x.categoryId === c.id)).map((c) => c.name).join(" + ") : m.savingNone}</span>
          </div>
        </div>
        <div className={`only-mobile-flex ${css.mHero}`}>
          <div className={css.mTop}>
            <div>
              <span className={css.k}>{fill(tot.net < 0 ? m.missingIn : m.leftIn, { period: periodName })}</span>
              <span className="num big" style={{ fontSize: 32, color: tot.net < 0 ? "var(--rojo)" : undefined }}>{formatMoney(Math.abs(tot.net), s.fmt)}</span>
            </div>
            {ring}
          </div>
          <div className={css.mGrid}>
            <div><span className="xs muted">{m.in}</span><span className="num" style={{ fontSize: 18, fontWeight: 600 }}>{formatMoney(tot.income, s.fmt)}</span></div>
            <div><span className="xs muted">{m.out}</span><span className="num" style={{ fontSize: 18, fontWeight: 600 }}>{formatMoney(tot.expense, s.fmt)}</span></div>
          </div>
        </div>
      </section>

      <section aria-labelledby="mm" className={css.card}>
        <div className="row-between wrap">
          <h2 id="mm" className={css.h2}>{m.monthly}</h2>
          {month ? <Link href={analisisHref(year, null, s.year)} className="link">{m.seeYear}</Link> : null}
        </div>
        <div style={{ overflowX: "auto" }}>
          <div className={css.months}>
            {months.map((x, i) => (
              <Link key={i} href={analisisHref(year, month === i + 1 ? null : i + 1, s.year)} className={css.monthCol} aria-current={month === i + 1 ? "true" : undefined}
                aria-label={fill(m.monthAria, { month: monthName(i + 1, s.locale), in: formatMoney(x.income, s.fmt), out: formatMoney(x.expense, s.fmt) })}>
                <span aria-hidden="true" className={css.barsBox}>
                  <span className={css.barIn} style={{ height: `${(x.income / maxMonth) * 100}%` }} />
                  <span className={css.barOut} style={{ height: `${(x.expense / maxMonth) * 100}%` }} />
                </span>
                <span aria-hidden="true" className={css.monthLbl}><span className="only-desktop">{monthShort(i + 1, s.locale)}</span><span className="only-mobile">{monthShort(i + 1, s.locale).charAt(0)}</span></span>
                <span aria-hidden="true" className={`num ${css.netPill}`} style={{ background: x.net < 0 ? "var(--rojo-fondo)" : "var(--amarillo-suave)", color: x.net < 0 ? "var(--ambar-texto)" : "var(--verde-fuerte)" }}>{formatMoney(x.net, s.fmt)}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className={css.legend}>
          <span><span aria-hidden="true" className={css.sq} style={{ background: "var(--tinta)" }} />{m.in}</span>
          <span><span aria-hidden="true" className={css.sq} style={{ background: "var(--exito-borde)" }} />{m.out}</span>
        </div>
      </section>

      <div className={css.two}>
        <section aria-labelledby="where" className={css.card}>
          <h2 id="where" className={css.h2}>{m.where}</h2>
          {split.length === 0 ? <p className="small muted" style={{ margin: 0 }}>{m.noSpend}</p> : null}
          {split.length ? <div aria-hidden="true" className={css.split}>{split.map((x) => <div key={x.key} style={{ background: x.color, width: `${((x.cents / denom) * 100).toFixed(2)}%` }} />)}</div> : null}
          <ul className={css.rows}>
            {split.map((x) => (
              <li key={x.key}>
                <span aria-hidden="true" className={css.sq} style={{ background: x.color }} />
                <span className={css.rowName}>
                  <span>{x.name}</span>
                  {x.isCat ? (
                    <span className="xs" style={{ color: x.plan > 0 && x.cents > x.plan ? "var(--rojo)" : "var(--gris)" }}>
                      {x.plan > 0 ? (x.cents > x.plan ? fill(m.overPlan, { amount: formatMoney(x.cents - x.plan, s.fmt) }) : fill(m.plan, { amount: formatMoney(x.plan, s.fmt) })) : m.noPlanCat}
                    </span>
                  ) : null}
                </span>
                <span className={`num ${css.rowPct}`}>{pctText(x.cents / denom, s.fmt.numberLocale)}</span>
                <span className={`num ${css.rowAmt}`}>{formatMoney(x.cents, s.fmt)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="src" className={css.card}>
          <h2 id="src" className={css.h2}>{m.sources}</h2>
          {sources.length === 0 ? <p className="small muted" style={{ margin: 0 }}>{m.noIncome}</p> : (
            <ul className={css.srcRows}>
              {sources.slice(0, 6).map((x) => (
                <li key={x.key}>
                  <div className="row-between" style={{ fontSize: 14 }}>
                    <span>{x.name ?? m.otherIncome}</span>
                    <span className="num"><span className="muted">{pctText(share(x.cents, tot.income), s.fmt.numberLocale, 0)}</span>{"  "}<strong>{formatMoney(x.cents, s.fmt)}</strong></span>
                  </div>
                  <div aria-hidden="true" className={css.track}><div style={{ width: `${(share(x.cents, tot.income) * 100).toFixed(1)}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
          {sources.length > 1 && topShare >= 0.5 ? (
            <p className={css.callout}><strong>{m.concentration}</strong> {fill(m.concentrationText, { name: sources[0].name ?? m.otherIncome, pct: pctText(topShare, s.fmt.numberLocale, 0) })}</p>
          ) : null}
        </section>
      </div>

      {comercios ? (
        <section aria-labelledby="com" className={css.card} style={{ gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <h2 id="com" className={css.h2}>{m.merchants}</h2>
            <span className="small muted">{m.merchantsSub}</span>
          </div>
          <div className={css.merchGrid}>
            <div className="stack">
              <h3 className={css.h3}>{m.top}</h3>
              {ranking.length === 0 ? <p className="small muted" style={{ margin: 0 }}>{m.noMerchants}</p> : (
                <ol className={css.rank}>
                  {ranking.map((r, i) => (
                    <li key={r.key}>
                      <span aria-hidden="true" className={`num ${css.rankN}`}>{i + 1}</span>
                      <div className={css.rankBody}>
                        <div className={css.rankTop}>
                          <span title={r.name}>{r.name}</span>
                          <span className="num" style={{ fontWeight: 600, color: "var(--gris)", whiteSpace: "nowrap" }}>{formatMoney(r.cents, s.fmt)}<span className="xs" style={{ fontWeight: 400 }}> · {r.count === 1 ? m.once : fill(m.times, { n: r.count })}</span></span>
                        </div>
                        <div aria-hidden="true" className={css.thin}><div style={{ width: `${((r.cents / ranking[0].cents) * 100).toFixed(1)}%` }} /></div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <Watched
              items={watched.map((w) => ({ id: w.id, name: w.name, pattern: w.pattern, limitCents: w.limit_cents, stats: watchedStats(txs, w.pattern, statMonth) }))}
              max={MAX_WATCHED} monthLabel={monthLabel} yearLabel={fill(m.inYear, { year })} canEdit={s.canEdit} fmt={s.fmt} m={m}
            />
          </div>
        </section>
      ) : null}

      {variation.length ? (
        <div className={css.three}>
          <section aria-labelledby="var" className={css.card} style={{ padding: 22, gap: 12 }}>
            <h2 id="var" className={css.h3} style={{ fontSize: 16 }}>{m.varied}</h2>
            {variation.map((v) => (
              <div key={v.categoryId} className={css.varRow}>
                <strong>{catName.get(v.categoryId) ?? m.noCategory}</strong>
                <span className="small muted">{fill(m.variedText, { min: formatMoney(v.minCents, s.fmt), max: formatMoney(v.maxCents, s.fmt) })}</span>
              </div>
            ))}
          </section>
        </div>
      ) : null}

      <p className="xs muted">{s.t.disclaimer}</p>
    </main>
  );
}
