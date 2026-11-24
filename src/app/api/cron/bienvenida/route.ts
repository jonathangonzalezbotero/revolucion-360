import { asLocale } from "@/i18n";
import { appUrl, byIds, profileBatches, runCron } from "@/lib/email/cron";
import { allowsApp, readPrefs } from "@/lib/email/lib";
import { M } from "@/lib/email/messages";
import { deliverOnce, notifyOnce } from "@/lib/email/send";
import { welcomeEmail } from "@/lib/email/templates";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Solo cuentas creadas en los últimos 14 días: activar la clave de Resend más tarde no le escribe a cuentas viejas. */
const WINDOW_DAYS = 14;

/**
 * GET /api/cron/bienvenida (diario). RED DE SEGURIDAD: la bienvenida sale en el momento de confirmar la cuenta
 * (src/lib/email/events.ts). Esta tarea solo reintenta las que fallaron (Resend caído, clave no configurada aún).
 * Idempotente: email_log (user_id, kind, ref) es único y la notificación lleva dedupe.
 */
export async function GET(request: Request) {
  return runCron("bienvenida", request, async (db) => {
    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
    let checked = 0, sent = 0, skipped = 0, failed = 0, unconfirmed = 0, notified = 0;
    for await (const batch of profileBatches(db, { createdSince: since })) {
      checked += batch.length;
      const logged = new Set((await byIds<{ user_id: string }>(batch.map((p) => p.id), (ids) =>
        db.from("email_log").select("user_id").eq("kind", "welcome").in("user_id", ids).order("id"))).map((r) => r.user_id));
      for (const p of batch.filter((x) => !logged.has(x.id))) {
        const { data: u, error } = await db.auth.admin.getUserById(p.id);
        if (error || !u.user) { failed++; continue; }
        if (!u.user.email_confirmed_at || !u.user.email) { unconfirmed++; continue; }
        const locale = asLocale(p.locale);
        const res = await deliverOnce(db, {
          userId: p.id, kind: "welcome", ref: "welcome", to: u.user.email,
          render: () => welcomeEmail({ locale, appUrl: appUrl(), name: p.name }),
        });
        if (res === "sent") sent++; else if (res === "failed") failed++; else skipped++;
        if (allowsApp(readPrefs(p.prefs))) {
          const t = M[locale].notif;
          if (await notifyOnce(db, { userId: p.id, kind: "sistema", title: t.welcomeTitle, body: t.welcomeBody, href: "/asistente", dedupe: "bienvenida" })) notified++;
        }
      }
    }
    return { checked, sent, skipped, failed, unconfirmed, notified };
  });
}
