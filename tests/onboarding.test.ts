import { describe, expect, it } from "vitest";
import { isoWeekday, monthAmounts } from "@/lib/engine";
import {
  anchorPayDate, averageSummary, buildDrafts, cents, defaultAnswers, draftMonths, goalDate, monthlyAverage, pickCategory, readAnswers,
  summarize, visibleSteps, type Answers, type CatLite, type Ctx,
} from "@/app/(onboarding)/asistente/lib";
import { safeTimezone } from "@/app/(onboarding)/bienvenida/lib";

const labels: Ctx["labels"] = {
  income: "Trabajo",
  home: { rent: "Arriendo", mortgage: "Hipoteca", family: "Vivienda" },
  basics: { groceries: "Súper", utilities: "Luz, gas e internet", phone: "Teléfono", transport: "Transporte" },
  debts: { card: "Tarjeta de crédito", bnpl: "Afterpay / Zip", car: "Préstamo de auto", personal: "Préstamo personal" },
  debtTypes: { mortgage: "Hipoteca", student: "Préstamo estudiantil", family: "Deuda con familia o amigos", tax: "Impuestos atrasados", other: "Otra" },
  family: "Envío a mi familia", goal: "Meta",
};
const ctx: Ctx = { year: 2026, month: 11, today: "2026-11-24", remesas: true, labels };
const base = (): Answers => defaultAnswers({ payFrequency: "weekly", incomeName: "Trabajo", goalNames: [] });

describe("asistente: día de pago", () => {
  it("lleva un pago semanal al primer pago del año con el mismo día de la semana", () => {
    const first = anchorPayDate("2026-11-27", "weekly", 2026); // viernes
    expect(first).toBe("2026-01-02");
    expect(isoWeekday(first)).toBe(5);
    const months = monthAmounts({ frequency: "weekly", amountCents: 100, firstPayDate: first, year: 2026 });
    expect(months[0]).toBe(500); // enero tiene 5 viernes
    expect(months[1]).toBe(400);
    expect(months.reduce((a, b) => a + b, 0)).toBe(5200);
  });
  it("quincenal: conserva el ciclo de 14 días y suma 26 pagos", () => {
    const first = anchorPayDate("2026-11-27", "fortnightly", 2026);
    expect(first).toBe("2026-01-09");
    expect(monthAmounts({ frequency: "fortnightly", amountCents: 100, firstPayDate: first, year: 2026 }).reduce((a, b) => a + b, 0)).toBe(2600);
  });
  it("una fecha del año anterior avanza hasta el año del plan; una del 1 de enero se queda", () => {
    expect(anchorPayDate("2025-12-26", "weekly", 2026)).toBe("2026-01-02");
    expect(anchorPayDate("2026-01-01", "weekly", 2026)).toBe("2026-01-01");
    expect(anchorPayDate(null, "weekly", 2026)).toBe("2026-01-01");
  });
  it("mensual: mismo día, desde enero (los 12 meses tienen pago)", () => {
    const first = anchorPayDate("2026-11-30", "monthly", 2026);
    expect(first).toBe("2026-01-30");
    expect(monthAmounts({ frequency: "monthly", amountCents: 100, firstPayDate: first, year: 2026 })).toEqual(Array(12).fill(100));
  });
});

describe("asistente: respuestas → líneas del plan", () => {
  it("sin montos no crea nada", () => {
    const d = buildDrafts(base(), ctx);
    expect(d).toEqual({ lines: [], debts: [], goals: [], freelance: false, mainFrequency: null });
  });

  it("ingreso semanal con su día de pago y gastos que siguen ese mismo día", () => {
    const a = base();
    a.incomes = [{ name: " Restaurante ", amount: "1,250", freq: "weekly", payDate: "2026-11-27", freelance: true }];
    a.home = { type: "rent", amount: "330", freq: "weekly" };
    a.basics.groceries.amount = "150";
    a.basics.phone.amount = "40";
    const d = buildDrafts(a, ctx);
    expect(d.freelance).toBe(true);
    expect(d.mainFrequency).toBe("weekly");
    expect(d.lines.map((l) => [l.group, l.name, l.kind, l.frequency, l.amountCents, l.firstPayDate])).toEqual([
      ["income", "Restaurante", "income", "weekly", 125000, "2026-01-02"],
      ["home", "Arriendo", "expense", "weekly", 33000, "2026-01-02"],
      ["basics", "Súper", "expense", "weekly", 15000, "2026-01-02"],
      ["basics", "Teléfono", "expense", "monthly", 4000, null],
    ]);
    // noviembre 2026 tiene 4 viernes: 6, 13, 20, 27
    const nov = summarize(d, 2026, 11);
    expect(nov.income).toBe(4 * 125000);
    expect(nov.home).toBe(4 * 33000);
    expect(nov.basics).toBe(4 * 15000 + 4000);
    expect(nov.expense).toBe(4 * 33000 + 4 * 15000 + 4000);
    expect(nov.net).toBe(nov.income - nov.expense);
    expect(nov.lines).toBe(4);
    // octubre tiene 5 viernes: el pago extra ya está
    expect(summarize(d, 2026, 10).income).toBe(5 * 125000);
  });

  it("un gasto semanal sin día de pago no cuenta 5 semanas todos los meses", () => {
    const a = base();
    a.incomes[0].amount = "1000";
    a.home.amount = "100";
    const home = buildDrafts(a, ctx).lines.find((l) => l.group === "home")!;
    expect(home.firstPayDate).toBe("2026-01-01");
    expect(draftMonths(home, 2026).reduce((x, y) => x + y, 0)).toBe(53 * 10000); // 2026 tiene 53 jueves
  });

  it("ingreso sin nombre usa el nombre sugerido; sin monto se ignora", () => {
    const a = base();
    a.incomes = [{ name: "", amount: "", freq: "weekly", payDate: "", freelance: true }, { name: "", amount: "3000", freq: "monthly", payDate: "", freelance: false }];
    const d = buildDrafts(a, ctx);
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0]).toMatchObject({ name: "Trabajo", frequency: "monthly", firstPayDate: null, amountCents: 300000 });
    expect(d.freelance).toBe(false);
    expect(d.mainFrequency).toBe("monthly");
  });

  it("hipoteca: una sola línea de vivienda, unida a su deuda", () => {
    const a = base();
    a.incomes[0].amount = "2000";
    a.home = { type: "mortgage", amount: "900", freq: "fortnightly" };
    const d = buildDrafts(a, ctx);
    expect(d.debts).toEqual([{ name: "Hipoteca", kind: "loan", paymentCents: 90000, paymentFrequency: "fortnightly" }]);
    const home = d.lines.filter((l) => l.name === "Hipoteca");
    expect(home).toHaveLength(1);
    expect(home[0]).toMatchObject({ group: "home", debtRef: 0, frequency: "fortnightly" });
  });

  it("vivo con familia y sin monto: no hay línea de vivienda", () => {
    const a = base();
    a.home = { type: "family", amount: "", freq: "weekly" };
    expect(buildDrafts(a, ctx).lines).toEqual([]);
  });

  it("deudas: las marcadas se crean; la cuota va unida a su deuda; libres con nombre propio", () => {
    const a = base();
    a.debts.card = { on: true, amount: "120" };
    a.debts.bnpl = { on: true, amount: "" };          // marcada sin cuota: deuda sí, línea no
    a.debts.car = { on: false, amount: "500" };       // desmarcada: nada
    a.extraDebts = [{ name: "Deuda con mi tío", type: "family", amount: "200" }, { name: "", type: "tax", amount: "50" }, { name: "", type: "other", amount: "" }];
    const d = buildDrafts(a, ctx);
    expect(d.debts.map((x) => [x.name, x.kind, x.paymentCents])).toEqual([
      ["Tarjeta de crédito", "card", 12000], ["Afterpay / Zip", "bnpl", 0], ["Deuda con mi tío", "personal", 20000], ["Impuestos atrasados", "other", 5000],
    ]);
    expect(d.lines.map((l) => [l.name, l.debtRef, l.amountCents, l.frequency, l.firstPayDate])).toEqual([
      ["Tarjeta de crédito", 0, 12000, "monthly", null], ["Deuda con mi tío", 2, 20000, "monthly", null], ["Impuestos atrasados", 3, 5000, "monthly", null],
    ]);
    expect(summarize(d, 2026, 11).debts).toBe(37000);
  });

  it("familia: solo si las remesas están activas y dijo que sí", () => {
    const a = base();
    a.family = { on: true, amount: "300", freq: "monthly" };
    expect(buildDrafts(a, ctx).lines).toEqual([expect.objectContaining({ group: "family", name: "Envío a mi familia", amountCents: 30000 })]);
    expect(buildDrafts(a, { ...ctx, remesas: false }).lines).toEqual([]);
    a.family.on = false;
    expect(buildDrafts(a, ctx).lines).toEqual([]);
  });

  it("metas: con monto y fecha aportan cada mes desde hoy hasta su fecha; sin fecha solo se crea la meta", () => {
    const a = base();
    a.goals = [
      { name: "Viaje", amount: "7000", date: "2027-05" },   // 6 meses completos: nov a abr
      { name: "Carro", amount: "5000", date: "" },
      { name: "Salir de deudas", amount: "", date: "" },
      { name: "", amount: "", date: "" },                    // vacía: se ignora
      { name: "", amount: "900", date: "2026-12" },
    ];
    const d = buildDrafts(a, ctx);
    expect(d.goals).toEqual([
      { name: "Viaje", targetCents: 700000, targetDate: "2027-05-31" },
      { name: "Carro", targetCents: 500000, targetDate: null },
      { name: "Salir de deudas", targetCents: 0, targetDate: null },
      { name: "Meta", targetCents: 90000, targetDate: "2026-12-31" },
    ]);
    const viaje = d.lines.find((l) => l.goalRef === 0)!;
    expect(viaje).toMatchObject({ group: "goals", amountCents: Math.ceil(700000 / 6), fromMonth: 11, toMonth: 12, frequency: "monthly" });
    const m = draftMonths(viaje, 2026);
    expect(m.slice(0, 10)).toEqual(Array(10).fill(0)); // no aporta en los meses que ya pasaron
    expect(m[10]).toBe(viaje.amountCents);
    const corta = d.lines.find((l) => l.goalRef === 3)!;
    expect(corta).toMatchObject({ amountCents: 90000, fromMonth: 11, toMonth: 11 }); // 1 mes: todo en noviembre
    expect(d.lines.filter((l) => l.group === "goals")).toHaveLength(2);
    // el aporte a metas SÍ cuenta en lo que sale (así lo verá Inicio)
    expect(summarize(d, 2026, 11).expense).toBe(viaje.amountCents + 90000);
    expect(summarize(d, 2026, 12).goals).toBe(viaje.amountCents);
  });

  it("el promedio de la vista previa usa semanal × 52 ÷ 12", () => {
    expect(monthlyAverage(120000, "weekly")).toBe(520000);
    expect(monthlyAverage(120000, "fortnightly")).toBe(260000);
    expect(monthlyAverage(120000, "monthly")).toBe(120000);
    const a = base();
    a.incomes[0].amount = "1200";
    a.home.amount = "300";
    const s = averageSummary(buildDrafts(a, ctx));
    expect(s).toMatchObject({ income: 520000, home: 130000, expense: 130000, net: 390000, lines: 2 });
  });

  it("los montos se leen en centavos y nunca quedan negativos", () => {
    expect(cents("1,330.50")).toBe(133050);
    expect(cents("-50")).toBe(0);
    expect(cents("abc")).toBe(0);
    expect(cents("")).toBe(0);
  });

  it("la fecha de una meta en el pasado no cuenta", () => {
    expect(goalDate("2026-10", "2026-11-24")).toBeNull();
    expect(goalDate("2026-11", "2026-11-24")).toBe("2026-11-30");
    expect(goalDate("2028-02", "2026-11-24")).toBe("2028-02-29");
    expect(goalDate("2026-13", "2026-11-24")).toBeNull();
  });
});

describe("asistente: avance guardado y categorías", () => {
  it("retoma lo guardado si es válido; si no, empieza de cero", () => {
    const fallback = defaultAnswers({ payFrequency: "monthly", incomeName: "Trabajo", goalNames: ["Salir de deudas"] });
    expect(fallback.incomes[0].freq).toBe("monthly");
    expect(fallback.goals).toEqual([{ name: "Salir de deudas", amount: "", date: "" }]);
    const saved = { ...base(), step: "debts" as const };
    expect(readAnswers(JSON.parse(JSON.stringify(saved)), fallback).step).toBe("debts");
    expect(readAnswers({ step: "nope" }, fallback)).toBe(fallback);
    expect(readAnswers(undefined, fallback)).toBe(fallback);
  });
  it("el paso de familia desaparece sin remesas", () => {
    expect(visibleSteps(true)).toHaveLength(7);
    expect(visibleSteps(false)).toEqual(["income", "home", "basics", "debts", "goals", "plan"]);
  });
  it("elige la categoría por tipo, aunque le hayan cambiado el nombre", () => {
    const cats: CatLite[] = [
      { id: "i", name: "Lo que entra", kind: "income", isBasic: false },
      { id: "v", name: "Carro", kind: "expense", isBasic: false },
      { id: "b", name: "Casa", kind: "expense", isBasic: true },
      { id: "f", name: "Familia y remesas", kind: "expense", isBasic: false },
      { id: "d", name: "Lo que debo", kind: "debt", isBasic: false },
      { id: "s", name: "Ahorro", kind: "saving", isBasic: false },
    ];
    expect(pickCategory(cats, "income")).toBe("i");
    expect(pickCategory(cats, "basic")).toBe("b");
    expect(pickCategory(cats, "family")).toBe("f");
    expect(pickCategory(cats, "debt")).toBe("d");
    expect(pickCategory(cats, "goal")).toBe("s"); // sin categoría de metas: va a ahorro
    expect(pickCategory(cats.filter((c) => c.id !== "b"), "basic")).toBe("v");
    expect(pickCategory(cats.filter((c) => c.id !== "f"), "family")).toBeNull(); // hay que crearla
    expect(pickCategory([], "income")).toBeNull();
  });
});

describe("bienvenida: zona horaria", () => {
  it("acepta una zona IANA real y, si no, usa la del país", () => {
    expect(safeTimezone("America/Bogota", "Australia/Sydney")).toBe("America/Bogota");
    expect(safeTimezone("Australia/Perth", "Australia/Sydney")).toBe("Australia/Perth");
    expect(safeTimezone("Marte/Olimpo", "Australia/Sydney")).toBe("Australia/Sydney");
    expect(safeTimezone("", "UTC")).toBe("UTC");
    expect(safeTimezone(undefined, "UTC")).toBe("UTC");
    expect(safeTimezone("+10:00", "Australia/Sydney")).toBe("Australia/Sydney");
  });
});
