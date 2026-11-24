// Cálculos propios de Cuentas y Metas (los del motor se prueban en engine.test.ts).
import { describe, expect, it } from "vitest";
import { expectedBalance, goalPlan, monthsUntil, type AccountLite } from "@/lib/engine";
import { balanceCheck, cardBalance, defaultsFor, initialOf, KINDS, transferBalances, transferError, transferRows } from "@/app/(app)/cuentas/lib";
import { atFreeLimit, canUse, endOfMonth, goalStatus, isYm, monthOptions, planRange, resolveTargetDate, typeOf, whenLabel, ymOf } from "@/app/(app)/metas/lib";

describe("cuentas", () => {
  it("la cuenta de empresa nace fuera del patrimonio y de la proyección", () => {
    expect(defaultsFor("business")).toEqual({ inNetworth: false, inForecast: false });
    for (const k of ["bank", "savings", "card", "cash", "other"] as const) expect(defaultsFor(k)).toEqual({ inNetworth: true, inForecast: true });
  });

  it("aviso de saldo: te faltan por registrar, registraste de más o cuadra", () => {
    // regla cerrada: $5,000 el 1 nov −$1,330 +$5,418 = $9,088 esperado
    const acc: AccountLite = { id: "a", kind: "bank", balanceCents: 500_000, balanceDate: "2026-11-01", inNetworth: true, inForecast: true };
    const expected = expectedBalance(acc, [
      { accountId: "a", date: "2026-11-03", amountCents: -133_000 }, { accountId: "a", date: "2026-11-05", amountCents: 541_800 },
      { accountId: "a", date: "2026-11-01", amountCents: -9_900 }, // mismo día del saldo: ya está incluido
      { accountId: "b", date: "2026-11-04", amountCents: -50_000 },
    ]);
    expect(expected).toBe(908_800);
    expect(balanceCheck(908_800, expected)).toEqual({ state: "ok", cents: 0 });
    expect(balanceCheck(901_800, expected)).toEqual({ state: "missing", cents: 7_000 });   // tiene menos: le faltan $70 de gastos por registrar
    expect(balanceCheck(910_000, expected)).toEqual({ state: "extra", cents: 1_200 });
    expect(balanceCheck(908_750, expected).state).toBe("ok");                               // menos de $1 no se avisa
    expect(balanceCheck(908_700, expected)).toEqual({ state: "missing", cents: 100 });
  });

  it("aviso de saldo en tarjetas (negativo)", () => {
    expect(balanceCheck(-192_000, -180_000)).toEqual({ state: "missing", cents: 12_000 });   // debe más de lo que dicen sus movimientos
    expect(balanceCheck(-150_000, -180_000)).toEqual({ state: "extra", cents: 30_000 });
  });

  it("transferencia: valida cuentas distintas y monto positivo", () => {
    expect(transferError("a", "a", 100)).toBe("same");
    expect(transferError("", "b", 100)).toBe("same");
    expect(transferError("a", "b", null)).toBe("amount");
    expect(transferError("a", "b", 0)).toBe("amount");
    expect(transferError("a", "b", -500)).toBe("amount");
    expect(transferError("a", "b", 30_000)).toBeNull();
  });

  it("transferencia: dos movimientos con el mismo par que suman cero", () => {
    const [out, inn] = transferRows("u1", { id: "a", name: "Día a día" }, { id: "b", name: "Ahorro" }, 30_000, "2026-11-24", "pair-1", { to: "Transferencia a {name}", from: "Transferencia desde {name}" });
    expect(out).toMatchObject({ user_id: "u1", account_id: "a", amount_cents: -30_000, kind: "transfer", transfer_pair_id: "pair-1", date: "2026-11-24", description: "Transferencia a Ahorro", status: "ok", source: "manual" });
    expect(inn).toMatchObject({ user_id: "u1", account_id: "b", amount_cents: 30_000, kind: "transfer", transfer_pair_id: "pair-1", description: "Transferencia desde Día a día" });
    expect(out.amount_cents + inn.amount_cents).toBe(0);
    // y mueve el saldo esperado de las dos cuentas (por eso no se filtra con `counts`)
    const txs = [out, inn].map((r) => ({ accountId: r.account_id, date: r.date, amountCents: r.amount_cents }));
    const base = { kind: "bank" as const, balanceDate: "2026-11-01", inNetworth: true, inForecast: true };
    expect(expectedBalance({ ...base, id: "a", balanceCents: 100_000 }, txs)).toBe(70_000);
    expect(expectedBalance({ ...base, id: "b", balanceCents: 0 }, txs)).toBe(30_000);
  });

  it("tarjetas: un saldo positivo se guarda en negativo (lo que debe)", () => {
    expect(cardBalance("card", 192_000)).toBe(-192_000);
    expect(cardBalance("card", -192_000)).toBe(-192_000);
    expect(cardBalance("card", 0)).toBe(0);
    expect(cardBalance("bank", 192_000)).toBe(192_000);
    expect(cardBalance("other", 5_000)).toBe(5_000);
    expect(KINDS).toContain("other");
  });

  it("transferencia: mueve los dos saldos escritos y, con fecha de hoy, no se cuenta doble", () => {
    const next = transferBalances(234_000, 685_000, 30_000);
    expect(next).toEqual({ from: 204_000, to: 715_000 });
    expect(next.from + next.to).toBe(234_000 + 685_000);
    // pagar la tarjeta: la deuda baja
    expect(transferBalances(234_000, -192_000, 50_000)).toEqual({ from: 184_000, to: -142_000 });
    // el saldo queda con fecha de hoy y el movimiento también: el esperado es el mismo saldo
    const today = "2026-11-24";
    const acc: AccountLite = { id: "a", kind: "bank", balanceCents: next.from, balanceDate: today, inNetworth: true, inForecast: true };
    expect(expectedBalance(acc, [{ accountId: "a", date: today, amountCents: -30_000 }])).toBe(204_000);
  });

  it("inicial del cuadro de la cuenta", () => {
    expect(initialOf("  ubank spend")).toBe("U");
    expect(initialOf("")).toBe("");
  });
});

describe("metas", () => {
  const today = "2026-11-24";

  it("el mes elegido se guarda al último día: reproduce los meses del mockup", () => {
    expect(endOfMonth("2027-12")).toBe("2027-12-31");
    expect(endOfMonth("2028-02")).toBe("2028-02-29"); // bisiesto
    expect(endOfMonth("2027-02")).toBe("2027-02-28");
    expect(monthsUntil(today, endOfMonth("2027-03"))).toBe(4);
    expect(monthsUntil(today, endOfMonth("2027-06"))).toBe(7);
    expect(monthsUntil(today, endOfMonth("2027-12"))).toBe(13);
    expect(monthsUntil(today, endOfMonth("2028-12"))).toBe(25);
  });

  it("opciones de mes: desde el mes actual, cruzando años", () => {
    const o = monthOptions(today, 15);
    expect(o).toHaveLength(15);
    expect(o[0]).toBe("2026-11");
    expect(o[1]).toBe("2026-12");
    expect(o[2]).toBe("2027-01");
    expect(o[14]).toBe("2028-01");
    expect(monthOptions(today)).toHaveLength(72);
    expect(o.every(isYm)).toBe(true);
  });

  it("fecha que se guarda: sin mes no hay fecha; si el mes no cambia conserva el día", () => {
    expect(resolveTargetDate("", null)).toBeNull();
    expect(resolveTargetDate("2027-13", null)).toBeNull();
    expect(resolveTargetDate("2027-03", null)).toBe("2027-03-31");
    expect(resolveTargetDate("2027-03", "2027-03-01")).toBe("2027-03-01");
    expect(resolveTargetDate("2027-04", "2027-03-01")).toBe("2027-04-30");
    expect(ymOf("2027-03-01")).toBe("2027-03");
    expect(whenLabel("2027-12-31")).toBe("Dic 2027");
    expect(whenLabel("2027-12", "en")).toBe("Dec 2027");
  });

  it("tipo libre: reconoce las sugerencias en los dos idiomas", () => {
    const labels = [
      { trip: "Viaje", fund: "Fondo de emergencia", buy: "Comprar algo", debt: "Pagar una deuda", invest: "Inversión", other: "Otra" },
      { trip: "Trip", fund: "Emergency fund", buy: "Buy something", debt: "Pay off a debt", invest: "Investment", other: "Other" },
    ];
    expect(typeOf("Viaje", labels)).toBe("trip");
    expect(typeOf(" fondo de emergencia ", labels)).toBe("fund");
    expect(typeOf("Investment", labels)).toBe("invest");
    expect(typeOf("Mascota", labels)).toBe("other");
    expect(typeOf("", labels)).toBe("other");
  });

  it("límite del plan Gratis: solo aplica a Gratis y desde el tope", () => {
    expect(atFreeLimit("free", 1, 2)).toBe(false);
    expect(atFreeLimit("free", 2, 2)).toBe(true);
    expect(atFreeLimit("free", 3, 2)).toBe(true);
    expect(atFreeLimit("pro", 9, 2)).toBe(false);
    expect(atFreeLimit("free", 0, 0)).toBe(true);
  });

  it("línea del plan: del mes actual hasta la fecha, sin salir del año en curso", () => {
    expect(planRange(today, "2027-03-31")).toEqual({ fromMonth: 11, toMonth: 12 }); // la meta sigue el año próximo
    expect(planRange(today, "2026-12-31")).toEqual({ fromMonth: 11, toMonth: 12 });
    expect(planRange("2026-03-10", "2026-08-31")).toEqual({ fromMonth: 3, toMonth: 8 });
    expect(planRange(today, "2026-11-30")).toEqual({ fromMonth: 11, toMonth: 11 });
    expect(planRange(today, "2026-06-30")).toEqual({ fromMonth: 11, toMonth: 11 });   // fecha vencida este año
    expect(planRange(today, "2025-06-30")).toEqual({ fromMonth: 11, toMonth: 11 });   // fecha vencida de otro año
  });

  it("estado de la meta", () => {
    const st = (target: number, entries: number[], date: string | null) => goalStatus(goalPlan(target, entries, date, today), target, date, today);
    expect(st(0, [50_000], "2027-12-31")).toBe("setup");            // sin monto
    expect(st(300_000, [100_000], null)).toBe("noDate");            // una meta sin fecha no calcula aporte
    expect(st(300_000, [200_000, 100_000], null)).toBe("reached");
    expect(st(300_000, [400_000, -50_000], "2027-12-31")).toBe("reached");
    expect(st(300_000, [140_000], "2027-12-31")).toBe("saving");
    expect(st(300_000, [140_000], "2026-06-30")).toBe("late");
  });

  it("aporte mensual y semanal con la fecha del selector", () => {
    // $5,118 − $1,200 ahorrados = $3,918 en 13 meses → $301.39 al mes (se redondea hacia arriba al centavo)
    const gp = goalPlan(511_800, [120_000], endOfMonth("2027-12"), today);
    expect(gp.remainingCents).toBe(391_800);
    expect(gp.monthsLeft).toBe(13);
    expect(gp.monthlyCents).toBe(30_139);
    expect(gp.weeklyCents).toBe(Math.ceil((30_139 * 12) / 52));
    expect(goalPlan(511_800, [120_000], null, today).monthlyCents).toBeNull();
  });

  it("usar dinero: nunca más de lo ahorrado", () => {
    expect(canUse(50_000, 120_000)).toBe(true);
    expect(canUse(120_000, 120_000)).toBe(true);
    expect(canUse(120_001, 120_000)).toBe(false);
    expect(canUse(0, 120_000)).toBe(false);
    expect(canUse(100, 0)).toBe(false);
  });
});
