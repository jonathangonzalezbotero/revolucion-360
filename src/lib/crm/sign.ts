// Firmas de los webhooks, con node:crypto (sin librerías nuevas). PURO, probado en tests/crm.test.ts.
import { createHmac, timingSafeEqual } from "node:crypto";

const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Resend firma sus webhooks con Svix: encabezados `svix-id`, `svix-timestamp` y `svix-signature` ("v1,<base64> v1,<base64>").
 * Firma = HMAC-SHA256 de `${id}.${timestamp}.${cuerpo}` con el secreto (`whsec_<base64>`, decodificado). Tolerancia de 5 minutos.
 */
export function verifySvix(a: { id: string | null; timestamp: string | null; signature: string | null; body: string; secret: string; now?: Date }): boolean {
  if (!a.id || !a.timestamp || !a.signature || !a.secret) return false;
  const ts = Number(a.timestamp);
  const now = Math.floor((a.now ?? new Date()).getTime() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 300) return false;
  const key = Buffer.from(a.secret.startsWith("whsec_") ? a.secret.slice(6) : a.secret, "base64");
  const expected = createHmac("sha256", key).update(`${a.id}.${a.timestamp}.${a.body}`).digest("base64");
  return a.signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    return version === "v1" && !!sig && same(sig, expected);
  });
}

/**
 * Twilio firma con `X-Twilio-Signature` = base64(HMAC-SHA1(authToken, URL + cada parámetro POST ordenado por nombre, nombre+valor)).
 * La URL es la pública exacta que se configuró en Twilio (no la interna de Vercel).
 */
export function twilioSignature(url: string, params: Record<string, string>, authToken: string): string {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}
export function verifyTwilio(a: { url: string; params: Record<string, string>; signature: string | null; authToken: string }): boolean {
  if (!a.signature || !a.authToken) return false;
  return same(a.signature, twilioSignature(a.url, a.params, a.authToken));
}

/** STOP / START de Twilio (palabras estándar de baja y alta, en inglés y español). */
const STOP = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "PARAR", "BAJA", "ALTO"]);
const START = new Set(["START", "YES", "UNSTOP", "ALTA"]);
export function smsKeyword(body: string | null | undefined): "stop" | "start" | null {
  const w = (body ?? "").trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (STOP.has(w)) return "stop";
  if (START.has(w)) return "start";
  return null;
}
