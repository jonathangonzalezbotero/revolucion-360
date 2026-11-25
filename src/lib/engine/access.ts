// Planes y accesos. Desde el 25 nov 2026 hay UN solo plan, todo incluido (CLAUDE.md regla 6):
// - activa: pagando (pro; el primer mes mensual es stripe_status 'trialing'), alumno o fundador vigentes.
// - sin activar (free): se registró y no pagó. Solo bienvenida, asistente y su diagnóstico.
// - solo lectura (read_only): canceló, el pago falló sin arreglarse o venció su acceso gratis. Ve y exporta todo; no edita.
// 'trial' ya no se usa (quedan filas viejas: mientras su fecha no pasa cuentan como activas).

export type PlanState = "free" | "trial" | "pro" | "alumno" | "fundador" | "read_only";
/** @deprecated Ya no hay Gratis/Pro para el usuario. Se conserva por compatibilidad: "pro" = puede ver todo (activa o solo lectura). */
export type Tier = "free" | "pro";
export type FeatureKey = "plan" | "diag" | "metas" | "proy" | "mov" | "ana" | "inv" | "cierre" | "acad" | "deudas" | "csv" | "escenarios" | "recurrentes";
/** @deprecated `app_config.features` ya no decide nada (un solo plan). Se conserva para no romper el panel. */
export type FeatureConfig = Partial<Record<FeatureKey, Tier>>;
export type MenuState = "on" | "soon" | "off";

export type Entitlement = {
  state: PlanState;
  trialEndsAt: string | null;
  proUntil: string | null;
  accessUntil: string | null;
};

/** Lo que una cuenta sin activar puede ver además de bienvenida y asistente: su diagnóstico. */
export const INACTIVE_FEATURES: readonly FeatureKey[] = ["diag"];

const past = (iso: string | null, now: Date) => !!iso && new Date(iso) <= now;

/**
 * Estado efectivo hoy (sin esperar a la tarea diaria de vencimientos):
 * - alumno/fundador con el acceso vencido → solo lectura.
 * - prueba vieja vencida → solo lectura.
 * - Pro con la fecha pasada sigue Pro: lo decide el aviso de Stripe (puede estar reintentando el cobro).
 */
export function effectiveState(e: Entitlement, now: Date = new Date()): PlanState {
  switch (e.state) {
    case "alumno":
    case "fundador": return past(e.accessUntil, now) ? "read_only" : e.state;
    case "trial": return !e.trialEndsAt || past(e.trialEndsAt, now) ? "read_only" : "trial";
    default: return e.state;
  }
}

/** ¿Cuenta activa? Pagando (o en su primer mes), alumno o fundador vigentes. */
export const isActive = (e: Entitlement, now: Date = new Date()) => ["pro", "alumno", "fundador", "trial"].includes(effectiveState(e, now));
/** ¿Sin activar? Se registró y no ha pagado: lo mandamos a "Activa tu cuenta". */
export const needsActivation = (e: Entitlement, now: Date = new Date()) => effectiveState(e, now) === "free";

/** @deprecated Nivel heredado: "pro" = ve todo (activa o solo lectura); "free" = sin activar. */
export function tierOf(e: Entitlement, now: Date = new Date()): Tier {
  return needsActivation(e, now) ? "free" : "pro";
}
/** Solo lectura bloquea la escritura. Sin activar SÍ escribe (bienvenida y asistente crean su plan). */
export const canEdit = (e: Entitlement, now: Date = new Date()) => effectiveState(e, now) !== "read_only";

/**
 * ¿Puede ver esta función? Un solo plan, todo incluido: toda cuenta activa y solo lectura (para ver) la tienen;
 * sin activar, solo su diagnóstico. `cfg` ya no decide nada: se conserva la firma por compatibilidad.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const hasFeature = (feature: FeatureKey, tier: Tier, _cfg?: FeatureConfig) => tier === "pro" || INACTIVE_FEATURES.includes(feature);

/**
 * A qué estado pasa al vencer:
 * - alumno o fundador vencido → solo lectura (antes: Gratis). Nunca se borran datos.
 * - prueba vieja vencida → solo lectura.
 * - Pro que deja de pagar → solo lectura (datos intactos, puede exportar).
 */
export function nextStateOnExpiry(e: Entitlement, now: Date = new Date()): PlanState {
  if (e.state === "trial" && past(e.trialEndsAt, now)) return "read_only";
  if ((e.state === "alumno" || e.state === "fundador") && past(e.accessUntil, now)) return "read_only";
  if (e.state === "pro" && past(e.proUntil, now)) return "read_only";
  return e.state;
}

/** Días que faltan para que venza el acceso (para avisar 30 y 7 días antes). */
export function daysLeft(until: string | null, now: Date = new Date()): number | null {
  if (!until) return null;
  return Math.ceil((new Date(until).getTime() - now.getTime()) / 86_400_000);
}

// ───────── "Activa tu cuenta": qué rutas puede abrir una cuenta sin activar ─────────
/** Rutas que una cuenta sin activar SÍ puede abrir. Bienvenida y asistente no pasan por aquí (requireUser con allowOnboarding). */
export const INACTIVE_ROUTES: readonly string[] = ["/diagnostico", "/activar", "/bienvenida", "/asistente"];

/** ¿Hay que mandarla a /activar? Sin la ruta (no llegó la cabecera) se cierra: va a /activar. */
export function activationRedirect(e: Entitlement, path: string | null, now: Date = new Date()): boolean {
  if (!needsActivation(e, now)) return false;
  if (!path) return true;
  return !INACTIVE_ROUTES.some((r) => path === r || path.startsWith(r + "/"));
}
