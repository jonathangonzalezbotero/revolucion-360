import "server-only";
import { asLocale } from "@/i18n";
import type { ISODate } from "@/lib/engine";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl } from "./cron";
import { grantRef, mayEmail } from "./lib";
import { deliverOnce, isProduction } from "./send";
import { grantEmail } from "./templates";

// Correo "Tienes acceso completo" cuando un admin da acceso gratis y marca "Avisarles por correo".
// Los destinatarios llegan ya resueltos por el panel (`admin_emails`): aquí NO se leen perfiles.
// La clave de servicio solo se usa para reservar el envío en `email_log` (tabla sin políticas para usuarios),
// igual que los demás correos. Nunca lanza: un correo que falla no deshace el acceso dado.

export type GrantRecipient = { id: string; email: string; name: string; locale: string | null };
export type GrantMailResult = { sent: number; skipped: number; failed: number };

/**
 * Tope de envíos por acción: Resend admite ~2 por segundo y la acción del servidor no debe pasar de ~30 s.
 * Cuenta intentos reales (no los ya enviados hoy), así que repetir la acción sigue con los que faltaron.
 */
export const MAX_GRANT_EMAILS = 50;

export async function sendGrantEmails(list: GrantRecipient[], g: { kind: "alumno" | "fundador"; until: ISODate | null; day: ISODate }): Promise<GrantMailResult> {
  const out: GrantMailResult = { sent: 0, skipped: 0, failed: 0 };
  const allowed = list.filter((r) => mayEmail(r.email, isProduction()));
  out.skipped += list.length - allowed.length;
  if (!allowed.length) return out;
  let db: ReturnType<typeof createAdminClient>;
  try { db = createAdminClient(); } catch {
    console.error("[email] acceso gratis: sin cliente de servicio; no se envían correos");
    out.failed += allowed.length;
    return out;
  }
  const ref = grantRef(g.day, g.kind, g.until);
  for (const r of allowed) {
    if (out.sent + out.failed >= MAX_GRANT_EMAILS) { out.skipped++; continue; }
    try {
      const res = await deliverOnce(db, {
        userId: r.id, kind: "access_granted", ref, to: r.email,
        render: () => grantEmail({ locale: asLocale(r.locale), appUrl: appUrl(), name: r.name, kind: g.kind, until: g.until }),
      });
      if (res === "sent") out.sent++;
      else if (res === "failed") out.failed++;
      else out.skipped++; // sin clave, ya enviado hoy o dirección no permitida
      // Sin pausa fija: si Resend frena por velocidad, `sendEmail` espera y reintenta.
    } catch {
      console.error("[email] acceso gratis no enviado"); // sin datos personales
      out.failed++;
    }
  }
  return out;
}
