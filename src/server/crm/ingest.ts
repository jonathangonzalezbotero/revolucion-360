import "server-only";
import { formKey, isValidTz, toE164, type Ingest } from "@/lib/crm";
import { must, type Db } from "./db";
import { addTag, recordEvent } from "./events";

const stamp = () => new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);

/**
 * Lead de la web (webinar, diagnóstico o formulario). Une por correo: a un contacto existente solo le completa lo que
 * le falta (nunca le cambia el origen ni le quita un consentimiento). El consentimiento solo se marca si la persona
 * marcó la casilla en el formulario (queda con fuente `form:<origen>`). Deja "Llenó un formulario web" y, según el
 * origen, "Hizo el diagnóstico" o "Se registró en un webinar".
 */
export async function ingestLead(db: Db, d: Ingest): Promise<{ id: string; created: boolean }> {
  const phone = d.phone ? toE164(d.phone, d.country) : null;
  const tz = d.timezone && isValidTz(d.timezone) ? d.timezone : null;
  const existing = must(await db.from("crm_contacts").select("id, name, phone, country, timezone").eq("email", d.email).maybeSingle()) as
    { id: string; name: string; phone: string | null; country: string | null; timezone: string | null } | null;
  let id: string, created = false;
  if (existing) {
    id = existing.id;
    const patch: Record<string, unknown> = {};
    if (!existing.name && d.name) patch.name = d.name;
    if (!existing.phone && phone) patch.phone = phone;
    if (!existing.country && d.country) patch.country = d.country;
    if (!existing.timezone && tz) patch.timezone = tz;
    if (Object.keys(patch).length) must(await db.from("crm_contacts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("id"));
  } else {
    const r = await db.from("crm_contacts").insert({
      email: d.email, name: d.name, phone, country: d.country ?? null, timezone: tz, locale: d.locale ?? "es", source: d.source, source_detail: d.sourceDetail,
    }).select("id").single();
    if (r.error?.code === "23505") return ingestLead(db, d); // otro envío del mismo correo llegó a la vez
    id = (must(r) as { id: string }).id;
    created = true;
  }

  for (const name of [...new Set(d.tags)]) {
    const tag = must(await db.from("crm_tags").select("id, system_key").ilike("name", name).maybeSingle()) as { id: string; system_key: string | null } | null;
    let tagId = tag?.id ?? null;
    if (tag?.system_key) continue; // las etiquetas de sistema salen del estado de la cuenta
    if (!tagId) {
      const ins = await db.from("crm_tags").insert({ name }).select("id").maybeSingle();
      tagId = (ins.data as { id: string } | null)?.id ?? null;
    }
    if (tagId) await addTag(db, id, tagId, "ingest");
  }

  if (d.consent.email) must(await db.rpc("crm_apply_consent", { p_contact: id, p_channel: "email", p_on: true, p_source: `form:${d.source}` }));
  if (d.consent.sms) {
    const cur = must(await db.from("crm_contacts").select("phone").eq("id", id).single()) as { phone: string | null };
    if (cur.phone) must(await db.rpc("crm_apply_consent", { p_contact: id, p_channel: "sms", p_on: true, p_source: `form:${d.source}` }));
  }

  const form = formKey(d.form || d.sourceDetail || d.source) || d.source;
  await recordEvent(db, id, "web_form", `${form}:${stamp()}`);
  if (d.source === "diagnostico") await recordEvent(db, id, "diagnostic_done", `web:${stamp()}`);
  if (d.source === "webinar") await recordEvent(db, id, "webinar_registered", formKey(d.sourceDetail) || "webinar");
  return { id, created };
}
