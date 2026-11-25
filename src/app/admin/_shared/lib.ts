// Cálculos puros del panel de administración (sin base de datos). Probados en tests/admin.test.ts.
import { addMonths, type ISODate } from "@/lib/engine";

// ───────── Filtros y paginación de usuarios ─────────
export const USER_FILTERS = ["all", "free", "trial", "pro", "alumno", "fundador", "read_only", "failed", "expiring7", "expiring", "suspended"] as const;
export type UserFilter = (typeof USER_FILTERS)[number];
export const PAGE_SIZE = 25;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseFilter(v: string | string[] | undefined): UserFilter {
  const f = one(v);
  return (USER_FILTERS as readonly string[]).includes(f) ? (f as UserFilter) : "all";
}
export function parsePage(v: string | string[] | undefined): number {
  const n = Number.parseInt(one(v), 10);
  return Number.isFinite(n) && n >= 1 && n <= 100_000 ? n : 1;
}
/** Búsqueda limpia: sin espacios de más, máximo 80 caracteres. */
export const parseSearch = (v: string | string[] | undefined) => one(v).trim().replace(/\s+/g, " ").slice(0, 80);

export const USER_ROLES = ["all", "user", "admin"] as const;
export type RoleFilter = (typeof USER_ROLES)[number];
export function parseRole(v: string | string[] | undefined): RoleFilter {
  const r = one(v);
  return (USER_ROLES as readonly string[]).includes(r) ? (r as RoleFilter) : "all";
}
/** País: código de 2 letras, "otro" (país fuera de la lista) o "all". */
export function parseCountry(v: string | string[] | undefined): string {
  const c = one(v).trim();
  if (c === "otro") return c;
  return /^[A-Za-z]{2}$/.test(c) ? c.toUpperCase() : "all";
}
/**
 * Un correo completo se busca EXACTO (no trae a "ana@x.com" y "juliana@x.com.co" juntos);
 * cualquier otra cosa es búsqueda parcial por nombre o correo.
 */
export function splitSearch(q: string): { search: string; email: string } {
  const v = q.trim();
  return isEmail(v) ? { search: "", email: v.toLowerCase() } : { search: v, email: "" };
}
/** Parámetros de `admin_users_v2` para la lista y la exportación. */
export function userQuery(q: string, filter: UserFilter, role: RoleFilter, country: string) {
  const { search, email } = splitSearch(q);
  return { p_search: search, p_email: email, p_filter: filter, p_role: role === "all" ? "" : role, p_country: country === "all" ? "" : country };
}

export const pageRange = (page: number, size = PAGE_SIZE) => ({ limit: size, offset: (Math.max(1, page) - 1) * size });
export const pageCount = (total: number, size = PAGE_SIZE) => Math.max(1, Math.ceil(Math.max(0, total) / size));

/** Arma la dirección de la lista con sus filtros; omite lo que está por defecto. */
export function listHref(base: string, params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || v === "all" || (k === "p" && Number(v) <= 1)) continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

// ───────── Vencimiento de un acceso gratis ─────────
export type DurationMode = "vida" | "meses" | "fecha";
export type Expiry = { ok: true; until: ISODate | null } | { ok: false; error: "months" | "date" | "past" };
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const validIso = (d: string) => ISO_RE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

/**
 * Hasta cuándo dura un acceso: de por vida (null), N meses desde `from`, o hasta una fecha futura.
 * `from` es hoy, o el vencimiento actual si se está extendiendo y aún no venció.
 */
export function expiryFrom(mode: DurationMode, input: { months?: string | number; until?: string }, today: ISODate, from: ISODate = today): Expiry {
  if (mode === "vida") return { ok: true, until: null };
  if (mode === "meses") {
    const n = typeof input.months === "number" ? input.months : Number(String(input.months ?? "").trim());
    if (!Number.isInteger(n) || n < 1 || n > 120) return { ok: false, error: "months" };
    return { ok: true, until: addMonths(from > today ? from : today, n) };
  }
  const d = (input.until ?? "").trim();
  if (!validIso(d)) return { ok: false, error: "date" };
  if (d <= today) return { ok: false, error: "past" };
  return { ok: true, until: d };
}

/** Fecha de vencimiento (día) → instante que se guarda: el final de ese día. */
export const endOfDay = (d: ISODate | null): string | null => (d ? `${d}T23:59:59Z` : null);
/** Instante guardado con `endOfDay` → el día que eligió el admin (sin convertir de zona: si no, sale un día después). */
export const expiryDay = (ts: string): ISODate => ts.slice(0, 10);

// ───────── Notas internas: nunca datos financieros ─────────
const MONEY_PATTERNS = [
  /\$\s*\d/,                                                    // $300, $ 1.200
  /\d\s*\$/,                                                    // 300$
  /\b\d{1,3}(?:[.,]\d{3})*[.,]\d{1,2}\b/,                       // 12,50 · 1.234,56 · 99.9
  /\b\d+(?:[.,]\d{3})+\b/,                                      // 1,000 · 2.500.000
  /\b(?:AUD|USD|NZD|GBP|EUR|COP|MXN|CLP|PEN|ARS|CAD)\s*\d/i,   // AUD 300
  /\d\s*(?:AUD|USD|NZD|GBP|EUR|COP|MXN|CLP|PEN|ARS|CAD)\b/i,   // 300 AUD
];
export const noteHasMoney = (text: string) => MONEY_PATTERNS.some((re) => re.test(text));
export type NoteCheck = { ok: true; body: string } | { ok: false; error: "empty" | "long" | "money" };
export function checkNote(text: string): NoteCheck {
  const body = text.trim();
  if (!body) return { ok: false, error: "empty" };
  if (body.length > 1000) return { ok: false, error: "long" };
  if (noteHasMoney(body)) return { ok: false, error: "money" };
  return { ok: true, body };
}

// ───────── Códigos de invitación ─────────
/** Igual que `redeem_invite`: se guarda en mayúsculas y sin espacios. */
export const normalizeCode = (code: string) => code.trim().toUpperCase();
export type CodeCheck = { ok: true; code: string } | { ok: false; error: "code" };
export function checkCode(code: string): CodeCheck {
  const c = normalizeCode(code);
  return /^[A-Z0-9][A-Z0-9_-]{3,39}$/.test(c) ? { ok: true, code: c } : { ok: false, error: "code" };
}
export type UsesCheck = { ok: true; max: number | null } | { ok: false; error: "uses" };
export function checkMaxUses(v: string | number | null | undefined): UsesCheck {
  const s = String(v ?? "").trim();
  if (!s) return { ok: true, max: null };
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= 100_000 ? { ok: true, max: n } : { ok: false, error: "uses" };
}
/** Un código con meses dura N meses desde que se canjea; con fecha, hasta esa fecha; sin nada, de por vida. */
export function codeDuration(mode: DurationMode, input: { months?: string | number; until?: string }, today: ISODate): { ok: true; months: number | null; until: ISODate | null } | { ok: false; error: "months" | "date" | "past" } {
  if (mode === "vida") return { ok: true, months: null, until: null };
  const e = expiryFrom(mode, input, today);
  if (!e.ok) return e;
  return mode === "meses" ? { ok: true, months: Number(String(input.months).trim()), until: null } : { ok: true, months: null, until: e.until };
}

// ───────── Correos pegados ─────────
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;
export const isEmail = (v: string) => EMAIL_RE.test(v.trim().toLowerCase());
export function parseEmails(text: string): { valid: string[]; invalid: string[] } {
  const parts = text.split(/[\s,;]+/).map((p) => p.trim().toLowerCase()).filter(Boolean);
  const valid: string[] = [], invalid: string[] = [];
  for (const p of parts) {
    const list = EMAIL_RE.test(p) ? valid : invalid;
    if (!list.includes(p)) list.push(p);
  }
  return { valid, invalid };
}

// ───────── Registro de actividad ─────────
export const ACTION_GROUPS = {
  accesos: ["dar_acceso", "quitar_acceso", "codigo_", "grupo_"],
  cuentas: ["suspender", "reactivar", "cambiar_rol", "reiniciar_2pasos", "restablecer_clave", "borrar_cuenta", "nota_", "exportar_"],
  soporte: ["soporte_", "privacidad_", "faq_"],
  precios: ["precio", "plan", "cupon"],
  contenido: ["menu", "curso", "clase", "modulo", "pais", "academia", "config", "funcion"],
} as const;
export type ActionGroup = keyof typeof ACTION_GROUPS;
export const parseActionGroup = (v: string | string[] | undefined): ActionGroup | "all" => {
  const g = one(v);
  return g in ACTION_GROUPS ? (g as ActionGroup) : "all";
};
/** Filtro de PostgREST (`or`) para un grupo de acciones: `action.like.dar_acceso*,…`. */
export const actionGroupFilter = (g: ActionGroup) => ACTION_GROUPS[g].map((p) => `action.like.${p}*`).join(",");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

/** Porcentaje entero de una parte sobre un total (0 si el total es 0). */
export const pct = (part: number, total: number) => (total > 0 ? Math.round((Math.max(0, part) / total) * 100) : 0);

/** CSV seguro: comillas dobles y sin fórmulas que una hoja de cálculo ejecute. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
