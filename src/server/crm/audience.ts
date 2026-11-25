import "server-only";
import { AudienceSchema, type Audience } from "@/lib/crm";
import { must, type Db } from "./db";

export type AudienceContact = { id: string; timezone: string | null; country: string | null };

// El público de una campaña lo calcula la base (crm_audience / crm_audience_count): SIEMPRE solo quien aceptó correos,
// no se dio de baja y no está suprimido, y cada persona una sola vez aunque tenga varias de las etiquetas elegidas
// (EXISTS, no un join). La supresión y el consentimiento se vuelven a revisar justo antes de enviar.

/** "612 personas · solo quienes aceptaron recibir correos". */
export async function countAudience(db: Db, audience: unknown): Promise<number> {
  const a = AudienceSchema.parse(audience ?? {});
  return Number(must(await db.rpc("crm_audience_count", { p_audience: a })) ?? 0);
}

/** Un lote del público, por id (seguro aunque entren contactos nuevos mientras se encola). */
export async function audienceBatch(db: Db, audience: Audience, after: string | null, limit: number): Promise<AudienceContact[]> {
  const rows = must(await db.rpc("crm_audience", { p_audience: audience, p_after: after, p_limit: limit })) as AudienceContact[];
  return rows.map((r) => ({ id: r.id, timezone: r.timezone, country: r.country }));
}
