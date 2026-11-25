// Bienvenida: piezas puras (sin base de datos).

/** Monedas que la app sabe mostrar (las mismas de `NUMBER_LOCALE` en la sesión). */
export const CURRENCIES = ["AUD", "USD", "NZD", "GBP", "EUR", "COP", "MXN", "CLP", "PEN", "ARS", "CAD"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const isCurrency = (v: string): v is Currency => (CURRENCIES as readonly string[]).includes(v);

/**
 * Lo que el usuario quiere lograr este año. Desde el 25 nov 2026 (aprobado por Jonathan) no se vuelven metas:
 * quedan como objetivos del perfil (`profiles.prefs.objectives`) y Metas los ofrece como sugerencia hasta que la crea o la descarta.
 */
export const GOAL_KEYS = ["debts", "trip", "emergency", "clarity", "invest", "business"] as const;
export type GoalKey = (typeof GOAL_KEYS)[number];
export const isGoalKey = (v: unknown): v is GoalKey => typeof v === "string" && (GOAL_KEYS as readonly string[]).includes(v);

/** Objetivos guardados en `prefs.objectives`: solo claves conocidas, sin repetir, en el orden de la bienvenida. */
export function readObjectives(prefs: Record<string, unknown>): GoalKey[] {
  const raw = Array.isArray(prefs.objectives) ? prefs.objectives : [];
  return GOAL_KEYS.filter((k) => raw.includes(k));
}
/** Escribe los objetivos y conserva cualquier otra clave de prefs. */
export function withObjectives(prefs: Record<string, unknown>, keys: readonly unknown[]): Record<string, unknown> {
  return { ...prefs, objectives: GOAL_KEYS.filter((k) => keys.includes(k)) };
}
/** Quita un objetivo (se creó su meta o se descartó la sugerencia). */
export const withoutObjective = (prefs: Record<string, unknown>, key: GoalKey): Record<string, unknown> =>
  withObjectives(prefs, readObjectives(prefs).filter((k) => k !== key));

/** La zona horaria que detectó el navegador, solo si es una zona IANA real; si no, la del país. */
export function safeTimezone(tz: string | null | undefined, fallback: string): string {
  if (!tz || tz.length > 64 || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){1,2}$/.test(tz)) return fallback;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(0));
    return tz;
  } catch {
    return fallback;
  }
}

/**
 * Idioma del país para un usuario nuevo. Solo en el primer guardado de la bienvenida (paso 'welcome')
 * y si su idioma sigue siendo el de fábrica ('es'): antes de ese paso no puede elegir idioma (Perfil
 * exige terminar la bienvenida), así que no se pisa una elección suya. null = no se cambia.
 */
export function localeForNewUser(p: { step: string; current: string; countryDefault: unknown }): "es" | "en" | null {
  if (p.step !== "welcome" || p.current !== "es") return null;
  return p.countryDefault === "en" ? "en" : null;
}
