import "server-only";
import { z } from "zod";
import {
  AudienceSchema, BlocksSchema, campaignStartsAt, cleanRef, ExitRulesSchema, findTagByName, legalReady, renderMarketingEmail, StepsSchema, tagRefs, toE164, TriggerSchema,
  type Audience, type Block, type ExitRules, type Stage, type Step, type Trigger,
} from "@/lib/crm";
import { sendEmailDetailed } from "@/lib/email/send";
import { appUrl, CONTACT_ADMIN_COLS, crmFrom, crmReplyTo, fromLabel, loadLegal, must, type AutomationRow, type CampaignRow, type ContactRow, type Db } from "./db";
import { addTag, recordEvent, removeTag } from "./events";

// Funciones de servidor para las pantallas del panel (Contactos, Campañas de correo, Automatizaciones).
// Reciben el cliente de Supabase de la SESIÓN del Dueño (`untypedDb(s.supabase)`): la base impone que solo el Dueño
// lea y escriba crm_* (RLS con is_admin_owner()). Validan con zod y lanzan Error con un código corto si algo no cuadra
// ("invalid", "not_found", "legal_incomplete"…): la acción de la pantalla lo traduce a un texto.

const fail = (code: string): never => { throw new Error(code); };

// ───────── Contactos ─────────
export type Summary = { contacts: number; newWeek: number; leadsNoAccount: number; marketingPct: number; unsubscribed30d: number };
export async function getSummary(db: Db): Promise<Summary> {
  const r = must(await db.rpc("crm_summary")) as Record<string, number>;
  return { contacts: r.contacts, newWeek: r.new_week, leadsNoAccount: r.leads_no_account, marketingPct: r.marketing_pct, unsubscribed30d: r.unsubscribed_30d };
}

export type TagRow = { id: string; name: string; system_key: Stage | null };
export async function listTags(db: Db): Promise<TagRow[]> {
  return must(await db.from("crm_tags").select("id, name, system_key").order("system_key", { nullsFirst: false }).order("name")) as TagRow[];
}
export async function createTag(db: Db, name: string): Promise<string> {
  const n = z.string().trim().min(1).max(40).safeParse(name);
  if (!n.success) fail("invalid");
  const r = await db.from("crm_tags").insert({ name: n.data }).select("id").maybeSingle();
  if (r.data) return (r.data as { id: string }).id;
  if (r.error && r.error.code !== "23505") throw new Error(`db: ${r.error.message}`); // 23505: ya existe (sin importar mayúsculas)
  // Sin ilike: un nombre con "%", "_" o "*" no debe coincidir con otra etiqueta.
  const found = findTagByName(must(await db.from("crm_tags").select("id, name")) as { id: string; name: string }[], n.data!);
  return found?.id ?? fail("invalid");
}

export type ContactListItem = Pick<ContactRow, "id" | "email" | "name" | "source" | "source_detail" | "stage" | "user_id" | "email_consent" | "last_activity_at" | "created_at"> & { tagIds: string[] };
/** Lista con búsqueda (nombre o correo), filtro por etapa (Todos, Lead, Primer mes…) o por etiqueta propia. */
export async function listContacts(db: Db, f: { q?: string; stage?: Stage | null; tagId?: string | null; limit?: number; offset?: number } = {}): Promise<{ rows: ContactListItem[]; total: number }> {
  const limit = Math.min(200, Math.max(1, f.limit ?? 50)), offset = Math.max(0, f.offset ?? 0);
  const cols = "id, email, name, source, source_detail, stage, user_id, email_consent, last_activity_at, created_at, crm_contact_tags(tag_id)";
  let q = db.from("crm_contacts").select(f.tagId ? cols.replace("crm_contact_tags(tag_id)", "crm_contact_tags!inner(tag_id)") : cols, { count: "exact" });
  const term = (f.q ?? "").trim().replace(/[%,()*]/g, " ").slice(0, 80);
  if (term) q = q.or(`name.ilike.%${term}%,email.ilike.%${term}%`);
  if (f.stage) q = q.eq("stage", f.stage);
  if (f.tagId) q = q.eq("crm_contact_tags.tag_id", f.tagId);
  const r = await q.order("last_activity_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (r.error) throw new Error(`db: ${r.error.message}`);
  const rows = (r.data as unknown as (ContactListItem & { crm_contact_tags: { tag_id: string }[] })[]).map(({ crm_contact_tags, ...c }) => ({ ...c, tagIds: crm_contact_tags.map((t) => t.tag_id) }));
  return { rows, total: r.count ?? rows.length };
}

/** El contacto como lo ve el panel: SIN `token` (el enlace de baja y preferencias nunca viaja al navegador). */
export type ContactAdminRow = Omit<ContactRow, "token">;
export type ContactDetail = { contact: ContactAdminRow; tagIds: string[]; events: { kind: string; ref: string; at: string }[]; enrollments: { id: string; automation_id: string; status: string; enrolled_at: string }[] };
/** Ficha del contacto: datos, etiquetas propias (la de sistema es `contact.stage`), actividad (últimos 50) e inscripciones. */
export async function getContact(db: Db, id: string): Promise<ContactDetail> {
  const contact = must(await db.from("crm_contacts").select(CONTACT_ADMIN_COLS).eq("id", id).maybeSingle()) as ContactAdminRow | null;
  if (!contact) fail("not_found");
  const [tags, events, enrollments] = await Promise.all([
    db.from("crm_contact_tags").select("tag_id").eq("contact_id", id),
    db.from("crm_events").select("kind, ref, at").eq("contact_id", id).order("at", { ascending: false }).limit(50),
    db.from("crm_enrollments").select("id, automation_id, status, enrolled_at").eq("contact_id", id).order("enrolled_at", { ascending: false }).limit(20),
  ]);
  return { contact: contact!, tagIds: (must(tags) as { tag_id: string }[]).map((t) => t.tag_id), events: must(events) as ContactDetail["events"], enrollments: must(enrollments) as ContactDetail["enrollments"] };
}

export const ContactInput = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().max(120).default(""),
  phone: z.string().trim().max(30).optional(),
  country: z.string().trim().toUpperCase().max(8).optional(),
  timezone: z.string().trim().max(64).optional(),
  locale: z.enum(["es", "en"]).default("es"),
  tagIds: z.array(z.string().uuid()).max(20).default([]),
});
/** "+ Contacto": crea un contacto a mano (sin consentimiento: se marca aparte, con su fuente). Devuelve su id. */
export async function createContact(db: Db, input: unknown): Promise<string> {
  const p = ContactInput.safeParse(input);
  if (!p.success) fail("invalid");
  const d = p.data!;
  const phone = d.phone ? toE164(d.phone, d.country) ?? fail("phone") : null;
  const r = await db.from("crm_contacts").insert({ email: d.email, name: d.name, phone, country: d.country ?? null, timezone: d.timezone ?? null, locale: d.locale, source: "manual" }).select("id").single();
  if (r.error) fail(r.error.code === "23505" ? "exists" : `db: ${r.error.message}`);
  const id = (r.data as { id: string }).id;
  await recordEvent(db, id, "created_manually", "");
  for (const t of d.tagIds) await addTag(db, id, t, "admin");
  return id;
}

/**
 * Importar CSV (filas ya leídas). Une por correo; nunca marca consentimiento salvo `consentSource` (constancia de dónde lo
 * dieron). Una dirección dada de baja, que rebotó o se quejó (supresión activa, exista o no el contacto) o un contacto que
 * se dio de baja NO vuelve a quedar suscrito por una importación (volver a aceptar es algo que hace la persona): la base
 * devuelve 'suppressed' y cuenta en `consentSkipped`.
 */
export async function importContacts(db: Db, rows: unknown[], opts: { tagIds?: string[]; consentSource?: string } = {}): Promise<{ created: number; updated: number; invalid: number; consentSkipped: number }> {
  let created = 0, updated = 0, invalid = 0, consentSkipped = 0;
  for (const raw of rows.slice(0, 5000)) {
    const p = ContactInput.safeParse(raw);
    if (!p.success) { invalid++; continue; }
    const d = p.data;
    const phone = d.phone ? toE164(d.phone, d.country) : null;
    const existing = must(await db.from("crm_contacts").select("id, name, phone").eq("email", d.email).maybeSingle()) as { id: string; name: string; phone: string | null } | null;
    let id: string;
    if (existing) {
      const patch: Record<string, unknown> = {};
      if (!existing.name && d.name) patch.name = d.name;
      if (!existing.phone && phone) patch.phone = phone;
      if (Object.keys(patch).length) must(await db.from("crm_contacts").update(patch).eq("id", existing.id).select("id"));
      id = existing.id;
      updated++;
    } else {
      const r = must(await db.from("crm_contacts").insert({ email: d.email, name: d.name, phone, country: d.country ?? null, timezone: d.timezone ?? null, locale: d.locale, source: "importado" }).select("id").single()) as { id: string };
      id = r.id;
      await recordEvent(db, id, "imported", "");
      created++;
    }
    for (const t of [...d.tagIds, ...(opts.tagIds ?? [])]) await addTag(db, id, t, "import");
    if (opts.consentSource) {
      const res = must(await db.rpc("crm_set_consent", {
        p_contact: id, p_channel: "email", p_on: true, p_source: `import:${cleanRef(opts.consentSource)}`.slice(0, 60), p_evidence: { text: opts.consentSource.slice(0, 500), form: "import" },
      })) as string;
      if (res === "suppressed") consentSkipped++;
    }
  }
  return { created, updated, invalid, consentSkipped };
}

export async function addContactTag(db: Db, contactId: string, tagId: string) { await addTag(db, contactId, tagId, "admin"); }
export async function removeContactTag(db: Db, contactId: string, tagId: string) { await removeTag(db, contactId, tagId); }

/**
 * Consentimiento desde el panel (queda con fuente 'admin', su evento y su constancia). Dar de baja siempre se puede; un
 * alta desde aquí nunca levanta una baja ni una supresión (lanza "suppressed").
 */
export async function setContactConsent(db: Db, contactId: string, channel: "email" | "sms", on: boolean): Promise<void> {
  const res = must(await db.rpc("crm_set_consent", { p_contact: contactId, p_channel: channel, p_on: on, p_source: "admin" })) as string;
  if (res === "suppressed") fail("suppressed");
}

/** "Agregar a automatización": inscribe a mano (empieza en el primer paso en la próxima corrida del motor). */
export async function enrollContact(db: Db, contactId: string, automationId: string): Promise<boolean> {
  const a = must(await db.from("crm_automations").select("*").eq("id", automationId).maybeSingle()) as AutomationRow | null;
  const steps = a ? StepsSchema.safeParse(a.steps) : null;
  if (!a || !steps?.success || !steps.data.length) fail("not_found");
  const r = await db.from("crm_enrollments").insert({
    automation_id: automationId, contact_id: contactId, trigger_ref: `manual:${Date.now()}`, current_step_id: steps!.data![0].id, next_at: new Date().toISOString(),
  }).select("id");
  if (r.error) { if (r.error.code === "23505") return false; throw new Error(`db: ${r.error.message}`); }
  return true;
}

// ───────── Campañas ─────────
export const CampaignInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().max(120).default(""),
  subject: z.string().trim().max(200).default(""),
  preheader: z.string().trim().max(200).default(""),
  audience: AudienceSchema.default({ stages: [], tagIds: [], noAccount: false }),
  blocks: BlocksSchema.default([]),
  sendMode: z.enum(["now", "local"]).default("now"),
  scheduledLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).nullable().default(null),
});
export type CampaignDraft = z.infer<typeof CampaignInput>;

/** Guarda un borrador (o edita uno programado que aún no empezó: vuelve a borrador). Devuelve su id. */
export async function saveCampaign(db: Db, input: unknown): Promise<string> {
  const p = CampaignInput.safeParse(input);
  if (!p.success) fail("invalid");
  const d = p.data!;
  const row = { name: d.name || d.subject, subject: d.subject, preheader: d.preheader, audience: d.audience, blocks: d.blocks, send_mode: d.sendMode, scheduled_local: d.sendMode === "local" ? d.scheduledLocal : null, updated_at: new Date().toISOString() };
  if (d.id) {
    const r = must(await db.from("crm_campaigns").update({ ...row, status: "draft", scheduled_at: null }).eq("id", d.id).in("status", ["draft", "scheduled"]).select("id")) as unknown[];
    if (!r.length) fail("not_editable");
    return d.id;
  }
  return (must(await db.from("crm_campaigns").insert(row).select("id").single()) as { id: string }).id;
}

/**
 * "Confirmar envío": exige asunto, contenido y los datos legales del pie (Contenido por país). "Enviar ahora" sale en la
 * próxima corrida del motor (máx. 10 minutos); "Programar" sale a esa hora en la zona de cada persona.
 */
export async function confirmCampaign(db: Db, id: string, now: Date = new Date()): Promise<void> {
  const c = must(await db.from("crm_campaigns").select("*").eq("id", id).maybeSingle()) as CampaignRow | null;
  if (!c || c.status !== "draft") fail("not_editable");
  if (!c!.subject.trim() || !BlocksSchema.safeParse(c!.blocks).success || !(c!.blocks as unknown[]).length) fail("invalid");
  if (!legalReady(await loadLegal(db))) fail("legal_incomplete");
  let at = now;
  if (c!.send_mode === "local") {
    if (!c!.scheduled_local) fail("invalid");
    at = campaignStartsAt(c!.scheduled_local!);
    if (new Date(at.getTime() + 26 * 3_600_000) < now) fail("in_the_past"); // la última zona del mundo ya pasó esa hora
  }
  must(await db.from("crm_campaigns").update({ status: "scheduled", scheduled_at: at.toISOString(), updated_at: now.toISOString() }).eq("id", id).eq("status", "draft").select("id"));
}

/** Cancelar: programada → borrador; enviándose → cancelada (lo que falta en la cola ya no sale). */
export async function cancelCampaign(db: Db, id: string): Promise<void> {
  const back = must(await db.from("crm_campaigns").update({ status: "draft", scheduled_at: null }).eq("id", id).eq("status", "scheduled").select("id")) as unknown[];
  if (back.length) return;
  must(await db.from("crm_campaigns").update({ status: "cancelled" }).eq("id", id).eq("status", "sending").select("id"));
  must(await db.from("crm_messages").update({ status: "skipped", error: "cancelled" }).eq("campaign_id", id).eq("status", "queued").select("id"));
}

/**
 * "Enviar un correo" desde la ficha del contacto: una campaña de una sola persona (queda en la lista de campañas con
 * sus conteos). Sale en la próxima corrida del motor y, como todo marketing, solo si la persona aceptó correos.
 */
export async function sendToContact(db: Db, contactId: string, input: unknown): Promise<string> {
  const p = CampaignInput.safeParse(input);
  if (!p.success || !p.data.subject || !p.data.blocks.length) fail("invalid");
  if (!legalReady(await loadLegal(db))) fail("legal_incomplete");
  const d = p.data!;
  const now = new Date().toISOString();
  const c = must(await db.from("crm_campaigns").insert({
    name: d.name || d.subject, subject: d.subject, preheader: d.preheader, blocks: d.blocks, audience: { stages: [], tagIds: [], noAccount: false },
    status: "sending", send_mode: "now", scheduled_at: now, enqueued_at: now, recipients_count: 1,
  }).select("id").single()) as { id: string };
  must(await db.from("crm_messages").insert({ contact_id: contactId, channel: "email", source_key: `campaign:${c.id}`, campaign_id: c.id, scheduled_for: now }).select("id"));
  return c.id;
}

export type CampaignListItem = Pick<CampaignRow, "id" | "name" | "subject" | "status" | "send_mode" | "scheduled_local" | "scheduled_at" | "sent_at" | "audience" | "recipients_count" | "sent_count" | "opened_count" | "clicked_count" | "created_at" | "updated_at">;
/** "Tus campañas": las más recientes primero (máx. 200). Sin los bloques (se leen con getCampaign al abrir una). */
export async function listCampaigns(db: Db, limit = 100): Promise<CampaignListItem[]> {
  const cols = "id, name, subject, status, send_mode, scheduled_local, scheduled_at, sent_at, audience, recipients_count, sent_count, opened_count, clicked_count, created_at, updated_at";
  return must(await db.from("crm_campaigns").select(cols).order("created_at", { ascending: false }).limit(Math.min(200, Math.max(1, limit)))) as CampaignListItem[];
}

/** Una campaña completa para el editor (null si no existe). */
export async function getCampaign(db: Db, id: string): Promise<CampaignRow | null> {
  return must(await db.from("crm_campaigns").select("*").eq("id", id).maybeSingle()) as CampaignRow | null;
}

/** % que abrió e hizo clic (sobre enviados). null si aún no se envía. */
export const campaignRates = (c: Pick<CampaignRow, "sent_count" | "opened_count" | "clicked_count">) =>
  c.sent_count > 0 ? { opened: c.opened_count / c.sent_count, clicked: c.clicked_count / c.sent_count } : null;

// ───────── Vista previa y prueba ─────────
export type PreviewInput = { subject: string; preheader: string; blocks: Block[]; locale?: "es" | "en"; name?: string };
/** Vista previa renderizada (HTML para un iframe `srcDoc`): el mismo correo que sale, con el pie legal real. */
export async function previewEmail(db: Db, input: PreviewInput): Promise<{ from: string; subject: string; preheader: string; html: string; legalReady: boolean }> {
  const blocks = BlocksSchema.parse(input.blocks);
  const legal = await loadLegal(db);
  const r = renderMarketingEmail({ subject: input.subject, preheader: input.preheader, blocks, locale: input.locale ?? "es", appUrl: appUrl(), name: input.name ?? null, legal, token: null, fromLabel: fromLabel() });
  return { from: fromLabel(), subject: r.subject, preheader: r.preheader, html: r.html, legalReady: legalReady(legal) };
}

/**
 * "Enviar prueba" a un correo dado (no pasa por la cola ni pide consentimiento: es para quien diseña la campaña).
 * Misma regla de seguridad que todos los correos: fuera de producción solo sale a @revolucion360.test.
 */
export async function sendTestEmail(db: Db, input: PreviewInput, to: string): Promise<"sent" | "skipped" | "failed"> {
  const addr = z.string().trim().toLowerCase().email().safeParse(to);
  if (!addr.success) fail("invalid");
  const blocks = BlocksSchema.parse(input.blocks);
  const legal = await loadLegal(db);
  const r = renderMarketingEmail({ subject: input.subject, preheader: input.preheader, blocks, locale: input.locale ?? "es", appUrl: appUrl(), name: input.name ?? null, legal, token: null, fromLabel: fromLabel() });
  const prefix = (input.locale ?? "es") === "en" ? "[Test] " : "[Prueba] ";
  return (await sendEmailDetailed(addr.data!, { ...r, subject: prefix + r.subject }, "crm_test", { from: crmFrom(), replyTo: crmReplyTo() })).status;
}

// ───────── Automatizaciones ─────────
export const AutomationInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  trigger: TriggerSchema,
  steps: StepsSchema,
  exitRules: ExitRulesSchema.default({ onUnsubscribe: true, onCancel: true, goal: null }),
});
export type AutomationDraft = { id?: string; name: string; trigger: Trigger; steps: Step[]; exitRules: ExitRules };

/** Guarda (las inscripciones activas siguen; si un paso donde estaban ya no existe, salen con motivo "deleted_step"). */
export async function saveAutomation(db: Db, input: unknown): Promise<string> {
  const p = AutomationInput.safeParse(input);
  if (!p.success) fail("invalid");
  const d = p.data!;
  // "Etiquetar" y "¿Tiene la etiqueta?" solo con etiquetas propias que existan (las de sistema salen de la etapa).
  const refs = tagRefs(d.trigger, d.steps);
  const ids = [...new Set([...refs.own, ...refs.any])];
  if (ids.length) {
    const tags = new Map((must(await db.from("crm_tags").select("id, system_key").in("id", ids)) as { id: string; system_key: string | null }[]).map((t) => [t.id, t]));
    if (ids.some((id) => !tags.has(id)) || refs.own.some((id) => tags.get(id)?.system_key)) fail("invalid_tag");
  }
  const row = { name: d.name, trigger: d.trigger, steps: d.steps, exit_rules: d.exitRules, updated_at: new Date().toISOString() };
  if (d.id) {
    const r = must(await db.from("crm_automations").update(row).eq("id", d.id).select("id")) as unknown[];
    if (!r.length) fail("not_found");
    return d.id;
  }
  return (must(await db.from("crm_automations").insert(row).select("id").single()) as { id: string }).id;
}

/**
 * Activar / Pausar. Pausada: no inscribe a nadie ni avanza pasos, y lo que ya estaba en la cola se omite para siempre
 * (`automation_inactive`). Al reactivarla, cada quien sigue desde el paso donde estaba; los mensajes omitidos no se reenvían.
 */
export async function setAutomationStatus(db: Db, id: string, status: "active" | "paused" | "draft"): Promise<void> {
  if (status === "active") {
    const a = must(await db.from("crm_automations").select("*").eq("id", id).maybeSingle()) as AutomationRow | null;
    if (!a || !TriggerSchema.safeParse(a.trigger).success || !StepsSchema.safeParse(a.steps).success || !(a.steps as unknown[]).length) fail("invalid");
  }
  must(await db.from("crm_automations").update({ status, updated_at: new Date().toISOString() }).eq("id", id).select("id"));
}

export type AutomationListItem = AutomationRow & { activeCount: number };
/** Lista con "N dentro" (inscripciones activas). */
export async function listAutomations(db: Db): Promise<AutomationListItem[]> {
  const [rows, counts] = await Promise.all([db.from("crm_automations").select("*").order("created_at"), db.rpc("crm_automation_counts")]);
  const by = new Map((must(counts) as { automation_id: string; active: number }[]).map((c) => [c.automation_id, Number(c.active)]));
  return (must(rows) as AutomationRow[]).map((a) => ({ ...a, activeCount: by.get(a.id) ?? 0 }));
}

export type { Audience };
