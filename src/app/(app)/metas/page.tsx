import type { Metadata } from "next";
import Link from "next/link";
import { fill } from "@/i18n";
import { Empty, PageHeader } from "@/components/ui/basics";
import { goalPlan, monthName } from "@/lib/engine";
import {
  goalOutlook, milestonesReached, monthContributions, nextMilestone, sharedAccounts,
} from "@/lib/engine/metas";
import { fetchAll, must } from "@/server/data";
import { requireUser } from "@/server/session";
import { asContribFreq, customKind, goalStatus, kindLabel, objectiveSuggestions, planOutlook, sortGoals, typeOf, type Contribution } from "./lib";
import { M } from "./messages";
import { Metas, type GoalView } from "./Metas";
import { leftoverFor, raw, syncGoalLinks } from "./server";

export const metadata: Metadata = { title: "Metas" };
type Search = Promise<{ nueva?: string }>;

type GoalRow = {
  id: string; name: string; kind: string; why: string; target_cents: number; target_date: string | null; is_emergency_fund: boolean;
  completed_at: string | null; account_id: string | null; account_linked_on: string | null;
};
type EntryRow = { id: string; goal_id: string; date: string; amount_cents: number; note: string; kind: string };

export default async function MetasPage({ searchParams }: { searchParams: Search }) {
  const s = await requireUser();
  const m = M[s.locale];
  const q = await searchParams;
  if (s.config.menu.metas !== "on") {
    return (
      <main className="page">
        <PageHeader title={m.title} eyebrow={m.eyebrow} />
        <Empty icon="target" title={m.soonTitle} text={m.soonText}><Link href="/inicio" className="btn btn-secondary btn-sm">{m.goHome}</Link></Empty>
      </main>
    );
  }

  // Transferencias a la cuenta de la meta (también las que llegaron por CSV, recurrentes o Cuentas) y lo elegido en Movimientos.
  const crossed = await syncGoalLinks(s);

  const db = raw(s);
  const [goalsRes, entries, linesRes, accountsRes, closuresRes, decidedRes] = await Promise.all([
    db.from("goals").select("id, name, kind, why, target_cents, target_date, is_emergency_fund, completed_at, account_id, account_linked_on").is("archived_at", null).order("created_at"),
    fetchAll<EntryRow>((a, b) =>
      db.from("goal_entries").select("id, goal_id, date, amount_cents, note, kind").order("date", { ascending: false }).order("created_at", { ascending: false }).order("id").range(a, b)),
    s.supabase.from("plan_lines").select("goal_id, amount_cents, frequency").eq("year", s.year).is("archived_at", null).not("goal_id", "is", null).order("created_at"),
    s.supabase.from("accounts").select("id, name, archived_at").order("sort").order("created_at"),
    s.supabase.from("month_closures").select("year, month, reopened_at, snapshot").is("reopened_at", null).order("year", { ascending: false }).order("month", { ascending: false }).limit(1),
    db.from("goal_leftovers").select("year, month"),
  ]);
  const accounts = must(accountsRes);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const goals = must(goalsRes) as GoalRow[];
  const goalLines = must(linesRes);
  const inPlan = new Set(goalLines.map((l) => l.goal_id));
  // El aporte de cada meta: su línea del plan de este año (la primera, si hubiera más de una). De ahí sale el ritmo.
  const contributions = new Map<string, Contribution>();
  for (const l of goalLines) {
    const frequency = asContribFreq(l.frequency);
    if (l.goal_id && frequency && l.amount_cents > 0 && !contributions.has(l.goal_id)) contributions.set(l.goal_id, { amountCents: l.amount_cents, frequency });
  }
  const labels = [M.es.types, M.en.types];
  const shared = sharedAccounts(goals.map((g) => ({ id: g.id, accountId: g.account_id, linkedOn: g.account_linked_on, archived: false, completed: !!g.completed_at })));

  /** Historial: de dónde vino cada aporte o uso. Un aporte que quedó en 0 no se muestra. */
  const label = (e: EntryRow): string => {
    switch (e.kind) {
      case "auto": return fill(m.hAuto, { desc: e.note || m.hTransfer });
      case "tx_in": return fill(m.hTxIn, { desc: e.note || m.entryIn });
      case "used": return fill(m.hUsed, { desc: e.note || m.entryOut });
      case "leftover": return fill(m.hLeftover, { month: monthName(Number(e.note.slice(5, 7)) || 1, s.locale).toLowerCase() });
      default: return e.note || (e.amount_cents >= 0 ? m.entryIn : m.entryOut);
    }
  };

  // Primero las que tienen algo ahorrado (de mayor a menor), después las de $0 (aprobado por Jonathan el 25 nov 2026).
  const views: GoalView[] = sortGoals(goals.map((g) => {
    const own = entries.filter((e) => e.goal_id === g.id);
    const plan = goalPlan(g.target_cents, own.map((e) => e.amount_cents), g.target_date, s.today);
    const lite = own.map((e) => ({ date: e.date, amountCents: e.amount_cents }));
    return {
      id: g.id, name: g.name, kind: g.kind, kindLabel: kindLabel(g.kind, m.types, labels), custom: customKind(g.kind, labels), why: g.why ?? "", type: typeOf(g.kind, labels), targetCents: g.target_cents, targetDate: g.target_date, isEmergencyFund: g.is_emergency_fund,
      accountId: g.account_id, accountName: (g.account_id && accountName.get(g.account_id)) || "",
      accountMode: !g.account_id ? "none" : shared.has(g.account_id) ? "shared" : "auto",
      completed: !!g.completed_at, inPlan: inPlan.has(g.id), plan, status: goalStatus(plan, g.target_cents, g.target_date, s.today),
      contribution: contributions.get(g.id) ?? null,
      outlook: planOutlook(
        goalOutlook({ targetCents: g.target_cents, savedCents: plan.savedCents, targetDate: g.target_date, entries: lite, today: s.today }),
        contributions.get(g.id) ?? null, plan.remainingCents, s.today,
      ),
      reached: milestonesReached(g.target_cents, plan.savedCents), next: nextMilestone(g.target_cents, plan.savedCents),
      entries: own.filter((e) => e.amount_cents !== 0).map((e) => ({ id: e.id, date: e.date, amountCents: e.amount_cents, label: label(e) })),
      savedCents: plan.savedCents,
    };
  }));
  const active = views.filter((g) => !g.completed);
  const activeIds = new Set(active.map((g) => g.id));
  const monthIn = monthContributions(entries.filter((e) => activeIds.has(e.goal_id)).map((e) => ({ date: e.date, amountCents: e.amount_cents })), s.today);

  // "Cerraste noviembre y te sobraron $X": el último mes cerrado, si es reciente, sobró plata y aún no decidiste qué hacer.
  const last = must(closuresRes)[0];
  const decided = new Set((must(decidedRes) as { year: number; month: number }[]).map((d) => `${d.year}-${d.month}`));
  const leftCents = last && s.canEdit && active.length > 0 && !decided.has(`${last.year}-${last.month}`) ? await leftoverFor(s, last, last.snapshot) : 0;
  const leftover = last && leftCents > 0
    ? { year: last.year, month: last.month, monthLabel: monthName(last.month, s.locale).toLowerCase(), cents: leftCents } : null;

  const pts = s.config.points;
  return (
    <Metas
      goals={views} accounts={accounts.filter((a) => !a.archived_at).map((a) => ({ id: a.id, name: a.name }))} fmt={s.fmt} locale={s.locale} today={s.today} canEdit={s.canEdit} m={m} openNew={q.nueva === "1"}
      points={s.config.gamification ? { contrib: pts.goal_contrib ?? 0, done: pts.goal_done ?? 0, milestone: pts.goal_milestone ?? 20 } : null}
      planHref={s.config.menu.plan === "on" ? "/plan" : null}
      wall={null}
      monthIn={monthIn} leftover={leftover}
      suggestions={s.canEdit ? objectiveSuggestions(s.profile.prefs) : []}
      crossed={crossed.map((c) => ({ text: fill(m.tMilestone, { pct: c.pct, name: c.name }), points: c.points }))}
    />
  );
}
