import type { Messages } from "@/i18n";

/** Textos de las notificaciones que deja el aviso de Stripe (los correos los mandan src/lib/email/events.ts). Un solo plan: sin "Pro". */
export const M = {
  es: {
    upgradedTitle: "Tu cuenta está activa", upgradedBody: "Tu pago quedó confirmado. Todo está abierto.",
    failedTitle: "No pudimos cobrar tu suscripción", failedBody: "Revisa tu tarjeta. Stripe lo intentará de nuevo en unos días.",
    endedTitle: "Tu cuenta quedó en solo lectura", endedBody: "Tus datos siguen aquí y puedes exportarlos. Reactiva tu cuenta para volver a editar.",
    backTitle: "Volviste a tu acceso gratis", backBody: "Tu suscripción terminó, pero tu acceso de Revolución del Dinero sigue vigente.",
  },
  en: {
    upgradedTitle: "Your account is active", upgradedBody: "Your payment is confirmed. Everything is open.",
    failedTitle: "We couldn't charge your subscription", failedBody: "Check your card. Stripe will try again in a few days.",
    endedTitle: "Your account is now read-only", endedBody: "Your data is still here and you can export it. Reactivate your account to edit again.",
    backTitle: "You're back on your free access", backBody: "Your subscription ended, but your Revolución del Dinero access is still active.",
  },
} satisfies Messages<unknown>;
