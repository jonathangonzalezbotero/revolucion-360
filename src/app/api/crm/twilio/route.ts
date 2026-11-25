import { toE164 } from "@/lib/crm";
import { smsKeyword, verifyTwilio } from "@/lib/crm/sign";
import { crmDb } from "@/server/crm";

export const dynamic = "force-dynamic";

const twiml = () => new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", { headers: { "Content-Type": "text/xml" } });

/** URL pública exacta configurada en Twilio (la firma se calcula sobre ella, no sobre la URL interna de Vercel). */
const publicUrl = () => (process.env.TWILIO_WEBHOOK_URL ?? "").trim()
  || `${(process.env.NEXT_PUBLIC_APP_URL ?? "https://app.revoluciondeldinero.com").trim().replace(/\/+$/, "")}/api/crm/twilio`;

/**
 * POST /api/crm/twilio — SMS entrantes de Twilio: STOP (y equivalentes) da de baja los SMS de ese número; START los
 * vuelve a activar si la persona ya era contacto. Verifica X-Twilio-Signature con TWILIO_AUTH_TOKEN (node:crypto).
 * Twilio responde por su cuenta el mensaje de confirmación de STOP/START: aquí se contesta vacío.
 */
export async function POST(request: Request) {
  const token = (process.env.TWILIO_AUTH_TOKEN ?? "").trim();
  if (!token) return new Response("No configurado", { status: 503 });
  const form = await request.formData().catch(() => null);
  if (!form) return new Response("Formulario inválido", { status: 400 });
  const params: Record<string, string> = {};
  form.forEach((v, k) => { if (typeof v === "string") params[k] = v; });
  if (!verifyTwilio({ url: publicUrl(), params, signature: request.headers.get("x-twilio-signature"), authToken: token })) return new Response("Firma inválida", { status: 403 });
  const kw = smsKeyword(params.Body);
  const from = toE164(params.From);
  if (!kw || !from) return twiml();
  try {
    const db = crmDb();
    const { data, error } = await db.from("crm_contacts").select("id").eq("phone", from);
    if (error) throw new Error(error.message);
    const ids = (data ?? []).map((r: { id: string }) => r.id);
    if (kw === "stop") {
      for (const id of ids) {
        const r = await db.rpc("crm_apply_consent", { p_contact: id, p_channel: "sms", p_on: false, p_source: "sms_stop" });
        if (r.error) throw new Error(r.error.message);
      }
      // Aunque el número no sea de ningún contacto, queda suprimido.
      if (!ids.length) {
        const r = await db.from("crm_suppressions").upsert({ channel: "sms", value: from, reason: "stop", lifted_at: null }, { onConflict: "channel,value" });
        if (r.error) throw new Error(r.error.message);
      }
    } else {
      for (const id of ids) {
        const r = await db.rpc("crm_apply_consent", { p_contact: id, p_channel: "sms", p_on: true, p_source: "sms_start" });
        if (r.error) throw new Error(r.error.message);
      }
    }
    return twiml();
  } catch (e) {
    console.error("[crm-twilio]", kw, e instanceof Error ? e.message.slice(0, 80) : "error"); // sin el número
    return new Response("Error", { status: 500 });
  }
}
