// Cálculos puros de las pantallas del CRM en el panel (Contactos, Campañas de correo, Automatizaciones).
// Sin base de datos ni red: sirven en servidor y cliente. Probados en tests/admin-crm.test.ts. Nunca montos.
import { parseCsv } from "@/lib/engine/csv";
import { AUDIENCE_PRESETS, STAGES, type Audience, type AudiencePreset, type Block, type Stage } from "@/lib/crm/schema";

// ───────── Errores ─────────
/** Códigos cortos que lanzan las funciones de @/server/crm (docs/CRM.md) y que la pantalla traduce a un texto. */
export const CRM_ERRORS = ["invalid", "not_found", "exists", "phone", "not_editable", "legal_incomplete", "in_the_past", "invalid_tag", "suppressed"] as const;
export type CrmError = (typeof CRM_ERRORS)[number] | "generic";
export const crmErrorKey = (e: unknown): CrmError => {
  const msg = e instanceof Error ? e.message : "";
  return (CRM_ERRORS as readonly string[]).includes(msg) ? (msg as CrmError) : "generic";
};

/**
 * ¿El error es porque las tablas o funciones crm_* aún no existen (migración 20261125000036 sin aplicar)?
 * PostgREST: PGRST205 (tabla), PGRST202 (función); Postgres: 42P01 (relación), 42883 (función).
 */
export const crmMissing = (e: unknown) => /PGRST20[25]|42P01|42883|schema cache|does not exist/i.test(e instanceof Error ? e.message : String(e ?? ""));

// ───────── Fechas relativas (lista de contactos y actividad) ─────────
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
export type RelTexts = { now: string; min: string; hour: string; day: string; days: string };
/** "Hace 2 h", "Hace 1 día", "Hace 40 días". null = sin actividad. */
export function relativeTime(iso: string | null, now: Date, t: RelTexts): string | null {
  if (!iso) return null;
  const ms = Math.max(0, now.getTime() - new Date(iso).getTime());
  if (ms < MIN) return t.now;
  if (ms < HOUR) return t.min.replace("{n}", String(Math.floor(ms / MIN)));
  if (ms < DAY) return t.hour.replace("{n}", String(Math.floor(ms / HOUR)));
  const d = Math.floor(ms / DAY);
  return (d === 1 ? t.day : t.days).replace("{n}", String(d));
}

/** Día local (YYYY-MM-DD) y hora (HH:MM) de un instante en una zona. */
function localParts(at: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
const MONTHS: Record<"es" | "en", string[]> = {
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};
/** "12 nov" (o "12 nov 2025" si es de otro año). */
export function shortDay(day: string, locale: "es" | "en", thisYear?: string): string {
  const [y, m, d] = day.split("-");
  const base = locale === "en" ? `${MONTHS.en[+m - 1]} ${+d}` : `${+d} ${MONTHS.es[+m - 1]}`;
  return thisYear && y !== thisYear ? `${base} ${y}` : base;
}
/** Fecha de la línea de tiempo: "Hoy 09:12", "Ayer", "12 nov" (en la zona del admin). */
export function activityDate(iso: string, now: Date, tz: string, t: { today: string; yesterday: string }, locale: "es" | "en"): string {
  const at = localParts(new Date(iso), tz), today = localParts(now, tz);
  if (at.day === today.day) return `${t.today} ${at.time}`;
  if (at.day === localParts(new Date(now.getTime() - DAY), tz).day) return t.yesterday;
  return shortDay(at.day, locale, today.day.slice(0, 4));
}

// ───────── Etiquetas: colores del mockup con tokens ─────────
/** Fondo y texto de cada etapa (etiqueta de sistema). Las propias van en papel. Siempre con su nombre: nunca solo color. */
export const STAGE_TONE: Record<Stage, { bg: string; fg: string }> = {
  lead: { bg: "var(--linea-2)", fg: "var(--tinta-2)" },
  primer_mes: { bg: "var(--amarillo-pastel)", fg: "var(--amarillo-texto)" },
  pagando: { bg: "var(--verde-fondo)", fg: "var(--verde-fuerte)" },
  alumno: { bg: "var(--azul-fondo)", fg: "var(--azul-oscuro)" },
  solo_lectura: { bg: "var(--ambar-fondo)", fg: "var(--ambar-texto)" },
};
export const OWN_TAG_TONE = { bg: "var(--papel)", fg: "var(--tinta-2)" } as const;
export const isStage = (v: unknown): v is Stage => typeof v === "string" && (STAGES as readonly string[]).includes(v);

// ───────── Público de una campaña ─────────
export const PRESET_KEYS = Object.keys(AUDIENCE_PRESETS) as AudiencePreset[];
/** ¿El público guardado es una de las opciones del selector "Para quién"? (mismas etapas, sin etiquetas). */
export function audiencePreset(a: Audience | null | undefined): AudiencePreset | null {
  if (!a) return "all";
  const same = (x: readonly string[], y: readonly string[]) => x.length === y.length && x.every((v) => y.includes(v));
  for (const k of PRESET_KEYS) {
    const p = AUDIENCE_PRESETS[k];
    if (same(p.stages, a.stages) && same(p.tagIds, a.tagIds) && p.noAccount === a.noAccount) return k;
  }
  return null;
}

// ───────── Estado y tasas de una campaña ─────────
export type CampaignStatusKind = "draft" | "scheduled" | "sending" | "sent" | "cancelled";
/** Fecha que acompaña al estado: programada → la hora local elegida ("1 dic 7:00"); enviada → el día del envío. */
export function campaignWhen(c: { status: string; send_mode: string; scheduled_local: string | null; scheduled_at: string | null; sent_at: string | null; updated_at: string },
  locale: "es" | "en", tz: string, thisYear: string): string {
  if (c.status === "scheduled") {
    if (c.send_mode === "local" && c.scheduled_local) {
      const [day, time] = c.scheduled_local.split("T");
      return `${shortDay(day, locale, thisYear)} ${time.replace(/^0/, "")}`;
    }
    return "";
  }
  if (c.status === "sent" || c.status === "sending" || c.status === "cancelled") {
    const at = c.sent_at ?? c.scheduled_at ?? c.updated_at;
    return shortDay(localParts(new Date(at), tz).day, locale, thisYear);
  }
  return "";
}
/** 0.48 → "48%", 0.092 → "9.2%" (una cifra decimal bajo 10%). */
export function fmtRate(r: number): string {
  const pct = Math.max(0, r) * 100;
  if (pct > 0 && pct < 10) return `${(Math.round(pct * 10) / 10).toString()}%`;
  return `${Math.round(pct)}%`;
}

// ───────── Bloques del correo ─────────
export type BlockTexts = {
  heading: string; text: string; image: string; button: string; lesson: string; divider: string; signature: string;
  paragraphs: string; paragraph: string; toApp: string; toWeb: string; empty: string;
};
const countParagraphs = (t: string) => t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).length;
/** Resumen de un bloque como en el mockup: 'Título · "Hola, [nombre]"', "Texto · 3 párrafos", 'Botón · "X" → app'. */
export function blockSummary(b: Block, t: BlockTexts): string {
  const q = (s: string) => (s.trim() ? `"${s.trim().slice(0, 60)}"` : t.empty);
  switch (b.type) {
    case "heading": return `${t.heading} · ${q(b.text)}`;
    case "text": {
      const n = countParagraphs(b.text);
      return `${t.text} · ${n === 0 ? t.empty : (n === 1 ? t.paragraph : t.paragraphs).replace("{n}", String(n))}`;
    }
    case "image": return `${t.image} · ${b.alt.trim() ? q(b.alt) : b.src.split("/").pop() || t.empty}`;
    case "button": return `${t.button} · ${q(b.text)} → ${b.href.startsWith("/") ? t.toApp : t.toWeb}`;
    case "lesson": return `${t.lesson} · ${q(b.title)}`;
    case "divider": return t.divider;
    case "signature": return `${t.signature} · ${b.text.trim() || t.empty}`;
  }
}

/** Bloque nuevo de cada botón "+ Texto / + Imagen / + Botón / + Clase / + Separador" (vacío para llenar). */
export type NewBlockKind = "text" | "image" | "button" | "lesson" | "divider";
export function newBlock(kind: NewBlockKind, opts: { image?: string; lesson?: { title: string; href: string; course: string } } = {}): Block {
  switch (kind) {
    case "text": return { type: "text", text: "" };
    case "image": return { type: "image", src: opts.image ?? "", alt: "" };
    case "button": return { type: "button", text: "", href: "/inicio" };
    case "lesson": return { type: "lesson", title: opts.lesson?.title ?? "", href: opts.lesson?.href ?? "/academia", course: opts.lesson?.course ?? "" };
    case "divider": return { type: "divider" };
  }
}

/** Mueve un elemento de una lista (subir / bajar). Fuera de rango, la deja igual. */
export function move<T>(list: readonly T[], i: number, delta: -1 | 1): T[] {
  const j = i + delta;
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return [...list];
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/**
 * Imagen del correo: el motor solo acepta https:// (los clientes de correo la piden desde afuera). Una ruta propia
 * ("/cursos/curso-01.webp") se vuelve absoluta con la dirección pública de la app; si esa dirección no es https
 * (desarrollo local), con la de producción.
 */
export const PUBLIC_APP_URL = "https://app.revoluciondeldinero.com";
export function imageUrl(src: string, appUrl: string | null | undefined): string {
  const v = src.trim();
  if (!v.startsWith("/") || v.startsWith("//")) return v;
  const base = (appUrl ?? "").trim().replace(/\/+$/, "");
  return `${/^https:\/\//i.test(base) ? base : PUBLIC_APP_URL}${v}`;
}
/** Sugerencias de imagen (no hay almacenamiento de archivos: se pega una URL o se elige una de estas). */
export const IMAGE_SUGGESTIONS = [
  ...["01", "02", "03", "04", "05", "06", "07", "08", "09"].map((n) => `/cursos/curso-${n}.webp`),
  ...["onb-plan", "onb-metas", "onb-seguridad", "onb-categorias", "cel-cierre", "cel-hito", "cel-meta", "cel-racha", "meta-emergencia", "meta-viaje", "meta-inversion", "meta-deuda"].map((n) => `/ilustraciones/${n}.webp`),
] as const;

/** Bloques de un correo de una sola persona ("Enviar un correo"): título opcional, texto y firma. */
export function quickEmailBlocks(input: { heading: string; text: string; signature: string }): Block[] {
  const out: Block[] = [];
  if (input.heading.trim()) out.push({ type: "heading", text: input.heading.trim() });
  out.push({ type: "text", text: input.text.trim() });
  if (input.signature.trim()) out.push({ type: "signature", text: input.signature.trim() });
  return out;
}

/** Primer nombre para la firma y la vista previa ("Jonathan González" → "Jonathan"). */
export const firstWord = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";

// ───────── Importar CSV ─────────
/** Columnas que se reconocen (sin tildes ni mayúsculas): correo, nombre, teléfono, país, etiquetas, consentimiento. */
const HEADERS: Record<ImportColumn, string[]> = {
  email: ["correo", "email", "e-mail", "correo electronico", "mail"],
  name: ["nombre", "name", "nombre completo", "full name"],
  phone: ["telefono", "phone", "celular", "movil", "mobile", "whatsapp"],
  country: ["pais", "country"],
  tags: ["etiquetas", "etiqueta", "tags", "tag"],
  consent: ["consentimiento", "consent", "acepta marketing", "marketing", "acepta correos"],
};
export type ImportColumn = "email" | "name" | "phone" | "country" | "tags" | "consent";
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
export function mapHeaders(header: string[]): Partial<Record<ImportColumn, number>> {
  const out: Partial<Record<ImportColumn, number>> = {};
  header.forEach((h, i) => {
    const n = norm(h);
    for (const k of Object.keys(HEADERS) as ImportColumn[]) if (out[k] === undefined && HEADERS[k].includes(n)) out[k] = i;
  });
  return out;
}
/** Consentimiento: solo un "sí" explícito cuenta. Vacío o cualquier otra cosa = no (casilla desmarcada por defecto). */
export const isYes = (v: string | undefined) => ["si", "yes", "true", "1", "x", "y", "s"].includes(norm(v ?? ""));
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;
/** "AU", "Australia" → "AU" si es un código de 2 letras; si no, vacío (el país sin código no se adivina). */
const countryCode = (v: string) => (/^[A-Za-z]{2}$/.test(v.trim()) ? v.trim().toUpperCase() : "");

export type ImportRow = { email: string; name: string; phone: string; country: string; tags: string[]; consent: boolean };
export const IMPORT_MAX_ROWS = 1000;
export type ImportParse =
  | { ok: true; rows: ImportRow[]; invalid: number; duplicates: number; withConsent: number }
  | { ok: false; error: "empty" | "no_email" | "too_many" };

/** Lee el CSV (con encabezados) → filas listas para importar, sin repetidos (gana la primera). */
export function parseContactsCsv(text: string): ImportParse {
  const table = parseCsv(text);
  if (table.length < 2) return { ok: false, error: "empty" };
  const cols = mapHeaders(table[0]);
  if (cols.email === undefined) return { ok: false, error: "no_email" };
  if (table.length - 1 > IMPORT_MAX_ROWS) return { ok: false, error: "too_many" };
  const cell = (r: string[], k: ImportColumn) => (cols[k] === undefined ? "" : (r[cols[k]!] ?? "").trim());
  const seen = new Set<string>();
  const rows: ImportRow[] = [];
  let invalid = 0, duplicates = 0;
  for (const r of table.slice(1)) {
    const email = cell(r, "email").toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) { invalid++; continue; }
    if (seen.has(email)) { duplicates++; continue; }
    seen.add(email);
    const tags = [...new Set(cell(r, "tags").split(/[|;,]/).map((x) => x.trim().slice(0, 40)).filter(Boolean))].slice(0, 10);
    rows.push({ email, name: cell(r, "name").slice(0, 120), phone: cell(r, "phone").slice(0, 30), country: countryCode(cell(r, "country")), tags, consent: isYes(cell(r, "consent")) });
  }
  return { ok: true, rows, invalid, duplicates, withConsent: rows.filter((r) => r.consent).length };
}

/**
 * Prepara la importación: separa quienes dieron consentimiento (van con su constancia) de quienes no, y quita los
 * nombres de etiquetas de sistema (Lead, Primer mes…: salen de la etapa, no se ponen a mano).
 */
export function splitImport(rows: ImportRow[], systemNames: string[]): { withConsent: ImportRow[]; without: ImportRow[]; tagNames: string[] } {
  const sys = new Set(systemNames.map(norm));
  const clean = rows.map((r) => ({ ...r, tags: r.tags.filter((t) => !sys.has(norm(t))) }));
  const names = new Map<string, string>();
  clean.forEach((r) => r.tags.forEach((t) => { if (!names.has(norm(t))) names.set(norm(t), t); }));
  return { withConsent: clean.filter((r) => r.consent), without: clean.filter((r) => !r.consent), tagNames: [...names.values()] };
}
/** Clave sin tildes ni mayúsculas para unir un nombre de etiqueta con su id. */
export const tagKey = norm;

/** Parte una lista en tandas (la importación va en tandas para no pasar el tiempo de una acción). */
export const chunks = <T,>(list: T[], size: number): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

// ───────── Ids de pasos de automatización ─────────
/** Id nuevo para un paso (los que ya existen NUNCA se cambian: las inscripciones activas apuntan a ellos). */
export function newStepId(taken: Iterable<string>, rand: () => number = Math.random): string {
  const used = new Set(taken);
  for (;;) {
    const id = `s${Math.floor(rand() * 36 ** 6).toString(36).padStart(6, "0")}`;
    if (!used.has(id)) return id;
  }
}

// ───────── Actividad del contacto ─────────
/**
 * Texto de un evento de la línea de tiempo. El ref solo trae ids, fechas o %, nunca nombres ni montos: la etiqueta y
 * la etapa se nombran con lo que ya hay en el panel.
 */
export function describeEvent(e: { kind: string; ref: string }, x: { events: Record<string, string>; stages: Record<string, string>; tagName: (id: string) => string | null; sms: string }): string {
  const base = x.events[e.kind] ?? e.kind.replace(/_/g, " ");
  const head = e.ref.split(":")[0] ?? "";
  if (e.kind === "tag_added") { const n = x.tagName(head); return n ? `${base}: ${n}` : base; }
  if (e.kind === "stage_changed") return x.stages[head] ? `${base}: ${x.stages[head]}` : base;
  if ((e.kind === "subscribed" || e.kind === "unsubscribed") && head === "sms") return `${base} (${x.sms})`;
  return base;
}
