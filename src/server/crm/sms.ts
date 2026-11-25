import "server-only";
import { maySms, parseTestNumbers } from "@/lib/crm";
import { isProduction } from "@/lib/email/send";

/** Twilio por su API REST con fetch (sin librería). TWILIO_FROM: número E.164 o un Messaging Service (MG…). */
export const twilioConfig = () => {
  const sid = (process.env.TWILIO_ACCOUNT_SID ?? "").trim();
  const token = (process.env.TWILIO_AUTH_TOKEN ?? "").trim();
  const from = (process.env.TWILIO_FROM ?? "").trim();
  return sid && token && from ? { sid, token, from } : null;
};

export type SmsResult =
  | { status: "sent"; id: string }
  | { status: "skipped"; error: string }
  | { status: "failed"; error: string; retry: boolean; optedOut?: boolean };

/**
 * Envía un SMS. Nunca lanza. Fuera de producción solo a los números de SMS_TEST_NUMBERS (como los correos, que solo
 * salen a @revolucion360.test). `error` es un código técnico, sin el número ni el texto.
 */
export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const cfg = twilioConfig();
  if (!cfg) return { status: "skipped", error: "missing_twilio_config" };
  if (!maySms(to, isProduction(), parseTestNumbers(process.env.SMS_TEST_NUMBERS))) return { status: "skipped", error: "not_allowed_outside_production" };
  const form = new URLSearchParams({ To: to, Body: body });
  if (cfg.from.startsWith("MG")) form.set("MessagingServiceSid", cfg.from); else form.set("From", cfg.from);
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.sid)}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${cfg.sid}:${cfg.token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { sid?: string; code?: number };
    if (res.ok && json.sid) return { status: "sent", id: json.sid };
    // 21610: la persona respondió STOP en Twilio. 429 / 5xx: se reintenta. Otros 4xx: no.
    const code = json.code ? `twilio_${json.code}` : `http_${res.status}`;
    return { status: "failed", error: code, retry: res.status === 429 || res.status >= 500, optedOut: json.code === 21610 };
  } catch (e) {
    // Sin respuesta no se sabe si Twilio lo envió (y Twilio no deduplica): no se reintenta solo, para no mandarlo dos veces.
    console.error("[crm] SMS no enviado", e instanceof Error ? e.name : "error");
    return { status: "failed", error: e instanceof Error ? e.name.slice(0, 40) : "error", retry: false };
  }
}
