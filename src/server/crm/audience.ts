import "server-only";
import { AudienceSchema, type Audience } from "@/lib/crm";
import { must, type Db } from "./db";

export type AudienceContact = { id: string; timezone: string | null; country: string | null };

/**
 * Consulta base del público de una campaña: SIEMPRE solo quien aceptó correos y no se dio de baja
 * (la supresión y el consentimiento se vuelven a revisar justo antes de enviar).
 */
function base(db: Db, a: Audience, select: string, opts?: { count: "exact"; head: true }) {
  const cols = a.tagIds.length ? `${select}, crm_contact_tags!inner(tag_id)` : select;
  let q = db.from("crm_contacts").select(cols, opts).eq("email_consent", true).is("email_unsubscribed_at", null);
  if (a.stages.length) q = q.in("stage", a.stages);
  if (a.noAccount) q = q.is("user_id", null);
  if (a.tagIds.length) q = q.in("crm_contact_tags.tag_id", a.tagIds);
  return q;
}

/** "612 personas · solo quienes aceptaron recibir correos". */
export async function countAudience(db: Db, audience: unknown): Promise<number> {
  const a = AudienceSchema.parse(audience ?? {});
  const r = await base(db, a, "id", { count: "exact", head: true });
  if (r.error) throw new Error(`db: ${r.error.message}`);
  return r.count ?? 0;
}

/** Un lote del público, por id (seguro aunque entren contactos nuevos mientras se encola). */
export async function audienceBatch(db: Db, audience: Audience, after: string | null, limit: number): Promise<AudienceContact[]> {
  let q = base(db, audience, "id, timezone, country");
  if (after) q = q.gt("id", after);
  const rows = must(await q.order("id").limit(limit)) as unknown as AudienceContact[];
  return rows.map((r) => ({ id: r.id, timezone: r.timezone, country: r.country }));
}
