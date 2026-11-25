import type { Messages } from "@/i18n";

// Preferencias de correo por token (enlace "Elegir qué correos recibo" y "Darte de baja" de los correos de marketing).
export const M = {
  es: {
    title: "Qué correos recibes",
    lead: "Aquí eliges qué mensajes de Revolución 360 te llegan a {email}.",
    logoAlt: "Revolución 360 · Revolución del Dinero",
    emailT: "Novedades y clases por correo", emailD: "Eventos, talleres, clases en vivo y consejos de Jonathan.",
    smsT: "Avisos por SMS", smsD: "Recordatorios cortos al {phone}. Responde STOP para no recibir más.",
    account: "Los avisos de tu cuenta (pagos, seguridad, acceso) no son publicidad: siguen llegando mientras tengas cuenta.",
    saved: "Listo. Guardamos tu elección.", error: "No se pudo guardar. Inténtalo de nuevo.",
    confirmTitle: "¿Dejar de recibir correos?", confirmText: "Ya no te llegarán novedades ni clases por correo. Puedes volver a activarlas aquí cuando quieras.",
    confirmCta: "Sí, darme de baja", confirmOther: "Prefiero elegir qué recibo",
    doneTitle: "Listo, te diste de baja", doneText: "Ya no recibirás correos de marketing de Revolución 360.",
    badTitle: "Este enlace ya no sirve", badText: "Ábrelo de nuevo desde el último correo que recibiste, o cambia tus avisos en Mi perfil › Notificaciones.",
    toApp: "Ir a la app",
  },
  en: {
    title: "Which emails you get",
    lead: "Choose which Revolución 360 messages reach {email}.",
    logoAlt: "Revolución 360 · Revolución del Dinero",
    emailT: "News and classes by email", emailD: "Events, workshops, live classes and tips from Jonathan.",
    smsT: "SMS reminders", smsD: "Short reminders to {phone}. Reply STOP to opt out.",
    account: "Account notices (payments, security, access) aren't marketing: you keep getting them while you have an account.",
    saved: "Done. We saved your choice.", error: "We couldn't save that. Try again.",
    confirmTitle: "Stop getting emails?", confirmText: "You won't get news or classes by email anymore. You can turn them back on here anytime.",
    confirmCta: "Yes, unsubscribe me", confirmOther: "I'd rather choose what I get",
    doneTitle: "Done, you're unsubscribed", doneText: "You won't get marketing emails from Revolución 360 anymore.",
    badTitle: "This link no longer works", badText: "Open it again from the latest email you got, or change your notices in My profile › Notifications.",
    toApp: "Go to the app",
  },
} satisfies Messages<unknown>;
export type PrefMessages = (typeof M)["es"];
