import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  cleanRef, connectionSlug, ConnectionInput, contactPatch, DEFAULT_CONSENT_TEXT, findTagByName, ingestSmsDecision, isSecretFormat, legalReady, mayTransactional,
  newsletterEvidence, renderMarketingEmail, SYSTEME_NEWSLETTER_SOURCE, SystemeRowSchema, systemeConsentAction, testEmailFor, thanksUrlOk, type Submission, type TurnstileReply,
} from "@/lib/crm";
import { sendEmailDetailed } from "@/lib/email/send";
import { appUrl, crmFrom, crmReplyTo, loadLegal, must, type Db } from "./db";
import { addTag, recordEvent, removeTag } from "./events";

// Conexiones web (mockup AdminConexiones, docs/CRM.md › "Conexiones web").
// - Recibir: lo usa la dirección pública /api/crm/conexiones/<slug> con la clave de servicio (crmDb()).
// - Panel: el resto recibe el cliente de la SESIÓN del Dueño (la base impone que solo él lea y escriba crm_*).
// La clave secreta de una conexión nunca va en las listas ni en las props de la página: solo con revealConnectionSecret.

const fail = (code: string): never => { throw new Error(code); };
const stamp = () => new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
const sha256 = (v: string) => createHash("sha256").update(v.trim().toLowerCase(), "utf8").digest("hex");
/**
 * Huella del correo en `crm_pending_confirmations.email_hash`: HMAC-SHA-256 con la clave del servidor CRM_HASH_KEY (ver
 * .env.example). Sin la clave nadie puede probar un correo contra la tabla (un SHA-256 simple se adivina con una lista
 * de correos). Sin la clave configurada NO se guarda nada (falla cerrado: la confirmación no sale).
 */
export function emailHmac(email: string): string {
  const key = (process.env.CRM_HASH_KEY ?? "").trim();
  if (key.length < 32) throw new Error("crm_hash_key");
  return createHmac("sha256", key).update(email.trim().toLowerCase(), "utf8").digest("hex");
}

export type ConnectionRow = {
  id: string; slug: string; name: string; tag_ids: string[]; status: "active" | "paused"; origins: string[]; thanks_url: string | null;
  double_opt_in: boolean; created_at: string; updated_at: string;
};
/** Columnas SIN la clave secreta. */
export const CONNECTION_COLS = "id, slug, name, tag_ids, status, origins, thanks_url, double_opt_in, created_at, updated_at";

export type Via = "browser" | "server" | "test" | "confirm";
export type ReceiveResult = "created" | "updated" | "no_consent" | "suppressed" | "pending" | "throttled" | "confirmed" | "test";
export type RejectResult = "rejected_turnstile" | "rejected_origin" | "rejected_email" | "rejected_paused" | "rejected_invalid" | "rejected_key" | "rejected_rate";

// ───────── Recibir (clave de servicio) ─────────
/** La conexión con su clave (solo para comparar en el servidor). */
export async function connectionBySlug(db: Db, slug: string): Promise<(ConnectionRow & { secret: string }) | null> {
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return null;
  return must(await db.from("crm_connections").select(`${CONNECTION_COLS}, secret`).eq("slug", slug).maybeSingle()) as (ConnectionRow & { secret: string }) | null;
}

/** Compara la clave en tiempo constante ("Authorization: Bearer rk_live_…"). */
export function keyMatches(header: string | null, secret: string): boolean {
  const got = Buffer.from((header ?? "").trim());
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Cloudflare Turnstile (siteverify). null si falta la clave secreta o Cloudflare no responde: el envío se rechaza. */
export async function verifyTurnstile(token: string, ip: string): Promise<TurnstileReply | null> {
  const secret = (process.env.TURNSTILE_SECRET_KEY ?? "").trim();
  if (!secret || !token || token.length > 2048) return null;
  try {
    const body = new URLSearchParams({ secret, response: token, ...(ip && ip !== "unknown" ? { remoteip: ip } : {}) });
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(5000) });
    return r.ok ? ((await r.json()) as TurnstileReply) : null;
  } catch {
    return null;
  }
}

/** Rechazo agrupado por hora (no llena la tabla con una ráfaga de bots). Nunca lanza. */
export async function logReject(db: Db, connectionId: string, via: "browser" | "server", result: RejectResult): Promise<void> {
  const r = await db.rpc("crm_connection_reject", { p_connection: connectionId, p_via: via, p_result: result });
  if (r.error) console.error("[crm-conexion] rechazo sin registrar", r.error.code ?? ""); // sin datos personales
}

type Existing = { id: string; name: string; phone: string | null; country: string | null; timezone: string | null; user_id: string | null; fields: Record<string, string> | null; email_consent: boolean };

/**
 * Aplica un envío: crea o actualiza el contacto (por correo, sin duplicar), quita y pone etiquetas, guarda campos extra,
 * marca el consentimiento SOLO si llegó `acepta_correos` (con su constancia; nunca levanta una baja) y deja "Llegó por una
 * conexión web" (y "Confirmó su correo" si viene de la confirmación). Lo que se ponga dispara "Se le puso una etiqueta".
 */
export async function receiveSubmission(db: Db, conn: Pick<ConnectionRow, "id" | "slug" | "name" | "tag_ids">, sub: Submission, via: Via, opts: { confirmedAt?: string; depth?: number } = {}):
  Promise<{ result: ReceiveResult; contactId: string }> {
  const existing = must(await db.from("crm_contacts").select("id, name, phone, country, timezone, user_id, fields, email_consent").eq("email", sub.email).maybeSingle()) as Existing | null;
  let id: string;
  let created = false;
  if (existing) {
    id = existing.id;
    const patch = contactPatch(existing, sub);
    if (Object.keys(patch).length) must(await db.from("crm_contacts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("id"));
  } else {
    const r = await db.from("crm_contacts").insert({
      email: sub.email, name: sub.name, phone: sub.phone, country: sub.country, timezone: sub.timezone, locale: sub.locale ?? "es",
      source: "web", source_detail: conn.name.slice(0, 80), fields: sub.fields,
    }).select("id").single();
    // Otro envío del mismo correo llegó a la vez: se vuelve a leer (una sola vez; si se repite, es otro problema).
    if (r.error?.code === "23505") {
      if ((opts.depth ?? 0) >= 1) fail("conflict");
      return receiveSubmission(db, conn, sub, via, { ...opts, depth: (opts.depth ?? 0) + 1 });
    }
    id = (must(r) as { id: string }).id;
    created = true;
  }

  // Etiquetas: primero se quitan (p. ej. "evento-sept-2026-no-pago" al pagar), después se ponen (las de la conexión y las que mandó el servidor).
  const all = must(await db.from("crm_tags").select("id, name, system_key")) as { id: string; name: string; system_key: string | null }[];
  for (const name of new Set(sub.removeTags)) {
    const tag = findTagByName(all, name);
    if (tag && !tag.system_key) await removeTag(db, id, tag.id);
  }
  const toAdd = new Set(conn.tag_ids.filter((t) => all.some((x) => x.id === t && !x.system_key)));
  for (const name of new Set(sub.tags)) {
    const tag = findTagByName(all, name);
    if (tag?.system_key) continue; // las de sistema salen del estado de la cuenta
    if (tag) { toAdd.add(tag.id); continue; }
    const ins = await db.from("crm_tags").insert({ name }).select("id, name, system_key").maybeSingle();
    const row = ins.data as { id: string; name: string; system_key: string | null } | null;
    if (row) { all.push(row); toAdd.add(row.id); }
  }
  for (const tagId of toAdd) await addTag(db, id, tagId, "ingest");

  // Consentimiento: solo con la casilla marcada. Un envío normal nunca levanta una baja (p_lift = false).
  // El clic de confirmación desde el propio correo sí levanta una baja de correo que pidió la persona (decisión de
  // Jonathan, 25 nov 2026): demuestra que la dirección es suya y que lo quiere. Va con la fuente `confirma:<slug>`, así
  // crm_apply_consent solo levanta una supresión 'unsubscribe' (nunca 'manual', rebote, queja ni STOP).
  let result: ReceiveResult = via === "test" ? "test" : via === "confirm" ? "confirmed" : created ? "created" : "updated";
  if (via !== "test") {
    const evidence = { text: sub.evidence.text || DEFAULT_CONSENT_TEXT, url: sub.evidence.url, ip: sub.evidence.ip, userAgent: sub.evidence.userAgent, form: `conexion:${conn.slug}`, confirmedAt: opts.confirmedAt };
    const source = `${via === "confirm" ? "confirma" : "conexion"}:${conn.slug}`.slice(0, 60);
    if (sub.consentEmail) {
      const r = must(await db.rpc("crm_apply_consent", { p_contact: id, p_channel: "email", p_on: true, p_source: source, p_lift: via === "confirm", p_evidence: evidence })) as string;
      if (r === "suppressed") result = "suppressed";
    } else if (!existing?.email_consent && via !== "confirm") result = "no_consent";
    if (sub.consentSms) {
      const rule = ingestSmsDecision(sub.phone, existing ? existing.phone : null);
      if (rule.sms) await db.rpc("crm_apply_consent", { p_contact: id, p_channel: "sms", p_on: true, p_source: source, p_lift: false, p_evidence: evidence });
    }
  }

  const ref = `${conn.id}:${stamp()}`;
  await recordEvent(db, id, "web_connection", ref);
  if (via === "confirm") await recordEvent(db, id, "email_confirmed", ref);
  const log = await db.from("crm_connection_log").insert({ connection_id: conn.id, via, result, contact_id: id });
  if (log.error) console.error("[crm-conexion] registro", log.error.code ?? "");
  return { result, contactId: id };
}

// ───────── Confirmación por correo ─────────
const PayloadSchema = z.object({
  email: z.string().email(), name: z.string().default(""), phone: z.string().nullable().default(null), country: z.string().nullable().default(null),
  timezone: z.string().nullable().default(null), locale: z.enum(["es", "en"]).nullable().default(null),
  consentEmail: z.boolean().default(false), consentSms: z.boolean().default(false),
  tags: z.array(z.string()).default([]), removeTags: z.array(z.string()).default([]), fields: z.record(z.string(), z.string()).default({}),
  mode: z.enum(["upsert", "fill"]).default("fill"),
  evidence: z.object({ text: z.string().optional(), url: z.string().optional(), ip: z.string().optional(), userAgent: z.string().optional() }).default({}),
});

const CONFIRM_TEXT = {
  es: { subject: "Confirma tu correo", heading: "Confirma tu correo", text: "Recibimos tus datos en un formulario de Revolución del Dinero. Para terminar, confirma que este correo es tuyo.\n\nSi no fuiste tú, ignora este mensaje: no pasará nada.", button: "Confirmar mi correo", signature: "Revolución del Dinero" },
  en: { subject: "Confirm your email", heading: "Confirm your email", text: "We got your details through a Revolución del Dinero form. To finish, confirm this email is yours.\n\nIf it wasn't you, ignore this message: nothing will happen.", button: "Confirm my email", signature: "Revolución del Dinero" },
} as const;
export const confirmUrl = (token: string) => `${appUrl()}/api/crm/confirmar?t=${token}`;

/** Tope global de correos de confirmación por hora (todas las conexiones juntas): frena una ráfaga con correos distintos. */
export const CONFIRM_PER_HOUR = 200;

/**
 * "Pedir confirmación por correo": nada se aplica (ni contacto, ni etiquetas, ni eventos) hasta el clic. Guarda lo que
 * llegó y manda un correo transaccional con el enlace. Para que nadie use el formulario para bombardear una dirección:
 * máximo un correo cada 10 minutos y 3 por día por dirección, CONFIRM_PER_HOUR por hora en total, y nunca a una
 * dirección que rebotó o se quejó. Sin los datos legales completos el correo no sale (como todo correo del CRM).
 * "Lo que va llegando" distingue pendiente (salió el correo), frenado por el límite y de baja (no salió).
 */
export async function requestConfirmation(db: Db, conn: Pick<ConnectionRow, "id" | "slug">, sub: Submission, via: "browser" | "server"): Promise<"sent" | "throttled" | "suppressed" | "not_sent"> {
  const emailHash = emailHmac(sub.email); // sin CRM_HASH_KEY lanza: no se guarda nada
  const log = async (result: "pending" | "throttled" | "suppressed") => {
    const r = await db.from("crm_connection_log").insert({ connection_id: conn.id, via, result });
    if (r.error) console.error("[crm-conexion] registro", r.error.code ?? "");
  };
  const supp = must(await db.from("crm_suppressions").select("reason").eq("channel", "email").eq("value", sub.email).is("lifted_at", null).maybeSingle()) as { reason: string } | null;
  if (!mayTransactional(sub.email, supp?.reason ?? null).ok) { await log("suppressed"); return "suppressed"; }
  const recent = must(await db.from("crm_pending_confirmations").select("created_at").eq("email_hash", emailHash).gte("created_at", new Date(Date.now() - 86_400_000).toISOString())) as { created_at: string }[];
  if (recent.length >= 3 || recent.some((r) => Date.parse(r.created_at) > Date.now() - 10 * 60_000)) { await log("throttled"); return "throttled"; }
  const hour = await db.from("crm_pending_confirmations").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if (hour.error) throw new Error(`db: ${hour.error.code ?? ""}`);
  if ((hour.count ?? 0) >= CONFIRM_PER_HOUR) { await log("throttled"); return "throttled"; }
  const token = randomBytes(32).toString("hex");
  must(await db.from("crm_pending_confirmations").insert({ connection_id: conn.id, token_hash: sha256(token), email_hash: emailHash, payload: sub }).select("id"));
  await log("pending");
  const legal = await loadLegal(db);
  if (!legalReady(legal) || !crmFrom()) return "not_sent";
  const locale = sub.locale ?? "es";
  const t = CONFIRM_TEXT[locale];
  const r = renderMarketingEmail({
    subject: t.subject, preheader: t.text.split("\n")[0], locale, appUrl: appUrl(), name: sub.name || null, legal, token: null, fromLabel: "", transactional: true,
    blocks: [{ type: "heading", text: t.heading }, { type: "text", text: t.text }, { type: "button", text: t.button, href: confirmUrl(token) }, { type: "signature", text: t.signature }],
  });
  const res = await sendEmailDetailed(sub.email, r, "crm_confirm", { from: crmFrom(), replyTo: crmReplyTo() });
  return res.status === "sent" ? "sent" : "not_sent";
}

export const isConfirmToken = (t: unknown): t is string => typeof t === "string" && /^[a-f0-9]{64}$/.test(t);

/** Clic en "Confirmar mi correo" (POST desde la página de confirmación, nunca el GET que abren los antivirus). */
export async function confirmPending(db: Db, token: unknown): Promise<{ ok: true; locale: "es" | "en"; thanksUrl: string | null } | { ok: false }> {
  if (!isConfirmToken(token)) return { ok: false };
  const row = must(await db.from("crm_pending_confirmations").select("id, connection_id, payload, expires_at, confirmed_at").eq("token_hash", sha256(token)).maybeSingle()) as
    { id: string; connection_id: string; payload: unknown; expires_at: string; confirmed_at: string | null } | null;
  if (!row || row.confirmed_at || Date.parse(row.expires_at) < Date.now()) return { ok: false };
  const p = PayloadSchema.safeParse(row.payload);
  if (!p.success) return { ok: false };
  const at = new Date().toISOString();
  const claimed = must(await db.from("crm_pending_confirmations").update({ confirmed_at: at }).eq("id", row.id).is("confirmed_at", null).select("id")) as unknown[];
  if (!claimed.length) return { ok: false };
  const conn = must(await db.from("crm_connections").select(CONNECTION_COLS).eq("id", row.connection_id).maybeSingle()) as ConnectionRow | null;
  try {
    if (!conn) throw new Error("not_found");
    await receiveSubmission(db, conn, p.data, "confirm", { confirmedAt: at });
  } catch (e) {
    // No se aplicó: el enlace vuelve a servir (si no, la persona perdería su envío).
    await db.from("crm_pending_confirmations").update({ confirmed_at: null }).eq("id", row.id);
    if (e instanceof Error && e.message === "not_found") return { ok: false };
    throw e;
  }
  must(await db.from("crm_pending_confirmations").update({ payload: {} }).eq("id", row.id).select("id")); // ya no hace falta guardar lo que llegó
  return { ok: true, locale: p.data.locale ?? "es", thanksUrl: conn!.thanks_url };
}

/** Días que se guarda una fila de confirmación (ya vacía) antes de borrarla: más que la ventana del límite (24 h). */

/**
 * El motor vacía lo que llegó en las confirmaciones vencidas (nadie confirmó: no quedan sus datos). Las filas NO se
 * borran (CLAUDE.md regla 0, decisión de Jonathan: nunca se borra en la base): quedan solo el hash del token y la huella
 * HMAC del correo, sin datos personales legibles.
 */
export async function clearExpiredConfirmations(db: Db): Promise<{ cleared: number; deleted: number }> {
  const notReady = (e: { code?: string; message?: string }) => /PGRST20[25]|42P01/.test(`${e.code} ${e.message}`); // migración 038 sin aplicar
  const r = await db.from("crm_pending_confirmations").update({ payload: {} }).lt("expires_at", new Date().toISOString()).neq("payload", "{}").select("id");
  if (r.error) {
    if (notReady(r.error)) return { cleared: 0, deleted: 0 };
    throw new Error(`db: ${r.error.code ?? ""} ${r.error.message}`);
  }
  return { cleared: (r.data ?? []).length, deleted: 0 };
}

// ───────── Panel (sesión del Dueño) ─────────
export type ConnectionListItem = ConnectionRow & { contacts: number; lastAt: string | null };
export async function listConnections(db: Db): Promise<ConnectionListItem[]> {
  const [rows, stats] = await Promise.all([db.from("crm_connections").select(CONNECTION_COLS).order("created_at"), db.rpc("crm_connection_stats")]);
  const by = new Map((must(stats) as { connection_id: string; contacts: number; last_at: string | null }[]).map((s) => [s.connection_id, s]));
  return (must(rows) as ConnectionRow[]).map((c) => ({ ...c, contacts: Number(by.get(c.id)?.contacts ?? 0), lastAt: by.get(c.id)?.last_at ?? null }));
}

export type ConnectionLogItem = { at: string; via: string; result: string; count: number; email: string | null };
/** "Lo que va llegando": los últimos envíos de una conexión con su resultado (los rechazos, agrupados por hora). */
export async function connectionLog(db: Db, id: string, limit = 12): Promise<ConnectionLogItem[]> {
  const rows = must(await db.from("crm_connection_log").select("at, via, result, count, crm_contacts(email)").eq("connection_id", id).order("at", { ascending: false }).limit(limit)) as
    { at: string; via: string; result: string; count: number; crm_contacts: { email: string } | { email: string }[] | null }[];
  return rows.map((r) => ({ at: r.at, via: r.via, result: r.result, count: r.count, email: (Array.isArray(r.crm_contacts) ? r.crm_contacts[0]?.email : r.crm_contacts?.email) ?? null }));
}

async function ownTagsExist(db: Db, ids: string[]) {
  if (!ids.length) return;
  const tags = must(await db.from("crm_tags").select("id, system_key").in("id", ids)) as { id: string; system_key: string | null }[];
  if (ids.some((id) => !tags.some((t) => t.id === id && !t.system_key))) fail("invalid_tag");
}

/** "+ Nueva conexión" y cada cambio (etiquetas, páginas, confirmación por correo, URL de gracias). Devuelve su id. */
export async function saveConnection(db: Db, input: unknown): Promise<string> {
  const p = ConnectionInput.safeParse(input);
  if (!p.success) fail("invalid");
  const d = p.data!;
  const origins = [...new Set(d.origins)];
  const thanks = d.thanksUrl?.trim() || null;
  if (!thanksUrlOk(thanks, origins)) fail("thanks_url");
  const tagIds = [...new Set(d.tagIds)];
  await ownTagsExist(db, tagIds);
  const row = { name: d.name, tag_ids: tagIds, origins, thanks_url: thanks, double_opt_in: d.doubleOptIn, updated_at: new Date().toISOString() };
  if (d.id) {
    const r = must(await db.from("crm_connections").update(row).eq("id", d.id).select("id")) as unknown[];
    if (!r.length) fail("not_found");
    return d.id;
  }
  const taken = (must(await db.from("crm_connections").select("slug")) as { slug: string }[]).map((r) => r.slug);
  const r = await db.from("crm_connections").insert({ ...row, slug: connectionSlug(d.name, taken) }).select("id").single();
  if (r.error?.code === "23505") fail("exists");
  return (must(r) as { id: string }).id;
}

/** "Pausar" / "Activar": pausada, todo envío se rechaza (y queda en "Lo que va llegando"). */
export async function setConnectionStatus(db: Db, id: string, status: "active" | "paused"): Promise<void> {
  const r = must(await db.from("crm_connections").update({ status, updated_at: new Date().toISOString() }).eq("id", id).select("id")) as unknown[];
  if (!r.length) fail("not_found");
}

/** "Mostrar" / "Copiar" la clave secreta (solo el Dueño, a pedido; nunca viaja en la página). */
export async function revealConnectionSecret(db: Db, id: string): Promise<string> {
  const r = must(await db.from("crm_connections").select("secret").eq("id", id).maybeSingle()) as { secret: string } | null;
  return r?.secret ?? fail("not_found");
}

/** "Regenerar": la clave anterior deja de servir en el acto. */
export async function regenerateConnectionSecret(db: Db, id: string): Promise<string> {
  const secret = `rk_live_${randomBytes(16).toString("hex")}`;
  if (!isSecretFormat(secret)) fail("invalid");
  const r = must(await db.from("crm_connections").update({ secret, updated_at: new Date().toISOString() }).eq("id", id).select("id")) as unknown[];
  if (!r.length) fail("not_found");
  return secret;
}

/**
 * "Enviar contacto de prueba": crea o actualiza prueba+<conexión>@revolucion360.test con las etiquetas de la conexión y
 * deja "Llegó por una conexión web" (así se ve qué automatización arranca). Nunca recibe correos ni SMS: el motor lo salta.
 */
export async function sendConnectionTest(db: Db, id: string): Promise<string> {
  const conn = must(await db.from("crm_connections").select(CONNECTION_COLS).eq("id", id).maybeSingle()) as ConnectionRow | null;
  if (!conn) fail("not_found");
  const email = testEmailFor(conn!.slug);
  await receiveSubmission(db, conn!, {
    email, name: "Contacto de prueba", phone: null, country: null, timezone: null, locale: "es", consentEmail: false, consentSms: false,
    tags: [], removeTags: [], fields: {}, mode: "upsert", evidence: {},
  }, "test");
  return email;
}

// ───────── Ajustes anti-bots ─────────
/** La clave del SITIO de Turnstile va en app_config (es pública: va en el HTML). La SECRETA vive solo en TURNSTILE_SECRET_KEY. */
export async function getAntiBot(db: Db): Promise<{ siteKey: string; secretSet: boolean }> {
  const r = await db.from("app_config").select("value").eq("key", "turnstile").maybeSingle();
  const v = (r.data?.value ?? {}) as { siteKey?: unknown };
  return { siteKey: typeof v.siteKey === "string" ? v.siteKey : "", secretSet: !!(process.env.TURNSTILE_SECRET_KEY ?? "").trim() };
}
export async function saveTurnstileSiteKey(db: Db, siteKey: string): Promise<void> {
  const k = siteKey.trim();
  if (k && !/^[0-9A-Za-z_-]{10,120}$/.test(k)) fail("site_key");
  must(await db.from("app_config").upsert({ key: "turnstile", value: { siteKey: k }, updated_at: new Date().toISOString() }).select("key"));
}

// ───────── Importar desde systeme.io ─────────
/** Vista previa: qué correos ya existen en el CRM (nuevos vs. actualizados) y qué etiquetas ya existen. Solo lee. */
export async function systemeLookup(db: Db, emails: string[], tags: string[]): Promise<{ existing: string[]; existingTags: string[] }> {
  const existing: string[] = [];
  const list = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))].slice(0, 2000);
  for (let i = 0; i < list.length; i += 100) { // van en la dirección de la consulta: tandas cortas
    const rows = must(await db.from("crm_contacts").select("email").in("email", list.slice(i, i + 100))) as { email: string }[];
    existing.push(...rows.map((r) => r.email));
  }
  const all = tags.length ? (must(await db.from("crm_tags").select("name")) as { name: string }[]) : [];
  return { existing, existingTags: tags.filter((t) => findTagByName(all, t)) };
}

type ExistingImport = {
  id: string; name: string; phone: string | null; country: string | null; timezone: string | null; user_id: string | null;
  fields: Record<string, string> | null; email_consent: boolean; email_unsubscribed_at: string | null;
};
/**
 * Una tanda del CSV de systeme.io (filas ya mapeadas en el navegador; el servidor vuelve a validar). Une por correo:
 * completa nombre, teléfono, país y campos del acompañante SOLO si faltan; la fecha de registro solo en contactos nuevos
 * (`created_at`). Crea las etiquetas que falten y las pone SIN disparar automatizaciones (el evento queda en el
 * historial ya procesado: importar no le manda nada a nadie). Idempotente: volver a importar el mismo archivo no
 * duplica ni cambia consentimientos (no se vuelve a llamar al consentimiento de quien ya lo tiene o ya está de baja).
 * - Dado de baja (columna de baja o archivo de bajas) → `crm_set_consent(off)`: supresión "baja" con constancia.
 * - Etiqueta `newsletter` → consentimiento de correo, fuente `systeme:newsletter`, constancia "Suscrito al newsletter en
 *   systeme.io" con la fecha de registro. `crm_set_consent` = `crm_apply_consent` con `p_lift = false`: nunca levanta una baja.
 * - Columna de consentimiento con "sí" + constancia escrita por el Dueño → igual, fuente `import:systeme`.
 * - Los demás, sin consentimiento de marketing. El acompañante nunca es un contacto ni recibe consentimiento.
 */
export async function importSysteme(db: Db, rows: unknown[], opts: { consentSource?: string } = {}):
  Promise<{ created: number; updated: number; invalid: number; unsubscribed: number; consented: number; consentSkipped: number; alreadyConsented: number }> {
  let created = 0, updated = 0, invalid = 0, unsubscribed = 0, consented = 0, consentSkipped = 0, alreadyConsented = 0;
  const all = must(await db.from("crm_tags").select("id, name, system_key")) as { id: string; name: string; system_key: string | null }[];
  const tagId = async (name: string): Promise<string | null> => {
    const t = findTagByName(all, name);
    if (t) return t.system_key ? null : t.id;
    const ins = await db.from("crm_tags").insert({ name }).select("id, name, system_key").maybeSingle();
    if (ins.data) { all.push(ins.data as (typeof all)[number]); return (ins.data as { id: string }).id; }
    const again = findTagByName(must(await db.from("crm_tags").select("id, name, system_key")) as typeof all, name); // la creó otra tanda a la vez
    return again && !again.system_key ? again.id : null;
  };
  const now = new Date().toISOString();
  for (const raw of rows.slice(0, 100)) {
    const p = SystemeRowSchema.safeParse(raw);
    if (!p.success) { invalid++; continue; }
    const d = p.data;
    const country = d.country || null;
    const phone = d.phone || null;
    const existing = must(await db.from("crm_contacts")
      .select("id, name, phone, country, timezone, user_id, fields, email_consent, email_unsubscribed_at").eq("email", d.email).maybeSingle()) as ExistingImport | null;
    let id: string;
    if (existing) {
      const patch = contactPatch(existing, { name: d.name, phone, country, timezone: null, fields: d.fields, mode: "fill" });
      if (Object.keys(patch).length) must(await db.from("crm_contacts").update({ ...patch, updated_at: now }).eq("id", existing.id).select("id"));
      id = existing.id;
      updated++;
    } else {
      const r = must(await db.from("crm_contacts").insert({
        email: d.email, name: d.name, phone, country, fields: d.fields, source: "importado", source_detail: "systeme.io", ...(d.createdAt ? { created_at: d.createdAt } : {}),
      }).select("id").single()) as { id: string };
      id = r.id;
      must(await db.from("crm_events").upsert({ contact_id: id, kind: "imported", ref: "systeme", processed_at: now }, { onConflict: "contact_id,kind,ref", ignoreDuplicates: true }).select("id"));
      created++;
    }
    for (const name of d.tags) {
      const t = await tagId(name);
      if (!t) continue;
      const ins = must(await db.from("crm_contact_tags").upsert({ contact_id: id, tag_id: t, added_by: "import" }, { onConflict: "contact_id,tag_id", ignoreDuplicates: true }).select("tag_id")) as unknown[];
      if (ins.length) {
        // Historial sin disparar automatizaciones (ya procesado).
        must(await db.from("crm_events").upsert({ contact_id: id, kind: "tag_added", ref: cleanRef(`${t}:import`), processed_at: now }, { onConflict: "contact_id,kind,ref", ignoreDuplicates: true }).select("id"));
      }
    }
    const action = systemeConsentAction(d, existing, !!opts.consentSource);
    if (action === "off") must(await db.rpc("crm_set_consent", { p_contact: id, p_channel: "email", p_on: false, p_source: "import:systeme", p_evidence: { form: "import:systeme" } }));
    if (action === "off" || action === "already_off") { unsubscribed++; continue; }
    if (action === "already_on") { alreadyConsented++; continue; } // idempotente: no se vuelve a marcar
    if (action === "skip_unsubscribed") { consentSkipped++; continue; } // nunca levanta una baja
    if (action === "none") continue;
    const res = must(await db.rpc("crm_set_consent", action === "on_newsletter"
      ? { p_contact: id, p_channel: "email", p_on: true, p_source: SYSTEME_NEWSLETTER_SOURCE, p_evidence: newsletterEvidence(d.createdAt) }
      : { p_contact: id, p_channel: "email", p_on: true, p_source: "import:systeme", p_evidence: { text: opts.consentSource!.slice(0, 500), form: "import:systeme" } })) as string;
    if (res === "suppressed") consentSkipped++; else consented++;
  }
  return { created, updated, invalid, unsubscribed, consented, consentSkipped, alreadyConsented };
}
