// Proyección: saldo inicial = cuentas marcadas "usar en mi proyección"; cada mes suma el neto del plan.
import type { Cents } from "./money";
import { cellMap, cellOf, type PlanCell, type PlanLine } from "./plan";

export type Scenario = {
  off?: string[];                                                       // líneas apagadas (no toca el plan)
  extra?: { name: string; amountCents: Cents; from: number; to: number }[]; // + entra, − sale, meses 1–12
};
export type ForecastPoint = { month: number; netCents: Cents; balanceCents: Cents };

export function forecast(startBalanceCents: Cents, lines: PlanLine[], cells: PlanCell[], fromMonth: number, scenario: Scenario = {}): ForecastPoint[] {
  const off = new Set(scenario.off ?? []);
  const map = cellMap(cells);
  let balance = startBalanceCents;
  const out: ForecastPoint[] = [];
  for (let m = fromMonth; m <= 12; m++) {
    let net = 0;
    for (const l of lines) {
      if (off.has(l.id)) continue;
      const v = cellOf(map, l.id, m);
      net += l.kind === "income" ? v : -v;
    }
    for (const e of scenario.extra ?? []) if (m >= e.from && m <= e.to) net += e.amountCents;
    balance += net;
    out.push({ month: m, netCents: net, balanceCents: balance });
  }
  return out;
}

/** Primer mes en que el saldo queda en negativo, o null. */
export const firstNegativeMonth = (points: ForecastPoint[]): number | null => points.find((p) => p.balanceCents < 0)?.month ?? null;
