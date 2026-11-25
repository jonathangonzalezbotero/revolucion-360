"use server";
import { z } from "zod";
import { fail, ok } from "@/server/action";
import { addContactTag, createContact, createTag, enrollContact, importContacts, listTags, removeContactTag, sendToContact, setContactConsent } from "@/server/crm";
import { adminAction, audit } from "../_shared/server";
import { quickEmailBlocks, splitImport, tagKey } from "./lib";
import { M } from "./messages";
import { crmTry } from "./server";

// Contactos (AdminCRM). Toda acción: Dueño (sección "crm") + registro de actividad sin datos personales ni contenido.
const PATHS = ["/admin/crm", "/admin/actividad"];
const Id = z.string().uuid();

/** "+ Contacto". Entra sin consentimiento de marketing. */
export async function addContact(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const p = z.object({ email: z.string().max(254), name: z.string().max(120), phone: z.string().max(30), country: z.string().max(2) }).safeParse(input);
    if (!p.success) return fail(M[s.locale].errors.invalid);
    const d = p.data;
    const r = await crmTry(s, (db) => createContact(db, { email: d.email, name: d.name, phone: d.phone.trim() || undefined, country: d.country.trim() || undefined, locale: s.locale }));
    if (r.ok) await audit(s, "crm_contacto_crear", null, { contact: r.data });
    return r;
  }, "crm");
}

const ImportRowIn = z.object({
  email: z.string().max(254), name: z.string().max(120), phone: z.string().max(30), country: z.string().max(2),
  tags: z.array(z.string().max(40)).max(10), consent: z.boolean(),
});
/**
 * "Importar CSV" (una tanda de filas ya leídas en el navegador). Las filas con consentimiento entran con la constancia
 * escrita; sin constancia, ninguna queda aceptando marketing. Las etiquetas se crean si no existen (nunca las de sistema).
 */
export async function importBatch(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const m = M[s.locale];
    const p = z.object({ rows: z.array(ImportRowIn).min(1).max(200), proof: z.string().max(120) }).safeParse(input);
    if (!p.success) return fail(m.errors.invalid);
    const proof = p.data.proof.trim();
    const r = await crmTry(s, async (db) => {
      const tags = await listTags(db);
      const { withConsent, without, tagNames } = splitImport(p.data.rows, tags.filter((t) => t.system_key).map((t) => t.name));
      const ids = new Map(tags.filter((t) => !t.system_key).map((t) => [tagKey(t.name), t.id]));
      for (const name of tagNames) if (!ids.has(tagKey(name))) ids.set(tagKey(name), await createTag(db, name));
      const toInput = (r: (typeof withConsent)[number]) => ({
        email: r.email, name: r.name, phone: r.phone.trim() || undefined, country: r.country.trim() || undefined, locale: s.locale,
        tagIds: r.tags.map((t) => ids.get(tagKey(t))).filter((x): x is string => !!x),
      });
      const a = proof ? await importContacts(db, withConsent.map(toInput), { consentSource: proof }) : { created: 0, updated: 0, invalid: 0, consentSkipped: 0 };
      const b = await importContacts(db, (proof ? without : [...withConsent, ...without]).map(toInput));
      return { created: a.created + b.created, updated: a.updated + b.updated, invalid: a.invalid + b.invalid, consentSkipped: a.consentSkipped, consented: proof ? withConsent.length - a.consentSkipped - a.invalid : 0 };
    });
    if (r.ok) await audit(s, "crm_importar", null, { rows: p.data.rows.length, created: r.data.created, updated: r.data.updated, consented: r.data.consented });
    return r;
  }, "crm");
}

/** "+ Etiqueta": pone una etiqueta propia que ya existe o crea una nueva con ese nombre. */
export async function tagContact(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const p = z.object({ contactId: Id, tagId: Id.nullable(), name: z.string().max(40) }).safeParse(input);
    if (!p.success || (!p.data.tagId && !p.data.name.trim())) return fail(M[s.locale].errors.invalid);
    const { contactId, tagId, name } = p.data;
    const r = await crmTry(s, async (db) => {
      const tags = await listTags(db);
      const id = tagId ?? await createTag(db, name);
      if (tags.find((t) => t.id === id)?.system_key) throw new Error("invalid_tag"); // las de sistema salen de la etapa
      await addContactTag(db, contactId, id);
      return { tagId: id, created: !tagId && !tags.some((t) => t.id === id) };
    });
    if (r.ok) {
      if (r.data.created) await audit(s, "crm_etiqueta_crear", null, { tag: r.data.tagId });
      await audit(s, "crm_etiqueta_poner", null, { contact: contactId, tag: r.data.tagId });
    }
    return r;
  }, "crm");
}

export async function untagContact(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const p = z.object({ contactId: Id, tagId: Id }).safeParse(input);
    if (!p.success) return fail(M[s.locale].errors.invalid);
    const r = await crmTry(s, (db) => removeContactTag(db, p.data.contactId, p.data.tagId));
    if (r.ok) await audit(s, "crm_etiqueta_quitar", null, { contact: p.data.contactId, tag: p.data.tagId });
    return r;
  }, "crm");
}

/** "Darle de baja de los correos". Dar de alta no se hace aquí: lo decide la persona. */
export async function unsubscribeContact(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const p = z.object({ contactId: Id }).safeParse(input);
    if (!p.success) return fail(M[s.locale].errors.invalid);
    const r = await crmTry(s, (db) => setContactConsent(db, p.data.contactId, "email", false));
    if (r.ok) await audit(s, "crm_baja", null, { contact: p.data.contactId });
    return r;
  }, "crm");
}

/** "Agregar a automatización". Devuelve false si ya estaba dentro. */
export async function enrollInAutomation(input: unknown) {
  return adminAction([...PATHS, "/admin/automatizaciones"], async (s) => {
    const p = z.object({ contactId: Id, automationId: Id }).safeParse(input);
    if (!p.success) return fail(M[s.locale].errors.invalid);
    const r = await crmTry(s, (db) => enrollContact(db, p.data.contactId, p.data.automationId));
    if (r.ok && r.data) await audit(s, "crm_inscribir", null, { contact: p.data.contactId, automation: p.data.automationId });
    return r;
  }, "crm");
}

const QuickEmail = z.object({ subject: z.string().trim().min(1).max(200), heading: z.string().max(200), text: z.string().trim().min(1).max(5000), signature: z.string().max(120) });

/** "Enviar un correo": campaña de una sola persona que sale en la próxima corrida (solo si sigue aceptando correos). */
export async function emailContact(input: unknown) {
  return adminAction([...PATHS, "/admin/campanas"], async (s) => {
    const p = QuickEmail.extend({ contactId: Id }).safeParse(input);
    if (!p.success) return fail(M[s.locale].errors.invalid);
    const { contactId, subject } = p.data;
    const r = await crmTry(s, (db) => sendToContact(db, contactId, { subject, preheader: "", blocks: quickEmailBlocks(p.data) }));
    if (r.ok) await audit(s, "crm_correo_contacto", null, { contact: contactId, campaign: r.data }); // nunca el asunto ni el texto
    return r.ok ? ok(true) : r;
  }, "crm");
}
