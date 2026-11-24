// Bienvenida: piezas puras (sin base de datos).

/** Monedas que la app sabe mostrar (las mismas de `NUMBER_LOCALE` en la sesión). */
export const CURRENCIES = ["AUD", "USD", "NZD", "GBP", "EUR", "COP", "MXN", "CLP", "PEN", "ARS", "CAD"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const isCurrency = (v: string): v is Currency => (CURRENCIES as readonly string[]).includes(v);

/** Lo que el usuario quiere lograr este año (se vuelven sus primeras metas). */
export const GOAL_KEYS = ["debts", "trip", "emergency", "clarity", "invest", "business"] as const;
export type GoalKey = (typeof GOAL_KEYS)[number];

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
