// Textos del CRM que usarán las pantallas del panel (Contactos, Campañas, Automatizaciones). Español del mockup.
import { fill, type Locale } from "@/i18n";
import type { EventKind, Source, Stage, Trigger } from "./schema";

export const STAGE_LABELS: Record<Locale, Record<Stage, string>> = {
  es: { lead: "Lead", primer_mes: "Primer mes", pagando: "Pagando", alumno: "Alumno", solo_lectura: "Solo lectura" },
  en: { lead: "Lead", primer_mes: "First month", pagando: "Paying", alumno: "Student", solo_lectura: "Read only" },
};

export const SOURCE_LABELS: Record<Locale, Record<Source, string>> = {
  es: { webinar: "Webinar", diagnostico: "Diagnóstico", web: "Formulario web", app: "Registro en la app", importado: "Importado", manual: "A mano" },
  en: { webinar: "Webinar", diagnostico: "Diagnostic", web: "Web form", app: "App sign-up", importado: "Imported", manual: "Added by hand" },
};

/** Disparadores (AdminAuto › "Eventos de la app que pueden iniciar una automatización"). {n} = días. */
export const TRIGGER_LABELS: Record<Locale, Record<Trigger["kind"], string>> = {
  es: {
    first_month_paid: "Pagó su primer mes", student_code: "Entró con código de alumno", wizard_done: "Terminó el asistente",
    first_closure: "Hizo su primer cierre", inactive_days: "No abre la app en {n} días", goal_milestone: "Llegó a un hito de meta",
    charge_upcoming: "Faltan {n} días para un cobro", payment_failed: "Pago fallido", subscription_ended: "Suscripción terminó",
    diagnostic_done: "Hizo el diagnóstico", tag_added: "Se le puso una etiqueta", web_form: "Llenó un formulario web",
    web_connection: "Llegó por una conexión web", email_confirmed: "Confirmó su correo",
    challenge_idle: "Reto: no marca en {n} días", challenge_done: "Reto: lo terminó",
  },
  en: {
    first_month_paid: "Paid their first month", student_code: "Joined with a student code", wizard_done: "Finished the setup wizard",
    first_closure: "Closed their first month", inactive_days: "Hasn't opened the app in {n} days", goal_milestone: "Reached a goal milestone",
    charge_upcoming: "{n} days until a charge", payment_failed: "Payment failed", subscription_ended: "Subscription ended",
    diagnostic_done: "Did the diagnostic", tag_added: "Got a tag", web_form: "Filled in a web form",
    web_connection: "Came in through a web connection", email_confirmed: "Confirmed their email",
    challenge_idle: "Challenge: no check-in for {n} days", challenge_done: "Challenge: finished",
  },
};
/** Nombre del disparador con sus días ("No abre la app en 14 días"); "X" si no hay días. */
export const triggerLabel = (t: Pick<Trigger, "kind" | "days">, locale: Locale) => fill(TRIGGER_LABELS[locale][t.kind], { n: t.days ?? "X" });

/** Actividad del contacto (línea de tiempo). Nunca montos. */
export const EVENT_LABELS: Record<Locale, Record<EventKind, string>> = {
  es: {
    ...TRIGGER_LABELS.es, inactive_days: "Lleva días sin abrir la app", charge_upcoming: "Se acerca un cobro", first_closure: "Hizo su primer cierre de mes",
    tag_added: "Se le puso una etiqueta", web_form: "Llenó un formulario web", diagnostic_done: "Hizo el diagnóstico",
    signup: "Creó su cuenta en la app", paying: "Pasó a pagar su mensualidad", webinar_registered: "Se registró en un webinar", imported: "Llegó por importación",
    created_manually: "Se agregó a mano", stage_changed: "Cambió de etapa", subscribed: "Aceptó recibir mensajes", unsubscribed: "Se dio de baja",
    email_sent: "Recibió un correo", sms_sent: "Recibió un SMS", email_opened: "Abrió un correo", email_clicked: "Hizo clic en un correo",
    email_bounced: "Un correo rebotó", email_complained: "Marcó un correo como spam",
  },
  en: {
    ...TRIGGER_LABELS.en, inactive_days: "Hasn't opened the app for days", charge_upcoming: "A charge is coming up", first_closure: "Closed their first month",
    tag_added: "Got a tag", web_form: "Filled in a web form", diagnostic_done: "Did the diagnostic",
    signup: "Created their app account", paying: "Started paying monthly", webinar_registered: "Signed up for a webinar", imported: "Imported",
    created_manually: "Added by hand", stage_changed: "Changed stage", subscribed: "Agreed to receive messages", unsubscribed: "Unsubscribed",
    email_sent: "Got an email", sms_sent: "Got an SMS", email_opened: "Opened an email", email_clicked: "Clicked an email",
    email_bounced: "An email bounced", email_complained: "Marked an email as spam",
  },
};

/** Pie del panel (los tres mockups). */
export const CRM_FOOTNOTE: Record<Locale, string> = {
  es: "El CRM solo guarda datos de contacto, etiquetas y eventos de uso (por ejemplo \"hizo su primer cierre\"). Nunca muestra montos ni movimientos de nadie. Los correos de marketing solo van a quien dio su consentimiento, siempre con remitente claro y enlace para darse de baja (Spam Act 2003).",
  en: "The CRM only keeps contact details, tags and usage events (for example \"closed their first month\"). It never shows anyone's amounts or transactions. Marketing emails only go to people who gave consent, always with a clear sender and an unsubscribe link (Spam Act 2003).",
};
