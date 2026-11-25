// Usuarios y accesos con un solo plan (25 nov 2026): filtros y plan de cada persona. Sin base de datos.
// Probado en tests/admin.test.ts.
import { splitSearch, type RoleFilter } from "../_shared/lib";

/** Filtros de la lista (mockup AdminUsuarios: Primer mes, Mensual, Anual, Solo lectura, Acceso gratis) más los de atención. */
export const PLAN_FILTERS = ["all", "first_month", "monthly", "yearly", "read_only", "free_access", "inactive", "failed", "expiring7", "expiring", "suspended"] as const;
export type PlanFilter = (typeof PLAN_FILTERS)[number];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
/** Enlaces viejos (`?filtro=pro`, `alumno`, `free`…) siguen llevando a algo con sentido. */
const LEGACY: Record<string, PlanFilter> = { pro: "monthly", trial: "first_month", alumno: "free_access", fundador: "free_access", free: "inactive" };
export function parsePlanFilter(v: string | string[] | undefined): PlanFilter {
  const f = one(v);
  if ((PLAN_FILTERS as readonly string[]).includes(f)) return f as PlanFilter;
  return LEGACY[f] ?? "all";
}

/** Parámetros de `admin_users_v3` (migración 20261125000029_un_plan.sql). */
export function planQuery(q: string, filter: PlanFilter, role: RoleFilter, country: string) {
  const { search, email } = splitSearch(q);
  return { p_search: search, p_email: email, p_filter: filter, p_role: role === "all" ? "" : role, p_country: country === "all" ? "" : country };
}
/** Sin la migración se usa `admin_users_v2`: el plan pagado se filtra como "pro" y el acceso gratis como "alumno". */
export const V2_FILTER: Record<PlanFilter, string> = {
  all: "all", first_month: "pro", monthly: "pro", yearly: "pro", read_only: "read_only", free_access: "alumno", inactive: "free",
  failed: "failed", expiring7: "expiring7", expiring: "expiring", suspended: "suspended",
};

/**
 * Plan que se muestra. Igual que el pago con Stripe: `trialing` es el primer mes ($1), luego mensual o anual.
 * Sin intervalo conocido (dato viejo o sin la migración) queda "pro" ("Pagando").
 */
export type PlanKey = "first_month" | "monthly" | "yearly" | "pro" | "trial" | "alumno" | "fundador" | "read_only" | "free";
export function planKey(state: string, interval: string | null | undefined, stripeStatus: string | null | undefined): PlanKey {
  if (state === "pro") {
    if (stripeStatus === "trialing") return "first_month";
    if (interval === "year") return "yearly";
    if (interval === "month") return "monthly";
    return "pro";
  }
  return (["trial", "alumno", "fundador", "read_only", "free"] as const).find((k) => k === state) ?? "free";
}
