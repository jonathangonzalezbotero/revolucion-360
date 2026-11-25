import "server-only";
import { CHALLENGE_IDLE_DAYS, challengeIdleRef, type Trigger } from "@/lib/crm";
import { chunks } from "@/lib/email/lib";
import { must, type Db } from "./db";
import { recordEvent } from "./events";

/**
 * Retos (20261125000037_retos.sql): detecta "Reto: no marca en X días" para las automatizaciones activas con ese disparador.
 * La base (`challenge_idle_members`, solo clave de servicio) devuelve los intentos activos y vigentes sin un día cumplido
 * en X días; aquí se deja el evento (solo ids y la fecha del último día cumplido: el mismo bache avisa una vez).
 * Si la migración 037 no está aplicada, no hace nada.
 */
export async function detectChallengeIdle(db: Db, active: { trigger: Trigger }[]): Promise<number> {
  const daysList = [...new Set(active.filter((a) => a.trigger.kind === "challenge_idle").map((a) => a.trigger.days ?? CHALLENGE_IDLE_DAYS))];
  let found = 0;
  for (const days of daysList) {
    const r = await db.rpc("challenge_idle_members", { p_days: days });
    if (r.error && ["42883", "PGRST202"].includes(r.error.code ?? "")) return found; // migración 037 sin aplicar
    const rows = must(r) as { user_id: string; challenge_id: string; member_id: string; last_day: string }[];
    const contact = new Map<string, string>();
    for (const ids of chunks([...new Set(rows.map((x) => x.user_id))], 100)) {
      for (const c of must(await db.from("crm_contacts").select("id, user_id").in("user_id", ids)) as { id: string; user_id: string }[]) contact.set(c.user_id, c.id);
    }
    for (const x of rows) {
      const c = contact.get(x.user_id);
      if (c && (await recordEvent(db, c, "challenge_idle", challengeIdleRef(days, x.challenge_id, x.member_id, x.last_day)))) found++;
    }
  }
  return found;
}
