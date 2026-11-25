import "server-only";
import { findTagByName, formKey, ingestSmsDecision, isValidTz, toE164, type Ingest } from "@/lib/crm";
import { must, type Db } from "./db";
import { addTag, recordEvent } from "./events";

const stamp = () => new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);

export type IngestResult = { id: string; email: "ok" | "suppressed" | null; sms: "ok" | "suppressed" | "no_phone" | "phone_conflict" | null };

/**
 * Lead de la web (webinar, diagnóstico o formulario). Une por correo: a un contacto existente solo le completa lo que
 * le falta (nunca le cambia el origen ni le quita un consentimiento). Sin doble confirmación (decisión de Jonathan): la
 * casilla marcada del formulario basta, y queda con fuente `form:<origen>` y su constancia (crm_consent_log).
 * - Nunca levanta una baja ni una supresión: si la dirección o el número están dados de baja, no marca nada ('suppressed').
 * - SMS: solo para el número que llegó en la petición y que queda en el contacto (`ingestSmsDecision`).
 * Deja "Llenó un formulario web" y, según el origen, "Hizo el diagnóstico" o "Se registró en un webinar".
 * El resultado es para el registro interno: la API no lo devuelve (no dice si el correo ya existía).
 */
export async function ingestLead(db: Db, d: Ingest): Promise<IngestResult> {
  const phone = d.phone ? toE164(d.phone, d.country) : null;
  const tz = d.timezone && isValidTz(d.timezone) ? d.timezone : null;
  const existing = must(await db.from("crm_contacts").select("id, name, phone, country, timezone").eq("email", d.email).maybeSingle()) as
    { id: string; name: string; phone: string | null; country: string | null; timezone: string | null } | null;
  const smsRule = ingestSmsDecision(phone, existing ? existing.phone : null);
  let id: string;
  if (existing) {
    id = existing.id;
    const patch: Record<string, unknown> = {};
    if (!existing.name && d.name) patch.name = d.name;
    if (smsRule.setPhone) patch.phone = smsRule.setPhone;
    if (!existing.country && d.country) patch.country = d.country;
    if (!existing.timezone && tz) patch.timezone = tz;
    if (Object.keys(patch).length) must(await db.from("crm_contacts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("id"));
  } else {
    const r = await db.from("crm_contacts").insert({
      email: d.email, name: d.name, phone, country: d.country ?? null, timezone: tz, locale: d.locale ?? "es", source: d.source, source_detail: d.sourceDetail,
    }).select("id").single();
    if (r.error?.code === "23505") return ingestLead(db, d); // otro envío del mismo correo llegó a la vez
    id = (must(r) as { id: string }).id;
  }

  if (d.tags.length) {
    const all = must(await db.from("crm_tags").select("id, name, system_key")) as { id: string; name: string; system_key: string | null }[];
    for (const name of [...new Set(d.tags)]) {
      const tag = findTagByName(all, name);
      if (tag?.system_key) continue; // las etiquetas de sistema salen del estado de la cuenta
      let tagId = tag?.id ?? null;
      if (!tagId) {
        const ins = await db.from("crm_tags").insert({ name }).select("id, name, system_key").maybeSingle();
        const row = ins.data as { id: string; name: string; system_key: string | null } | null;
        if (row) { all.push(row); tagId = row.id; }
      }
      if (tagId) await addTag(db, id, tagId, "ingest");
    }
  }

  const source = `form:${d.source}`;
  const evidence = { ...(d.evidence ?? {}), form: formKey(d.form || d.sourceDetail || d.source) || d.source };
  const res: IngestResult = { id, email: null, sms: null };
  if (d.consent.email) {
    res.email = must(await db.rpc("crm_apply_consent", { p_contact: id, p_channel: "email", p_on: true, p_source: source, p_lift: false, p_evidence: evidence })) as "ok" | "suppressed";
  }
  if (d.consent.sms) {
    res.sms = smsRule.sms
      ? must(await db.rpc("crm_apply_consent", { p_contact: id, p_channel: "sms", p_on: true, p_source: source, p_lift: false, p_evidence: evidence })) as "ok" | "suppressed"
      : smsRule.reason === "ok" ? null : smsRule.reason;
  }

  const form = formKey(d.form || d.sourceDetail || d.source) || d.source;
  await recordEvent(db, id, "web_form", `${form}:${stamp()}`);
  if (d.source === "diagnostico") await recordEvent(db, id, "diagnostic_done", `web:${stamp()}`);
  if (d.source === "webinar") await recordEvent(db, id, "webinar_registered", formKey(d.sourceDetail) || "webinar");
  return res;
}
