import "server-only";
import { asLocale } from "@/i18n";
import { fill } from "@/i18n";
import { daysLeft, formatDate } from "@/lib/engine";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBilling } from "@/lib/stripe";
import { usdShort } from "@/app/(app)/suscripcion/lib";
import { appUrl } from "./cron";
import { allowsApp, firstMonthRef, paymentRef, readPrefs, safeToday } from "./lib";
import { M } from "./messages";
import { deliverOnce, notifyOnce } from "./send";
import { firstMonthEmail, paymentEmail, welcomeEmail } from "./templates";

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

/**
 * 5 · Fin del primer mes: Stripe manda `customer.subscription.trial_will_end` 3 días antes de que termine la prueba
 * (el primer mes a $1). Correo de la cuenta (avisa un cobro): no depende de las preferencias, solo de
 * `app_config.billing.notify_first_charge`. Una sola vez por suscripción y fin de prueba (email_log).
 * `priceCents`: lo que Stripe cobrará ese día (centavos de USD). Nunca lanza.
 */
export async function sendFirstMonthEndingNow(userId: string, a: { subId: string; trialEnd: number; priceCents: number; last4: string | null }): Promise<void> {
  try {
    const db = createAdminClient();
    const billing = await loadBilling(db);
    if (!billing.notifyFirstCharge) return;
    const { data: p } = await db.from("profiles").select("id, email, name, locale, timezone, prefs, suspended_at").eq("id", userId).maybeSingle();
    if (!p || p.suspended_at || !p.email) return;
    const locale = asLocale(p.locale);
    const end = new Date(a.trialEnd * 1000);
    const chargeOn = safeToday(p.timezone, end);
    const price = usdShort(a.priceCents);
    const ref = firstMonthRef(a.subId, a.trialEnd);
    await deliverOnce(db, {
      userId, kind: "first_month_ending", ref, to: p.email,
      render: () => firstMonthEmail({
        locale, appUrl: appUrl(), name: p.name, chargeOn, daysLeft: Math.max(1, daysLeft(end.toISOString()) ?? 1),
        price, yearly: usdShort(billing.yearlyCents), last4: a.last4,
      }),
    });
    if (allowsApp(readPrefs(p.prefs))) {
      const t = M[locale].notif;
      await notifyOnce(db, {
        userId, kind: "pago", title: fill(t.firstMonthTitle, { date: formatDate(chargeOn, locale, "day") }), body: fill(t.firstMonthBody, { price }),
        href: "/suscripcion", dedupe: `primer-mes-${ref}`,
      });
    }
  } catch {
    console.error("[email] fin del primer mes no enviado"); // sin datos personales
  }
}
