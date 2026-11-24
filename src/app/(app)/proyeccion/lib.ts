// Cálculos propios de Proyección (puros, con pruebas en tests/proyeccion-analisis.test.ts).
// El motor (`forecast`) trabaja un año a la vez con meses 1–12; aquí se encadena con el año siguiente.
import { z } from "zod";
import { cellMap, cellOf, firstNegativeMonth, forecast, type Cents, type PlanCell, type PlanLine, type Scenario } from "@/lib/engine";

export type YearPlan = { lines: PlanLine[]; cells: PlanCell[] };

/**
 * Meses del escenario: 1–12 = el año base, 13–24 = el año siguiente.
 * Así una fila guardada como `{ from: 3, to: 6 }` sigue significando marzo a junio del año base.
 */
export type Extra = { name: string; amount_cents: Cents; from: number; to: number };
export type ScenarioConfig = { off: string[]; extra: Extra[] };
export const EMPTY: ScenarioConfig = { off: [], extra: [] };
export type SeriesPoint = { idx: number; year: number; month: number; netCents: Cents; balanceCents: Cents };
export type HorizonMonth = { idx: number; year: number; month: number };

export const MAX_EXTRAS = 20;

/** Meses que se proyectan: del mes actual a diciembre, o 12 meses seguidos si se pide seguir con el año siguiente. */
export function horizon(baseYear: number, fromMonth: number, extended: boolean): HorizonMonth[] {
  const last = extended ? fromMonth + 11 : 12;
  const out: HorizonMonth[] = [];
  for (let idx = fromMonth; idx <= last; idx++) out.push({ idx, year: idx > 12 ? baseYear + 1 : baseYear, month: idx > 12 ? idx - 12 : idx });
  return out;
}

/** Sin plan del año siguiente: se repiten las líneas de diciembre en los 12 meses. */
export function decemberPlan(p: YearPlan): YearPlan {
  const map = cellMap(p.cells);
  return {
    lines: p.lines,
    cells: p.lines.flatMap((l) => Array.from({ length: 12 }, (_, i) => ({ lineId: l.id, month: i + 1, amountCents: cellOf(map, l.id, 12), manual: false }))),
  };
}

/** Lo justo para reconocer una línea entre años: su id, nombre, categoría y sentido. */
export type LineKey = Pick<PlanLine, "id" | "name" | "categoryId" | "kind">;
const sameLine = (a: LineKey, b: LineKey) => a.categoryId === b.categoryId && a.kind === b.kind && a.name.trim().toLowerCase() === b.name.trim().toLowerCase();

/** El plan del año siguiente es una copia con ids nuevos: una línea apagada se apaga también en su copia. */
export function counterpartOff(off: string[], base: PlanLine[], next: PlanLine[]): string[] {
  const offLines = base.filter((l) => off.includes(l.id));
  return next.filter((n) => off.includes(n.id) || offLines.some((b) => sameLine(b, n))).map((n) => n.id);
}

/** Extras recortados a un tramo de meses [lo, hi] y llevados a 1–12. */
export function clipExtras(extra: Extra[], lo: number, hi: number): NonNullable<Scenario["extra"]> {
  return extra.flatMap((e) => {
    const from = Math.max(e.from, lo), to = Math.min(e.to, hi);
    return from <= to ? [{ name: e.name, amountCents: e.amount_cents, from: from - lo + 1, to: to - lo + 1 }] : [];
  });
}

/**
 * Saldo mes a mes: saldo inicial + neto del plan de cada mes (con el escenario aplicado).
 * El tramo del año siguiente usa su propio plan (o diciembre repetido) y arranca con el saldo final del primero.
 */
export function buildSeries(startCents: Cents, months: HorizonMonth[], plan1: YearPlan, plan2: YearPlan | null, cfg: ScenarioConfig = EMPTY): SeriesPoint[] {
  if (months.length === 0) return [];
  const fromMonth = months[0].idx, lastIdx = months[months.length - 1].idx;
  const end1 = Math.min(12, lastIdx);
  const seg1 = forecast(startCents, plan1.lines, plan1.cells, fromMonth, { off: cfg.off, extra: clipExtras(cfg.extra, 1, 12) }).slice(0, end1 - fromMonth + 1);
  const out: SeriesPoint[] = seg1.map((p) => ({ idx: p.month, year: months[0].year, month: p.month, netCents: p.netCents, balanceCents: p.balanceCents }));
  if (lastIdx <= 12) return out;
  const useNext = !!plan2 && plan2.lines.length > 0;
  const p2 = useNext ? plan2! : decemberPlan(plan1);
  const off2 = useNext ? counterpartOff(cfg.off, plan1.lines, p2.lines) : cfg.off;
  const start2 = out.length ? out[out.length - 1].balanceCents : startCents;
  const seg2 = forecast(start2, p2.lines, p2.cells, 1, { off: off2, extra: clipExtras(cfg.extra, 13, 24) }).slice(0, lastIdx - 12);
  return out.concat(seg2.map((p) => ({ idx: p.month + 12, year: months[0].year + 1, month: p.month, netCents: p.netCents, balanceCents: p.balanceCents })));
}

/** Primer punto en negativo de la serie (por índice, sirve cuando la serie cruza de año). */
export function firstNegative(series: SeriesPoint[]): SeriesPoint | null {
  const idx = firstNegativeMonth(series.map((p) => ({ month: p.idx, netCents: p.netCents, balanceCents: p.balanceCents })));
  return idx === null ? null : series.find((p) => p.idx === idx) ?? null;
}

/** Posición del mes con el saldo más bajo (el primero si hay empate). */
export function lowestIndex(series: SeriesPoint[]): number {
  let low = 0;
  series.forEach((p, i) => { if (p.balanceCents < series[low].balanceCents) low = i; });
  return low;
}

export const isActive = (cfg: ScenarioConfig) => cfg.off.length > 0 || cfg.extra.length > 0;

// ───────── Líneas que se pueden apagar ─────────
export type ToggleLine = { id: string; name: string; kind: "income" | "expense"; amountCents: Cents };

/** Líneas con plata en el horizonte (las del año siguiente que son copia no se repiten). Monto: el del primer mes con plata. */
export function toggleLines(months: HorizonMonth[], plan1: YearPlan, plan2: YearPlan | null): ToggleLine[] {
  const m1 = cellMap(plan1.cells), m2 = cellMap(plan2?.cells ?? []);
  const in1 = months.filter((m) => m.idx <= 12), in2 = months.filter((m) => m.idx > 12);
  const out: ToggleLine[] = [];
  const hasNext = !!plan2?.lines.length;
  for (const l of plan1.lines) {
    let amount = in1.map((m) => cellOf(m1, l.id, m.month)).find((v) => v > 0) ?? 0;
    if (!amount && in2.length) {
      const copy = hasNext ? plan2!.lines.find((n) => sameLine(l, n)) : undefined;
      amount = hasNext ? (copy ? in2.map((m) => cellOf(m2, copy.id, m.month)).find((v) => v > 0) ?? 0 : 0) : cellOf(m1, l.id, 12);
    }
    if (amount > 0) out.push({ id: l.id, name: l.name, kind: l.kind, amountCents: amount });
  }
  for (const n of plan2?.lines ?? []) {
    if (plan1.lines.some((l) => sameLine(l, n))) continue;
    const v = in2.map((m) => cellOf(m2, n.id, m.month)).find((x) => x > 0) ?? 0;
    if (v > 0) out.push({ id: n.id, name: n.name, kind: n.kind, amountCents: v });
  }
  return out.sort((a, b) => (a.kind === b.kind ? b.amountCents - a.amountCents : a.kind === "income" ? -1 : 1));
}

// ───────── Preguntas rápidas (salen de los datos del usuario) ─────────
export type Preset = { id: "lose" | "save" | "more"; name?: string; cfg: ScenarioConfig };

export function presets(months: HorizonMonth[], lines: ToggleLine[], savingLineIds: Set<string>, moreName: string): Preset[] {
  const out: Preset[] = [];
  const incomes = lines.filter((l) => l.kind === "income");
  if (incomes.length) out.push({ id: "lose", name: incomes[0].name, cfg: { off: [incomes[0].id], extra: [] } });
  const saving = lines.filter((l) => savingLineIds.has(l.id)).map((l) => l.id);
  if (saving.length) out.push({ id: "save", cfg: { off: saving, extra: [] } });
  const expense = lines.filter((l) => l.kind === "expense").reduce((a, l) => a + l.amountCents, 0);
  const tenth = Math.round(expense / 10);
  if (tenth > 0 && months.length) out.push({ id: "more", cfg: { off: [], extra: [{ name: moreName, amount_cents: -tenth, from: months[0].idx, to: months[months.length - 1].idx }] } });
  return out;
}

export const sameConfig = (a: ScenarioConfig, b: ScenarioConfig) =>
  JSON.stringify([[...a.off].sort(), a.extra]) === JSON.stringify([[...b.off].sort(), b.extra]);

// ───────── Lo que se guarda en forecast_scenarios.config ─────────
const ExtraSchema = z.object({ name: z.string().trim().min(1).max(60), amount_cents: z.number().int().refine((v) => v !== 0 && Math.abs(v) <= 1e12), from: z.number().int().min(1).max(24), to: z.number().int().min(1).max(24) })
  .refine((e) => e.from <= e.to);
export const ConfigSchema = z.object({
  year: z.number().int().optional(),
  off: z.array(z.string().max(64)).max(500).default([]),
  extra: z.array(ExtraSchema).max(MAX_EXTRAS).default([]),
});

/** Ids apagados de un escenario guardado (para buscar las líneas que ya no están en el plan). */
export const offIdsOf = (raw: unknown): string[] => ConfigSchema.safeParse(raw).data?.off ?? [];

/**
 * Lee un escenario guardado: corre los meses si se guardó en otro año.
 * Una línea apagada que ya no existe (el año nuevo copia el plan con ids nuevos) se busca por nombre, categoría y sentido
 * en el plan actual (`old` trae esas líneas viejas); si no aparece, se descarta.
 */
export function parseConfig(raw: unknown, baseYear: number, known: LineKey[], old: Map<string, LineKey> = new Map()): ScenarioConfig {
  const p = ConfigSchema.safeParse(raw);
  if (!p.success) return { off: [], extra: [] };
  const shift = (baseYear - (p.data.year ?? baseYear)) * 12;
  const off: string[] = [];
  for (const id of p.data.off) {
    const hit = known.find((k) => k.id === id) ?? (old.has(id) ? known.find((k) => sameLine(k, old.get(id)!)) : undefined);
    if (hit && !off.includes(hit.id)) off.push(hit.id);
  }
  return {
    off,
    extra: p.data.extra.flatMap((e) => {
      const from = Math.max(1, e.from - shift), to = Math.min(24, e.to - shift);
      return from <= to ? [{ ...e, from, to }] : [];
    }),
  };
}
export const serializeConfig = (cfg: ScenarioConfig, baseYear: number) => ({ year: baseYear, off: cfg.off, extra: cfg.extra });

// ───────── Escala del gráfico (como el mockup: 0 siempre visible, paso redondo) ─────────
export type Scale = { min: number; max: number; step: number; ticks: number[] };
export function chartScale(values: number[]): Scale {
  const lo = Math.min(0, ...values), hi = Math.max(0, ...values);
  const raw = Math.max(100, (hi - lo) / 4);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((x) => x * mag).find((x) => x >= raw) ?? 10 * mag;
  const min = Math.floor(lo / step) * step, max = Math.max(step, Math.ceil(hi / step) * step);
  const ticks: number[] = [];
  for (let v = min; v <= max + 0.5; v += step) ticks.push(v);
  return { min, max, step, ticks };
}
/** Y en % (0 arriba) y X en el ancho 0–1000 del SVG, centrado en su columna. */
export const yPct = (v: number, s: Scale) => (1 - (v - s.min) / (s.max - s.min)) * 100;
export const xOf = (i: number, n: number) => ((i + 0.5) / Math.max(1, n)) * 1000;
export const polyline = (values: number[], s: Scale) => values.map((v, i) => `${xOf(i, values.length).toFixed(1)},${yPct(v, s).toFixed(2)}`).join(" ");
