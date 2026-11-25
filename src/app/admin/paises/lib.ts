// Contenido por país: cálculos puros (sin base de datos). Probados en tests/admin-paises.test.ts.
// Regla: al guardar siempre se mezcla sobre lo que ya hay en la base (las claves que no conocemos se conservan).

export const GENERIC = "OTHER";
export const PAY_FREQUENCIES = ["weekly", "fortnightly", "monthly"] as const;
export type PayFrequency = (typeof PAY_FREQUENCIES)[number];
/** Los mismos de `src/server/terms.ts`. */
export const TERM_KEYS = ["retirement", "freelance", "bnpl", "tax_office", "company"] as const;
export type TermKey = (typeof TERM_KEYS)[number];
/** Los de la columna `categories.kind` (check de la base). */
export const CATEGORY_KINDS = ["income", "expense", "debt", "saving", "goal"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];
/** Los indicadores del Diagnóstico (`Benchmarks` del motor). */
export const BENCH_KEYS = ["surplus", "saving", "debt", "emergency", "dependency"] as const;
export type BenchKey = (typeof BENCH_KEYS)[number];
/** Cuotas de deudas y dependencia: menos es mejor (el motor usa `lowerBetter`). */
export const LOWER_BETTER: readonly BenchKey[] = ["debt", "dependency"];

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

// ───────── Validaciones ─────────
/** Zona horaria IANA real ("Australia/Sydney", "America/Bogota", "UTC"). */
export function isTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length < 3 || tz.length > 64) return false;
  if (!/^(UTC|[A-Za-z_]+(\/[A-Za-z0-9_+-]+){1,2})$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

/** Moneda ISO 4217: 3 letras mayúsculas y conocida por el motor de JS (si sabe listar monedas). */
export function isCurrencyCode(v: unknown): v is string {
  if (typeof v !== "string" || !/^[A-Z]{3}$/.test(v)) return false;
  try {
    const all = Intl.supportedValuesOf("currency");
    return all.length === 0 || all.includes(v);
  } catch {
    return true;
  }
}

/** Solo enlaces http o https (nunca `javascript:` ni `data:`). */
export function isHttpUrl(v: unknown): v is string {
  if (typeof v !== "string" || v.length > 500) return false;
  try {
    const u = new URL(v);
    return (u.protocol === "http:" || u.protocol === "https:") && !!u.hostname;
  } catch {
    return false;
  }
}

/** Código del país: 2 letras (ISO 3166) en mayúsculas. */
export const isCountryCode = (v: unknown): v is string => typeof v === "string" && /^[A-Z]{2}$/.test(v);

// ───────── Estado del país ─────────
export type CountryStatus = "generic" | "published" | "draft";
export const statusOf = (c: { code: string; enabled: boolean }): CountryStatus => (c.code === GENERIC ? "generic" : c.enabled ? "published" : "draft");

/**
 * Orden de un país nuevo. Las categorías sugeridas se eligen con `.in([país, OTHER]).order("sort").limit(1)`:
 * el país tiene que quedar SIEMPRE antes que el genérico, o sus usuarios recibirían las del genérico.
 */
export function nextSort(rows: { code: string; sort: number }[]): number {
  const other = rows.find((r) => r.code === GENERIC)?.sort ?? 99;
  const max = rows.filter((r) => r.code !== GENERIC).reduce((m, r) => Math.max(m, r.sort), -1);
  return Math.max(-1000, Math.min(max + 1, other - 1));
}

// ───────── Catálogo para "Agregar país" (datos de referencia, no del usuario) ─────────
export type CatalogEntry = { code: string; es: string; en: string; currency: string; timezone: string; locale: string };
export const CATALOG: CatalogEntry[] = [
  { code: "CL", es: "Chile", en: "Chile", currency: "CLP", timezone: "America/Santiago", locale: "es-CL" },
  { code: "PE", es: "Perú", en: "Peru", currency: "PEN", timezone: "America/Lima", locale: "es-PE" },
  { code: "AR", es: "Argentina", en: "Argentina", currency: "ARS", timezone: "America/Argentina/Buenos_Aires", locale: "es-AR" },
  { code: "NZ", es: "Nueva Zelanda", en: "New Zealand", currency: "NZD", timezone: "Pacific/Auckland", locale: "en-NZ" },
  { code: "CA", es: "Canadá", en: "Canada", currency: "CAD", timezone: "America/Toronto", locale: "en-CA" },
  { code: "GB", es: "Reino Unido", en: "United Kingdom", currency: "GBP", timezone: "Europe/London", locale: "en-GB" },
  { code: "CO", es: "Colombia", en: "Colombia", currency: "COP", timezone: "America/Bogota", locale: "es-CO" },
  { code: "MX", es: "México", en: "Mexico", currency: "MXN", timezone: "America/Mexico_City", locale: "es-MX" },
  { code: "ES", es: "España", en: "Spain", currency: "EUR", timezone: "Europe/Madrid", locale: "es-ES" },
  { code: "US", es: "Estados Unidos", en: "United States", currency: "USD", timezone: "America/New_York", locale: "en-US" },
  { code: "AU", es: "Australia", en: "Australia", currency: "AUD", timezone: "Australia/Sydney", locale: "en-AU" },
];
/** Países del catálogo que aún no existen en la tabla. */
export const missingFromCatalog = (existing: string[]) => CATALOG.filter((c) => !existing.includes(c.code));

// ───────── Términos locales ─────────
/** Texto de cada término para el formulario (vacío si el país no lo tiene). */
export function termsToForm(raw: unknown): Record<TermKey, string> {
  const v = asObj(raw);
  return Object.fromEntries(TERM_KEYS.map((k) => [k, typeof v[k] === "string" ? (v[k] as string) : ""])) as Record<TermKey, string>;
}
/** Mezcla: conserva las claves desconocidas; un término vacío se quita (la app usa el genérico). */
export function mergeTerms(raw: unknown, form: Partial<Record<TermKey, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(asObj(raw))) if (typeof v === "string") out[k] = v;
  for (const k of TERM_KEYS) {
    if (!(k in form)) continue;
    const t = (form[k] ?? "").trim().replace(/\s+/g, " ");
    if (t) out[k] = t; else delete out[k];
  }
  return out;
}

// ───────── Referencias del Diagnóstico ─────────
export type BenchForm = Record<BenchKey, { good: string; warn: string }>;
/** Las proporciones se editan en % (0.15 → "15"); el fondo de emergencia, en meses. */
const toText = (k: BenchKey, n: number) => String(Number((k === "emergency" ? n : n * 100).toFixed(2)));

export function benchToForm(raw: unknown, fallback: Record<BenchKey, { good: number; warn: number }>): BenchForm {
  const src = asObj(raw);
  const out = {} as BenchForm;
  for (const k of BENCH_KEYS) {
    const v = asObj(src[k]);
    const n = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) ? x : d);
    out[k] = { good: toText(k, n(v.good, fallback[k].good)), warn: toText(k, n(v.warn, fallback[k].warn)) };
  }
  return out;
}

const parseNum = (t: string): number | null => {
  const s = t.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const RANGE: Record<BenchKey, [number, number]> = { surplus: [-100, 100], saving: [0, 100], debt: [0, 100], emergency: [0, 36], dependency: [0, 100] };

export type BenchResult = { ok: true; value: Obj } | { ok: false; error: "number" | "order"; key: BenchKey };
/**
 * Formulario → `benchmarks`. Más es mejor (te sobra, ahorro, fondo): bueno ≥ atención.
 * Menos es mejor (deudas, dependencia): bueno ≤ atención. Conserva las claves que no conocemos.
 */
export function mergeBenchmarks(raw: unknown, form: BenchForm): BenchResult {
  const out: Obj = { ...asObj(raw) };
  for (const k of BENCH_KEYS) {
    const g = parseNum(form[k]?.good ?? ""), w = parseNum(form[k]?.warn ?? "");
    const [lo, hi] = RANGE[k];
    if (g === null || w === null || g < lo || g > hi || w < lo || w > hi) return { ok: false, error: "number", key: k };
    if (LOWER_BETTER.includes(k) ? g > w : g < w) return { ok: false, error: "order", key: k };
    const conv = (n: number) => (k === "emergency" ? n : Number((n / 100).toFixed(4)));
    out[k] = { ...asObj(out[k]), good: conv(g), warn: conv(w) };
  }
  return { ok: true, value: out };
}

// ───────── Categorías sugeridas ─────────
export type CatView = { name: string; kind: CategoryKind; basic: boolean; from: number | null };
/** Lista para el editor. `from` es la posición en la base: así al guardar se conservan color y demás claves. */
export function categoriesToForm(raw: unknown): CatView[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((c, i) => {
    const o = asObj(c);
    const kind = (CATEGORY_KINDS as readonly string[]).includes(o.kind as string) ? (o.kind as CategoryKind) : null;
    return typeof o.name === "string" && kind ? [{ name: o.name, kind, basic: o.is_basic === true, from: i }] : [];
  });
}

/** Color de una categoría nueva: el de otra del mismo tipo; si no hay, el de cualquiera. Nunca uno inventado. */
export function colorFor(kind: CategoryKind, list: unknown[]): string | null {
  const objs = list.map(asObj).filter((o) => typeof o.color === "string" && o.color);
  return ((objs.find((o) => o.kind === kind) ?? objs[0])?.color as string | undefined) ?? null;
}

export type CatResult = { ok: true; value: Obj[] } | { ok: false; error: "catEmpty" | "catName" | "catDup" | "catColor" };
/** Editor → `categories`. Cada una conserva lo que ya tenía (color, is_basic…); las nuevas toman un color existente. */
export function mergeCategories(raw: unknown, items: { name: string; kind: CategoryKind; from: number | null; basic?: boolean }[]): CatResult {
  const existing = Array.isArray(raw) ? raw : [];
  if (items.length === 0) return { ok: false, error: "catEmpty" };
  const seen = new Set<string>();
  const out: Obj[] = [];
  for (const it of items) {
    const name = it.name.trim().replace(/\s+/g, " ");
    if (!name || name.length > 40) return { ok: false, error: "catName" };
    const key = name.toLocaleLowerCase("es");
    if (seen.has(key)) return { ok: false, error: "catDup" };
    seen.add(key);
    const base = it.from !== null && it.from >= 0 && it.from < existing.length ? asObj(existing[it.from]) : {};
    const color = typeof base.color === "string" && base.color ? base.color : colorFor(it.kind, existing);
    if (!color) return { ok: false, error: "catColor" };
    const next: Obj = { ...base, name, kind: it.kind, color };
    // `is_basic` solo se escribe si cambió (una nueva solo lo lleva si es básica).
    if (it.basic !== undefined && it.basic !== (base.is_basic === true)) next.is_basic = it.basic;
    out.push(next);
  }
  return { ok: true, value: out };
}

// ───────── app_config.diag_cta y app_config.legal ─────────
export type LeadForm = { title: string; text: string; url: string; button: string };
export const leadToForm = (raw: unknown): LeadForm => {
  const l = asObj(asObj(raw).lead);
  const s = (k: string) => (typeof l[k] === "string" ? (l[k] as string) : "");
  return { title: s("title"), text: s("text"), url: s("url"), button: s("button") };
};
/** Reemplaza solo `lead` (conservando sus claves extra); `student` y lo demás quedan como estaban. */
export function mergeDiagCta(raw: unknown, lead: LeadForm): Obj {
  const cur = asObj(raw);
  return { ...cur, lead: { ...asObj(cur.lead), title: lead.title.trim(), text: lead.text.trim(), url: lead.url.trim(), button: lead.button.trim() } };
}

export const LEGAL_KEYS = ["company", "abn", "contact", "address", "updated", "version"] as const;
export type LegalKey = (typeof LEGAL_KEYS)[number];
export type LegalForm = Record<LegalKey, string>;
/** Lo guardado (vacío si es el marcador "[…]", para que el admin vea que falta). */
export const legalToForm = (raw: unknown): LegalForm => {
  const v = asObj(raw);
  return Object.fromEntries(LEGAL_KEYS.map((k) => [k, typeof v[k] === "string" && !/^\[.*\]$/.test((v[k] as string).trim()) ? (v[k] as string) : ""])) as LegalForm;
};
export function mergeLegalConfig(raw: unknown, form: LegalForm): Obj {
  const out: Obj = { ...asObj(raw) };
  for (const k of LEGAL_KEYS) {
    const t = form[k].trim().replace(/\s+/g, " ");
    // Vacío → se quita la clave: las páginas legales vuelven a mostrar el marcador "[…]", nunca un hueco.
    if (t) out[k] = t; else delete out[k];
  }
  return out;
}

/** Huella corta de un texto: si la fila cambió en la base, el editor se vuelve a armar con lo guardado. */
export function revOf(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
