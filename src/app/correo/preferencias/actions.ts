"use server";
import { z } from "zod";
import { crmDb } from "@/server/crm";
import { contactByToken } from "@/server/crm/token";

/**
 * Guarda la elección desde el enlace de un correo. Página pública SIN sesión: no pasa por `run()` (no hay usuario);
 * la autoriza el token al azar del contacto (como la baja en un clic) y solo toca el consentimiento de esa fila.
 * Volver a activar un canal aquí es un alta explícita de la persona: levanta su baja anterior (nunca un rebote, una
 * queja ni un STOP: un STOP solo se levanta respondiendo START al número, como en Perfil). `suppressed` = no se pudo.
 */
export async function savePreferences(input: unknown): Promise<{ ok: boolean; suppressed?: boolean }> {
  const p = z.object({ t: z.string().max(80), channel: z.enum(["email", "sms"]), on: z.boolean() }).safeParse(input);
  if (!p.success) return { ok: false };
  try {
    const db = crmDb();
    const c = await contactByToken(db, p.data.t);
    if (!c || (p.data.channel === "sms" && !c.phone)) return { ok: false };
    const r = await db.rpc("crm_apply_consent", { p_contact: c.id, p_channel: p.data.channel, p_on: p.data.on, p_source: "preferencias", p_lift: true });
    if (r.error) return { ok: false };
    return r.data === "suppressed" ? { ok: false, suppressed: true } : { ok: true };
  } catch {
    console.error("[crm-preferencias] no se guardó"); // sin datos personales
    return { ok: false };
  }
}
