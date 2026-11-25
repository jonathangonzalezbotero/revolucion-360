import { readBodyLimited, toE164, WEBHOOK_MAX_BYTES } from "@/lib/crm";
import { smsKeyword, verifyTwilio } from "@/lib/crm/sign";
import { crmDb } from "@/server/crm";

export const dynamic = "force-dynamic";

const twiml = () => new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", { headers: { "Content-Type": "text/xml" } });

/** URL pública exacta configurada en Twilio (la firma se calcula sobre ella, no sobre la URL interna de Vercel). */
const publicUrl = () => (process.env.TWILIO_WEBHOOK_URL ?? "").trim()
  || `${(process.env.NEXT_PUBLIC_APP_URL ?? "https://app.revoluciondeldinero.com").trim().replace(/\/+$/, "")}/api/crm/twilio`;

/**
 * POST /api/crm/twilio — SMS entrantes de Twilio: STOP (y equivalentes) da de baja los SMS de ese número; START /
 * UNSTOP los vuelven a activar SOLO a quien antes los dio de baja. Cuerpo de máximo 64 KB (antes de verificar), firma
 * X-Twilio-Signature con TWILIO_AUTH_TOKEN (node:crypto). Un reintento con el mismo MessageSid no se procesa dos veces
 * (crm_sms_inbound, en una sola transacción). Twilio responde por su cuenta la confirmación de STOP/START.
 */
export async function POST(request: Request) {
  const token = (process.env.TWILIO_AUTH_TOKEN ?? "").trim();
  if (!token) return new Response("No configurado", { status: 503 });
  const raw = await readBodyLimited(request, WEBHOOK_MAX_BYTES).catch(() => null);
  if (raw === null) return new Response("Muy grande", { status: 413 });
  const params: Record<string, string> = {};
  new URLSearchParams(raw).forEach((v, k) => { params[k] = v; });
  if (!verifyTwilio({ url: publicUrl(), params, signature: request.headers.get("x-twilio-signature"), authToken: token })) return new Response("Firma inválida", { status: 403 });
  const kw = smsKeyword(params.Body);
  const from = toE164(params.From);
  const sid = (params.MessageSid ?? params.SmsSid ?? "").trim();
  if (!kw || !from || !/^[A-Za-z0-9]{10,64}$/.test(sid)) return twiml();
  try {
    const r = await crmDb().rpc("crm_sms_inbound", { p_sid: sid, p_from: from, p_kind: kw });
    if (r.error) throw new Error(r.error.message);
    return twiml();
  } catch (e) {
    console.error("[crm-twilio]", kw, e instanceof Error ? e.message.slice(0, 80) : "error"); // sin el número
    return new Response("Error", { status: 500 });
  }
}
