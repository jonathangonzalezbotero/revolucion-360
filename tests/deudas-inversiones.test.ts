// Cálculos propios de Deudas e impuestos (Inversiones: tests/inversiones.test.ts) (los del motor se prueban en engine.test.ts).
import { describe, expect, it } from "vitest";
import { bnplSchedule, debtPayoff } from "@/lib/engine";
import {
  balanceAfter, companySummary, debtState, debtSummary, monthlyPayment, nextUnpaid, parsePercent, parseSchedule, payoffOf, paymentAmount,
  planMonths, progressOf, scheduleAfter, scheduleJson, scheduleMonths, simulate, startBalanceFor, taxReserveOf, taxStatus, type DebtLite,
} from "@/app/(app)/deudas/lib";

const TODAY = "2026-11-24";
const debt = (o: Partial<DebtLite>): DebtLite => ({
  id: "d", kind: "loan", balanceCents: 0, startBalanceCents: 0, rateBps: 0, paymentCents: 0, paymentFrequency: "monthly", schedule: null, closed: false, ...o,
});

describe("deudas: una deuda", () => {
  it("sin saldo (la creó el asistente) no tiene fecha de fin ni avance", () => {
    const d = debt({ paymentCents: 70_000 });
    expect(debtState(d)).toBe("noBalance");
    expect(payoffOf(d, TODAY)).toBeNull();
    expect(progressOf(d)).toBe(0);
  });

  it("la cuota semanal se lleva a mensual antes de calcular", () => {
    const d = debt({ balanceCents: 520_000, paymentCents: 10_000, paymentFrequency: "weekly" });
    expect(monthlyPayment(d)).toBe(43_333);
    expect(payoffOf(d, TODAY)).toEqual(debtPayoff(520_000, 0, 43_333, TODAY));
  });

  it("avance desde el saldo inicial", () => {
    expect(progressOf(debt({ balanceCents: 7_500, startBalanceCents: 10_000 }))).toBeCloseTo(0.25);
    expect(progressOf(debt({ balanceCents: 0, startBalanceCents: 10_000, closed: true }))).toBe(1);
  });

  it("una cuota que no cubre el interés nunca termina", () => {
    const p = payoffOf(debt({ balanceCents: 1_000_000, rateBps: 2_400, paymentCents: 10_000 }), TODAY);
    expect(p?.neverEnds).toBe(true);
    expect(p?.endDate).toBeNull();
  });
});

describe("deudas: resumen", () => {
  it("total que debes, cuotas del mes y la fecha de la última", () => {
    const s = debtSummary([
      debt({ id: "a", balanceCents: 120_000, paymentCents: 10_000 }),                     // 12 meses
      debt({ id: "b", balanceCents: 60_000, paymentCents: 30_000 }),                      // 2 meses
      debt({ id: "c", paymentCents: 5_000 }),                                              // sin saldo
      debt({ id: "z", balanceCents: 0, startBalanceCents: 50_000, paymentCents: 9_000, closed: true }), // saldada: no cuenta
    ], TODAY);
    expect(s.totalCents).toBe(180_000);
    expect(s.monthlyCents).toBe(45_000);
    expect(s.freeDate).toBe("2027-11-24");
    expect(s.missing).toBe(1);
    expect(s.open).toBe(3);
    expect(s.neverEnds).toBe(false);
  });

  it("una tarjeta de saldo variable suma al total pero no frena la fecha", () => {
    const s = debtSummary([debt({ id: "a", balanceCents: 120_000, paymentCents: 10_000 }), debt({ id: "t", kind: "card", balanceCents: 50_000 })], TODAY);
    expect(s.totalCents).toBe(170_000);
    expect(s.neverEnds).toBe(false);
    expect(s.freeDate).toBe("2027-11-24");
  });

  it("si una no termina con su cuota, no hay fecha de libre de deudas", () => {
    const s = debtSummary([debt({ balanceCents: 100_000, rateBps: 1_200, paymentCents: 500 })], TODAY);
    expect(s.neverEnds).toBe(true);
  });
});

describe("deudas: simulador", () => {
  it("pagar más al mes termina antes y ahorra interés", () => {
    const d = debt({ balanceCents: 1_000_000, rateBps: 1_200, paymentCents: 50_000 });
    const r = simulate(d, 25_000, TODAY)!;
    expect(r.sim.months).toBeLessThan(r.base.months!);
    expect(r.monthsSaved).toBe(r.base.months! - r.sim.months!);
    expect(r.interestSaved).toBe(r.base.interestCents - r.sim.interestCents);
    expect(r.interestSaved).toBeGreaterThan(0);
  });

  it("rescata una deuda que nunca terminaba", () => {
    const d = debt({ balanceCents: 1_000_000, rateBps: 2_400, paymentCents: 10_000 });
    const r = simulate(d, 40_000, TODAY)!;
    expect(r.base.neverEnds).toBe(true);
    expect(r.sim.neverEnds).toBe(false);
    expect(r.monthsSaved).toBeNull();
  });

  it("sin saldo no simula", () => {
    expect(simulate(debt({ paymentCents: 100 }), 100, TODAY)).toBeNull();
  });
});

describe("deudas: pagos", () => {
  it("nunca más que el saldo; 'total' es el saldo completo", () => {
    expect(paymentAmount("cuota", 70_000, 50_000)).toBe(50_000);
    expect(paymentAmount("abono", 20_000, 50_000)).toBe(20_000);
    expect(paymentAmount("total", null, 50_000)).toBe(50_000);
    expect(paymentAmount("cuota", null, 50_000)).toBeNull();
    expect(paymentAmount("total", null, 0)).toBeNull(); // sin saldo no hay qué pagar
  });

  it("al llegar a $0 queda saldada", () => {
    expect(balanceAfter(50_000, 20_000)).toEqual({ balanceCents: 30_000, closed: false });
    expect(balanceAfter(50_000, 50_000)).toEqual({ balanceCents: 0, closed: true });
  });

  it("el saldo inicial se fija la primera vez y sube si el saldo crece", () => {
    expect(startBalanceFor(0, 80_000)).toBe(80_000);
    expect(startBalanceFor(100_000, 80_000)).toBe(100_000);
    expect(startBalanceFor(100_000, 120_000)).toBe(120_000);
  });
});

describe("deudas: compra ahora, paga después", () => {
  it("el calendario va y vuelve de la base y se marca con lo pagado", () => {
    const sch = bnplSchedule(40_001, "2026-11-20").map((i) => ({ date: i.date, amountCents: i.amountCents, paid: i.paid }));
    const back = parseSchedule(scheduleJson(sch))!;
    expect(back).toEqual(sch);
    const after = scheduleAfter(back, 20_000);
    expect(after.map((i) => i.paid)).toEqual([true, true, false, false]);
    expect(nextUnpaid(after)?.date).toBe("2026-12-18");
    expect(parseSchedule("x")).toBeNull();
    expect(parseSchedule([{ date: "mal", amount_cents: 1 }])).toBeNull();
  });

  it("su línea del plan reparte los pagos por mes", () => {
    const sch = bnplSchedule(40_000, "2026-11-20");
    const months = scheduleMonths(sch, 2026);
    expect(months[10]).toBe(10_000);   // 20 nov
    expect(months[11]).toBe(20_000);   // 4 y 18 dic
    expect(scheduleMonths(sch, 2027)[0]).toBe(10_000); // 1 ene
  });

  it("termina con el último pago pendiente y sin interés", () => {
    const sch = bnplSchedule(40_000, "2026-11-20");
    const p = payoffOf(debt({ kind: "bnpl", balanceCents: 30_000, startBalanceCents: 40_000, paymentCents: 10_000, paymentFrequency: "fortnightly", schedule: scheduleAfter(sch, 10_000) }), TODAY);
    expect(p).toEqual({ months: 2, endDate: "2027-01-01", interestCents: 0, neverEnds: false });
  });
});

describe("deudas: meses del plan", () => {
  it("por número de cuotas, por fecha de fin o hasta diciembre", () => {
    expect(planMonths({ year: 2026, start: "2026-11-05", count: 2, payoffMonths: null, freq: "monthly" })).toEqual({ fromMonth: 11, toMonth: 12 });
    expect(planMonths({ year: 2026, start: "2026-03-05", count: 3, payoffMonths: 40, freq: "monthly" })).toEqual({ fromMonth: 3, toMonth: 5 });
    expect(planMonths({ year: 2026, start: "2026-06-01", count: null, payoffMonths: 3, freq: "monthly" })).toEqual({ fromMonth: 6, toMonth: 8 });
    expect(planMonths({ year: 2026, start: "2026-06-01", count: null, payoffMonths: null, freq: "monthly" })).toEqual({ fromMonth: 6, toMonth: 12 });
    expect(planMonths({ year: 2026, start: "2026-12-01", count: 6, payoffMonths: null, freq: "fortnightly" })).toEqual({ fromMonth: 12, toMonth: 12 });
    expect(planMonths({ year: 2026, start: "2027-01-10", count: 3, payoffMonths: null, freq: "monthly" })).toBeNull();
    expect(planMonths({ year: 2026, start: "2025-01-10", count: 3, payoffMonths: null, freq: "monthly" })).toBeNull();
  });
});

describe("impuestos", () => {
  it("cuánto apartar este mes y cuánto falta en el año, con el % del contador", () => {
    const st = taxStatus([
      { date: "2026-10-03", kind: "ingreso", amountCents: 400_000 },
      { date: "2026-11-02", kind: "ingreso", amountCents: 600_000 },
      { date: "2026-10-04", kind: "apartado", amountCents: 100_000 },
      { date: "2026-11-01", kind: "pago", amountCents: 50_000 },
      { date: "2025-12-01", kind: "ingreso", amountCents: 999_999 }, // otro año
    ], 2_500, 2026, 11);
    expect(st.monthIncomeCents).toBe(600_000);
    expect(st.monthToSetAsideCents).toBe(150_000);
    expect(st.yearIncomeCents).toBe(1_000_000);
    expect(st.shouldCents).toBe(200_000);  // 25% de $10,000 − $500 ya pagado
    expect(st.haveCents).toBe(50_000);     // $1,000 apartado − $500 pagado
    expect(st.missingCents).toBe(150_000);
  });

  it("el % se escribe como texto", () => {
    expect(parsePercent("25")).toBe(2_500);
    expect(parsePercent("12,5 %")).toBe(1_250);
    expect(parsePercent("101")).toBeNull();
    expect(parsePercent("abc")).toBeNull();
  });
});

describe("cuenta con la empresa", () => {
  it("neto = retiros − aportes; retiros por tipo y sin clasificar", () => {
    const s = companySummary([
      { date: "2026-02-01", kind: "aporte", class: "sin_clasificar", amountCents: 840_500 },
      { date: "2026-03-01", kind: "retiro", class: "sin_clasificar", amountCents: 605_000 },
      { date: "2026-04-01", kind: "retiro", class: "sueldo", amountCents: 500_000 },
      { date: "2025-04-01", kind: "retiro", class: "sin_clasificar", amountCents: 10_000 },
    ], 2026);
    expect(s.inCents).toBe(840_500);
    expect(s.outCents).toBe(1_105_000);
    expect(s.netCents).toBe(264_500);
    expect(s.byClass.sueldo).toBe(500_000);
    expect(s.byClass.dividendo).toBe(0);
    expect(s.unclassifiedCents).toBe(615_000); // de siempre, no solo del año
  });
});

// Inversiones por activo: tests/inversiones.test.ts (motor en src/lib/engine/inversiones.ts).

describe("impuestos: apartado según el país", () => {
  it("sin fila del país: se muestra sin aviso propio", () => {
    expect(taxReserveOf(null)).toEqual({ show: true, note: "" });
  });
  it("apagado en el país: no se muestra", () => {
    expect(taxReserveOf({ tax_reserve_enabled: false, tax_reserve_note: "x" }).show).toBe(false);
  });
  it("con aviso: se muestra recortado", () => {
    expect(taxReserveOf({ tax_reserve_enabled: true, tax_reserve_note: "  Pregúntale a tu contador.  " })).toEqual({ show: true, note: "Pregúntale a tu contador." });
  });
});
