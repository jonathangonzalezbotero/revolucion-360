// Duplicados, transferencias y unión movimiento ↔ línea del plan.
import { diffDays, parts, type ISODate } from "./dates";
import type { Cents } from "./money";

export type Tx = { id?: string; accountId: string | null; date: ISODate; amountCents: Cents; description: string };
export type MatchConfig = { amountPct: number; days: number; duplicateDays: number };
export const DEFAULT_MATCH: MatchConfig = { amountPct: 5, days: 5, duplicateDays: 2 };

export const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Parecido de descripciones (0 a 1) por palabras en común. */
export function similarity(a: string, b: string): number {
  const A = new Set(normalize(a).split(" ").filter((w) => w.length > 1)), B = new Set(normalize(b).split(" ").filter((w) => w.length > 1));
  if (A.size === 0 || B.size === 0) return normalize(a) === normalize(b) ? 1 : 0;
  let common = 0;
  A.forEach((w) => { if (B.has(w)) common++; });
  return common / Math.min(A.size, B.size);
}

/** Duplicado: misma cuenta, mismo monto, fechas a 2 días o menos y descripción parecida. Se avisa, no se borra solo. */
export function isDuplicate(a: Tx, b: Tx, cfg: MatchConfig = DEFAULT_MATCH): boolean {
  return a.accountId === b.accountId && a.amountCents === b.amountCents
    && Math.abs(diffDays(a.date, b.date)) <= cfg.duplicateDays && similarity(a.description, b.description) >= 0.5;
}
export function findDuplicate(candidate: Tx, existing: Tx[], cfg: MatchConfig = DEFAULT_MATCH): Tx | null {
  return existing.find((e) => isDuplicate(candidate, e, cfg)) ?? null;
}

/** Transferencia entre cuentas propias: montos opuestos, cuentas distintas, a 2 días o menos. No es ingreso ni gasto. */
export function findTransferPair(tx: Tx, others: Tx[], cfg: MatchConfig = DEFAULT_MATCH): Tx | null {
  return others.find((o) => o.accountId !== tx.accountId && o.accountId !== null && tx.accountId !== null
    && o.amountCents === -tx.amountCents && Math.abs(diffDays(o.date, tx.date)) <= cfg.duplicateDays) ?? null;
}

export type LineCandidate = { id: string; name: string; kind: "income" | "expense"; plannedCents: Cents; alreadyPaid: boolean };

/**
 * Sugerencia de línea del plan: mismo sentido, monto a ±5% del plan del mes y nombre parecido si lo hay.
 * La fecha debe caer en el mes de la celda o a 5 días o menos de él. El usuario confirma: nunca se une sola.
 */
export function suggestLine(tx: Tx, month: number, lines: LineCandidate[], cfg: MatchConfig = DEFAULT_MATCH): LineCandidate | null {
  const p = parts(tx.date);
  const nearMonth = p.m === month || (p.d <= cfg.days && p.m === (month % 12) + 1) || (p.d > 28 - cfg.days && (p.m % 12) + 1 === month);
  if (!nearMonth) return null;
  const abs = Math.abs(tx.amountCents);
  const scored = lines
    .filter((l) => !l.alreadyPaid && l.plannedCents > 0 && (l.kind === "income") === (tx.amountCents > 0))
    .map((l) => ({ l, amountDiff: Math.abs(abs - l.plannedCents) / l.plannedCents, name: similarity(tx.description, l.name) }))
    .filter((x) => x.amountDiff <= cfg.amountPct / 100 || x.name >= 0.99)
    .sort((a, b) => b.name - a.name || a.amountDiff - b.amountDiff);
  return scored[0]?.l ?? null;
}

/** Regla de categoría: la primera cuyo patrón aparece en la descripción. */
export function applyRules<T extends { pattern: string }>(description: string, rules: T[]): T | null {
  const d = normalize(description);
  return rules.find((r) => r.pattern && d.includes(normalize(r.pattern))) ?? null;
}

/** Partes de un movimiento dividido: deben sumar exactamente el total. */
export const splitIsValid = (totalCents: Cents, partsCents: Cents[]): boolean =>
  partsCents.length >= 2 && partsCents.every((p) => p !== 0 && Math.sign(p) === Math.sign(totalCents)) && partsCents.reduce((a, b) => a + b, 0) === totalCents;
