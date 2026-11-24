// Cálculos propios de Análisis (puros, con pruebas en tests/proyeccion-analisis.test.ts).
// Reciben movimientos que YA cuentan (sin transferencias ni padres divididos: `counts` en data.ts).
import { cellMap, cellOf, categoryTotals, normalize, parts, type Cents, type ISODate, type PlanCell, type PlanLine } from "@/lib/engine";

export type TxA = { date: ISODate; amountCents: Cents; description: string; rawDescription?: string; categoryId: string | null; planLineId: string | null };
export type Totals = { income: Cents; expense: Cents; net: Cents };
export const MAX_WATCHED = 5;

const monthOf = (d: ISODate) => parts(d).m;
export const inMonth = <T extends TxA>(txs: T[], month: number | null) => (month ? txs.filter((t) => monthOf(t.date) === month) : txs);

/** Entró (lo positivo), salió (lo negativo, en positivo) y te sobró. */
export function totals(txs: TxA[]): Totals {
  let income = 0, expense = 0;
  for (const t of txs) if (t.amountCents > 0) income += t.amountCents; else expense -= t.amountCents;
  return { income, expense, net: income - expense };
}

/** Los 12 meses del año (índice 0 = enero). */
export function monthTotals(txs: TxA[]): Totals[] {
  return Array.from({ length: 12 }, (_, i) => totals(txs.filter((t) => monthOf(t.date) === i + 1)));
}

/** Mes (1–12) en que más te sobró, o null si ninguno dejó plata. */
export function bestMonth(months: Totals[]): number | null {
  let best = -1;
  months.forEach((m, i) => { if (m.net > 0 && (best < 0 || m.net > months[best].net)) best = i; });
  return best < 0 ? null : best + 1;
}

/** Gasto real por categoría (`null` = sin categoría), de mayor a menor. */
export function spendByCategory(txs: TxA[]): { categoryId: string | null; cents: Cents }[] {
  const map = new Map<string | null, Cents>();
  for (const t of txs) if (t.amountCents < 0) map.set(t.categoryId, (map.get(t.categoryId) ?? 0) - t.amountCents);
  return [...map].map(([categoryId, cents]) => ({ categoryId, cents })).sort((a, b) => b.cents - a.cents);
}

/** Plan por categoría: de un mes, o del año completo si `month` es null. */
export function planByCategory(lines: PlanLine[], cells: PlanCell[], month: number | null, kind: "income" | "expense" = "expense"): Map<string, Cents> {
  const ls = lines.filter((l) => l.kind === kind);
  if (month) return categoryTotals(ls, cells, month);
  const map = cellMap(cells), out = new Map<string, Cents>();
  for (const l of ls) for (let m = 1; m <= 12; m++) out.set(l.categoryId, (out.get(l.categoryId) ?? 0) + cellOf(map, l.id, m));
  return out;
}

/** De dónde vino: ingresos por línea del plan (si está unido), si no por categoría; `key` sin nombre = "otros ingresos". */
export function incomeSources(txs: TxA[], lineName: Map<string, string>, categoryName: Map<string, string>): { key: string; name: string | null; cents: Cents }[] {
  const map = new Map<string, { name: string | null; cents: Cents }>();
  for (const t of txs) {
    if (t.amountCents <= 0) continue;
    const ln = t.planLineId ? lineName.get(t.planLineId) : undefined;
    const cn = t.categoryId ? categoryName.get(t.categoryId) : undefined;
    const key = ln ? `l:${t.planLineId}` : cn ? `c:${t.categoryId}` : "other";
    const cur = map.get(key) ?? { name: ln ?? cn ?? null, cents: 0 };
    cur.cents += t.amountCents;
    map.set(key, cur);
  }
  return [...map].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.cents - a.cents);
}

// ───────── Comercios ─────────
export type Merchant = { key: string; name: string; cents: Cents; count: number };

/**
 * Donde más gastas: agrupa los gastos por descripción normalizada ("UBER *EATS" y "Uber Eats" son el mismo).
 * El nombre que se muestra es la forma más repetida de la descripción.
 */
export function merchantRanking(txs: TxA[], limit = 5): Merchant[] {
  const groups = new Map<string, { cents: Cents; count: number; names: Map<string, number> }>();
  for (const t of txs) {
    if (t.amountCents >= 0) continue;
    const key = normalize(t.description);
    if (!key) continue;
    const g = groups.get(key) ?? { cents: 0, count: 0, names: new Map() };
    g.cents -= t.amountCents;
    g.count++;
    const shown = t.description.trim();
    g.names.set(shown, (g.names.get(shown) ?? 0) + 1);
    groups.set(key, g);
  }
  return [...groups].map(([key, g]) => {
    let name = "", n = 0;
    g.names.forEach((c, k) => { if (c > n) { name = k; n = c; } });
    return { key, name, cents: g.cents, count: g.count };
  }).sort((a, b) => b.cents - a.cents || b.count - a.count).slice(0, limit);
}

/** ¿El movimiento es de este comercio vigilado? El patrón aparece en la descripción (o en la original del banco). */
export function matchesPattern(t: Pick<TxA, "description" | "rawDescription">, pattern: string): boolean {
  const p = normalize(pattern), tight = p.replace(/ /g, "");
  if (!p) return false;
  // "McDonald's" → "mcdonald s"; el banco escribe "MCDONALDS 1234": también se compara sin espacios.
  const hit = (d: string) => { const n = normalize(d); return n.includes(p) || n.replace(/ /g, "").includes(tight); };
  return hit(t.description) || (!!t.rawDescription && hit(t.rawDescription));
}

export type WatchStats = { monthCents: Cents; yearCents: Cents; monthCount: number; yearCount: number };
/** Cuánto gastaste en un comercio vigilado: en el mes elegido y en el año, y cuántas veces. */
export function watchedStats(txs: TxA[], pattern: string, month: number): WatchStats {
  const out: WatchStats = { monthCents: 0, yearCents: 0, monthCount: 0, yearCount: 0 };
  for (const t of txs) {
    if (t.amountCents >= 0 || !matchesPattern(t, pattern)) continue;
    out.yearCents -= t.amountCents; out.yearCount++;
    if (monthOf(t.date) === month) { out.monthCents -= t.amountCents; out.monthCount++; }
  }
  return out;
}

/** Cuánto llevas frente al límite del mes de un comercio vigilado: lo que te queda o cuánto te pasaste. null si no tiene límite. */
export function limitStatus(monthCents: Cents, limitCents: Cents | null): { over: boolean; diffCents: Cents } | null {
  if (!limitCents || limitCents <= 0) return null;
  return monthCents > limitCents ? { over: true, diffCents: monthCents - limitCents } : { over: false, diffCents: limitCents - monthCents };
}

/** Lo que más varió: categorías con más diferencia entre su mes más bajo y su mes más alto (hasta `upToMonth`). */
export function biggestVariation(txs: TxA[], upToMonth: number, limit = 3): { categoryId: string; minCents: Cents; maxCents: Cents }[] {
  const byCat = new Map<string, Cents[]>();
  for (const t of txs) {
    if (t.amountCents >= 0 || !t.categoryId) continue;
    const m = monthOf(t.date);
    if (m > upToMonth) continue;
    const arr = byCat.get(t.categoryId) ?? Array.from({ length: upToMonth }, () => 0);
    arr[m - 1] -= t.amountCents;
    byCat.set(t.categoryId, arr);
  }
  if (upToMonth < 2) return [];
  return [...byCat].map(([categoryId, arr]) => ({ categoryId, minCents: Math.min(...arr), maxCents: Math.max(...arr) }))
    .filter((v) => v.maxCents > v.minCents).sort((a, b) => b.maxCents - b.minCents - (a.maxCents - a.minCents)).slice(0, limit);
}

/** Parte de lo que entró que fue a ahorro, inversión o metas (0 a 1). */
export const share = (part: Cents, whole: Cents) => (whole > 0 ? Math.min(1, Math.max(0, part / whole)) : 0);

/** Dirección de Análisis con sus filtros (el año en curso no se escribe). */
export function analisisHref(year: number, month: number | null, currentYear: number): string {
  const q = new URLSearchParams();
  if (year !== currentYear) q.set("anio", String(year));
  if (month) q.set("mes", String(month));
  const s = q.toString();
  return s ? `/analisis?${s}` : "/analisis";
}
