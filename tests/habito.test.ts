// Hábito de uso: "Hoy puedes gastar", repaso semanal y avisos (src/lib/engine/habito.ts).
import { describe, expect, it } from "vitest";
import {
  dailyAllowance, daysLeftInMonth, fixedLineIds, fixedReasons, fixedSlots, flexibleBudget, flexibleSpend, isLastDayOfMonth, isQuietHour, isSunday,
  localClock, mergeHabitPrefs, pickHabit, pickOneThing, readHabitPrefs, repasoWeek, upcomingPayments, wantsHabit,
  type FixedInput, type HabitCategory, type HabitLine, type HabitTx,
} from "@/lib/engine/habito";
import { monthAmounts, type PlanCell } from "@/lib/engine";

const cats: HabitCategory[] = [
  { id: "inc", kind: "income" }, { id: "hogar", kind: "expense" }, { id: "ocio", kind: "expense" },
  { id: "deuda", kind: "debt" }, { id: "ahorro", kind: "saving" }, { id: "metas", kind: "goal" },
];
const line = (id: string, categoryId: string, amountCents: number, extra: Partial<HabitLine> = {}): HabitLine => ({
  id, name: id, kind: "expense", categoryId, year: 2026, frequency: "monthly", amountCents, firstPayDate: null, debtId: null, goalId: null, investmentId: null, ...extra,
});
const cellsOf = (lines: HabitLine[]): PlanCell[] =>
  lines.flatMap((l) => monthAmounts(l).map((amountCents, i) => ({ lineId: l.id, month: i + 1, amountCents, manual: false })));
const input = (lines: HabitLine[], extra: Partial<FixedInput> = {}): FixedInput => ({ lines, categories: cats, cells: cellsOf(lines), marks: [], recurringLineIds: [], linked: [], ...extra });

describe("qué es fijo y qué es del día a día", () => {
  it("cada motivo de 'fijo', y lo demás es del día a día", () => {
    const lines = [
      line("sueldo", "inc", 541_800, { kind: "income" }),
      line("tarjeta", "deuda", 20_000),                                   // categoría de deudas
      line("fondo", "ahorro", 30_000),                                    // categoría de ahorro
      line("viaje", "metas", 20_000),                                     // categoría de metas
      line("hipoteca", "hogar", 180_000, { debtId: "d1" }),               // unida a una deuda
      line("etf", "hogar", 10_000, { investmentId: "i1" }),               // unida a una inversión
      line("seguro", "hogar", 90_000, { frequency: "yearly", firstPayDate: "2026-03-10" }), // anual
      line("internet", "hogar", 7_000, { firstPayDate: "2026-01-15" }),  // mensual con día elegido
      line("netflix", "ocio", 1_700),                                     // con recurrente
      line("arriendo", "hogar", 160_000),                                 // pagado como cuenta (marca)
      line("telefono", "hogar", 4_000),                                   // pagado con 1 movimiento que cubre el plan
      line("super", "hogar", 48_000, { frequency: "weekly", amountCents: 12_000, firstPayDate: "2026-01-02" }), // muchos movimientos
      line("salidas", "ocio", 25_000),                                    // sin nada: día a día
    ];
    const r = fixedReasons(input(lines, {
      marks: ["arriendo:10"], recurringLineIds: ["netflix"],
      linked: [
        { lineId: "telefono", date: "2026-10-05", amountCents: -4_000 },
        // supermercado de octubre (5 viernes): 7 compras → no es "una cuenta"
        ...[1, 4, 8, 11, 15, 22, 29].map((d) => ({ lineId: "super", date: `2026-10-${String(d).padStart(2, "0")}`, amountCents: -7_000 })),
      ],
    }));
    expect(Object.fromEntries(r)).toEqual({
      tarjeta: "category", fondo: "category", viaje: "category", hipoteca: "linked", etf: "linked", seguro: "one_off",
      internet: "dated", netflix: "recurring", arriendo: "paid_as_bill", telefono: "paid_as_bill",
    });
    expect(r.has("super")).toBe(false);
    expect(r.has("salidas")).toBe(false);
    expect(r.has("sueldo")).toBe(false); // los ingresos nunca son "gasto fijo"
  });

  it("un pago parcial con un solo movimiento no la vuelve fija (no cubre el plan)", () => {
    const lines = [line("salidas", "ocio", 25_000)];
    expect(fixedLineIds(input(lines, { linked: [{ lineId: "salidas", date: "2026-11-03", amountCents: -6_000 }] })).size).toBe(0);
  });

  it("arriendo semanal pagado con un movimiento por semana es fijo", () => {
    const rent = line("arriendo", "hogar", 0, { frequency: "weekly", amountCents: 40_000, firstPayDate: "2026-01-02" });
    // noviembre 2026 tiene 4 viernes (6, 13, 20, 27): 4 pagos de $400
    const linked = ["06", "13", "20", "27"].map((d) => ({ lineId: "arriendo", date: `2026-11-${d}`, amountCents: -40_000 }));
    expect(fixedReasons(input([rent], { linked })).get("arriendo")).toBe("paid_as_bill");
  });

  it("lo que elige el usuario gana sobre todo", () => {
    const lines = [line("tarjeta", "deuda", 20_000), line("salidas", "ocio", 25_000)];
    const r = fixedReasons(input(lines, { overrides: new Map([["tarjeta", false], ["salidas", true]]) }));
    expect(r.has("tarjeta")).toBe(false);
    expect(r.get("salidas")).toBe("override");
  });
});

describe("presupuesto y gasto del día a día", () => {
  const lines = [
    line("arriendo", "hogar", 160_000, { firstPayDate: "2026-01-01" }),
    line("super", "hogar", 12_000),
    line("salidas", "ocio", 25_000),
    line("tarjeta", "deuda", 20_000),
    line("sueldo", "inc", 541_800, { kind: "income" }),
  ];
  const cells = cellsOf(lines);
  const fixed = fixedLineIds(input(lines));

  it("solo suma lo planeado en líneas de gasto no fijas", () => {
    const b = flexibleBudget(lines, cells, 11, fixed);
    expect(b.totalCents).toBe(37_000);
    expect(b.byCategory.get("hogar")).toBe(12_000);
    expect(b.byCategory.get("ocio")).toBe(25_000);
  });

  it("gasto: sin fijos, sin transferencias, sin ahorro; las devoluciones de gasto restan", () => {
    const tx = (amountCents: number, o: Partial<HabitTx> = {}): HabitTx => ({ date: "2026-11-10", amountCents, categoryId: null, planLineId: null, kind: "normal", isSplit: false, ...o });
    const s = flexibleSpend([
      tx(-160_000, { planLineId: "arriendo", categoryId: "hogar" }), // pago de una línea fija: no cuenta
      tx(-9_600, { planLineId: "super", categoryId: "hogar" }),      // unido a una línea del día a día: cuenta
      tx(-4_500, { categoryId: "ocio" }),                             // sin línea, categoría de gasto: cuenta
      tx(-1_200),                                                     // sin categoría: cuenta
      tx(1_000, { categoryId: "ocio" }),                              // devolución de gasto: resta
      tx(5_000),                                                      // positivo sin categoría = ingreso: no cuenta
      tx(-20_000, { categoryId: "deuda" }),                           // cuota de deuda sin línea: no cuenta
      tx(-30_000, { categoryId: "ahorro" }),                          // ahorro: no cuenta
      tx(-50_000, { kind: "transfer" }),                              // transferencia: no cuenta
      tx(-7_000, { isSplit: true }),                                  // padre dividido: no cuenta
      tx(541_800, { planLineId: "sueldo", categoryId: "inc" }),       // ingreso: no cuenta
    ], lines, cats, fixed);
    expect(s.totalCents).toBe(9_600 + 4_500 + 1_200 - 1_000);
    expect(s.byCategory.get("hogar")).toBe(9_600);
    expect(s.byCategory.get("ocio")).toBe(3_500);
    expect(s.byCategory.get(null)).toBe(1_200);
  });
});

describe("un pago fijo que llegó sin unir a su línea no es gasto del día a día", () => {
  const lines = [
    line("arriendo", "hogar", 160_000, { firstPayDate: "2026-01-01" }),
    line("bici", "deuda", 0, { frequency: "weekly", amountCents: 8_500, firstPayDate: "2026-01-06" }), // martes: 4 en noviembre
    line("salidas", "ocio", 25_000),
  ];
  const cells = cellsOf(lines);
  const fixed = fixedLineIds(input(lines));
  const tx = (amountCents: number, o: Partial<HabitTx> = {}): HabitTx => ({ date: "2026-11-03", amountCents, categoryId: null, planLineId: null, kind: "normal", isSplit: false, ...o });

  it("arriendo marcado a mano e importado sin unir: no cuenta; una cena aparte sí", () => {
    const slots = fixedSlots(lines, cells, 11, fixed, []);
    expect(slots.map((x) => [x.lineId, x.perPaymentCents, x.slots])).toEqual([["arriendo", 160_000, 1], ["bici", 8_500, 4]]);
    const s = flexibleSpend([tx(-160_000, { categoryId: "hogar" }), tx(-6_000, { categoryId: "ocio" })], lines, cats, fixed, slots);
    expect(s.totalCents).toBe(6_000);
  });

  it("monto a ±5%: sí; categoría distinta o un segundo pago del mismo monto: cuentan", () => {
    const slots = fixedSlots(lines, cells, 11, fixed, []);
    expect(flexibleSpend([tx(-155_000)], lines, cats, fixed, slots).totalCents).toBe(0);          // 3% menos y sin categoría
    expect(flexibleSpend([tx(-160_000, { categoryId: "ocio" })], lines, cats, fixed, slots).totalCents).toBe(160_000); // otra categoría
    expect(flexibleSpend([tx(-160_000), tx(-160_000)], lines, cats, fixed, slots).totalCents).toBe(160_000); // solo un arriendo al mes
  });

  it("los pagos ya unidos ocupan su lugar", () => {
    const slots = fixedSlots(lines, cells, 11, fixed, [{ lineId: "arriendo" }, { lineId: "bici" }, { lineId: "bici" }]);
    expect(slots.map((x) => [x.lineId, x.slots])).toEqual([["bici", 2]]);
  });
});

describe("hoy puedes gastar", () => {
  it("mockup: te quedan $252 para los 6 días que faltan de noviembre → $42 al día", () => {
    expect(daysLeftInMonth("2026-11-25")).toBe(6);
    const a = dailyAllowance({ budgetCents: 43_000, spentCents: 17_800, today: "2026-11-25", planNetCents: 63_200 });
    expect(a).toEqual({ state: "ok", perDayCents: 4_200, remainingCents: 25_200, daysLeft: 6, budgetCents: 43_000, spentCents: 17_800 });
  });

  it("redondea hacia abajo al centavo: la suma de los días nunca pasa de lo que queda", () => {
    const a = dailyAllowance({ budgetCents: 10_000, spentCents: 0, today: "2026-11-01", planNetCents: 0 });
    expect(a.state === "ok" && a.perDayCents).toBe(333); // $100 / 30 días = $3.33
    expect(a.state === "ok" && a.perDayCents * a.daysLeft).toBeLessThanOrEqual(10_000);
  });

  it("el último día del mes cuenta como 1 día", () => {
    const a = dailyAllowance({ budgetCents: 30_000, spentCents: 25_000, today: "2026-11-30", planNetCents: 0 });
    expect(a).toMatchObject({ state: "ok", perDayCents: 5_000, daysLeft: 1 });
    expect(isLastDayOfMonth("2026-11-30")).toBe(true);
    expect(isLastDayOfMonth("2026-11-29")).toBe(false);
  });

  it("si ya se pasó: no hay cifra diaria y lo que te sobra baja en lo que se pasó", () => {
    const a = dailyAllowance({ budgetCents: 37_000, spentCents: 41_500, today: "2026-11-25", planNetCents: 50_000 });
    expect(a).toEqual({ state: "over", overCents: 4_500, daysLeft: 6, budgetCents: 37_000, spentCents: 41_500, netBeforeCents: 50_000, netAfterCents: 45_500 });
  });

  it("justo en cero: puedes gastar $0 (no es 'te pasaste')", () => {
    expect(dailyAllowance({ budgetCents: 37_000, spentCents: 37_000, today: "2026-11-25", planNetCents: 0 })).toMatchObject({ state: "ok", perDayCents: 0, remainingCents: 0 });
  });

  it("sin nada planeado ni gastado en el día a día: no hay cifra; gastar sin plan es 'te pasaste'", () => {
    expect(dailyAllowance({ budgetCents: 0, spentCents: 0, today: "2026-11-25", planNetCents: 10_000 })).toEqual({ state: "none" });
    expect(dailyAllowance({ budgetCents: 0, spentCents: 2_000, today: "2026-11-25", planNetCents: 10_000 })).toMatchObject({ state: "over", overCents: 2_000, netAfterCents: 8_000 });
  });
});

describe("repaso semanal", () => {
  it("de lunes a sábado repasa la semana pasada; el domingo, la que termina hoy", () => {
    expect(repasoWeek("2026-11-25")).toEqual({ from: "2026-11-16", to: "2026-11-22", current: false }); // miércoles
    expect(repasoWeek("2026-11-23")).toEqual({ from: "2026-11-16", to: "2026-11-22", current: false }); // lunes
    expect(repasoWeek("2026-11-29")).toEqual({ from: "2026-11-23", to: "2026-11-29", current: true });  // domingo
    expect(isSunday("2026-11-29")).toBe(true);
    expect(isSunday("2026-11-30")).toBe(false);
  });

  it("lo que se paga en los próximos 7 días: solo fijos, sin pagar, en orden; cruza de mes", () => {
    const lines = [
      line("arriendo", "hogar", 160_000),                                       // mensual sin fecha (cae el día 1), marcado "Pagado" en octubre
      line("telefono", "hogar", 4_000, { firstPayDate: "2026-01-26" }),         // día 26
      line("netflix", "ocio", 1_700, { firstPayDate: "2026-01-28" }),           // día 28 (ya pagado este mes)
      line("bici", "deuda", 0, { frequency: "weekly", amountCents: 8_500, firstPayDate: "2026-01-03" }), // sábados
      line("salidas", "ocio", 25_000),                                          // día a día: nunca aparece
    ];
    const cells = cellsOf(lines);
    const fixed = fixedLineIds(input(lines, { recurringLineIds: ["netflix"], marks: ["arriendo:10"] }));
    const paid = new Set(["netflix:11"]);
    const due = upcomingPayments({ lines, cells, fixed, paid, from: "2026-11-25", to: "2026-12-01" });
    expect(due.map((d) => [d.date, d.name, d.amountCents])).toEqual([
      ["2026-11-26", "telefono", 4_000],
      ["2026-11-28", "bici", 8_500],
      ["2026-12-01", "arriendo", 160_000],
    ]);
    // para el aviso "mañana se paga" solo cuentan las fechas de verdad (no el día 1 por defecto)
    const tomorrowDec = upcomingPayments({ lines, cells, fixed, paid, from: "2026-12-01", to: "2026-12-01", explicitOnly: true });
    expect(tomorrowDec).toEqual([]);
    expect(upcomingPayments({ lines, cells, fixed, paid, from: "2026-11-26", to: "2026-11-26", explicitOnly: true }).map((d) => d.name)).toEqual(["telefono"]);
  });

  it("una cosa para esta semana: la primera que aplica, en el orden de 'Para hoy'", () => {
    const base = { review: 0, closeDue: false, weekTx: 5, staleBalances: false, overDayToDay: false, lesson: false };
    expect(pickOneThing({ ...base, review: 3, closeDue: true, weekTx: 0 })).toBe("review");
    expect(pickOneThing({ ...base, closeDue: true, weekTx: 0 })).toBe("close");
    expect(pickOneThing({ ...base, weekTx: 0, staleBalances: true })).toBe("record");
    expect(pickOneThing({ ...base, staleBalances: true, overDayToDay: true })).toBe("balances");
    expect(pickOneThing({ ...base, overDayToDay: true, lesson: true })).toBe("dayToDay");
    expect(pickOneThing({ ...base, lesson: true })).toBe("lesson");
    expect(pickOneThing(base)).toBe("none");
  });
});

describe("avisos del hábito", () => {
  it("preferencias: por defecto encendidas; se guardan sin tocar las demás claves", () => {
    expect(readHabitPrefs(null)).toEqual({ daily: true, weekly: true, goal: true });
    expect(readHabitPrefs({ habit: { daily: false, weekly: "x" } })).toEqual({ daily: false, weekly: true, goal: true });
    const merged = mergeHabitPrefs({ channel: "app", notify: { close: false }, habit: { goal: false, otra: 1 } }, { daily: false });
    expect(merged).toEqual({ channel: "app", notify: { close: false }, habit: { otra: 1, daily: false, weekly: true, goal: false } });
  });

  it("quién recibe qué: 'solo correo' apaga todos; 'mañana se paga' usa Pagos por vencer; el cierre solo si eligió fin de mes", () => {
    const habit = { daily: true, weekly: false, goal: true };
    const n = { payments: true, close: true, closeDay: "last" as const, channel: "both" as const };
    expect(wantsHabit("daily", habit, n)).toBe(true);
    expect(wantsHabit("weekly", habit, n)).toBe(false);
    expect(wantsHabit("due", habit, { ...n, payments: false })).toBe(false);
    expect(wantsHabit("close", habit, { ...n, closeDay: "first" })).toBe(false);
    expect(wantsHabit("close", habit, n)).toBe(true);
    expect(wantsHabit("daily", habit, { ...n, channel: "email" })).toBe(false);
    expect(wantsHabit("goal", habit, { ...n, channel: "app" })).toBe(true);
  });

  it("nunca de noche: de 21:00 a 8:00", () => {
    expect([7, 8, 20, 21, 23, 0].map(isQuietHour)).toEqual([true, false, false, true, true, true]);
  });

  it("la hora local sale de la zona del usuario (una zona inválida cae a Sydney)", () => {
    const now = new Date("2026-11-24T22:30:00Z"); // 9:30 del 25 en Sydney (verano), 17:30 del 24 en Bogotá
    expect(localClock("Australia/Sydney", now)).toEqual({ date: "2026-11-25", hour: 9 });
    expect(localClock("America/Bogota", now)).toEqual({ date: "2026-11-24", hour: 17 });
    expect(localClock("Marte/Olympus", now)).toEqual({ date: "2026-11-25", hour: 9 });
    expect(localClock("UTC", new Date("2026-11-24T00:15:00Z"))).toEqual({ date: "2026-11-24", hour: 0 });
  });

  it("uno al día: cierre → mañana se paga → repaso → hoy puedes gastar", () => {
    expect(pickHabit({ daily: true, weekly: true, due: true, close: true })).toBe("close");
    expect(pickHabit({ daily: true, weekly: true, due: true })).toBe("due");
    expect(pickHabit({ daily: true, weekly: true })).toBe("weekly");
    expect(pickHabit({ daily: true })).toBe("daily");
    expect(pickHabit({ goal: true })).toBeNull();
  });
});
