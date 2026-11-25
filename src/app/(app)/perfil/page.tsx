import type { Metadata } from "next";
import Link from "next/link";
import { fill } from "@/i18n";
import { BADGES, consecutiveClosures, badgeProgress, formatDate, formatMoney, levelFor, monthName, streak, todayIn, weekStart, type BadgeKey } from "@/lib/engine";
import { mfaStatus } from "@/app/(auth)/actions";
import { closureTarget } from "@/server/closure";
import { fetchAll, loadDiagnosticInput, must } from "@/server/data";
import { countAssets } from "../inversiones/lib";
import { requireUser, type Session } from "@/server/session";
import { term } from "@/server/terms";
import { Achievements, type BadgeView } from "./Achievements";
import { NamesForm, PersonalForm, PrefsForm, RegionForm } from "./Forms";
import { readHabitPrefs } from "@/lib/engine/habito";
import { SmsPrefsForm } from "./SmsPrefs";
import { MovModeForm } from "./MovMode";
import { movMode } from "@/lib/engine/registro";
import { PAY_FREQUENCIES, readNotifyPrefs, TERM_KEYS, timezoneOptions, visibleTabs, type PayFrequency, type Tab, type TermKey } from "./lib";
import { M, type PerfilMessages } from "./messages";
import { Privacy } from "./Privacy";
import { Security } from "./Security";
import { ProfileTabs } from "./Tabs";
import css from "./perfil.module.css";

export const metadata: Metadata = { title: "Mi perfil" };

export default async function PerfilPage() {
  const s = await requireUser();
  const m = M[s.locale];
  const tz = s.profile.timezone || "Australia/Sydney";
  const day = (iso: string) => formatDate(todayIn(tz, new Date(iso)), s.locale);

  const [countriesRes, catsRes, extraRes, deleteRes, mfa, userRes, achievements, marketing] = await Promise.all([
    s.supabase.from("countries").select("code, name, currency, timezone, pay_frequency, terms").eq("enabled", true).order("sort"),
    s.supabase.from("categories").select("id, name, original_name, is_basic").eq("user_id", s.userId).order("sort").order("created_at"),
    s.supabase.from("profiles").select("email, last_name, phone, password_changed_at").eq("id", s.userId).single(),
    s.supabase.from("privacy_requests").select("id, due_at").eq("user_id", s.userId).eq("kind", "delete").eq("status", "pending").order("requested_at", { ascending: false }).limit(1),
    mfaStatus(),
    s.supabase.auth.getUser(),
    s.config.gamification ? loadAchievements(s, m) : Promise.resolve(null),
    loadMarketing(s),
  ]);
  const countries = must(countriesRes);
  const categories = must(catsRes);
  const extra = must(extraRes);
  const pendingDelete = must(deleteRes)[0] ?? null;
  const user = userRes.data.user;
  const myCountry = countries.find((c) => c.code === s.profile.country);
  const countryTerms = Object.fromEntries(TERM_KEYS.map((k) => [k, term({ ...s, profile: { ...s.profile, terms: {} } } as Session, k, (myCountry?.terms ?? {}) as Record<string, string>)])) as Record<TermKey, string>;

  const tabs = visibleTabs(s.config.gamification);
  const panels: Partial<Record<Tab, React.ReactNode>> = {
    logros: achievements,
    datos: (
      <div className="stack" style={{ gap: 16 }}>
        <PersonalForm m={m} name={s.profile.name} lastName={extra.last_name} phone={extra.phone} email={extra.email} verified={!!user?.email_confirmed_at} pendingEmail={user?.new_email ?? null}
          initial={(s.profile.name || s.profile.email).trim().charAt(0).toUpperCase()} />
        <PlanSummary s={s} m={m} />
      </div>
    ),
    region: (
      <div className="stack" style={{ gap: 16 }}>
        <RegionForm m={m} timezones={timezoneOptions(tz)}
          countries={countries.map((c) => ({ code: c.code, name: c.name, currency: c.currency, timezone: c.timezone, payFrequency: c.pay_frequency }))}
          initial={{ country: s.profile.country, currency: s.profile.currency, timezone: tz, locale: s.locale, payFrequency: (PAY_FREQUENCIES as readonly string[]).includes(s.profile.payFrequency) ? s.profile.payFrequency as PayFrequency : "monthly" }} />
        {/* Mensual o Día a día: solo con la cuenta activa (sin activar no hay plan ni movimientos que leer) */}
        {s.plan !== "free" ? <MovModeForm m={m} initial={movMode(s.profile.movLevel)} /> : null}
      </div>
    ),
    nombres: <NamesForm m={m} countryTerms={countryTerms} terms={s.profile.terms} categories={categories.map((c) => ({ id: c.id, name: c.name, original: c.original_name, isBasic: c.is_basic }))} canEdit={s.canEdit} />,
    notificaciones: (
      <div className="stack" style={{ gap: 16 }}>
        <PrefsForm m={m} initial={readNotifyPrefs(s.profile.prefs)} habit={readHabitPrefs(s.profile.prefs)} marketing={marketing ? { email: marketing.email } : null} />
        {marketing ? <SmsPrefsForm m={m} initial={marketing.sms} phone={marketing.phone} suggested={extra.phone || undefined} /> : null}
      </div>
    ),
    seguridad: <Security m={m} mfa={mfa} isAdmin={s.profile.role === "admin"} passwordChanged={extra.password_changed_at ? day(extra.password_changed_at) : null} />,
    privacidad: <Privacy m={m} pending={pendingDelete ? { id: pendingDelete.id, due: day(pendingDelete.due_at) } : null} />,
  };

  return (
    <main className="page">
      <header className="page-header" style={{ alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="muted" style={{ fontSize: 14 }}><span className="only-desktop">{m.eyebrow}</span><span className="only-mobile">{m.eyebrowShort}</span></span>
          <h1>{m.title}</h1>
        </div>
        <Link href="/mas" className={`only-mobile ${css.back}`}>{m.backMore}</Link>
      </header>
      <ProfileTabs tabs={tabs} labels={m.tabs} label={m.tabsLabel} gamification={s.config.gamification} panels={panels} />
    </main>
  );
}

/**
 * Consentimiento de marketing (CRM, `crm_my_consent`). Si el CRM no responde (p. ej. la migración 036 aún no se aplicó),
 * devuelve null y Perfil queda como antes: nunca rompe la página.
 */
async function loadMarketing(s: Session): Promise<{ email: boolean; sms: boolean; phone: string | null } | null> {
  try {
    const { data, error } = await s.supabase.rpc("crm_my_consent" as never);
    if (error || !data || typeof data !== "object") return null;
    const d = data as { email?: unknown; sms?: unknown; phone?: unknown };
    return { email: d.email === true, sms: d.sms === true, phone: typeof d.phone === "string" ? d.phone : null };
  } catch {
    return null;
  }
}

/** Resumen del plan actual con enlace a Suscripción. */
function PlanSummary({ s, m }: { s: Session; m: PerfilMessages }) {
  const e = s.entitlement;
  const d = (iso: string | null) => (iso ? formatDate(todayIn(s.profile.timezone || "Australia/Sydney", new Date(iso)), s.locale) : "");
  const text =
    e.state === "trial" && e.trialEndsAt ? fill(m.plan.trialUntil, { date: d(e.trialEndsAt) }) :
    e.state === "pro" && e.proUntil ? fill(e.cancelAtPeriodEnd ? m.plan.proEnds : m.plan.proUntil, { date: d(e.proUntil) }) :
    e.state === "alumno" ? (e.accessUntil ? fill(m.plan.alumnoUntil, { date: d(e.accessUntil) }) : m.plan.alumnoLife) :
    e.state === "fundador" ? m.plan.fundador :
    e.state === "read_only" ? m.plan.readOnly :
    e.state === "free" ? m.plan.free : "";
  return (
    <section aria-labelledby="tu-plan" id="plan" className={css.section} style={{ gap: 10 }}>
      <div className="row-between wrap">
        <h2 id="tu-plan" style={{ fontSize: 17 }}>{m.plan.title}</h2>
        <span className={`pill ${e.state === "read_only" ? "pill-warn" : e.state !== "free" ? "pill-dark" : ""}`}>{m.plan.states[e.state]}</span>
      </div>
      {text ? <p className="small" style={{ color: "var(--tinta-2)", lineHeight: 1.5 }}>{text}</p> : null}
      <Link href="/suscripcion" className="link" style={{ alignSelf: "flex-start", fontSize: 14, minHeight: 44, display: "inline-flex", alignItems: "center" }}>{m.plan.see}</Link>
    </section>
  );
}

/** Nivel, racha, insignias con su avance real. Solo si los logros están encendidos en Admin. */
async function loadAchievements(s: Session, m: PerfilMessages) {
  const [points, badgesRes, weeks, closuresRes, debtsRes, goalsRes, invCount, linesRes, progress, coursesRes, diag, target] = await Promise.all([
    fetchAll<{ points: number; kind: string }>((a, b) => s.supabase.from("point_events").select("points, kind").eq("user_id", s.userId).order("at").order("id").range(a, b)),
    s.supabase.from("user_badges").select("badge, earned_at").eq("user_id", s.userId),
    fetchAll<{ week_start: string; wildcard: boolean }>((a, b) => s.supabase.from("activity_weeks").select("week_start, wildcard").eq("user_id", s.userId).order("week_start").range(a, b)),
    s.supabase.from("month_closures").select("year, month, reopened_at").eq("user_id", s.userId),
    s.supabase.from("debts").select("id, closed_at").eq("user_id", s.userId),
    s.supabase.from("goals").select("id, name, target_cents, completed_at, archived_at, goal_entries(amount_cents)").eq("user_id", s.userId),
    countAssets(s.supabase, s.userId),
    s.supabase.from("plan_lines").select("id", { count: "exact", head: true }).eq("user_id", s.userId),
    fetchAll<{ lesson_id: string }>((a, b) => s.supabase.from("lesson_progress").select("lesson_id").eq("user_id", s.userId).order("lesson_id").range(a, b)),
    s.supabase.from("courses").select("id, title, sort, lessons(id)").eq("status", "published").order("sort"),
    loadDiagnosticInput(s, s.year, s.month),
    closureTarget(s),
  ]);
  if (linesRes.error) throw new Error(`db: ${linesRes.error.message}`);
  const earned = new Map(must(badgesRes).map((b) => [b.badge, b.earned_at]));
  const closures = must(closuresRes).filter((c) => !c.reopened_at).map((c) => `${c.year}-${String(c.month).padStart(2, "0")}`);
  const debts = must(debtsRes);
  const goals = must(goalsRes);
  const courses = must(coursesRes);
  const done = new Set(progress.map((p) => p.lesson_id));
  const total = points.reduce((a, p) => a + p.points, 0);
  const consecutive = consecutiveClosures(closures);

  const openGoals = goals.filter((g) => !g.archived_at && !g.completed_at && g.target_cents > 0).map((g) => {
    const saved = (g.goal_entries ?? []).reduce((a, e) => a + e.amount_cents, 0);
    return { name: g.name, progress: Math.min(1, Math.max(0, saved / g.target_cents)) };
  }).sort((a, b) => b.progress - a.progress);
  const courseStats = courses.map((c) => ({ title: c.title, total: c.lessons.length, done: c.lessons.filter((l) => done.has(l.id)).length }))
    .filter((c) => c.total > 0 && c.done < c.total).sort((a, b) => b.done / b.total - a.done / a.total);
  const bestGoal = openGoals[0] ?? null;
  const bestCourse = courseStats.find((c) => c.done > 0) ?? null;

  const prog = badgeProgress({
    lessonsDone: done.size, planBuilt: s.profile.onboardingStep === "done" && (linesRes.count ?? 0) > 0, closures: closures.length, consecutiveClosures: consecutive,
    debtsPaid: debts.filter((d) => d.closed_at).length, emergencyFundCents: diag.emergencyFundCents, basicExpensesCents: diag.basicExpensesCents,
    goalsDone: goals.filter((g) => g.completed_at).length, bestGoalProgress: bestGoal?.progress ?? 0,
    coursesDone: points.filter((p) => p.kind === "course").length, bestCourseProgress: bestCourse ? bestCourse.done / bestCourse.total : 0, investments: invCount,
  });
  const b = m.badge;
  const targetMonth = target ? (s.locale === "es" ? monthName(target.month, "es").toLowerCase() : monthName(target.month, "en")) : "";
  const hint: Record<BadgeKey, { text: string; bar: number | null }> = {
    play: { text: b.play.hint, bar: null },
    grid: { text: b.grid.hint, bar: null },
    check: target ? { text: target.overdue ? fill(b.check.overdue, { month: targetMonth }) : target.daysLeft > 0 ? fill(b.check.target, { month: targetMonth, n: target.daysLeft }) : fill(b.check.targetLast, { month: targetMonth }), bar: target.progress } : { text: b.check.hint, bar: null },
    flame: { text: fill(b.flame.hint, { n: Math.min(3, consecutive) }), bar: prog.flame },
    unlock: { text: debts.length ? b.unlock.hasDebts : b.unlock.hint, bar: null },
    shield: diag.basicExpensesCents > 0 ? { text: fill(b.shield.progress, { fund: formatMoney(diag.emergencyFundCents, s.fmt), basic: formatMoney(diag.basicExpensesCents, s.fmt) }), bar: prog.shield } : { text: b.shield.hint, bar: null },
    flag: bestGoal ? { text: fill(b.flag.progress, { name: bestGoal.name, pct: Math.round(bestGoal.progress * 100) }), bar: bestGoal.progress } : { text: b.flag.hint, bar: null },
    cap: bestCourse ? { text: fill(b.cap.progress, { name: bestCourse.title, done: bestCourse.done, total: bestCourse.total }), bar: bestCourse.done / bestCourse.total } : { text: b.cap.hint, bar: null },
    sprout: { text: b.sprout.hint, bar: null },
    star: { text: fill(b.star.hint, { n: Math.min(12, consecutive) }), bar: prog.star },
  };
  const badges: BadgeView[] = BADGES.map((k) => {
    const at = earned.get(k);
    return { key: k, earned: at ? formatDate(todayIn(s.profile.timezone || "Australia/Sydney", new Date(at)), s.locale) : null, progress: at ? null : hint[k].bar, hint: at ? "" : hint[k].text };
  });

  const lv = levelFor(total, s.config.levels);
  const st = streak(weeks.map((w) => ({ weekStart: w.week_start, wildcard: w.wildcard })), weekStart(s.today));
  return (
    <Achievements m={m} points={total} level={lv} levels={s.config.levels} badges={badges} pointValues={s.config.points}
      streak={{ ...st, missedLabel: st.missedWeek ? formatDate(st.missedWeek, s.locale, "day") : "" }} canUseWildcard />
  );
}

