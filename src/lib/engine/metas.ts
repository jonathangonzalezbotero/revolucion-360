// Metas amables (25 nov 2026): ritmo, hitos, aportes que vienen de Movimientos y lo que sobró al cerrar el mes.
// Funciones puras, con pruebas en tests/metas.test.ts. Se importan por ruta (`@/lib/engine/metas`).
import { addDays, addMonths, diffDays, monthsUntil, parts, type ISODate } from "./dates";
import type { Cents } from "./money";

// ───────── Hitos ─────────
export const MILESTONES = [25, 50, 75, 100] as const;
export type Milestone = (typeof MILESTONES)[number];

/** ¿Lo ahorrado ya llegó a `pct`% del monto? En centavos enteros, sin redondeos: ahorrado × 100 ≥ monto × pct. */
const atLeast = (targetCents: Cents, savedCents: Cents, pct: number) => targetCents > 0 && savedCents * 100 >= targetCents * pct;

/** Hitos alcanzados con lo que hay ahorrado hoy. Sin monto no hay hitos. */
export const milestonesReached = (targetCents: Cents, savedCents: Cents): Milestone[] => MILESTONES.filter((p) => atLeast(targetCents, savedCents, p));

/** Hitos que se cruzaron con un cambio (antes → después). Bajar nunca "quita" un hito: solo se miran los que se suben. */
export const milestonesCrossed = (targetCents: Cents, beforeCents: Cents, afterCents: Cents): Milestone[] =>
  MILESTONES.filter((p) => !atLeast(targetCents, beforeCents, p) && atLeast(targetCents, afterCents, p));

/** Próximo hito y cuánto falta para llegar a él (redondeado hacia arriba al centavo). */
export function nextMilestone(targetCents: Cents, savedCents: Cents): { pct: Milestone; missingCents: Cents } | null {
  if (targetCents <= 0) return null;
  const pct = MILESTONES.find((p) => !atLeast(targetCents, savedCents, p));
  if (!pct) return null;
  return { pct, missingCents: Math.max(0, Math.ceil((targetCents * pct) / 100) - savedCents) };
}

// ───────── Ritmo ─────────
export type EntryLite = { date: ISODate; amountCents: Cents };

/**
 * Ritmo = lo que aportas al mes, mirando los últimos 3 meses (solo aportes: usar la plata no baja el ritmo).
 * Si la meta tiene menos de 3 meses de historia, se divide por el tiempo que lleva (mínimo 1 mes).
 */
export function paceCents(entries: EntryLite[], today: ISODate, windowMonths = 3): Cents {
  const from = addMonths(today, -windowMonths);
  const inWindow = entries.filter((e) => e.amountCents > 0 && e.date > from && e.date <= today);
  if (inWindow.length === 0) return 0;
  const first = entries.reduce((min, e) => (e.date < min ? e.date : min), today);
  const months = first > from ? Math.max(1, diffDays(today, first) / 30.4375) : windowMonths;
  return Math.round(inWindow.reduce((a, e) => a + e.amountCents, 0) / months);
}

/** A este ritmo, ¿cuándo llegas? Meses = lo que falta / ritmo (hacia arriba), desde hoy. */
export function etaDate(remainingCents: Cents, pace: Cents, today: ISODate): ISODate | null {
  if (remainingCents <= 0) return today;
  if (pace <= 0) return null;
  return addMonths(today, Math.ceil(remainingCents / pace));
}

/**
 * "Con $X más al mes": un paso redondo (1, 2 o 5 × 10ⁿ) de al menos el 10% del ritmo, mínimo 1 unidad de la moneda.
 * Así funciona igual en dólares que en pesos.
 */
export function boostStep(pace: Cents): Cents {
  const x = Math.max(100, pace / 10);
  const exp = 10 ** Math.floor(Math.log10(x));
  const f = x / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}

const ym = (d: ISODate) => d.slice(0, 7);

export type GoalOutlook =
  | { kind: "setup" }                                                     // sin monto: cada aporte igual suma
  | { kind: "reached" }                                                   // ¡llegaste!
  | { kind: "pace"; when: ISODate; tip: { boostCents: Cents; when: ISODate } | null } // a este ritmo llegas en…
  | { kind: "date"; monthlyCents: Cents; when: ISODate }                  // apartando $X al mes llegas en…
  | { kind: "open"; remainingCents: Cents };                              // con monto, sin fecha ni ritmo todavía

/**
 * Cómo va la meta, siempre en positivo: nunca "vas atrasado".
 * Con ritmo manda el ritmo; sin ritmo, la fecha (si ya pasó, se propone el mes que viene, sin regaños).
 */
export function goalOutlook(input: { targetCents: Cents; savedCents: Cents; targetDate: ISODate | null; entries: EntryLite[]; today: ISODate }): GoalOutlook {
  const { targetCents, savedCents, targetDate, entries, today } = input;
  if (targetCents <= 0) return { kind: "setup" };
  const remaining = targetCents - savedCents;
  if (remaining <= 0) return { kind: "reached" };
  const pace = paceCents(entries, today);
  if (pace > 0) {
    const when = etaDate(remaining, pace, today)!;
    const boost = boostStep(pace);
    const faster = etaDate(remaining, pace + boost, today)!;
    return { kind: "pace", when, tip: ym(faster) < ym(when) ? { boostCents: boost, when: faster } : null };
  }
  if (targetDate) {
    const months = Math.max(1, monthsUntil(today, targetDate));
    return { kind: "date", monthlyCents: Math.ceil(remaining / months), when: targetDate >= today ? targetDate : addMonths(today, months) };
  }
  return { kind: "open", remainingCents: remaining };
}

/** Lo que apartaste este mes (aportes del mes en curso, en todas las metas). */
export function monthContributions(entries: EntryLite[], today: ISODate): Cents {
  const p = parts(today), start = `${p.y}-${String(p.m).padStart(2, "0")}-01`;
  return entries.filter((e) => e.amountCents > 0 && e.date >= start && e.date <= today).reduce((a, e) => a + e.amountCents, 0);
}

// ───────── Lo que sobró al cerrar el mes ─────────
/**
 * Te sobró = lo real que entró menos lo que salió, menos lo que ya mandaste a tus metas por transferencia ese mes
 * (las transferencias no son gasto, así que sin restarlas se contaría dos veces). Si faltó, no se pregunta nada.
 * Una línea de meta pagada a mano además de la transferencia resta dos veces: se ofrece de menos, nunca de más.
 */
export const leftoverOf = (realNetCents: Cents, transferAportesCents: Cents = 0): Cents => Math.max(0, Math.round(realNetCents) - Math.max(0, Math.round(transferAportesCents)));

/** El aviso "te sobraron $X" sale para el último mes cerrado, solo si es el mes pasado o este (no se revive un mes viejo). */
export function leftoverMonthIsRecent(p: { year: number; month: number }, today: ISODate): boolean {
  const t = parts(today);
  const diff = t.y * 12 + (t.m - 1) - (p.year * 12 + (p.month - 1));
  return diff >= 0 && diff <= 1;
}

// ───────── "¿Tiene que ver con una meta?" en Movimientos ─────────
export type GoalChoice = { role: "in" | "out"; goalId: string } | null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valor del selector: "" (ninguna), "in:<meta>" (aporte a…) u "out:<meta>" (pagado con…). Cualquier otra cosa no sirve (undefined). */
export function parseGoalChoice(v: string): GoalChoice | undefined {
  if (v === "") return null;
  const [role, goalId] = v.split(":");
  if ((role === "in" || role === "out") && goalId && UUID.test(goalId)) return { role, goalId };
  return undefined;
}
export const goalChoiceValue = (c: GoalChoice): string => (c ? `${c.role}:${c.goalId}` : "");

/** Lo que muestra el selector para un movimiento: el aporte o uso que hoy le cuenta a una meta (sea elegido o automático). */
export const choiceOfEntry = (e: { goalId: string; amountCents: Cents } | undefined): string =>
  e && e.amountCents !== 0 ? `${e.amountCents > 0 ? "in" : "out"}:${e.goalId}` : "";

/** En una transferencia, la elección vive en la punta que corresponde: el aporte en la que entra, el uso en la que sale. */
export function legFor(role: "in" | "out", tx: { id: string; amountCents: Cents }, pair: { id: string; amountCents: Cents } | null): string {
  if (!pair) return tx.id;
  const entering = tx.amountCents > 0 ? tx.id : pair.amountCents > 0 ? pair.id : tx.id;
  const leaving = entering === tx.id ? pair.id : tx.id;
  return role === "in" ? entering : leaving;
}

// ───────── Sincronizar movimientos → aportes de la meta ─────────
export type SyncTx = {
  id: string; accountId: string | null; date: ISODate; amountCents: Cents; kind: "normal" | "transfer"; pairId: string | null;
  deleted: boolean; isSplit: boolean; goalId: string | null; goalRole: "in" | "out" | "none" | null;
};
/** endedOn: el día en que se cumplió o se archivó (la que llegue primero); desde ese día deja de recibir transferencias solas. */
export type SyncGoal = { id: string; accountId: string | null; linkedOn: ISODate | null; archived: boolean; completed: boolean; endedOn?: ISODate | null };
export type LinkedEntry = { id: string; transactionId: string; goalId: string; amountCents: Cents; kind: string; date: ISODate };
export type WantedEntry = { goalId: string; amountCents: Cents; kind: "auto" | "tx_in" | "used"; date: ISODate };

/**
 * Qué aporte o uso le corresponde a cada movimiento:
 * 1. Borrado, o el original de un dividido → ninguno.
 * 2. El usuario eligió en Movimientos ("Aporte a…" / "Pagado con…") → ese, con el monto del movimiento (si la meta no está archivada).
 * 3. Eligió "Ninguna" → ninguno.
 * 4. Transferencia que ENTRA a la cuenta de una meta → aporte automático, solo si:
 *    - la otra punta no tiene ya una elección (nunca se cuenta dos veces),
 *    - hay UNA sola meta activa en esa cuenta (si hay varias, el usuario elige en Movimientos),
 *    - y es del día en que se unió la cuenta en adelante (nunca transferencias viejas de golpe).
 *    Un aporte automático que ya existe se queda en su meta aunque después llegue otra meta a esa cuenta.
 */
export function wantedEntries(txs: SyncTx[], goals: SyncGoal[], existing: LinkedEntry[]): Map<string, WantedEntry> {
  const goal = new Map(goals.map((g) => [g.id, g]));
  const byTx = new Map(existing.map((e) => [e.transactionId, e]));
  const chosen = new Set(txs.filter((t) => !t.deleted && (t.goalRole === "in" || t.goalRole === "out")).map((t) => t.id));
  const out = new Map<string, WantedEntry>();
  for (const t of txs) {
    if (t.deleted || t.isSplit) continue;
    const abs = Math.abs(t.amountCents);
    if (abs === 0) continue;
    if ((t.goalRole === "in" || t.goalRole === "out") && t.goalId) {
      const g = goal.get(t.goalId);
      if (g && !g.archived) out.set(t.id, { goalId: g.id, amountCents: t.goalRole === "in" ? abs : -abs, kind: t.goalRole === "in" ? "tx_in" : "used", date: t.date });
      continue;
    }
    if (t.goalRole !== null || t.kind !== "transfer" || t.amountCents <= 0 || !t.accountId) continue;
    if (t.pairId && chosen.has(t.pairId)) continue;
    const prev = byTx.get(t.id);
    const sticky = prev && prev.kind === "auto" ? goal.get(prev.goalId) : undefined;
    if (sticky && !sticky.archived) {
      out.set(t.id, { goalId: sticky.id, amountCents: abs, kind: "auto", date: t.date });
      continue;
    }
    // Las metas que usaban esa cuenta EL DÍA de la transferencia: así, cuando una de dos metas se cumple, sus transferencias
    // viejas (que quedaron sin repartir) no se van de golpe a la otra.
    const candidates = goals.filter((g) => g.accountId === t.accountId && g.linkedOn !== null && t.date >= g.linkedOn && !(g.endedOn && t.date >= g.endedOn));
    const only = candidates.length === 1 ? candidates[0] : null;
    if (only && !only.archived && !only.completed) out.set(t.id, { goalId: only.id, amountCents: abs, kind: "auto", date: t.date });
  }
  return out;
}

export type SyncPlan = {
  insert: (WantedEntry & { transactionId: string })[];
  update: (WantedEntry & { id: string })[];
  remove: string[];
};

/** Diferencia entre lo que hay y lo que corresponde: qué aportes crear, cuáles cambiar y cuáles quitar. Sin cambios, todo vacío. */
export function planSync(wanted: Map<string, WantedEntry>, existing: LinkedEntry[]): SyncPlan {
  const plan: SyncPlan = { insert: [], update: [], remove: [] };
  const seen = new Set<string>();
  for (const e of existing) {
    seen.add(e.transactionId);
    const w = wanted.get(e.transactionId);
    if (!w) plan.remove.push(e.id);
    else if (w.goalId !== e.goalId || w.amountCents !== e.amountCents || w.kind !== e.kind || w.date !== e.date) plan.update.push({ id: e.id, ...w });
  }
  for (const [transactionId, w] of wanted) if (!seen.has(transactionId)) plan.insert.push({ transactionId, ...w });
  return plan;
}

/** Suma por meta (lo ahorrado = aportes − usos). */
export function savedByGoal(entries: { goalId: string; amountCents: Cents }[]): Map<string, Cents> {
  const m = new Map<string, Cents>();
  for (const e of entries) m.set(e.goalId, (m.get(e.goalId) ?? 0) + e.amountCents);
  return m;
}

/** Ventana de fechas que hay que revisar para las transferencias automáticas: desde la unión más antigua hasta hoy (+1 día por zona horaria). */
export function autoWindow(goals: SyncGoal[], today: ISODate): { from: ISODate; to: ISODate } | null {
  const dates = goals.filter((g) => !g.archived && !g.completed && g.accountId && g.linkedOn).map((g) => g.linkedOn as ISODate);
  if (dates.length === 0) return null;
  return { from: dates.reduce((a, b) => (a < b ? a : b)), to: addDays(today, 1) };
}

/** ¿Varias metas activas comparten la cuenta? Entonces las transferencias no cuentan solas: se elige en Movimientos. */
export function sharedAccounts(goals: SyncGoal[]): Set<string> {
  const count = new Map<string, number>();
  for (const g of goals) if (!g.archived && !g.completed && g.accountId) count.set(g.accountId, (count.get(g.accountId) ?? 0) + 1);
  return new Set([...count].filter(([, n]) => n > 1).map(([a]) => a));
}

// ───────── Retos opcionales ─────────
/** Lista fija de retos sugeridos. Los textos viven en la pantalla (messages.ts). */
export const CHALLENGES = ["delivery", "cafe", "redondeo"] as const;
export type Challenge = (typeof CHALLENGES)[number];
export const isChallenge = (v: string): v is Challenge => (CHALLENGES as readonly string[]).includes(v);
