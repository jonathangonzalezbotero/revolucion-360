import { describe, expect, it } from "vitest";
import {
  anchorDayOf, buildRows, dueDates, filterTotals, matchRow, moneyInput, movHref, nextRecurringDate, NO_FILTER, rulePattern, signed, splitInTwo, type MovRow,
} from "@/app/(app)/movimientos/lib";

type TxIn = Parameters<typeof buildRows>[0][number];
const tx = (o: Partial<TxIn> & { id: string; amountCents: number }): TxIn => ({
  date: "2026-11-10", description: "Compra", rawDescription: "", note: "", categoryId: null, accountId: "acc1", planLineId: null,
  kind: "normal", status: "ok", source: "manual", edited: false, parentId: null, isSplit: false, recurringId: null, createdAt: "2026-11-10T10:00:00.000Z", ...o,
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
  it("sin día ancla, el mensual sigue el día de la fecha actual", () => {
    expect(nextRecurringDate("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextRecurringDate("2026-02-28", "monthly")).toBe("2026-03-28");
  });
  it("día ancla: solo los mensuales, el día en que se creó", () => {
    expect(anchorDayOf("2026-01-31", "monthly")).toBe(31);
    expect(anchorDayOf("2026-01-31", "weekly")).toBeNull();
    expect(anchorDayOf("2026-01-31", "fortnightly")).toBeNull();
  });
  it("con día ancla 31: 31 ene → 28 feb → 31 mar → 30 abr (y en bisiesto, 29 feb)", () => {
    expect(nextRecurringDate("2026-01-31", "monthly", 31)).toBe("2026-02-28");
    expect(nextRecurringDate("2026-02-28", "monthly", 31)).toBe("2026-03-31");
    expect(nextRecurringDate("2026-03-31", "monthly", 31)).toBe("2026-04-30");
    expect(nextRecurringDate("2028-01-31", "monthly", 31)).toBe("2028-02-29");
    expect(nextRecurringDate("2026-12-31", "monthly", 31)).toBe("2027-01-31");
  });
  it("con día ancla 30: vuelve al 30 después de febrero", () => {
    expect(nextRecurringDate("2026-02-28", "monthly", 30)).toBe("2026-03-30");
  });
  it("las fechas vencidas respetan el día ancla", () => {
    expect(dueDates("2026-01-31", "monthly", "2026-04-30", 120, 31)).toEqual({ due: ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"], next: "2026-05-31" });
  });
  it("semanal y quincenal ignoran el ancla", () => {
    expect(nextRecurringDate("2026-11-24", "weekly", 31)).toBe("2026-12-01");
    expect(nextRecurringDate("2026-11-24", "fortnightly", 31)).toBe("2026-12-08");
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
    tx({ id: "home", amountCents: -133000, categoryId: "hogar", planLineId: "l-home", description: "Home", recurringId: "rec-home" }),
    tx({ id: "transfer", amountCents: -50000, kind: "transfer", description: "Pago tarjeta" }),
    tx({ id: "rev", amountCents: -2500, status: "review", source: "csv", accountId: "acc2", description: "Café" }),
    // dividido: llegan primero las partes más nuevas (orden de la consulta: más nuevo arriba).
    // Los ids van al revés del orden de creación: manda `createdAt`, no el id.
    tx({ id: "parte-a", amountCents: -3000, parentId: "woolies", categoryId: "regalos", createdAt: "2026-11-10T10:00:01.000Z" }),
    tx({ id: "parte-b", amountCents: -9000, parentId: "woolies", categoryId: "hogar", planLineId: "l-groceries", createdAt: "2026-11-10T10:00:00.000Z" }),
    tx({ id: "woolies", amountCents: -12000, isSplit: true, categoryId: "hogar", description: "Woolworths" }),
  ]);

  it("las partes van dentro de su movimiento, en el orden en que se crearon", () => {
    expect(rows.map((r) => r.id)).toEqual(["sueldo", "home", "transfer", "rev", "woolies"]);
    const w = rows.find((r) => r.id === "woolies")!;
    expect(w.parts.map((p) => p.id)).toEqual(["parte-b", "parte-a"]);
    expect(w.categoryId).toBe("hogar");
    expect(w.lineId).toBe("l-groceries");
  });
  it("cada fila sabe si ya originó un recurrente", () => {
    expect(rows.find((r) => r.id === "home")!.recurringId).toBe("rec-home");
    expect(rows.find((r) => r.id === "rev")!.recurringId).toBeNull();
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
    expect(movHref({ ver: "", mes: "", estado: "plan", cat: "c1" })).toBe("/movimientos?cat=c1&estado=plan");
  });
});
