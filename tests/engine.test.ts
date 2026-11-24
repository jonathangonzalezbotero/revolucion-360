import { describe, expect, it } from "vitest";
import {
  addMonths, annualTotals, mappingWorks, applyRules, badgeProgress, bnplSchedule, closingBalance, consecutiveClosures, debtPayoff, diagnose,
  expectedBalance, findDuplicate, findTransferPair, forecast, formatMoney, goalPlan, guessMapping, hasFeature, levelFor,
  lineMonthStatus, mapRows, monthAmounts, monthsUntil, netWorth, nextStateOnExpiry, parseCsv, parseDate, parseMoney,
  payDatesInMonth, priority, recomputeCells, splitEven, splitIsValid, streak, suggestLine, taxToSetAside, tierOf, todayIn,
  unregistered, weekStart, yearTotals, type PlanLine,
} from "@/lib/engine";
import { buildPlan2026 } from "./fixtures/plan2026";

describe("dinero", () => {
  it("lee montos en centavos", () => {
    expect(parseMoney("1,330.50")).toBe(133050);
    expect(parseMoney("$1.330,5")).toBe(133050);
    expect(parseMoney("-86")).toBe(-8600);
    expect(parseMoney("(86.00)")).toBe(-8600);
    expect(parseMoney("5418")).toBe(541800);
    expect(parseMoney("1,330")).toBe(133000);
    expect(parseMoney("0.07")).toBe(7);
    expect(parseMoney("abc")).toBeNull();
  });
  it("muestra montos", () => {
    expect(formatMoney(739000)).toBe("$7,390");
    expect(formatMoney(-8600)).toBe("−$86");
    expect(formatMoney(154000, undefined, { sign: true })).toBe("+$1,540");
    expect(formatMoney(1050)).toBe("$10.50");
  });
  it("reparte sin perder centavos", () => {
    expect(splitEven(1000, 3)).toEqual([334, 333, 333]);
    expect(splitEven(-1000, 3).reduce((a, b) => a + b, 0)).toBe(-1000);
  });
});

describe("fechas en la zona horaria del usuario", () => {
  it("el día cambia según la zona, no según el servidor", () => {
    const now = new Date("2026-11-30T14:30:00Z"); // 1 de diciembre 01:30 en Sydney
    expect(todayIn("Australia/Sydney", now)).toBe("2026-12-01");
    expect(todayIn("America/Bogota", now)).toBe("2026-11-30");
  });
  it("cambio de horario de verano en Sydney (4 de octubre de 2026)", () => {
    expect(todayIn("Australia/Sydney", new Date("2026-10-03T15:59:00Z"))).toBe("2026-10-04");
    expect(todayIn("Australia/Sydney", new Date("2026-10-04T12:59:00Z"))).toBe("2026-10-04");
    expect(todayIn("Australia/Sydney", new Date("2026-10-04T13:00:00Z"))).toBe("2026-10-05");
  });
  it("semana de lunes a domingo", () => {
    expect(weekStart("2026-11-24")).toBe("2026-11-23"); // martes
    expect(weekStart("2026-11-29")).toBe("2026-11-23"); // domingo
    expect(weekStart("2026-11-30")).toBe("2026-11-30"); // lunes
  });
  it("meses", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29"); // bisiesto
    expect(monthsUntil("2026-11-24", "2027-06-30")).toBe(7);
  });
});

describe("frecuencias del plan anual", () => {
  // Ejemplo del mockup: primer pago el viernes 2 de enero de 2026
  it("semanal cuenta los viernes reales de cada mes", () => {
    const counts = Array.from({ length: 12 }, (_, i) => payDatesInMonth("weekly", "2026-01-02", 2026, i + 1).length);
    expect(counts).toEqual([5, 4, 4, 4, 5, 4, 5, 4, 4, 5, 4, 4]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(52);
  });
  it("quincenal cuenta los días de pago reales", () => {
    const counts = Array.from({ length: 12 }, (_, i) => payDatesInMonth("fortnightly", "2026-01-02", 2026, i + 1).length);
    expect(counts).toEqual([3, 2, 2, 2, 2, 2, 3, 2, 2, 2, 2, 2]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(26);
  });
  it("meses con 5 semanas de pago suben el monto", () => {
    const m = monthAmounts({ frequency: "weekly", amountCents: 135450, firstPayDate: "2026-01-02", year: 2026 });
    expect(m[0]).toBe(5 * 135450);
    expect(m[1]).toBe(4 * 135450);
  });
  it("una línea que empieza a mitad de año no cuenta antes", () => {
    const m = monthAmounts({ frequency: "monthly", amountCents: 70000, firstPayDate: "2026-10-15", year: 2026 });
    expect(m).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 70000, 70000, 70000]);
  });
  it("año bisiesto: febrero de 2028 tiene 29 días", () => {
    expect(payDatesInMonth("weekly", "2028-02-01", 2028, 2)).toHaveLength(5);
  });
  it("la celda editada a mano gana al cambiar la frecuencia", () => {
    const line: PlanLine = { id: "l", name: "Sueldo", kind: "income", categoryId: "c", year: 2026, frequency: "monthly", amountCents: 541800, firstPayDate: "2026-01-15" };
    const cells = recomputeCells(line, []);
    cells[1] = { ...cells[1], amountCents: 1_020_000, manual: true }; // febrero editado a mano
    const weekly = recomputeCells({ ...line, frequency: "weekly", amountCents: 125000, firstPayDate: "2026-01-02" }, cells);
    expect(weekly[1].amountCents).toBe(1_020_000);
    expect(weekly[0].amountCents).toBe(5 * 125000);
    expect(recomputeCells({ ...line, frequency: "weekly", amountCents: 125000, firstPayDate: "2026-01-02" }, cells, true)[1].amountCents).toBe(4 * 125000);
  });
});

describe("plan 2026 completo (datos del mockup aprobado)", () => {
  const { lines, cells } = buildPlan2026();
  it("totales por mes iguales a los del Inicio del mockup", () => {
    const t = yearTotals(lines, cells);
    expect(t.map((m) => m.income / 100)).toEqual([6463, 17538, 7198, 7598, 7403, 7278, 8778, 7418, 6418, 6418, 6418, 6418]);
    expect(t.map((m) => m.expense / 100)).toEqual([6350, 8293, 7173, 7613, 7358, 7224, 8699, 7339, 6419, 6413, 6323, 6433]);
    expect(t[10].net).toBe(9500); // en noviembre te sobra $95
  });
  it("totales del año", () => {
    const a = annualTotals(lines, cells);
    expect(a.income).toBe(9_534_600);  // $95,346
    expect(a.expense).toBe(8_563_700); // $85,637
    expect(a.net).toBe(970_900);       // te sobra $9,709
  });
  it("proyección: suma el neto de cada mes desde el saldo de las cuentas", () => {
    const p = forecast(739000, lines, cells, 11);
    expect(p.map((x) => x.balanceCents)).toEqual([739000 + 9500, 739000 + 9500 - 1500]);
    const sinViaje = forecast(739000, lines, cells, 11, { off: [lines.find((l) => l.name === "Viaje a Colombia")!.id] });
    expect(sinViaje[1].balanceCents).toBe(739000 + 9500 + 200000 - 1500 + 250000);
  });
});

describe("estado de una línea en el mes", () => {
  it("pendiente, pagado a mano y pagado con movimiento sin contar dos veces", () => {
    expect(lineMonthStatus(4000, [], false).status).toBe("pending");
    expect(lineMonthStatus(4000, [], true)).toMatchObject({ status: "paid_manual", realCents: 4000 });
    // llega el movimiento después de marcarla a mano: cuenta solo el movimiento
    expect(lineMonthStatus(4000, [-4000], true)).toMatchObject({ status: "paid", realCents: 4000 });
  });
  it("pago parcial y pago de más", () => {
    expect(lineMonthStatus(133000, [-67000], false)).toMatchObject({ status: "partial", missingCents: 66000 });
    expect(lineMonthStatus(40000, [-25000, -20000], false).status).toBe("over");
  });
});

describe("cuentas y conciliación", () => {
  const acc = { id: "a", kind: "bank" as const, balanceCents: 500000, balanceDate: "2026-11-01", inNetworth: true, inForecast: true };
  it("saldo esperado = último saldo escrito + movimientos posteriores", () => {
    const txs = [
      { accountId: "a", date: "2026-10-30", amountCents: -99900 }, // anterior: no cuenta
      { accountId: "a", date: "2026-11-03", amountCents: -133000 },
      { accountId: "a", date: "2026-11-15", amountCents: 541800 },
      { accountId: "b", date: "2026-11-15", amountCents: -100 },
    ];
    expect(expectedBalance(acc, txs)).toBe(908800);
    expect(unregistered(900000, 908800)).toBe(-8800); // te faltan $88 por registrar
  });
  it("tarjetas en negativo y empresa fuera del patrimonio", () => {
    expect(netWorth([acc, { ...acc, id: "c", kind: "card", balanceCents: -192000 }, { ...acc, id: "e", kind: "business", balanceCents: 1_000_000, inNetworth: false }])).toBe(308000);
  });
});

describe("metas", () => {
  it("aporte mensual y semanal", () => {
    const g = goalPlan(1_000_000, [200000, 100000, -50000], "2027-04-24", "2026-11-24");
    expect(g.savedCents).toBe(250000);
    expect(g.monthsLeft).toBe(5);
    expect(g.monthlyCents).toBe(150000);
    expect(g.weeklyCents).toBe(Math.ceil((150000 * 12) / 52));
  });
  it("una meta sin fecha no calcula aporte", () => {
    expect(goalPlan(500000, [120000], null, "2026-11-24")).toMatchObject({ monthlyCents: null, progress: 0.24 });
  });
  it("meta cumplida", () => expect(goalPlan(100000, [100000], "2027-01-01", "2026-11-24").reached).toBe(true));
});

describe("deudas", () => {
  it("sin interés: saldo / cuota", () => {
    expect(debtPayoff(700000, 0, 70000, "2026-11-24")).toMatchObject({ months: 10, endDate: "2027-09-24", interestCents: 0 });
  });
  it("con interés tarda más y calcula el interés", () => {
    const p = debtPayoff(192000, 2099, 20000, "2026-11-24");
    expect(p.months).toBe(11);
    expect(p.interestCents).toBeGreaterThan(15000);
  });
  it("una cuota que no cubre el interés nunca termina", () => expect(debtPayoff(1_000_000, 2400, 15000, "2026-11-24").neverEnds).toBe(true));
  it("Afterpay: 4 pagos cada 2 semanas que suman el total", () => {
    const s = bnplSchedule(19999, "2026-11-24");
    expect(s.map((x) => x.date)).toEqual(["2026-11-24", "2026-12-08", "2026-12-22", "2027-01-05"]);
    expect(s.reduce((a, x) => a + x.amountCents, 0)).toBe(19999);
  });
  it("impuestos ABN: solo aplica el % del contador", () => expect(taxToSetAside(1_020_000, 2500)).toBe(255000));
});

describe("diagnóstico", () => {
  const { lines, cells } = buildPlan2026();
  it("5 indicadores de noviembre", () => {
    const nov = yearTotals(lines, cells)[10];
    const d = diagnose({ incomeCents: nov.income, expenseCents: nov.expense, savingCents: 25000 + 200000, debtPaymentsCents: 80000, basicExpensesCents: 202300, emergencyFundCents: 120000, largestIncomeCents: 541800 });
    const by = Object.fromEntries(d.map((x) => [x.key, x]));
    expect(by.surplus.value).toBeCloseTo(95 / 6418, 5);
    expect(by.surplus.level).toBe("warn");
    expect(by.debt.level).toBe("good");
    expect(by.emergency.value).toBeCloseTo(1200 / 2023, 5);
    expect(by.emergency.level).toBe("bad");
    expect(by.dependency.level).toBe("warn");
    expect(priority(d)).toBe("emergency");
  });
  it("sin ingresos no inventa números", () => {
    expect(diagnose({ incomeCents: 0, expenseCents: 0, savingCents: 0, debtPaymentsCents: 0, basicExpensesCents: 0, emergencyFundCents: 0, largestIncomeCents: 0 }).every((x) => x.level === "nodata")).toBe(true);
  });
});

describe("puntos, niveles y racha", () => {
  it("niveles", () => {
    expect(levelFor(0)).toMatchObject({ index: 1, name: "Despertar", toNext: 300 });
    expect(levelFor(340)).toMatchObject({ index: 2, name: "Orden", next: "Ahorro", toNext: 160 });
    expect(levelFor(5000)).toMatchObject({ index: 5, name: "Revolucionario", progress: 1 });
  });
  it("racha semanal con la semana en curso abierta", () => {
    const rows = ["2026-11-09", "2026-11-16", "2026-11-23"].map((weekStart) => ({ weekStart, wildcard: false }));
    expect(streak(rows, "2026-11-23")).toMatchObject({ weeks: 3, thisWeekCounts: true, wildcardAvailable: true });
    expect(streak(rows.slice(0, 2), "2026-11-23")).toMatchObject({ weeks: 2, thisWeekCounts: false });
  });
  it("una semana fallida rompe la racha y el comodín la puede salvar", () => {
    const rows = [{ weekStart: "2026-11-02", wildcard: false }, { weekStart: "2026-11-09", wildcard: false }];
    const s = streak(rows, "2026-11-23");
    expect(s.weeks).toBe(0);
    expect(s.missedWeek).toBe("2026-11-16");
    expect(streak([...rows, { weekStart: "2026-11-16", wildcard: true }], "2026-11-23")).toMatchObject({ weeks: 3, wildcardAvailable: false });
  });
  it("cierres seguidos e insignias", () => {
    expect(consecutiveClosures(["2026-08", "2026-10", "2026-11", "2026-12", "2027-01"])).toBe(4);
    const b = badgeProgress({ lessonsDone: 1, planBuilt: true, closures: 1, consecutiveClosures: 1, debtsPaid: 0, emergencyFundCents: 120000, basicExpensesCents: 170600, goalsDone: 0, bestGoalProgress: 0.47, coursesDone: 0, bestCourseProgress: 0.5, investments: 0 });
    expect(b.play).toBe(1);
    expect(b.shield).toBeCloseTo(0.7034, 3);
    expect(b.flag).toBe(0.47);
    expect(b.flame).toBeCloseTo(1 / 3);
  });
});

describe("movimientos: duplicados, transferencias y unión al plan", () => {
  const a = { accountId: "ubank", date: "2026-11-03", amountCents: -133000, description: "RENT PAYMENT REF 2231" };
  it("duplicado: misma cuenta, mismo monto, a 2 días o menos y descripción parecida", () => {
    expect(findDuplicate({ ...a, date: "2026-11-05", description: "Rent payment ref 2231" }, [a])).not.toBeNull();
    expect(findDuplicate({ ...a, date: "2026-11-06" }, [a])).toBeNull();
    expect(findDuplicate({ ...a, accountId: "nab" }, [a])).toBeNull();
    expect(findDuplicate({ ...a, description: "WOOLWORTHS 1234" }, [a])).toBeNull();
  });
  it("transferencia entre cuentas propias", () => {
    expect(findTransferPair({ ...a, amountCents: -50000 }, [{ accountId: "nab", date: "2026-11-04", amountCents: 50000, description: "Transfer in" }])).not.toBeNull();
  });
  it("sugiere la línea por monto (±5%) y nombre", () => {
    const lines = [
      { id: "home", name: "Home", kind: "expense" as const, plannedCents: 133000, alreadyPaid: false },
      { id: "felix", name: "Felix Mobile", kind: "expense" as const, plannedCents: 4000, alreadyPaid: false },
      { id: "sueldo", name: "Sueldo", kind: "income" as const, plannedCents: 541800, alreadyPaid: false },
    ];
    expect(suggestLine(a, 11, lines)?.id).toBe("home");
    expect(suggestLine({ ...a, amountCents: -4100, description: "FELIX MOBILE PTY" }, 11, lines)?.id).toBe("felix");
    expect(suggestLine({ ...a, amountCents: -9900, description: "KMART" }, 11, lines)).toBeNull();
    expect(suggestLine({ ...a, amountCents: 541800, description: "SALARY ACME" }, 11, lines)?.id).toBe("sueldo");
    expect(suggestLine(a, 8, lines)).toBeNull();
  });
  it("reglas de categoría y división", () => {
    expect(applyRules("WOOLWORTHS 1234 SYDNEY", [{ pattern: "woolworths", c: "super" }])?.c).toBe("super");
    expect(splitIsValid(-8600, [-5000, -3600])).toBe(true);
    expect(splitIsValid(-8600, [-5000, -3000])).toBe(false);
  });
});

describe("importar CSV", () => {
  it("adivina columnas con encabezado (estilo Ubank)", () => {
    const rows = parseCsv('Date,Description,Debit,Credit,Balance\n03/11/2026,"RENT PAYMENT, REF 2231","1,330.00",,5088.00\n15/11/2026,SALARY,,5418.00,10506.00\n');
    const m = guessMapping(rows);
    expect(m).toMatchObject({ hasHeader: true, date: 0, description: 1, debit: 2, credit: 3, balance: 4, dateFormat: "DMY" });
    const r = mapRows(rows, m);
    expect(r.rows.map((x) => x.amountCents)).toEqual([-133000, 541800]);
    expect(r.rows[0].description).toBe("RENT PAYMENT, REF 2231");
    expect(closingBalance(r.rows)).toBe(1050600);
  });
  it("adivina columnas sin encabezado (estilo NAB)", () => {
    const rows = parseCsv("24 Nov 26,-86.00,,,MISCELLANEOUS DEBIT,WOOLWORTHS 1234,4914.00\n23 Nov 26,1540.00,,,TRANSFER CREDIT,Sueldo,5000.00\n");
    const m = guessMapping(rows);
    expect(m.hasHeader).toBe(false);
    expect(m.date).toBe(0);
    expect(m.amount).toBe(1);
    const r = mapRows(rows, m);
    expect(r.rows[0]).toMatchObject({ date: "2026-11-24", amountCents: -8600 });
  });
  it("saldo final según el orden del archivo", () => {
    const asc = mapRows(parseCsv("Date,Description,Amount,Balance\n01/11/2026,A,-10,90\n03/11/2026,B,-5,85\n03/11/2026,C,-5,80\n"), guessMapping(parseCsv("Date,Description,Amount,Balance\n01/11/2026,A,-10,90\n")));
    expect(closingBalance(asc.rows)).toBe(8000);
    const desc = mapRows(parseCsv("Date,Description,Amount,Balance\n03/11/2026,C,-5,80\n03/11/2026,B,-5,85\n01/11/2026,A,-10,90\n"), guessMapping(parseCsv("Date,Description,Amount,Balance\n01/11/2026,A,-10,90\n")));
    expect(closingBalance(desc.rows)).toBe(8000);
  });
  it("sin encabezado adivina la columna de saldo", () => {
    const rows = parseCsv("24 Nov 26,-86.00,,,MISCELLANEOUS DEBIT,WOOLWORTHS 1234,4914.00\n23 Nov 26,1540.00,,,TRANSFER CREDIT,Sueldo,5000.00\n");
    const m = guessMapping(rows);
    expect(m.balance).toBe(6);
    expect(mappingWorks(rows, m)).toBe(true);
    expect(mappingWorks([["hola", "mundo"], ["x", "y"]], guessMapping([["hola", "mundo"], ["x", "y"]]))).toBe(false);
  });
  it("fechas", () => {
    expect(parseDate("2026-11-24", "YMD")).toBe("2026-11-24");
    expect(parseDate("11/24/2026", "MDY")).toBe("2026-11-24");
    expect(parseDate("31/02/2026", "DMY")).toBeNull();
  });
});

describe("planes y accesos", () => {
  const base = { trialEndsAt: null, proUntil: null, accessUntil: null };
  const now = new Date("2026-11-24T00:00:00Z");
  it("qué ve cada estado", () => {
    expect(tierOf({ ...base, state: "free" }, now)).toBe("free");
    expect(tierOf({ ...base, state: "trial", trialEndsAt: "2026-12-01T00:00:00Z" }, now)).toBe("pro");
    expect(tierOf({ ...base, state: "trial", trialEndsAt: "2026-11-01T00:00:00Z" }, now)).toBe("free");
    expect(tierOf({ ...base, state: "alumno" }, now)).toBe("pro"); // de por vida
    expect(tierOf({ ...base, state: "alumno", accessUntil: "2026-11-01T00:00:00Z" }, now)).toBe("free");
    expect(tierOf({ ...base, state: "fundador" }, now)).toBe("pro");
  });
  it("a qué pasa al vencer", () => {
    expect(nextStateOnExpiry({ ...base, state: "alumno", accessUntil: "2026-11-01T00:00:00Z" }, now)).toBe("free");
    expect(nextStateOnExpiry({ ...base, state: "pro", proUntil: "2026-11-01T00:00:00Z" }, now)).toBe("read_only");
    expect(nextStateOnExpiry({ ...base, state: "trial", trialEndsAt: "2026-11-01T00:00:00Z" }, now)).toBe("free");
  });
  it("las funciones Pro salen de la configuración", () => {
    expect(hasFeature("ana", "free", { ana: "pro" })).toBe(false);
    expect(hasFeature("ana", "free", { ana: "free" })).toBe(true);
    expect(hasFeature("ana", "pro", { ana: "pro" })).toBe(true);
  });
});
