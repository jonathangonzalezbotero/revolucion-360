// Cálculos propios de Metas (puros, con pruebas en tests/cuentas-metas.test.ts).
import { ILLU } from "@/lib/images";
import { daysInMonth, iso, monthShort, parts, type Cents, type GoalPlan, type ISODate, type Tier } from "@/lib/engine";

export const GOAL_TYPES = ["trip", "fund", "buy", "debt", "invest", "other"] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

/** Color de cada tipo sugerido (solo tokens). Un tipo escrito a mano usa el de "otra". */
export const TYPE_COLOR: Record<GoalType, string> = {
  trip: "var(--amarillo-oscuro)", fund: "var(--teal)", buy: "var(--azul-oscuro)", debt: "var(--naranja)", invest: "var(--tinta)", other: "var(--gris-verde)",
};

/** Ilustración de cada tipo (mockup Metas, mapa IMG). Un tipo escrito a mano usa la de "otra". */
export const TYPE_IMG: Record<GoalType, string> = {
  trip: ILLU.metaViaje, fund: ILLU.metaEmergencia, buy: ILLU.metaComprar, debt: ILLU.metaDeuda, invest: ILLU.metaInversion, other: ILLU.metaOtra,
};

/** El tipo es texto libre: se reconoce si coincide con una de las sugerencias (en cualquier idioma). */
export function typeOf(kind: string, labels: Record<GoalType, string>[]): GoalType {
  const k = kind.trim().toLowerCase();
  for (const set of labels) for (const t of GOAL_TYPES) if (set[t].toLowerCase() === k) return t;
  return "other";
}

/** "2027-12" → "2027-12-31". La meta se guarda al último día del mes: así "Dic 2027" desde el 24 nov 2026 son 13 meses. */
export function endOfMonth(ym: string): ISODate {
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  return iso(y, m, daysInMonth(y, m));
}
export const ymOf = (d: ISODate) => d.slice(0, 7);
export const isYm = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/** Meses para elegir "¿Para cuándo?": desde el mes actual, `count` meses. */
export function monthOptions(today: ISODate, count = 72): string[] {
  const p = parts(today);
  return Array.from({ length: count }, (_, i) => {
    const total = p.y * 12 + (p.m - 1) + i;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
  });
}

/** Fecha que se guarda: sin mes → sin fecha; si el mes no cambió se conserva el día que ya tenía. */
export function resolveTargetDate(ym: string, current: ISODate | null): ISODate | null {
  if (!isYm(ym)) return null;
  return current && ymOf(current) === ym ? current : endOfMonth(ym);
}

/** "Dic 2027" */
export function whenLabel(d: ISODate | string, locale = "es"): string {
  return `${monthShort(+d.slice(5, 7), locale)} ${d.slice(0, 4)}`;
}

/** Plan Gratis: tope de metas activas (ni cumplidas ni archivadas). El tope lo define Admin. */
export const atFreeLimit = (tier: Tier, activeGoals: number, limit: number): boolean => tier === "free" && activeGoals >= limit;

/** Meses del año en curso que cubre la línea del plan: del mes actual hasta la fecha de la meta (o diciembre). */
export function planRange(today: ISODate, targetDate: ISODate): { fromMonth: number; toMonth: number } {
  const a = parts(today), b = parts(targetDate);
  const toMonth = b.y > a.y ? 12 : b.y < a.y ? a.m : Math.max(a.m, b.m);
  return { fromMonth: a.m, toMonth };
}

export type GoalStatus = "setup" | "reached" | "noDate" | "late" | "saving";
/**
 * - setup: sin monto → no hay nada que calcular
 * - reached: ahorrado ≥ monto
 * - noDate: con monto y sin fecha → se sabe cuánto falta, no cuánto apartar
 * - late: la fecha ya pasó y no se llegó
 * - saving: aporte mensual y semanal calculados
 */
export function goalStatus(gp: GoalPlan, targetCents: Cents, targetDate: ISODate | null, today: ISODate): GoalStatus {
  if (targetCents <= 0) return "setup";
  if (gp.reached) return "reached";
  if (!targetDate || gp.monthlyCents === null) return "noDate";
  if (targetDate < today) return "late";
  return "saving";
}

/** No se puede usar más dinero del que hay ahorrado en la meta. */
export const canUse = (amountCents: Cents, savedCents: Cents): boolean => amountCents > 0 && amountCents <= savedCents;
