import { describe, expect, it } from "vitest";
import { closingBalance, DEFAULT_MATCH, guessMapping, mapRows, parseCsv } from "@/lib/engine";
import {
  appBalanceAt, cardBalance, categoryFor, chunk, classifyRows, cleanDescription, countMatches, dateRange, fileProblem, formatFits,
  headerSignature, lineForYear, merchantKey, missingRoles, patternOf, reconcile, repeatedDescriptions, rolesFromMapping,
  setRole, suggestFor, totals, type Existing, type LineCand, type RuleLite, type SavedFormat,
} from "@/app/(app)/movimientos/importar/lib";

// Estilo Ubank: con encabezado, débito y crédito en columnas separadas, el más nuevo primero.
const UBANK = [
  "Date,Description,Debit,Credit,Balance",
  '22/11/2026,WOOLWORTHS 1234 SYDNEY,86.40,,"2,340.10"',
  '21/11/2026,MCDONALDS PARRAMATTA,18.50,,"2,426.50"',
  '21/11/2026,SALARY EASY AUSSIE PTY,,1540.00,"2,445.00"',
  "20/11/2026,TRANSFER TO NAB CARD,500.00,,905.00",
  '20/11/2026,OPAL TRAVEL,50.00,,"1,405.00"',
  "xx/11/2026,FECHA ROTA,10.00,,1395.00",
  "19/11/2026,SIN MONTO,,,1395.00",
].join("\n");

// Estilo NAB: sin encabezado, un monto con signo, tipo de movimiento y descripción, saldo al final.
const NAB = [
  "22 Nov 26,-86.40,,,CARD PURCHASE,WOOLWORTHS 1234 SYDNEY,2340.10",
  "21 Nov 26,1540.00,,,SALARY,SALARY EASY AUSSIE PTY,2426.50",
  "20 Nov 26,-50.00,,,CARD PURCHASE,OPAL TRAVEL,886.50",
].join("\r\n");

const ACC = "acc-ubank", NABACC = "acc-nab";
const ubankRows = () => { const raw = parseCsv(UBANK); return mapRows(raw, guessMapping(raw)); };

describe("archivo", () => {
  it("solo .csv y hasta 5 MB", () => {
    expect(fileProblem("ubank.CSV", 1000)).toBeNull();
    expect(fileProblem("extracto.xlsx", 1000)).toBe("type");
    expect(fileProblem("big.csv", 5 * 1024 * 1024 + 1)).toBe("size");
    expect(fileProblem("vacio.csv", 0)).toBe("empty");
  });
});

describe("Ubank: encabezado y débito/crédito", () => {
  it("adivina columnas, convierte montos con signo y descarta filas sin fecha o sin monto", () => {
    const raw = parseCsv(UBANK);
    const m = guessMapping(raw);
    expect(m).toMatchObject({ hasHeader: true, date: 0, description: 1, amount: null, debit: 2, credit: 3, balance: 4, dateFormat: "DMY" });
    const r = mapRows(raw, m);
    expect(r.rows.map((x) => x.amountCents)).toEqual([-8640, -1850, 154000, -50000, -5000]);
    expect(r.skipped).toEqual([{ line: 7, reason: "date" }, { line: 8, reason: "amount" }]);
    expect(closingBalance(r.rows)).toBe(234010);
    expect(dateRange(r.rows)).toEqual({ from: "2026-11-20", to: "2026-11-22" });
  });
});

describe("NAB: sin encabezado", () => {
  it("adivina fecha, monto, descripción y saldo", () => {
    const raw = parseCsv(NAB);
    const m = guessMapping(raw);
    expect(m).toMatchObject({ hasHeader: false, date: 0, amount: 1, description: 5, balance: 6 });
    const r = mapRows(raw, m);
    expect(r.rows.map((x) => [x.date, x.amountCents])).toEqual([["2026-11-22", -8640], ["2026-11-21", 154000], ["2026-11-20", -5000]]);
    expect(closingBalance(r.rows)).toBe(234010);
  });
  it("invertir signo: tarjetas que muestran el gasto en positivo", () => {
    const raw = parseCsv("22/11/2026,NETFLIX.COM,18.99");
    const m = { ...guessMapping(raw), invert: true };
    expect(mapRows(raw, m).rows[0].amountCents).toBe(-1899);
  });
});

describe("columnas", () => {
  it("cada papel es único y Monto (+/-) no convive con Salida/Entrada", () => {
    const roles = rolesFromMapping(guessMapping(parseCsv(UBANK)), 5);
    expect(roles).toEqual(["date", "description", "debit", "credit", "balance"]);
    expect(setRole(roles, 4, "date")).toEqual(["ignore", "description", "debit", "credit", "date"]);
    expect(setRole(roles, 4, "amount")).toEqual(["date", "description", "ignore", "ignore", "amount"]);
  });
  it("dice qué falta", () => {
    expect(missingRoles(["date", "description", "debit", "ignore"])).toEqual([]);
    expect(missingRoles(["ignore", "description", "ignore"])).toEqual(["date", "amount"]);
  });
});

describe("formato guardado del banco", () => {
  const raw = parseCsv(UBANK);
  const saved: SavedFormat = { ...guessMapping(raw), headers: headerSignature(raw, true), columns: 5 };
  it("sirve si el archivo es igual", () => expect(formatFits(saved, raw)).toBe(true));
  it("no sirve si el banco cambió el encabezado", () => {
    const changed = parseCsv(UBANK.replace("Date,Description,Debit,Credit,Balance", "Date,Details,Money out,Money in,Balance"));
    expect(formatFits(saved, changed)).toBe(false);
  });
  it("no sirve para un archivo con otra forma (NAB) ni si faltan columnas", () => {
    expect(formatFits(saved, parseCsv(NAB))).toBe(false);
    expect(formatFits({ ...saved, balance: 9 }, raw)).toBe(false);
  });
});

describe("revisión: nueva, duplicado o transferencia", () => {
  const ex = (o: Partial<Existing> & { id: string; amountCents: number }): Existing => ({ accountId: ACC, date: "2026-11-21", description: "", paired: false, ...o });

  it("marca el duplicado (desmarcado por defecto) y la transferencia con su pareja", () => {
    const existing = [
      ex({ id: "manual-woolies", amountCents: -8640, date: "2026-11-21", description: "Woolworths Sydney" }),
      ex({ id: "nab-in", accountId: NABACC, amountCents: 50000, date: "2026-11-21", description: "Pago tarjeta" }),
      ex({ id: "otra-cuenta-igual", accountId: NABACC, amountCents: -1850, date: "2026-11-21", description: "MCDONALDS PARRAMATTA" }),
    ];
    const out = classifyRows(ubankRows().rows, ACC, existing, DEFAULT_MATCH);
    expect(out.map((r) => r.flag)).toEqual(["dup", "new", "new", "transfer", "new"]);
    expect(out[0]).toMatchObject({ include: false, dupOf: { date: "2026-11-21", description: "Woolworths Sydney" } });
    expect(out[3]).toMatchObject({ include: true, pairId: "nab-in", pairAccountId: NABACC });
  });

  it("cada movimiento existente se usa una sola vez", () => {
    const rows = [
      { line: 2, date: "2026-11-10", description: "COFFEE CLUB", amountCents: -550, balanceCents: null },
      { line: 3, date: "2026-11-10", description: "COFFEE CLUB", amountCents: -550, balanceCents: null },
      { line: 4, date: "2026-11-11", description: "TRANSFER", amountCents: -10000, balanceCents: null },
      { line: 5, date: "2026-11-11", description: "TRANSFER", amountCents: -10000, balanceCents: null },
    ];
    const existing = [
      ex({ id: "cafe", amountCents: -550, date: "2026-11-10", description: "Coffee Club" }),
      ex({ id: "save-in", accountId: "acc-save", amountCents: 10000, date: "2026-11-11" }),
    ];
    expect(classifyRows(rows, ACC, existing, DEFAULT_MATCH).map((r) => r.flag)).toEqual(["dup", "new", "transfer", "new"]);
  });

  it("no une a un movimiento que ya tiene pareja ni a uno de la misma cuenta", () => {
    const rows = [{ line: 2, date: "2026-11-11", description: "TRANSFER", amountCents: -10000, balanceCents: null }];
    const existing = [ex({ id: "ya", accountId: "acc-save", amountCents: 10000, date: "2026-11-11", paired: true }), ex({ id: "misma", amountCents: 10000, date: "2026-11-11" })];
    expect(classifyRows(rows, ACC, existing, DEFAULT_MATCH)[0].flag).toBe("new");
  });
});

describe("lotes de máximo 500", () => {
  it.each([[0, []], [1, [1]], [500, [500]], [501, [500, 1]], [1200, [500, 500, 200]]])("%i filas", (n, sizes) => {
    const batches = chunk(Array.from({ length: n as number }, (_, i) => i));
    expect(batches.map((b) => b.length)).toEqual(sizes);
    expect(batches.flat()).toHaveLength(n as number);
  });
});

describe("conciliación de saldo", () => {
  const rows = ubankRows().rows;
  const closing = closingBalance(rows);

  it("cuadra: saldo escrito antes del archivo + lo importado", () => {
    const acc = { id: ACC, kind: "bank", balanceCents: 145500, balanceDate: "2026-11-19" };
    const app = appBalanceAt(acc, [], rows, "2026-11-22");
    expect(app).toBe(234010);
    expect(reconcile(closing, "bank", app)).toEqual({ status: "ok", fileCents: 234010 });
  });

  it("no cuadra: muestra la diferencia", () => {
    const acc = { id: ACC, kind: "bank", balanceCents: 145500, balanceDate: "2026-11-19" };
    const app = appBalanceAt(acc, [], rows.filter((r) => r.amountCents !== -1850), "2026-11-22");
    expect(reconcile(closing, "bank", app)).toEqual({ status: "diff", fileCents: 234010, appCents: 235860, diffCents: -1850 });
  });

  it("lo fechado el mismo día del saldo escrito o antes no se suma otra vez", () => {
    const acc = { id: ACC, kind: "bank", balanceCents: 90500, balanceDate: "2026-11-20" };
    expect(appBalanceAt(acc, [], rows, "2026-11-22")).toBe(234010);
  });

  it("saldo escrito después del archivo: se descuenta lo que pasó entre medio", () => {
    const acc = { id: ACC, kind: "bank", balanceCents: 230000, balanceDate: "2026-11-25" };
    expect(appBalanceAt(acc, [{ date: "2026-11-24", amountCents: -4010 }, { date: "2026-11-26", amountCents: -999 }], rows, "2026-11-22")).toBe(234010);
  });

  it("sin columna de saldo no hay con qué comparar", () => {
    expect(reconcile(null, "bank", 1000)).toEqual({ status: "none" });
  });

  it("tarjeta: el saldo del archivo en positivo es deuda (negativo en la app)", () => {
    expect(cardBalance("card", 50000)).toBe(-50000);
    expect(cardBalance("bank", 50000)).toBe(50000);
    expect(reconcile(50000, "card", -50000)).toEqual({ status: "ok", fileCents: -50000 });
  });
});

describe("categorías, reglas y líneas", () => {
  const rules: RuleLite[] = [
    { key: "r1", pattern: "woolworths", categoryId: "super", lineId: null, on: true },
    { key: "r2", pattern: "opal", categoryId: "transporte", lineId: null, on: false },
  ];
  it("la elección a mano gana; si no, la primera regla activa", () => {
    expect(categoryFor("WOOLWORTHS 1234 SYDNEY", undefined, rules)).toBe("super");
    expect(categoryFor("WOOLWORTHS 1234 SYDNEY", null, rules)).toBeNull();
    expect(categoryFor("WOOLWORTHS 1234 SYDNEY", "comida", rules)).toBe("comida");
    expect(categoryFor("OPAL TRAVEL", undefined, rules)).toBeNull(); // regla apagada
  });
  it("sugiere reglas para lo que se repite y no tiene regla", () => {
    expect(merchantKey("GELATO MESSINA 0042 DARLINGHURST")).toBe("gelato messina");
    const descs = ["GELATO MESSINA 1", "GELATO MESSINA 2", "WOOLWORTHS 1234", "WOOLWORTHS 99", "NETFLIX.COM"];
    expect(repeatedDescriptions(descs, rules)).toEqual([{ pattern: "gelato messina", n: 2 }]);
    expect(countMatches("WOOLWORTHS", descs)).toBe(2);
    expect(patternOf("Co")).toBeNull();
    expect(patternOf("  COLES ")).toBe("coles");
  });
  it("sugiere la línea del plan una sola vez por mes", () => {
    const lines: LineCand[] = [{ id: "l-sueldo", name: "Sueldo", kind: "income", plannedCents: 154000, alreadyPaid: false, categoryId: "ingreso", year: 2026, month: 11 }];
    const row = { date: "2026-11-21", amountCents: 154000, description: "SALARY EASY AUSSIE PTY" };
    expect(suggestFor(row, ACC, lines, new Set(), DEFAULT_MATCH)?.id).toBe("l-sueldo");
    expect(suggestFor(row, ACC, lines, new Set(["l-sueldo:11"]), DEFAULT_MATCH)).toBeNull();
  });
  it("la línea de una regla se busca por nombre en el plan del año del movimiento", () => {
    const lines: LineCand[] = [{ id: "l-2027", name: "Arriendo", kind: "expense", plannedCents: 133000, alreadyPaid: false, categoryId: "hogar", year: 2027, month: 1 }];
    const ruleLines = { "l-2026": { name: "Arriendo", categoryId: "hogar", year: 2026 } };
    expect(lineForYear("l-2026", 2027, ruleLines, lines)?.id).toBe("l-2027");
    expect(lineForYear("l-2026", 2028, ruleLines, lines)).toBeNull();
  });
});

describe("resumen y descripción", () => {
  it("entró y salió sin contar transferencias", () => {
    expect(totals([{ amountCents: 154000, flag: "new" }, { amountCents: -8640, flag: "new" }, { amountCents: -50000, flag: "transfer" }])).toEqual({ inCents: 154000, outCents: 8640 });
  });
  it("limpia números de tarjeta, fechas valor y referencias largas", () => {
    expect(cleanDescription("WOOLWORTHS 1234 SYDNEY  Card xx4821 Value Date: 21/11/2026")).toBe("WOOLWORTHS 1234 SYDNEY");
    expect(cleanDescription("TRANSFER TO NAB CARD Receipt 98765432")).toBe("TRANSFER TO NAB CARD");
    expect(cleanDescription("123456789")).toBe("123456789");
  });
});

describe("saldo final del archivo (closingBalance del motor)", () => {
  const row = (line: number, date: string, bal: number) => ({ line, date, description: "X", amountCents: -100, balanceCents: bal });
  it("del más nuevo al más viejo: la primera fila del último día", () => {
    expect(closingBalance([row(2, "2026-11-22", 900), row(3, "2026-11-22", 1000), row(4, "2026-11-21", 1100)])).toBe(900);
  });
  it("del más viejo al más nuevo: la última fila del último día", () => {
    expect(closingBalance([row(2, "2026-11-21", 1100), row(3, "2026-11-22", 1000), row(4, "2026-11-22", 900)])).toBe(900);
  });
  it("sin saldo en el archivo: null", () => {
    expect(closingBalance([{ ...row(2, "2026-11-22", 0), balanceCents: null }])).toBeNull();
  });
});
