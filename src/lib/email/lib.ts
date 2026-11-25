// Correos, avisos y tareas programadas: piezas PURAS (sin base de datos ni red), probadas en tests/correos.test.ts.
// Nunca reciben ni devuelven montos: solo fechas, estados, nombres de mes, puntos y rachas.
import { addDays, daysInMonth, daysLeft, nextStateOnExpiry, parts, todayIn, weekStart, type Entitlement, type ISODate, type PlanState, type FeatureConfig, type Tier } from "@/lib/engine";
import { readNotifyPrefs, type NotifyPrefs } from "@/app/(app)/perfil/lib";
import { activeGrant, isPaying, type Grant } from "@/app/(app)/suscripcion/lib";

export type EmailKind = "welcome" | "close_reminder" | "access_expiring" | "payment_failed" | "access_granted" | "first_month_ending";
export type Period = { year: number; month: number };

// ───────── Preferencias (las guarda Perfil en profiles.prefs) ─────────
export type Prefs = NotifyPrefs;
/** Lee prefs con los mismos valores por defecto que Perfil (close/payments/achievements/academy: sí; canal: ambos; día: "last"). */
export const readPrefs = (prefs: unknown): Prefs => readNotifyPrefs(prefs && typeof prefs === "object" ? (prefs as Record<string, unknown>) : {});
export const allowsEmail = (p: Prefs) => p.channel === "both" || p.channel === "email";
export const allowsApp = (p: Prefs) => p.channel === "both" || p.channel === "app";

// ───────── Fechas en la zona horaria de cada usuario ─────────
/** Hoy en la zona del usuario. Una zona inválida no tumba el lote: cae a Sydney (la zona por defecto de la app). */
export function safeToday(timezone: string | null | undefined, now: Date = new Date()): ISODate {
  try { return todayIn(timezone || "Australia/Sydney", now); } catch { return todayIn("Australia/Sydney", now); }
}
export const periodRef = (p: Period) => `${p.year}-${String(p.month).padStart(2, "0")}`;
export const prevPeriod = (p: Period): Period => (p.month === 1 ? { year: p.year - 1, month: 12 } : { year: p.year, month: p.month - 1 });
export const nextPeriod = (p: Period): Period => (p.month === 12 ? { year: p.year + 1, month: 1 } : { year: p.year, month: p.month + 1 });

/**
 * Ventanas del recordatorio de cierre (un solo correo por mes: el `ref` es el mes a cerrar).
 * - "last": desde que empiezan los últimos 10 días del mes (el mismo día que promete Cierre con `reminderDate`) hasta fin de mes.
 * - "first": los primeros 5 días del mes siguiente, para cerrar el mes que terminó.
 * Es una ventana (no un día exacto) para que una corrida perdida de la tarea diaria no deje a nadie sin aviso.
 */
export const CLOSE_WINDOW = { lastDays: 10, firstDays: 5 } as const;

export function closeReminderPeriod(today: ISODate, closeDay: Prefs["closeDay"]): Period | null {
  const { y, m, d } = parts(today);
  if (closeDay === "first") return d <= CLOSE_WINDOW.firstDays ? prevPeriod({ year: y, month: m }) : null;
  return d > daysInMonth(y, m) - CLOSE_WINDOW.lastDays ? { year: y, month: m } : null;
}

/** ¿Está cerrado ese mes? Un mes reabierto cuenta como abierto. */
export function isClosed(rows: { year: number; month: number; reopened_at: string | null }[], p: Period): boolean {
  return rows.some((r) => r.year === p.year && r.month === p.month && !r.reopened_at);
}
/** Cierres seguidos que terminan en el mes anterior al que se va a cerrar (la racha que se mantiene si cierra hoy). */
export function closureStreakBefore(rows: { year: number; month: number; reopened_at: string | null }[], p: Period): number {
  let n = 0;
  for (let c = prevPeriod(p); isClosed(rows, c); c = prevPeriod(c)) n++;
  return n;
}

/**
 * Recordatorio de cierre: toda cuenta activa (un solo plan, todo incluido) con la sección Cierre encendida.
 * Sin activar o en solo lectura, no (no puede cerrar el mes). `features` ya no decide nada: se conserva la firma.
 */
export function canGetCloseReminder(tier: Tier, _features: FeatureConfig, menuCierre: string | undefined, state: PlanState): boolean {
  if (menuCierre !== undefined && menuCierre !== "on") return false;
  if (state === "read_only" || state === "free") return false;
  return tier === "pro";
}

// ───────── Vencimientos ─────────
/** Aviso de acceso por vencer: 8–30 días → "30", 1–7 días → "7". Fuera de eso, nada. */
export function expiryBucket(until: string | null, now: Date = new Date()): 30 | 7 | null {
  const d = daysLeft(until, now);
  if (d === null || d <= 0 || d > 30) return null;
  return d <= 7 ? 7 : 30;
}
/** `ref` del aviso de fin del primer mes: la suscripción + el fin de su prueba. Un aviso repetido de Stripe no manda otro correo. */
export const firstMonthRef = (subId: string, trialEndSec: number) => `${subId}-${trialEndSec}`;

/** `ref` del aviso: fecha de vencimiento + ventana. Si le cambian la fecha, vuelve a avisar; nunca dos veces la misma. */
export const expiryRef = (until: string, bucket: 30 | 7) => `${until.slice(0, 10)}-${bucket}`;

export type ExpiryRow = Entitlement & { stripeStatus: string | null };
/**
 * Estado al vencer, con la misma regla que `nextStateOnExpiry` del motor (todo vencimiento → solo lectura), más dos cuidados:
 * - Pro con `pro_until` vencido pero con Stripe todavía cobrando (active/trialing/past_due) NO pasa a solo lectura: el aviso de Stripe manda.
 * - Alumno o fundador vencido que ya paga en Stripe pasa a Pro (pagó antes de que venciera).
 * - Si tiene otro acceso gratis vigente (alumno o fundador), pasa a ese en vez de solo lectura.
 * Devuelve null si no cambia nada.
 */
export function expiryTransition(e: ExpiryRow, grants: Grant[], now: Date = new Date()): { state: PlanState; accessUntil?: string | null } | null {
  const next = nextStateOnExpiry(e, now);
  if (next === e.state) return null;
  if (e.state === "pro" && isPaying(e.stripeStatus)) return null;
  const g = activeGrant(grants, now);
  if (!g && (e.state === "alumno" || e.state === "fundador") && isPaying(e.stripeStatus)) return { state: "pro" };
  if (g) return { state: g.state, accessUntil: g.accessUntil };
  return { state: next };
}

/** El pago fallido es "reciente" durante 7 días; el `ref` es el momento exacto del fallo (uno por fallo). */
export const PAYMENT_RECENT_DAYS = 7;
export const paymentRef = (failedAt: string) => new Date(failedAt).toISOString();

// ───────── Acceso gratis dado desde el panel ─────────
/**
 * `ref` del aviso de acceso gratis: día en que se dio + tipo + vencimiento. Repetir el mismo acceso el mismo día
 * no manda otro correo; extenderlo (otra fecha) o darlo otro día, sí.
 */
export const grantRef = (day: ISODate, kind: string, until: ISODate | null) => `${day}-${kind}-${until ?? "vida"}`;

// ───────── Racha ─────────
/**
 * ¿Se puede salvar la racha con el comodín? Sí si la semana pasada quedó sin acción, la racha que venía antes era de 2 semanas o más
 * y no ha gastado el comodín del mes de esa semana (igual que `use_wildcard` en la base).
 */
export function streakToSave(rows: { weekStart: ISODate; wildcard: boolean }[], currentWeekStart: ISODate): { missedWeek: ISODate; weeks: number } | null {
  const set = new Set(rows.map((r) => r.weekStart));
  const missed = addDays(currentWeekStart, -7);
  if (set.has(missed)) return null;
  let weeks = 0;
  for (let c = addDays(missed, -7); set.has(c); c = addDays(c, -7)) weeks++;
  if (weeks < 2) return null;
  const month = missed.slice(0, 7);
  if (rows.some((r) => r.wildcard && r.weekStart.slice(0, 7) === month)) return null;
  return { missedWeek: missed, weeks };
}
export const currentWeekOf = (timezone: string | null | undefined, now: Date = new Date()) => weekStart(safeToday(timezone, now));

// ───────── Seguridad del envío ─────────
/** Fuera de producción solo salen correos a los usuarios de demostración. */
export const DEMO_DOMAIN = "@revolucion360.test";
export function mayEmail(to: string, production: boolean): boolean {
  const addr = to.trim().toLowerCase();
  if (!addr.includes("@")) return false;
  return production || addr.endsWith(DEMO_DOMAIN);
}

/** Primer nombre para el saludo (o vacío). */
export const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Lotes de N para consultas con `.in()` (URLs cortas). */
export function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
