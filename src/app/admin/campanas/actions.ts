"use server";
import { z } from "zod";
import { AUDIENCE_PRESETS, BlocksSchema } from "@/lib/crm/schema";
import { fail, ok } from "@/server/action";
import { cancelCampaign, confirmCampaign, countAudience, previewEmail, saveCampaign, sendTestEmail } from "@/server/crm";
import { adminAction, audit, type AdminSession } from "../_shared/server";
import { firstWord } from "../crm/lib";
import { crmTry } from "../crm/server";
import { M } from "./messages";

// Campañas de correo (AdminCampanas). Solo el Dueño (sección "crm"). El registro nunca guarda asunto ni contenido.
const PATHS = ["/admin/campanas", "/admin/actividad"];
const Preset = z.enum(Object.keys(AUDIENCE_PRESETS) as [keyof typeof AUDIENCE_PRESETS, ...(keyof typeof AUDIENCE_PRESETS)[]]);
const Content = z.object({ subject: z.string().max(200), preheader: z.string().max(200), blocks: z.array(z.unknown()).max(40) });

/** "612 personas · solo quienes aceptaron recibir correos". Solo lee. */
export async function audienceCount(preset: unknown) {
  return adminAction([], async (s) => {
    const p = Preset.safeParse(preset);
    if (!p.success) return fail(M[s.locale].errors.invalid);
    return crmTry(s, (db) => countAudience(db, AUDIENCE_PRESETS[p.data]), M[s.locale].errors);
  }, "crm");
}

/** Vista previa: el mismo correo que sale, con el pie legal real (HTML para un iframe sandbox). Solo lee. */
export async function previewContent(input: unknown) {
  return adminAction([], async (s) => {
    const p = Content.safeParse(input);
    const blocks = p.success ? BlocksSchema.safeParse(p.data.blocks) : null;
    if (!p.success || !blocks?.success) return fail(M[s.locale].errors.invalid);
    return crmTry(s, (db) => previewEmail(db, { subject: p.data.subject, preheader: p.data.preheader, blocks: blocks.data, locale: s.locale, name: firstWord(s.profile.name) || undefined }), M[s.locale].errors);
  }, "crm");
}

/** "Enviar prueba" a tu propio correo (el de tu cuenta). Fuera de producción solo sale a @revolucion360.test. */
export async function sendTest(input: unknown) {
  return adminAction(["/admin/actividad"], async (s) => {
    const p = Content.extend({ campaignId: z.string().uuid().nullable() }).safeParse(input);
    const blocks = p.success ? BlocksSchema.safeParse(p.data.blocks) : null;
    if (!p.success || !blocks?.success || !p.data.subject.trim() || !blocks.data.length) return fail(M[s.locale].errors.invalid);
    const r = await crmTry(s, (db) => sendTestEmail(db, { subject: p.data.subject, preheader: p.data.preheader, blocks: blocks.data, locale: s.locale, name: firstWord(s.profile.name) || undefined }, s.profile.email), M[s.locale].errors);
    if (r.ok) await audit(s, "crm_campana_prueba", null, { campaign: p.data.campaignId ?? undefined, result: r.data });
    return r.ok ? ok({ status: r.data, email: s.profile.email }) : r;
  }, "crm");
}

const Draft = z.object({
  id: z.string().uuid().nullable(),
  subject: z.string().max(200), preheader: z.string().max(200), preset: Preset,
  blocks: z.array(z.unknown()).max(40), sendMode: z.enum(["now", "local"]), scheduledLocal: z.string().max(16).nullable(),
});
async function save(s: AdminSession, input: unknown) {
  const p = Draft.safeParse(input);
  if (!p.success) return fail(M[s.locale].errors.invalid);
  const d = p.data;
  const r = await crmTry(s, (db) => saveCampaign(db, {
    ...(d.id ? { id: d.id } : {}), subject: d.subject, preheader: d.preheader, audience: AUDIENCE_PRESETS[d.preset], blocks: d.blocks,
    sendMode: d.sendMode, scheduledLocal: d.sendMode === "local" ? d.scheduledLocal || null : null,
  }), M[s.locale].errors);
  if (r.ok) await audit(s, "crm_campana_guardar", null, { campaign: r.data });
  return r;
}

/** "Guardar borrador". Devuelve el id (nuevo o el mismo). */
export async function saveDraft(input: unknown) {
  return adminAction(PATHS, (s) => save(s, input), "crm");
}

/**
 * "Confirmar envío" de un borrador ya guardado (la pantalla guarda primero con saveDraft y guarda el id, así un fallo
 * aquí nunca deja campañas repetidas). El motor exige asunto, contenido y los datos legales; "Programar" sale a esa hora
 * en la zona de cada persona. Devuelve a cuántas personas va hoy.
 */
export async function confirmSend(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const p = z.object({ id: z.string().uuid(), preset: Preset }).safeParse(input);
    if (!p.success) return fail(M[s.locale].errors.invalid);
    const r = await crmTry(s, async (db) => {
      await confirmCampaign(db, p.data.id);
      return countAudience(db, AUDIENCE_PRESETS[p.data.preset]);
    }, M[s.locale].errors);
    if (r.ok) await audit(s, "crm_campana_confirmar", null, { campaign: p.data.id, recipients: r.data });
    return r;
  }, "crm");
}

/** "Cancelar envío": programada → borrador; enviándose → cancelada (lo que falta ya no sale). */
export async function cancelSend(id: unknown) {
  return adminAction(PATHS, async (s) => {
    const p = z.string().uuid().safeParse(id);
    if (!p.success) return fail(M[s.locale].errors.invalid);
    const r = await crmTry(s, (db) => cancelCampaign(db, p.data), M[s.locale].errors);
    if (r.ok) await audit(s, "crm_campana_cancelar", null, { campaign: p.data });
    return r.ok ? ok(true) : r;
  }, "crm");
}
