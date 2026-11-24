import "server-only";
import { asLocale } from "@/i18n";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl } from "./cron";
import { allowsApp, paymentRef, readPrefs, safeToday } from "./lib";
import { M } from "./messages";
import { deliverOnce, notifyOnce } from "./send";
import { paymentEmail, welcomeEmail } from "./templates";

// Correos que salen en el momento en que pasa la acción. Nunca lanzan: un correo que falla no rompe
// la confirmación de la cuenta ni el aviso de Stripe. Si falla, la tarea diaria lo reintenta (email_log evita duplicados).

/** Bienvenida: al confirmar el correo (o al entrar por primera vez con Google/Apple). */
export async function sendWelcomeNow(userId: string): Promise<void> {
  try {
    const db = createAdminClient();
    const { data: p } = await db.from("profiles").select("id, email, name, locale, prefs, suspended_at").eq("id", userId).maybeSingle();
    if (!p || p.suspended_at || !p.email) return;
    const locale = asLocale(p.locale);
    await deliverOnce(db, { userId, kind: "welcome", ref: "welcome", to: p.email, render: () => welcomeEmail({ locale, appUrl: appUrl(), name: p.name }) });
    if (allowsApp(readPrefs(p.prefs))) {
      const t = M[locale].notif;
      await notifyOnce(db, { userId, kind: "sistema", title: t.welcomeTitle, body: t.welcomeBody, href: "/asistente", dedupe: "bienvenida" });
    }
  } catch {
    console.error("[email] bienvenida no enviada; la tarea diaria la reintenta");
  }
}

/** Pago fallido: cuando Stripe avisa que no pudo cobrar. Es un correo de la cuenta: no depende de las preferencias. */
export async function sendPaymentFailedNow(userId: string, failedAt: string): Promise<void> {
  try {
    const db = createAdminClient();
    const { data: p } = await db.from("profiles").select("id, email, locale, timezone, suspended_at").eq("id", userId).maybeSingle();
    if (!p || p.suspended_at || !p.email) return;
    await deliverOnce(db, {
      userId, kind: "payment_failed", ref: paymentRef(failedAt), to: p.email,
      render: () => paymentEmail({ locale: asLocale(p.locale), appUrl: appUrl(), failedOn: safeToday(p.timezone, new Date(failedAt)) }),
    });
  } catch {
    console.error("[email] pago fallido no enviado; la tarea diaria lo reintenta");
  }
}
