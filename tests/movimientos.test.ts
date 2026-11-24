import { describe, expect, it } from "vitest";
import {
  buildRows, dueDates, filterTotals, matchRow, moneyInput, movHref, nextRecurringDate, NO_FILTER, rulePattern, signed, splitInTwo, type MovRow,
} from "@/app/(app)/movimientos/lib";

const tx = (o: Partial<Parameters<typeof buildRows>[0][number]> & { id: string; amountCents: number }) => ({
  date: "2026-11-10", description: "Compra", rawDescription: "", note: "", categoryId: null, accountId: "acc1", planLineId: null,
  kind: "normal" as const, status: "ok" as const, source: "manual" as const, edited: false, parentId: null, isSplit: false, ...o,
});

describe("recurrentes: avance de fecha", () => {
  it("semanal y quincenal avanzan 7 y 14 días", () => {
    expect(nextRecurringDate("2026-11-24", "weekly")).toBe("2026-12-01");
    expect(nextRecurringDate("2026-12-25", "fortnightly")).toBe("2027-01-08");
  });
  it("mensual conserva el día y cruza el año", () => {
    expect(nextRecurringDate("2026-11-05", "monthly")).toBe("2026-12-05");
    expect(nextRecurringDate("2026-12-05", "monthly")).toBe("2027-01-05");
  });
  it("mensual en día 31 cae en el último día del mes corto (y se queda ahí)", () => {
    expect(nextRecurringDate("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextRecurringDate("2026-02-28", "monthly")).toBe("2026-03-28");
  });
  it("genera todas las fechas vencidas hasta hoy y deja la próxima en el futuro", () => {
    expect(dueDates("2026-11-03", "weekly", "2026-11-24")).toEqual({ due: ["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24"], next: "2026-12-01" });
    expect(dueDates("2026-09-15", "monthly", "2026-11-24")).toEqual({ due: ["2026-09-15", "2026-10-15", "2026-11-15"], next: "2026-12-15" });
  });
  it("si aún no vence, no genera nada", () => {
    expect(dueDates("2026-11-25", "monthly", "2026-11-24")).toEqual({ due: [], next: "2026-11-25" });
  });
  it("tiene tope para un recurrente abandonado", () => {
    const r = dueDates("2020-01-01", "weekly", "2026-11-24", 10);
    expect(r.due).toHaveLength(10);
    expect(r.next).toBe("2020-03-11");
  });
});

describe("lista y totales del filtro", () => {
  const rows = buildRows([
    tx({ id: "sueldo", amountCents: 541800, categoryId: "ing", planLineId: "l-sueldo", source: "csv", description: "Sueldo", rawDescription: "SALARY EASY AUSSIE" }),
    tx({ id: "home", amountCents: -133000, categoryId: "hogar", planLineId: "l-home", description: "Home" }),
    tx({ id: "transfer", amountCents: -50000, kind: "transfer", description: "Pago tarjeta" }),
    tx({ id: "rev", amountCents: -2500, status: "review", source: "csv", accountId: "acc2", description: "Café" }),
    // dividido: llegan primero las partes más nuevas (orden de la consulta: más nuevo arriba)
    tx({ id: "p2", amountCents: -3000, parentId: "woolies", categoryId: "regalos" }),
    tx({ id: "p1", amountCents: -9000, parentId: "woolies", categoryId: "hogar", planLineId: "l-groceries" }),
    tx({ id: "woolies", amountCents: -12000, isSplit: true, categoryId: "hogar", description: "Woolworths" }),
  ]);

  it("las partes van dentro de su movimiento, en el orden en que se crearon", () => {
    expect(rows.map((r) => r.id)).toEqual(["sueldo", "home", "transfer", "rev", "woolies"]);
    const w = rows.find((r) => r.id === "woolies")!;
    expect(w.parts.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(w.categoryId).toBe("hogar");
    expect(w.lineId).toBe("l-groceries");
  });
  it("sin filtro: entra y sale; la transferencia y el original dividido no cuentan", () => {
    expect(filterTotals(rows)).toEqual({ count: 5, inCents: 541800, outCents: 133000 + 2500 + 12000 });
  });
  it("por categoría: de un dividido solo cuenta la parte de esa categoría", () => {
    expect(filterTotals(rows, { ...NO_FILTER, cat: "hogar" })).toEqual({ count: 2, inCents: 0, outCents: 133000 + 9000 });
    expect(filterTotals(rows, { ...NO_FILTER, cat: "regalos" })).toEqual({ count: 1, inCents: 0, outCents: 3000 });
  });
  it("por línea del plan, por cuenta y por estado", () => {
    expect(filterTotals(rows, { ...NO_FILTER, line: "l-groceries" })).toEqual({ count: 1, inCents: 0, outCents: 9000 });
    expect(filterTotals(rows, { ...NO_FILTER, account: "acc2" })).toEqual({ count: 1, inCents: 0, outCents: 2500 });
    expect(filterTotals(rows, { ...NO_FILTER, state: "revisar" }).count).toBe(1);
    expect(filterTotals(rows, { ...NO_FILTER, state: "plan" }).count).toBe(3);
    expect(filterTotals(rows, { ...NO_FILTER, state: "transfer" })).toEqual({ count: 1, inCents: 0, outCents: 0 });
    expect(filterTotals(rows, { ...NO_FILTER, state: "manual" }).count).toBe(3);
  });
  it("busca por descripción sin importar tildes ni mayúsculas, y también en el texto del banco", () => {
    const cafe = rows.find((r) => r.id === "rev") as MovRow;
    expect(matchRow(cafe, { ...NO_FILTER, q: "CAFE" })).toBe(true);
    expect(matchRow(cafe, { ...NO_FILTER, q: "arriendo" })).toBe(false);
    expect(filterTotals(rows, { ...NO_FILTER, q: "salary" }).inCents).toBe(541800);
  });
});

describe("dividir en dos categorías", () => {
  it("la primera parte es el resto y ambas suman el total", () => {
    expect(splitInTwo(-12000, 3000)).toEqual([-9000, -3000]);
    expect(splitInTwo(12000, 3000)).toEqual([9000, 3000]);
    expect(splitInTwo(-12000, -3000)).toEqual([-9000, -3000]);
  });
  it("no deja partes en cero ni más grandes que el total", () => {
    expect(splitInTwo(-12000, 0)).toBeNull();
    expect(splitInTwo(-12000, 12000)).toBeNull();
    expect(splitInTwo(-12000, 15000)).toBeNull();
    expect(splitInTwo(0, 100)).toBeNull();
  });
});

describe("utilidades", () => {
  it("entra positivo, sale negativo", () => {
    expect(signed(4000, "in")).toBe(4000);
    expect(signed(4000, "out")).toBe(-4000);
    expect(signed(-4000, "out")).toBe(-4000);
  });
  it("patrón de regla: sin tildes ni signos; muy corto no sirve", () => {
    expect(rulePattern("RENT PAYMENT REF-2231")).toBe("rent payment ref 2231");
    expect(rulePattern("Café")).toBe("cafe");
    expect(rulePattern("··")).toBeNull();
  });
  it("monto para el campo de edición", () => {
    expect(moneyInput(-133050)).toBe("1330.50");
    expect(moneyInput(40000)).toBe("400");
  });
  it("enlaces con filtros", () => {
    expect(movHref({})).toBe("/movimientos");
    expect(movHref({ mes: "11", anio: "2026", cat: "" })).toBe("/movimientos?anio=2026&mes=11");
    expect(movHref({ ver: "revisar" })).toBe("/movimientos?ver=revisar");
  });
});
