// Diagnóstico: 5 indicadores con referencias generales por país. Información general, no asesoría.
import type { Cents } from "./money";

export type IndicatorKey = "surplus" | "saving" | "debt" | "emergency" | "dependency";
export type Level = "good" | "warn" | "bad" | "nodata";
export type Benchmarks = Record<IndicatorKey, { good: number; warn: number }>;

export const DEFAULT_BENCHMARKS: Benchmarks = {
  surplus: { good: 0.1, warn: 0 },        // te sobra / ingresos: más es mejor
  saving: { good: 0.15, warn: 0.05 },     // ahorro e inversión / ingresos: más es mejor
  debt: { good: 0.15, warn: 0.3 },        // cuotas / ingresos: menos es mejor
  emergency: { good: 3, warn: 1 },        // meses de gastos básicos cubiertos: más es mejor
  dependency: { good: 0.7, warn: 0.9 },   // ingreso más grande / ingresos: menos es mejor
};

export type DiagnosticInput = {
  incomeCents: Cents;            // ingresos del mes
  expenseCents: Cents;           // todo lo que sale (incluye deudas, ahorro y metas)
  savingCents: Cents;            // aportes a ahorro, inversión y metas
  debtPaymentsCents: Cents;      // cuotas de deudas del mes
  basicExpensesCents: Cents;     // categorías marcadas como básicas
  emergencyFundCents: Cents;     // saldo del fondo de emergencia
  largestIncomeCents: Cents;     // la línea de ingreso más grande
};
export type Indicator = { key: IndicatorKey; value: number | null; level: Level };

const higherBetter = (v: number, b: { good: number; warn: number }): Level => (v >= b.good ? "good" : v >= b.warn ? "warn" : "bad");
const lowerBetter = (v: number, b: { good: number; warn: number }): Level => (v <= b.good ? "good" : v <= b.warn ? "warn" : "bad");

export function diagnose(i: DiagnosticInput, b: Benchmarks = DEFAULT_BENCHMARKS): Indicator[] {
  const hasIncome = i.incomeCents > 0;
  const ratio = (n: number) => (hasIncome ? n / i.incomeCents : null);
  const surplus = ratio(i.incomeCents - i.expenseCents);
  const saving = ratio(i.savingCents);
  const debt = ratio(i.debtPaymentsCents);
  const emergency = i.basicExpensesCents > 0 ? i.emergencyFundCents / i.basicExpensesCents : null;
  const dependency = ratio(i.largestIncomeCents);
  return [
    { key: "surplus", value: surplus, level: surplus === null ? "nodata" : surplus < 0 ? "bad" : higherBetter(surplus, b.surplus) },
    { key: "saving", value: saving, level: saving === null ? "nodata" : higherBetter(saving, b.saving) },
    { key: "debt", value: debt, level: debt === null ? "nodata" : lowerBetter(debt, b.debt) },
    { key: "emergency", value: emergency, level: emergency === null ? "nodata" : higherBetter(emergency, b.emergency) },
    { key: "dependency", value: dependency, level: dependency === null ? "nodata" : lowerBetter(dependency, b.dependency) },
  ];
}

/** En qué enfocarse primero: gastar menos de lo que entra → deudas → fondo → ahorro → dependencia. */
export function priority(indicators: Indicator[]): IndicatorKey | null {
  const order: IndicatorKey[] = ["surplus", "debt", "emergency", "saving", "dependency"];
  const by = new Map(indicators.map((x) => [x.key, x.level]));
  return order.find((k) => by.get(k) === "bad") ?? order.find((k) => by.get(k) === "warn") ?? null;
}
