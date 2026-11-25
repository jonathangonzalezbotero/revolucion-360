"use server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fill } from "@/i18n";
import { CHALLENGE_IDLE_DAYS } from "@/lib/crm/flow";
import type { Step } from "@/lib/crm/schema";
import { fail, ok } from "@/server/action";
import { must } from "@/server/data";
import { saveAutomation, untypedDb } from "@/server/crm";
import type { Session } from "@/server/session";
import { challengeProblem, ChallengeInput, LOCKED_WHEN_PUBLISHED, MAX_DAYS, normalizeChallenge, POINT_CAP } from "@/app/(app)/retos/lib";
import { adminAction, audit } from "../_shared/server";
import { M } from "./messages";

const PATHS = ["/admin/retos", "/admin/automatizaciones", "/admin/actividad", "/retos", "/metas"];
const raw = (s: Session) => s.supabase as unknown as SupabaseClient;

type Existing = {
  id: string; status: "draft" | "published"; published_at: string | null; reminder_automation_id: string | null; done_automation_id: string | null;
} & Record<(typeof LOCKED_WHEN_PUBLISHED)[number], unknown>;

/**
 * Crea (una sola vez) las dos automatizaciones del reto: "Reto: recordatorio" (a quien no marca en 3 días) y
 * "Reto: ¡lo lograste!". Quedan en BORRADOR: son correos de marketing con texto escrito por la app, así que el Dueño
 * los revisa y los activa en Automatizaciones. Si ya existen, no se tocan (se editan allá). Nunca lanza.
 */
async function ensureAutomations(s: Session, c: { id: string; title: string; reminder: string | null; done: string | null }): Promise<boolean> {
  const t = M.es.auto;
  const db = untypedDb(s.supabase); // sesión del Dueño: la base impone que solo él escriba crm_*
  try {
    const exists = async (id: string | null) =>
      !!id && !!(must(await db.from("crm_automations").select("id").eq("id", id).maybeSingle()) as { id: string } | null);
    const email = (subject: string, preheader: string, heading: string, text: string, button: string): Step => ({
      id: "correo", type: "email", subject, preheader,
      blocks: [
        { type: "heading", text: fill(heading, { title: c.title }) },
        { type: "text", text },
        { type: "button", text: button, href: "/retos" },
        { type: "signature", text: t.signature },
      ],
    });
    const patch: Record<string, string> = {};
    if (!(await exists(c.reminder))) {
      patch.reminder_automation_id = await saveAutomation(db, {
        name: fill(t.remindName, { title: c.title }).slice(0, 120),
        trigger: { kind: "challenge_idle", days: CHALLENGE_IDLE_DAYS, challengeId: c.id },
        steps: [email(t.remindSubject, t.remindPre, t.remindHeading, t.remindText, t.remindButton)],
        exitRules: { onUnsubscribe: true, onCancel: true, goal: null },
      });
    }
    if (!(await exists(c.done))) {
      patch.done_automation_id = await saveAutomation(db, {
        name: fill(t.doneName, { title: c.title }).slice(0, 120),
        trigger: { kind: "challenge_done", challengeId: c.id },
        steps: [email(t.doneSubject, t.donePre, t.doneHeading, t.doneText, t.doneButton)],
        exitRules: { onUnsubscribe: true, onCancel: true, goal: null },
      });
    }
    if (Object.keys(patch).length) must(await raw(s).from("challenges").update(patch).eq("id", c.id).select("id"));
    return true;
  } catch (e) {
    console.error("[retos] automatizaciones", e instanceof Error ? e.message.slice(0, 80) : "error"); // sin datos personales
    return false;
  }
}

/** Guardar borrador / Publicar reto / Guardar cambios. Solo el Dueño (sección "retos"; la base lo impone con is_admin_owner()). */
export async function saveChallenge(input: unknown) {
  return adminAction<{ id: string; text: string }>(PATHS, async (s) => {
    const m = M[s.locale];
    const p = ChallengeInput.safeParse(input);
    if (!p.success) {
      const field = String(p.error.issues[0]?.path[0] ?? "");
      return fail(field === "title" ? m.errTitle : field === "days" ? fill(m.errDays, { max: MAX_DAYS }) : field === "points" ? fill(m.errPoints, { n: POINT_CAP.app, how: m.errPointsApp }) : s.t.errors.generic);
    }
    const d = p.data;
    const existing = d.id
      ? (must(await raw(s).from("challenges").select("id, status, published_at, reminder_automation_id, done_automation_id, measure, action, wildcards, days, starts_on, audience, group_id, invite_code").eq("id", d.id).maybeSingle()) as Existing | null)
      : null;
    if (d.id && !existing) return fail(s.t.errors.notFound);
    const wasPublished = existing?.status === "published";
    // Publicado: las reglas no cambian para quien ya está adentro (se conservan las guardadas).
    const row: Record<string, unknown> = normalizeChallenge(d);
    if (wasPublished && existing) LOCKED_WHEN_PUBLISHED.forEach((k) => { row[k] = existing[k]; });
    const check = {
      ...d, measure: row.measure as typeof d.measure, action: row.action as typeof d.action, wildcards: row.wildcards as number, days: row.days as number,
      startsOn: row.starts_on as string | null, audience: row.audience as typeof d.audience, groupId: row.group_id as string | null,
      inviteCode: row.invite_code as string | null, publish: d.publish && !wasPublished,
    };
    const problem = challengeProblem(check, s.today);
    if (problem) {
      const msg = {
        action: m.errAction, group: m.errGroup, code: m.errCode, wildcards: m.errWild, start: m.errStart,
        points: fill(m.errPoints, { n: POINT_CAP[check.measure], how: check.measure === "checkin" ? m.errPointsCheck : m.errPointsApp }),
      }[problem];
      return fail(msg);
    }
    if (check.audience === "group" && !wasPublished) {
      const g = must(await s.supabase.from("groups").select("id").eq("id", check.groupId as string).maybeSingle());
      if (!g) return fail(m.errGroup);
    }
    const publishNow = d.publish || wasPublished;
    const now = new Date().toISOString();
    const values = { ...row, status: publishNow ? "published" : "draft", published_at: existing?.published_at ?? (publishNow ? now : null), updated_at: now };
    const id = existing
      ? (must(await raw(s).from("challenges").update(values).eq("id", existing.id).select("id").single()) as { id: string }).id
      : (must(await raw(s).from("challenges").insert({ ...values, created_by: s.userId }).select("id").single()) as { id: string }).id;

    let text = m.tSaved;
    if (publishNow) {
      const autos = await ensureAutomations(s, { id, title: d.title, reminder: existing?.reminder_automation_id ?? null, done: existing?.done_automation_id ?? null });
      if (!wasPublished) text = autos ? m.tPublished : m.tPublishedNoCrm;
      else if (!autos) text = m.tPublishedNoCrm;
    }
    await audit(s, d.publish && !wasPublished ? "reto_publicar" : "reto_guardar", null, { challenge: id });
    return ok({ id, text });
  }, "retos");
}
