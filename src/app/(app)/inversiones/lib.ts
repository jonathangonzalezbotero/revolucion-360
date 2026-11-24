// Cálculos propios de Inversiones (puros, con pruebas en tests/deudas-inversiones.test.ts).
import { investmentResult, type Cents, type ISODate } from "@/lib/engine";

export const INV_TYPES = ["etf", "fondos", "cripto", "super", "ahorro", "propiedad", "otro"] as const;
export type InvType = (typeof INV_TYPES)[number];

/** Color de cada tipo (solo tokens). */
export const TYPE_COLOR: Record<InvType, string> = {
  etf: "var(--tinta)", fondos: "var(--azul)", cripto: "var(--amarillo-oscuro)", super: "var(--azul-oscuro)",
  ahorro: "var(--teal)", propiedad: "var(--naranja)", otro: "var(--gris-5)",
};

/** El tipo se guarda como texto en `investments.name` y se reconoce en cualquier idioma; lo demás es "otro". */
export function typeOf(name: string, labels: Record<InvType, string>[]): InvType {
  const k = name.trim().toLowerCase();
  for (const set of labels) for (const t of INV_TYPES) if (set[t].toLowerCase() === k) return t;
  return "otro";
}

export type EntryKind = "aporte" | "retiro" | "valor";
export type Holding = { contributedCents: Cents; valueCents: Cents };

/**
 * Efecto de un registro: un aporte suma a lo puesto y a lo que vale (hasta el próximo "valor de hoy");
 * un retiro resta de los dos; "valor de hoy" solo cambia lo que vale. Nada queda negativo.
 */
export function applyEntry(h: Holding, kind: EntryKind, amountCents: Cents): Holding {
  const a = Math.abs(amountCents);
  if (kind === "valor") return { contributedCents: h.contributedCents, valueCents: a };
  if (kind === "aporte") return { contributedCents: h.contributedCents + a, valueCents: h.valueCents + a };
  return { contributedCents: Math.max(0, h.contributedCents - a), valueCents: Math.max(0, h.valueCents - a) };
}

/** Totales: vale hoy, has puesto, resultado y % (investmentResult). */
export function invTotals(items: Holding[]) {
  const valueCents = items.reduce((a, i) => a + i.valueCents, 0);
  const contributedCents = items.reduce((a, i) => a + i.contributedCents, 0);
  return { valueCents, contributedCents, ...investmentResult(contributedCents, valueCents) };
}

/** Cómo está repartido: por tipo, solo lo que vale algo, de mayor a menor. `share` de 0 a 1. */
export function distribution(items: { type: InvType; valueCents: Cents }[]) {
  const total = items.reduce((a, i) => a + Math.max(0, i.valueCents), 0);
  if (total <= 0) return [];
  const by = new Map<InvType, Cents>();
  for (const i of items) if (i.valueCents > 0) by.set(i.type, (by.get(i.type) ?? 0) + i.valueCents);
  return [...by.entries()].map(([type, valueCents]) => ({ type, valueCents, share: valueCents / total })).sort((a, b) => b.valueCents - a.valueCents);
}

/**
 * Evolución de lo que vale todo: un punto por cada fecha con un "valor de hoy".
 * En cada fecha suma el último valor conocido de cada inversión (se arrastra hasta el siguiente).
 * Recibe los registros del más viejo al más nuevo: si hay dos valores el mismo día, gana el último registrado.
 */
export function valueSeries(entries: { investmentId: string; date: ISODate; kind: EntryKind; amountCents: Cents }[]): { date: ISODate; cents: Cents }[] {
  const vals = entries.filter((e) => e.kind === "valor").slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const last = new Map<string, Cents>();
  const out: { date: ISODate; cents: Cents }[] = [];
  for (let i = 0; i < vals.length; i++) {
    last.set(vals[i].investmentId, vals[i].amountCents);
    if (i + 1 < vals.length && vals[i + 1].date === vals[i].date) continue; // varias el mismo día: un solo punto
    out.push({ date: vals[i].date, cents: [...last.values()].reduce((a, b) => a + b, 0) });
  }
  return out;
}

/** Geometría del gráfico (viewBox 0..1000 × 0..100): x por fecha real, y desde 0 hasta un tope redondo. */
export function chartPoints(series: { date: ISODate; cents: Cents }[]): { points: { x: number; y: number }[]; max: Cents } {
  if (series.length === 0) return { points: [], max: 0 };
  const day = (d: ISODate) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  const t0 = day(series[0].date), span = day(series[series.length - 1].date) - t0;
  const max = niceMax(Math.max(...series.map((s) => s.cents), 100));
  return {
    max,
    points: series.map((s, i) => ({
      x: span > 0 ? +(((day(s.date) - t0) / span) * 1000).toFixed(1) : series.length > 1 ? +((i / (series.length - 1)) * 1000).toFixed(1) : 500,
      y: +(100 - (s.cents / max) * 100).toFixed(2),
    })),
  };
}

/** Tope "redondo" del eje: 1, 2, 2.5 o 5 × 10ⁿ por encima del máximo (en centavos). */
export function niceMax(raw: Cents): Cents {
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}
