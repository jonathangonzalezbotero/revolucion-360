// Cálculos propios del Diagnóstico (puros). Los indicadores y la prioridad salen del motor (diagnose, priority).
import { DEFAULT_BENCHMARKS, type Benchmarks, type Indicator, type IndicatorKey, type Level } from "@/lib/engine";

export const KEYS: IndicatorKey[] = ["surplus", "saving", "debt", "emergency", "dependency"];

/** Referencias del país sobre las generales: solo se toman los números válidos. */
export function benchmarksFrom(raw: unknown): Benchmarks {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = {} as Benchmarks;
  for (const k of KEYS) {
    const v = src[k] && typeof src[k] === "object" ? (src[k] as Record<string, unknown>) : {};
    const n = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) ? x : d);
    out[k] = { good: n(v.good, DEFAULT_BENCHMARKS[k].good), warn: n(v.warn, DEFAULT_BENCHMARKS[k].warn) };
  }
  return out;
}

/** Tono de la etiqueta de nivel (siempre acompañada de su palabra). */
export const levelTone = (l: Level): "ok" | "warn" | "bad" | "neutral" => (l === "good" ? "ok" : l === "warn" ? "warn" : l === "bad" ? "bad" : "neutral");

/** Cuántos indicadores hay en cada nivel, en el orden en que se muestran. */
export function levelCounts(ind: Indicator[]): { level: Level; n: number }[] {
  return (["good", "warn", "bad", "nodata"] as Level[]).map((level) => ({ level, n: ind.filter((i) => i.level === level).length })).filter((x) => x.n > 0);
}

/** Porcentaje corto: 0.1023 → "10.2%", 0.68 → "68%" (los enteros sin decimal). */
export function pctText(v: number, decimals = 1): string {
  const r = Number((v * 100).toFixed(decimals));
  return `${Number.isInteger(r) ? r.toFixed(0) : r.toFixed(decimals)}%`;
}
/** Meses: 1.36 → "1.4", 3 → "3". */
export function monthsText(v: number): string {
  const r = Number(v.toFixed(1));
  return Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1);
}

/** Valor grande de la tarjeta. Sin datos: guion. */
export function valueText(i: Indicator): string {
  if (i.value === null) return "—";
  if (i.key === "emergency") return monthsText(Math.max(0, i.value));
  return pctText(i.value, i.key === "dependency" ? 0 : 1);
}

/** Números de la referencia ya escritos para el texto ("10%", "3"). */
export function referenceVars(key: IndicatorKey, b: Benchmarks): { good: string; warn: string } {
  const r = b[key];
  if (key === "emergency") return { good: monthsText(r.good), warn: monthsText(r.warn) };
  return { good: pctText(r.good), warn: pctText(r.warn) };
}

/** Lista de nombres en una frase: "A", "A y B", "A, B y C". */
export function joinNames(names: string[], and: string, max = 3): string {
  const xs = names.filter(Boolean).slice(0, max);
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} ${and} ${xs[xs.length - 1]}`;
}

/**
 * Fondo de emergencia sin marcar (ninguna cuenta ni meta marcada como fondo): no es "$0", es "sin datos".
 * Así no se vuelve la prioridad por un dato que falta. Se aplica antes de `priority()` y de contar niveles.
 */
export function withFundState(ind: Indicator[], fundMarked: boolean): Indicator[] {
  return fundMarked ? ind : ind.map((i) => (i.key === "emergency" ? { ...i, value: null, level: "nodata" as Level } : i));
}

/** Hay con qué diagnosticar: un plan con ingresos en el mes. Si no, nunca se inventan indicadores. */
export const canDiagnose = (lines: number, incomeCents: number) => lines > 0 && incomeCents > 0;
