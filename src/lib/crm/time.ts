// CRM: horas en la zona de cada persona. PURO, probado en tests/crm.test.ts (incluye cambios de horario).
export const DEFAULT_TZ = "Australia/Sydney";
/** La primera zona del mundo en llegar a una hora (UTC+14). Una campaña programada empieza a encolarse cuando aquí llega su hora. */
export const EARLIEST_TZ = "Pacific/Kiritimati";

export function isValidTz(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(0);
    return true;
  } catch {
    return false;
  }
}
/** Zona del contacto; si no tiene (un lead), la de su país; si tampoco, Sydney. */
export const resolveTz = (contactTz: string | null | undefined, countryTz?: string | null) =>
  isValidTz(contactTz) ? contactTz : isValidTz(countryTz) ? countryTz : DEFAULT_TZ;
/**
 * Zona para un SMS: la del contacto o, si no, la de su país. SIN la de Sydney por defecto: si no se sabe la hora de la
 * persona no se le manda un SMS (podría llegarle de noche). null = no se envía.
 */
export const smsTz = (contactTz: string | null | undefined, countryTz?: string | null): string | null =>
  isValidTz(contactTz) ? contactTz : isValidTz(countryTz) ? countryTz : null;

/** Reloj de pared en una zona: { y, m, d, h, min }. */
export function wallClock(at: Date, tz: string): { y: number; m: number; d: number; h: number; min: number } {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute };
}
const DAY_MS = 86_400_000;
const offsetMs = (at: Date, tz: string) => {
  const w = wallClock(at, tz);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.min) - Math.floor(at.getTime() / 60_000) * 60_000;
};

/**
 * "2026-12-01T07:00" en la zona `tz` → instante UTC. Si esa hora no existe (se adelanta el reloj), cae en la hora
 * siguiente que sí existe; si existe dos veces (se atrasa), se usa la primera.
 */
export function zonedToUtc(local: string, tz: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new Error("local");
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // Los desfases posibles alrededor de esa fecha (antes y después de un cambio de horario).
  const offsets = new Set([-DAY_MS, 0, DAY_MS].map((d) => offsetMs(new Date(guess + d), tz)));
  const candidates = [...offsets].map((o) => guess - o);
  const wall = (t: number) => { const w = wallClock(new Date(t), tz); return Date.UTC(w.y, w.m - 1, w.d, w.h, w.min); };
  const exact = candidates.filter((t) => wall(t) === guess);
  return new Date(exact.length ? Math.min(...exact) : Math.max(...candidates));
}

/** Instante en que una campaña programada empieza a encolarse (la primera zona del mundo llega a la hora). */
export const campaignStartsAt = (local: string) => zonedToUtc(local, EARLIEST_TZ);

/** Cuándo le sale a esta persona: "Enviar ahora" = ya; "Programar" = esa hora en SU zona (o ya, si esa hora pasó). */
export function campaignSendAt(mode: "now" | "local", local: string | null, tz: string, now: Date): Date {
  if (mode === "now" || !local) return now;
  const at = zonedToUtc(local, tz);
  return at > now ? at : now;
}

/** SMS solo de día en la hora de la persona (9:00 a 20:00). Fuera de eso, a las 9:00 siguientes. */
export const SMS_HOURS = { from: 9, to: 20 } as const;
export function smsSendAt(now: Date, tz: string): Date {
  const w = wallClock(now, tz);
  if (w.h >= SMS_HOURS.from && w.h < SMS_HOURS.to) return now;
  const day = new Date(Date.UTC(w.y, w.m - 1, w.d + (w.h >= SMS_HOURS.to ? 1 : 0)));
  const local = `${day.toISOString().slice(0, 10)}T${String(SMS_HOURS.from).padStart(2, "0")}:00`;
  return zonedToUtc(local, tz);
}

/** "Esperar N días y H horas" desde ahora; "Esperar hasta el cobro" = la fecha de cobro (o ya, si no hay o pasó). */
export function waitUntil(step: { days?: number; hours?: number; until?: "charge" }, now: Date, chargeAt: string | null): Date {
  if (step.until === "charge") {
    const at = chargeAt ? new Date(chargeAt) : null;
    return at && at > now ? at : now;
  }
  return new Date(now.getTime() + ((step.days ?? 0) * 24 + (step.hours ?? 0)) * 3_600_000);
}
