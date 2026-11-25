// Cálculos propios del Cierre de mes y del Diagnóstico (los del motor se prueban en engine.test.ts).
import { describe, expect, it } from "vitest";
import { DEFAULT_BENCHMARKS, diagnose, priority } from "@/lib/engine";
import {
  adjustedNet, balanceGap, buildSnapshot, cardShown, cardSigned, categoryReal, changedCells, closureStreak, deviations, moneyInput,
  nextPeriod, parsePeriod, pendingOptions, pendingWrites, periodOfDate, readSnapshot, realTotals, reminderDate, ymRef, type CatInput,
} from "@/app/(app)/cierre/lib";
import { benchmarksFrom, canDiagnose, joinNames, levelCounts, levelTone, monthsText, pctText, referenceVars, studentStep, valueText, withFundState } from "@/app/(app)/diagnostico/lib";
import { M as DM } from "@/app/(app)/diagnostico/messages";

const cats: CatInput[] = [
  { id: "inc", name: "Ingresos", kind: "income", plannedCents: 641_800, linesRealCents: 641_800 },
  { id: "home", name: "Hogar y básicos", kind: "expense", plannedCents: 158_300, linesRealCents: 158_300 },
  { id: "food", name: "Comida y ocio", kind: "expense", plannedCents: 40_000, linesRealCents: 30_000 },
  { id: "car", name: "Vehículo", kind: "expense", plannedCents: 45_000, linesRealCents: 0 },
  { id: "save", name: "Ahorro e inversión", kind: "saving", plannedCents: 25_000, linesRealCents: 25_000 },
];

describe("cierre · mes y periodo", () => {
  it("lee ?anio=&mes= y rechaza el futuro, meses inválidos y más de 2 años atrás", () => {
    const today = { year: 2026, month: 11 };
    expect(parsePeriod("2026", "10", today)).toEqual({ year: 2026, month: 10 });
    expect(parsePeriod(["2026"], ["11"], today)).toEqual({ year: 2026, month: 11 });
    expect(parsePeriod("2026", "12", today)).toBeNull();
    expect(parsePeriod("2026", "13", today)).toBeNull();
    expect(parsePeriod("abc", "1", today)).toBeNull();
    expect(parsePeriod(undefined, undefined, today)).toBeNull();
    expect(parsePeriod("2024", "10", today)).toBeNull();
    expect(parsePeriod("2024", "11", today)).toEqual({ year: 2024, month: 11 });
    // no se cierran meses de antes de crear la cuenta
    expect(parsePeriod("2026", "8", today, periodOfDate("2026-09-14T03:00:00Z"))).toBeNull();
    expect(parsePeriod("2026", "9", today, periodOfDate("2026-09-14T03:00:00Z"))).toEqual({ year: 2026, month: 9 });
  });
  it("mes siguiente cruza el año y la referencia de puntos va con cero", () => {
    expect(nextPeriod({ year: 2026, month: 12 })).toEqual({ year: 2027, month: 1 });
    expect(nextPeriod({ year: 2026, month: 3 })).toEqual({ year: 2026, month: 4 });
    expect(ymRef({ year: 2026, month: 3 })).toBe("2026-03");
  });
  it("recordatorio: cuando empiezan los últimos 10 días del mes siguiente, nunca en el pasado", () => {
    expect(reminderDate({ year: 2026, month: 11 }, "2026-11-28")).toBe("2026-12-22");
    expect(reminderDate({ year: 2026, month: 12 }, "2026-12-30")).toBe("2027-01-22");
    expect(reminderDate({ year: 2027, month: 1 }, "2027-01-31")).toBe("2027-02-19");
    // cierre atrasado de octubre hecho el 24 de noviembre: el día 21 ya pasó
    expect(reminderDate({ year: 2026, month: 10 }, "2026-11-24")).toBeNull();
    expect(reminderDate({ year: 2026, month: 10 }, "2026-11-21")).toBeNull();
    expect(reminderDate({ year: 2026, month: 10 }, "2026-11-05")).toBe("2026-11-21");
  });
});

describe("cierre · revisa", () => {
  it("'Ya la pagué' solo sin movimientos; 'Pasar' solo si existe la línea el mes siguiente", () => {
    expect(pendingOptions("pending", true)).toEqual(["paid", "move", "skip"]);
    expect(pendingOptions("partial", true)).toEqual(["move", "skip"]);
    expect(pendingOptions("pending", false)).toEqual(["paid", "skip"]);
  });
  it("pasar al mes siguiente: el mes queda con lo pagado y el faltante se suma al siguiente", () => {
    // Home $1,330, pagado $670 → faltan $660; el mes siguiente tenía $1,330
    expect(pendingWrites("move", 67_000, 66_000, 133_000)).toEqual({ thisMonth: 67_000, nextMonth: 199_000 });
    expect(pendingWrites("skip", 0, 4_000, 4_000)).toEqual({ thisMonth: 0, nextMonth: null });
  });
});

describe("cierre · compara", () => {
  it("lo real por categoría: líneas + sin línea (un reembolso resta) y el total escrito manda", () => {
    const unplanned = [{ categoryId: "food", amountCents: -5_000 }, { categoryId: "food", amountCents: 1_000 }, { categoryId: "inc", amountCents: 20_000 }, { categoryId: null, amountCents: -2_500 }];
    const r = categoryReal(cats, unplanned, new Map([["car", 47_000]]));
    expect(r.find((c) => c.id === "food")?.realCents).toBe(34_000);
    expect(r.find((c) => c.id === "inc")?.realCents).toBe(661_800);
    expect(r.find((c) => c.id === "car")?.realCents).toBe(47_000);
    const t = realTotals(r, unplanned, new Set(cats.map((c) => c.id)));
    expect(t).toEqual({ income: 661_800, expense: 158_300 + 34_000 + 47_000 + 25_000 + 2_500, net: 661_800 - 266_800 });
  });
  it("desvíos: solo lo que sale, con signo, del más grande al más chico, sin desvíos de menos de $1", () => {
    const r = categoryReal(cats, [], new Map([["home", 158_350]]));
    const d = deviations(r);
    expect(d).toEqual([{ id: "car", name: "Vehículo", diffCents: -45_000 }, { id: "food", name: "Comida y ocio", diffCents: -10_000 }]);
    const over = deviations(categoryReal(cats, [{ categoryId: "food", amountCents: -60_000 }], new Map()), 1);
    expect(over).toEqual([{ id: "food", name: "Comida y ocio", diffCents: 50_000 }]);
  });
});

describe("cierre · ajusta y saldos", () => {
  it("neto del mes siguiente y solo las celdas que cambiaron", () => {
    const lines = [{ lineId: "a", cents: 158_300, typed: 158_300 }, { lineId: "b", cents: 45_000, typed: 40_000 }, { lineId: "c", cents: 250_000, typed: null }];
    expect(adjustedNet(641_800, lines)).toEqual({ out: 448_300, net: 193_500 });
    expect(changedCells(lines)).toEqual([{ lineId: "b", cents: 40_000 }]);
    expect(changedCells([{ lineId: "x", cents: 0, typed: -5 }])).toEqual([]);
  });
  it("monto para el campo de texto", () => {
    expect(moneyInput(158_300)).toBe("1583");
    expect(moneyInput(12_350)).toBe("123.50");
    expect(moneyInput(5)).toBe("0.05");
  });
  it("tarjetas: se escribe lo que debes en positivo y se guarda en negativo", () => {
    expect(cardSigned("card", 192_000)).toBe(-192_000);
    expect(cardSigned("card", -192_000)).toBe(-192_000);
    expect(cardSigned("bank", 500_000)).toBe(500_000);
    expect(cardShown("card", -192_000)).toBe(192_000);
  });
  it("aviso de diferencia con el saldo esperado", () => {
    expect(balanceGap(908_800, 908_800)).toEqual({ state: "ok", cents: 0 });
    expect(balanceGap(901_800, 908_800)).toEqual({ state: "missing", cents: 7_000 });
    expect(balanceGap(910_000, 908_800)).toEqual({ state: "extra", cents: 1_200 });
    expect(balanceGap(-192_000, -180_000)).toEqual({ state: "missing", cents: 12_000 });
  });
});

describe("cierre · cerrar", () => {
  it("arma el snapshot con totales planeados, reales y saldos", () => {
    const r = categoryReal(cats, [], new Map());
    const snap = buildSnapshot({ today: "2026-11-28", plan: { income: 641_800, expense: 268_300, net: 0 }, cats: r, unplanned: [], accounts: [{ id: "u", name: "Ubank", kind: "bank", balanceCents: 908_800 }], investments: [{ id: "st", name: "Stake", valueCents: 1_250_000 }] });
    expect(snap.v).toBe(1);
    expect(snap.closedOn).toBe("2026-11-28");
    expect(snap.plan).toEqual({ income: 641_800, expense: 268_300, net: 373_500 });
    expect(snap.real).toEqual({ income: 641_800, expense: 213_300, net: 428_500 });
    expect(snap.categories.map((c) => c.id)).toEqual(["inc", "home", "food", "car", "save"]);
    expect(snap.balances).toEqual([{ id: "u", name: "Ubank", kind: "bank", cents: 908_800 }]);
    expect(snap.investments).toEqual([{ id: "st", name: "Stake", cents: 1_250_000 }]);
    expect(readSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
  });
  it("lee snapshots viejos o vacíos sin romperse", () => {
    expect(readSnapshot({})).toBeNull();
    expect(readSnapshot(null)).toBeNull();
    expect(readSnapshot("x")).toBeNull();
    const s = readSnapshot({ plan: { income: 100, expense: 40 }, real: { income: "x", expense: 10 }, balances: [null, { id: 1, cents: 5 }] });
    expect(s?.plan.net).toBe(60);
    expect(s?.real).toEqual({ income: 0, expense: 10, net: -10 });
    expect(s?.balances).toEqual([{ id: "1", name: "", kind: "", cents: 5 }]);
    expect(s?.categories).toEqual([]);
    expect(s?.investments).toEqual([]);
  });
  it("cierres seguidos: cruza el año y un mes reabierto corta la racha", () => {
    const rows = [
      { year: 2025, month: 11, reopened: false }, { year: 2025, month: 12, reopened: false },
      { year: 2026, month: 1, reopened: false }, { year: 2026, month: 2, reopened: false },
    ];
    expect(closureStreak(rows, { year: 2026, month: 2 })).toBe(4);
    expect(closureStreak(rows, { year: 2026, month: 3 })).toBe(0);
    expect(closureStreak([...rows.slice(0, 2), { year: 2026, month: 1, reopened: true }, rows[3]], { year: 2026, month: 2 })).toBe(1);
  });
});

describe("diagnóstico", () => {
  it("referencias del país sobre las generales, solo números válidos", () => {
    expect(benchmarksFrom(null)).toEqual(DEFAULT_BENCHMARKS);
    expect(benchmarksFrom({})).toEqual(DEFAULT_BENCHMARKS);
    const b = benchmarksFrom({ saving: { good: 0.2, warn: "x" }, debt: 5 });
    expect(b.saving).toEqual({ good: 0.2, warn: DEFAULT_BENCHMARKS.saving.warn });
    expect(b.debt).toEqual(DEFAULT_BENCHMARKS.debt);
  });
  it("valores y referencias escritos como en el mockup", () => {
    expect(pctText(0.1023)).toBe("10.2%");
    expect(pctText(0.1)).toBe("10%");
    expect(pctText(0.684, 0)).toBe("68%");
    expect(monthsText(1.36)).toBe("1.4");
    expect(monthsText(3)).toBe("3");
    expect(valueText({ key: "surplus", value: 0.102, level: "good" })).toBe("10.2%");
    expect(valueText({ key: "dependency", value: 0.684, level: "good" })).toBe("68%");
    expect(valueText({ key: "emergency", value: 0.59, level: "bad" })).toBe("0.6");
    expect(valueText({ key: "saving", value: null, level: "nodata" })).toBe("—");
    expect(referenceVars("surplus", DEFAULT_BENCHMARKS)).toEqual({ good: "10%", warn: "0%" });
    expect(referenceVars("emergency", DEFAULT_BENCHMARKS)).toEqual({ good: "3", warn: "1" });
  });
  it("cada nivel tiene su palabra (nunca solo color) y su tono", () => {
    for (const loc of ["es", "en"] as const) for (const l of ["good", "warn", "bad", "nodata"] as const) expect(DM[loc].level[l].length).toBeGreaterThan(0);
    expect(DM.es.level).toEqual({ good: "Bien", warn: "Atención", bad: "Por mejorar", nodata: "Sin datos" });
    expect(levelTone("good")).toBe("ok");
    expect(levelTone("nodata")).toBe("neutral");
  });
  it("conteo por nivel y prioridad con datos reales del motor", () => {
    // Fondo $1,200 / básicos $2,023 = 0.59 meses → por mejorar
    const ind = diagnose({ incomeCents: 641_800, expenseCents: 576_300, savingCents: 17_500, debtPaymentsCents: 103_400, basicExpensesCents: 202_300, emergencyFundCents: 120_000, largestIncomeCents: 541_800 });
    expect(ind.map((i) => i.level)).toEqual(["good", "bad", "warn", "bad", "warn"]); // ahorro 2.7% < 5%
    expect(priority(ind)).toBe("emergency"); // fondo va antes que ahorro
    expect(levelCounts(ind)).toEqual([{ level: "good", n: 1 }, { level: "warn", n: 2 }, { level: "bad", n: 2 }]);
    // en qué enfocarte: cada prioridad y "ninguna" tienen texto y resumen
    for (const k of ["surplus", "saving", "debt", "emergency", "dependency", "none"] as const) {
      expect(DM.es.focus[k].title).not.toBe("");
      expect(DM.es.summary[k].hl).not.toBe("");
    }
  });
  it("fondo de emergencia sin marcar: sin datos (no $0) y no se vuelve la prioridad", () => {
    const raw = diagnose({ incomeCents: 641_800, expenseCents: 500_000, savingCents: 100_000, debtPaymentsCents: 50_000, basicExpensesCents: 202_300, emergencyFundCents: 0, largestIncomeCents: 400_000 });
    expect(priority(raw)).toBe("emergency");
    const ind = withFundState(raw, false);
    expect(ind.find((i) => i.key === "emergency")).toEqual({ key: "emergency", value: null, level: "nodata" });
    expect(priority(ind)).toBeNull();
    expect(levelCounts(ind).find((c) => c.level === "nodata")?.n).toBe(1);
    expect(withFundState(raw, true)).toBe(raw);
  });
  it("sin plan o sin ingresos no hay diagnóstico", () => {
    expect(canDiagnose(0, 100)).toBe(false);
    expect(canDiagnose(3, 0)).toBe(false);
    expect(canDiagnose(3, 100)).toBe(true);
  });
  it("nombres en una frase", () => {
    expect(joinNames(["Inner Circle"], "y")).toBe("Inner Circle");
    expect(joinNames(["Inner Circle", "Bike Payment"], "y")).toBe("Inner Circle y Bike Payment");
    expect(joinNames(["A", "B", "C", "D"], "and")).toBe("A, B and C");
  });
});

describe("diagnóstico · siguiente paso del alumno", () => {
  it("quien no es alumno nunca ve el bloque de alumno", () => {
    expect(studentStep({ student: false, mode: "course", course: "ahorro" })).toEqual({ show: false, fixedSlug: null });
  });
  it("sin mode o 'auto': el automático", () => {
    expect(studentStep({ student: true, mode: undefined, course: "" })).toEqual({ show: true, fixedSlug: null });
    expect(studentStep({ student: true, mode: "auto", course: "ahorro" })).toEqual({ show: true, fixedSlug: null });
  });
  it("'course': el curso fijo; sin curso, como automático", () => {
    expect(studentStep({ student: true, mode: "course", course: "ahorro" })).toEqual({ show: true, fixedSlug: "ahorro" });
    expect(studentStep({ student: true, mode: "course", course: "" })).toEqual({ show: true, fixedSlug: null });
  });
  it("'none': nada", () => {
    expect(studentStep({ student: true, mode: "none", course: "ahorro" }).show).toBe(false);
  });
});
