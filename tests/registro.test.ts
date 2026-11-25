import { describe, expect, it } from "vitest";
import { lineMonthStatus } from "@/lib/engine";
import {
  abonoDate, abonoSuggestion, assumedFlexible, cellPay, cleanTag, closedSavings, inMonthOf, matchesWatch, mergeTags, movLevelFor, movMode,
  inheritTags, netAssumed, parseTags, tagKey, tagsChanged, watchTotals, type AssumeLine,
} from "@/lib/engine/registro";
import { categoryReal } from "@/app/(app)/cierre/lib";
import { abonosByLine, cellStatus, isClosedCell } from "@/app/(app)/plan/lib";
import { watchedStats } from "@/app/(app)/analisis/lib";

describe("modo: Mensual o Día a día", () => {
  it("'detail' es Día a día; 'plan', 'totals' (de antes) y cualquier otro valor son Mensual", () => {
    expect(movMode("detail")).toBe("diario");
    expect(movMode("plan")).toBe("mensual");
    expect(movMode("totals")).toBe("mensual");
    expect(movMode(undefined)).toBe("mensual");
  });
  it("solo se escribe si cambia de verdad (un 'totals' que elige Mensual no se reescribe)", () => {
    expect(movLevelFor("mensual", "totals")).toBeNull();
    expect(movLevelFor("mensual", "plan")).toBeNull();
    expect(movLevelFor("diario", "plan")).toBe("detail");
    expect(movLevelFor("mensual", "detail")).toBe("plan");
    expect(movLevelFor("diario", "detail")).toBeNull();
  });
});

describe("Mensual: el día a día sin movimientos cuenta como gastado según el plan", () => {
  const line = (o: Partial<AssumeLine> & { id: string }): AssumeLine => ({ kind: "expense", status: "pending", plannedCents: 60_000, linkedCount: 0, ...o });
  const fixed = new Set(["arriendo"]);
  const lines = [
    line({ id: "comida" }),
    line({ id: "salidas", plannedCents: 20_000 }),
    line({ id: "arriendo", plannedCents: 200_000 }),                               // fija: sigue con Pagado / abonos / movimientos
    line({ id: "cafe", status: "partial", linkedCount: 2, plannedCents: 10_000 }), // tiene movimientos unidos: manda lo real
    line({ id: "marcada", status: "paid_manual" }),                                 // ya cuenta lo planeado
    line({ id: "sueldo", kind: "income", plannedCents: 500_000 }),
    line({ id: "vacia", plannedCents: 0 }),
  ];
  it("supone lo planeado solo en líneas flexibles, pendientes y sin movimientos unidos", () => {
    expect([...assumedFlexible(lines, fixed, "mensual")]).toEqual([["comida", 60_000], ["salidas", 20_000]]);
  });
  it("en Día a día no supone nada", () => {
    expect(assumedFlexible(lines, fixed, "diario").size).toBe(0);
  });
  it("un movimiento SIN unir de la misma categoría no apaga el supuesto (solo los unidos a la línea son de ella)", () => {
    // La línea no tiene movimientos unidos aunque la categoría tenga un gasto suelto: se supone igual.
    expect(assumedFlexible([line({ id: "comida", linkedCount: 0 })], new Set(), "mensual").get("comida")).toBe(60_000);
  });
});

describe("abonos", () => {
  it("$1,400 de $2,000: faltan $600 y el avance es 70%", () => {
    expect(cellPay(200_000, -140_000)).toEqual({ plannedCents: 200_000, paidCents: 140_000, missingCents: 60_000, overCents: 0, pct: 0.7 });
    expect(abonoSuggestion(200_000, -140_000)).toBe(60_000);
    expect(abonoSuggestion(200_000, null)).toBe(200_000);
  });
  it("pagado de más: +$300 sobre lo planeado, sin faltante", () => {
    expect(cellPay(200_000, -230_000)).toMatchObject({ missingCents: 0, overCents: 30_000, pct: 1 });
    expect(abonoSuggestion(200_000, -230_000)).toBe(0);
  });
  it("se pone verde solo al cubrir lo planeado, con la misma tolerancia de siempre", () => {
    expect(cellStatus(200_000, -140_000, false)).toBe("partial");
    expect(cellStatus(200_000, -199_000, false)).toBe("paid");  // $10 de $2,000 está dentro del 0.5%
    expect(cellStatus(200_000, -201_000, false)).toBe("paid");
    expect(cellStatus(200_000, -202_000, false)).toBe("over");
  });
  it("fecha por defecto: hoy en el mes en curso; último día de un mes pasado; primer día de uno por venir", () => {
    expect(abonoDate("2026-11-25", 2026, 11)).toBe("2026-11-25");
    expect(abonoDate("2026-11-25", 2026, 2)).toBe("2026-02-28");
    expect(abonoDate("2026-11-25", 2026, 12)).toBe("2026-12-01");
    expect(abonoDate("2026-11-25", 2025, 12)).toBe("2025-12-31");
    expect(inMonthOf("2026-03-31", 2026, 3)).toBe(true);
    expect(inMonthOf("2026-04-01", 2026, 3)).toBe(false);
  });
  it("abonos por línea y mes, en orden; las partes de un dividido no se quitan desde el plan", () => {
    const st = abonosByLine([
      { id: "b", lineId: "L", date: "2026-03-20", amountCents: -40_000, description: "Arriendo", parentId: null },
      { id: "a", lineId: "L", date: "2026-03-02", amountCents: -100_000, description: "Arriendo", parentId: "p" },
      { id: "x", lineId: "L", date: "2025-03-02", amountCents: -1, description: "otro año", parentId: null },
    ], 2026);
    expect(st.L[2].map((x) => [x.id, x.removable])).toEqual([["a", false], ["b", true]]);
    expect(st.L[3]).toEqual([]);
  });
});

describe("Dar por cerrado con $X", () => {
  it("un parcial cerrado cuenta como pagado con lo que se pagó, sin faltante", () => {
    expect(lineMonthStatus(200_000, [-140_000], false, true)).toEqual({ status: "paid", plannedCents: 200_000, realCents: 140_000, missingCents: 0, closed: true });
    expect(isClosedCell(200_000, -140_000, true)).toBe(true);
  });
  it("sin abonos no cierra nada (vuelve a pendiente) y un pago completo no queda 'cerrado'", () => {
    expect(lineMonthStatus(200_000, [], false, true).status).toBe("pending");
    expect(isClosedCell(200_000, null, true)).toBe(false);
    expect(isClosedCell(200_000, -200_000, true)).toBe(false);
  });
  it("sin el argumento nuevo, todo sigue igual que antes", () => {
    expect(lineMonthStatus(200_000, [-140_000], false)).toEqual({ status: "partial", plannedCents: 200_000, realCents: 140_000, missingCents: 60_000 });
  });
  it("lo que no se pagó se ve como ahorro en el cierre", () => {
    const r = closedSavings([
      { name: "Gimnasio", plannedCents: 200_000, realCents: 140_000, closed: true },
      { name: "Arriendo", plannedCents: 100_000, realCents: 100_000, closed: false },
      { name: "Luz", plannedCents: 50_000, realCents: 20_000 },
    ]);
    expect(r.totalCents).toBe(60_000);
    expect(r.lines.map((l) => [l.name, l.savedCents])).toEqual([["Gimnasio", 60_000]]);
  });
});

describe("etiquetas a mano", () => {
  it("se guardan sin #, sin repetidas (tildes y mayúsculas no importan) y hasta 10", () => {
    expect(parseTags("#Café, #helado #GYG")).toEqual(["Café", "helado", "GYG"]);
    expect(mergeTags(["café"], ["#CAFE", "#cafe ", "helado"])).toEqual(["café", "helado"]);
    expect(mergeTags([], Array.from({ length: 14 }, (_, i) => `t${i}`))).toHaveLength(10);
    expect(cleanTag("###")).toBeNull();
    expect(cleanTag("  #  ")).toBeNull();
    expect(tagKey("#Café")).toBe("cafe");
  });
  it("solo se escriben si cambiaron", () => {
    expect(tagsChanged([], [])).toBe(false);
    expect(tagsChanged(["café"], ["café"])).toBe(false);
    expect(tagsChanged(["café"], ["café", "gyg"])).toBe(true);
  });
});

describe("vigilar un gasto", () => {
  const txs = [
    { date: "2026-11-03", amountCents: -550, description: "Café Juan Valdez", tags: [] },
    { date: "2026-11-10", amountCents: -800, description: "Panadería", tags: ["café"] },
    { date: "2026-05-10", amountCents: -1_200, description: "CAFE DEL BARRIO", tags: [] },
    { date: "2026-11-11", amountCents: 500, description: "Devolución café", tags: [] }, // entra: no cuenta
    { date: "2025-11-11", amountCents: -900, description: "Café 2025", tags: [] },      // otro año
    { date: "2026-11-12", amountCents: -3_000, description: "MCDONALDS 1234", rawDescription: "MCDONALDS 1234 SYDNEY", tags: ["GYG"] },
  ];
  it("por palabra (sin tildes ni mayúsculas) o por etiqueta: este mes y en el año", () => {
    expect(watchTotals(txs, { pattern: "café", tag: "#Cafe" }, 2026, 11)).toEqual({ monthCents: 1_350, yearCents: 2_550, monthCount: 2, yearCount: 3 });
    expect(watchTotals(txs, { pattern: "", tag: "gyg" }, 2026, 11)).toEqual({ monthCents: 3_000, yearCents: 3_000, monthCount: 1, yearCount: 1 });
    expect(watchTotals(txs, { pattern: "McDonald's", tag: null }, 2026, 11).monthCents).toBe(3_000);
  });
  it("una vigilancia vacía no encuentra nada", () => {
    expect(matchesWatch(txs[0], { pattern: "", tag: null })).toBe(false);
  });
  it("Análisis usa la misma regla y sigue aceptando solo la palabra", () => {
    const a = txs.filter((t) => t.date.startsWith("2026")).map((t) => ({ ...t, categoryId: null, planLineId: null })); // Análisis recibe los del año
    expect(watchedStats(a, "café", 11)).toMatchObject({ monthCents: 550, monthCount: 1 });
    expect(watchedStats(a, { pattern: "café", tag: "café" }, 11)).toMatchObject({ monthCents: 1_350, monthCount: 2 });
  });
});

describe("Mensual en el cierre: nunca cuenta dos veces lo registrado suelto", () => {
  it("el supuesto se descuenta con lo registrado sin unir en la categoría, y categoryReal no suma de más", () => {
    const assumed = netAssumed([{ lineId: "comida", categoryId: "C", cents: 60_000 }, { lineId: "salidas", categoryId: "S", cents: 20_000 }],
      [{ categoryId: "C", amountCents: -20_000 }, { categoryId: "C", amountCents: 5_000 }, { categoryId: "S", amountCents: -35_000 }, { categoryId: null, amountCents: -1_000 }]);
    expect([...assumed]).toEqual([["comida", 45_000], ["salidas", 0]]); // comida: 600 − (200 − 50 de devolución); salidas: ya pasó lo planeado
    const unplanned = [{ categoryId: "C", amountCents: -20_000 }, { categoryId: "C", amountCents: 5_000 }, { categoryId: "S", amountCents: -35_000 }];
    const cats = categoryReal([
      { id: "C", name: "Comida", kind: "expense", plannedCents: 60_000, linesRealCents: assumed.get("comida")! },
      { id: "S", name: "Salidas", kind: "expense", plannedCents: 20_000, linesRealCents: assumed.get("salidas")! },
    ], unplanned, new Map());
    expect(cats.map((c) => [c.id, c.realCents])).toEqual([["C", 60_000], ["S", 35_000]]); // comida: lo planeado; salidas: lo real (más que el plan)
  });
});

describe("etiquetas de un dividido", () => {
  it("las partes heredan las del original (también si se quitan)", () => {
    const txs = [
      { id: "p", parentId: null, tags: ["café"] },
      { id: "a", parentId: "p", tags: [] },
      { id: "b", parentId: "p", tags: ["Café", "gyg"] },
      { id: "q", parentId: null, tags: [] },
      { id: "c", parentId: "q", tags: [] },
    ];
    expect(inheritTags(txs).map((t) => [t.id, t.tags])).toEqual([["p", ["café"]], ["a", ["café"]], ["b", ["Café", "gyg"]], ["q", []], ["c", []]]);
  });
});
