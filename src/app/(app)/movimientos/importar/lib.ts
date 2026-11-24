// Cálculos puros del asistente "Importar CSV" (sin base de datos): sirven en el navegador, en el servidor y en las pruebas.
// El archivo se lee en el navegador; aquí solo se trabaja con filas ya convertidas.
import {
  applyRules, expectedBalance, findDuplicate, findTransferPair, mapRows, normalize, suggestLine,
  type Cents, type CsvMapping, type CsvRow, type DateFormat, type ISODate, type LineCandidate, type MatchConfig,
} from "@/lib/engine";

/** Bancos sugeridos. "Otro" deja escribir el nombre. */
export const BANKS = ["Ubank", "NAB", "CommBank", "Westpac", "ANZ", "ING", "Macquarie"] as const;
export const MAX_BYTES = 5 * 1024 * 1024;
export const BATCH = 500;

/** Archivo aceptado: solo .csv (por extensión, el tipo MIME varía por navegador) y hasta 5 MB. */
export function fileProblem(name: string, size: number): "type" | "size" | "empty" | null {
  if (!/\.csv$/i.test(name.trim())) return "type";
  if (size > MAX_BYTES) return "size";
  if (size === 0) return "empty";
  return null;
}

// ───────── Columnas ─────────
export type Role = "date" | "description" | "debit" | "credit" | "amount" | "balance" | "ignore";
export const ROLES: Role[] = ["date", "description", "debit", "credit", "amount", "balance", "ignore"];
/** Formato guardado en `csv_formats.mapping`: el mapeo y la firma del encabezado para saber si el banco lo cambió. */
export type SavedFormat = CsvMapping & { headers?: string[]; columns?: number };

export const columnCount = (rows: string[][]) => Math.max(0, ...rows.slice(0, 30).map((r) => r.length));

export function rolesFromMapping(m: CsvMapping, cols: number): Role[] {
  const roles: Role[] = Array.from({ length: cols }, () => "ignore");
  const set = (i: number | null, r: Role) => { if (i !== null && i >= 0 && i < cols && roles[i] === "ignore") roles[i] = r; };
  set(m.date, "date"); set(m.description, "description"); set(m.amount, "amount"); set(m.debit, "debit"); set(m.credit, "credit"); set(m.balance, "balance");
  return roles;
}

/** Cambia el papel de una columna. Fecha, descripción, monto y saldo son únicos: la columna que lo tenía pasa a "Ignorar". */
export function setRole(roles: Role[], col: number, role: Role): Role[] {
  return roles.map((r, i) => {
    if (i === col) return role;
    if (role === "ignore") return r;
    if (r === role) return "ignore";
    // una columna "Monto (+/-)" no convive con Salida/Entrada: se queda la que el usuario acaba de elegir
    if (role === "amount" && (r === "debit" || r === "credit")) return "ignore";
    if ((role === "debit" || role === "credit") && r === "amount") return "ignore";
    return r;
  });
}

export function mappingFromRoles(roles: Role[], base: { hasHeader: boolean; dateFormat: DateFormat; invert: boolean }): CsvMapping {
  const at = (r: Role) => { const i = roles.indexOf(r); return i >= 0 ? i : null; };
  const amount = at("amount");
  return {
    hasHeader: base.hasHeader, date: at("date") ?? -1, description: at("description") ?? -1,
    amount, debit: amount === null ? at("debit") : null, credit: amount === null ? at("credit") : null,
    balance: at("balance"), dateFormat: base.dateFormat, invert: base.invert,
  };
}

/** Lo que falta indicar para poder convertir las filas. */
export function missingRoles(roles: Role[]): ("date" | "description" | "amount")[] {
  const out: ("date" | "description" | "amount")[] = [];
  if (!roles.includes("date")) out.push("date");
  if (!roles.includes("description")) out.push("description");
  if (!roles.includes("amount") && !roles.includes("debit") && !roles.includes("credit")) out.push("amount");
  return out;
}

/** Columnas del archivo con su nombre (o null si no hay encabezado) y hasta 3 ejemplos no vacíos. */
export function columnsInfo(rows: string[][], hasHeader: boolean): { name: string | null; samples: string[] }[] {
  const cols = columnCount(rows);
  const body = rows.slice(hasHeader ? 1 : 0, 40);
  return Array.from({ length: cols }, (_, i) => ({
    name: hasHeader ? (rows[0]?.[i] ?? "").trim() || null : null,
    samples: body.map((r) => (r[i] ?? "").trim()).filter(Boolean).slice(0, 3),
  }));
}

const sig = (h: string[]) => h.map((x) => normalize(x)).join("|");
export const headerSignature = (rows: string[][], hasHeader: boolean): string[] => (hasHeader ? (rows[0] ?? []).map((x) => x.trim()) : []);

/**
 * ¿El formato guardado sigue sirviendo para este archivo? No sirve si cambió el encabezado, si faltan columnas
 * o si con él se descarta la mayoría de las filas (el banco cambió el orden o el formato de fecha).
 */
export function formatFits(saved: SavedFormat, rows: string[][]): boolean {
  if (rows.length === 0) return false;
  const used = [saved.date, saved.description, saved.amount, saved.debit, saved.credit, saved.balance].filter((x): x is number => typeof x === "number" && x >= 0);
  if (used.length === 0 || saved.date < 0 || saved.description < 0) return false;
  if (Math.max(...used) >= columnCount(rows)) return false;
  if (saved.hasHeader && saved.headers?.length && sig(rows[0] ?? []) !== sig(saved.headers)) return false;
  const sample = rows.slice(0, 31);
  const r = mapRows(sample, saved);
  const total = r.rows.length + r.skipped.length;
  return total > 0 && r.rows.length / total >= 0.6;
}

export function dateRange(rows: { date: ISODate }[]): { from: ISODate; to: ISODate } | null {
  if (rows.length === 0) return null;
  let from = rows[0].date, to = rows[0].date;
  for (const r of rows) { if (r.date < from) from = r.date; if (r.date > to) to = r.date; }
  return { from, to };
}

// ───────── Revisión: nueva, duplicado o transferencia ─────────
export type Existing = { id: string; accountId: string | null; date: ISODate; amountCents: Cents; description: string; paired: boolean };
export type Flag = "new" | "dup" | "transfer";
export type Classified = CsvRow & {
  flag: Flag;
  dupOf: { date: ISODate; description: string } | null;
  pairId: string | null;
  pairAccountId: string | null;
  /** Por defecto: se importan las nuevas y las transferencias; los duplicados quedan fuera (el usuario decide). */
  include: boolean;
};

/**
 * Clasifica cada fila del archivo contra los movimientos que ya existen:
 * 1. duplicado: misma cuenta, mismo monto, fechas cerca y descripción parecida (`findDuplicate`).
 * 2. transferencia: monto opuesto en otra cuenta propia, aún sin pareja (`findTransferPair`).
 * Cada movimiento existente se usa una sola vez: dos cafés iguales en el archivo contra uno registrado = un duplicado.
 */
export function classifyRows(rows: CsvRow[], accountId: string, existing: Existing[], cfg: MatchConfig): Classified[] {
  const own = existing.filter((e) => e.accountId === accountId);
  const others = existing.filter((e) => e.accountId !== null && e.accountId !== accountId && !e.paired);
  return rows.map((r) => {
    const cand = { accountId, date: r.date, amountCents: r.amountCents, description: r.description };
    const dup = findDuplicate(cand, own, cfg) as Existing | null;
    if (dup) {
      own.splice(own.indexOf(dup), 1);
      return { ...r, flag: "dup", dupOf: { date: dup.date, description: dup.description }, pairId: null, pairAccountId: null, include: false };
    }
    const pair = findTransferPair(cand, others, cfg) as Existing | null;
    if (pair) {
      others.splice(others.indexOf(pair), 1);
      return { ...r, flag: "transfer", dupOf: null, pairId: pair.id, pairAccountId: pair.accountId, include: true };
    }
    return { ...r, flag: "new", dupOf: null, pairId: null, pairAccountId: null, include: true };
  });
}

/** Parte una lista en lotes de máximo `size` (una llamada al servidor por lote). */
export function chunk<T>(xs: T[], size = BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

// ───────── Categorías y reglas ─────────
export type RuleLite = { key: string; pattern: string; categoryId: string | null; lineId: string | null; on: boolean };

/** Categoría de una fila: la que eligió el usuario a mano (null = "Sin categoría" a propósito) o la de la primera regla activa. */
export function ruleFor(description: string, rules: RuleLite[]): RuleLite | null {
  return applyRules(description, rules.filter((r) => r.on && (r.categoryId || r.lineId)));
}
export function categoryFor(description: string, manual: string | null | undefined, rules: RuleLite[]): string | null {
  if (manual !== undefined) return manual;
  return ruleFor(description, rules)?.categoryId ?? null;
}

/** A cuántas filas aplica un patrón (mismo criterio que `applyRules`). */
export function countMatches(pattern: string, descriptions: string[]): number {
  const p = normalize(pattern);
  if (!p) return 0;
  return descriptions.filter((d) => normalize(d).includes(p)).length;
}

/** Igual que `ruleFor`/`countMatches`, pero con textos ya normalizados (para no normalizar miles de filas en cada render). */
export type NormRule = RuleLite & { np: string };
export const normRules = (rules: RuleLite[]): NormRule[] => rules.map((r) => ({ ...r, np: normalize(r.pattern) }));
export function ruleForNorm(norm: string, rules: NormRule[]): NormRule | null {
  return rules.find((r) => r.on && (r.categoryId || r.lineId) && r.np && norm.includes(r.np)) ?? null;
}
export function countNorm(np: string, norms: string[]): number {
  return np ? norms.filter((d) => d.includes(np)).length : 0;
}

/** Clave de comercio para sugerir reglas: las dos primeras palabras sin números ("WOOLWORTHS 1234 SYDNEY" → "woolworths sydney"). */
export function merchantKey(description: string): string | null {
  const words = normalize(description).split(" ").filter((w) => w.length >= 2 && !/\d/.test(w));
  const key = words.slice(0, 2).join(" ");
  return key.length >= 3 ? key : null;
}

/** Descripciones que se repiten en el archivo y que ninguna regla cubre: candidatas a regla nueva. */
export function repeatedDescriptions(descriptions: string[], rules: RuleLite[], max = 8): { pattern: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const d of descriptions) {
    if (applyRules(d, rules)) continue;
    const k = merchantKey(d);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, max).map(([pattern, n]) => ({ pattern, n }));
}

/** Patrón de una regla nueva: sin tildes, signos ni mayúsculas; muy corto no sirve. */
export function patternOf(text: string): string | null {
  const p = normalize(text);
  return p.length >= 3 ? p.slice(0, 80) : null;
}

// ───────── Líneas del plan ─────────
export type LineCand = LineCandidate & { categoryId: string; year: number; month: number };

/**
 * Sugerencia de línea del plan (el usuario confirma). Una línea ya unida en esta importación para ese mes no se vuelve a sugerir.
 */
export function suggestFor(row: { date: ISODate; amountCents: Cents; description: string }, accountId: string, lines: LineCand[], taken: Set<string>, cfg: MatchConfig): LineCand | null {
  const y = +row.date.slice(0, 4), m = +row.date.slice(5, 7);
  const cands = lines.filter((l) => l.year === y && l.month === m && !taken.has(`${l.id}:${m}`));
  return suggestLine({ accountId, date: row.date, amountCents: row.amountCents, description: row.description }, m, cands, cfg) as LineCand | null;
}

/** La línea guardada en una regla es de un año: para otra fecha se busca la del mismo nombre y categoría en ese año. */
export function lineForYear(lineId: string | null, year: number, ruleLines: Record<string, { name: string; categoryId: string; year: number }>, lines: LineCand[]): LineCand | null {
  if (!lineId) return null;
  const same = lines.find((l) => l.id === lineId && l.year === year);
  if (same) return same;
  const ref = ruleLines[lineId];
  if (!ref) return null;
  return lines.find((l) => l.year === year && l.name === ref.name && l.categoryId === ref.categoryId) ?? null;
}

// ───────── Resumen y conciliación ─────────
/** Entró y salió de lo que se importa. Las transferencias no son ingreso ni gasto. */
export function totals(rows: { amountCents: Cents; flag: Flag }[]): { inCents: Cents; outCents: Cents } {
  let inCents = 0, outCents = 0;
  for (const r of rows) {
    if (r.flag === "transfer") continue;
    if (r.amountCents > 0) inCents += r.amountCents; else outCents += -r.amountCents;
  }
  return { inCents, outCents };
}

/** Tarjetas: el saldo se guarda en negativo (lo que se debe), aunque el banco lo muestre en positivo. */
export const cardBalance = (kind: string, cents: Cents): Cents => (kind === "card" && cents > 0 ? -cents : cents);

type AccountRef = { id: string; kind: string; balanceCents: Cents; balanceDate: ISODate };

/**
 * Saldo que da la app para la cuenta en la fecha `at` (el último día del archivo):
 * - si el saldo escrito es anterior: saldo escrito + movimientos posteriores hasta `at` (`expectedBalance`, ya con lo importado);
 * - si es posterior: saldo escrito − movimientos entre `at` y esa fecha (lo importado es de antes y ya está en el saldo).
 */
export function appBalanceAt(account: AccountRef, existing: { date: ISODate; amountCents: Cents }[], imported: { date: ISODate; amountCents: Cents }[], at: ISODate): Cents {
  if (at >= account.balanceDate) {
    const lite = { id: account.id, kind: "bank" as const, balanceCents: account.balanceCents, balanceDate: account.balanceDate, inNetworth: true, inForecast: true };
    const txs = [...existing, ...imported].filter((t) => t.date <= at).map((t) => ({ accountId: account.id, date: t.date, amountCents: t.amountCents }));
    return expectedBalance(lite, txs);
  }
  return account.balanceCents - existing.filter((t) => t.date > at && t.date <= account.balanceDate).reduce((a, t) => a + t.amountCents, 0);
}

export type Reconcile = { status: "none" } | { status: "ok"; fileCents: Cents } | { status: "diff"; fileCents: Cents; appCents: Cents; diffCents: Cents };

/** Saldo final del archivo frente al de la app. Sin columna de saldo no hay con qué comparar. */
export function reconcile(fileClosing: Cents | null, kind: string, appCents: Cents): Reconcile {
  if (fileClosing === null) return { status: "none" };
  const fileCents = cardBalance(kind, fileClosing);
  if (fileCents === appCents) return { status: "ok", fileCents };
  return { status: "diff", fileCents, appCents, diffCents: fileCents - appCents };
}

/**
 * Descripción limpia para la lista (la original queda en `raw_description`): sin números de tarjeta,
 * "Value Date", referencias largas ni espacios de más.
 */
export function cleanDescription(raw: string): string {
  const s = raw
    .replace(/\bvalue date:?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/gi, " ")
    .replace(/\b(card\s*)?x{2,}\d{2,}\b/gi, " ")
    .replace(/\b(receipt|ref|reference)\s*(no\.?|number)?\s*:?\s*\d{4,}\b/gi, " ")
    .replace(/\b\d{6,}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s || raw.replace(/\s+/g, " ").trim();
}
