// Inversiones por activo: cantidades, costo promedio, valor, resultado, dividendos y agrupaciones.
// Funciones puras (pruebas en tests/inversiones.test.ts). Solo seguimiento: nada aquí recomienda comprar ni vender.
//
// Dinero en centavos enteros (`Cents`). Las cantidades (0.012 BTC) y los precios por unidad (USD 0.0004 por token)
// pueden tener decimales: se guardan como `numeric(38,10)` en la base, viajan como texto y aquí son `Dec`,
// un bigint escalado por 10^10 (1 unidad = 10_000_000_000). Nunca pasan por un número flotante.
// El tsconfig compila a ES2017: los bigint se escriben con BigInt(…), no con literales `10n`.
import type { Cents } from "./money";
import { daysInMonth, iso, type ISODate } from "./dates";
import { payDatesInMonth, type Frequency } from "./plan";

// ───────── Tipos de activo ─────────
export const ASSET_KINDS = ["etf", "stocks", "crypto", "fund", "retirement", "property", "other"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
/** Al crear un activo: los que se compran por unidades (cantidad × precio) frente a los que se siguen por saldo. */
export const tracksUnits = (k: AssetKind) => k === "etf" || k === "stocks" || k === "crypto";

// ───────── Decimales exactos ─────────
export type Dec = bigint;
export const DEC_PLACES = 10;
const B = (n: number | string) => BigInt(n);
const ZERO = B(0), ONE = B(1), TWO = B(2), HUNDRED = B(100);
export const DEC_ONE: Dec = B("10000000000"); // 10^10
const DEC_SQ = DEC_ONE * DEC_ONE;              // 10^20

/** División entera redondeando a la mitad hacia arriba (lejos de cero). */
export function divRound(a: bigint, b: bigint): bigint {
  if (b === ZERO) throw new Error("división entre cero");
  const neg = (a < ZERO) !== (b < ZERO);
  const x = a < ZERO ? -a : a, y = b < ZERO ? -b : b;
  const q = (x * TWO + y) / (TWO * y);
  return neg ? -q : q;
}

/** Texto "1234.5" (siempre con punto, como lo devuelve la base) → Dec. Más de 10 decimales: se redondea. */
function plainToDec(s: string): Dec | null {
  const m = /^(-)?(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (!m[2] && !m[3])) return null;
  const frac = m[3] ?? "";
  let v = B(m[2] || "0") * DEC_ONE + B((frac.slice(0, DEC_PLACES) + "0".repeat(DEC_PLACES)).slice(0, DEC_PLACES));
  if (frac.length > DEC_PLACES && +frac[DEC_PLACES] >= 5) v += ONE;
  return m[1] ? -v : v;
}

/**
 * Lo que escribe la persona → Dec. Acepta "0.012", "0,22", "1,234.5", "1.234,5", "2.125".
 * Con ambos separadores, el último es el decimal. Con uno solo, que se repite, es de miles.
 * Un solo separador es decimal, salvo que el país lo use para los miles y haya exactamente 3 cifras después
 * (en-AU: "1,234" = mil doscientos treinta y cuatro; es-CO: "97.000" = noventa y siete mil).
 * Devuelve null si no es un número. No acepta negativos (las operaciones siempre son positivas).
 */
export function parseDecimal(input: string | null | undefined, numberLocale = "en-AU"): Dec | null {
  if (input === null || input === undefined) return null;
  let s = String(input).trim().replace(/[\s$ ']/g, "");
  if (!s || !/\d/.test(s) || /[^\d.,]/.test(s)) return null;
  const dots = s.split(".").length - 1, commas = s.split(",").length - 1;
  const grouping = (1_000_000).toLocaleString(numberLocale); // con 1000, "es" no agrupa (1000 sale "1000")
  const commaGroups = grouping.includes(","), dotGroups = grouping.includes(".");
  let dec = "";
  if (dots && commas) dec = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
  else if (dots === 1) dec = dotGroups && /\.\d{3}$/.test(s) && !/^0\./.test(s) ? "" : ".";
  else if (commas === 1) dec = commaGroups && /,\d{3}$/.test(s) && !/^0,/.test(s) ? "" : ",";
  const thousands = dec === "." ? "," : dec === "," ? "." : dots ? "." : ",";
  s = s.split(thousands).join("");
  if (dec === ",") s = s.replace(",", ".");
  if ((s.match(/\./g) ?? []).length > 1) return null;
  return plainToDec(s);
}

/** Valor de una columna numeric de la base (llega como texto si se pide `col::text`) → Dec. */
export function decFromDb(v: string | number | null | undefined): Dec | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? plainToDec(v.toFixed(DEC_PLACES)) : null;
  return plainToDec(v.trim());
}

/** Dec → texto para guardar en la base ("0.0120000000" sale "0.012"). */
export function decToDb(d: Dec): string {
  const neg = d < ZERO, a = neg ? -d : d;
  const whole = (a / DEC_ONE).toString(), frac = (a % DEC_ONE).toString().padStart(DEC_PLACES, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

/** Dec → "2.57", "0.012", "1,250" con los separadores del país; como máximo `maxDp` decimales (redondea). */
export function formatDec(d: Dec, numberLocale = "en-AU", maxDp = 8): string {
  const step = B(10) ** B(DEC_PLACES - maxDp);
  const r = divRound(d, step) * step;
  const neg = r < ZERO, a = neg ? -r : r;
  const whole = a / DEC_ONE;
  const frac = (a % DEC_ONE).toString().padStart(DEC_PLACES, "0").slice(0, maxDp).replace(/0+$/, "");
  const sep = (1.5).toLocaleString(numberLocale).includes(",") ? "," : ".";
  return `${neg ? "−" : ""}${whole.toLocaleString(numberLocale)}${frac ? sep + frac : ""}`;
}

/** Precio por unidad escrito en dinero ("552.10") → centavos por unidad, exactos (Dec). */
export function parseUnitPrice(input: string | null | undefined, numberLocale = "en-AU"): Dec | null {
  const d = parseDecimal(input, numberLocale);
  return d === null ? null : d * HUNDRED;
}

/** Cantidad × precio por unidad (centavos, Dec) → centavos enteros, redondeados una sola vez. */
export function mulToCents(qty: Dec, unitPriceCents: Dec): Cents {
  return Number(divRound(qty * unitPriceCents, DEC_SQ));
}

/** Monto en centavos ÷ precio por unidad → cantidad (Dec), truncada a 10 decimales. */
export function qtyFor(amountCents: Cents, unitPriceCents: Dec): Dec | null {
  if (unitPriceCents <= ZERO || amountCents <= 0) return null;
  return (B(amountCents) * DEC_SQ) / unitPriceCents;
}

/** Centavos por unidad → el entero más cercano de centavos (para mostrar con formatMoney cuando no hay fracción). */
export const unitPriceToCents = (p: Dec): Cents => Number(divRound(p, DEC_ONE));
/** ¿El precio por unidad tiene fracción de centavo? (USD 0.0004): entonces se muestra con más decimales. */
export const hasSubCent = (p: Dec) => p % DEC_ONE !== ZERO;

// ───────── Un activo ─────────
export type OpKind = "buy" | "sell" | "dividend";
export const OP_KINDS: OpKind[] = ["buy", "sell", "dividend"];
export type AssetOp = {
  id: string; date: ISODate; kind: OpKind;
  /** Unidades compradas o vendidas (solo activos por unidades). */
  qty: Dec | null;
  /** Lo que costó la compra, lo que te dio la venta o el dividendo, en centavos. */
  amountCents: Cents;
  createdAt?: string;
};
export type AssetState = {
  byUnits: boolean;
  /** Precio de hoy por unidad, escrito a mano (activos por unidades). */
  unitPriceCents: Dec | null;
  /** Saldo de hoy, escrito a mano (activos por saldo). */
  balanceCents: Cents | null;
  priceDate: ISODate | null;
  /** Momento exacto en que se escribió el precio o saldo: desempata operaciones del mismo día. */
  priceAt?: string | null;
  ops: AssetOp[];
};
export type Holding = {
  qty: Dec;
  /** "Has puesto": costo de lo que todavía tienes (las ventas sacan su parte al costo promedio). */
  costCents: Cents;
  /** Costo promedio por unidad, en centavos (Dec). null si no tienes unidades. */
  avgCostCents: Dec | null;
  valueCents: Cents;
  gainCents: Cents;
  gainPct: number;
  dividendsCents: Cents;
  /** Ganancia o pérdida de lo ya vendido (lo que te dieron − su costo). */
  realizedCents: Cents;
  /** Ya escribiste el precio o el saldo de hoy. Sin él, vale lo que pusiste (nunca un −100 % falso). */
  hasPrice: boolean;
  /** Alguna venta fue por más unidades de las que tenías en esa fecha (se tomó lo que había). */
  oversold: boolean;
};

/** Orden de las operaciones: por fecha y, el mismo día, en el orden en que se registraron. */
export function sortOps<T extends Pick<AssetOp, "date" | "id"> & { createdAt?: string }>(ops: T[]): T[] {
  return ops.slice().sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1)
    : (a.createdAt ?? "") !== (b.createdAt ?? "") ? ((a.createdAt ?? "") < (b.createdAt ?? "") ? -1 : 1)
    : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Una operación que pasó después del último precio o saldo escrito. */
const afterPrice = (op: AssetOp, date: ISODate | null, at?: string | null) =>
  date === null || op.date > date || (op.date === date && !!at && !!op.createdAt && op.createdAt > at);

/**
 * Por unidades (ETF, acciones, cripto): compra suma unidades y costo; venta saca unidades y su parte del costo
 * (costo × vendidas ÷ las que tenías: vender todo deja el costo en 0 exacto); vale = cantidad × precio de hoy.
 * Por saldo (super, fondo, propiedad): compra = aporte, venta = retiro (resta de lo puesto, sin bajar de 0);
 * vale = último saldo escrito + aportes − retiros posteriores (la misma regla que el saldo esperado de una cuenta).
 * Dividendo: dinero que recibiste; no cambia cantidad ni costo.
 */
export function computeHolding(a: AssetState): Holding {
  let qty = ZERO, cost = 0, div = 0, realized = 0, oversold = false, after = 0;
  for (const op of sortOps(a.ops)) {
    const amt = Math.abs(op.amountCents);
    if (op.kind === "dividend") { div += amt; continue; }
    if (a.byUnits) {
      const q = op.qty !== null && op.qty > ZERO ? op.qty : ZERO;
      if (op.kind === "buy") { qty += q; cost += amt; continue; }
      let sold = q;
      if (sold > qty) { oversold = true; sold = qty; }
      const removed = sold === qty ? cost : Number(divRound(B(cost) * sold, qty));
      cost -= removed; qty -= sold; realized += amt - removed;
    } else {
      if (op.kind === "buy") cost += amt;
      else { const removed = Math.min(cost, amt); cost -= removed; }
      if (afterPrice(op, a.priceDate, a.priceAt)) after += op.kind === "buy" ? amt : -amt;
    }
  }
  const hasPrice = a.byUnits ? a.unitPriceCents !== null : a.balanceCents !== null;
  const valueCents = !hasPrice ? cost
    : a.byUnits ? mulToCents(qty, a.unitPriceCents as Dec)
    : Math.max(0, (a.balanceCents as Cents) + after);
  const gainCents = valueCents - cost;
  return {
    qty, costCents: cost, avgCostCents: a.byUnits && qty > ZERO ? divRound(B(cost) * DEC_SQ, qty) : null,
    valueCents, gainCents, gainPct: cost > 0 ? gainCents / cost : 0, dividendsCents: div, realizedCents: realized, hasPrice, oversold,
  };
}

// ───────── Totales y agrupaciones ─────────
export type Totals = { valueCents: Cents; costCents: Cents; gainCents: Cents; gainPct: number; dividendsCents: Cents };

/** Vale hoy, has puesto, resultado (monto y %) y dividendos recibidos de todos los activos. */
export function portfolioTotals(items: Pick<Holding, "valueCents" | "costCents" | "dividendsCents">[]): Totals {
  const valueCents = items.reduce((s, i) => s + i.valueCents, 0);
  const costCents = items.reduce((s, i) => s + i.costCents, 0);
  const dividendsCents = items.reduce((s, i) => s + i.dividendsCents, 0);
  const gainCents = valueCents - costCents;
  return { valueCents, costCents, gainCents, gainPct: costCents > 0 ? gainCents / costCents : 0, dividendsCents };
}

export type Group = { key: string; n: number; valueCents: Cents; costCents: Cents; gainCents: Cents; gainPct: number; share: number };

/** Por plataforma o por tipo: cuántos activos, cuánto valen y su parte del total (0 a 1), de mayor a menor valor. */
export function groupAssets(items: { key: string; valueCents: Cents; costCents: Cents }[]): Group[] {
  const total = items.reduce((s, i) => s + Math.max(0, i.valueCents), 0);
  const by = new Map<string, { n: number; v: Cents; c: Cents }>();
  for (const i of items) {
    const g = by.get(i.key) ?? { n: 0, v: 0, c: 0 };
    g.n++; g.v += i.valueCents; g.c += i.costCents;
    by.set(i.key, g);
  }
  return [...by.entries()]
    .map(([key, g]) => ({ key, n: g.n, valueCents: g.v, costCents: g.c, gainCents: g.v - g.c, gainPct: g.c > 0 ? (g.v - g.c) / g.c : 0, share: total > 0 ? Math.max(0, g.v) / total : 0 }))
    .sort((a, b) => b.valueCents - a.valueCents || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

// ───────── Compras recurrentes ligadas al plan ─────────
export type DueBuy = { month: string; date: ISODate; amountCents: Cents };

/**
 * Compras recurrentes que ya tocaban: una por mes del año de la línea, con el monto de su celda del plan
 * (la celda editada a mano gana, como en todo el plan), en el primer día de pago de ese mes,
 * solo desde que se ligó (`from`) y hasta hoy. `done` = meses ("YYYY-MM") que ya se sumaron: nunca dos veces.
 */
export function recurringDue(input: {
  year: number; frequency: Frequency; firstPayDate: ISODate | null; monthCents: (month: number) => Cents;
  from: ISODate; today: ISODate; done: Set<string>;
}): DueBuy[] {
  const out: DueBuy[] = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${input.year}-${String(m).padStart(2, "0")}`;
    if (input.done.has(key)) continue;
    const amountCents = input.monthCents(m);
    if (amountCents <= 0) continue;
    const fd = input.firstPayDate;
    const date = payDatesInMonth(input.frequency, fd, input.year, m)[0]
      ?? iso(input.year, m, fd ? Math.min(+fd.slice(8, 10), daysInMonth(input.year, m)) : 1);
    if (date < input.from || date > input.today) continue;
    out.push({ month: key, date, amountCents });
  }
  return out;
}

/**
 * Cambio de año: el plan copia sus líneas con otro id. Si la línea ligada es de un año anterior,
 * se busca la del año en curso con el mismo nombre y la misma categoría.
 */
export function carryLine<L extends { id: string; name: string; categoryId: string; year: number }>(linked: L, current: L[]): L | null {
  const n = linked.name.trim().toLowerCase();
  return current.find((l) => l.year !== linked.year && l.categoryId === linked.categoryId && l.name.trim().toLowerCase() === n) ?? null;
}

/** Texto corto del cuadrito del activo: el símbolo si es corto ("VOO", "Super"), si no las iniciales. */
export function tickerOf(name: string): string {
  const t = name.trim();
  if (!t) return "?";
  if (t.length <= 5 && !/\s/.test(t)) return t;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 3).map((w) => w[0]).join("").toUpperCase();
  return t.slice(0, 4);
}
