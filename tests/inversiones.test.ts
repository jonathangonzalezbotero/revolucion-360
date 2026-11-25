// Inversiones por activo (src/lib/engine/inversiones.ts). Fixtures: los activos del mockup Inversiones.dc.html.
import { describe, expect, it } from "vitest";
import {
  carryLine, computeHolding, decFromDb, decToDb, DEC_ONE, formatDec, groupAssets, mulToCents, parseDecimal, parseUnitPrice,
  portfolioTotals, qtyFor, recurringDue, sortOps, tickerOf, tracksUnits, type AssetOp, type AssetState,
} from "@/lib/engine/inversiones";
import { parseMoney } from "@/lib/engine";
import { centsInputText, formatAvgPrice, formatUnitPrice, priceInputText, resultText } from "@/app/(app)/inversiones/lib";

const d = (s: string) => {
  const v = parseDecimal(s);
  if (v === null) throw new Error(`no es número: ${s}`);
  return v;
};
const price = (s: string) => parseUnitPrice(s) as bigint;
let n = 0;
const op = (kind: AssetOp["kind"], date: string, qty: string | null, amountCents: number, createdAt?: string): AssetOp =>
  ({ id: `op${++n}`, date, kind, qty: qty === null ? null : d(qty), amountCents, createdAt });
/** Compra por unidades: el monto se redondea UNA vez al registrarla (cantidad × precio). */
const buy = (date: string, qty: string, p: string) => op("buy", date, qty, mulToCents(d(qty), price(p)));
const sell = (date: string, qty: string, p: string) => op("sell", date, qty, mulToCents(d(qty), price(p)));
const units = (o: Partial<AssetState>): AssetState => ({ byUnits: true, unitPriceCents: null, balanceCents: null, priceDate: null, ops: [], ...o });
const saldo = (o: Partial<AssetState>): AssetState => ({ byUnits: false, unitPriceCents: null, balanceCents: null, priceDate: null, ops: [], ...o });

describe("inversiones: decimales sin flotantes", () => {
  it("lee cantidades y precios como los escribe la persona", () => {
    expect(decToDb(d("2.125"))).toBe("2.125");
    expect(decToDb(d("0.012"))).toBe("0.012");
    expect(decToDb(d("0,22"))).toBe("0.22");
    expect(decToDb(d("1,234.5"))).toBe("1234.5");
    expect(decToDb(d("1.234,5"))).toBe("1234.5");
    expect(decToDb(d("1,234"))).toBe("1234");          // en-AU: coma de miles
    expect(decToDb(parseDecimal("1,234", "es-CO") as bigint)).toBe("1.234"); // país con coma decimal
    expect(decToDb(parseDecimal("97.000", "es-CO") as bigint)).toBe("97000"); // y punto de miles (como parseMoney)
    expect(decToDb(parseDecimal("0.012", "es-CO") as bigint)).toBe("0.012");
    expect(decToDb(d("97,000"))).toBe("97000");
    expect(decToDb(d("$552.10"))).toBe("552.1");
    expect(decToDb(d("0.00000001"))).toBe("0.00000001"); // 1 satoshi
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal("-1")).toBeNull();
    expect(parseDecimal("1.2.3,4")).toBe(d("123.4"));
  });

  it("0.1 + 0.2 da 0.3 exacto (con flotantes daría 0.30000000000000004)", () => {
    expect(decToDb(d("0.1") + d("0.2"))).toBe("0.3");
  });

  it("ida y vuelta con la base (numeric como texto)", () => {
    expect(decFromDb("0.0120000000")).toBe(d("0.012"));
    expect(decFromDb("2.5700000000")).toBe(d("2.57"));
    expect(decFromDb(0.012)).toBe(d("0.012"));            // si llegara como número
    expect(decFromDb(null)).toBeNull();
    expect(decFromDb("1.00000000005")).toBe(d("1.0000000001")); // más de 10 decimales: redondea
    expect(decToDb(DEC_ONE * BigInt(3))).toBe("3");
  });

  it("muestra la cantidad con los separadores del país", () => {
    expect(formatDec(d("2.57"))).toBe("2.57");
    expect(formatDec(d("1250"))).toBe("1,250");
    expect(formatDec(d("0.012"))).toBe("0.012");
    expect(formatDec(d("0.123456789"), "en-AU", 4)).toBe("0.1235");
    expect(formatDec(d("1250.5"), "es-CO")).toBe("1.250,5");
  });

  it("cantidad × precio a centavos, y monto ÷ precio a cantidad", () => {
    expect(mulToCents(d("0.22"), price("545"))).toBe(11_990);
    expect(mulToCents(d("0.23"), price("521.70"))).toBe(11_999);   // 119.991 → 119.99
    expect(mulToCents(d("0.012"), price("75,000"))).toBe(90_000);
    expect(mulToCents(d("1000000"), price("0.0004"))).toBe(40_000); // precio con fracción de centavo
    expect(qtyFor(12_000, price("545"))).toBe(d("0.2201834862"));
    expect(qtyFor(12_000, BigInt(0))).toBeNull();
  });
});

describe("inversiones: un activo por unidades", () => {
  it("VOO del mockup: 2.57 acciones, has puesto $1,236.29, vale $1,418.90, +$182.61 (+14.8%)", () => {
    const h = computeHolding(units({
      unitPriceCents: price("552.10"), priceDate: "2026-11-20",
      ops: [buy("2026-09-01", "2.12", "470"), buy("2026-10-01", "0.23", "521.70"), op("dividend", "2026-09-28", null, 1_460), buy("2026-11-01", "0.22", "545")],
    }));
    expect(decToDb(h.qty)).toBe("2.57");
    expect(h.costCents).toBe(123_629);
    expect(h.valueCents).toBe(141_890); // en el mockup, redondeado: $1,419
    expect(h.gainCents).toBe(18_261);   // +$183
    expect(+(h.gainPct * 100).toFixed(1)).toBe(14.8);
    expect(h.dividendsCents).toBe(1_460);
    expect(h.avgCostCents !== null && formatDec(h.avgCostCents / BigInt(100), "en-AU", 2)).toBe("481.05"); // $481.05 por acción
    expect(h.hasPrice).toBe(true);
  });

  it("IVV del mockup: 20 a $52.10 y vende 5 → quedan 15 con costo $781.50 (al costo promedio)", () => {
    const h = computeHolding(units({ unitPriceCents: price("61.40"), ops: [buy("2026-03-15", "20", "52.10"), sell("2026-08-02", "5", "58.90")] }));
    expect(decToDb(h.qty)).toBe("15");
    expect(h.costCents).toBe(78_150);
    expect(h.realizedCents).toBe(29_450 - 26_050); // vendió en $294.50 lo que le costó $260.50
    expect(h.valueCents).toBe(92_100);
    expect(h.gainCents).toBe(13_950);
  });

  it("vender todo deja el costo en 0 exacto aunque el promedio tenga decimales infinitos", () => {
    const h = computeHolding(units({
      unitPriceCents: price("10"),
      ops: [op("buy", "2026-01-01", "3", 1_000), op("sell", "2026-02-01", "1", 400), op("sell", "2026-03-01", "2", 800)],
    }));
    expect(h.qty).toBe(BigInt(0));
    expect(h.costCents).toBe(0);
    expect(h.realizedCents).toBe(200);
    expect(h.avgCostCents).toBeNull();
  });

  it("las ventas se aplican en orden de fecha, no en el orden en que llegan", () => {
    const a = computeHolding(units({ ops: [sell("2026-05-01", "1", "10"), buy("2026-01-01", "2", "5")] }));
    expect(decToDb(a.qty)).toBe("1");
    expect(a.costCents).toBe(500);
    expect(a.oversold).toBe(false);
  });

  it("vender más de lo que tenías se marca y solo saca lo que había", () => {
    const h = computeHolding(units({ ops: [buy("2026-01-01", "1", "10"), sell("2026-02-01", "3", "10")] }));
    expect(h.oversold).toBe(true);
    expect(h.qty).toBe(BigInt(0));
    expect(h.costCents).toBe(0);
  });

  it("cripto con muchos decimales: 0.012 BTC a $75,000, hoy a $97,000", () => {
    const h = computeHolding(units({ unitPriceCents: price("97,000"), ops: [buy("2026-02-10", "0.012", "75,000")] }));
    expect(h.costCents).toBe(90_000);
    expect(h.valueCents).toBe(116_400);
    expect(h.gainPct).toBeCloseTo(26_400 / 90_000);
  });

  it("sin precio de hoy vale lo que pusiste: resultado 0, nunca −100 %", () => {
    const h = computeHolding(units({ ops: [buy("2026-01-01", "2", "50")] }));
    expect(h.hasPrice).toBe(false);
    expect(h.valueCents).toBe(10_000);
    expect(h.gainCents).toBe(0);
  });

  it("sin operaciones: todo en 0 y sin división entre cero", () => {
    const h = computeHolding(units({ unitPriceCents: price("10") }));
    expect(h).toMatchObject({ costCents: 0, valueCents: 0, gainCents: 0, gainPct: 0, dividendsCents: 0, avgCostCents: null });
  });
});

describe("inversiones: un activo por saldo (super, fondo, propiedad)", () => {
  it("vale el saldo escrito; lo de antes de esa fecha ya está dentro", () => {
    const h = computeHolding(saldo({ balanceCents: 4_820_000, priceDate: "2026-09-30", ops: [op("buy", "2026-01-01", null, 4_100_000)] }));
    expect(h.valueCents).toBe(4_820_000);
    expect(h.costCents).toBe(4_100_000);
    expect(h.gainCents).toBe(720_000);
  });

  it("aportes y retiros después del saldo escrito se suman y restan (saldo esperado)", () => {
    const h = computeHolding(saldo({
      balanceCents: 238_000, priceDate: "2026-11-01",
      ops: [op("buy", "2026-10-01", null, 210_000), op("buy", "2026-11-15", null, 10_000), op("sell", "2026-11-20", null, 5_000)],
    }));
    expect(h.valueCents).toBe(243_000);
    expect(h.costCents).toBe(215_000);
  });

  it("el mismo día del saldo: desempata la hora en que se registró", () => {
    const base = { balanceCents: 100_000, priceDate: "2026-11-20", priceAt: "2026-11-20T10:00:00Z" };
    const antes = computeHolding(saldo({ ...base, ops: [op("buy", "2026-11-20", null, 5_000, "2026-11-20T09:00:00Z")] }));
    const despues = computeHolding(saldo({ ...base, ops: [op("buy", "2026-11-20", null, 5_000, "2026-11-20T11:00:00Z")] }));
    expect(antes.valueCents).toBe(100_000);
    expect(despues.valueCents).toBe(105_000);
  });

  it("un retiro resta de lo puesto sin bajar de 0", () => {
    const h = computeHolding(saldo({ ops: [op("buy", "2026-01-01", null, 1_000), op("sell", "2026-02-01", null, 3_000)] }));
    expect(h.costCents).toBe(0);
    expect(h.valueCents).toBe(0);
  });

  it("sin saldo escrito vale lo que pusiste (como quedó lo copiado de la versión anterior sin valor)", () => {
    const h = computeHolding(saldo({ ops: [op("buy", "2026-01-01", null, 50_000)] }));
    expect(h.valueCents).toBe(50_000);
    expect(h.hasPrice).toBe(false);
  });
});

describe("inversiones: totales y vistas", () => {
  it("totales: vale hoy, has puesto, resultado y dividendos", () => {
    const t = portfolioTotals([
      { valueCents: 141_890, costCents: 123_629, dividendsCents: 1_460 },
      { valueCents: 92_100, costCents: 78_150, dividendsCents: 0 },
    ]);
    expect(t).toMatchObject({ valueCents: 233_990, costCents: 201_779, gainCents: 32_211, dividendsCents: 1_460 });
    expect(t.gainPct).toBeCloseTo(32_211 / 201_779);
    expect(portfolioTotals([])).toEqual({ valueCents: 0, costCents: 0, gainCents: 0, gainPct: 0, dividendsCents: 0 });
  });

  it("agrupa por plataforma o por tipo, de mayor a menor, con su parte del total", () => {
    const g = groupAssets([
      { key: "etf", valueCents: 300, costCents: 200 },
      { key: "crypto", valueCents: 100, costCents: 150 },
      { key: "etf", valueCents: 100, costCents: 100 },
    ]);
    expect(g).toEqual([
      { key: "etf", n: 2, valueCents: 400, costCents: 300, gainCents: 100, gainPct: 1 / 3, share: 0.8 },
      { key: "crypto", n: 1, valueCents: 100, costCents: 150, gainCents: -50, gainPct: -1 / 3, share: 0.2 },
    ]);
    expect(groupAssets([{ key: "x", valueCents: 0, costCents: 0 }])[0].share).toBe(0);
  });

  it("tipos que se siguen por unidades", () => {
    expect(["etf", "stocks", "crypto"].every((k) => tracksUnits(k as never))).toBe(true);
    expect(["fund", "retirement", "property", "other"].some((k) => tracksUnits(k as never))).toBe(false);
  });

  it("el cuadrito del activo", () => {
    expect(tickerOf("VOO")).toBe("VOO");
    expect(tickerOf("Super")).toBe("Super");
    expect(tickerOf("AustralianSuper Balanced")).toBe("AB");
    expect(tickerOf("Bitcoin")).toBe("Bitc");
    expect(tickerOf(" ")).toBe("?");
  });

  it("ordena operaciones por fecha y luego por cuándo se registraron", () => {
    const xs = sortOps([
      { id: "b", date: "2026-02-01", createdAt: "2" }, { id: "a", date: "2026-02-01", createdAt: "1" }, { id: "c", date: "2026-01-01" },
    ]);
    expect(xs.map((x) => x.id)).toEqual(["c", "a", "b"]);
  });
});

describe("inversiones: compras recurrentes del plan", () => {
  const cells = (m: number) => (m === 5 ? 0 : m === 7 ? 15_000 : 12_000);
  it("una compra por mes con el monto de la celda, desde que se ligó y hasta hoy, sin repetir", () => {
    const due = recurringDue({ year: 2026, frequency: "monthly", firstPayDate: "2026-01-01", monthCents: cells, from: "2026-04-10", today: "2026-11-24", done: new Set(["2026-06"]) });
    // abril (día 1) es antes de ligarla; mayo en 0; junio ya está; diciembre aún no llega
    expect(due.map((x) => x.month)).toEqual(["2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(due[0]).toEqual({ month: "2026-07", date: "2026-07-01", amountCents: 15_000 });
  });

  it("el día de pago sale de la línea; si este mes aún no llega, no se suma", () => {
    const due = recurringDue({ year: 2026, frequency: "monthly", firstPayDate: "2026-01-28", monthCents: () => 12_000, from: "2026-10-01", today: "2026-11-24", done: new Set() });
    expect(due).toEqual([{ month: "2026-10", date: "2026-10-28", amountCents: 12_000 }]);
  });

  it("quincenal: un registro por mes con el total de la celda, en el primer pago del mes", () => {
    const due = recurringDue({ year: 2026, frequency: "fortnightly", firstPayDate: "2026-01-02", monthCents: () => 24_000, from: "2026-11-01", today: "2026-11-30", done: new Set() });
    expect(due).toEqual([{ month: "2026-11", date: "2026-11-06", amountCents: 24_000 }]);
  });

  it("cambio de año: encuentra la línea copiada con el mismo nombre y categoría", () => {
    const old = { id: "l25", name: "Investment S&P500", categoryId: "c1", year: 2026 };
    const now = [{ id: "x", name: "Investment S&P500", categoryId: "c2", year: 2027 }, { id: "l27", name: "investment s&p500 ", categoryId: "c1", year: 2027 }];
    expect(carryLine(old, now)?.id).toBe("l27");
    expect(carryLine(old, [])).toBeNull();
  });
});

describe("inversiones: lo que muestra la pantalla", () => {
  const AUD = { currency: "AUD", numberLocale: "en-AU" };
  const COP = { currency: "COP", numberLocale: "es-CO" };

  it("costo promedio a centavos (VOO: $481.05), con más decimales solo si es menos de 1 centavo", () => {
    const voo = computeHolding(units({ unitPriceCents: price("552.10"), ops: [buy("2026-09-01", "2.12", "470"), buy("2026-10-01", "0.23", "521.70"), buy("2026-11-01", "0.22", "545")] }));
    expect(formatAvgPrice(voo.avgCostCents as bigint, AUD)).toBe("$481.05");
    expect(formatAvgPrice(price("0.0004"), AUD)).toBe("$0.0004");
    expect(formatAvgPrice(price("75,000"), AUD)).toBe("$75,000.00");
    expect(formatUnitPrice(price("545"), AUD)).toBe("$545");
  });

  it("el precio que se pone en el campo vuelve a leerse igual", () => {
    for (const p of ["552.10", "0.0004", "97,000", "1.125"]) {
      expect(parseUnitPrice(priceInputText(price(p)))).toBe(price(p));
    }
    expect(priceInputText(price("552.1"))).toBe("552.10");
    const cop = parseUnitPrice("1,125", "es-CO") as bigint; // $1,125 en es-CO = 1.125
    expect(priceInputText(cop, "es-CO")).toBe("1,125");
    expect(parseUnitPrice(priceInputText(cop, "es-CO"), "es-CO")).toBe(cop);
  });

  it("el saldo que se pone en el campo vuelve a leerse igual", () => {
    for (const c of [4_820_000, 238_050, 5, 0]) expect(parseMoney(centsInputText(c))).toBe(c);
  });

  it("resultado como en el mockup: monto con signo y %", () => {
    expect(resultText(18_261, 123_629, AUD)).toBe("+$182.61 (+14.8%)");
    expect(resultText(-5_000, 100_000, AUD)).toBe("−$50 (−5.0%)");
    expect(resultText(0, 0, AUD)).toBe("$0");
    expect(resultText(10_000, 0, COP)).toBe("+$100");
  });
});
