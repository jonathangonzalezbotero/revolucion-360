// Fechas: se trabajan como texto ISO "YYYY-MM-DD" (sin hora) y se calculan en la zona horaria del usuario.

export type ISODate = string;

export const MONTHS_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
export const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthName = (m: number, locale = "es") => (locale === "en" ? MONTHS_EN : MONTHS_ES)[m - 1];
export const monthShort = (m: number, locale = "es") => monthName(m, locale).slice(0, 3);

const pad = (n: number) => String(n).padStart(2, "0");
export const iso = (y: number, m: number, d: number): ISODate => `${y}-${pad(m)}-${pad(d)}`;
export const parts = (d: ISODate) => ({ y: +d.slice(0, 4), m: +d.slice(5, 7), d: +d.slice(8, 10) });
const utc = (d: ISODate) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const fromUtc = (t: number): ISODate => new Date(t).toISOString().slice(0, 10);
const DAY = 86_400_000;

export const addDays = (d: ISODate, n: number): ISODate => fromUtc(utc(d) + n * DAY);
export const diffDays = (a: ISODate, b: ISODate): number => Math.round((utc(a) - utc(b)) / DAY);
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** 1 = lunes … 7 = domingo */
export const isoWeekday = (d: ISODate) => new Date(utc(d)).getUTCDay() || 7;

export function addMonths(d: ISODate, n: number): ISODate {
  const p = parts(d);
  const total = p.y * 12 + (p.m - 1) + n;
  const y = Math.floor(total / 12), m = (total % 12) + 1;
  return iso(y, m, Math.min(p.d, daysInMonth(y, m)));
}

/** Hoy en la zona horaria del usuario (no la del servidor). */
export function todayIn(timezone: string, now: Date = new Date()): ISODate {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(now);
}

/** Lunes de la semana (lunes a domingo) de una fecha. */
export const weekStart = (d: ISODate): ISODate => addDays(d, 1 - isoWeekday(d));

/** Meses completos que faltan entre hoy y una fecha (mínimo 1 si la fecha es futura). */
export function monthsUntil(from: ISODate, to: ISODate): number {
  const a = parts(from), b = parts(to);
  let m = (b.y - a.y) * 12 + (b.m - a.m);
  if (b.d < a.d) m -= 1;
  return m;
}

export function formatDate(d: ISODate, locale = "es", style: "long" | "short" | "day" = "long"): string {
  const p = parts(d);
  if (style === "short") return `${p.d} ${monthShort(p.m, locale).toLowerCase()}`;
  if (style === "day") return locale === "en" ? `${monthName(p.m, "en")} ${p.d}` : `${p.d} de ${monthName(p.m).toLowerCase()}`;
  return locale === "en" ? `${monthName(p.m, "en")} ${p.d}, ${p.y}` : `${p.d} de ${monthName(p.m).toLowerCase()} de ${p.y}`;
}

const DAYS_ES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const DAYS_EN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const weekdayName = (d: ISODate, locale = "es") => (locale === "en" ? DAYS_EN : DAYS_ES)[isoWeekday(d) - 1];
