// Cálculos propios de Proyección y Análisis (los del motor se prueban en engine.test.ts).
import { describe, expect, it } from "vitest";
import type { PlanCell, PlanLine } from "@/lib/engine";
import {
  buildSeries, chartScale, clipExtras, counterpartOff, firstNegative, horizon, lowestIndex, parseConfig, presets, serializeConfig, toggleLines, yPct, type YearPlan,
} from "@/app/(app)/proyeccion/lib";
import { bestMonth, biggestVariation, incomeSources, limitStatus, matchesPattern, merchantRanking, monthTotals, planByCategory, spendByCategory, totals, watchedStats, type TxA } from "@/app/(app)/analisis/lib";

const line = (id: string, name: string, kind: "income" | "expense", year = 2026, categoryId = kind === "income" ? "ci" : "ce"): PlanLine =>
  ({ id, name, kind, categoryId, year, frequency: "monthly", amountCents: 0, firstPayDate: null });
const every = (lineId: string, cents: number): PlanCell[] => Array.from({ length: 12 }, (_, i) => ({ lineId, month: i + 1, amountCents: cents, manual: false }));

// Sueldo $5,000 y arriendo $4,000: sobran $1,000 al mes.
const plan26: YearPlan = { lines: [line("s", "Sueldo", "income"), line("h", "Hogar", "expense")], cells: [...every("s", 500_000), ...every("h", 400_000)] };
// Copia del año siguiente (ids nuevos, como hace ensurePlanYear) con arriendo más caro.
const plan27: YearPlan = { lines: [line("s2", "Sueldo", "income", 2027), line("h2", "Hogar", "expense", 2027)], cells: [...every("s2", 500_000), ...every("h2", 450_000)] };

describe("proyección: serie del gráfico", () => {
  it("del mes actual a diciembre, o 12 meses seguidos si se pide", () => {
    expect(horizon(2026, 11, false).map((m) => m.idx)).toEqual([11, 12]);
    const ext = horizon(2026, 11, true);
    expect(ext).toHaveLength(12);
    expect(ext[2]).toEqual({ idx: 13, year: 2027, month: 1 });
    expect(ext[11]).toEqual({ idx: 22, year: 2027, month: 10 });
    expect(horizon(2026, 12, false)).toHaveLength(1);
  });

  it("saldo inicial + neto de cada mes; el año siguiente usa su propio plan", () => {
    const s = buildSeries(200_000, horizon(2026, 11, true), plan26, plan27);
    expect(s.map((p) => p.balanceCents).slice(0, 4)).toEqual([300_000, 400_000, 450_000, 500_000]);
    expect(s[2]).toMatchObject({ year: 2027, month: 1, netCents: 50_000 });
  });

  it("sin plan del año siguiente repite diciembre", () => {
    const s = buildSeries(0, horizon(2026, 12, true), plan26, { lines: [], cells: [] });
    expect(s).toHaveLength(12);
    expect(s.every((p) => p.netCents === 100_000)).toBe(true);
    expect(s[11].balanceCents).toBe(1_200_000);
  });

  it("primer mes en negativo por índice, aunque cruce de año", () => {
    const s = buildSeries(150_000, horizon(2026, 12, true), plan26, plan27, { off: ["s"], extra: [] });
    // diciembre: 150,000 − 400,000 → negativo ya en dic 2026
    expect(firstNegative(s)).toMatchObject({ year: 2026, month: 12 });
    const late = buildSeries(0, horizon(2026, 12, true), plan26, { lines: plan27.lines, cells: [...every("s2", 100_000), ...every("h2", 450_000)] });
    expect(firstNegative(late)).toMatchObject({ year: 2027, month: 1, idx: 13 });
    expect(firstNegative(buildSeries(0, horizon(2026, 11, false), plan26, null))).toBeNull();
    expect(lowestIndex(late)).toBe(late.length - 1);
  });
});

describe("proyección: escenarios", () => {
  it("apagar una línea no toca el plan y se apaga también en su copia del año siguiente", () => {
    expect(counterpartOff(["h"], plan26.lines, plan27.lines)).toEqual(["h2"]);
    const s = buildSeries(0, horizon(2026, 11, true), plan26, plan27, { off: ["h"], extra: [] });
    expect(s.every((p) => p.netCents === 500_000)).toBe(true);
    expect(plan26.lines).toHaveLength(2);
  });

  it("un extra solo cuenta en sus meses: nov–dic de este año no se repite el año siguiente", () => {
    const cfg = { off: [], extra: [{ name: "Viaje", amount_cents: -300_000, from: 11, to: 12 }] };
    const s = buildSeries(0, horizon(2026, 11, true), plan26, plan27, cfg);
    expect(s.map((p) => p.netCents)).toEqual([-200_000, -200_000, ...Array(10).fill(50_000)]);
    expect(clipExtras(cfg.extra, 13, 24)).toEqual([]);
    expect(clipExtras([{ name: "x", amount_cents: 1, from: 12, to: 14 }], 13, 24)).toEqual([{ name: "x", amountCents: 1, from: 1, to: 2 }]);
  });

  it("guardar y leer: meses relativos al año, se corren al cambiar de año y se descartan líneas que ya no existen", () => {
    const saved = serializeConfig({ off: ["h", "zz"], extra: [{ name: "Bono", amount_cents: 100_000, from: 12, to: 14 }] }, 2026);
    expect(saved.year).toBe(2026);
    expect(parseConfig(saved, 2026, plan26.lines)).toEqual({ off: ["h"], extra: [{ name: "Bono", amount_cents: 100_000, from: 12, to: 14 }] });
    expect(parseConfig(saved, 2027, [])).toEqual({ off: [], extra: [{ name: "Bono", amount_cents: 100_000, from: 1, to: 2 }] });
    expect(parseConfig({ off: [], extra: [{ name: "Viejo", amount_cents: 5, from: 3, to: 6 }] }, 2026, []).extra[0]).toMatchObject({ from: 3, to: 6 });
    // al cambiar de año la línea apagada ya no existe: se busca por nombre y categoría en el plan nuevo
    const old = new Map(plan26.lines.map((l) => [l.id, l]));
    expect(parseConfig(saved, 2027, plan27.lines, old).off).toEqual(["h2"]);
    expect(parseConfig({ year: 2026, off: ["h", "h2"] }, 2027, plan27.lines, old).off).toEqual(["h2"]);
    expect(parseConfig(saved, 2027, [line("x", "Otra", "expense", 2027)], old).off).toEqual([]);
    expect(parseConfig("basura", 2026, [])).toEqual({ off: [], extra: [] });
    expect(parseConfig({ off: [], extra: [{ name: "", amount_cents: 0, from: 5, to: 2 }] }, 2026, [])).toEqual({ off: [], extra: [] });
  });

  it("líneas para apagar y preguntas rápidas salen de los datos", () => {
    const months = horizon(2026, 11, false);
    const lines = toggleLines(months, plan26, null);
    expect(lines.map((l) => [l.id, l.amountCents])).toEqual([["s", 500_000], ["h", 400_000]]);
    const ps = presets(months, lines, new Set(), "+10%");
    expect(ps.map((p) => p.id)).toEqual(["lose", "more"]);
    expect(ps[0]).toMatchObject({ name: "Sueldo", cfg: { off: ["s"] } });
    expect(ps[1].cfg.extra[0]).toMatchObject({ amount_cents: -40_000, from: 11, to: 12 });
  });

  it("escala: el 0 siempre se ve y el paso es redondo", () => {
    const sc = chartScale([300_000, -120_000]);
    expect(sc.ticks).toContain(0);
    expect(sc.min).toBeLessThanOrEqual(-120_000);
    expect(sc.max).toBeGreaterThanOrEqual(300_000);
    expect([1, 2, 2.5, 5, 10].some((x) => sc.step / Math.pow(10, Math.floor(Math.log10(sc.step))) === x)).toBe(true);
    expect(yPct(sc.max, sc)).toBe(0);
    expect(chartScale([0]).max).toBeGreaterThan(0);
  });
});

const tx = (date: string, amountCents: number, description: string, categoryId: string | null = null, planLineId: string | null = null): TxA => ({ date, amountCents, description, categoryId, planLineId });
const txs: TxA[] = [
  tx("2026-01-05", 500_000, "Sueldo", "ci", "s"),
  tx("2026-01-06", -1_250, "McDonald's Sydney", "food"),
  tx("2026-01-20", -1_800, "MCDONALD'S  SYDNEY", "food"),
  tx("2026-02-05", 500_000, "Sueldo", "ci", "s"),
  tx("2026-02-07", 30_000, "Venta bici", null),
  tx("2026-02-09", -400_000, "Rent payment", "home"),
  tx("2026-02-10", -650, "Café Paris", "food"),
  tx("2026-02-11", -700, "cafe paris", "food"),
];

describe("análisis", () => {
  it("entró, salió y te sobró, también mes a mes", () => {
    expect(totals(txs)).toEqual({ income: 1_030_000, expense: 404_400, net: 625_600 });
    const ms = monthTotals(txs);
    expect(ms[0]).toEqual({ income: 500_000, expense: 3_050, net: 496_950 });
    expect(ms[1].net).toBe(128_650);
    expect(bestMonth(ms)).toBe(1);
    expect(bestMonth(monthTotals([]))).toBeNull();
  });

  it("gasto por categoría frente al plan del mes o del año", () => {
    expect(spendByCategory(txs)[0]).toEqual({ categoryId: "home", cents: 400_000 });
    expect(planByCategory(plan26.lines, plan26.cells, 2).get("ce")).toBe(400_000);
    expect(planByCategory(plan26.lines, plan26.cells, null).get("ce")).toBe(4_800_000);
    expect(planByCategory(plan26.lines, plan26.cells, null, "income").get("ci")).toBe(6_000_000);
  });

  it("de dónde vino: por línea del plan, si no por categoría, si no otros", () => {
    const src = incomeSources(txs, new Map([["s", "Sueldo"]]), new Map([["ci", "Ingresos"]]));
    expect(src).toEqual([{ key: "l:s", name: "Sueldo", cents: 1_000_000 }, { key: "other", name: null, cents: 30_000 }]);
  });

  it("ranking de comercios: agrupa por descripción normalizada y ordena por gasto", () => {
    const r = merchantRanking(txs);
    expect(r[0]).toMatchObject({ name: "Rent payment", cents: 400_000, count: 1 });
    expect(r[1]).toMatchObject({ key: "mcdonald s sydney", cents: 3_050, count: 2 });
    expect(r[2]).toMatchObject({ key: "cafe paris", cents: 1_350, count: 2 });
    expect(merchantRanking(txs, 1)).toHaveLength(1);
  });

  it("vigilados por patrón: sin mayúsculas ni tildes, en el mes y en el año", () => {
    expect(matchesPattern({ description: "Café Paris" }, "cafe")).toBe(true);
    expect(matchesPattern({ description: "Uber", rawDescription: "UBER *EATS 123" }, "uber eats")).toBe(true);
    expect(matchesPattern({ description: "Algo" }, "  ")).toBe(false);
    expect(matchesPattern({ description: "MCDONALDS 1234 SYDNEY" }, "McDonald's")).toBe(true);
    expect(matchesPattern({ description: "UBEREATS AU" }, "Uber Eats")).toBe(true);
    expect(matchesPattern({ description: "Woolworths" }, "uber")).toBe(false);
    expect(watchedStats(txs, "McDonald's", 1)).toEqual({ monthCents: 3_050, yearCents: 3_050, monthCount: 2, yearCount: 2 });
    expect(watchedStats(txs, "café", 1)).toEqual({ monthCents: 0, yearCents: 1_350, monthCount: 0, yearCount: 2 });
  });

  it("límite del mes de un vigilado: lo que te queda o cuánto te pasaste", () => {
    expect(limitStatus(3_050, 5_000)).toEqual({ over: false, diffCents: 1_950 });
    expect(limitStatus(6_000, 5_000)).toEqual({ over: true, diffCents: 1_000 });
    expect(limitStatus(5_000, 5_000)).toEqual({ over: false, diffCents: 0 });
    expect(limitStatus(3_050, null)).toBeNull();
  });

  it("lo que más varió entre su mes más bajo y el más alto", () => {
    const v = biggestVariation(txs, 2);
    expect(v[0]).toEqual({ categoryId: "home", minCents: 0, maxCents: 400_000 });
    expect(v.find((x) => x.categoryId === "food")).toEqual({ categoryId: "food", minCents: 1_350, maxCents: 3_050 });
    expect(biggestVariation(txs, 1)).toEqual([]);
  });
});
