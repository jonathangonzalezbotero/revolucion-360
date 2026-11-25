// CRM: reglas de A QUIÉN, CUÁNDO y CUÁNTAS VECES se envía. PURO (sin base de datos ni red), probado en tests/crm.test.ts.
// Nunca recibe ni devuelve montos.
import type { Stage } from "./schema";

// ───────── Etapa (etiqueta de sistema) según el estado de la cuenta ─────────
/**
 * - Sin cuenta en la app, o cuenta sin activar (`free`): Lead.
 * - Pagando en su primer mes (Stripe `trialing`, o la prueba vieja `trial`): Primer mes.
 * - Pagando después del primer mes (active, past_due…): Pagando.
 * - Alumno o fundador (acceso gratis): Alumno.
 * - Solo lectura: Solo lectura.
 */
export function stageFor(a: { hasUser: boolean; state: string | null | undefined; stripeStatus: string | null | undefined }): Stage {
  if (!a.hasUser) return "lead";
  switch (a.state) {
    case "trial": return "primer_mes";
    case "pro": return a.stripeStatus === "trialing" ? "primer_mes" : "pagando";
    case "alumno":
    case "fundador": return "alumno";
    case "read_only": return "solo_lectura";
    default: return "lead";
  }
}

// ───────── Consentimiento: ¿se le puede mandar marketing por este canal? ─────────
export type ConsentFacts = {
  emailConsent: boolean; emailUnsubscribedAt: string | null; smsConsent: boolean; smsUnsubscribedAt: string | null;
  phone: string | null; emailSuppressed: boolean; smsSuppressed: boolean;
};
/** Se revisa JUSTO antes de enviar (no al encolar): una baja de hace un minuto frena el envío. */
export function mayMarket(channel: "email" | "sms", c: ConsentFacts): { ok: true } | { ok: false; reason: "no_consent" | "unsubscribed" | "suppressed" | "no_phone" } {
  if (channel === "email") {
    if (c.emailUnsubscribedAt && !c.emailConsent) return { ok: false, reason: "unsubscribed" };
    if (!c.emailConsent) return { ok: false, reason: "no_consent" };
    if (c.emailSuppressed) return { ok: false, reason: "suppressed" };
    return { ok: true };
  }
  if (!c.phone) return { ok: false, reason: "no_phone" };
  if (c.smsUnsubscribedAt && !c.smsConsent) return { ok: false, reason: "unsubscribed" };
  if (!c.smsConsent) return { ok: false, reason: "no_consent" };
  if (c.smsSuppressed) return { ok: false, reason: "suppressed" };
  return { ok: true };
}

/** Fuera de producción: correos solo a @revolucion360.test (misma regla que src/lib/email) y SMS solo a los números de prueba. */
export function maySms(to: string, production: boolean, testNumbers: string[]): boolean {
  if (!/^\+[1-9][0-9]{6,14}$/.test(to)) return false;
  return production || testNumbers.includes(to);
}
export const parseTestNumbers = (raw: string | undefined) => (raw ?? "").split(",").map((s) => s.trim()).filter((s) => /^\+[1-9][0-9]{6,14}$/.test(s));

// ───────── Reintentos ─────────
export const MAX_ATTEMPTS = 3;
/** Después del intento N fallido: 10 min, 20 min, 40 min… (tope 6 h). null = ya no se reintenta. */
export function retryAt(attempts: number, now: Date): Date | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  const min = Math.min(360, 10 * 2 ** Math.max(0, attempts - 1));
  return new Date(now.getTime() + min * 60_000);
}

// ───────── Detecciones por tiempo ─────────
const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * "No abre la app en X días": quien tuvo su última actividad entre X+3 y X días atrás (una ventana de 3 días para que
 * una corrida perdida no deje a nadie fuera, sin barrer a todos los que llevan meses sin entrar el día que se activa).
 * Una vez por periodo de inactividad: el ref lleva el día de la última actividad.
 */
export const INACTIVE_GRACE_DAYS = 3;
export function inactiveWindow(now: Date, days: number): { from: string; to: string } {
  return { from: new Date(now.getTime() - (days + INACTIVE_GRACE_DAYS) * DAY).toISOString(), to: new Date(now.getTime() - days * DAY).toISOString() };
}
export const inactiveRef = (days: number, lastActive: string) => `${days}:${ymd(new Date(lastActive))}`;

/**
 * "Faltan X días para un cobro": cobro (fin del periodo en Stripe) dentro de los próximos X días, en una suscripción
 * que sigue (no cancelada). Una vez por cobro: el ref lleva los días, la fecha del cobro y si es el primero.
 */
export function chargeWindow(now: Date, days: number): { from: string; to: string } {
  return { from: now.toISOString(), to: new Date(now.getTime() + days * DAY).toISOString() };
}
export const chargeRef = (days: number, chargeAt: string, first: boolean) => `${days}:${ymd(new Date(chargeAt))}:${first ? "first" : "renew"}`;
export const isUpcomingCharge = (e: { state: string | null; stripeStatus: string | null; cancelAtPeriodEnd: boolean; proUntil: string | null }) =>
  e.state === "pro" && !e.cancelAtPeriodEnd && !!e.proUntil && (e.stripeStatus === "trialing" || e.stripeStatus === "active");

// ───────── Ingreso de leads: ¿el SMS se puede marcar para este número? ─────────
/**
 * El consentimiento de SMS es para UN número: el que llegó en la petición (decisión de Jonathan: lo verifica su
 * formulario). Solo se marca si ese número es el que queda en el contacto:
 * - sin número en la petición → no;
 * - el contacto no tenía número → se le pone este y sí;
 * - tenía este mismo → sí;
 * - tenía OTRO → no se pisa en silencio (podría ser un número ajeno escrito en el formulario) y no se marca SMS
 *   (`phone_conflict`); el número del contacto lo cambia la persona en Perfil o el Dueño a mano.
 */
export function ingestSmsDecision(requestPhone: string | null, existingPhone: string | null):
  { setPhone: string | null; sms: boolean; reason: "ok" | "no_phone" | "phone_conflict" } {
  if (!requestPhone) return { setPhone: null, sms: false, reason: "no_phone" };
  if (!existingPhone) return { setPhone: requestPhone, sms: true, reason: "ok" };
  if (existingPhone === requestPhone) return { setPhone: null, sms: true, reason: "ok" };
  return { setPhone: null, sms: false, reason: "phone_conflict" };
}

// ───────── Envío: ¿la campaña o la automatización siguen en pie? ─────────
/**
 * Se revisa al encolar (por lote) y justo antes de enviar: lo que quedó en la cola de una campaña cancelada o de una
 * automatización que ya no está activa (pausada, en borrador o borrada) no sale. Queda "omitido" con el motivo; no se
 * vuelve a encolar solo (la cola es única por origen y contacto).
 */
export function sourceBlocked(m: { campaignId: string | null; automationId: string | null }, status: { campaign?: string | null; automation?: string | null }):
  "campaign_cancelled" | "automation_inactive" | null {
  if (m.campaignId && status.campaign === "cancelled") return "campaign_cancelled";
  if (m.automationId && status.automation !== "active") return "automation_inactive";
  return null;
}

// ───────── Etiquetas por nombre (sin comodines) ─────────
/** La etiqueta con ese nombre exacto, sin importar mayúsculas (como el índice único lower(name)). Sin `%`, `_` ni `*`. */
export function findTagByName<T extends { name: string }>(tags: readonly T[], name: string): T | null {
  const k = name.trim().toLowerCase();
  return tags.find((t) => t.name.trim().toLowerCase() === k) ?? null;
}
