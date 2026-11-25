import type { Metadata } from "next";
import Link from "next/link";
import { fill } from "@/i18n";
import { Bar, Empty, ListLink, Money, PageHeader } from "@/components/ui/basics";
import { Icon } from "@/components/ui/Icon";
import { addDays, diffDays, formatDate, formatMoney, goalPlan, monthName, streak, weekStart, weekdayName, yearTotals } from "@/lib/engine";
import { closureTarget } from "@/server/closure";
import { loadAccounts, loadMonthView, loadPlan, must } from "@/server/data";
import { requireUser } from "@/server/session";
import { loadHabit } from "../repaso/data";
import { HabitToday } from "./HabitToday";
import { M } from "./messages";
import { YearChart } from "./YearChart";

export const metadata: Metadata = { title: "Inicio" };

export default async function InicioPage() {
  const s = await requireUser();
  const m = M[s.locale];
  const [plan, view, accounts, target, goalsRes, reviewRes, companyRes, weeksRes] = await Promise.all([
    loadPlan(s, s.year), loadMonthView(s, s.year, s.month), loadAccounts(s), closureTarget(s),
    s.supabase.from("goals").select("id, name, target_cents, target_date, goal_entries(amount_cents)").is("archived_at", null).is("completed_at", null).order("created_at").limit(3),
    s.supabase.from("transactions").select("id", { count: "exact", head: true }).eq("status", "review").is("deleted_at", null),
    s.supabase.from("company_entries").select("amount_cents").eq("kind", "retiro").eq("class", "sin_clasificar"),
    s.supabase.from("activity_weeks").select("week_start, wildcard").gte("week_start", addDays(s.today, -70)),
  ]);
  const goals = must(goalsRes), company = must(companyRes), weeks = must(weeksRes);
  const month = monthName(s.month, s.locale).toLowerCase();
  const next = monthName((s.month % 12) + 1, s.locale).toLowerCase();
  const net = view.plan.net;
  const paidShare = view.plan.expense > 0 ? view.paidCents / view.plan.expense : 0;
  const review = reviewRes.count ?? 0;
  const unclassified = company.reduce((a, r) => a + r.amount_cents, 0);
  const business = accounts.find((a) => a.kind === "business");
  const stale = accounts.length > 0 && accounts.every((a) => diffDays(s.today, a.balanceDate) > 35);
  const st = streak(weeks.map((w) => ({ weekStart: w.week_start, wildcard: w.wildcard })), weekStart(s.today));
  const cat = new Map(plan.categories.map((c) => [c.id, c]));
  const year = yearTotals(plan.lines, plan.cells);
  const hasPlan = plan.lines.length > 0;
  const habit = hasPlan ? await loadHabit(s) : null;

  const todo: React.ReactNode[] = [];
  if (review > 0 && s.config.menu.movimientos === "on") todo.push(<ListLink key="rev" href="/movimientos?ver=revisar" icon="mov" iconColor="var(--naranja)" title={review === 1 ? m.reviewOne : fill(m.review, { n: review })} text={m.reviewSub} />);
  if (unclassified > 0 && s.config.menu.deudas === "on") todo.push(<ListLink key="co" href="/deudas#empresa" icon="receipt" iconColor="var(--azul-oscuro)" title={fill(m.company, { amount: formatMoney(unclassified, s.fmt), name: business?.name ?? "" })} text={m.companySub} />);
  if (target) todo.push(<ListLink key="cl" href="/cierre" icon="check" title={fill(m.closure, { month: monthName(target.month, s.locale).toLowerCase() })} text={fill(m.closureSub, { next: monthName((target.month % 12) + 1, s.locale).toLowerCase() })} />);
  if (stale && s.config.menu.cuentas === "on") todo.push(<ListLink key="bal" href="/cuentas" icon="wallet" title={m.balances} text={m.balancesSub} />);
  if (st.missedWeek && st.wildcardAvailable && s.config.gamification) todo.push(<ListLink key="wc" href="/perfil#racha" icon="flame" iconColor="var(--amarillo-oscuro)" title={m.wildcard} text={m.wildcardSub} />);

  return (
    <main className="page">
      <PageHeader title={m.title} eyebrow={<>{fill(m.hello, { name: s.profile.name || "" })}<span className="only-desktop"> · {weekdayName(s.today, s.locale)} {formatDate(s.today, s.locale, "day")}</span></>}>
        {target && s.canEdit ? (
          <Link href="/cierre" className="btn"><span className="only-desktop">{fill(m.closeCta, { month: monthName(target.month, s.locale).toLowerCase() })}</span><span className="only-mobile">{m.closeCtaShort}</span></Link>
        ) : null}
      </PageHeader>

      {hasPlan ? (
        <section aria-label={m.yourMonth} className="dark-block" style={{ display: "flex", flexWrap: "wrap", gap: 32, justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: "1 1 340px" }}>
            <span style={{ fontSize: 14, color: "var(--oscuro-texto)" }}>
              <span className="only-desktop">{fill(net < 0 ? m.heroMissing : m.heroPlan, { month })}</span><span className="only-mobile">{fill(net < 0 ? m.heroMissingShort : m.heroShort, { month })}</span>
            </span>
            <span className="num big" style={{ fontSize: "clamp(44px, 6vw, 56px)" }}>{formatMoney(Math.abs(net), s.fmt)}</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 24px", fontSize: 14, color: "var(--oscuro-texto-2)", marginTop: 6 }}>
              <span>{m.in} <Money cents={view.plan.income} fmt={s.fmt} style={{ color: "var(--blanco)", fontWeight: 600 }} /></span>
              <span>{m.out} <Money cents={view.plan.expense} fmt={s.fmt} style={{ color: "var(--blanco)", fontWeight: 600 }} /></span>
              <span>{m.paid} <Money cents={view.paidCents} fmt={s.fmt} style={{ color: "var(--blanco)", fontWeight: 600 }} /></span>
            </div>
            <div style={{ maxWidth: 460, marginTop: 6 }}><Bar value={paidShare} tone="yellow" dark label={m.paid} /></div>
          </div>
          <div className="dark-inner" style={{ flex: "1 1 280px", maxWidth: 360, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 13, color: "var(--oscuro-texto)" }}>{m.toPay}</span>
              <Money cents={view.missingCents} fmt={s.fmt} style={{ fontSize: 22, fontWeight: 600 }} />
            </div>
            {view.pending.length === 0 ? <span style={{ fontSize: 13, color: "var(--oscuro-texto-3)" }}>{m.allPaid}</span> : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {view.pending.slice(0, 4).map((p) => (
                  <li key={p.line.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 14, padding: "8px 0", borderTop: "1px solid var(--oscuro-linea)" }}>
                    <span>{p.line.name}<span style={{ display: "block", fontSize: 11, color: "var(--oscuro-texto-3)" }}>{cat.get(p.line.categoryId)?.name}</span></span>
                    <Money cents={p.missingCents} fmt={s.fmt} style={{ fontWeight: 600 }} />
                  </li>
                ))}
                {view.pending.length > 4 ? <li style={{ fontSize: 12, color: "var(--oscuro-texto-3)", paddingTop: 6 }}><Link href={`/plan/mes/${s.month}`} style={{ color: "inherit" }}>{fill(m.more, { n: view.pending.length - 4 })}</Link></li> : null}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      {habit ? <HabitToday s={s} a={habit.allowance} t={m.habit} /> : null}

      <div className="grid-auto">
        <section aria-labelledby="hoy" className="stack">
          <h2 id="hoy">{m.today}</h2>
          {todo.length ? <div className="list">{todo}</div> : <div className="list"><div><span className="icon-box"><Icon name="tick" size={19} color="var(--verde)" /></span><span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}><strong style={{ fontSize: 15 }}>{m.nothing}</strong><span className="xs muted">{m.nothingSub}</span></span></div></div>}
        </section>
        {s.config.menu.metas === "on" ? (
          <section aria-labelledby="metas" className="stack">
            <div className="row-between"><h2 id="metas">{m.goals}</h2><Link href="/metas?nueva=1" className="link">{m.newGoal}</Link></div>
            {goals.length === 0 ? <Empty icon="target" title={m.noGoals} text={m.noGoalsSub}><Link href="/metas?nueva=1" className="btn btn-secondary btn-sm">{m.createGoal}</Link></Empty> : goals.map((g) => {
              const gp = goalPlan(g.target_cents, g.goal_entries.map((e) => e.amount_cents), g.target_date, s.today);
              return (
                <Link key={g.id} href="/metas" className="card card-tight" style={{ display: "flex", flexDirection: "column", gap: 12, textDecoration: "none" }}>
                  <div className="row-between"><strong style={{ fontSize: 15 }}>{g.name}</strong><span className="xs muted">{g.target_date ? formatDate(g.target_date, s.locale) : m.noDate}</span></div>
                  <Bar value={gp.progress} tone="var(--amarillo-oscuro)" label={g.name} />
                  <div className="row-between small muted"><span>{m.saved} <Money cents={gp.savedCents} fmt={s.fmt} style={{ color: "var(--tinta)", fontWeight: 600 }} /></span><span>{fill(m.ofTarget, { target: formatMoney(g.target_cents, s.fmt) })}</span></div>
                </Link>
              );
            })}
          </section>
        ) : null}
      </div>

      {hasPlan ? (
        <section aria-labelledby="anio" className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="row-between wrap"><h2 id="anio">{m.year}</h2><Link href="/plan" className="link">{m.openPlan}</Link></div>
          <YearChart months={year.map((y) => ({ income: y.income, expense: y.expense }))} current={s.month} fmt={s.fmt} locale={s.locale} t={m} />
        </section>
      ) : null}

      <Link href="/diagnostico" className="card" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 18, padding: "22px 26px" }}>
        <span aria-hidden="true" style={{ width: 48, height: 48, borderRadius: 12, background: "var(--amarillo-pastel)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon name="spark" size={24} /></span>
        <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}><strong style={{ fontSize: 16 }}>{m.diag}</strong><span className="small muted">{m.diagSub}</span></span>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{m.see}</span>
      </Link>
    </main>
  );
}
