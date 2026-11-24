import { asLocale, fill } from "@/i18n";
import { monthName, tierOf, type PlanState } from "@/lib/engine";
import { appUrl, byIds, loadCronConfig, profileBatches, runCron } from "@/lib/email/cron";
import { allowsApp, allowsEmail, canGetCloseReminder, closeReminderPeriod, closureStreakBefore, isClosed, periodRef, readPrefs, safeToday, type Period } from "@/lib/email/lib";
import { M } from "@/lib/email/messages";
import { deliverOnce, notifyOnce } from "@/lib/email/send";
import { closeEmail } from "@/lib/email/templates";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ent = { user_id: string; state: string; trial_ends_at: string | null; pro_until: string | null; access_until: string | null };
type Closure = { user_id: string; year: number; month: number; reopened_at: string | null };

/**
 * GET /api/cron/cierre (diario). Recordatorio de cierre según prefs.close_day, en la zona horaria de cada usuario,
 * solo si ese mes no está cerrado y el usuario tiene acceso a `cierre` (Pro por defecto). Nunca lee montos:
 * de month_closures solo año, mes y si se reabrió.
 */
export async function GET(request: Request) {
  return runCron("cierre", request, async (db) => {
    const cfg = await loadCronConfig(db);
    if (cfg.menuCierre !== undefined && cfg.menuCierre !== "on") return { skipped: true, reason: "cierre apagado en Admin" };
    const now = new Date();
    let checked = 0, due = 0, emailed = 0, notified = 0, closed = 0, noAccess = 0, failed = 0;
    for await (const batch of profileBatches(db)) {
      checked += batch.length;
      const candidates: { p: (typeof batch)[number]; period: Period }[] = [];
      for (const p of batch) {
        const prefs = readPrefs(p.prefs);
        if (!prefs.notify.close) continue;
        const period = closeReminderPeriod(safeToday(p.timezone, now), prefs.closeDay);
        // No se recuerdan meses anteriores a la cuenta (Cierre tampoco deja cerrarlos).
        if (period && periodRef(period) >= safeToday(p.timezone, new Date(p.created_at)).slice(0, 7)) candidates.push({ p, period });
      }
      if (!candidates.length) continue;
      const ids = candidates.map((c) => c.p.id);
      const [ents, closures] = await Promise.all([
        byIds<Ent>(ids, (chunk) => db.from("entitlements").select("user_id, state, trial_ends_at, pro_until, access_until").in("user_id", chunk).order("user_id")),
        byIds<Closure>(ids, (chunk) => db.from("month_closures").select("user_id, year, month, reopened_at").in("user_id", chunk).order("user_id").order("year").order("month")),
      ]);
      const refs = [...new Set(candidates.map((c) => periodRef(c.period)))];
      const awarded = new Set((await byIds<{ user_id: string; ref: string }>(ids, (chunk) =>
        db.from("point_events").select("user_id, ref").eq("kind", "closure").in("ref", refs).in("user_id", chunk).order("id"))).map((r) => `${r.user_id}|${r.ref}`));
      const entBy = new Map(ents.map((e) => [e.user_id, e]));
      const closBy = new Map<string, Closure[]>();
      for (const c of closures) closBy.set(c.user_id, [...(closBy.get(c.user_id) ?? []), c]);

      for (const { p, period } of candidates) {
        const e = entBy.get(p.id);
        const state = (e?.state ?? "free") as PlanState;
        const tier = tierOf({ state, trialEndsAt: e?.trial_ends_at ?? null, proUntil: e?.pro_until ?? null, accessUntil: e?.access_until ?? null }, now);
        if (!canGetCloseReminder(tier, cfg.features, cfg.menuCierre, state)) { noAccess++; continue; }
        const rows = closBy.get(p.id) ?? [];
        if (isClosed(rows, period)) { closed++; continue; }
        due++;
        const prefs = readPrefs(p.prefs);
        const locale = asLocale(p.locale);
        const ref = periodRef(period);
        if (allowsEmail(prefs)) {
          const res = await deliverOnce(db, {
            userId: p.id, kind: "close_reminder", ref, to: p.email,
            render: () => closeEmail({
              locale, appUrl: appUrl(), period, showStreak: cfg.gamification, late: prefs.closeDay === "first",
              streak: closureStreakBefore(rows, period),
              points: awarded.has(`${p.id}|${ref}`) ? null : cfg.closurePoints,
            }),
          });
          if (res === "sent") emailed++; else if (res === "failed") failed++;
        }
        if (allowsApp(prefs)) {
          const t = M[locale].notif;
          const month = monthName(period.month, locale), next = monthName(period.month === 12 ? 1 : period.month + 1, locale);
          const vars = locale === "es" ? { month: month.toLowerCase(), next: next.toLowerCase() } : { month, next };
          if (await notifyOnce(db, { userId: p.id, kind: "cierre", title: fill(t.closeTitle, vars), body: fill(t.closeBody, vars), href: "/cierre", dedupe: `cierre-${ref}` })) notified++;
        }
      }
    }
    return { checked, due, emailed, notified, closed, noAccess, failed };
  });
}
