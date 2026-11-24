import { describe, expect, it } from "vitest";
import { annualTotals, parseMoney, yearTotals, type PlanCell } from "@/lib/engine";
import type { Category } from "@/server/data";
import {
  adjacentMonth, buildGroups, cellText, clampYear, compactNet, firstWeekday, inRange, lineShape, manualCount, monthHref, monthState,
  negativeMonths, parseCell, patchCell, planHref, sharePct, toCellState, toPlanCells, type LineLite,
} from "../src/app/(app)/plan/lib";

const cat = (id: string, kind: Category["kind"], sort: number): Category => ({ id, name: id, kind, color: "#141612", isBasic: false, sort });
const line = (id: string, categoryId: string, kind: "income" | "expense"): LineLite => ({ id, name: id, kind, categoryId, year: 2026, frequency: "monthly", amountCents: 0, firstPayDate: null });
const CATS = [cat("ingresos", "income", 0), cat("hogar", "expense", 1), cat("vacia", "expense", 2)];
const LINES = [line("sueldo", "ingresos", "income"), line("home", "hogar", "expense"), line("mercado", "hogar", "expense")];
const CELLS: PlanCell[] = [
  ...Array.from({ length: 12 }, (_, i) => ({ lineId: "sueldo", month: i + 1, amountCents: 541800, manual: false })),
  ...Array.from({ length: 12 }, (_, i) => ({ lineId: "home", month: i + 1, amountCents: i === 6 ? 0 : 133000, manual: i === 6 })),
  { lineId: "mercado", month: 2, amountCents: 30000, manual: true },
  { lineId: "mercado", month: 7, amountCents: 600000, manual: true },
];

describe("plan: año y meses", () => {
  it("pinta meses pasados, actual y futuros según el año que se mira", () => {
    expect(monthState(2026, 10, 2026, 11)).toBe("past");
    expect(monthState(2026, 11, 2026, 11)).toBe("current");
    expect(monthState(2026, 12, 2026, 11)).toBe("future");
    expect(monthState(2025, 12, 2026, 11)).toBe("past");
    expect(monthState(2027, 1, 2026, 11)).toBe("future");
  });
  it("solo deja ver el año en curso, el anterior y el siguiente", () => {
    expect(clampYear(undefined, 2026)).toBe(2026);
    expect(clampYear("2025", 2026)).toBe(2025);
    expect(clampYear(["2027", "2030"], 2026)).toBe(2027);
    expect(clampYear("2030", 2026)).toBe(2026);
    expect(clampYear("abc", 2026)).toBe(2026);
    expect(clampYear("2026.5", 2026)).toBe(2026);
  });
  it("arma los enlaces sin ?anio= en el año en curso", () => {
    expect(planHref(2026, 2026)).toBe("/plan");
    expect(planHref(2027, 2026)).toBe("/plan?anio=2027");
    expect(monthHref(2026, 11, 2026)).toBe("/plan/mes/11");
    expect(monthHref(2025, 3, 2026)).toBe("/plan/mes/3?anio=2025");
  });
  it("pasa de diciembre a enero y se detiene en el borde", () => {
    expect(adjacentMonth(2026, 12, 1, 2026)).toEqual({ year: 2027, month: 1 });
    expect(adjacentMonth(2026, 1, -1, 2026)).toEqual({ year: 2025, month: 12 });
    expect(adjacentMonth(2026, 6, 1, 2026)).toEqual({ year: 2026, month: 7 });
    expect(adjacentMonth(2027, 12, 1, 2026)).toBeNull();
    expect(adjacentMonth(2025, 1, -1, 2026)).toBeNull();
  });
});

describe("plan: celdas", () => {
  const state = toCellState(LINES, CELLS);
  it("arma los 12 meses de cada línea, con 0 donde no hay celda", () => {
    expect(state.sueldo.a).toEqual(Array(12).fill(541800));
    expect(state.mercado.a[1]).toBe(30000);
    expect(state.mercado.a[0]).toBe(0);
    expect(state.mercado.m[1]).toBe(true);
    expect(state.home.m[6]).toBe(true);
    expect(state.home.m[5]).toBe(false);
  });
  it("ida y vuelta: los totales del motor salen iguales", () => {
    const full = toPlanCells(state);
    expect(full).toHaveLength(36);
    expect(yearTotals(LINES, full)).toEqual(yearTotals(LINES, CELLS));
    expect(annualTotals(LINES, full)).toEqual(annualTotals(LINES, CELLS));
  });
  it("editar una celda la deja manual y no toca las otras filas", () => {
    const next = patchCell(state, "home", 3, 99900, true);
    expect(next.home.a[2]).toBe(99900);
    expect(next.home.m[2]).toBe(true);
    expect(state.home.a[2]).toBe(133000);
    expect(next.sueldo).toBe(state.sueldo);
    expect(patchCell(state, "no-existe", 1, 5, true)).toBe(state);
  });
  it("escribe y lee una celda", () => {
    expect(cellText(0)).toBe("");
    expect(cellText(133000)).toBe("1330");
    expect(cellText(1050)).toBe("10.50");
    expect(parseCell("", parseMoney)).toBe(0);
    expect(parseCell("  ", parseMoney)).toBe(0);
    expect(parseCell("1,330", parseMoney)).toBe(133000);
    expect(parseCell("10.5", parseMoney)).toBe(1050);
    expect(parseCell("-50", parseMoney)).toBe(0);
    expect(parseCell("abc", parseMoney)).toBeNull();
    expect(parseCell(cellText(1050), parseMoney)).toBe(1050);
  });
  it("cuenta las celdas editadas a mano desde un mes", () => {
    expect(manualCount(state.mercado)).toBe(2);
    expect(manualCount(state.mercado, 3)).toBe(1);
    expect(manualCount(state.mercado, 8)).toBe(0);
    expect(manualCount(undefined)).toBe(0);
  });
});

describe("plan: rejilla por categoría", () => {
  const state = toCellState(LINES, CELLS);
  const groups = buildGroups(CATS, LINES, state);
  it("agrupa las líneas y suma por grupo, por mes y del año", () => {
    expect(groups.map((g) => g.rows.length)).toEqual([1, 2, 0]);
    expect(groups[1].totals[0]).toBe(133000);
    expect(groups[1].totals[1]).toBe(163000);
    expect(groups[1].totals[6]).toBe(600000);
    expect(groups[1].rows[0].total).toBe(133000 * 11);
    expect(groups[1].total).toBe(133000 * 11 + 630000);
    expect(groups[2].total).toBe(0);
  });
  it("los grupos suman lo mismo que los totales del año", () => {
    const year = annualTotals(LINES, CELLS);
    expect(groups[0].total).toBe(year.income);
    expect(groups[1].total + groups[2].total).toBe(year.expense);
  });
  it("cuenta los meses en negativo", () => {
    expect(negativeMonths(yearTotals(LINES, CELLS))).toBe(1); // julio: mercado de $6,000
  });
  it("resume lo que sobra o falta", () => {
    expect(compactNet(120000)).toBe("+1.2k");
    expect(compactNet(-8600)).toBe("−86");
    expect(compactNet(0)).toBe("+0");
    expect(sharePct(133000, 641800)).toBe("20.7%");
    expect(sharePct(133000, 0)).toBeNull();
  });
});

describe("plan: línea nueva", () => {
  const base = { from: 11, to: 12, amountCents: 10000, firstPayDate: "2026-01-02" } as const;
  it("el primer viernes de 2026 es el 2 de enero", () => {
    expect(firstWeekday(2026)).toBe("2026-01-02");
    expect(firstWeekday(2027)).toBe("2027-01-01");
    expect(firstWeekday(2026, 1)).toBe("2026-01-05");
  });
  it("sabe qué meses entran", () => {
    expect(inRange({ mode: "all", from: 3, to: 3 }, 9)).toBe(true);
    expect(inRange({ mode: "once", from: 12, to: 1 }, 12)).toBe(true);
    expect(inRange({ mode: "once", from: 12, to: 1 }, 11)).toBe(false);
    expect(inRange({ mode: "range", from: 12, to: 10 }, 11)).toBe(true);
    expect(inRange({ mode: "range", from: 10, to: 12 }, 9)).toBe(false);
  });
  it("todo el año, semanal: cuenta los viernes reales (52 pagos)", () => {
    const s = lineShape({ ...base, mode: "all", frequency: "weekly" }, 2026);
    expect(s.frequency).toBe("weekly");
    expect(s.custom).toBe(false);
    expect(s.months[0]).toBe(50000); // enero tiene 5 viernes
    expect(s.months[1]).toBe(40000);
    expect(s.months.reduce((a, b) => a + b, 0)).toBe(520000);
  });
  it("todo el año, quincenal: 26 pagos", () => {
    const s = lineShape({ ...base, mode: "all", frequency: "fortnightly" }, 2026);
    expect(s.months.reduce((a, b) => a + b, 0)).toBe(260000);
  });
  it("todo el año, mensual: 12 pagos y sin fecha", () => {
    const s = lineShape({ ...base, mode: "all", frequency: "monthly" }, 2026);
    expect(s.firstPayDate).toBeNull();
    expect(s.months).toEqual(Array(12).fill(10000));
  });
  it("un mes, mensual: pago único en ese mes", () => {
    const s = lineShape({ ...base, mode: "once", from: 12, frequency: "monthly" }, 2026);
    expect(s.frequency).toBe("once");
    expect(s.firstPayDate).toBe("2026-12-01");
    expect(s.months).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10000]);
  });
  it("varios meses: montos mes a mes solo dentro del rango", () => {
    const s = lineShape({ ...base, mode: "range", frequency: "monthly" }, 2026);
    expect(s.frequency).toBe("custom");
    expect(s.custom).toBe(true);
    expect(s.months).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10000, 10000]);
  });
  it("varios meses, semanal: cuenta los pagos reales de esos meses", () => {
    const s = lineShape({ ...base, mode: "range", frequency: "weekly" }, 2026);
    expect(s.months.slice(0, 10)).toEqual(Array(10).fill(0));
    expect(s.months[10]).toBe(40000); // noviembre 2026: viernes 6, 13, 20 y 27
    expect(s.months[11]).toBe(40000); // diciembre 2026: viernes 4, 11, 18 y 25
  });
});
