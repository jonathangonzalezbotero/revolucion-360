// Plan 2026 de Jonathan tal como aparece en el mockup aprobado (docs/mockup/Plan.dc.html). Montos en dólares.
import type { PlanCell, PlanLine } from "@/lib/engine";

const f = (n: number, v: number) => Array(n).fill(v) as number[];
export const GROUPS: { name: string; kind: "income" | "expense" | "debt" | "saving" | "goal"; color: string; isBasic?: boolean; rows: [string, number[]][] }[] = [
  { name: "Ingresos", kind: "income", color: "#141612", rows: [
    ["Sueldo", f(12, 5418)],
    ["Retiros de Easy Aussie", [270, 950, 900, 1330, 900, 1250, 1250, 1000, 800, 800, 800, 800]],
    ["Renta del auto", [500, 500, 500, 500, 625, 500, 500, 0, 0, 0, 0, 0]],
    ["E-bikes", [275, 470, 380, 350, 350, 0, 0, 0, 200, 200, 200, 200]],
    ["Ingresos extra", [0, 10200, 0, 0, 110, 110, 1610, 1000, 0, 0, 0, 0]]] },
  { name: "Hogar y básicos", kind: "expense", color: "#141612", isBasic: true, rows: [
    ["Home", [1352, 1270, 1270, 1270, 1330, 670, 0, 1330, 1330, 1330, 1330, 990]],
    ["Groceries", [270, 300, 300, 300, 300, 100, 0, 300, 400, 400, 400, 400]],
    ["Felix Mobile", [40, 40, 40, 40, 40, 40, 80, 40, 40, 40, 40, 40]],
    ["Suscripciones", [75, 190, 270, 70, 240, 100, 40, 170, 120, 125, 125, 25]],
    ["Seguro de salud", [112, 112, 112, 117, 117, 117, 128, 128, 128, 128, 128, 128]]] },
  { name: "Vehículo", kind: "expense", color: "#6FA898", rows: [
    ["Car expenses", f(12, 180)], ["Bike expenses", f(12, 90)],
    ["Gasolina", [30, 30, 30, 30, 30, 30, 0, 90, 100, 140, 100, 100]],
    ["Seguro de la moto", [76, 76, 76, 76, 76, 76, 76, 76, 76, 80, 80, 80]]] },
  { name: "Deudas", kind: "debt", color: "#C46A2A", rows: [
    ["Inner Circle", [655, 655, 655, 655, 655, 655, 655, 655, 655, 700, 700, 700]],
    ["Bike Payment", [600, 100, 2100, 2000, 2300, 0, 0, 0, 100, 100, 100, 0]]] },
  { name: "Comida y ocio", kind: "expense", color: "#A8D3C3", rows: [
    ["Food and Entertainment", [500, 450, 450, 450, 400, 200, 0, 400, 400, 400, 400, 400]],
    ["Otros", [0, 0, 0, 0, 200, 100, 0, 280, 0, 0, 0, 0]]] },
  { name: "Ahorro e inversión", kind: "saving", color: "#4C7FB5", rows: [
    ["Investment S&P500", [100, 100, 100, 100, 100, 100, 100, 100, 150, 150, 150, 150]],
    ["Emergency fund", f(12, 100)]] },
  { name: "Metas", kind: "goal", color: "#E3B800", rows: [["Viaje a Colombia", [0, 0, 0, 0, 0, 0, 0, 0, 2000, 1900, 2000, 2500]]] },
  { name: "Negocio", kind: "expense", color: "#2D5C8A", rows: [["Aportes a Easy Aussie", [270, 1000, 1200, 785, 0, 0, 400, 2700, 550, 550, 400, 550]]] },
  { name: "Estilo de vida", kind: "expense", color: "#3E8C7A", rows: [
    ["Travelling Maria del Mar", [200, 400, 200, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["Inner Circle Immersion", [0, 0, 0, 0, 1200, 1800, 0, 0, 0, 0, 0, 0]],
    ["Europe trip", [1700, 3200, 0, 1350, 0, 2866, 6850, 700, 0, 0, 0, 0]]] },
];

export function buildPlan2026(): { lines: PlanLine[]; cells: PlanCell[] } {
  const lines: PlanLine[] = [], cells: PlanCell[] = [];
  GROUPS.forEach((g, gi) => g.rows.forEach(([name, months], ri) => {
    const id = `${gi}-${ri}`;
    lines.push({ id, name, kind: g.kind === "income" ? "income" : "expense", categoryId: String(gi), year: 2026, frequency: "custom", amountCents: 0, firstPayDate: null });
    months.forEach((v, i) => cells.push({ lineId: id, month: i + 1, amountCents: v * 100, manual: true }));
  }));
  return { lines, cells };
}
