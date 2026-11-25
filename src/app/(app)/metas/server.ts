import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  autoWindow, goalOutlook, leftoverMonthIsRecent, leftoverOf, milestonesCrossed, planSync, savedByGoal, wantedEntries, type LinkedEntry, type Milestone, type SyncGoal, type SyncTx,
} from "@/lib/engine/metas";
import { fetchAll, must } from "@/server/data";
import { notifyHabit } from "@/server/habit-notify";
import { award, type PointKind } from "@/server/rewards";
import type { Session } from "@/server/session";

/**
 * Tablas y columnas de la migración 20261125000031_metas.sql (goals.why, goals.account_linked_on, goal_entries.kind,
 * goal_entries.transaction_id, transactions.goal_id/goal_role, goal_leftovers, user_challenges).
 * Hasta que se aplique y se regeneren los tipos, se consultan sin tipos (as never puntual) y cada fila se tipa a mano.
 */
export const raw = (s: Session) => s.supabase as unknown as SupabaseClient;

/** Tipos de puntos de metas amables (la base los valida en award_points). */
export type GoalPointKind = Extract<PointKind, "goal_milestone" | "goal_used" | "goal_leftover">;
export const awardGoal = (s: Session, kind: GoalPointKind, ref: string) => award(s, kind, ref);

/**
 * Aviso de hito con `notifyHabit` (máximo uno al día, nunca de noche, nunca el mismo dos veces; si no sale, el hito igual se ve en pantalla).
 * Lleva cuánto falta y, si se sabe, cuándo llega a su ritmo (o en su fecha).
 */
async function notifyMilestone(s: Session, goal: { id: string; name: string; target_cents: number; target_date: string | null }, pct: Milestone, savedCents: number): Promise<void> {
  const entries = await fetchAll<{ date: string; amount_cents: number }>((a, b) => s.supabase.from("goal_entries").select("date, amount_cents").eq("goal_id", goal.id).order("id").range(a, b));
  const o = goalOutlook({ targetCents: goal.target_cents, savedCents, targetDate: goal.target_date, entries: entries.map((e) => ({ date: e.date, amountCents: e.amount_cents })), today: s.today });
  await notifyHabit(s.userId, "goal", {
    goalId: goal.id, goalName: goal.name, pct, remainingCents: Math.max(0, goal.target_cents - savedCents), eta: o.kind === "pace" || o.kind === "date" ? o.when : null,
  });
}

export type Crossed = { goalId: string; name: string; pct: Milestone; points: number };

/** Lo ahorrado de cada meta (todas las del usuario). */
export async function savedNow(s: Session): Promise<Map<string, number>> {
  const rows = await fetchAll<{ goal_id: string; amount_cents: number }>((a, b) => s.supabase.from("goal_entries").select("goal_id, amount_cents").order("id").range(a, b));
  return savedByGoal(rows.map((r) => ({ goalId: r.goal_id, amountCents: r.amount_cents })));
}

/**
 * Después de un cambio: los hitos que se cruzaron suman puntos (la base los valida y nunca los da dos veces) y dejan un aviso.
 * Bajar (usar la plata) nunca quita un hito.
 */
export async function celebrate(s: Session, before: Map<string, number>, after: Map<string, number>, goalIds: Iterable<string>): Promise<Crossed[]> {
  const ids = [...new Set(goalIds)];
  if (ids.length === 0) return [];
  const goals = must(await s.supabase.from("goals").select("id, name, target_cents, target_date").in("id", ids).is("archived_at", null));
  const out: Crossed[] = [];
  for (const g of goals) {
    for (const pct of milestonesCrossed(g.target_cents, before.get(g.id) ?? 0, after.get(g.id) ?? 0)) {
      const points = await awardGoal(s, "goal_milestone", `${g.id}:${pct}`);
      await notifyMilestone(s, g, pct, after.get(g.id) ?? 0);
      out.push({ goalId: g.id, name: g.name, pct, points });
    }
  }
  return out;
}

type TxRow = {
  id: string; account_id: string | null; date: string; amount_cents: number; kind: "normal" | "transfer"; transfer_pair_id: string | null;
  deleted_at: string | null; is_split: boolean; goal_id: string | null; goal_role: "in" | "out" | "none" | null; description: string;
};
const TX_COLS = "id, account_id, date, amount_cents, kind, transfer_pair_id, deleted_at, is_split, goal_id, goal_role, description";

/**
 * Pone al día los aportes que vienen de movimientos (ver `wantedEntries` en el motor):
 * transferencias a la cuenta de la meta (solas, si hay una sola meta activa en esa cuenta), "Aporte a…" y "Pagado con…".
 * Es idempotente: si nada cambió, no escribe nada. Se llama al abrir Metas y Movimientos y después de editar un movimiento,
 * así también entran las transferencias que llegan por CSV, recurrentes o desde Cuentas.
 */
export async function syncGoalLinks(s: Session): Promise<Crossed[]> {
  if (!s.canEdit) return [];
  const db = raw(s);
  const goalsRaw = must(await db.from("goals").select("id, account_id, account_linked_on, archived_at, completed_at")) as
    { id: string; account_id: string | null; account_linked_on: string | null; archived_at: string | null; completed_at: string | null }[];
  const ended = (g: { archived_at: string | null; completed_at: string | null }) => [g.archived_at, g.completed_at].filter((d): d is string => !!d).map((d) => d.slice(0, 10)).sort()[0] ?? null;
  const goals: SyncGoal[] = goalsRaw.map((g) => ({ id: g.id, accountId: g.account_id, linkedOn: g.account_linked_on, archived: !!g.archived_at, completed: !!g.completed_at, endedOn: ended(g) }));
  const existingRaw = await fetchAll<{ id: string; transaction_id: string; goal_id: string; amount_cents: number; kind: string; date: string }>((a, b) =>
    db.from("goal_entries").select("id, transaction_id, goal_id, amount_cents, kind, date").not("transaction_id", "is", null).order("id").range(a, b));
  const existing: LinkedEntry[] = existingRaw.map((e) => ({ id: e.id, transactionId: e.transaction_id, goalId: e.goal_id, amountCents: e.amount_cents, kind: e.kind, date: e.date }));

  const txs = new Map<string, TxRow>();
  const add = (rows: TxRow[]) => rows.forEach((r) => txs.set(r.id, r));
  const win = autoWindow(goals, s.today);
  const accounts = [...new Set(goals.filter((g) => !g.archived && !g.completed && g.accountId && g.linkedOn).map((g) => g.accountId as string))];
  if (win && accounts.length) {
    add(await fetchAll<TxRow>((a, b) => db.from("transactions").select(TX_COLS).eq("kind", "transfer").gt("amount_cents", 0).in("account_id", accounts)
      .gte("date", win.from).lte("date", win.to).is("deleted_at", null).order("id").range(a, b)));
  }
  add(await fetchAll<TxRow>((a, b) => db.from("transactions").select(TX_COLS).not("goal_role", "is", null).order("id").range(a, b)));
  const missing = [...new Set(existing.map((e) => e.transactionId))].filter((id) => !txs.has(id));
  for (let i = 0; i < missing.length; i += 150) add(must(await db.from("transactions").select(TX_COLS).in("id", missing.slice(i, i + 150))) as TxRow[]);

  const list: SyncTx[] = [...txs.values()].map((t) => ({
    id: t.id, accountId: t.account_id, date: t.date, amountCents: t.amount_cents, kind: t.kind, pairId: t.transfer_pair_id,
    deleted: !!t.deleted_at, isSplit: t.is_split, goalId: t.goal_id, goalRole: t.goal_role,
  }));
  const plan = planSync(wantedEntries(list, goals, existing), existing);
  if (plan.insert.length + plan.update.length + plan.remove.length === 0) return [];

  const before = await savedNow(s);
  const touched = new Set<string>();
  const old = new Map(existing.map((e) => [e.id, e]));
  for (const w of plan.insert) {
    touched.add(w.goalId);
    const r = await db.from("goal_entries").insert({
      user_id: s.userId, goal_id: w.goalId, date: w.date, amount_cents: w.amountCents, kind: w.kind, transaction_id: w.transactionId, note: txs.get(w.transactionId)?.description ?? "",
    });
    if (r.error && r.error.code !== "23505") throw new Error(`db: ${r.error.message}`); // 23505: otra pestaña ya lo creó
  }
  for (const w of plan.update) {
    touched.add(w.goalId);
    const prev = old.get(w.id);
    if (prev) touched.add(prev.goalId);
    must(await db.from("goal_entries").update({ goal_id: w.goalId, date: w.date, amount_cents: w.amountCents, kind: w.kind }).eq("id", w.id).select("id"));
  }
  if (plan.remove.length) {
    // solo aportes que nacieron de un movimiento: los escritos a mano nunca se tocan
    for (const id of plan.remove) { const prev = old.get(id); if (prev) touched.add(prev.goalId); }
    must(await db.from("goal_entries").delete().in("id", plan.remove).not("transaction_id", "is", null).select("id"));
  }
  return celebrate(s, before, await savedNow(s), touched);
}

/** Lo que ya mandaste a tus metas por transferencia en ese mes (automático o "Aporte a…" sobre una transferencia): no es gasto. */
async function transferAportes(s: Session, year: number, month: number): Promise<number> {
  const from = `${year}-${String(month).padStart(2, "0")}-01`, to = `${year}-${String(month).padStart(2, "0")}-31`;
  const rows = await fetchAll<{ amount_cents: number; kind: string; transaction_id: string | null }>((a, b) =>
    raw(s).from("goal_entries").select("amount_cents, kind, transaction_id").in("kind", ["auto", "tx_in"]).gte("date", from).lte("date", to).gt("amount_cents", 0).order("id").range(a, b));
  const txIn = rows.filter((r) => r.kind === "tx_in" && r.transaction_id).map((r) => r.transaction_id as string);
  const transfers = new Set<string>();
  for (let i = 0; i < txIn.length; i += 150) {
    const t = must(await raw(s).from("transactions").select("id").in("id", txIn.slice(i, i + 150)).eq("kind", "transfer")) as { id: string }[];
    t.forEach((x) => transfers.add(x.id));
  }
  return rows.filter((r) => r.kind === "auto" || (r.transaction_id && transfers.has(r.transaction_id))).reduce((a, r) => a + r.amount_cents, 0);
}

/**
 * "Te sobraron $X" de un mes cerrado: lo real (entró − salió) menos lo que ya fue a metas por transferencia.
 * Solo el mes pasado o este (nunca se revive un mes viejo); si no, 0.
 */
export async function leftoverFor(s: Session, p: { year: number; month: number }, snapshot: unknown): Promise<number> {
  if (!leftoverMonthIsRecent(p, s.today)) return 0;
  const real = (snapshot as { real?: { income?: unknown; expense?: unknown } } | null)?.real;
  const net = Math.round(Number(real?.income ?? 0)) - Math.round(Number(real?.expense ?? 0));
  if (!Number.isFinite(net) || net <= 0) return 0;
  return leftoverOf(net, await transferAportes(s, p.year, p.month));
}
