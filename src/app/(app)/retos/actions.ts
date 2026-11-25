"use server";
import { cookies } from "next/headers";
import { z } from "zod";
import { fill } from "@/i18n";
import { fail, ok, run, type Result } from "@/server/action";
import { must } from "@/server/data";
import { award } from "@/server/rewards";
import { M } from "./messages";
import { countChallenge, finishRewards, OPEN_APP_COOKIE, openAppStamp, raw } from "./server";

// Inicio pinta "Reto de hoy" y el menú la señal de Retos (desde el 25 nov 2026 Metas ya no muestra retos).
const PATHS = ["/retos", "/inicio"];
const Id = z.string().uuid();

/** Errores de las funciones de la base → texto para la persona. */
function errorText(locale: "es" | "en", message: string | undefined, generic: string): string {
  const m = M[locale];
  const code = (message ?? "").trim();
  if (code.includes("ended")) return m.errEnded;
  if (code.includes("already_done")) return m.errDone;
  if (code.includes("not_available") || code.includes("not_eligible") || code.includes("not_active")) return m.errGone;
  if (code.includes("not_started")) return m.errNotStarted;
  if (code.includes("day_passed")) return m.errDayPassed;
  return generic;
}

/** "Me animo": entra al reto (o sigue en el intento activo). Si el reto mide "abrir la app", hoy ya cuenta. */
export async function joinChallenge(input: unknown): Promise<Result<{ memberId: string; text: string }>> {
  return run<{ memberId: string; text: string }>({ feature: "metas", revalidate: PATHS }, async (s) => {
    const p = z.object({ challengeId: Id }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    // Solo columnas públicas (la tabla completa solo la lee el Dueño).
    const ch = must(await raw(s).rpc("challenge_list").select("id, title").eq("id", p.data.challengeId).maybeSingle()) as { id: string; title: string } | null;
    if (!ch) return fail(M[s.locale].errGone);
    const r = await raw(s).rpc("challenge_join", { p_challenge: ch.id });
    if (r.error) return fail(errorText(s.locale, r.error.message, s.t.errors.generic));
    const points = await countChallenge(s, "open_app");
    return ok({ memberId: r.data as string, text: fill(M[s.locale].tJoin, { name: ch.title }) }, { points: points || undefined });
  });
}

/** Salir: el intento queda como "salió" y todo lo logrado se conserva (marcas, puntos). */
export async function leaveChallenge(input: unknown): Promise<Result<{ text: string }>> {
  return run<{ text: string }>({ feature: "metas", revalidate: PATHS }, async (s) => {
    const p = z.object({ memberId: Id }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    must(await raw(s).from("challenge_members").update({ status: "left" }).eq("id", p.data.memberId).eq("user_id", s.userId).eq("status", "active").select("id"));
    return ok({ text: M[s.locale].tLeave });
  });
}

/** "Sí, lo hice" / "Hoy no". Una marca por día (en su zona horaria). Sí suma el punto del día; si llega a la meta, el premio. */
export async function checkIn(input: unknown): Promise<Result<{ text: string }>> {
  return run<{ text: string }>({ feature: "metas", revalidate: PATHS }, async (s) => {
    const m = M[s.locale];
    const p = z.object({ memberId: Id, done: z.boolean() }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const r = await raw(s).rpc("challenge_checkin", { p_member: p.data.memberId, p_done: p.data.done });
    if (r.error) return fail(errorText(s.locale, r.error.message, s.t.errors.generic));
    const d = r.data as {
      inserted: boolean; state: "yes" | "no"; key: string; count: number; days: number; target: number; finished: boolean;
      challengeId: string; title: string; badge: string | null; usedWildcard: boolean;
    };
    if (!d.inserted) return ok({ text: d.state === "yes" ? m.marked : m.skipped });
    if (d.state === "no") return ok({ text: d.usedWildcard ? m.tNoWild : m.tNo });
    let points = await award(s, "challenge_day", `${p.data.memberId}:${d.key}`);
    if (d.finished) {
      points += await finishRewards(s, { memberId: p.data.memberId, challengeId: d.challengeId, title: d.title, badge: d.badge });
      return ok({ text: fill(m.tDone, { name: d.title }) }, { points: points || undefined });
    }
    return ok({ text: fill(m.tYes, { n: d.count, total: d.days }) }, { points: points || undefined });
  });
}

/**
 * "Aparecer en la tabla del grupo" (solo la persona lo decide; por defecto no aparece). Apagarlo funciona siempre, también
 * en solo lectura (es retirar sus datos de la vista de otros); prenderlo exige poder escribir. La base lo impone
 * (`challenge_set_board`: solo la fila propia y solo esa columna).
 */
export async function setBoard(input: unknown): Promise<Result<{ text: string }>> {
  return run<{ text: string }>({ write: false, feature: "metas", revalidate: ["/retos"] }, async (s) => {
    const p = z.object({ memberId: Id, on: z.boolean() }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    if (p.data.on && !s.canEdit) return fail(s.t.errors.readOnly);
    const r = await raw(s).rpc("challenge_set_board", { p_member: p.data.memberId, p_on: p.data.on });
    if (r.error) return fail(s.t.errors.generic);
    return ok({ text: p.data.on ? M[s.locale].tBoardOn : M[s.locale].tBoardOff });
  });
}

/**
 * Retos que miden "abrir la app": lo llama `OpenAppPing` (en el layout) una vez al día por navegador. Deja la cookie del
 * día para no volver a llamar en cada pantalla (la base igual lo cuenta una sola vez al día). Nunca lanza ni avisa.
 */
export async function pingOpenApp(): Promise<Result<undefined>> {
  return run<undefined>({ feature: "metas" }, async (s) => {
    await countChallenge(s, "open_app");
    (await cookies()).set(OPEN_APP_COOKIE, openAppStamp(s), { path: "/", maxAge: 60 * 60 * 36, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
    return ok(undefined);
  });
}
