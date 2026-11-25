// Hábito de uso: "Hoy puedes gastar", repaso semanal y avisos del hábito.
// Funciones PURAS (sin base de datos, sin red), con pruebas en tests/habito.test.ts. Dinero siempre en centavos.
// No se exporta desde ./index (se importa por su ruta: "@/lib/engine/habito").
import { addDays, daysInMonth, isoWeekday, parts, todayIn, weekStart, type ISODate } from "./dates";
import type { Cents } from "./money";
import { cellMap, cellOf, payDatesInMonth, type PlanCell, type PlanLine } from "./plan";

export type HabitCategoryKind = "income" | "expense" | "debt" | "saving" | "goal";
export type HabitCategory = { id: string; kind: HabitCategoryKind };
export type HabitLine = Pick<PlanLine, "id" | "name" | "kind" | "categoryId" | "year" | "frequency" | "amountCents" | "firstPayDate" | "debtId" | "goalId" | "investmentId">;

// ───────── Qué es "fijo" y qué es "del día a día" ─────────
/**
 * Por qué una línea de gasto del plan cuenta como pago FIJO (Jonathan, 25 nov 2026: flexible = todo gasto que no es un pago fijo del plan).
 * El modelo no guarda "fijo" en la línea, así que se deduce de lo que sí existe, en este orden:
 * - `override`: el usuario lo eligió (reservado para un interruptor futuro en Plan; hoy nadie lo escribe).
 * - `category`: su categoría es de deudas, ahorro o metas.
 * - `linked`: la línea está unida a una deuda, una meta o una inversión.
 * - `one_off`: frecuencia anual o pago único (seguros, matrículas, registros).
 * - `dated`: mensual con día de pago elegido (el asistente y Plan dejan las mensuales sin fecha; ponérsela es decir "se paga tal día").
 * - `recurring`: tiene un recurrente activo apuntando a ella (suscripciones, débitos automáticos).
 * - `paid_as_bill`: este año ya se pagó "como cuenta": marcada "Pagado · a mano" en algún mes, o cubierta en un mes con
 *   un solo movimiento por fecha de pago (el arriendo llega en 1 pago; el supermercado, en muchos).
 * Todo lo demás es del día a día (comida, supermercado, salidas, transporte…).
 */
export type FixedReason = "override" | "category" | "linked" | "one_off" | "dated" | "recurring" | "paid_as_bill";

export type LinkedTx = { lineId: string; date: ISODate; amountCents: Cents };
export type FixedInput = {
  lines: HabitLine[];
  categories: HabitCategory[];
  cells: PlanCell[];
  /** Marcas "Pagado · a mano" del año, como "lineId:mes". */
  marks: Iterable<string>;
  /** Líneas con un recurrente activo. */
  recurringLineIds: Iterable<string>;
  /** Movimientos que cuentan (sin transferencias ni padres divididos) unidos a una línea, del año del plan. */
  linked: LinkedTx[];
  /** true = fijo, false = del día a día. Gana sobre todo lo demás. */
  overrides?: ReadonlyMap<string, boolean>;
};

const FIXED_CATEGORY: ReadonlySet<HabitCategoryKind> = new Set(["debt", "saving", "goal"]);

/** Tolerancia de "pagado" igual a `lineMonthStatus`: 0.5% o $1. */
const covers = (realCents: Cents, plannedCents: Cents) => realCents >= plannedCents - Math.max(100, Math.round(plannedCents * 0.005));

/** Líneas de gasto fijas con su motivo. Las que no aparecen son del día a día. Los ingresos nunca aparecen. */
export function fixedReasons(input: FixedInput): Map<string, FixedReason> {
  const cats = new Map(input.categories.map((c) => [c.id, c.kind]));
  const marked = new Set<string>();
  for (const k of input.marks) marked.add(k.split(":")[0]);
  const recurring = new Set(input.recurringLineIds);
  const map = cellMap(input.cells);
  // movimientos unidos por línea y mes
  const byLineMonth = new Map<string, Cents[]>();
  for (const t of input.linked) {
    const key = `${t.lineId}:${parts(t.date).m}`;
    byLineMonth.set(key, [...(byLineMonth.get(key) ?? []), t.amountCents]);
  }
  const paidAsBill = (l: HabitLine) => {
    if (marked.has(l.id)) return true;
    for (let m = 1; m <= 12; m++) {
      const txs = byLineMonth.get(`${l.id}:${m}`);
      if (!txs?.length) continue;
      const planned = cellOf(map, l.id, m);
      if (planned <= 0) continue;
      const payments = Math.max(1, payDatesInMonth(l.frequency, l.firstPayDate, l.year, m).length);
      const real = Math.abs(txs.reduce((a, b) => a + b, 0));
      if (txs.length <= payments && covers(real, planned)) return true;
    }
    return false;
  };

  const out = new Map<string, FixedReason>();
  for (const l of input.lines) {
    if (l.kind !== "expense") continue;
    const o = input.overrides?.get(l.id);
    if (o !== undefined) { if (o) out.set(l.id, "override"); continue; }
    const kind = cats.get(l.categoryId);
    if (kind && FIXED_CATEGORY.has(kind)) out.set(l.id, "category");
    else if (l.debtId || l.goalId || l.investmentId) out.set(l.id, "linked");
    else if (l.frequency === "yearly" || l.frequency === "once") out.set(l.id, "one_off");
    else if (l.frequency === "monthly" && l.firstPayDate) out.set(l.id, "dated");
    else if (recurring.has(l.id)) out.set(l.id, "recurring");
    else if (paidAsBill(l)) out.set(l.id, "paid_as_bill");
  }
  return out;
}
export const fixedLineIds = (input: FixedInput): Set<string> => new Set(fixedReasons(input).keys());

// ───────── Presupuesto y gasto del día a día ─────────
export type ByCategory = Map<string | null, Cents>;
const add = (m: ByCategory, k: string | null, v: Cents) => m.set(k, (m.get(k) ?? 0) + v);

/** Lo planeado en el mes para el día a día (líneas de gasto que no son fijas), total y por categoría. */
export function flexibleBudget(lines: HabitLine[], cells: PlanCell[], month: number, fixed: ReadonlySet<string>): { totalCents: Cents; byCategory: ByCategory } {
  const map = cellMap(cells), byCategory: ByCategory = new Map();
  let totalCents = 0;
  for (const l of lines) {
    if (l.kind !== "expense" || fixed.has(l.id)) continue;
    const v = cellOf(map, l.id, month);
    if (v === 0) continue;
    totalCents += v;
    add(byCategory, l.categoryId, v);
  }
  return { totalCents, byCategory };
}

export type HabitTx = { date: ISODate; amountCents: Cents; categoryId: string | null; planLineId: string | null; kind: "normal" | "transfer"; isSplit: boolean };

/** Un pago fijo del mes que todavía puede llegar SIN unir a su línea (ej. arriendo marcado "Pagado · a mano" o importado sin confirmar). */
export type FixedSlot = { lineId: string; categoryId: string; perPaymentCents: Cents; slots: number };

/**
 * Pagos fijos del mes que aún no tienen su movimiento unido: uno por fecha de pago (mínimo 1) menos los movimientos ya unidos.
 * Sirven para que un movimiento SIN unir que es claramente ese pago (mismo monto ±5%, misma categoría o sin categoría)
 * no se cuente como gasto del día a día. Es la misma tolerancia con la que Movimientos sugiere unir (`suggestLine`).
 */
export function fixedSlots(lines: HabitLine[], cells: PlanCell[], month: number, fixed: ReadonlySet<string>, linkedThisMonth: { lineId: string }[]): FixedSlot[] {
  const map = cellMap(cells), used = new Map<string, number>();
  for (const t of linkedThisMonth) used.set(t.lineId, (used.get(t.lineId) ?? 0) + 1);
  const out: FixedSlot[] = [];
  for (const l of lines) {
    if (l.kind !== "expense" || !fixed.has(l.id)) continue;
    const planned = cellOf(map, l.id, month);
    if (planned <= 0) continue;
    const payments = Math.max(1, payDatesInMonth(l.frequency, l.firstPayDate, l.year, month).length);
    const slots = payments - (used.get(l.id) ?? 0);
    if (slots > 0) out.push({ lineId: l.id, categoryId: l.categoryId, perPaymentCents: Math.round(planned / payments), slots });
  }
  return out;
}
const SLOT_PCT = 0.05;

/**
 * Lo gastado en el día a día: todo gasto que NO es el pago de una línea fija.
 * - Transferencias y padres divididos no cuentan (igual que `counts` en data.ts).
 * - Unido a una línea: cuenta solo si la línea es de gasto y no es fija (va a la categoría de la línea).
 * - Sin línea: cuenta si su categoría no es de ingresos, deudas, ahorro ni metas (sin categoría también cuenta).
 *   Una devolución (positiva) solo resta si su categoría es de gasto; un positivo sin categoría se toma como ingreso.
 * - Sin línea pero con el monto de un pago fijo que aún no tiene su movimiento (`fixedSlots`): es ese pago, no cuenta.
 */
export function flexibleSpend(txs: HabitTx[], lines: HabitLine[], categories: HabitCategory[], fixed: ReadonlySet<string>, slots: FixedSlot[] = []): { totalCents: Cents; byCategory: ByCategory } {
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const cats = new Map(categories.map((c) => [c.id, c.kind]));
  const byCategory: ByCategory = new Map();
  const free = slots.map((x) => ({ ...x }));
  let totalCents = 0;
  // Los más grandes primero: así un pago fijo grande no se "gasta" su hueco con uno chico parecido.
  const ordered = [...txs].sort((a, b) => a.amountCents - b.amountCents);
  for (const t of ordered) {
    if (t.kind !== "normal" || t.isSplit || t.amountCents === 0) continue;
    const line = t.planLineId ? lineById.get(t.planLineId) : undefined;
    let cat: string | null;
    if (line) {
      if (line.kind !== "expense" || fixed.has(line.id)) continue;
      cat = line.categoryId;
    } else {
      const kind = t.categoryId ? cats.get(t.categoryId) : undefined;
      if (kind && kind !== "expense") continue;
      if (t.amountCents > 0 && kind !== "expense") continue;
      cat = kind ? t.categoryId : null;
      if (t.amountCents < 0) {
        const abs = -t.amountCents;
        const slot = free.find((x) => x.slots > 0 && (cat === null || cat === x.categoryId) && Math.abs(abs - x.perPaymentCents) <= Math.max(100, x.perPaymentCents * SLOT_PCT));
        if (slot) { slot.slots--; continue; } // es ese pago fijo, solo que no se unió a su línea
      }
    }
    totalCents -= t.amountCents;
    add(byCategory, cat, -t.amountCents);
  }
  return { totalCents, byCategory };
}

// ───────── "Hoy puedes gastar" ─────────
/** Días que faltan del mes, contando hoy (25 de noviembre → 6). */
export const daysLeftInMonth = (today: ISODate): number => {
  const p = parts(today);
  return daysInMonth(p.y, p.m) - p.d + 1;
};

export type Allowance =
  /** No hay nada planeado ni gastado en el día a día: no hay cifra que mostrar. */
  | { state: "none" }
  | { state: "ok"; perDayCents: Cents; remainingCents: Cents; daysLeft: number; budgetCents: Cents; spentCents: Cents }
  /** Ya se usó más de lo planeado: no hay cifra diaria; lo que te sobra del mes baja en `overCents` (nunca se pinta en rojo). */
  | { state: "over"; overCents: Cents; daysLeft: number; budgetCents: Cents; spentCents: Cents; netBeforeCents: Cents; netAfterCents: Cents };

/**
 * Hoy puedes gastar = (planeado para el día a día − gastado en el día a día este mes) ÷ días que faltan (incluido hoy).
 * Se redondea hacia abajo al centavo: la suma de los días nunca pasa de lo que queda.
 * `planNetCents` es lo que te sobra del mes según el plan (Inicio): si te pasaste, baja en lo que te pasaste.
 */
export function dailyAllowance(o: { budgetCents: Cents; spentCents: Cents; today: ISODate; planNetCents: Cents }): Allowance {
  const daysLeft = daysLeftInMonth(o.today);
  const spent = o.spentCents;
  if (o.budgetCents <= 0 && spent <= 0) return { state: "none" };
  const remaining = o.budgetCents - spent;
  if (remaining < 0) {
    return { state: "over", overCents: -remaining, daysLeft, budgetCents: o.budgetCents, spentCents: spent, netBeforeCents: o.planNetCents, netAfterCents: o.planNetCents + remaining };
  }
  return { state: "ok", perDayCents: Math.floor(remaining / daysLeft), remainingCents: remaining, daysLeft, budgetCents: o.budgetCents, spentCents: spent };
}

// ───────── Repaso semanal ─────────
/** La semana que repasa (lunes a domingo): el domingo, la que termina hoy; los demás días, la semana pasada completa. */
export function repasoWeek(today: ISODate): { from: ISODate; to: ISODate; current: boolean } {
  const current = isoWeekday(today) === 7;
  const from = current ? weekStart(today) : addDays(weekStart(today), -7);
  return { from, to: addDays(from, 6), current };
}

export type DuePayment = { lineId: string; name: string; date: ISODate; amountCents: Cents };

/**
 * Pagos fijos que caen entre `from` y `to` (incluidos), en orden de fecha.
 * - Solo líneas fijas de gasto, con monto en ese mes y sin pagar ese mes (`paid` = "lineId:mes").
 * - El monto de cada fecha es el del mes repartido entre sus fechas de pago (redondeado al centavo).
 * - `explicitOnly`: solo líneas con fecha de verdad (semanal/quincenal, o con día elegido). Las mensuales sin fecha caen
 *   el día 1 por convención del motor: sirven para la lista del repaso, no para avisar "mañana se paga".
 */
export function upcomingPayments(o: { lines: HabitLine[]; cells: PlanCell[]; fixed: ReadonlySet<string>; paid: ReadonlySet<string>; from: ISODate; to: ISODate; explicitOnly?: boolean }): DuePayment[] {
  const map = cellMap(o.cells), out: DuePayment[] = [];
  const months: { y: number; m: number }[] = [];
  for (let d = o.from; d <= o.to; d = addDays(d, 1)) {
    const p = parts(d);
    if (!months.some((x) => x.y === p.y && x.m === p.m)) months.push({ y: p.y, m: p.m });
  }
  for (const l of o.lines) {
    if (l.kind !== "expense" || !o.fixed.has(l.id)) continue;
    if (o.explicitOnly && !l.firstPayDate) continue;
    for (const { y, m } of months) {
      if (y !== l.year || o.paid.has(`${l.id}:${m}`)) continue;
      const planned = cellOf(map, l.id, m);
      if (planned <= 0) continue;
      const dates = payDatesInMonth(l.frequency, l.firstPayDate, l.year, m);
      if (!dates.length) continue;
      const each = Math.round(planned / dates.length);
      for (const date of dates) if (date >= o.from && date <= o.to) out.push({ lineId: l.id, name: l.name, date, amountCents: each });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || b.amountCents - a.amountCents || a.name.localeCompare(b.name));
}

/**
 * "Una cosa para esta semana": UNA sola acción, la primera que aplique, en el mismo orden que "Para hoy" en Inicio.
 * Son acciones de orden (categorizar, registrar, cerrar), nunca un consejo financiero.
 * 1. review: hay movimientos por revisar → darles categoría.
 * 2. close: hay un cierre de mes pendiente → hacerlo.
 * 3. record: la semana repasada no tiene movimientos → registrar los gastos.
 * 4. balances: los saldos de las cuentas tienen más de un mes → actualizarlos.
 * 5. dayToDay: el día a día ya pasó lo planeado → ver en qué se fue (Análisis).
 * 6. lesson: hay una clase pendiente → verla.
 * 7. none: todo en orden.
 */
export type OneThing = "review" | "close" | "record" | "balances" | "dayToDay" | "lesson" | "none";
export function pickOneThing(f: { review: number; closeDue: boolean; weekTx: number; staleBalances: boolean; overDayToDay: boolean; lesson: boolean }): OneThing {
  if (f.review > 0) return "review";
  if (f.closeDue) return "close";
  if (f.weekTx === 0) return "record";
  if (f.staleBalances) return "balances";
  if (f.overDayToDay) return "dayToDay";
  if (f.lesson) return "lesson";
  return "none";
}

// ───────── Avisos del hábito ─────────
export const HABIT_KINDS = ["daily", "weekly", "goal", "due", "close"] as const;
export type HabitKind = (typeof HABIT_KINDS)[number];
/** Las que se eligen en `profiles.prefs.habit`. "due" usa `prefs.notify.payments` y "close" usa `prefs.notify.close` (ya existían en Perfil). */
export const HABIT_PREF_KEYS = ["daily", "weekly", "goal"] as const;
export type HabitPrefKey = (typeof HABIT_PREF_KEYS)[number];
export const HABIT_DEFAULTS: Record<HabitPrefKey, boolean> = { daily: true, weekly: true, goal: true };

export function readHabitPrefs(prefs: unknown): Record<HabitPrefKey, boolean> {
  const p = prefs && typeof prefs === "object" ? (prefs as Record<string, unknown>) : {};
  const h = p.habit && typeof p.habit === "object" ? (p.habit as Record<string, unknown>) : {};
  return Object.fromEntries(HABIT_PREF_KEYS.map((k) => [k, typeof h[k] === "boolean" ? h[k] : HABIT_DEFAULTS[k]])) as Record<HabitPrefKey, boolean>;
}
/** Escribe solo `prefs.habit` y conserva todo lo demás. */
export function mergeHabitPrefs(prefs: unknown, patch: Partial<Record<HabitPrefKey, boolean>>): Record<string, unknown> {
  const p = prefs && typeof prefs === "object" ? (prefs as Record<string, unknown>) : {};
  const old = p.habit && typeof p.habit === "object" ? (p.habit as Record<string, unknown>) : {};
  const clean = Object.fromEntries(Object.entries(patch).filter(([k, v]) => (HABIT_PREF_KEYS as readonly string[]).includes(k) && typeof v === "boolean"));
  return { ...p, habit: { ...old, ...readHabitPrefs(p), ...clean } };
}

/** ¿Quiere este aviso? Son avisos en la app y al celular: con el canal "solo correo" no sale ninguno. */
export function wantsHabit(kind: HabitKind, habit: Record<HabitPrefKey, boolean>, notify: { payments: boolean; close: boolean; closeDay: "last" | "first"; channel: "both" | "email" | "app" }): boolean {
  if (notify.channel === "email") return false;
  if (kind === "due") return notify.payments;
  if (kind === "close") return notify.close && notify.closeDay === "last";
  return habit[kind];
}

/** Nunca de noche: de 21:00 a 8:00 en la hora del usuario no sale ningún aviso. */
export const QUIET_HOURS = { from: 21, to: 8 } as const;
export const isQuietHour = (hour: number) => hour >= QUIET_HOURS.from || hour < QUIET_HOURS.to;

/** Fecha y hora local del usuario. Una zona inválida cae a Sydney (la de la app), igual que las demás tareas. */
export function localClock(timezone: string | null | undefined, now: Date = new Date()): { date: ISODate; hour: number } {
  const read = (tz: string) => {
    const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" });
    return { date: todayIn(tz, now), hour: Number(f.format(now)) % 24 };
  };
  try { return read(timezone || "Australia/Sydney"); } catch { return read("Australia/Sydney"); }
}

/**
 * Si el mismo día aplican varios, sale uno solo, en este orden:
 * cierre (último día del mes) → "mañana se paga" → repaso (domingo) → "hoy puedes gastar".
 * El hito de meta no compite aquí: lo dispara la meta en el momento y ocupa el aviso del día si llega primero.
 */
export const HABIT_PRIORITY = ["close", "due", "weekly", "daily"] as const satisfies readonly HabitKind[];
export function pickHabit(eligible: Partial<Record<HabitKind, boolean>>): HabitKind | null {
  return HABIT_PRIORITY.find((k) => eligible[k]) ?? null;
}

export const isLastDayOfMonth = (d: ISODate) => daysLeftInMonth(d) === 1;
export const isSunday = (d: ISODate) => isoWeekday(d) === 7;
