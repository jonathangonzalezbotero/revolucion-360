"use server";
import { z } from "zod";
import { goalPlan, parseMoney, type Cents, type ISODate } from "@/lib/engine";
import { fail, ok, run, type Result } from "@/server/action";
import { fetchAll, loadPlan, must } from "@/server/data";
import { archiveLine, createLine, setCell, updateLine } from "@/server/plan-write";
import { award, touchWeek, tryBadge } from "@/server/rewards";
import type { Session } from "@/server/session";
import { canUse, CONTRIB_FREQS, contribCells, contribPayDate, contribRange, planRange, resolveTargetDate, type Contribution } from "./lib";
import { M } from "./messages";
import { awardGoal, celebrate, leftoverFor, raw, savedNow, type Crossed } from "./server";
import { countChallenge } from "../retos/server";
import type { Json } from "@/lib/supabase/database.types";
import { GOAL_KEYS, withoutObjective, type GoalKey } from "@/app/(onboarding)/bienvenida/lib";

const PATHS = ["/metas", "/inicio", "/plan", "/diagnostico", "/perfil"];
const Id = z.string().uuid();
const Fields = z.object({
  name: z.string().trim().min(1).max(80), kind: z.string().trim().max(40).default(""), target: z.string().max(40).default(""),
  month: z.string().max(7).default(""), isEmergencyFund: z.boolean().default(false), accountId: z.union([Id, z.literal("")]).default(""),
  why: z.string().trim().max(160).default(""),
  /** "¿Cuánto vas a aportar?": vacío = sin aporte (la línea del plan, si ya hay, no se toca). */
  contribution: z.string().max(40).default(""), contribFreq: z.enum(CONTRIB_FREQS).default("monthly"),
});

/** El aporte escrito: null si está vacío; "bad" si no es un monto mayor a 0. */
function contributionOf(d: { contribution: string; contribFreq: Contribution["frequency"] }): Contribution | null | "bad" {
  if (!d.contribution.trim()) return null;
  const cents = parseMoney(d.contribution);
  return cents === null || cents <= 0 ? "bad" : { amountCents: cents, frequency: d.contribFreq };
}

const savedOf = async (s: Session, goalId: string): Promise<Cents> =>
  (await fetchAll<{ amount_cents: number }>((a, b) => s.supabase.from("goal_entries").select("amount_cents").eq("goal_id", goalId).order("id").range(a, b))).reduce((x, e) => x + e.amount_cents, 0);

type GoalRow = { id: string; name: string; target_cents: number; target_date: ISODate | null };

/** La categoría de tipo "goal" del usuario (la crea si no existe). */
async function goalCategory(s: Session, categories: { id: string; kind: string; sort: number }[]): Promise<string> {
  const found = categories.find((c) => c.kind === "goal")?.id;
  if (found) return found;
  const sort = Math.max(-1, ...categories.map((c) => c.sort)) + 1;
  return must(await s.supabase.from("categories").insert({ user_id: s.userId, name: M[s.locale].category, kind: "goal", color: "#E3B800", sort }).select("id").single()).id;
}

/**
 * "¿Cuánto vas a aportar?" → la línea del plan de la meta (año en curso, categoría de metas, `goal_id`), con ese monto y esa frecuencia,
 * desde este mes hasta el de la meta (después queda en 0). Si la meta ya tiene línea este año, se actualiza: nunca se duplica.
 * Decisión: en la línea de una meta, el aporte del formulario manda desde este mes hasta diciembre (igual que antes el cálculo
 * automático); los meses pasados no se tocan. Las celdas se escriben una por una porque varias ya venían marcadas a mano por el sistema.
 */
async function upsertContribLine(s: Session, goal: GoalRow, c: Contribution): Promise<{ created: boolean }> {
  const { fromMonth, toMonth } = contribRange(s.today, goal.target_date);
  const current = must(await s.supabase.from("plan_lines").select("id, frequency, first_pay_date").eq("goal_id", goal.id).eq("year", s.year).is("archived_at", null).order("created_at").limit(1))[0];
  const firstPayDate = contribPayDate(c.frequency, current ? { frequency: current.frequency, firstPayDate: current.first_pay_date } : null, s.today);
  if (current) {
    await updateLine(s, current.id, { name: goal.name, amountCents: c.amountCents, frequency: c.frequency, firstPayDate }, { fromMonth });
    for (const cell of contribCells(c, s.year, firstPayDate, fromMonth, toMonth)) await setCell(s, current.id, cell.month, cell.amountCents);
    return { created: false };
  }
  const plan = await loadPlan(s, s.year);
  const categoryId = await goalCategory(s, plan.categories);
  await createLine(s, {
    year: s.year, categoryId, name: goal.name, kind: "expense", frequency: c.frequency, amountCents: c.amountCents, firstPayDate,
    fromMonth, toMonth: c.frequency === "once" ? 12 : toMonth, goalId: goal.id,
  });
  return { created: true };
}

/**
 * Crea la línea de gasto de la meta en la categoría de tipo "goal", con el aporte mensual calculado,
 * desde el mes actual hasta la fecha de la meta. Siempre en el año en curso: el siguiente lo copia `loadPlan`.
 */
async function addGoalLine(s: Session, goal: GoalRow, savedCents: Cents): Promise<{ state: "ok"; monthlyCents: Cents } | { state: "nodate" | "exists" }> {
  const gp = goalPlan(goal.target_cents, [savedCents], goal.target_date, s.today);
  if (!goal.target_date || !gp.monthlyCents) return { state: "nodate" };
  const plan = await loadPlan(s, s.year);
  if (plan.lines.some((l) => l.goalId === goal.id)) return { state: "exists" };
  const categoryId = await goalCategory(s, plan.categories);
  await createLine(s, {
    year: s.year, categoryId, name: goal.name, kind: "expense", frequency: "monthly", amountCents: gp.monthlyCents, firstPayDate: null,
    ...planRange(s.today, goal.target_date), goalId: goal.id,
  });
  return { state: "ok", monthlyCents: gp.monthlyCents };
}

/** La línea de la meta lleva su nombre: al renombrar la meta, se renombra (año en curso). Monto y frecuencia solo los cambia el aporte. */
async function renameGoalLines(s: Session, goalId: string, name: string): Promise<void> {
  const lines = must(await s.supabase.from("plan_lines").select("id, name").eq("goal_id", goalId).eq("year", s.year).is("archived_at", null));
  for (const l of lines) if (l.name !== name) await updateLine(s, l.id, { name });
}

/** Quita del plan las líneas de la meta (año en curso y siguientes), sin perder su historia. */
async function removeGoalLines(s: Session, goalId: string): Promise<void> {
  const lines = must(await s.supabase.from("plan_lines").select("id").eq("goal_id", goalId).gte("year", s.year).is("archived_at", null));
  for (const l of lines) await archiveLine(s, l.id);
}

/** Quita un objetivo de la bienvenida del perfil: la sugerencia ya no aparece en Metas. */
async function dropObjective(s: Session, key: GoalKey): Promise<void> {
  must(await s.supabase.from("profiles").update({ prefs: withoutObjective(s.profile.prefs, key) as NonNullable<Json> }).eq("id", s.userId).select("id"));
}

export async function createGoal(input: unknown) {
  return run<{ id: string; inPlan: boolean }>({ feature: "metas", revalidate: PATHS }, async (s) => {
    const p = Fields.extend({ objective: z.enum(GOAL_KEYS).optional() }).safeParse(input);
    if (!p.success) return fail(s.t.errors.name);
    const target = p.data.target.trim() ? parseMoney(p.data.target) : 0;
    if (target === null || target < 0) return fail(s.t.errors.amount);
    const contrib = contributionOf(p.data);
    if (contrib === "bad") return fail(M[s.locale].errContrib);
    const row = must(await raw(s).from("goals").insert({
      user_id: s.userId, name: p.data.name, kind: p.data.kind, target_cents: target, target_date: resolveTargetDate(p.data.month, null), is_emergency_fund: p.data.isEmergencyFund,
      account_id: p.data.accountId || null, why: p.data.why, account_linked_on: p.data.accountId ? s.today : null,
    }).select("id, name, target_cents, target_date").single()) as GoalRow;
    // La meta ya quedó creada: si la línea del plan falla, se avisa "sin plan" y se puede poner el aporte después al editarla.
    const line = contrib ? await upsertContribLine(s, row, contrib).catch(() => null) : null;
    // Creada desde una sugerencia: el objetivo ya es meta y la sugerencia desaparece.
    if (p.data.objective) await dropObjective(s, p.data.objective);
    return ok({ id: row.id, inPlan: !!line });
  });
}

export async function updateGoal(input: unknown) {
  return run<{ contribution: Contribution | null }>({ feature: "metas", revalidate: PATHS }, async (s) => {
    const p = Fields.extend({ id: Id }).safeParse(input);
    if (!p.success) return fail(s.t.errors.name);
    const target = p.data.target.trim() ? parseMoney(p.data.target) : 0;
    if (target === null || target < 0) return fail(s.t.errors.amount);
    const contrib = contributionOf(p.data);
    if (contrib === "bad") return fail(M[s.locale].errContrib);
    const cur = must(await s.supabase.from("goals").select("target_date, account_id, completed_at").eq("id", p.data.id).maybeSingle());
    if (!cur) return fail(s.t.errors.notFound);
    const date = resolveTargetDate(p.data.month, cur.target_date);
    const accountId = p.data.accountId || null;
    // Cambió la cuenta: las transferencias cuentan solas desde hoy (nunca las viejas de golpe).
    const link = accountId === cur.account_id ? {} : { account_linked_on: accountId ? s.today : null };
    // Y las otras metas que se quedan en la cuenta anterior también empiezan hoy: las transferencias viejas que esta meta
    // compartía no se van de golpe a ellas.
    if (cur.account_id && accountId !== cur.account_id) {
      must(await raw(s).from("goals").update({ account_linked_on: s.today }).eq("account_id", cur.account_id).neq("id", p.data.id).is("archived_at", null).is("completed_at", null).select("id"));
    }
    must(await raw(s).from("goals").update({
      name: p.data.name, kind: p.data.kind, target_cents: target, target_date: date, is_emergency_fund: p.data.isEmergencyFund, account_id: accountId, why: p.data.why, ...link,
    }).eq("id", p.data.id).select("id"));
    const goal = { id: p.data.id, name: p.data.name, target_cents: target, target_date: date };
    // una meta cumplida no vuelve al plan; sin aporte escrito, la línea (si hay) solo cambia de nombre
    if (contrib && !cur.completed_at) {
      await upsertContribLine(s, goal, contrib);
      return ok({ contribution: contrib });
    }
    await renameGoalLines(s, goal.id, goal.name);
    return ok({ contribution: null });
  });
}

/**
 * Aportar (+) o usarla para lo que era (−). Cada aporte suma puntos (uno por día), cuenta para la racha y puede dar el Colchón de 1 mes.
 * Usarla es un logro (una vez por meta). Cruzar un hito (25/50/75/100%) suma sus puntos una sola vez y deja un aviso.
 */
export async function addEntry(input: unknown) {
  return run<{ amountCents: number; crossed: Crossed[] }>({ feature: "metas", revalidate: PATHS }, async (s) => {
    const p = z.object({ goalId: Id, amount: z.string().max(40), mode: z.enum(["in", "out"]) }).safeParse(input);
    const amount = p.success ? parseMoney(p.data.amount) : null;
    if (!p.success || amount === null || amount === 0) return fail(s.t.errors.amount);
    const cents = Math.abs(amount);
    const goal = must(await s.supabase.from("goals").select("id, is_emergency_fund").eq("id", p.data.goalId).is("archived_at", null).is("completed_at", null).maybeSingle());
    if (!goal) return fail(s.t.errors.notFound);
    if (p.data.mode === "out" && !canUse(cents, await savedOf(s, goal.id))) return fail(M[s.locale].errUse);
    const before = await savedNow(s);
    const entry = must(await s.supabase.from("goal_entries").insert({ user_id: s.userId, goal_id: goal.id, date: s.today, amount_cents: p.data.mode === "in" ? cents : -cents }).select("id").single());
    await touchWeek(s);
    if (p.data.mode === "in") await countChallenge(s, "goal_contrib", entry.id); // Retos: "aportar a una meta" (nunca lanza)
    if (p.data.mode === "out") {
      const points = await awardGoal(s, "goal_used", goal.id);
      return ok({ amountCents: cents, crossed: [] }, { points: points || undefined });
    }
    let points = await award(s, "goal_contrib", entry.id);
    const crossed = await celebrate(s, before, await savedNow(s), [goal.id]);
    points += crossed.reduce((a, c) => a + c.points, 0);
    if (goal.is_emergency_fund) await tryBadge(s, "shield");
    return ok({ amountCents: cents, crossed }, { points: points || undefined });
  });
}

/** Marcar como cumplida: solo si lo ahorrado ya llegó al monto. Los puntos son los que devuelve la base de datos. */
export async function completeGoal(input: unknown) {
  return run({ feature: "metas", revalidate: PATHS }, async (s) => {
    const p = z.object({ id: Id, removeLine: z.boolean().default(false) }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const goal = must(await s.supabase.from("goals").select("id, target_cents, completed_at").eq("id", p.data.id).is("archived_at", null).maybeSingle());
    if (!goal) return fail(s.t.errors.notFound);
    if (!goalPlan(goal.target_cents, [await savedOf(s, goal.id)], null, s.today).reached) return fail(M[s.locale].errNotReached);
    if (!goal.completed_at) must(await s.supabase.from("goals").update({ completed_at: new Date().toISOString() }).eq("id", goal.id).select("id"));
    if (p.data.removeLine) await removeGoalLines(s, goal.id);
    const points = await award(s, "goal_done", goal.id);
    await tryBadge(s, "flag");
    return ok(undefined, { points });
  });
}

export async function archiveGoal(input: unknown) {
  return run({ feature: "metas", revalidate: PATHS }, async (s) => {
    const p = z.object({ id: Id, removeLine: z.boolean().default(false) }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const rows = must(await s.supabase.from("goals").update({ archived_at: new Date().toISOString() }).eq("id", p.data.id).select("id"));
    if (rows.length === 0) return fail(s.t.errors.notFound);
    if (p.data.removeLine) await removeGoalLines(s, p.data.id);
    return ok(undefined);
  });
}

export async function addToPlan(input: unknown) {
  return run<{ monthlyCents: number }>({ feature: "metas", revalidate: PATHS }, async (s) => {
    const m = M[s.locale];
    const p = z.object({ id: Id }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const goal = must(await s.supabase.from("goals").select("id, name, target_cents, target_date").eq("id", p.data.id).is("archived_at", null).is("completed_at", null).maybeSingle());
    if (!goal) return fail(s.t.errors.notFound);
    const r = await addGoalLine(s, goal, await savedOf(s, goal.id));
    if (r.state !== "ok") return fail(r.state === "nodate" ? m.errPlanDate : m.errPlanExists);
    return ok({ monthlyCents: r.monthlyCents });
  });
}

/**
 * Lo que sobró al cerrar el mes: a una meta, o "Ahora no". Una sola decisión por mes (llave primaria): reabrir y volver a cerrar
 * no suma dos veces. El monto sale del resumen guardado al cerrar, nunca de la pantalla.
 */
export async function sendLeftover(input: unknown): Promise<Result<{ amountCents: number; name: string; crossed: Crossed[] }>> {
  return run<{ amountCents: number; name: string; crossed: Crossed[] }>({ feature: "metas", revalidate: [...PATHS, "/cierre"] }, async (s) => {
    const m = M[s.locale];
    const p = z.object({ year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12), goalId: Id.nullable() }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const { year, month, goalId } = p.data;
    const closure = must(await s.supabase.from("month_closures").select("snapshot, reopened_at").eq("year", year).eq("month", month).maybeSingle());
    if (!closure || closure.reopened_at) return fail(s.t.errors.notFound);
    const amount = await leftoverFor(s, { year, month }, closure.snapshot);
    if (goalId && amount <= 0) return fail(s.t.errors.generic); // mes viejo, o no sobró nada
    const goal = goalId ? must(await s.supabase.from("goals").select("id, name, is_emergency_fund").eq("id", goalId).is("archived_at", null).is("completed_at", null).maybeSingle()) : null;
    if (goalId && !goal) return fail(s.t.errors.notFound);
    const db = raw(s);
    const decided = await db.from("goal_leftovers").insert({ user_id: s.userId, year, month, goal_id: goal?.id ?? null, amount_cents: goal ? amount : 0 });
    if (decided.error) {
      if (decided.error.code === "23505") return fail(m.errLeftover);
      throw new Error(`db: ${decided.error.message}`);
    }
    if (!goal || amount <= 0) return ok({ amountCents: 0, name: "", crossed: [] });
    const before = await savedNow(s);
    const ref = `${year}-${String(month).padStart(2, "0")}`;
    const entry = must(await db.from("goal_entries").insert({ user_id: s.userId, goal_id: goal.id, date: s.today, amount_cents: amount, kind: "leftover", note: ref }).select("id").single()) as { id: string };
    must(await db.from("goal_leftovers").update({ entry_id: entry.id }).eq("year", year).eq("month", month).select("year"));
    let points = await awardGoal(s, "goal_leftover", ref);
    const crossed = await celebrate(s, before, await savedNow(s), [goal.id]);
    points += crossed.reduce((a, c) => a + c.points, 0);
    await touchWeek(s);
    await countChallenge(s, "goal_contrib", entry.id); // Retos: "aportar a una meta" (nunca lanza)
    if (goal.is_emergency_fund) await tryBadge(s, "shield");
    return ok({ amountCents: amount, name: goal.name, crossed }, { points: points || undefined });
  });
}

// Retos: entrar y salir solo desde /retos (src/app/(app)/retos/actions.ts, migración 20261125000037_retos.sql). Metas ya no los muestra.

/** "Ahora no" en una sugerencia: el objetivo deja de sugerirse (no crea ni borra metas). */
export async function dismissObjective(input: unknown) {
  return run({ feature: "metas", revalidate: ["/metas"] }, async (s) => {
    const p = z.object({ key: z.enum(GOAL_KEYS) }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    await dropObjective(s, p.data.key);
    return ok(null);
  });
}
