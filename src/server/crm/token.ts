import "server-only";
import { must, type Db } from "./db";

// Enlaces de los correos ("Darte de baja", "Elegir qué correos recibo"): un token al azar por contacto (crm_contacts.token).
// Sin sesión: se usa la clave de servicio, solo sobre la fila de ese token.

export const isToken = (t: unknown): t is string => typeof t === "string" && /^[a-f0-9]{64}$/.test(t);

export type TokenContact = { id: string; email: string; phone: string | null; locale: "es" | "en"; email_consent: boolean; sms_consent: boolean; email_unsubscribed_at: string | null };

export async function contactByToken(db: Db, token: unknown): Promise<TokenContact | null> {
  if (!isToken(token)) return null;
  return must(await db.from("crm_contacts").select("id, email, phone, locale, email_consent, sms_consent, email_unsubscribed_at").eq("token", token).maybeSingle()) as TokenContact | null;
}

/** Baja del correo de marketing por token. Idempotente: si ya estaba de baja, no deja otro evento. */
export async function unsubscribeByToken(db: Db, token: unknown, source: "baja_un_clic" | "preferencias"): Promise<boolean> {
  const c = await contactByToken(db, token);
  if (!c) return false;
  if (c.email_consent || !c.email_unsubscribed_at) must(await db.rpc("crm_apply_consent", { p_contact: c.id, p_channel: "email", p_on: false, p_source: source }));
  return true;
}

/** "d***@correo.com": en la página de preferencias no se muestra el correo completo a quien tenga el enlace. */
export const maskEmail = (email: string) => {
  const [user, domain] = email.split("@");
  return `${user.charAt(0)}${"*".repeat(Math.max(2, Math.min(6, user.length - 1)))}@${domain ?? ""}`;
};
