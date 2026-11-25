import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { asLocale, fill, type Locale } from "@/i18n";
import { formatMoney, monthName, type Cents, type ISODate, type MoneyFormat } from "@/lib/engine";
import { isQuietHour, localClock, readHabitPrefs, wantsHabit, type HabitKind } from "@/lib/engine/habito";
import { HM } from "@/lib/email/habito-messages";
import { readPrefs } from "@/lib/email/lib";
import { sendPush } from "@/lib/email/push";
import { createAdminClient } from "@/lib/supabase/admin";

// Avisos del hábito: UNO al día como máximo por persona y nunca de noche (21:00 a 8:00 en su hora).
// Los usa la tarea diaria /api/cron/habito y cualquier módulo que quiera avisar un hito (Metas).
// Crean la notificación en la app y la mandan al celular si hay push. Nunca correo. Nunca lanzan.

type Admin = ReturnType<typeof createAdminClient>;
export type HabitSendResult =
  | "sent"       // salió (notificación en la app + push si tiene)
  | "capped"     // ya recibió un aviso del hábito hoy (su día local)
  | "duplicate"  // ese mismo aviso ya salió antes (ej. el 75% de esa meta)
  | "quiet"      // es de noche en su zona (21:00 a 8:00)
  | "off"        // no lo quiere (preferencias), cuenta sin activar, en solo lectura o suspendida
  | "failed";    // error de base de datos (se registra sin datos personales)

/**
 * Tipos de aviso: los del hábito (`HabitKind`) más "challenge" (Retos, 20261125000037_retos.sql: "Reto: día 11 de 30 ·
 * ¿Lo cumpliste hoy?"). El reto usa la preferencia "Metas y retos" (`prefs.habit.goal`) y se guarda en `habit_sends`
 * con kind 'goal' y ref 'reto:<intento>:<día>' (la columna solo acepta los 5 tipos de la 030; así no se toca).
 */
export type NotifyKind = HabitKind | "challenge";
const PREF_OF = (k: NotifyKind): HabitKind => (k === "challenge" ? "goal" : k);
const SEND_KIND = (k: NotifyKind): HabitKind => (k === "challenge" ? "goal" : k);

/** Lo que necesita cada tipo de aviso. */
export type HabitData = {
  daily: { perDayCents: Cents; remainingCents: Cents; lastDay: boolean };
  weekly: { weekStart: ISODate; movements: number };
  /** Hito de una meta (25/50/75/100%). `eta`: fecha en que llega a este ritmo (o null si no se sabe). */
  goal: { goalId: string; goalName: string; pct: 25 | 50 | 75 | 100; remainingCents: Cents; eta: ISODate | null };
  /** Pagos fijos de mañana (`date` = mañana en la zona del usuario). */
  due: { date: ISODate; items: { lineId: string; name: string; amountCents: Cents }[] };
  close: { year: number; month: number; points: number | null };
  /** Check-in de un reto que aún no marcó hoy. */
  challenge: { memberId: string; title: string; day: number; days: number };
};

/** Perfil mínimo para decidir y escribir el aviso (la tarea diaria lo pasa ya leído). */
export type HabitProfile = { id: string; timezone: string | null; locale: string | null; currency: string | null; prefs: unknown; suspendedAt: string | null; state: string | null };

/** Estados con la cuenta activa (pagando, primer mes, alumno o fundador). Sin activar y solo lectura no reciben avisos del hábito. */
const ACTIVE = new Set(["trial", "pro", "alumno", "fundador"]);
const NUMBER_LOCALE: Record<string, string> = { AUD: "en-AU", USD: "en-US", NZD: "en-NZ", GBP: "en-GB", EUR: "es-ES", COP: "es-CO", MXN: "es-MX", CLP: "es-CL", PEN: "es-PE", ARS: "es-AR", CAD: "en-CA" };
const fmtOf = (currency: string | null): MoneyFormat => ({ currency: currency || "AUD", numberLocale: NUMBER_LOCALE[currency || "AUD"] ?? "en-US" });

/** Tipo en el centro de notificaciones (filtros e íconos de /notificaciones). "reto" va en Logros (notificaciones/lib.ts). */
const CENTER_KIND: Record<NotifyKind, string> = { daily: "habito", weekly: "habito", goal: "logro", due: "pago", close: "cierre", challenge: "reto" };

/** Textos del aviso de retos (mockup Notificaciones: "Reto: día 11 de 30" · "Tu fondo de emergencia en 30 días. ¿Lo cumpliste hoy?"). */
const CHALLENGE_TEXT: Record<Locale, { title: string; body: string }> = {
  es: { title: "Reto: día {day} de {days}", body: "{name}. ¿Lo cumpliste hoy?" },
  en: { title: "Challenge: day {day} of {days}", body: "{name}. Did you do it today?" },
};

/** `habit_sends` es nueva (migración 20261125000030_habito.sql): hasta regenerar los tipos se usa sin tipar. */
const untyped = (db: Admin) => db as unknown as SupabaseClient;

export async function loadHabitProfile(db: Admin, userId: string): Promise<HabitProfile | null> {
  const [p, e] = await Promise.all([
    db.from("profiles").select("id, timezone, locale, currency, prefs, suspended_at").eq("id", userId).maybeSingle(),
    db.from("entitlements").select("state").eq("user_id", userId).maybeSingle(),
  ]);
  if (p.error || e.error || !p.data) return null;
  return { id: p.data.id, timezone: p.data.timezone, locale: p.data.locale, currency: p.data.currency, prefs: p.data.prefs, suspendedAt: p.data.suspended_at, state: e.data?.state ?? null };
}

/** Clave única de cada aviso: nunca sale dos veces. */
export function habitRef<K extends NotifyKind>(kind: K, data: HabitData[K], localDay: ISODate): string {
  switch (kind) {
    case "challenge": return `reto:${(data as HabitData["challenge"]).memberId}:${localDay}`;
    case "daily": return localDay;
    case "weekly": return (data as HabitData["weekly"]).weekStart;
    case "goal": { const g = data as HabitData["goal"]; return `${g.goalId}:${g.pct}`; }
    case "due": return (data as HabitData["due"]).date;
    default: { const c = data as HabitData["close"]; return `${c.year}-${String(c.month).padStart(2, "0")}`; }
  }
}

/** Título, texto y enlace del aviso en el idioma del usuario. */
export function renderHabit<K extends NotifyKind>(kind: K, data: HabitData[K], locale: Locale, fmt: MoneyFormat): { title: string; body: string; href: string } {
  const t = HM[locale];
  const money = (c: Cents) => formatMoney(c, fmt);
  switch (kind) {
    case "challenge": {
      const c = data as HabitData["challenge"];
      const x = CHALLENGE_TEXT[locale];
      return { title: fill(x.title, { day: c.day, days: c.days }), body: fill(x.body, { name: c.title }), href: "/retos" };
    }
    case "daily": {
      const d = data as HabitData["daily"];
      return { title: fill(t.daily.title, { amount: money(d.perDayCents) }), body: fill(d.lastDay ? t.daily.bodyLast : t.daily.body, { remaining: money(d.remainingCents) }), href: "/inicio" };
    }
    case "weekly": {
      const w = data as HabitData["weekly"];
      return { title: t.weekly.title, body: w.movements === 0 ? t.weekly.bodyNone : w.movements === 1 ? t.weekly.bodyOne : fill(t.weekly.body, { n: w.movements }), href: "/repaso" };
    }
    case "goal": {
      const g = data as HabitData["goal"];
      if (g.pct === 100) return { title: fill(t.goal.titleDone, { goal: g.goalName }), body: t.goal.bodyDone, href: "/metas" };
      const body = g.eta ? fill(t.goal.body, { remaining: money(g.remainingCents), month: monthName(+g.eta.slice(5, 7), locale).toLowerCase() }) : fill(t.goal.bodyNoDate, { remaining: money(g.remainingCents) });
      return { title: fill(t.goal.title, { pct: g.pct, goal: g.goalName }), body, href: "/metas" };
    }
    case "due": {
      const d = data as HabitData["due"];
      const total = d.items.reduce((a, i) => a + i.amountCents, 0);
      const href = `/plan/mes/${+d.date.slice(5, 7)}`;
      if (d.items.length === 1) return { title: fill(t.due.title, { name: d.items[0].name }), body: fill(t.due.body, { amount: money(total) }), href };
      return { title: fill(t.due.titleMany, { n: d.items.length }), body: fill(t.due.bodyMany, { name: d.items[0].name, more: d.items.length - 1, amount: money(total) }), href };
    }
    default: {
      const c = data as HabitData["close"];
      const month = monthName(c.month, locale).toLowerCase(), next = monthName((c.month % 12) + 1, locale).toLowerCase();
      return { title: fill(t.close.title, { month }), body: c.points ? fill(t.close.body, { next, points: c.points }) : fill(t.close.bodyNoPoints, { next }), href: "/cierre" };
    }
  }
}

/**
 * Manda UN aviso del hábito si se puede. Reglas, en orden:
 * 1. Cuenta activa, no suspendida, y la persona lo quiere (Perfil › Notificaciones; con "solo correo" no sale ninguno).
 * 2. Nunca de noche: de 21:00 a 8:00 en su zona horaria → "quiet" (no se guarda para después).
 * 3. Nunca el mismo aviso dos veces → "duplicate".
 * 4. Máximo uno al día (su día local): se reserva la fila en `habit_sends` (único por usuario y día) → "capped" si ya había.
 * 5. Notificación en la app (`notifications`) + push a sus dispositivos.
 *
 * Uso desde Metas, al pasar un hito: `await notifyHabit(s.userId, "goal", { goalId, goalName, pct: 75, remainingCents, eta })`.
 * Si devuelve algo distinto de "sent", el aviso no sale (la persona igual ve el hito en pantalla).
 */
export async function notifyHabit<K extends NotifyKind>(
  userId: string, kind: K, data: HabitData[K],
  opts: { now?: Date; db?: Admin; profile?: HabitProfile } = {},
): Promise<HabitSendResult> {
  try {
    const db = opts.db ?? createAdminClient();
    const p = opts.profile ?? (await loadHabitProfile(db, userId));
    if (!p || p.id !== userId || p.suspendedAt || !ACTIVE.has(p.state ?? "")) return "off";
    const notify = readPrefs(p.prefs);
    if (!wantsHabit(PREF_OF(kind), readHabitPrefs(p.prefs), { payments: notify.notify.payments, close: notify.notify.close, closeDay: notify.closeDay, channel: notify.channel })) return "off";
    const clock = localClock(p.timezone, opts.now ?? new Date());
    if (isQuietHour(clock.hour)) return "quiet";

    const ref = habitRef(kind, data, clock.date);
    const sends = untyped(db).from("habit_sends");
    const seen = await sends.select("id").eq("user_id", userId).eq("kind", SEND_KIND(kind)).eq("ref", ref).limit(1);
    if (seen.error) throw new Error(seen.error.message);
    if (seen.data?.length) return "duplicate";
    const claim = await untyped(db).from("habit_sends").insert({ user_id: userId, day: clock.date, kind: SEND_KIND(kind), ref }).select("id").single();
    if (claim.error) {
      if (claim.error.code === "23505") return "capped"; // ya hubo uno hoy (o el mismo aviso entró en paralelo)
      throw new Error(claim.error.message);
    }
    const claimId = (claim.data as { id: string }).id;

    const locale = asLocale(p.locale);
    const n = renderHabit(kind, data, locale, fmtOf(p.currency));
    const dedupe = `habito-${kind}-${ref}`;
    const ins = await db.from("notifications")
      .upsert({ user_id: userId, kind: CENTER_KIND[kind], title: n.title.slice(0, 140), body: n.body.slice(0, 400), href: n.href, dedupe }, { onConflict: "user_id,dedupe", ignoreDuplicates: true })
      .select("id");
    if (ins.error) {
      await untyped(db).from("habit_sends").delete().eq("id", claimId); // suelta la reserva: que lo intente la próxima corrida
      throw new Error(ins.error.message);
    }
    const pushed = await sendPush(db, userId, { title: n.title, body: n.body, href: n.href, tag: dedupe });
    if (pushed > 0) await untyped(db).from("habit_sends").update({ pushed }).eq("id", claimId);
    return "sent";
  } catch {
    console.error("[habito] No se pudo mandar un aviso", kind); // sin usuario, montos ni textos
    return "failed";
  }
}

/**
 * Retos: el check-in de hoy que la persona aún no marcó (el primero, si tiene varios), o null. Lo decide la base
 * (`challenge_notice`: intento activo, de check-in, dentro de sus días, vigente para su grupo o código y sin marca hoy).
 * Uso desde la tarea diaria: `notifyHabit(id, "challenge", await challengeNoticeFor(db, id), …)`. Nunca lanza.
 */
export async function challengeNoticeFor(db: Admin, userId: string): Promise<HabitData["challenge"] | null> {
  try {
    const r = await untyped(db).rpc("challenge_notice", { p_user: userId });
    if (r.error) return null; // p. ej. la migración 037 aún no está aplicada
    const row = (r.data as { member_id: string; title: string; day_n: number; days: number }[] | null)?.[0];
    return row ? { memberId: row.member_id, title: row.title, day: row.day_n, days: row.days } : null;
  } catch {
    return null;
  }
}
