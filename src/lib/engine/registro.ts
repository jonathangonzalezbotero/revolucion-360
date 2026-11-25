// Cómo llevas la plata: abonos del Plan anual, modo Mensual / Día a día y "Vigilar un gasto" (Jonathan, 25 nov 2026).
// Funciones PURAS (sin base de datos), con pruebas en tests/registro.test.ts. Dinero siempre en centavos.
// No se exporta desde ./index (se importa por su ruta: "@/lib/engine/registro").
import { daysInMonth, iso, parts, type ISODate } from "./dates";
import { normalize } from "./matching";
import type { Cents } from "./money";
import type { LineStatus } from "./plan";

// ───────── Modo: Mensual o Día a día ─────────
/**
 * `profiles.mov_level`: 'plan' = Mensual, 'detail' = Día a día. 'totals' es de antes (escribía totales del mes a mano)
 * y cuenta como Mensual. Cualquier otro valor también es Mensual (el modo por defecto).
 */
export type MovMode = "mensual" | "diario";
export const movMode = (level: string | null | undefined): MovMode => (level === "detail" ? "diario" : "mensual");
/** Lo que se guarda al elegir un modo. Si ya está en un valor que significa lo mismo (p. ej. 'totals'), no se escribe nada. */
export function movLevelFor(mode: MovMode, current: string | null | undefined): "plan" | "detail" | null {
  if (movMode(current) === mode) return null;
  return mode === "diario" ? "detail" : "plan";
}

/**
 * En Mensual no registras cada gasto del día a día: el cierre supone que las líneas flexibles (no fijas) se gastaron
 * como se planearon, salvo que tengan movimientos unidos ese mes. Las fijas siguen con Pagado, abonos y movimientos.
 * - Solo líneas de gasto, del día a día (`fixed` no las tiene), con plan en el mes, sin movimientos unidos y pendientes
 *   (una marcada "Pagado · a mano" ya cuenta lo planeado).
 * - Un movimiento SIN unir de la misma categoría no apaga el supuesto: solo los unidos a la línea son "de ella".
 * Devuelve, por línea, lo que se supone gastado. En Día a día, nada.
 */
export type AssumeLine = { id: string; kind: "income" | "expense"; status: LineStatus; plannedCents: Cents; linkedCount: number };
export function assumedFlexible(lines: AssumeLine[], fixed: ReadonlySet<string>, mode: MovMode): Map<string, Cents> {
  const out = new Map<string, Cents>();
  if (mode !== "mensual") return out;
  for (const l of lines) {
    if (l.kind !== "expense" || fixed.has(l.id) || l.plannedCents <= 0 || l.linkedCount > 0 || l.status !== "pending") continue;
    out.set(l.id, l.plannedCents);
  }
  return out;
}

/**
 * El supuesto se descuenta con lo que SÍ registraste sin unir en la misma categoría (igual que `flexibleSpend` reparte el
 * gasto suelto por categoría): si planeaste $600 de comida y registraste $200 sueltos, se suponen $400 más. Así el cierre
 * nunca cuenta dos veces lo mismo. Las devoluciones (positivas) restan de lo registrado. Por línea, en el orden recibido.
 */
export function netAssumed(assumed: { lineId: string; categoryId: string; cents: Cents }[], unplanned: { categoryId: string | null; amountCents: Cents }[]): Map<string, Cents> {
  const spent = new Map<string, Cents>();
  for (const u of unplanned) if (u.categoryId) spent.set(u.categoryId, (spent.get(u.categoryId) ?? 0) - u.amountCents);
  const out = new Map<string, Cents>();
  for (const a of assumed) {
    const left = Math.max(0, spent.get(a.categoryId) ?? 0);
    const take = Math.min(left, a.cents);
    spent.set(a.categoryId, left - take);
    out.set(a.lineId, a.cents - take);
  }
  return out;
}

// ───────── Abonos (pagos parciales de una línea del plan) ─────────
export type CellPay = { plannedCents: Cents; paidCents: Cents; missingCents: Cents; overCents: Cents; pct: number };
/** Cuánto lleva pagado una celda: suma de sus movimientos unidos (null = ninguno), lo que falta, lo que pasó y el avance (0 a 1). */
export function cellPay(plannedCents: Cents, linkedCents: Cents | null): CellPay {
  const paid = Math.abs(linkedCents ?? 0), planned = Math.max(0, plannedCents);
  return {
    plannedCents: planned, paidCents: paid,
    missingCents: Math.max(0, planned - paid), overCents: Math.max(0, paid - planned),
    pct: planned > 0 ? Math.min(1, paid / planned) : paid > 0 ? 1 : 0,
  };
}

/** Lo que se sugiere abonar: lo que falta. Si no falta nada, vacío (0). */
export const abonoSuggestion = (plannedCents: Cents, linkedCents: Cents | null): Cents => cellPay(plannedCents, linkedCents).missingCents;

/**
 * Fecha por defecto de un abono a la celda de un mes: hoy si la celda es del mes en curso. Para que el abono cuente en
 * la celda donde se registró (los movimientos cuentan en el mes de su fecha): un mes pasado usa su último día y uno
 * por venir, su primer día.
 */
export function abonoDate(today: ISODate, year: number, month: number): ISODate {
  const t = parts(today);
  if (t.y === year && t.m === month) return today;
  return year * 12 + month < t.y * 12 + t.m ? iso(year, month, daysInMonth(year, month)) : iso(year, month, 1);
}
/** ¿La fecha cae en ese mes de ese año? */
export const inMonthOf = (date: ISODate, year: number, month: number): boolean => {
  const p = parts(date);
  return p.y === year && p.m === month;
};

/** Lo que te ahorraste al "Dar por cerrado" líneas con menos de lo planeado: por línea y en total. */
export function closedSavings<T extends { plannedCents: Cents; realCents: Cents; closed?: boolean }>(lines: T[]): { lines: (T & { savedCents: Cents })[]; totalCents: Cents } {
  const out = lines.filter((l) => l.closed && l.plannedCents > l.realCents).map((l) => ({ ...l, savedCents: l.plannedCents - l.realCents }));
  return { lines: out, totalCents: out.reduce((a, l) => a + l.savedCents, 0) };
}

// ───────── Etiquetas a mano (#café, #GYG) ─────────
export const MAX_TAGS = 10;
export const MAX_TAG_LEN = 30;
/** Forma para comparar: sin tildes, sin mayúsculas, sin espacios ni signos ("#Café" = "cafe"). */
export const tagKey = (tag: string): string => normalize(tag).replace(/ /g, "");
/** Una etiqueta escrita a mano: sin "#" ni espacios de más. null si no queda nada que se pueda buscar. */
export function cleanTag(raw: string): string | null {
  const t = raw.replace(/^#+/, "").replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LEN).trim();
  return t && tagKey(t) ? t : null;
}
/** "#café, #helado #GYG" → ["café", "helado", "GYG"]: se separan por "#" o coma, sin repetidas (sin importar tildes ni mayúsculas) y hasta 10. */
export function parseTags(text: string): string[] {
  return mergeTags([], text.split(/[,#\n]+/));
}
/** Suma etiquetas nuevas a las que ya tiene, sin repetir y hasta 10. */
export function mergeTags(current: string[], added: string[]): string[] {
  const out: string[] = [], seen = new Set<string>();
  for (const raw of [...current, ...added]) {
    const t = cleanTag(raw);
    if (!t || seen.has(tagKey(t)) || out.length >= MAX_TAGS) continue;
    seen.add(tagKey(t));
    out.push(t);
  }
  return out;
}
/** ¿Cambiaron? Si no, la columna no se nombra al guardar (así funciona también antes de aplicar la migración). */
export function tagsChanged(before: string[], after: string[]): boolean {
  return before.length !== after.length || before.some((t, i) => t !== after[i]);
}

/** Las partes de un movimiento dividido llevan las etiquetas de su original (las partes son las que cuentan). */
export function inheritTags<T extends { id: string; parentId: string | null; tags: string[] }>(txs: T[]): T[] {
  const byId = new Map(txs.map((t) => [t.id, t.tags]));
  return txs.map((t) => (t.parentId && byId.has(t.parentId) ? { ...t, tags: mergeTags(t.tags, byId.get(t.parentId)!) } : t));
}

// ───────── Vigilar un gasto ─────────
/** Una vigilancia: una palabra que aparece en la descripción y/o una etiqueta puesta a mano. */
export type Watch = { pattern: string; tag: string | null };
export type WatchTx = { date: ISODate; amountCents: Cents; description: string; rawDescription?: string; tags?: string[] };

/** ¿La palabra aparece en la descripción (o en la original del banco)? Sin tildes ni mayúsculas; también sin espacios ("McDonald's" = "MCDONALDS"). */
export function matchesText(t: Pick<WatchTx, "description" | "rawDescription">, pattern: string): boolean {
  const p = normalize(pattern), tight = p.replace(/ /g, "");
  if (!p) return false;
  const hit = (d: string) => { const n = normalize(d); return n.includes(p) || n.replace(/ /g, "").includes(tight); };
  return hit(t.description) || (!!t.rawDescription && hit(t.rawDescription));
}
/** ¿El movimiento entra en la vigilancia? Por la palabra o por la etiqueta (basta una). */
export function matchesWatch(t: WatchTx, w: Watch): boolean {
  if (w.tag && tagKey(w.tag) && (t.tags ?? []).some((x) => tagKey(x) === tagKey(w.tag!))) return true;
  return !!w.pattern && matchesText(t, w.pattern);
}

export type WatchTotals = { monthCents: Cents; yearCents: Cents; monthCount: number; yearCount: number };
/**
 * "Cafés: $86 este mes · $1,020 en el año". Solo gastos (lo que sale) del año pedido; recibe movimientos que ya cuentan
 * (sin transferencias ni padres divididos). Es solo una vista: no cambia ningún cálculo del plan ni del cierre.
 */
export function watchTotals(txs: WatchTx[], w: Watch, year: number, month: number): WatchTotals {
  const out: WatchTotals = { monthCents: 0, yearCents: 0, monthCount: 0, yearCount: 0 };
  for (const t of txs) {
    if (t.amountCents >= 0) continue;
    const p = parts(t.date);
    if (p.y !== year || !matchesWatch(t, w)) continue;
    out.yearCents -= t.amountCents; out.yearCount++;
    if (p.m === month) { out.monthCents -= t.amountCents; out.monthCount++; }
  }
  return out;
}
