// Dinero: SIEMPRE en centavos enteros. Nunca decimales sueltos.

export type Cents = number;

/** "1,330.50" | "1330,5" | "$1.330" → centavos. Devuelve null si no es un monto. */
export function parseMoney(input: string | number | null | undefined): Cents | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input * 100) : null;
  let s = input.trim().replace(/[^\d.,()\-−+]/g, "");
  if (!s || !/\d/.test(s)) return null;
  const negative = /^[-−(]/.test(s) || /[-−)]$/.test(s);
  s = s.replace(/[()\-−+]/g, "");
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  let decSep = "";
  if (lastDot >= 0 && lastComma >= 0) decSep = lastDot > lastComma ? "." : ",";
  else if (lastComma >= 0) decSep = s.length - lastComma - 1 <= 2 && s.split(",").length === 2 ? "," : "";
  else if (lastDot >= 0) decSep = s.length - lastDot - 1 <= 2 && s.split(".").length === 2 ? "." : "";
  let whole = s, frac = "";
  if (decSep) {
    const i = s.lastIndexOf(decSep);
    whole = s.slice(0, i);
    frac = s.slice(i + 1);
  }
  whole = whole.replace(/[.,]/g, "");
  const cents = Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isFinite(cents)) return null;
  return negative ? -cents : cents;
}

export type MoneyFormat = { currency: string; numberLocale: string };
export const AUD: MoneyFormat = { currency: "AUD", numberLocale: "en-AU" };

const ZERO_DECIMAL = new Set(["COP", "CLP", "JPY", "PYG"]);

/** $7,390 (sin centavos si son .00). Negativos con el signo menos tipográfico: −$86 */
export function formatMoney(cents: Cents, f: MoneyFormat = AUD, opts: { cents?: boolean; sign?: boolean } = {}): string {
  const abs = Math.abs(cents);
  const showCents = opts.cents ?? (abs % 100 !== 0 && !ZERO_DECIMAL.has(f.currency));
  const n = (abs / 100).toLocaleString(f.numberLocale, {
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  });
  const prefix = cents < 0 ? "−" : opts.sign && cents > 0 ? "+" : "";
  return `${prefix}$${n}`;
}

/** $5k, $12.5k para ejes de gráficos */
export function formatCompact(cents: Cents): string {
  const v = Math.abs(cents) / 100;
  const sign = cents < 0 ? "−" : "";
  if (v >= 1_000_000) return `${sign}$${+(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${sign}$${+(v / 1000).toFixed(1)}k`;
  return `${sign}$${Math.round(v)}`;
}

/** Reparte un total en n partes enteras que suman exactamente el total. */
export function splitEven(total: Cents, n: number): Cents[] {
  const base = Math.trunc(total / n);
  const rest = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < Math.abs(rest) ? Math.sign(rest) : 0));
}

export const sum = (xs: Cents[]): Cents => xs.reduce((a, b) => a + b, 0);
export const pct = (part: number, whole: number): number => (whole === 0 ? 0 : part / whole);
