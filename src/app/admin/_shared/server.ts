import "server-only";
import { fill } from "@/i18n";
import { formatDate, todayIn, type ISODate } from "@/lib/engine";
import { run, type Result } from "@/server/action";
import { must } from "@/server/data";
import { requireAdmin, type Session } from "@/server/session";
import type { Json } from "@/lib/supabase/database.types";
import { expiryDay } from "./lib";
import { A } from "./messages";

/**
 * Envoltura de TODA acción del panel: exige rol admin + 2 pasos (fuera del try de `run`, para que la
 * redirección funcione) y luego `run` sin la regla de solo lectura (el plan del admin no importa aquí).
 */
export async function adminAction<T>(revalidate: string[], fn: (s: Session) => Promise<Result<T>>): Promise<Result<T>> {
  await requireAdmin();
  return run({ write: false, revalidate }, fn);
}

/** Texto del panel para la sesión. */
export const adminText = (s: Session) => A[s.locale];

/** Deja constancia en admin_audit. Nunca se guardan textos de notas, mensajes ni montos en `detail`. */
export async function audit(s: Session, action: string, target: string | null, detail: Record<string, Json | undefined> = {}) {
  const clean = Object.fromEntries(Object.entries(detail).filter(([, v]) => v !== undefined)) as Json;
  must(await s.supabase.rpc("admin_log", { p_action: action, p_target: target as string, p_detail: clean }));
}

export type AdminUser = {
  id: string; email: string; name: string; country: string; role: string; created_at: string; last_active_at: string | null;
  suspended_at: string | null; onboarding_step: string; state: string; access_until: string | null; pro_until: string | null;
  trial_ends_at: string | null; billing_interval: string | null; payment_failed_at: string | null; cancel_at_period_end: boolean;
  lessons_done: number; closures: number; points: number; badges: number; weeks_active: number;
  grants: { id: string; kind: string; expires_at: string | null; revoked_at: string | null; created_at: string; invite_code: string | null }[];
  groups: { id: string; name: string }[];
  notes: { id: string; body: string; created_at: string }[];
  privacy: { id: string; kind: string; status: string; requested_at: string; due_at: string }[];
};

/** Ficha de un usuario sin datos financieros (función `admin_user`). null si no existe. */
export async function loadUser(s: Session, id: string): Promise<AdminUser | null> {
  const r = must(await s.supabase.rpc("admin_user", { p_user: id })) as unknown;
  return r && typeof r === "object" ? (r as AdminUser) : null;
}

export type UserRef = { id: string; email: string; name: string };
/**
 * Correo y nombre de varios usuarios. El admin no puede leer `profiles` ajenos (RLS):
 * solo `admin_user`, de a pocos en paralelo. Un usuario borrado no aparece en el mapa.
 */
export async function lookupUsers(s: Session, ids: (string | null | undefined)[]): Promise<Map<string, UserRef>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, UserRef>();
  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10);
    const rows = await Promise.all(chunk.map((id) => loadUser(s, id)));
    rows.forEach((u) => { if (u) out.set(u.id, { id: u.id, email: u.email, name: u.name }); });
  }
  return out;
}

/** Busca usuarios por correo exacto (la búsqueda de `admin_users` es parcial). */
export async function findByEmail(s: Session, email: string): Promise<{ id: string; email: string; role: string } | null> {
  for (let offset = 0; offset < 20_000; offset += 1000) {
    const rows = must(await s.supabase.rpc("admin_users", { p_search: email, p_filter: "all", p_limit: 1000, p_offset: offset }));
    const hit = rows.find((r) => r.email.toLowerCase() === email.toLowerCase());
    if (hit) return { id: hit.id, email: hit.email, role: hit.role };
    if (rows.length < 1000) break;
  }
  return null;
}

/** Todos los administradores. `admin_users` no filtra por rol: se recorre la lista de a 1,000. */
export async function loadAdmins(s: Session): Promise<UserRef[]> {
  const out: UserRef[] = [];
  for (let offset = 0; offset < 50_000; offset += 1000) {
    const rows = must(await s.supabase.rpc("admin_users", { p_search: "", p_filter: "all", p_limit: 1000, p_offset: offset }));
    rows.filter((r) => r.role === "admin").forEach((r) => out.push({ id: r.id, email: r.email, name: r.name }));
    if (rows.length < 1000) break;
  }
  return out;
}

/** Día (en la zona horaria del admin) de un instante guardado en la base. */
export const dayOf = (s: Session, ts: string): ISODate => todayIn(s.profile.timezone || "Australia/Sydney", new Date(ts));
export const fmtDay = (s: Session, ts: string | null | undefined, style: "long" | "short" = "long") => (ts ? formatDate(dayOf(s, ts), s.locale, style) : "");
/** Vencimientos de accesos y códigos (guardados con `endOfDay`): se muestra el día elegido, sin convertir de zona. */
export const fmtExpiry = (s: Session, ts: string | null | undefined, style: "long" | "short" = "long") => (ts ? formatDate(expiryDay(ts), s.locale, style) : "");
export const fmtTime = (s: Session, ts: string) =>
  new Intl.DateTimeFormat(s.locale === "en" ? "en-AU" : "es-CO", { timeZone: s.profile.timezone || "Australia/Sydney", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ts));

/** Dirección pública de la app, para los enlaces de los correos. */
export const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** Detalle legible de una fila del registro. Solo claves conocidas; nunca montos (no existen en el registro). */
export function describeDetail(s: Session, action: string, detail: unknown, groupNames: Map<string, string> = new Map()): string {
  const t = A[s.locale], d = (detail && typeof detail === "object" ? detail : {}) as Record<string, unknown>;
  const parts: string[] = [];
  const str = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");
  if (str(d.kind)) parts.push(t.kinds[str(d.kind)] ?? str(d.kind));
  if (action === "dar_acceso") parts.push(d.expires_at ? fmtExpiry(s, str(d.expires_at)) : t.never);
  if (str(d.group)) parts.push(groupNames.get(str(d.group)) ?? "");
  if (str(d.name)) parts.push(`"${str(d.name)}"`);
  if (str(d.role)) parts.push(t.roles[str(d.role)] ?? str(d.role));
  if (str(d.code)) parts.push(str(d.code));
  if (str(d.months)) parts.push(fill(t.monthsN, { n: str(d.months) }));
  if (str(d.until)) parts.push(formatDate(str(d.until).slice(0, 10), s.locale));
  if (str(d.status)) parts.push(t.statuses[str(d.status)] ?? str(d.status));
  if (str(d.email)) parts.push(str(d.email));
  if (str(d.rows)) parts.push(fill(t.rowsN, { n: str(d.rows) }));
  return parts.filter(Boolean).join(" · ");
}
