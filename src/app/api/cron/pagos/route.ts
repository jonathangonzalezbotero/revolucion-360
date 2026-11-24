import { asLocale } from "@/i18n";
import { appUrl, BATCH, byIds, FIRST_UUID, PROFILE_COLS, runCron, type ProfileLite } from "@/lib/email/cron";
import { PAYMENT_RECENT_DAYS, paymentRef, safeToday } from "@/lib/email/lib";
import { deliverOnce } from "@/lib/email/send";
import { paymentEmail } from "@/lib/email/templates";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/pagos (diario). RED DE SEGURIDAD: el correo sale en el momento del aviso de Stripe
 * (src/lib/email/events.ts). Esta tarea solo reintenta los que fallaron: correo a quien tiene un pago fallido reciente
 * y aún no lo recibió para ese fallo. Es un correo importante de la cuenta: no depende de las preferencias.
 * La notificación en la app ya la crea el aviso de Stripe (src/app/api/stripe/webhook): aquí solo el correo.
 */
export async function GET(request: Request) {
  return runCron("pagos", request, async (db) => {
    const since = new Date(Date.now() - PAYMENT_RECENT_DAYS * 86_400_000).toISOString();
    let failedPayments = 0, sent = 0, skipped = 0, failed = 0;
    let after = FIRST_UUID;
    for (;;) {
      const { data, error } = await db.from("entitlements").select("user_id, payment_failed_at")
        .gte("payment_failed_at", since).gt("user_id", after).order("user_id").limit(BATCH);
      if (error) throw new Error(`db: ${error.message}`);
      const profiles = await byIds<ProfileLite>(data.map((e) => e.user_id), (ids) => db.from("profiles").select(PROFILE_COLS).in("id", ids).is("suspended_at", null).order("id")) as ProfileLite[];
      const pBy = new Map(profiles.map((p) => [p.id, p]));
      for (const e of data) {
        const p = pBy.get(e.user_id);
        if (!p || !e.payment_failed_at) continue;
        failedPayments++;
        const at = e.payment_failed_at;
        const res = await deliverOnce(db, {
          userId: p.id, kind: "payment_failed", ref: paymentRef(at), to: p.email,
          render: () => paymentEmail({ locale: asLocale(p.locale), appUrl: appUrl(), failedOn: safeToday(p.timezone, new Date(at)) }),
        });
        if (res === "sent") sent++; else if (res === "failed") failed++; else skipped++;
      }
      if (data.length < BATCH) break;
      after = data[data.length - 1].user_id;
    }
    return { failedPayments, sent, skipped, failed };
  });
}
