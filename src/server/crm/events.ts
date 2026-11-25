import "server-only";
import { cleanRef, stageFor, STAGE_EVENTS, type EventKind, type Stage } from "@/lib/crm";
import { crmDb, must, type Db } from "./db";

export type CrmTarget = { userId: string } | { contactId: string };

/**
 * Registra un evento de uso del contacto (tipo + ref, nunca montos), ajusta su etapa (etiqueta de sistema) si el evento
 * cambia el estado de la cuenta, y deja el evento pendiente para que el motor inscriba en las automatizaciones cuyo
 * disparador coincide (corre cada 10 minutos: los envíos también salen ahí).
 *
 * NUNCA lanza ni tumba la acción del usuario: si el CRM falla (o la migración aún no está aplicada), solo queda un aviso
 * en el registro sin datos personales. Se espera con `await` (no se deja suelto).
 */
export async function crmEvent(target: CrmTarget, kind: EventKind, ref?: string | number | null): Promise<void> {
  try {
    const db = crmDb();
    const contactId = "contactId" in target ? target.contactId : await contactForUser(db, target.userId);
    if (!contactId) return;
    await recordEvent(db, contactId, kind, ref);
    if ("userId" in target && STAGE_EVENTS.includes(kind)) await syncStageForUser(db, target.userId, contactId);
  } catch (e) {
    console.error("[crm] evento no registrado", kind, e instanceof Error ? e.message.slice(0, 80) : "error"); // sin datos personales
  }
}

/** Contacto de un usuario de la app; si no existe, lo crea o lo une por correo (crm_link_user). */
export async function contactForUser(db: Db, userId: string): Promise<string | null> {
  const found = must(await db.from("crm_contacts").select("id").eq("user_id", userId).maybeSingle()) as { id: string } | null;
  if (found) return found.id;
  const linked = await db.rpc("crm_link_user", { p_user: userId });
  if (linked.error) throw new Error(`db: ${linked.error.message}`);
  return (linked.data as string | null) ?? null;
}

/** Inserta el evento (único por contacto, tipo y ref: un aviso repetido no lo duplica) y marca la última actividad. */
export async function recordEvent(db: Db, contactId: string, kind: EventKind, ref?: string | number | null, at?: Date): Promise<boolean> {
  const row = { contact_id: contactId, kind, ref: cleanRef(ref), ...(at ? { at: at.toISOString() } : {}) };
  const r = must(await db.from("crm_events").upsert(row, { onConflict: "contact_id,kind,ref", ignoreDuplicates: true }).select("id")) as { id: number }[];
  if (!["email_sent", "sms_sent", "stage_changed", "inactive_days", "charge_upcoming"].includes(kind)) {
    must(await db.from("crm_contacts").update({ last_activity_at: (at ?? new Date()).toISOString() }).eq("id", contactId).select("id"));
  }
  return r.length > 0;
}

/** Lee el estado de la cuenta y deja la etapa del contacto al día. */
export async function syncStageForUser(db: Db, userId: string, contactId: string): Promise<void> {
  const ent = must(await db.from("entitlements").select("state, stripe_status").eq("user_id", userId).maybeSingle()) as { state: string; stripe_status: string | null } | null;
  const c = must(await db.from("crm_contacts").select("id, stage").eq("id", contactId).maybeSingle()) as { id: string; stage: Stage } | null;
  if (!c) return;
  await applyStage(db, c, stageFor({ hasUser: true, state: ent?.state ?? "free", stripeStatus: ent?.stripe_status ?? null }));
}

let systemTags: Map<Stage, string> | null = null;
async function systemTagId(db: Db, stage: Stage): Promise<string | null> {
  if (!systemTags) {
    const rows = must(await db.from("crm_tags").select("id, system_key").not("system_key", "is", null)) as { id: string; system_key: Stage }[];
    systemTags = new Map(rows.map((r) => [r.system_key, r.id]));
  }
  return systemTags.get(stage) ?? null;
}

/**
 * Cambia la etapa solo si es distinta (la condición en el UPDATE evita que dos procesos la cambien dos veces) y deja
 * los eventos "cambió de etapa" y "se le puso una etiqueta" (la etiqueta de sistema nueva), que pueden iniciar
 * automatizaciones.
 */
export async function applyStage(db: Db, c: { id: string; stage: Stage }, next: Stage): Promise<boolean> {
  if (c.stage === next) return false;
  const changed = must(await db.from("crm_contacts").update({ stage: next, updated_at: new Date().toISOString() }).eq("id", c.id).eq("stage", c.stage).select("id")) as { id: string }[];
  if (!changed.length) return false;
  const stamp = new Date().toISOString();
  await recordEvent(db, c.id, "stage_changed", `${next}:${stamp.replace(/[^0-9]/g, "").slice(0, 14)}`);
  const tag = await systemTagId(db, next);
  if (tag) await recordEvent(db, c.id, "tag_added", `${tag}:${stamp.slice(0, 10)}`);
  return true;
}

/** Pone una etiqueta propia (no de sistema) y deja el evento "se le puso una etiqueta". Devuelve true si es nueva. */
export async function addTag(db: Db, contactId: string, tagId: string, by: "admin" | "automation" | "ingest" | "import"): Promise<boolean> {
  const r = must(await db.from("crm_contact_tags").upsert({ contact_id: contactId, tag_id: tagId, added_by: by }, { onConflict: "contact_id,tag_id", ignoreDuplicates: true }).select("tag_id")) as unknown[];
  if (r.length) await recordEvent(db, contactId, "tag_added", `${tagId}:${new Date().toISOString().slice(0, 10)}`);
  return r.length > 0;
}

/** Quita una etiqueta propia. (Las de sistema no están en crm_contact_tags: salen de la etapa.) */
export async function removeTag(db: Db, contactId: string, tagId: string): Promise<void> {
  must(await db.from("crm_contact_tags").delete().eq("contact_id", contactId).eq("tag_id", tagId).select("tag_id"));
}
