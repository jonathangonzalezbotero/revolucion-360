import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { fill } from "@/i18n";
import { addDays, diffDays, formatMoney, goalPlan, isoWeekday, monthName, parts, streak, weekStart, type ISODate } from "@/lib/engine";
import { pickOneThing, readHabitPrefs, repasoWeek, upcomingPayments, wantsHabit, HABIT_KINDS, type OneThing } from "@/lib/engine/habito";
import { readPrefs } from "@/lib/email/lib";
import { closureTarget } from "@/server/closure";
import { loadAccounts, must } from "@/server/data";
import { requireUser } from "@/server/session";
import { loadCatalog } from "../academia/server";
import { loadHabit } from "./data";
import { M } from "./messages";
import { ILLU } from "@/lib/images";
import { Visit } from "./Visit";
import css from "./repaso.module.css";

export const metadata: Metadata = { title: "Repaso semanal" };

const WEEKDAY = { es: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"], en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] } as const;

export default async function RepasoPage() {
  const s = await requireUser();
  const m = M[s.locale];
  const week = repasoWeek(s.today);
  const month = monthName(s.month, s.locale).toLowerCase();

  const [habit, accounts, target, weekTxRes, reviewRes, goalsRes, weeksRes, catalog] = await Promise.all([
    loadHabit(s), loadAccounts(s), closureTarget(s),
    s.supabase.from("transactions").select("id", { count: "exact", head: true }).is("deleted_at", null).is("parent_id", null).gte("date", week.from).lte("date", week.to),
    s.supabase.from("transactions").select("id", { count: "exact", head: true }).eq("status", "review").is("deleted_at", null),
    s.supabase.from("goals").select("id, name, target_cents, target_date, goal_entries(amount_cents, date)").is("archived_at", null).order("created_at"),
    s.supabase.from("activity_weeks").select("week_start, wildcard").gte("week_start", addDays(s.today, -400)),
    s.config.menu.academia === "on" ? loadCatalog(s) : Promise.resolve(null),
  ]);
  if (weekTxRes.error) throw new Error(`db: ${weekTxRes.error.message}`);
  if (reviewRes.error) throw new Error(`db: ${reviewRes.error.message}`);
  const goals = must(goalsRes), weeks = must(weeksRes);
  const weekTx = weekTxRes.count ?? 0, review = reviewRes.count ?? 0;

  // ── Lo que apartaste esta semana para tus metas (aportes, sin contar usos) ──
  let setAside = 0, best: { name: string; week: number; pct: number } | null = null;
  for (const g of goals) {
    const inWeek = g.goal_entries.filter((e) => e.date >= week.from && e.date <= week.to && e.amount_cents > 0).reduce((a, e) => a + e.amount_cents, 0);
    setAside += inWeek;
    if (inWeek > 0 && (!best || inWeek > best.week)) {
      const gp = goalPlan(g.target_cents, g.goal_entries.map((e) => e.amount_cents), g.target_date, s.today);
      best = { name: g.name, week: inWeek, pct: Math.round(gp.progress * 100) };
    }
  }
  const st = streak(weeks.map((w) => ({ weekStart: w.week_start, wildcard: w.wildcard })), weekStart(s.today));

  // ── Día a día: por categoría, planeado frente a gastado este mes ──
  const catById = new Map(habit.plan.categories.map((c) => [c.id, c]));
  const keys = new Set<string | null>([...habit.budget.byCategory.keys(), ...habit.spent.byCategory.keys()]);
  const bars = [...keys]
    .map((k) => ({ key: k, budget: habit.budget.byCategory.get(k) ?? 0, spent: Math.max(0, habit.spent.byCategory.get(k) ?? 0) }))
    .filter((b) => b.budget > 0 || b.spent > 0)
    .sort((a, b) => b.budget - a.budget || b.spent - a.spent)
    .slice(0, 6);
  const overDayToDay = habit.allowance.state === "over";

  // ── Lo que se paga en los próximos 7 días (desde hoy) ──
  const due = upcomingPayments({ lines: habit.lines, cells: habit.plan.cells, fixed: habit.fixed, paid: habit.paid, from: s.today, to: addDays(s.today, 6) }).slice(0, 8);

  // ── Clase de la semana: la siguiente del curso que va (o del primero sin empezar), como en Academia ──
  const usable = (catalog?.courses ?? []).filter((c) => c.lessons.length > 0 && !c.course.upcoming);
  const course = usable.find((c) => c.progress.done > 0 && !c.progress.complete) ?? usable.find((c) => c.progress.done === 0) ?? null;
  const lesson = course ? course.lessons.find((l) => l.id === course.nextId) ?? null : null;
  const lessonPts = lesson ? (lesson.points || Number(s.config.points.lesson ?? 0)) : 0;

  // ── Una cosa para esta semana ──
  const stale = accounts.length > 0 && accounts.every((a) => diffDays(s.today, a.balanceDate) > 35);
  const on = (k: string) => (s.config.menu as Record<string, string>)[k] === "on";
  const thing: OneThing = pickOneThing({
    review: on("movimientos") ? review : 0, closeDue: !!target && s.canEdit, weekTx: on("movimientos") && s.canEdit ? weekTx : 1,
    staleBalances: stale && on("cuentas") && s.canEdit, overDayToDay: overDayToDay && on("analisis"), lesson: !!lesson,
  });
  const targetMonth = target ? monthName(target.month, s.locale).toLowerCase() : month;
  const nextOfTarget = monthName(((target?.month ?? s.month) % 12) + 1, s.locale).toLowerCase();
  const T = m.things[thing];
  const thingTitle = thing === "review" ? (review === 1 ? m.things.review.tOne : fill(m.things.review.t, { n: review })) : fill(T.t, { month: targetMonth });
  const thingText = fill(T.d, { month: thing === "review" ? month : targetMonth, next: nextOfTarget });
  const lessonHref = lesson && course ? `/academia/${course.course.slug}/${lesson.id}` : "/academia";
  const thingHref: Record<OneThing, string> = { review: "/movimientos?ver=revisar", close: "/cierre", record: "/movimientos", balances: "/cuentas", dayToDay: "/analisis", lesson: lessonHref, none: "/inicio" };

  // ── Avisos del hábito y si están encendidos ──
  const notify = readPrefs(s.profile.prefs), habitPrefs = readHabitPrefs(s.profile.prefs);
  const np = { payments: notify.notify.payments, close: notify.notify.close, closeDay: notify.closeDay, channel: notify.channel };

  const name = s.profile.name.trim().split(/\s+/)[0] ?? "";
  const range = rangeLabel(week.from, week.to, s.locale, m);
  const money = (c: number) => formatMoney(c, s.fmt);
  const game = s.config.gamification;

  return (
    <main className="page">
      <Visit />
      <header className="page-header">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="muted" style={{ fontSize: 14 }}><span className="only-desktop">{fill(m.eyebrow, { range })}</span><span className="only-mobile">{range}</span></span>
          <h1><span className="only-desktop">{m.title}</span><span className="only-mobile">{m.titleShort}</span></h1>
        </div>
        <Link href="/inicio" className={css.done}>{m.done}</Link>
      </header>

      <p className={css.intro}>
        <span className="only-desktop">{name ? fill(m.intro, { name }) : m.introNoName}</span>
        <span className="only-mobile">{name ? fill(m.introShort, { name }) : m.introShortNoName}</span>
      </p>

      <div className={css.stats} style={game ? undefined : { gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <div className={css.stat}>
          <Image src={ILLU.vacioMovimientos} alt="" aria-hidden="true" width={76} height={76} sizes="76px" className={css.statImg} />
          <span className={`num big ${css.statNum}`}>{weekTx}</span>
          <strong style={{ fontSize: 14 }}>{weekTx === 1 ? m.movesOne : m.moves}</strong>
          <span className="xs muted">{weekTx === 0 ? m.movesNone : review > 0 ? (review === 1 ? m.movesReviewOne : fill(m.movesReview, { n: review })) : m.movesOk}</span>
        </div>
        <div className={css.stat}>
          <Image src={ILLU.celHito} alt="" aria-hidden="true" width={76} height={76} sizes="76px" className={css.statImg} />
          <span className={`num big ${css.statNum}`}>{money(setAside)}</span>
          <strong style={{ fontSize: 14 }}>{m.goals}</strong>
          <span className="xs muted">{best ? fill(m.goalPct, { goal: best.name, pct: best.pct }) : m.goalsNone}</span>
        </div>
        {game ? (
          <div className={css.stat}>
            <Image src={ILLU.celRacha} alt="" aria-hidden="true" width={76} height={76} sizes="76px" className={css.statImg} />
            <span className={`num big ${css.statNum}`}>{st.weeks}</span>
            <strong style={{ fontSize: 14 }}>{st.weeks === 1 ? m.streakOne : m.streak}</strong>
            <span className="xs muted">{st.weeks > 0 ? m.streakOn : m.streakStart}</span>
          </div>
        ) : null}
      </div>

      <div className={css.cols}>
        <div className={css.col}>
          <section aria-labelledby="cv" className={`${css.card} ${css.orderDay}`}>
            <h2 id="cv" className={css.h2}>{m.dayToDay}</h2>
            {bars.length === 0 ? (
              <>
                <span className="small muted" style={{ lineHeight: 1.5 }}>{fill(m.dayToDayEmpty, { month })}</span>
                {on("plan") ? <Link href="/plan" className="link" style={{ alignSelf: "flex-start", fontSize: 14, minHeight: 44, display: "inline-flex", alignItems: "center" }}>{m.openPlan}</Link> : null}
              </>
            ) : (
              <ul className={`${css.list} ${css.bars}`}>
                {bars.map((b) => {
                  const c = b.key ? catById.get(b.key) : undefined;
                  const label = c?.name ?? m.noCategory;
                  const left = b.budget - b.spent;
                  return (
                    <li key={b.key ?? "none"} className={css.barRow}>
                      <div className={css.barHead}>
                        <strong>{label}</strong>
                        <span className="num" style={{ color: "var(--gris)", textAlign: "right" }}>
                          {b.budget <= 0 ? fill(m.barNoBudget, { spent: money(b.spent) }) : (
                            <>{fill(left >= 0 ? m.barLeft : m.barOver, { spent: money(b.spent), budget: money(b.budget) })} <strong style={{ color: left >= 0 ? "var(--verde-fuerte)" : "var(--tinta)" }}>{money(Math.abs(left))}</strong></>
                          )}
                        </span>
                      </div>
                      <div className={css.track} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={b.budget > 0 ? Math.min(100, Math.round((b.spent / b.budget) * 100)) : 100}>
                        <div className={css.fill} style={{ width: `${b.budget > 0 ? Math.min(100, Math.round((b.spent / b.budget) * 100)) : 100}%`, background: c?.color || "var(--amarillo-oscuro)" }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <span className="xs muted">{m.dayToDayNote}</span>
          </section>

          <section aria-labelledby="nx" className={`${css.card} ${css.orderDue}`} style={{ gap: 10 }}>
            <h2 id="nx" className={css.h2}>{m.dueTitle}</h2>
            {due.length === 0 ? <span className="small muted">{m.dueEmpty}</span> : (
              <ul className={css.list}>
                {due.map((d) => (
                  <li key={`${d.lineId}-${d.date}`} className={css.due}>
                    <span><span className={css.dueDay}>{dayLabel(d.date, s.locale)}</span>{d.name}</span>
                    <strong className="num">{money(d.amountCents)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className={css.col}>
          <section aria-labelledby="oned" className={`${css.one} ${css.orderOne}`}>
            <span className={css.oneLabel}>{m.one}</span>
            <h2 id="oned" className={css.oneTitle}>{thingTitle}</h2>
            <span className={css.oneText}>{thingText}</span>
            <Link href={thingHref[thing]} className={css.oneCta}>{m.doIt}</Link>
          </section>

          {lesson && course ? (
            <Link href={lessonHref} className={`${css.lesson} ${css.orderLesson}`}>
              <span className="xs muted">{m.lessonLabel}{lesson.durationSec > 0 ? ` · ${fill(m.lessonMin, { n: Math.max(1, Math.round(lesson.durationSec / 60)) })}` : ""}</span>
              <strong style={{ fontSize: 15 }}>{lesson.title}</strong>
              <span className="small muted">{game && lessonPts > 0 ? fill(m.lessonPts, { n: lessonPts }) : m.lessonGo}</span>
            </Link>
          ) : null}

          <section aria-labelledby="nt" className={`${css.card} only-desktop`} style={{ gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <h2 id="nt" className={css.h2}>{m.habitTitle}</h2>
              <span className="small muted" style={{ lineHeight: 1.5 }}>{m.habitText}</span>
            </div>
            <ul className={css.list} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {HABIT_KINDS.map((k) => {
                const isOn = wantsHabit(k, habitPrefs, np);
                return (
                  <li key={k} className={css.notice}>
                    <span aria-hidden="true" className={css.logo}>360</span>
                    <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                      <strong style={{ fontSize: 14 }}>{m.habit[k].t}</strong>
                      <span style={{ fontSize: 13, color: "var(--tinta-2)" }}>{m.habit[k].d}</span>
                    </span>
                    <span className={css.when}><span>{m.habit[k].when}</span><strong style={{ color: "var(--tinta)" }}>{isOn ? m.habitOn : m.habitOff}</strong></span>
                  </li>
                );
              })}
            </ul>
            <span className="xs muted">{m.habitWhenNote}</span>
            <Link href="/perfil#notificaciones" className="link" style={{ alignSelf: "flex-start", fontSize: 14, minHeight: 44, display: "inline-flex", alignItems: "center" }}>{m.habitChoose}</Link>
          </section>
        </div>

        <Link href="/inicio" className={`${css.doneMobile} ${css.mobileOnly}`} style={{ order: 6 }}>{m.doneShort}</Link>
      </div>
    </main>
  );
}

/** "17 al 23 de noviembre" · "November 17–23" (o con dos meses si la semana los cruza). */
function rangeLabel(from: ISODate, to: ISODate, locale: "es" | "en", m: (typeof M)["es"]): string {
  const a = parts(from), b = parts(to);
  const name = (mm: number) => (locale === "en" ? monthName(mm, "en") : monthName(mm, "es").toLowerCase());
  return a.m === b.m ? fill(m.rangeSame, { a: a.d, b: b.d, month: name(a.m) }) : fill(m.rangeDiff, { a: a.d, ma: name(a.m), b: b.d, mb: name(b.m) });
}

/** "Mié 26" */
function dayLabel(d: ISODate, locale: "es" | "en"): string {
  return `${WEEKDAY[locale][isoWeekday(d) - 1]} ${parts(d).d}`;
}
