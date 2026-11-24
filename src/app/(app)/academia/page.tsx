import type { Metadata } from "next";
import Link from "next/link";
import { fill } from "@/i18n";
import { Empty, PageHeader, Ring } from "@/components/ui/basics";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ProWall } from "@/components/shell/ProWall";
import {
  addDays, badgeProgress, BADGES, consecutiveClosures, diagnose, formatDate, formatMoney, levelFor, parts, priority, streak, todayIn, weekStart, type BadgeKey,
} from "@/lib/engine";
import { fetchAll, loadDiagnosticInput, must } from "@/server/data";
import { badgeName } from "@/server/rewards";
import { requireUser, type Session } from "@/server/session";
import { durationLabel, isLockedForTier, localParts, splitOn } from "./lib";
import { Countdown } from "./Countdown";
import { M, type AcadMessages } from "./messages";
import { loadCatalog, totalPoints, type Catalog, type CourseView } from "./server";
import { CourseCard, Cover } from "./ui";
import css from "./academia.module.css";

export const metadata: Metadata = { title: "Academia" };

const STAGE_ICON: Record<string, IconName> = { "Domina la app": "compass", "Tu dinero": "sprout" };

export default async function AcademiaPage() {
  const s = await requireUser();
  const m = M[s.locale];
  if (s.config.menu.academia !== "on") {
    return (
      <main className="page">
        <PageHeader title={m.title} eyebrow={m.eyebrow} />
        <Empty icon="cap" title={m.soonTitle} text={m.soonText}><Link href="/inicio" className="btn btn-secondary btn-sm">{m.goHome}</Link></Empty>
      </main>
    );
  }
  if (!s.has("acad")) return <main className="page"><PageHeader title={m.title} eyebrow={m.eyebrow} /><ProWall s={s} title={m.proTitle} bullets={m.proBullets} /></main>;

  const game = s.config.gamification;
  const [cat, diagInput] = await Promise.all([loadCatalog(s), loadDiagnosticInput(s, s.year, s.month)]);
  const gam = game ? await loadGamification(s, cat, diagInput) : null;

  const usable = cat.courses.filter((c) => c.lessons.length > 0 && !isLockedForTier(c.course.tier, "free", s.tier));
  const hero = usable.find((c) => c.progress.done > 0 && !c.progress.complete) ?? usable.find((c) => c.progress.done === 0) ?? null;
  const allDone = usable.length > 0 && usable.every((c) => c.progress.complete);

  const prio = priority(diagnose(diagInput));
  const recoCourse = prio ? cat.courses.find((c) => c.course.priority === prio && c.lessons.length > 0 && !c.progress.complete) ?? null : null;

  const nowMs = cat.nowMs;
  const tz = s.profile.timezone || "Australia/Sydney";
  const release = (c: CourseView) => {
    const p = localParts(c.course.publishAt ?? new Date(nowMs).toISOString(), tz);
    return { date: formatDate(p.date, s.locale, "day"), time: p.time };
  };
  const nextUp = cat.courses.filter((c) => c.course.upcoming).sort((a, b) => Date.parse(a.course.publishAt ?? "") - Date.parse(b.course.publishAt ?? ""))[0] ?? null;

  const stages: { name: string; courses: CourseView[] }[] = [];
  for (const c of cat.courses) {
    const g = stages.find((x) => x.name === c.course.stage);
    if (g) g.courses.push(c); else stages.push({ name: c.course.stage, courses: [c] });
  }

  const reco = recoCourse && prio ? <Reco cv={recoCourse} m={m} indicator={m.indicators[prio]} points={game ? s.config.points.course ?? 0 : 0} /> : null;

  return (
    <main className="page">
      <PageHeader title={m.title} eyebrow={<>
        <span className="only-desktop">{m.eyebrow}</span>
        <span className="only-mobile">{gam ? fill(m.headerPtsShort, { n: gam.points, level: gam.level.index }) : m.eyebrow}</span>
      </>}>
        {gam ? <span className="only-desktop" style={{ fontSize: 14, fontWeight: 600, padding: "10px 16px", borderRadius: 999, background: "var(--blanco)", border: "1px solid var(--linea)" }}>
          {splitOn(m.headerPts, "n", { level: gam.level.index })[0]}<strong className="num" style={{ color: "var(--amarillo-texto)" }}>{gam.points}</strong>{splitOn(m.headerPts, "n", { level: gam.level.index })[1]}
        </span> : null}
      </PageHeader>

      {cat.courses.length === 0 ? <Empty icon="cap" title={m.noCourses} text={m.noCoursesText}><Link href="/inicio" className="btn btn-secondary btn-sm">{m.goHome}</Link></Empty> : null}

      {hero ? <Hero cv={hero} m={m} /> : allDone ? (
        <section className={css.hero} aria-label={m.allDoneTitle}>
          <div className={css.heroBody}><span style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".12em", color: "var(--amarillo)" }}>{m.completed.toUpperCase()}</span><h2 className={css.heroTitle}>{m.allDoneTitle}</h2><span style={{ fontSize: 14, color: "var(--oscuro-texto-2)" }}>{m.allDoneText}</span></div>
        </section>
      ) : null}

      {reco ? <div className="only-mobile">{reco}</div> : null}

      {nextUp || gam ? (
        <div className={css.duo}>
          {nextUp ? <NextUp cv={nextUp} m={m} release={release(nextUp)} serverNowMs={nowMs} /> : null}
          {gam ? <Gamification g={gam} m={m} s={s} /> : null}
        </div>
      ) : null}

      {stages.map((st, si) => {
        const head = m.stages[st.name] ?? { label: st.name.toUpperCase(), title: "" };
        return (
          <section key={st.name} aria-labelledby={`stage-${si}`} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className={css.stageHead}>
              <span aria-hidden="true" className={css.stageIcon}><Icon name={STAGE_ICON[st.name] ?? "cap"} size={22} color="var(--blanco)" /></span>
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".14em", color: "var(--amarillo-texto)" }}>{head.label}</span>
                {head.title ? <strong id={`stage-${si}`} style={{ fontSize: 22, fontWeight: 600 }}>{head.title}</strong> : <strong id={`stage-${si}`} style={{ fontSize: 22, fontWeight: 600 }}>{st.name}</strong>}
              </span>
            </div>
            <div className={css.cards}>
              {st.courses.map((c) => <CourseCard key={c.course.id} cv={c} m={m} tier={s.tier} featured={hero?.course.id === c.course.id} release={c.course.upcoming ? fill(m.releasesOn, { date: release(c).date }) : undefined} />)}
            </div>
          </section>
        );
      })}

      {reco || game ? (
        <div className={css.bottom}>
          {reco ? <div className="only-desktop">{reco}</div> : null}
          {game ? (
            <section aria-labelledby="pts" className={css.box}>
              <h2 id="pts" style={{ fontSize: 15, fontWeight: 600 }}>{m.howPoints}</h2>
              <div className={css.ptsGrid}>
                <span><strong className="num">+{s.config.points.lesson ?? 0}</strong> {m.ptsLesson}</span>
                <span><strong className="num">+{s.config.points.course ?? 0}</strong> {m.ptsCourse}</span>
                <span><strong className="num">+{s.config.points.closure ?? 0}</strong> {m.ptsClosure}</span>
                <span><strong className="num">+{s.config.points.week_active ?? 0}</strong> {m.ptsWeek}</span>
              </div>
              <span style={{ fontSize: 12, color: "var(--gris)" }}>{m.ptsNote}</span>
            </section>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}

function Hero({ cv, m }: { cv: CourseView; m: AcadMessages }) {
  const next = cv.lessons.find((l) => l.id === cv.nextId) ?? null;
  const started = cv.progress.done > 0;
  const modIdx = next?.moduleId ? cv.modules.findIndex((x) => x.id === next.moduleId) + 1 : 0;
  const dur = next ? durationLabel(next.durationSec, m.dur) : null;
  return (
    <section aria-labelledby="cont" className={css.hero}>
      <div aria-hidden="true" className={css.heroCover}>
        <Cover src={cv.course.coverUrl} />
        {started ? <span style={{ position: "absolute", top: 12, left: 12, fontSize: 12, fontWeight: 600, padding: "5px 10px", borderRadius: 999, background: "var(--blanco)", color: "var(--tinta)" }}>{fill(m.yourCourse, { pct: cv.progress.pct })}</span> : null}
      </div>
      <div className={css.heroBody}>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".12em", color: "var(--amarillo)" }}>{started ? m.contLabel : m.startLabel}</span>
        <h2 id="cont" className={css.heroTitle}>{cv.course.title}</h2>
        {next ? (
          <Link href={`/academia/${cv.course.slug}/${next.id}`} className={css.nextLink}>
            <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--tinta)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon name="play" size={16} color="var(--blanco)" /></span>
            <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 12, color: "var(--oscuro-texto-3)" }}>{modIdx > 0 ? fill(m.nextLessonModule, { n: modIdx }) : m.nextLesson}</span>
              <strong style={{ fontSize: 15 }}>{next.title}{dur ? ` · ${dur}` : ""}</strong>
            </span>
          </Link>
        ) : null}
        <div role="progressbar" aria-label={m.progress} aria-valuenow={cv.progress.pct} aria-valuemin={0} aria-valuemax={100} style={{ height: 8, borderRadius: 4, background: "var(--oscuro-linea)" }}><div style={{ width: `${cv.progress.pct}%`, height: 8, borderRadius: 4, background: "var(--amarillo)" }} /></div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, color: "var(--oscuro-texto-2)" }}>
          <span><strong className="num" style={{ color: "var(--blanco)" }}>{cv.progress.done}</strong> {fill(m.lessonsOf, { total: cv.progress.total })}</span>
          <span className="num">{fill(m.pctDone, { pct: cv.progress.pct })}</span>
        </div>
      </div>
    </section>
  );
}

function Reco({ cv, m, indicator, points }: { cv: CourseView; m: AcadMessages; indicator: string; points: number }) {
  const count = cv.lessons.length === 1 ? m.lessonsOne : fill(m.lessonsN, { n: cv.lessons.length });
  return (
    <Link href={`/academia/${cv.course.slug}`} className={css.reco}>
      <span aria-hidden="true" style={{ width: 46, height: 46, borderRadius: 14, background: "var(--ambar-fondo)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon name="spark" size={22} color="var(--naranja)" /></span>
      <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ambar-texto)" }}>{fill(m.recoLabel, { indicator })}</span>
        <strong style={{ fontSize: 15 }}>{fill(m.recoCourse, { title: cv.course.title })}</strong>
        <span style={{ fontSize: 12, color: "var(--gris)" }}>{count}{points > 0 ? <> · <span style={{ color: "var(--amarillo-texto)", fontWeight: 600 }}>{fill(m.plusPoints, { n: points })}</span></> : null}</span>
      </span>
      <span aria-hidden="true" style={{ fontSize: 18, color: "var(--gris)" }}>›</span>
    </Link>
  );
}

// ───────── Logros: puntos, nivel, racha e insignias (datos reales) ─────────
type Gam = Awaited<ReturnType<typeof loadGamification>>;

async function loadGamification(s: Session, cat: Catalog, diag: { emergencyFundCents: number; basicExpensesCents: number }) {
  const [points, weeks, badgesRes, closuresRes, planRes, debtsRes, goalsRes, invRes] = await Promise.all([
    totalPoints(s),
    fetchAll<{ week_start: string; wildcard: boolean }>((a, b) => s.supabase.from("activity_weeks").select("week_start, wildcard").eq("user_id", s.userId).order("week_start").range(a, b)),
    s.supabase.from("user_badges").select("badge, earned_at").eq("user_id", s.userId),
    s.supabase.from("month_closures").select("year, month").eq("user_id", s.userId),
    s.supabase.from("plan_lines").select("id", { count: "exact", head: true }),
    s.supabase.from("debts").select("id", { count: "exact", head: true }).not("closed_at", "is", null),
    s.supabase.from("goals").select("id, target_cents, completed_at, goal_entries(amount_cents)").is("archived_at", null),
    s.supabase.from("investments").select("id", { count: "exact", head: true }),
  ]);
  for (const r of [planRes, debtsRes, invRes]) if (r.error) throw new Error(`db: ${r.error.message}`);
  const earned = new Map(must(badgesRes).map((b) => [b.badge, b.earned_at]));
  const closed = must(closuresRes).map((c) => `${c.year}-${String(c.month).padStart(2, "0")}`);
  const goals = must(goalsRes);
  const goalPct = goals.filter((g) => !g.completed_at && g.target_cents > 0)
    .map((g) => (g.goal_entries as { amount_cents: number }[]).reduce((a, e) => a + e.amount_cents, 0) / g.target_cents);
  const started = cat.courses.filter((c) => c.progress.total > 0 && !c.progress.complete).sort((a, b) => b.progress.pct - a.progress.pct)[0] ?? null;
  const consecutive = consecutiveClosures(closed);
  const facts = {
    lessonsDone: cat.done.size, planBuilt: s.profile.onboardingStep === "done" && (planRes.count ?? 0) > 0, closures: closed.length, consecutiveClosures: consecutive,
    debtsPaid: debtsRes.count ?? 0, emergencyFundCents: diag.emergencyFundCents, basicExpensesCents: diag.basicExpensesCents,
    goalsDone: goals.filter((g) => g.completed_at).length, bestGoalProgress: goalPct.length ? Math.max(...goalPct) : 0,
    coursesDone: cat.courses.filter((c) => c.progress.complete).length, bestCourseProgress: started ? started.progress.done / started.progress.total : 0,
    investments: invRes.count ?? 0,
  };
  const current = weekStart(s.today);
  return {
    points, level: levelFor(points, s.config.levels), levels: [...s.config.levels].sort((a, b) => a.min - b.min),
    streak: streak(weeks.map((w) => ({ weekStart: w.week_start, wildcard: w.wildcard })), current),
    weeks: Array.from({ length: 7 }, (_, i) => addDays(current, -7 * (6 - i))).map((w) => ({ week: w, on: weeks.some((x) => x.week_start === w) })),
    progress: badgeProgress(facts), earned, facts, closures: closed.length, consecutive, goalsAny: goals.length > 0, started,
  };
}

function badgeHint(b: BadgeKey, g: Gam, m: AcadMessages, s: Session): string {
  const h = m.badgeHint;
  switch (b) {
    case "flame": return fill(h.flame, { n: Math.min(3, g.consecutive) });
    case "star": return fill(h.star, { n: Math.min(12, g.consecutive) });
    case "shield": return g.facts.basicExpensesCents > 0 ? fill(h.shieldAmt, { a: formatMoney(g.facts.emergencyFundCents, s.fmt), b: formatMoney(g.facts.basicExpensesCents, s.fmt) }) : h.shield;
    case "flag": return g.goalsAny ? fill(h.flag, { pct: Math.round(g.facts.bestGoalProgress * 100) }) : h.flagNone;
    case "cap": return g.started ? fill(h.cap, { course: g.started.course.title, n: g.started.progress.done, total: g.started.progress.total }) : h.capNone;
    default: return h[b];
  }
}

function Gamification({ g, m, s }: { g: Gam; m: AcadMessages; s: Session }) {
  const st = g.streak;
  const streakTitle = st.weeks === 0 ? m.streakNone : st.weeks === 1 ? m.streakOne : fill(m.streak, { n: st.weeks });
  const got = BADGES.filter((b) => g.earned.has(b)).length;
  const pct = Math.round(g.level.progress * 100);
  return (
    <section aria-labelledby="lvl" className={css.gam}>
      <div className={css.gamCol}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span role="img" aria-label={fill(m.levelRing, { n: g.level.index })}>
            <Ring value={g.level.progress} size={64}><span className="num" style={{ fontSize: 22 }}>{g.level.index}</span></Ring>
          </span>
          <span style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, flex: 1 }}>
            <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h2 id="lvl" style={{ fontSize: 16, fontWeight: 600 }}>{fill(m.level, { n: g.level.index, name: g.level.name })}</h2>
              <span className="pill pill-yellow num">{fill(m.points, { n: g.points })}</span>
            </span>
          </span>
        </div>
        <div role="progressbar" aria-label={g.level.next ? fill(m.toNext, { n: g.level.toNext, next: g.level.next }) : m.maxLevel} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} style={{ height: 10, borderRadius: 5, background: "var(--linea-2)" }}>
          <div style={{ width: `${pct}%`, height: 10, borderRadius: 5, background: "var(--amarillo)" }} />
        </div>
        <span style={{ fontSize: 13, color: "var(--gris)" }}>
          {g.level.next ? <>{splitOn(m.toNext, "n", { next: g.level.next })[0]}<strong className="num" style={{ color: "var(--tinta)" }}>{g.level.toNext}</strong>{splitOn(m.toNext, "n", { next: g.level.next })[1]}</> : m.maxLevel}
        </span>
        <Link href="/perfil#insignias" className={css.gamLink}>{m.seeBadges}</Link>
        <ol aria-label={m.levels} className={css.levels}>
          {g.levels.map((l, i) => {
            const n = i + 1, cur = n === g.level.index, past = n < g.level.index;
            return (
              <li key={l.name} aria-current={cur ? "step" : undefined} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <span className="num" style={{ width: 30, height: 30, borderRadius: "50%", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center",
                  background: cur ? "var(--amarillo)" : past ? "var(--tinta)" : "var(--linea-2)", color: past ? "var(--blanco)" : cur ? "var(--tinta)" : "var(--gris)" }}>{n}</span>
                <span style={{ fontSize: 10, fontWeight: cur ? 600 : 400, textAlign: "center", color: cur ? "var(--tinta)" : "var(--gris)", overflowWrap: "anywhere" }}>{l.name}</span>
              </li>
            );
          })}
        </ol>
        <div style={{ borderTop: "1px solid var(--linea-2)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Icon name="flame" size={18} color="var(--amarillo-oscuro)" stroke={2} />
            <span>{streakTitle}</span>
            <span style={{ fontWeight: 400, color: "var(--gris)" }}>{st.thisWeekCounts ? m.weekCounts : m.weekPending}</span>
          </span>
          <span style={{ fontSize: 12, color: "var(--gris)" }}>{m.streakText} {st.wildcardAvailable ? m.wildcardYes : m.wildcardNo}</span>
          <span aria-hidden="true" style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--gris-4)" }}>{m.weeksAria}</span>
          <ol aria-label={m.weeksAria} className={css.weeks}>
            {g.weeks.map((w) => (
              <li key={w.week} aria-label={fill(w.on ? m.weekOn : m.weekOff, { date: formatDate(w.week, s.locale, "day") })} style={{ height: 30, borderRadius: 8, fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center",
                background: w.on ? "var(--amarillo-oscuro)" : "var(--linea-2)", color: w.on ? "var(--tinta)" : "var(--gris)" }}>
                <span aria-hidden="true" className="num">{parts(w.week).d}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className={css.gamCol}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>{m.badges} <span className="num" style={{ fontSize: 13, color: "var(--gris)" }}>{fill(m.badgesCount, { n: got, total: BADGES.length })}</span></h2>
        <ul className={css.badges}>
          {BADGES.map((b) => {
            const at = g.earned.get(b);
            const bp = Math.round((g.progress[b] ?? 0) * 100);
            const name = badgeName(b, s.locale);
            return (
              <li key={b} className={css.badge} title={m.badgeDesc[b]}>
                <span className={css.badgeImg} style={at ? undefined : { filter: "grayscale(1)", opacity: 0.45 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- insignia de 256 px servida tal cual desde /public */}
                  <img src={`/insignias/${b}.jpg`} alt="" width={58} height={58} loading="lazy" />
                </span>
                <strong style={{ fontSize: 12, lineHeight: 1.25, color: at ? "var(--tinta)" : "var(--gris)" }}>{name}</strong>
                {at ? <span style={{ fontSize: 11, fontWeight: 600, color: "var(--amarillo-texto)" }}>{fill(m.earnedOn, { date: formatDate(todayIn(s.profile.timezone || "Australia/Sydney", new Date(at)), s.locale, "day") })}</span> : (
                  <>
                    <span role="progressbar" aria-label={name} aria-valuenow={bp} aria-valuemin={0} aria-valuemax={100} style={{ width: "80%", height: 5, borderRadius: 3, background: "var(--linea-2)" }}><span style={{ display: "block", height: 5, borderRadius: 3, background: "var(--amarillo)", width: `${bp}%` }} /></span>
                    <span style={{ fontSize: 11, color: "var(--gris)", lineHeight: 1.35 }}>{badgeHint(b, g, m, s)}</span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function NextUp({ cv, m, release, serverNowMs }: { cv: CourseView; m: AcadMessages; release: { date: string; time: string }; serverNowMs: number }) {
  const label = m.stages[cv.course.stage]?.label;
  const stage = label ? label.charAt(0) + label.slice(1).toLowerCase() : cv.course.stage;
  return (
    <section aria-labelledby="soon" className={css.box} style={{ gap: 12 }}>
      <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".12em", color: "var(--amarillo-texto)" }}>{m.nextUp}</span>
      <h2 id="soon" style={{ fontSize: 24, fontWeight: 600 }}>{cv.course.title}</h2>
      <span style={{ fontSize: 13, color: "var(--gris)" }}>{fill(m.newCourse, { stage })}</span>
      <Countdown targetMs={Date.parse(cv.course.publishAt ?? "")} serverNowMs={serverNowMs} t={{ cd: m.cd, cdAria: m.cdAria, released: m.released }} />
      <span style={{ fontSize: 12, color: "var(--gris)" }}>{fill(m.releasesAt, release)}</span>
    </section>
  );
}
