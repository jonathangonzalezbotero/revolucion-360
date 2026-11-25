// Cálculos propios de Metas (puros, con pruebas en tests/cuentas-metas.test.ts).
import { ILLU } from "@/lib/images";
import { daysInMonth, iso, monthShort, parts, payDatesInMonth, type Cents, type GoalPlan, type ISODate, type Tier } from "@/lib/engine";
import { etaDate, type GoalOutlook } from "@/lib/engine/metas";
import { isGoalKey, readObjectives, type GoalKey } from "@/app/(onboarding)/bienvenida/lib";

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

/**
 * Objetivo de la bienvenida → tipo de meta. Sirve para prellenar la sugerencia y para leer las metas que antes
 * creaba "Empezar en blanco" con la clave del objetivo como tipo (`kind` = 'invest', 'business'…).
 */
export const OBJECTIVE_TYPE: Record<GoalKey, GoalType> = { debts: "debt", trip: "trip", emergency: "fund", clarity: "other", invest: "invest", business: "other" };

/** El tipo es texto libre: se reconoce si coincide con una de las sugerencias (en cualquier idioma) o con la clave de un objetivo. */
export function typeOf(kind: string, labels: Record<GoalType, string>[]): GoalType {
  if (isGoalKey(kind.trim())) return OBJECTIVE_TYPE[kind.trim() as GoalKey];
  const k = kind.trim().toLowerCase();
  for (const set of labels) for (const t of GOAL_TYPES) if (set[t].toLowerCase() === k) return t;
  return "other";
}

/** El tipo que escribió a mano (si es "otra" y no es una clave ni la palabra "Otra"/"Other"); vacío si no hay. */
export function customKind(kind: string, labels: Record<GoalType, string>[]): string {
  const k = kind.trim();
  if (!k || isGoalKey(k) || typeOf(k, labels) !== "other" || labels.some((set) => set.other.toLowerCase() === k.toLowerCase())) return "";
  return k;
}

/** Lo que se muestra como tipo: nunca la clave cruda. Un tipo reconocido sale en el idioma de la pantalla; uno escrito a mano, tal cual. */
export function kindLabel(kind: string, shown: Record<GoalType, string>, labels: Record<GoalType, string>[]): string {
  const t = typeOf(kind, labels);
  return t !== "other" ? shown[t] : customKind(kind, labels) || shown.other;
}

/** Orden de las metas: primero las que tienen algo ahorrado (de mayor a menor), después las de $0 en su orden de siempre. */
export function sortGoals<T extends { savedCents: Cents }>(goals: readonly T[]): T[] {
  return goals.map((g, i) => ({ g, i, v: Math.max(0, g.savedCents) })).sort((a, b) => b.v - a.v || a.i - b.i).map((x) => x.g);
}

/** Sugerencias de Metas: los objetivos de la bienvenida que siguen guardados en el perfil, con el tipo para prellenar. */
export function objectiveSuggestions(prefs: Record<string, unknown>): { key: GoalKey; type: GoalType }[] {
  return readObjectives(prefs).map((key) => ({ key, type: OBJECTIVE_TYPE[key] }));
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

// ───────── Aporte con frecuencia → línea del plan (25 nov 2026, tarde) ─────────
/** "¿Cuánto vas a aportar?": semanal, cada 2 semanas, mensual o una vez. Son frecuencias del plan anual. */
export const CONTRIB_FREQS = ["weekly", "fortnightly", "monthly", "once"] as const;
export type ContribFreq = (typeof CONTRIB_FREQS)[number];
export type Contribution = { amountCents: Cents; frequency: ContribFreq };
export const asContribFreq = (v: string): ContribFreq | null => ((CONTRIB_FREQS as readonly string[]).includes(v) ? (v as ContribFreq) : null);

/** Lo que el aporte pone al mes, en promedio: semanal × 52 / 12, cada 2 semanas × 26 / 12. "Una vez" no es un ritmo: 0. */
export function monthlyEquivalent(c: Contribution): Cents {
  switch (c.frequency) {
    case "weekly": return Math.round((c.amountCents * 52) / 12);
    case "fortnightly": return Math.round((c.amountCents * 26) / 12);
    case "monthly": return c.amountCents;
    default: return 0;
  }
}

/** Meses de la línea del aporte en el año en curso: desde este mes hasta el de la meta (o diciembre si no tiene fecha o es de otro año). */
export function contribRange(today: ISODate, targetDate: ISODate | null): { fromMonth: number; toMonth: number } {
  return targetDate ? planRange(today, targetDate) : { fromMonth: parts(today).m, toMonth: 12 };
}

/**
 * Primer día de pago de la línea del aporte. Sin línea o si cambia la frecuencia: hoy. Misma frecuencia: se conserva el que tenía
 * (aunque sea vacío), así un cambio de nombre no mueve los pagos. Un "una vez" que quedó en un mes pasado se vuelve a fechar hoy.
 */
export function contribPayDate(frequency: ContribFreq, current: { frequency: string; firstPayDate: ISODate | null } | null, today: ISODate): ISODate | null {
  if (!current || current.frequency !== frequency) return today;
  if (frequency === "once" && (!current.firstPayDate || current.firstPayDate.slice(0, 7) < today.slice(0, 7))) return today;
  return current.firstPayDate;
}

/**
 * Celdas de la línea del aporte desde `fromMonth` hasta diciembre: días de pago reales del mes × monto dentro de la ventana
 * (hasta el mes de la meta), 0 después. Los meses anteriores a `fromMonth` (pasados) no se tocan. "Una vez" cae en su mes.
 */
export function contribCells(c: Contribution, year: number, firstPayDate: ISODate | null, fromMonth: number, toMonth: number): { month: number; amountCents: Cents }[] {
  const out: { month: number; amountCents: Cents }[] = [];
  for (let m = fromMonth; m <= 12; m++) {
    const inside = c.frequency === "once" || m <= toMonth;
    out.push({ month: m, amountCents: inside ? payDatesInMonth(c.frequency, firstPayDate, year, m).length * c.amountCents : 0 });
  }
  return out;
}

/** Cómo va la meta: con el ritmo del plan ("Aportando $50 por semana llegas en…") o, sin él, lo de siempre. */
export type MetaOutlook = GoalOutlook | { kind: "plan"; amountCents: Cents; frequency: Exclude<ContribFreq, "once">; when: ISODate };

/**
 * El ritmo de la meta sale de su línea del plan (el aporte que elegiste) y manda sobre el ritmo de los aportes pasados.
 * Sin línea, o con un aporte de "una vez", queda lo que ya calculaba el motor (ritmo real, fecha o lo que falta).
 * Llegaste o sin monto: siempre lo del motor.
 */
export function planOutlook(base: GoalOutlook, contribution: Contribution | null, remainingCents: Cents, today: ISODate): MetaOutlook {
  if (base.kind === "setup" || base.kind === "reached" || !contribution || contribution.frequency === "once") return base;
  const monthly = monthlyEquivalent(contribution);
  const when = etaDate(remainingCents, monthly, today);
  return when ? { kind: "plan", amountCents: contribution.amountCents, frequency: contribution.frequency, when } : base;
}
