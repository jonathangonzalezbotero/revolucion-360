import { timingSafeEqual } from "node:crypto";
import { clientIp, INGEST_MAX_BYTES, IngestSchema, isLimited, rateLimit, type RateStore } from "@/lib/crm";
import { crmDb } from "@/server/crm";
import { ingestLead } from "@/server/crm/ingest";

export const dynamic = "force-dynamic";

/**
 * Límite de frecuencia en memoria (por instancia de Vercel): 20 intentos SIN clave válida por minuto por IP (quien la
 * adivina) y 600 peticiones por minuto en total con la clave (una clave filtrada). El llamador legítimo es un servidor
 * (una sola IP para todos los leads), por eso el límite por IP solo cuenta los intentos fallidos. No es exacto entre
 * instancias ni sobrevive a un reinicio (docs/CRM.md).
 */
const FAILS_PER_IP = { limit: 20, windowMs: 60_000 };
const TOTAL = { limit: 600, windowMs: 60_000 };
const hits: RateStore = new Map();

const json = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function authorized(request: Request): boolean {
  const key = (process.env.CRM_INGEST_KEY ?? "").trim();
  if (!key) return false;
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${key}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * POST /api/crm/ingest — leads de las landing pages (webinar, diagnóstico, formularios). JSON validado con zod,
 * máximo 8 KB, protegido con `Authorization: Bearer ${CRM_INGEST_KEY}`. Se llama DESDE UN SERVIDOR (backend de la web,
 * herramienta de formularios, Zapier), nunca desde el navegador: la clave no puede quedar en el HTML. Ejemplo en docs/CRM.md.
 * Responde { ok: true } o { ok: false, error } sin repetir los datos recibidos ni decir si el correo ya existía.
 */
export async function POST(request: Request) {
  if (!(process.env.CRM_INGEST_KEY ?? "").trim()) return json({ ok: false, error: "not_configured" }, 503);
  const now = Date.now();
  const ipKey = `fail:${clientIp(request.headers)}`;
  if (isLimited(hits, ipKey, now, FAILS_PER_IP.limit)) return json({ ok: false, error: "rate_limited" }, 429);
  if (!authorized(request)) {
    rateLimit(hits, ipKey, now, FAILS_PER_IP.limit, FAILS_PER_IP.windowMs);
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  if (!rateLimit(hits, "key", now, TOTAL.limit, TOTAL.windowMs)) return json({ ok: false, error: "rate_limited" }, 429);
  if (Number(request.headers.get("content-length") ?? 0) > INGEST_MAX_BYTES) return json({ ok: false, error: "too_large" }, 413);
  const raw = await request.text();
  if (Buffer.byteLength(raw) > INGEST_MAX_BYTES) return json({ ok: false, error: "too_large" }, 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  const p = IngestSchema.safeParse(body);
  if (!p.success) return json({ ok: false, error: "invalid", fields: [...new Set(p.error.issues.map((i) => String(i.path[0] ?? "")))] }, 400);
  try {
    await ingestLead(crmDb(), p.data);
    return json({ ok: true });
  } catch (e) {
    console.error("[crm-ingest]", e instanceof Error ? e.message.slice(0, 80) : "error"); // sin datos personales
    return json({ ok: false, error: "server" }, 500);
  }
}
