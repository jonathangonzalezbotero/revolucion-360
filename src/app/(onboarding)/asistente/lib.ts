// "Arma tu plan": de las respuestas del asistente a líneas del plan. Funciones puras (sin base de datos).
// La pantalla y la acción del servidor usan EL MISMO resultado de `buildDrafts`, así el resumen del último
// paso es, por construcción, lo que después muestra Inicio.
import { z } from "zod";
import { addDays, daysInMonth, diffDays, goalPlan, iso, monthAmounts, parseMoney, parts, type Cents, type ISODate } from "@/lib/engine";

export type Freq = "weekly" | "fortnightly" | "monthly";
export const STEP_KEYS = ["income", "home", "basics", "debts", "family", "goals", "plan"] as const;
export type StepKey = (typeof STEP_KEYS)[number];
export const HOME_TYPES = ["rent", "mortgage", "family"] as const;
export type HomeType = (typeof HOME_TYPES)[number];
export const BASIC_KEYS = ["groceries", "utilities", "phone", "transport"] as const;
export type BasicKey = (typeof BASIC_KEYS)[number];
export const DEBT_KEYS = ["card", "bnpl", "car", "personal"] as const;
export type DebtKey = (typeof DEBT_KEYS)[number];
export const DEBT_TYPES = ["mortgage", "student", "family", "tax", "other"] as const;
export type DebtType = (typeof DEBT_TYPES)[number];
export const MAX_ROWS = 12;

// ───────── Respuestas (lo que se guarda en profiles.wizard) ─────────
const freq = z.enum(["weekly", "fortnightly", "monthly"]);
const money = z.string().max(24);
const name = z.string().max(80);
const amountFreq = z.object({ amount: money, freq });
const preset = z.object({ on: z.boolean(), amount: money });
export const AnswersSchema = z.object({
  step: z.enum(STEP_KEYS),
  incomes: z.array(z.object({ name, amount: money, freq, payDate: z.string().max(10), freelance: z.boolean() })).min(1).max(MAX_ROWS),
  home: z.object({ type: z.enum(HOME_TYPES), amount: money, freq }),
  basics: z.object({ groceries: amountFreq, utilities: amountFreq, phone: amountFreq, transport: amountFreq }),
  debts: z.object({ card: preset, bnpl: preset, car: preset, personal: preset }),
  extraDebts: z.array(z.object({ name, type: z.enum(DEBT_TYPES), amount: money })).max(MAX_ROWS),
  family: z.object({ on: z.boolean().nullable(), amount: money, freq }),
  goals: z.array(z.object({ name, amount: money, date: z.string().max(7) })).max(MAX_ROWS),
});
export type Answers = z.infer<typeof AnswersSchema>;

/** Punto de partida del asistente. Lo semanal arranca con la frecuencia de pago del país del usuario. */
export function defaultAnswers(o: { payFrequency: Freq; incomeName: string; goalNames: string[] }): Answers {
  const f = o.payFrequency;
  return {
    step: "income",
    incomes: [{ name: o.incomeName, amount: "", freq: f, payDate: "", freelance: false }],
    home: { type: "rent", amount: "", freq: f },
    basics: { groceries: { amount: "", freq: f }, utilities: { amount: "", freq: "monthly" }, phone: { amount: "", freq: "monthly" }, transport: { amount: "", freq: f } },
    debts: { card: { on: false, amount: "" }, bnpl: { on: false, amount: "" }, car: { on: false, amount: "" }, personal: { on: false, amount: "" } },
    extraDebts: [],
    family: { on: null, amount: "", freq: "monthly" },
    goals: o.goalNames.slice(0, MAX_ROWS).map((n) => ({ name: n, amount: "", date: "" })),
  };
}

/** Lo guardado en el perfil, si sigue siendo válido; si no, el punto de partida. */
export function readAnswers(raw: unknown, fallback: Answers): Answers {
  const p = AnswersSchema.safeParse(raw);
  return p.success ? p.data : fallback;
}

/** Pasos visibles: "Tu familia" solo existe si las remesas están activas. */
export const visibleSteps = (remesas: boolean): StepKey[] => STEP_KEYS.filter((k) => remesas || k !== "family");

// ───────── Montos y fechas ─────────
const MAX_CENTS = 99_999_999_999;
/** Texto de un campo → centavos (nunca negativo; vacío o inválido = 0). */
export const cents = (text: string): Cents => Math.min(MAX_CENTS, Math.max(0, parseMoney(text) ?? 0));

export function validDate(d: string): ISODate | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const p = parts(d);
  return p.y >= 2000 && p.y <= 2100 && p.m >= 1 && p.m <= 12 && p.d >= 1 && p.d <= daysInMonth(p.y, p.m) ? d : null;
}

/**
 * Un día de pago cualquiera → el primer pago del año del plan con esa misma cadencia.
 * Sin esto, los meses anteriores a la fecha quedarían en $0 (el motor no paga antes del primer pago)
 * y lo semanal sin fecha contaría 5 pagos en casi todos los meses (el motor arranca cada mes en el día 1).
 */
export function anchorPayDate(date: ISODate | null, f: Freq, year: number): ISODate {
  const jan1 = iso(year, 1, 1);
  if (!date) return jan1;
  if (f === "monthly") return iso(year, 1, parts(date).d);
  const step = f === "weekly" ? 7 : 14;
  return addDays(date, Math.ceil(diffDays(jan1, date) / step) * step);
}

/** Promedio al mes que muestra el asistente mientras preguntas: semanal × 52 ÷ 12. */
export function monthlyAverage(amountCents: Cents, f: Freq): Cents {
  return f === "weekly" ? Math.round((amountCents * 52) / 12) : f === "fortnightly" ? Math.round((amountCents * 26) / 12) : amountCents;
}

// ───────── Borradores: lo que se va a crear ─────────
export type Group = "income" | "home" | "basics" | "debts" | "family" | "goals";
export type DebtKind = "loan" | "card" | "bnpl" | "personal" | "other";
export type LineDraft = {
  group: Group; name: string; kind: "income" | "expense"; frequency: Freq; amountCents: Cents; firstPayDate: ISODate | null;
  /** Solo aplica entre estos meses (aportes a una meta con fecha) */
  fromMonth?: number; toMonth?: number;
  /** Posición en `debts` / `goals` de la deuda o meta a la que se une */
  debtRef?: number; goalRef?: number;
};
export type DebtDraft = { name: string; kind: DebtKind; paymentCents: Cents; paymentFrequency: Freq };
export type GoalDraft = { name: string; targetCents: Cents; targetDate: ISODate | null };
export type Drafts = { lines: LineDraft[]; debts: DebtDraft[]; goals: GoalDraft[]; freelance: boolean; mainFrequency: Freq | null };

export type Labels = {
  income: string;
  home: Record<HomeType, string>;
  basics: Record<BasicKey, string>;
  debts: Record<DebtKey, string>;
  debtTypes: Record<DebtType, string>;
  family: string;
  goal: string;
};
export type Ctx = { year: number; month: number; today: ISODate; remesas: boolean; labels: Labels };

const PRESET_KIND: Record<DebtKey, DebtKind> = { card: "card", bnpl: "bnpl", car: "loan", personal: "personal" };
const TYPE_KIND: Record<DebtType, DebtKind> = { mortgage: "loan", student: "loan", family: "personal", tax: "other", other: "other" };

/** "2027-06" → último día de ese mes, si no quedó en el pasado. */
export function goalDate(month: string, today: ISODate): ISODate | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const y = +month.slice(0, 4), m = +month.slice(5, 7);
  if (m < 1 || m > 12 || y > 2100) return null;
  const d = iso(y, m, daysInMonth(y, m));
  return d >= today ? d : null;
}

/**
 * Respuestas → líneas del plan, deudas y metas.
 * - Sin monto no hay línea (una deuda marcada o una meta con nombre sí se crean, para completarlas después).
 * - Ingresos: su frecuencia y su día de pago, llevado al primer pago del año.
 * - Gastos semanales o quincenales: siguen el día de pago del ingreso principal.
 * - Hipoteca: UNA línea de vivienda unida a su deuda (nunca dos).
 * - Meta con monto y fecha: aporte mensual desde este mes hasta el mes de la meta.
 */
export function buildDrafts(a: Answers, ctx: Ctx): Drafts {
  const { year, labels } = ctx;
  const lines: LineDraft[] = [], debts: DebtDraft[] = [], goals: GoalDraft[] = [];
  const payDay = a.incomes.map((r) => (cents(r.amount) > 0 ? validDate(r.payDate) : null)).find(Boolean) ?? null;
  const expense = (group: Group, lineName: string, amountCents: Cents, f: Freq, extra: Partial<LineDraft> = {}) => {
    if (amountCents <= 0) return;
    lines.push({ group, name: lineName, kind: "expense", frequency: f, amountCents, firstPayDate: f === "monthly" ? null : anchorPayDate(payDay, f, year), ...extra });
  };

  let mainFrequency: Freq | null = null, freelance = false;
  for (const r of a.incomes) {
    const amountCents = cents(r.amount);
    if (amountCents <= 0) continue;
    const date = validDate(r.payDate);
    mainFrequency ??= r.freq;
    freelance ||= r.freelance;
    lines.push({
      group: "income", name: r.name.trim() || labels.income, kind: "income", frequency: r.freq, amountCents,
      firstPayDate: r.freq === "monthly" && !date ? null : anchorPayDate(date, r.freq, year),
    });
  }

  const homeCents = cents(a.home.amount);
  if (a.home.type === "mortgage") {
    debts.push({ name: labels.home.mortgage, kind: "loan", paymentCents: homeCents, paymentFrequency: a.home.freq });
    expense("home", labels.home.mortgage, homeCents, a.home.freq, { debtRef: debts.length - 1 });
  } else expense("home", labels.home[a.home.type], homeCents, a.home.freq);

  for (const k of BASIC_KEYS) expense("basics", labels.basics[k], cents(a.basics[k].amount), a.basics[k].freq);

  for (const k of DEBT_KEYS) {
    if (!a.debts[k].on) continue;
    const paymentCents = cents(a.debts[k].amount);
    debts.push({ name: labels.debts[k], kind: PRESET_KIND[k], paymentCents, paymentFrequency: "monthly" });
    expense("debts", labels.debts[k], paymentCents, "monthly", { debtRef: debts.length - 1 });
  }
  for (const x of a.extraDebts) {
    const paymentCents = cents(x.amount), debtName = x.name.trim();
    if (!debtName && paymentCents <= 0) continue;
    debts.push({ name: debtName || labels.debtTypes[x.type], kind: TYPE_KIND[x.type], paymentCents, paymentFrequency: "monthly" });
    expense("debts", debtName || labels.debtTypes[x.type], paymentCents, "monthly", { debtRef: debts.length - 1 });
  }

  if (ctx.remesas && a.family.on) expense("family", labels.family, cents(a.family.amount), a.family.freq);

  for (const g of a.goals) {
    const targetCents = cents(g.amount), goalName = g.name.trim();
    if (!goalName && targetCents <= 0) continue;
    const targetDate = goalDate(g.date, ctx.today);
    goals.push({ name: goalName || labels.goal, targetCents, targetDate });
    const gp = goalPlan(targetCents, [], targetDate, ctx.today);
    if (gp.monthlyCents && gp.monthsLeft) {
      expense("goals", goalName || labels.goal, gp.monthlyCents, "monthly", { goalRef: goals.length - 1, fromMonth: ctx.month, toMonth: Math.min(12, ctx.month + gp.monthsLeft - 1) });
    }
  }
  return { lines, debts, goals, freelance, mainFrequency };
}

/** Los 12 montos de una línea, tal como los guardará `createLine` (motor + rango de meses). */
export function draftMonths(l: LineDraft, year: number): Cents[] {
  return monthAmounts({ frequency: l.frequency, amountCents: l.amountCents, firstPayDate: l.firstPayDate, year })
    .map((v, i) => (i + 1 < (l.fromMonth ?? 1) || i + 1 > (l.toMonth ?? 12) ? 0 : v));
}

export type Summary = { income: Cents; expense: Cents; net: Cents; lines: number } & Record<Exclude<Group, "income">, Cents>;
const emptySummary = (): Summary => ({ income: 0, expense: 0, net: 0, lines: 0, home: 0, basics: 0, debts: 0, family: 0, goals: 0 });

/** Entra, sale y sobra de UN mes según el motor: los mismos números que mostrará Inicio para ese mes. */
export function summarize(d: Drafts, year: number, month: number): Summary {
  const s = emptySummary();
  for (const l of d.lines) {
    const v = draftMonths(l, year)[month - 1];
    if (l.group === "income") s.income += v; else { s[l.group] += v; s.expense += v; }
  }
  s.net = s.income - s.expense;
  s.lines = d.lines.length;
  return s;
}

/** Vista previa mientras el usuario responde: promedio mensual (semanal × 52 ÷ 12). */
export function averageSummary(d: Drafts): Summary {
  const s = emptySummary();
  for (const l of d.lines) {
    const v = monthlyAverage(l.amountCents, l.frequency);
    if (l.group === "income") s.income += v; else { s[l.group] += v; s.expense += v; }
  }
  s.net = s.income - s.expense;
  s.lines = d.lines.length;
  return s;
}

// ───────── Categoría de cada línea ─────────
export type CatLite = { id: string; name: string; kind: "income" | "expense" | "debt" | "saving" | "goal"; isBasic: boolean };
export type Role = "income" | "basic" | "debt" | "family" | "goal";
export const roleOf = (g: Group): Role => (g === "income" ? "income" : g === "debts" ? "debt" : g === "goals" ? "goal" : g === "family" ? "family" : "basic");

/** Elige la categoría por su tipo (el usuario pudo cambiarle el nombre). null = hay que crearla. */
export function pickCategory(cats: CatLite[], role: Role): string | null {
  const first = (ok: (c: CatLite) => boolean) => cats.find(ok)?.id ?? null;
  if (role === "income") return first((c) => c.kind === "income");
  if (role === "debt") return first((c) => c.kind === "debt");
  if (role === "goal") return first((c) => c.kind === "goal") ?? first((c) => c.kind === "saving");
  if (role === "family") return first((c) => c.kind === "expense" && /famil|remes|remit/i.test(c.name));
  return first((c) => c.kind === "expense" && c.isBasic) ?? first((c) => c.kind === "expense");
}
