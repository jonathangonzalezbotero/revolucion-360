"use server";
import { z } from "zod";
import { fill } from "@/i18n";
import { fail, ok, run, type Result } from "@/server/action";
import { must } from "@/server/data";
import { award } from "@/server/rewards";
import { M } from "./messages";
import { countChallenge, finishRewards, raw } from "./server";

const PATHS = ["/retos", "/metas"];
const Id = z.string().uuid();

/** Errores de las funciones de la base → texto para la persona. */
function errorText(locale: "es" | "en", message: string | undefined, generic: string): string {
  const m = M[locale];
  const code = (message ?? "").trim();
  if (code.includes("ended")) return m.errEnded;
  if (code.includes("already_done")) return m.errDone;
  if (code.includes("not_available") || code.includes("not_eligible") || code.includes("not_active")) return m.errGone;
  if (code.includes("not_started")) return m.errNotStarted;
  return generic;
}

/** "Me animo": entra al reto (o sigue en el intento activo). Si el reto mide "abrir la app", hoy ya cuenta. */
export async function joinChallenge(input: unknown): Promise<Result<{ memberId: string; text: string }>> {
  return run<{ memberId: string; text: string }>({ feature: "metas", revalidate: PATHS }, async (s) => {
    const p = z.object({ challengeId: Id }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const ch = must(await raw(s).from("challenges").select("id, title").eq("id", p.data.challengeId).maybeSingle()) as { id: string; title: string } | null;
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

/** "Aparecer en la tabla del grupo" (solo la persona lo decide; por defecto no aparece). */
export async function setBoard(input: unknown): Promise<Result<{ text: string }>> {
  return run<{ text: string }>({ feature: "metas", revalidate: ["/retos"] }, async (s) => {
    const p = z.object({ memberId: Id, on: z.boolean() }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    must(await raw(s).from("challenge_members").update({ show_on_board: p.data.on }).eq("id", p.data.memberId).eq("user_id", s.userId).select("id"));
    return ok({ text: p.data.on ? M[s.locale].tBoardOn : M[s.locale].tBoardOff });
  });
}
