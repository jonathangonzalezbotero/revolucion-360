import { asLocale, fill } from "@/i18n";
import { formatDate } from "@/lib/engine";
import { byIds, loadCronConfig, profileBatches, runCron } from "@/lib/email/cron";
import { allowsApp, currentWeekOf, readPrefs, streakToSave } from "@/lib/email/lib";
import { M } from "@/lib/email/messages";
import { notifyOnce } from "@/lib/email/send";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/racha (lunes). Aviso en la app "Tu racha se puede salvar" a quien venía con racha de 2 semanas o más,
 * no registró nada la semana pasada y tiene el comodín del mes disponible. NO gasta el comodín: lo decide el usuario en Perfil.
 */
export async function GET(request: Request) {
  return runCron("racha", request, async (db) => {
    const cfg = await loadCronConfig(db);
    if (!cfg.gamification) return { skipped: true, reason: "logros apagados en Admin" };
    const now = new Date();
    let checked = 0, savable = 0, notified = 0;
    for await (const batch of profileBatches(db)) {
      checked += batch.length;
      const users = batch.filter((p) => allowsApp(readPrefs(p.prefs)));
      if (!users.length) continue;
      // Todas las semanas (byIds pagina de a 1,000) para contar la racha completa.
      const weeks = await byIds<{ user_id: string; week_start: string; wildcard: boolean }>(users.map((p) => p.id), (ids) =>
        db.from("activity_weeks").select("user_id, week_start, wildcard").in("user_id", ids).order("user_id").order("week_start"));
      const byUser = new Map<string, { weekStart: string; wildcard: boolean }[]>();
      for (const w of weeks) byUser.set(w.user_id, [...(byUser.get(w.user_id) ?? []), { weekStart: w.week_start, wildcard: w.wildcard }]);
      for (const p of users) {
        const save = streakToSave(byUser.get(p.id) ?? [], currentWeekOf(p.timezone, now));
        if (!save) continue;
        savable++;
        const locale = asLocale(p.locale);
        const t = M[locale].notif;
        if (await notifyOnce(db, {
          userId: p.id, kind: "logro", title: t.streakTitle,
          body: fill(t.streakBody, { date: formatDate(save.missedWeek, locale, "day"), n: save.weeks }),
          href: "/perfil#racha", dedupe: `racha-${save.missedWeek}`,
        })) notified++;
      }
    }
    return { checked, savable, notified };
  });
}
