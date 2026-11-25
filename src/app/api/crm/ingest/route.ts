import { timingSafeEqual } from "node:crypto";
import { INGEST_MAX_BYTES, IngestSchema } from "@/lib/crm";
import { crmDb } from "@/server/crm";
import { ingestLead } from "@/server/crm/ingest";

export const dynamic = "force-dynamic";

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
 * Responde { ok: true, created } o { ok: false, error } sin repetir los datos recibidos.
 */
export async function POST(request: Request) {
  if (!(process.env.CRM_INGEST_KEY ?? "").trim()) return json({ ok: false, error: "not_configured" }, 503);
  if (!authorized(request)) return json({ ok: false, error: "unauthorized" }, 401);
  if (Number(request.headers.get("content-length") ?? 0) > INGEST_MAX_BYTES) return json({ ok: false, error: "too_large" }, 413);
  const raw = await request.text();
  if (Buffer.byteLength(raw) > INGEST_MAX_BYTES) return json({ ok: false, error: "too_large" }, 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  const p = IngestSchema.safeParse(body);
  if (!p.success) return json({ ok: false, error: "invalid", fields: [...new Set(p.error.issues.map((i) => String(i.path[0] ?? "")))] }, 400);
  try {
    const r = await ingestLead(crmDb(), p.data);
    return json({ ok: true, created: r.created });
  } catch (e) {
    console.error("[crm-ingest]", e instanceof Error ? e.message.slice(0, 80) : "error"); // sin datos personales
    return json({ ok: false, error: "server" }, 500);
  }
}
