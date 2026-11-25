import { clientIp, isLimited, parseSubmission, rateLimit, readBodyLimited, requestOriginAllowed, SUBMISSION_MAX_BYTES, TURNSTILE_FIELD, turnstileOk, type RateStore } from "@/lib/crm";
import { crmDb } from "@/server/crm";
import { connectionBySlug, keyMatches, logReject, receiveSubmission, requestConfirmation, verifyTurnstile } from "@/server/crm/connections";
import { publicPage, PUBLIC_TEXTS, type PublicLocale } from "@/server/crm/publicPage";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/conexiones/<slug> — dirección de una Conexión web (Admin › Conexiones web, docs/CRM.md).
 *
 * Dos formas:
 * 1) Desde el NAVEGADOR (formulario HTML urlencoded o fetch con JSON): sin clave; exige el comprobante de Cloudflare
 *    Turnstile (`cf-turnstile-response`, verificado aquí con TURNSTILE_SECRET_KEY y el dominio donde se resolvió) y que
 *    Origin/Referer sea una de las páginas permitidas. Solo pone las etiquetas de la conexión y solo llena campos vacíos.
 *    Responde con redirección 303 a la URL de gracias de la conexión (o una página simple), o JSON si se pidió JSON.
 * 2) Desde un SERVIDOR con `Authorization: Bearer <clave secreta de la conexión>`: sin Turnstile; además acepta
 *    `tags`, `removeTags`, `fields`, `mode` ("upsert" | "fill"), `consent` y `evidence`. Siempre JSON.
 * Una clave equivocada es 401 (nunca se cae a la forma del navegador).
 *
 * Límites en memoria por instancia de Vercel: 30 envíos por minuto por IP desde el navegador y 60 por minuto por
 * conexión desde el navegador (todas las IPs juntas, contados después de Turnstile: frena una red de bots); 20 intentos con clave equivocada por minuto
 * por IP; 600 envíos por minuto por conexión con la clave. Los correos de confirmación tienen además un tope global por
 * hora en la base (CONFIRM_PER_HOUR). Cuerpo de máx. 8 KB.
 */
const BROWSER_PER_IP = { limit: 30, windowMs: 60_000 };
const BROWSER_PER_CONNECTION = { limit: 60, windowMs: 60_000 };
const KEY_FAILS_PER_IP = { limit: 20, windowMs: 60_000 };
const PER_CONNECTION = { limit: 600, windowMs: 60_000 };
const hits: RateStore = new Map();

type Params = { params: Promise<{ slug: string }> };

function corsHeaders(origin: string | null): Record<string, string> {
  return origin ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600", Vary: "Origin" } : {};
}

/** Preflight de un fetch con JSON desde una página permitida. */
export async function OPTIONS(request: Request, { params }: Params) {
  const { slug } = await params;
  if (!rateLimit(hits, `ip:${clientIp(request.headers)}`, Date.now(), BROWSER_PER_IP.limit * 2, BROWSER_PER_IP.windowMs)) return new Response(null, { status: 429 });
  try {
    const conn = await connectionBySlug(crmDb(), slug);
    const o = conn ? requestOriginAllowed(request.headers.get("origin"), null, conn.origins) : null;
    return new Response(null, { status: o?.ok ? 204 : 403, headers: corsHeaders(o?.ok ? o.origin : null) });
  } catch {
    return new Response(null, { status: 403 });
  }
}

async function readBody(request: Request, raw: string): Promise<Record<string, unknown> | "invalid"> {
  const type = (request.headers.get("content-type") ?? "").toLowerCase();
  if (type.includes("application/json")) {
    try {
      const v = JSON.parse(raw) as unknown;
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : "invalid";
    } catch { return "invalid"; }
  }
  if (type.includes("application/x-www-form-urlencoded") || type.includes("text/plain") || !type) {
    return Object.fromEntries(new URLSearchParams(raw).entries());
  }
  return "invalid"; // multipart/form-data no: un <form> normal manda urlencoded
}

export async function POST(request: Request, { params }: Params) {
  const { slug } = await params;
  const h = request.headers;
  const ip = clientIp(h);
  const now = Date.now();
  const auth = h.get("authorization");
  const trusted = auth !== null;
  const type = (h.get("content-type") ?? "").toLowerCase();
  const wantsJson = trusted || type.includes("application/json") || ((h.get("accept") ?? "").includes("application/json") && !(h.get("accept") ?? "").includes("text/html"));
  let locale: PublicLocale = "es";
  let cors: Record<string, string> = {};
  let back: string | null = h.get("referer");

  const reply = (status: number, error: string | null, extra: { redirect?: string | null; pending?: boolean } = {}) => {
    if (wantsJson) return Response.json(error ? { ok: false, error } : { ok: true }, { status, headers: { "Cache-Control": "no-store", ...cors } });
    if (!error && extra.redirect) return new Response(null, { status: 303, headers: { Location: extra.redirect, "Cache-Control": "no-store" } });
    const t = PUBLIC_TEXTS[locale];
    return error
      ? publicPage({ locale, status, title: t.errorTitle, text: t.errors[error] ?? t.errors.server, back: back && /^https:\/\//.test(back) ? back : null })
      : publicPage({ locale, title: t.thanksTitle, text: extra.pending ? t.pendingText : t.thanksText, back: back && /^https:\/\//.test(back) ? back : null });
  };

  // Límites antes de tocar la base.
  if (trusted) {
    if (isLimited(hits, `keyfail:${ip}`, now, KEY_FAILS_PER_IP.limit)) return reply(429, "rate");
  } else if (!rateLimit(hits, `ip:${ip}`, now, BROWSER_PER_IP.limit, BROWSER_PER_IP.windowMs)) return reply(429, "rate");

  const raw = await readBodyLimited(request, SUBMISSION_MAX_BYTES);
  if (raw === null) return reply(413, "too_large");
  const body = await readBody(request, raw);

  try {
    const db = crmDb();
    const conn = await connectionBySlug(db, slug);
    if (!conn) {
      if (trusted) rateLimit(hits, `keyfail:${ip}`, now, KEY_FAILS_PER_IP.limit, KEY_FAILS_PER_IP.windowMs);
      return reply(404, "not_found");
    }
    const via = trusted ? "server" : "browser";
    if (body !== "invalid" && typeof body.idioma === "string" && body.idioma === "en") locale = "en";

    if (trusted) {
      if (!keyMatches(auth, conn.secret)) {
        rateLimit(hits, `keyfail:${ip}`, now, KEY_FAILS_PER_IP.limit, KEY_FAILS_PER_IP.windowMs);
        await logReject(db, conn.id, "server", "rejected_key");
        return reply(401, "unauthorized");
      }
      if (!rateLimit(hits, `conn:${conn.id}`, now, PER_CONNECTION.limit, PER_CONNECTION.windowMs)) {
        await logReject(db, conn.id, "server", "rejected_rate");
        return reply(429, "rate");
      }
    } else {
      const o = requestOriginAllowed(h.get("origin"), h.get("referer"), conn.origins);
      if (!o.ok) {
        back = null;
        await logReject(db, conn.id, "browser", "rejected_origin");
        return reply(403, "origin");
      }
      cors = corsHeaders(o.origin);
    }
    if (conn.status !== "active") {
      await logReject(db, conn.id, via, "rejected_paused");
      return reply(403, "paused");
    }
    if (body === "invalid") {
      await logReject(db, conn.id, via, "rejected_invalid");
      return reply(400, "invalid");
    }
    if (!trusted) {
      const token = typeof body[TURNSTILE_FIELD] === "string" ? (body[TURNSTILE_FIELD] as string) : "";
      if (!turnstileOk(await verifyTurnstile(token, ip), conn.origins)) {
        await logReject(db, conn.id, "browser", "rejected_turnstile");
        return reply(403, "antibot");
      }
      // Tope por conexión (todas las IPs), contado solo con un comprobante válido: basura con un Origin falso no lo gasta.
      if (!rateLimit(hits, `bconn:${conn.id}`, now, BROWSER_PER_CONNECTION.limit, BROWSER_PER_CONNECTION.windowMs)) {
        await logReject(db, conn.id, "browser", "rejected_rate");
        return reply(429, "rate");
      }
    }
    const parsed = parseSubmission(body, trusted);
    if (!parsed.ok) {
      await logReject(db, conn.id, via, parsed.error === "email" ? "rejected_email" : "rejected_invalid");
      return reply(400, parsed.error);
    }
    const sub = parsed.sub;
    if (sub.locale) locale = sub.locale;
    if (!trusted) {
      // Constancia del navegador: la página desde donde llegó, la IP y el navegador (lo pone el servidor, no el formulario).
      sub.evidence = { ...sub.evidence, url: (h.get("referer") ?? h.get("origin") ?? "").slice(0, 500) || undefined, ip, userAgent: (h.get("user-agent") ?? "").slice(0, 300) || undefined };
    }
    if (conn.double_opt_in) {
      await requestConfirmation(db, conn, sub, via);
      return reply(200, null, { redirect: conn.thanks_url, pending: true });
    }
    await receiveSubmission(db, conn, sub, via);
    // La respuesta nunca dice si el correo ya existía ni si estaba de baja.
    return reply(200, null, { redirect: conn.thanks_url });
  } catch (e) {
    console.error("[crm-conexion]", e instanceof Error ? e.message.slice(0, 80) : "error"); // sin datos personales
    return reply(500, "server");
  }
}
