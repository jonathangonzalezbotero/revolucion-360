// CRM: Conexiones web (mockup AdminConexiones). PURO: sin base de datos ni red (tests/conexiones.test.ts).
// Lee lo que manda un formulario (navegador con Turnstile o servidor con la clave de la conexión), decide qué se puede
// cambiar del contacto, revisa páginas permitidas y arma el código para pegar. Nunca acepta montos.
import { z } from "zod";
import { toE164 } from "./phone";
import { formKey } from "./schema";
import { isValidTz } from "./time";

// ───────── Forma de una conexión (panel) ─────────
/** "revoluciondeldinero.com", "webinar.revoluciondeldinero.com" o "*.revoluciondeldinero.com" (sus subdominios). */
export const HOST_RE = /^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
/**
 * Sufijos públicos: dominios donde CUALQUIERA puede tener un subdominio (hostings gratis, segundos niveles de país). Un
 * comodín sobre ellos ("*.vercel.app", "*.co.uk") dejaría enviar desde la página de cualquier persona. Lista corta de los
 * comunes (no es la Public Suffix List completa) + la regla de segundo nivel de país ("co.uk", "com.au", "gov.co"…).
 */
export const PUBLIC_SUFFIXES = new Set([
  "vercel.app", "now.sh", "netlify.app", "netlify.com", "github.io", "gitlab.io", "pages.dev", "workers.dev", "herokuapp.com", "web.app",
  "firebaseapp.com", "appspot.com", "azurewebsites.net", "azurestaticapps.net", "cloudfront.net", "amazonaws.com", "amplifyapp.com",
  "onrender.com", "fly.dev", "railway.app", "glitch.me", "repl.co", "replit.app", "replit.dev", "blogspot.com", "wordpress.com",
  "wixsite.com", "squarespace.com", "myshopify.com", "webflow.io", "framer.app", "framer.website", "carrd.co", "ngrok.io",
  "ngrok-free.app", "ngrok.app", "trycloudflare.com", "surge.sh", "neocities.org", "systeme.io", "hubspotpagebuilder.com",
  "godaddysites.com", "weebly.com", "jimdosite.com", "site123.me", "strikingly.com", "notion.site", "super.site", "translate.goog",
]);
const SECOND_LEVEL = new Set(["co", "com", "net", "org", "gov", "gob", "edu", "ac", "mil", "nom", "ltd", "plc", "or", "ne", "go", "id", "asn", "info"]);
/** ¿Este dominio es un sufijo público (no se le puede poner "*.")? */
export function isPublicSuffix(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, "");
  if (PUBLIC_SUFFIXES.has(h)) return true;
  const parts = h.split(".");
  return parts.length === 1 || (parts.length === 2 && parts[1].length === 2 && SECOND_LEVEL.has(parts[0])); // "co.uk", "com.au", "gov.co"
}
/** ¿Sirve como página permitida? Forma válida y, si es comodín, nunca sobre un sufijo público. */
export const originOk = (host: string) => HOST_RE.test(host) && host.length <= 253 && !(host.startsWith("*.") && isPublicSuffix(host.slice(2)));

/** Lo que escribe el Dueño en "+ Página" → nombre de dominio limpio ("https://www.x.com/bootcamp" → "www.x.com"). null si no sirve. */
export function normalizeHost(input: string): string | null {
  let v = input.trim().toLowerCase();
  if (!v) return null;
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/\.$/, "");
  return originOk(v) ? v : null;
}

export const ConnectionInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  tagIds: z.array(z.string().uuid()).max(10).default([]),
  // Nunca un comodín sobre un sufijo público ("*.vercel.app", "*.co.uk"): dejaría enviar desde la página de cualquiera.
  origins: z.array(z.string().trim().toLowerCase().refine(originOk, "origin")).max(20).default([]),
  thanksUrl: z.string().trim().max(500).nullable().default(null),
  doubleOptIn: z.boolean().default(false),
});
export type ConnectionDraft = z.infer<typeof ConnectionInput>;

/** Parte final de la dirección: del nombre ("Webinar enero 2027" → "webinar-enero-2027"); si choca, con un número. */
export function connectionSlug(name: string, taken: Iterable<string>): string {
  const base = formKey(name).slice(0, 50) || "conexion";
  const used = new Set(taken);
  if (!used.has(base) && base.length >= 2) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
}

// ───────── Páginas permitidas ─────────
/** ¿Este dominio está en la lista? Exacto (o con "www."), o subdominio si la entrada es "*.dominio". Nunca `endsWith` suelto. */
export function hostAllowed(host: string, origins: readonly string[]): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, "");
  if (!h) return false;
  return origins.some((o) => {
    if (o.startsWith("*.")) {
      const root = o.slice(2);
      return h === root || h.endsWith(`.${root}`);
    }
    return h === o || h === `www.${o}`;
  });
}
/** Origin (o, si falta, Referer) de la petición → dominio permitido. https obligatorio (http solo para localhost). */
export function requestOriginAllowed(origin: string | null, referer: string | null, origins: readonly string[]): { ok: boolean; host: string | null; origin: string | null } {
  const raw = origin && origin !== "null" ? origin : referer;
  if (!raw) return { ok: false, host: null, origin: null };
  try {
    const u = new URL(raw);
    const secure = u.protocol === "https:" || (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"));
    return { ok: secure && hostAllowed(u.hostname, origins), host: u.hostname, origin: `${u.protocol}//${u.host}` };
  } catch {
    return { ok: false, host: null, origin: null };
  }
}
/** URL de gracias: https y de una de las páginas permitidas (nunca se toma de la petición: la guarda el Dueño). */
export function thanksUrlOk(url: string | null | undefined, origins: readonly string[]): boolean {
  if (!url) return true;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && hostAllowed(u.hostname, origins) && url.length <= 500;
  } catch {
    return false;
  }
}

// ───────── Turnstile ─────────
export type TurnstileReply = { success?: boolean; hostname?: string; "error-codes"?: string[] };
/** El comprobante vale si Cloudflare dice que sí Y se resolvió en una de las páginas permitidas. */
export const turnstileOk = (r: TurnstileReply | null, origins: readonly string[]) => !!r?.success && !!r.hostname && hostAllowed(r.hostname, origins);
export const TURNSTILE_FIELD = "cf-turnstile-response";

// ───────── Lo que llega ─────────
export const SUBMISSION_MAX_BYTES = 8 * 1024;
const YES = new Set(["true", "1", "on", "si", "sí", "yes", "y", "x"]);
const yes = (v: unknown) => v === true || (typeof v === "string" && YES.has(v.trim().toLowerCase()));
const str = (v: unknown, max: number) => (typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, max) : "");

/** Nombres de campo que se reconocen (español del mockup e inglés; los de systeme.io también). El resto son campos extra. */
const ALIASES: Record<string, string> = {
  correo: "email", email: "email", "e-mail": "email", mail: "email",
  nombre: "name", name: "name", nombre_completo: "name", full_name: "name", first_name: "firstName", firstname: "firstName",
  apellido: "surname", apellidos: "surname", surname: "surname", last_name: "surname", lastname: "surname",
  telefono: "phone", "teléfono": "phone", phone: "phone", phone_number: "phone", celular: "phone", whatsapp: "phone",
  pais: "country", "país": "country", country: "country", zona: "timezone", timezone: "timezone", idioma: "locale", locale: "locale",
  acepta_correos: "consentEmail", consent_email: "consentEmail", acepta_sms: "consentSms", consent_sms: "consentSms",
  texto_consentimiento: "consentText",
};
/** Nunca se guardan como campo extra (controles del formulario, anti-bots, campos estructurados del servidor). */
const RESERVED = new Set([TURNSTILE_FIELD, "g-recaptcha-response", "h-captcha-response", "tags", "removetags", "remove_tags", "fields", "mode", "consent", "evidence", "submit", "_next", "redirect"]);
/**
 * Palabras de dinero (es/en): el CRM nunca guarda montos (CLAUDE.md regla 4). Se buscan como SUBCADENA de la clave ya
 * compactada (sin separadores, sin acentos, en minúsculas): "precio_entrada", "precioEntrada", "precioentrada",
 * "montoTotal" y "ticketPrice" se rechazan. Costo aceptado: algunas claves inocentes también caen ("feedback" y "coffee"
 * contienen "fee"; "audiencia" contiene "aud"): mejor perder un campo que guardar un monto.
 */
export const MONEY_WORDS = [
  "amount", "monto", "importe", "precio", "price", "total", "pago", "payment", "paid", "pay", "cost", "salario", "salary", "sueldo",
  "ingreso", "income", "deuda", "debt", "saldo", "balance", "valor", "value", "cents", "centavo", "dinero", "money",
  "tarifa", "fee", "cuota", "presupuesto", "budget", "ahorro", "saving", "dolar", "dollar", "euro", "peso", "usd", "aud", "mxn",
  "abono", "deposito", "deposit", "invest", "inversion", "cash", "efectivo",
] as const;
const compactKey = (key: string) => key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
/** ¿La clave habla de dinero? (subcadena, también camelCase y sin separadores). */
export const isMoneyKey = (key: string) => {
  const k = compactKey(key);
  return MONEY_WORDS.some((w) => k.includes(w));
};
/** Claves de teléfono o código postal: ahí un número largo es un teléfono o un código, no un monto. */
const NUMERIC_OK_KEY = /(^|_)(phone|telefono|tel|celular|cel|movil|mobile|whatsapp|postal|postcode|zip)/;
/**
 * ¿El valor tiene forma de monto? Un número puro de 3 o más cifras ("150", "-2500", "1500.50"), con separadores de miles
 * ("1.500", "1,500,000", "2 500", "1'500"), o cualquier cifra con símbolo o palabra de moneda ("$10", "20 AUD", "USD 5",
 * "10 dólares", "€3", "5k pesos"). Un teléfono con "+" o con espacios por bloques ("+61 412 345 678") no es un monto.
 */
export function looksLikeMoney(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/[$€£¥]/.test(v)) return true;
  const plain = v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\d/.test(plain) && /(^|[^a-z])(usd|aud|eur|cop|mxn|ars|clp|pen|nzd|cad|gbp|dolar(es)?|dollars?|euros?|pesos?|bucks)([^a-z]|$)/.test(plain)) return true;
  if (/^-?\d{3,}([.,]\d{1,2})?$/.test(v)) return true; // 150 · 2500 · 1500.50
  if (/^-?\d{1,3}([.,' \u00a0]\d{3})+([.,]\d{1,2})?$/.test(v)) return true; // 1.500 · 1,500,000 · 2 500 · 1'500
  return false;
}
/** Tope del total de campos extra (la base acepta hasta 4000 caracteres en crm_contacts.fields). */
export const FIELDS_MAX_CHARS = 3500;

/** Campos extra (p. ej. partners_name, ciudad): clave en minúsculas `a-z0-9_`, texto de máx. 200, máx. 20, sin montos. */
export function cleanFields(input: Record<string, unknown>): { fields: Record<string, string>; dropped: number } {
  const fields: Record<string, string> = {};
  let dropped = 0;
  for (const [k, v] of Object.entries(input)) {
    const key = formKey(k).replace(/-/g, "_").slice(0, 40);
    const val = str(v, 200);
    const moneyValue = looksLikeMoney(val) && !(NUMERIC_OK_KEY.test(key) && /^[+\d\s().-]+$/.test(val));
    if (!key || !/^[a-z][a-z0-9_]*$/.test(key) || isMoneyKey(k) || isMoneyKey(key) || moneyValue) { dropped++; continue; }
    if (!val) continue;
    if (Object.keys(fields).length >= 20 || JSON.stringify({ ...fields, [key]: val }).length > FIELDS_MAX_CHARS) { dropped++; continue; }
    fields[key] = val;
  }
  return { fields, dropped };
}

export type Evidence = { text?: string; url?: string; ip?: string; userAgent?: string };
export type Submission = {
  email: string; name: string; phone: string | null; country: string | null; timezone: string | null; locale: "es" | "en" | null;
  consentEmail: boolean; consentSms: boolean;
  /** Etiquetas por nombre (solo desde el servidor; desde el navegador, solo las de la conexión). */
  tags: string[]; removeTags: string[];
  fields: Record<string, string>;
  /** "upsert" actualiza nombre, país y zona; "fill" solo llena lo vacío (check-in). Desde el navegador, siempre "fill". */
  mode: "upsert" | "fill";
  evidence: Evidence;
};
export const DEFAULT_CONSENT_TEXT = "Quiero recibir correos de Revolución del Dinero";

const tagList = (v: unknown) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [])
  .map((t) => str(t, 40)).filter(Boolean).slice(0, 10);

/**
 * Normaliza lo que llegó. `trusted` = vino con la clave secreta de la conexión (desde un servidor): solo entonces se
 * aceptan etiquetas propias, quitar etiquetas, "upsert" y la constancia que manda. Desde el navegador cualquiera puede
 * enviar cualquier correo: solo se ponen las etiquetas de la conexión y solo se llenan campos vacíos.
 */
export function parseSubmission(body: Record<string, unknown>, trusted: boolean): { ok: true; sub: Submission } | { ok: false; error: "email" | "invalid" } {
  const known: Record<string, unknown> = {};
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    const lk = k.trim().toLowerCase();
    const alias = Object.hasOwn(ALIASES, lk) ? ALIASES[lk] : undefined; // nunca "constructor", "__proto__"…
    if (alias) known[alias] = v;
    else if (!RESERVED.has(lk) && (typeof v === "string" || typeof v === "number" || typeof v === "boolean")) extra[k] = v;
  }
  const email = z.string().trim().toLowerCase().email().max(254).safeParse(known.email);
  if (!email.success) return { ok: false, error: "email" };
  const nested = trusted && body.fields && typeof body.fields === "object" && !Array.isArray(body.fields) ? (body.fields as Record<string, unknown>) : {};
  const { fields } = cleanFields({ ...extra, ...nested });

  const rawCountry = str(known.country, 60);
  const country = /^[A-Za-z]{2}$/.test(rawCountry) ? rawCountry.toUpperCase() : null;
  // "Australia" no es un código: queda como campo extra (nunca un monto: "2500 AUD" no se guarda).
  if (rawCountry && !country && !fields.pais && !looksLikeMoney(rawCountry)) fields.pais = rawCountry;
  const name = (str(known.name, 120) || [str(known.firstName, 60), str(known.surname, 60)].filter(Boolean).join(" ")).slice(0, 120);
  const rawPhone = str(known.phone, 30);
  const phone = rawPhone ? toE164(rawPhone, country) : null;
  const tz = str(known.timezone, 64);
  const loc = str(known.locale, 5).toLowerCase();

  const consent = trusted && body.consent && typeof body.consent === "object" ? (body.consent as Record<string, unknown>) : {};
  const ev = trusted && body.evidence && typeof body.evidence === "object" ? (body.evidence as Record<string, unknown>) : {};
  const mode = trusted && body.mode === "fill" ? "fill" : trusted ? "upsert" : "fill";
  return {
    ok: true,
    sub: {
      email: email.data, name, phone, country, timezone: tz && isValidTz(tz) ? tz : null, locale: loc === "es" || loc === "en" ? loc : null,
      consentEmail: yes(known.consentEmail) || yes(consent.email),
      // El SMS solo se acepta con la clave del servidor: desde el navegador `acepta_sms` se IGNORA (cualquiera puede escribir
      // cualquier número en una página pública y el número no se verifica). El correo sí (decisión de Jonathan).
      consentSms: trusted && (yes(known.consentSms) || yes(consent.sms)),
      tags: trusted ? tagList(body.tags) : [],
      removeTags: trusted ? tagList(body.removeTags ?? body.remove_tags) : [],
      fields, mode,
      evidence: {
        text: str(ev.text, 500) || str(known.consentText, 500) || undefined,
        url: str(ev.url, 500) || undefined, ip: str(ev.ip, 64) || undefined, userAgent: str(ev.userAgent, 300) || undefined,
      },
    },
  };
}

// ───────── Qué se cambia del contacto ─────────
export type ExistingContact = { name: string; phone: string | null; country: string | null; timezone: string | null; user_id: string | null; fields: Record<string, string> | null };
/**
 * Cambios para un contacto que ya existe.
 * - Nombre: "upsert" lo reemplaza salvo que el contacto tenga cuenta en la app (su nombre es el de su perfil); "fill" solo si está vacío.
 * - Teléfono: solo si no tenía (regla del ingreso: un número distinto nunca se pisa en silencio; ver ingestSmsDecision).
 * - País y zona: "upsert" los reemplaza (sin cuenta); "fill" solo si faltan.
 * - Campos extra: "upsert" reemplaza las claves que llegan; "fill" solo agrega las que faltan.
 */
export function contactPatch(c: ExistingContact, s: Pick<Submission, "name" | "phone" | "country" | "timezone" | "fields" | "mode">): Record<string, unknown> {
  const fill = s.mode === "fill" || !!c.user_id;
  const patch: Record<string, unknown> = {};
  if (s.name && (fill ? !c.name.trim() : s.name !== c.name)) patch.name = s.name;
  if (s.phone && !c.phone) patch.phone = s.phone;
  if (s.country && (fill ? !c.country : s.country !== c.country)) patch.country = s.country;
  if (s.timezone && (fill ? !c.timezone : s.timezone !== c.timezone)) patch.timezone = s.timezone;
  const cur = c.fields ?? {};
  const next = { ...cur };
  for (const [k, v] of Object.entries(s.fields)) if (s.mode === "upsert" ? cur[k] !== v : !(cur[k] ?? "").trim()) next[k] = v;
  if (Object.keys(next).length > 20 || JSON.stringify(next).length > FIELDS_MAX_CHARS) return patch; // tope de campos: no se agregan más
  if (JSON.stringify(next) !== JSON.stringify(cur)) patch.fields = next;
  return patch;
}

// ───────── Contacto de prueba ─────────
/** "Enviar contacto de prueba": nunca recibe correos ni SMS (el motor lo salta, aunque la automatización sea transaccional). */
export const testEmailFor = (slug: string) => `prueba+${slug}@revolucion360.test`;
export const isConnectionTestEmail = (email: string) => /^prueba\+[a-z0-9-]+@revolucion360\.test$/.test(email.trim().toLowerCase());

// ───────── Transaccional ─────────
/**
 * Un correo transaccional (de una compra o un acceso) sale sin consentimiento de marketing y aunque la persona se haya
 * dado de baja del marketing, pero NUNCA a una dirección que rebotó o se quejó (supresión dura) ni al contacto de prueba.
 */
export function mayTransactional(email: string, suppressionReason: string | null): { ok: true } | { ok: false; reason: "suppressed" | "test_contact" } {
  if (isConnectionTestEmail(email)) return { ok: false, reason: "test_contact" };
  if (suppressionReason === "bounce" || suppressionReason === "complaint") return { ok: false, reason: "suppressed" };
  return { ok: true };
}

// ───────── Lo que se muestra en el panel ─────────
export const maskSecret = (secret: string) => (secret.startsWith("rk_live_") ? "rk_live_••••••••••••" : "••••••••••••");
export const isSecretFormat = (v: string) => /^rk_live_[0-9a-f]{32}$/.test(v);
export const connectionPath = (slug: string) => `/api/crm/conexiones/${slug}`;
export const connectionUrl = (appUrl: string, slug: string) => `${appUrl.replace(/\/+$/, "")}${connectionPath(slug)}`;

/** "Código para tu formulario" del mockup, con la dirección real y la clave del sitio de Turnstile. */
export function formSnippet(url: string, siteKey: string | null, t: { name: string; consent: string; button: string; siteKeyMissing: string }): string {
  return [
    `<form action="${url}" method="POST">`,
    `  <input name="nombre" placeholder="${t.name}">`,
    `  <input name="correo" type="email" required>`,
    `  <label><input type="checkbox" name="acepta_correos" value="true">`,
    `    ${t.consent}</label>`,
    `  <div class="cf-turnstile" data-sitekey="${siteKey || t.siteKeyMissing}"></div>`,
    `  <button>${t.button}</button>`,
    `</form>`,
    `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async></script>`,
  ].join("\n");
}
export const SAMPLE_JSON = '{\n  "nombre": "Ana Morales",\n  "correo": "ana@correo.com",\n  "pais": "AU",\n  "acepta_correos": true\n}';

// ───────── Importar desde systeme.io ─────────
export type SystemeColumn = "email" | "firstName" | "surname" | "phone" | "country" | "tags" | "unsubscribed" | "consent" | "createdAt";
export const SYSTEME_COLUMNS: SystemeColumn[] = ["email", "firstName", "surname", "phone", "country", "tags", "unsubscribed", "consent", "createdAt"];
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/[\s-]+/g, "_");
const SYSTEME_HEADERS: Record<SystemeColumn, string[]> = {
  email: ["email", "correo", "e_mail", "email_address"],
  firstName: ["first_name", "firstname", "nombre", "name"],
  surname: ["surname", "last_name", "lastname", "apellido", "apellidos"],
  phone: ["phone_number", "phone", "telefono", "celular"],
  country: ["country", "pais"],
  tags: ["tags", "etiquetas", "tag"],
  unsubscribed: ["unsubscribed", "is_unsubscribed", "unsubscribed_at", "desuscrito", "baja", "unsubscribe"],
  consent: ["consent", "consentimiento", "acepta_marketing", "marketing_consent", "gdpr_consent"],
  createdAt: ["created_at", "registered_at", "date_registered", "subscribed_at", "fecha_de_alta", "created"],
};
/** Adivina qué columna es cada dato (el Dueño lo puede cambiar en la vista previa). */
export function guessSystemeColumns(header: string[]): Partial<Record<SystemeColumn, number>> {
  const out: Partial<Record<SystemeColumn, number>> = {};
  header.forEach((h, i) => {
    const n = norm(h);
    for (const k of SYSTEME_COLUMNS) if (out[k] === undefined && SYSTEME_HEADERS[k].includes(n)) out[k] = i;
  });
  return out;
}

export type SystemeRow = { email: string; name: string; phone: string; country: string; tags: string[]; unsubscribed: boolean; consent: boolean; createdAt: string | null };
export const SYSTEME_MAX_ROWS = 20000;
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;
/** Una celda de baja: "true", "1", "yes", "sí", "unsubscribed", "baja"… o una fecha (unsubscribed_at con valor) = dado de baja. */
const UNSUB_WORDS = new Set(["unsubscribed", "unsubscribe", "desuscrito", "desuscrita", "baja", "de baja", "dado de baja", "dada de baja", "opted out", "opt-out", "optout"]);
const isUnsub = (v: string) => {
  const t = v.trim().toLowerCase();
  return YES.has(t) || UNSUB_WORDS.has(t) || /^\d{4}-\d{2}-\d{2}/.test(t);
};
const isoDate = (v: string) => {
  const t = Date.parse(v.trim());
  return v.trim() && Number.isFinite(t) && t > Date.parse("2000-01-01") && t < Date.now() + 86_400_000 ? new Date(t).toISOString() : null;
};

/** Filas listas para importar con el mapeo elegido, sin repetidos (gana la primera). */
export function mapSystemeRows(table: string[][], cols: Partial<Record<SystemeColumn, number>>): { rows: SystemeRow[]; invalid: number; duplicates: number } {
  const cell = (r: string[], k: SystemeColumn) => (cols[k] === undefined ? "" : (r[cols[k]!] ?? "").trim());
  const seen = new Set<string>();
  const rows: SystemeRow[] = [];
  let invalid = 0, duplicates = 0;
  for (const r of table) {
    const email = cell(r, "email").toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) { invalid++; continue; }
    if (seen.has(email)) { duplicates++; continue; }
    seen.add(email);
    const country = cell(r, "country");
    rows.push({
      email,
      name: [cell(r, "firstName"), cell(r, "surname")].filter(Boolean).join(" ").slice(0, 120),
      phone: cell(r, "phone").slice(0, 30),
      country: /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : "",
      tags: [...new Set(cell(r, "tags").split(/[|;,]/).map((x) => x.trim().slice(0, 40)).filter(Boolean))].slice(0, 20),
      unsubscribed: isUnsub(cell(r, "unsubscribed")),
      consent: YES.has(cell(r, "consent").toLowerCase()),
      createdAt: isoDate(cell(r, "createdAt")),
    });
  }
  return { rows, invalid, duplicates };
}

export const SystemeRowSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().max(120).default(""),
  phone: z.string().trim().max(30).default(""),
  country: z.string().trim().max(2).default(""),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  unsubscribed: z.boolean().default(false),
  consent: z.boolean().default(false),
  createdAt: z.string().datetime().nullable().default(null),
});
