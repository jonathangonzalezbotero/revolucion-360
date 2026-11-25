import type { SupabaseClient } from "@supabase/supabase-js";
import { HABIT_PRIORITY, readHabitPrefs, isLastDayOfMonth, isQuietHour, isSunday, localClock, repasoWeek, wantsHabit, type HabitKind } from "@/lib/engine/habito";
import { parts } from "@/lib/engine";
import { byIds, FIRST_UUID, BATCH, loadCronConfig, runCron, type Admin } from "@/lib/email/cron";
import { readPrefs } from "@/lib/email/lib";
import { notifyHabit, type HabitProfile, type HabitSendResult } from "@/server/habit-notify";
import { allowanceOf, dueTomorrow, loadHabitPlan, type HabitPlan } from "./data";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/habito — avisos del hábito (en la app + push). Protegida con CRON_SECRET (`runCron`).
 * Vercel Hobby solo corre tareas una vez al día, así que la tarea NO apunta a una hora exacta: en cada corrida mira la
 * hora local de cada persona, se salta a quien está de noche (21:00 a 8:00) y le manda como máximo UN aviso del día:
 *   cierre (último día del mes) → "mañana se paga X" → repaso (domingo) → "hoy puedes gastar".
 * Está programada tres veces al día (vercel.json: 02:00, 14:00 y 22:00 UTC; cada entrada es una tarea diaria, con `?run=`
 * para que sean distintas). 02:00 y 14:00 están a 12 horas: toda zona horaria cae de día (8:00 a 21:00) en al menos una;
 * 22:00 es la mañana de Sydney (9:00 en verano) y 14:00 la de Bogotá/Lima (9:00). El aviso sale en la primera corrida de día;
 * `habit_sends` (único por persona y día local) impide que la segunda corrida mande otro, y si otra tarea ya le mandó
 * un aviso con push ese día (cierre, racha, vencimientos…), tampoco sale el del hábito.
 * Idempotente. Devuelve solo conteos: ningún monto ni dato personal.
 */
export async function GET(request: Request) {
  return runCron("habito", request, async (db) => {
    const cfg = await loadCronConfig(db);
    const now = new Date();
    const counts = { checked: 0, night: 0, inactive: 0, already: 0, nothing: 0 } as Record<string, number>;
    const results: Record<HabitSendResult, number> = { sent: 0, capped: 0, duplicate: 0, quiet: 0, off: 0, failed: 0 };
    const byKind: Record<HabitKind, number> = { close: 0, due: 0, weekly: 0, daily: 0, goal: 0 };

    for await (const batch of profiles(db)) {
      counts.checked += batch.length;
      // Solo quien está de día en su zona (21:00 a 8:00 se salta).
      const awake = batch.map((p) => ({ p, clock: localClock(p.timezone, now) })).filter(({ clock }) => {
        if (isQuietHour(clock.hour)) { counts.night++; return false; }
        return true;
      });
      if (!awake.length) continue;
      const ids = awake.map((a) => a.p.id);
      const since = new Date(now.getTime() - 36 * 3600_000).toISOString();
      const [ents, otherPush, sentToday] = await Promise.all([
        byIds<{ user_id: string; state: string }>(ids, (c) => db.from("entitlements").select("user_id, state").in("user_id", c).order("user_id")),
        // Avisos con push que mandan otras tareas (cierre, racha, vencimientos, bienvenida, primer mes): cuentan para el tope de uno al día.
        byIds<{ user_id: string; created_at: string; dedupe: string | null }>(ids, (c) => db.from("notifications").select("user_id, created_at, dedupe").in("user_id", c).gte("created_at", since).not("dedupe", "is", null).order("user_id").order("created_at")),
        byIds<{ user_id: string; day: string }>(ids, (c) => (db as unknown as SupabaseClient).from("habit_sends").select("user_id, day").in("user_id", c).gte("day", minDay(awake.map((a) => a.clock.date))).order("user_id")),
      ]);
      const state = new Map(ents.map((e) => [e.user_id, e.state]));
      const already = new Set(sentToday.map((r) => `${r.user_id}|${r.day}`));
      const tz = new Map(awake.map((a) => [a.p.id, a.p.timezone]));
      for (const n of otherPush) {
        if (!n.dedupe || !OTHER_PUSH.some((pre) => n.dedupe!.startsWith(pre))) continue;
        already.add(`${n.user_id}|${localClock(tz.get(n.user_id), new Date(n.created_at)).date}`);
      }

      for (const { p, clock } of awake) {
        const profile: HabitProfile = { ...p, state: state.get(p.id) ?? null };
        if (!["trial", "pro", "alumno", "fundador"].includes(profile.state ?? "")) { counts.inactive++; continue; }
        if (already.has(`${p.id}|${clock.date}`)) { counts.already++; continue; }
        const notify = readPrefs(p.prefs), habit = readHabitPrefs(p.prefs);
        const np = { payments: notify.notify.payments, close: notify.notify.close, closeDay: notify.closeDay, channel: notify.channel };
        const wants = (k: HabitKind) => wantsHabit(k, habit, np);
        if (!HABIT_PRIORITY.some(wants)) { counts.nothing++; continue; }

        const today = clock.date;
        let plan: HabitPlan | null | undefined;
        const getPlan = async () => (plan === undefined ? (plan = await loadHabitPlan(db, p.id, today)) : plan);

        // Se evalúan en orden de prioridad y se detiene en el primero que aplica (solo carga lo necesario).
        let sent: HabitSendResult | null = null, kind: HabitKind | null = null;
        for (const k of HABIT_PRIORITY) {
          if (!wants(k)) continue;
          if (k === "close") {
            if (!isLastDayOfMonth(today) || (cfg.menuCierre !== undefined && cfg.menuCierre !== "on")) continue;
            const { y, m } = parts(today);
            const { data, error } = await db.from("month_closures").select("reopened_at").eq("user_id", p.id).eq("year", y).eq("month", m).maybeSingle();
            if (error) throw new Error(`db: ${error.message}`);
            if (data && !data.reopened_at) continue;
            sent = await notifyHabit(p.id, "close", { year: y, month: m, points: cfg.gamification ? cfg.closurePoints : null }, { db, profile, now });
          } else if (k === "due") {
            const pl = await getPlan();
            const due = pl ? dueTomorrow(pl, today) : [];
            if (!due.length) continue;
            sent = await notifyHabit(p.id, "due", { date: due[0].date, items: due.map((d) => ({ lineId: d.lineId, name: d.name, amountCents: d.amountCents })) }, { db, profile, now });
          } else if (k === "weekly") {
            if (!isSunday(today)) continue;
            const w = repasoWeek(today);
            const { count, error } = await db.from("transactions").select("id", { count: "exact", head: true })
              .eq("user_id", p.id).is("deleted_at", null).is("parent_id", null).gte("date", w.from).lte("date", w.to);
            if (error) throw new Error(`db: ${error.message}`);
            sent = await notifyHabit(p.id, "weekly", { weekStart: w.from, movements: count ?? 0 }, { db, profile, now });
          } else {
            const pl = await getPlan();
            const a = pl ? allowanceOf(pl, today) : null;
            if (!a || a.state !== "ok" || a.perDayCents <= 0) continue; // si ya se pasó, no se avisa: nada de castigo
            sent = await notifyHabit(p.id, "daily", { perDayCents: a.perDayCents, remainingCents: a.remainingCents, lastDay: a.daysLeft === 1 }, { db, profile, now });
          }
          kind = k;
          break;
        }
        if (!sent || !kind) { counts.nothing++; continue; }
        results[sent]++;
        if (sent === "sent") byKind[kind]++;
      }
    }
    return { ...counts, ...results, byKind };
  });
}

type Row = Omit<HabitProfile, "state">;
/** Perfiles no suspendidos, de a 500 por llave (seguro aunque cambien filas mientras corre). */
async function* profiles(db: Admin): AsyncGenerator<Row[]> {
  let after = FIRST_UUID;
  for (;;) {
    const { data, error } = await db.from("profiles").select("id, timezone, locale, currency, prefs, suspended_at").gt("id", after).is("suspended_at", null).order("id").limit(BATCH);
    if (error) throw new Error(`db: ${error.message}`);
    const rows = data.map((r): Row => ({ id: r.id, timezone: r.timezone, locale: r.locale, currency: r.currency, prefs: r.prefs, suspendedAt: r.suspended_at }));
    if (rows.length) yield rows;
    if (rows.length < BATCH) return;
    after = rows[rows.length - 1].id;
  }
}

/** Prefijos de `notifications.dedupe` de las tareas que también mandan push (src/app/api/cron/*, src/lib/email/events.ts). */
const OTHER_PUSH = ["cierre-", "racha-", "acceso-", "bienvenida", "primer-mes-"];

const minDay = (days: string[]) => days.reduce((a, b) => (b < a ? b : a));
