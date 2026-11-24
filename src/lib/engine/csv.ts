// Importar CSV: leer el archivo, adivinar columnas y convertir filas. El archivo nunca se guarda.
import { iso, type ISODate } from "./dates";
import { parseMoney, type Cents } from "./money";

export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const first = t.split(/\r?\n/, 1)[0] ?? "";
  const delim = [",", ";", "\t"].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}

export type DateFormat = "DMY" | "MDY" | "YMD";
export type CsvMapping = {
  hasHeader: boolean;
  date: number;
  description: number;
  amount: number | null;      // una sola columna con signo…
  debit: number | null;       // …o dos columnas: sale / entra
  credit: number | null;
  balance: number | null;
  dateFormat: DateFormat;
  invert?: boolean;           // extractos de tarjeta donde el gasto viene en positivo
};

const MONTHS: Record<string, number> = { jan: 1, ene: 1, feb: 2, mar: 3, apr: 4, abr: 4, may: 5, jun: 6, jul: 7, aug: 8, ago: 8, sep: 9, oct: 10, nov: 11, dec: 12, dic: 12 };

export function parseDate(raw: string, fmt: DateFormat): ISODate | null {
  const s = raw.trim();
  const named = s.match(/^(\d{1,2})[\s\-/]([A-Za-z]{3})[a-z]*[\s\-/](\d{2,4})$/);
  if (named) {
    const m = MONTHS[named[2].toLowerCase()];
    if (!m) return null;
    const y = +named[3] < 100 ? 2000 + +named[3] : +named[3];
    return valid(y, m, +named[1]);
  }
  const n = s.split(/[T\s]/)[0].split(/[\/\-.]/).map((x) => +x);
  if (n.length !== 3 || n.some((x) => !Number.isFinite(x))) return null;
  let y: number, m: number, d: number;
  if (fmt === "YMD" || n[0] > 31) [y, m, d] = n;
  else if (fmt === "MDY") [m, d, y] = n;
  else [d, m, y] = n;
  if (y < 100) y += 2000;
  return valid(y, m, d);
}
const valid = (y: number, m: number, d: number): ISODate | null => {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? iso(y, m, d) : null;
};

const H = {
  date: /^(date|fecha|transaction date|effective date|posted)/i,
  description: /(description|descripci|narrative|details|detalle|concepto|merchant|transaction details|particulars)/i,
  amount: /^(amount|monto|importe|valor|value)$/i,
  debit: /(debit|d[eé]bito|withdrawal|retiro|cargo|money out)/i,
  credit: /(credit|cr[eé]dito|deposit|dep[oó]sito|abono|money in)/i,
  balance: /(balance|saldo)/i,
};

/** Adivina las columnas por el encabezado; si no hay, por el contenido. */
export function guessMapping(rows: string[][]): CsvMapping {
  const head = rows[0] ?? [];
  const hasHeader = head.some((h) => /[a-zA-Z]{3,}/.test(h)) && !head.some((h) => parseDate(h, "DMY") !== null);
  const find = (re: RegExp) => { const i = head.findIndex((h) => re.test(h.trim())); return i >= 0 ? i : null; };
  const sample = rows.slice(hasHeader ? 1 : 0, 30);
  const cols = Math.max(...rows.slice(0, 30).map((r) => r.length), 0);
  const ratio = (i: number, test: (v: string) => boolean) => sample.length ? sample.filter((r) => test(r[i] ?? "")).length / sample.length : 0;

  let date = hasHeader ? find(H.date) : null;
  let description = hasHeader ? find(H.description) : null;
  let amount = hasHeader ? find(H.amount) : null;
  const debit = hasHeader ? find(H.debit) : null;
  const credit = hasHeader ? find(H.credit) : null;
  const balance = hasHeader ? find(H.balance) : null;

  const idx = Array.from({ length: cols }, (_, i) => i);
  if (date === null) date = idx.find((i) => ratio(i, (v) => parseDate(v, "DMY") !== null || parseDate(v, "YMD") !== null) > 0.8) ?? 0;
  const isNum = (v: string) => v !== "" && /^[\s$+\-−(]?[\d.,]+\)?$/.test(v.replace(/\s/g, "")) && parseMoney(v) !== null;
  if (amount === null && (debit === null || credit === null))
    amount = idx.find((i) => i !== date && i !== balance && ratio(i, isNum) > 0.8) ?? null;
  if (description === null) {
    const texty = idx.filter((i) => i !== date && i !== amount && i !== balance && i !== debit && i !== credit)
      .map((i) => [i, sample.reduce((a, r) => a + (/[a-zA-Z]{3,}/.test(r[i] ?? "") ? (r[i] ?? "").length : 0), 0)] as const)
      .sort((a, b) => b[1] - a[1]);
    description = texty[0]?.[0] ?? 1;
  }
  // Sin encabezado: el saldo suele ser la última columna numérica distinta del monto.
  let balanceCol = balance;
  if (balanceCol === null && !hasHeader) {
    const nums = idx.filter((i) => i !== date && i !== amount && ratio(i, isNum) > 0.8);
    balanceCol = nums.length ? nums[nums.length - 1] : null;
  }
  // Formato de fecha: si algún primer número pasa de 12 es día/mes; si el segundo pasa de 12 es mes/día.
  let dateFormat: DateFormat = "DMY";
  const nums = sample.map((r) => (r[date!] ?? "").split(/[\/\-.]/).map((x) => +x));
  if (nums.some((n) => n[0] > 31)) dateFormat = "YMD";
  else if (!nums.some((n) => n[0] > 12) && nums.some((n) => n[1] > 12)) dateFormat = "MDY";
  return { hasHeader, date, description, amount: debit !== null && credit !== null ? null : amount, debit: amount === null ? debit : null, credit: amount === null ? credit : null, balance: balanceCol, dateFormat };
}

export type CsvRow = { line: number; date: ISODate; description: string; amountCents: Cents; balanceCents: Cents | null };
export type CsvResult = { rows: CsvRow[]; skipped: { line: number; reason: "date" | "amount" }[] };

export function mapRows(rows: string[][], m: CsvMapping): CsvResult {
  const out: CsvRow[] = [], skipped: CsvResult["skipped"] = [];
  rows.slice(m.hasHeader ? 1 : 0).forEach((r, i) => {
    const line = i + (m.hasHeader ? 2 : 1);
    const date = parseDate(r[m.date] ?? "", m.dateFormat);
    if (!date) return void skipped.push({ line, reason: "date" });
    let amount: Cents | null;
    if (m.amount !== null) amount = parseMoney(r[m.amount] ?? "");
    else {
      const out_ = parseMoney(r[m.debit ?? -1] ?? ""), in_ = parseMoney(r[m.credit ?? -1] ?? "");
      amount = out_ === null && in_ === null ? null : Math.abs(in_ ?? 0) - Math.abs(out_ ?? 0);
    }
    if (amount === null || amount === 0) return void skipped.push({ line, reason: "amount" });
    if (m.invert) amount = -amount;
    out.push({ line, date, description: (r[m.description] ?? "").replace(/\s+/g, " ").trim(), amountCents: amount, balanceCents: m.balance !== null ? parseMoney(r[m.balance] ?? "") : null });
  });
  return { rows: out, skipped };
}

/**
 * Conciliación del saldo: saldo final del archivo frente al saldo que da la app.
 * Toma la fecha más reciente; si hay varias filas ese día, usa el orden del archivo
 * (de viejo a nuevo → la última fila; de nuevo a viejo → la primera).
 */
export function closingBalance(rows: CsvRow[]): Cents | null {
  const withBal = rows.filter((r) => r.balanceCents !== null);
  if (withBal.length === 0) return null;
  const byLine = [...rows].sort((a, b) => a.line - b.line);
  const ascending = byLine.length > 1 && byLine[0].date < byLine[byLine.length - 1].date;
  const last = withBal.reduce((m, r) => (r.date > m ? r.date : m), withBal[0].date);
  const sameDay = withBal.filter((r) => r.date === last).sort((a, b) => a.line - b.line);
  return (ascending ? sameDay[sameDay.length - 1] : sameDay[0]).balanceCents;
}

/** true si el mapeo lee bien al menos la mitad de las filas (para avisar "no reconocemos las columnas"). */
export function mappingWorks(rows: string[][], m: CsvMapping): boolean {
  const body = rows.length - (m.hasHeader ? 1 : 0);
  return body > 0 && mapRows(rows, m).rows.length / body >= 0.5;
}
