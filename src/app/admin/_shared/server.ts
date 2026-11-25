import "server-only";
import { fill } from "@/i18n";
import { formatDate, todayIn, type ISODate } from "@/lib/engine";
import { run, type Result } from "@/server/action";
import { must } from "@/server/data";
import { requireAdmin, type Session } from "@/server/session";
import type { Database, Json } from "@/lib/supabase/database.types";
import { sendGrantEmails, type GrantMailResult } from "@/lib/email/grant";
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

// ───────── Funciones de la migración 20261125000027_admin_parte1.sql ─────────
// Aplicadas en producción el 25 nov 2026. Se conserva el camino anterior por si PostgREST responde PGRST202
// ("función no encontrada"), p. ej. en un Supabase local sin esa migración.
type RpcResult<T> = { data: T | null; error: { message: string; code?: string } | null };
async function rpcNew<T>(s: Session, fn: "admin_emails" | "admin_users_v2" | "admin_academy_dropoff", args: Record<string, unknown>): Promise<RpcResult<T> | null> {
  const r = (await s.supabase.rpc(fn as never, args as never)) as unknown as RpcResult<T>;
  if (r.error?.code === "PGRST202") return null; // migración sin aplicar
  return r;
}

export type UserRef = { id: string; email: string; name: string };
export type UserContact = UserRef & { locale: string | null };

/**
 * Correo, nombre e idioma de varios usuarios. El admin no puede leer `profiles` ajenos (RLS):
 * `admin_emails` en lotes de 500 (o, si la migración no está aplicada, `admin_user` de a pocos, sin idioma).
 * Un usuario borrado no aparece en el mapa.
 */
export async function loadContacts(s: Session, ids: (string | null | undefined)[]): Promise<Map<string, UserContact>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, UserContact>();
  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500);
    const r = await rpcNew<UserContact[]>(s, "admin_emails", { p_ids: chunk });
    if (r) {
      must(r).forEach((u) => out.set(u.id, { id: u.id, email: u.email, name: u.name, locale: u.locale }));
      continue;
    }
    for (let j = 0; j < chunk.length; j += 10) {
      const rows = await Promise.all(chunk.slice(j, j + 10).map((id) => loadUser(s, id)));
      rows.forEach((u) => { if (u) out.set(u.id, { id: u.id, email: u.email, name: u.name, locale: null }); });
    }
  }
  return out;
}

/** Correo y nombre de varios usuarios (ver `loadContacts`). */
export async function lookupUsers(s: Session, ids: (string | null | undefined)[]): Promise<Map<string, UserRef>> {
  const contacts = await loadContacts(s, ids);
  return new Map([...contacts].map(([id, u]) => [id, { id: u.id, email: u.email, name: u.name }]));
}

/** Fila de la lista de usuarios (mismas columnas en `admin_users` y `admin_users_v2`). */
export type AdminUserRow = Database["public"]["Functions"]["admin_users"]["Returns"][number];
export type UserListQuery = { p_search: string; p_email: string; p_filter: string; p_role: string; p_country: string };

/**
 * Lista de usuarios con filtros (`admin_users_v2`). Si la migración no está aplicada, cae a `admin_users`:
 * sin filtro de rol ni de país, "7 días" se vuelve "30 días" y el correo exacto se filtra en esta página.
 */
export async function listUsers(s: Session, q: UserListQuery, limit: number, offset: number): Promise<AdminUserRow[]> {
  const r = await rpcNew<AdminUserRow[]>(s, "admin_users_v2", { ...q, p_limit: limit, p_offset: offset });
  if (r) return must(r);
  const rows = must(await s.supabase.rpc("admin_users", {
    p_search: q.p_email || q.p_search, p_filter: q.p_filter === "expiring7" ? "expiring" : q.p_filter, p_limit: limit, p_offset: offset,
  }));
  return q.p_email ? rows.filter((u) => u.email.toLowerCase() === q.p_email.toLowerCase()) : rows;
}
const ALL: UserListQuery = { p_search: "", p_email: "", p_filter: "all", p_role: "", p_country: "" };

/** Busca un usuario por correo exacto. */
export async function findByEmail(s: Session, email: string): Promise<{ id: string; email: string; role: string } | null> {
  for (let offset = 0; offset < 20_000; offset += 1000) {
    const rows = await listUsers(s, { ...ALL, p_email: email.trim().toLowerCase() }, 1000, offset);
    const hit = rows.find((r) => r.email.toLowerCase() === email.trim().toLowerCase());
    if (hit) return { id: hit.id, email: hit.email, role: hit.role };
    if (rows.length < 1000) break;
  }
  return null;
}

/** Todos los administradores (filtro de rol de `admin_users_v2`; sin la migración, recorre la lista de a 1,000). */
export async function loadAdmins(s: Session): Promise<UserRef[]> {
  const out: UserRef[] = [];
  for (let offset = 0; offset < 50_000; offset += 1000) {
    const rows = await listUsers(s, { ...ALL, p_role: "admin" }, 1000, offset);
    rows.filter((r) => r.role === "admin").forEach((r) => out.push({ id: r.id, email: r.email, name: r.name }));
    if (rows.length < 1000) break;
  }
  return out;
}

/**
 * Clase donde más alumnos se quedan entre los que empezaron un curso en los últimos `days` días (el mismo periodo
 * que `admin_summary`). null si no hay datos o la migración no está aplicada.
 */
export async function loadDropoff(s: Session, days: number): Promise<{ lesson: string; course: string; stuck: number } | null> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const r = await rpcNew<{ lesson_id: string; lesson_title: string; course_title: string; stuck: number }[]>(s, "admin_academy_dropoff", { p_since: since });
  if (!r) return null;
  const row = must(r)[0];
  return row ? { lesson: row.lesson_title, course: row.course_title, stuck: Number(row.stuck) } : null;
}

/**
 * Casilla "Avisarles por correo": manda el correo de acceso gratis a cada usuario que lo recibió.
 * Los correos salen de `admin_emails` (nunca de leer perfiles con la clave de servicio). Queda en el registro
 * cuántos salieron. Nunca falla la acción: el acceso ya se dio.
 */
export async function mailGrant(s: Session, ids: string[], kind: "alumno" | "fundador", until: ISODate | null): Promise<GrantMailResult> {
  if (!ids.length) return { sent: 0, skipped: 0, failed: 0 };
  let res: GrantMailResult;
  try {
    const contacts = await loadContacts(s, ids);
    res = await sendGrantEmails([...contacts.values()], { kind, until, day: s.today });
    res.skipped += ids.length - contacts.size;
  } catch {
    console.error("[admin] aviso de acceso por correo no enviado"); // sin datos personales
    return { sent: 0, skipped: 0, failed: ids.length };
  }
  if (res.sent > 0) await audit(s, "dar_acceso_correo", ids.length === 1 ? ids[0] : null, { kind, sent: res.sent, of: ids.length }).catch(() => undefined);
  return res;
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
