// Planes y accesos. Qué es Gratis y qué es Pro se lee de la configuración de Admin, nunca del código.

export type PlanState = "free" | "trial" | "pro" | "alumno" | "fundador" | "read_only";
export type Tier = "free" | "pro";
export type FeatureKey = "plan" | "diag" | "metas" | "proy" | "mov" | "ana" | "inv" | "cierre" | "acad" | "deudas" | "csv" | "escenarios" | "recurrentes";
export type FeatureConfig = Partial<Record<FeatureKey, Tier>>;
export type MenuState = "on" | "soon" | "off";

export type Entitlement = {
  state: PlanState;
  trialEndsAt: string | null;
  proUntil: string | null;
  accessUntil: string | null;
};

/** Nivel efectivo hoy. Prueba, Pro, alumno y fundador ven todo. Solo lectura ve todo lo que ya tenía, sin editar. */
export function tierOf(e: Entitlement, now: Date = new Date()): Tier {
  switch (e.state) {
    case "pro": return "pro";
    case "fundador": return "pro";
    case "trial": return e.trialEndsAt && new Date(e.trialEndsAt) > now ? "pro" : "free";
    case "alumno": return !e.accessUntil || new Date(e.accessUntil) > now ? "pro" : "free";
    case "read_only": return "pro";
    default: return "free";
  }
}
export const canEdit = (e: Entitlement) => e.state !== "read_only";
export const hasFeature = (feature: FeatureKey, tier: Tier, cfg: FeatureConfig) => (cfg[feature] ?? "free") === "free" || tier === "pro";

/**
 * A qué estado pasa al vencer:
 * - prueba vencida → Gratis
 * - alumno vencido → Gratis (sin perder datos)
 * - Pro que deja de pagar → solo lectura (datos intactos, puede exportar)
 */
export function nextStateOnExpiry(e: Entitlement, now: Date = new Date()): PlanState {
  if (e.state === "trial" && e.trialEndsAt && new Date(e.trialEndsAt) <= now) return "free";
  if (e.state === "alumno" && e.accessUntil && new Date(e.accessUntil) <= now) return "free";
  if (e.state === "pro" && e.proUntil && new Date(e.proUntil) <= now) return "read_only";
  return e.state;
}

/** Días que faltan para que venza el acceso (para avisar 30 y 7 días antes). */
export function daysLeft(until: string | null, now: Date = new Date()): number | null {
  if (!until) return null;
  return Math.ceil((new Date(until).getTime() - now.getTime()) / 86_400_000);
}
