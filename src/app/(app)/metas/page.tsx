import type { Metadata } from "next";
import Link from "next/link";
import { fill } from "@/i18n";
import { Empty, PageHeader } from "@/components/ui/basics";
import { ProWall } from "@/components/shell/ProWall";
import { goalPlan } from "@/lib/engine";
import { fetchAll, must } from "@/server/data";
import { requireUser } from "@/server/session";
import { atFreeLimit, goalStatus, typeOf } from "./lib";
import { M } from "./messages";
import { Metas, type GoalView } from "./Metas";

export const metadata: Metadata = { title: "Metas" };
type Search = Promise<{ nueva?: string }>;

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
  if (!s.has("metas")) {
    return <main className="page"><PageHeader title={m.title} eyebrow={m.eyebrow} /><ProWall s={s} title={m.proTitle} bullets={m.proBullets} /></main>;
  }

  const [goalsRes, entries, linesRes, accountsRes] = await Promise.all([
    s.supabase.from("goals").select("id, name, kind, target_cents, target_date, is_emergency_fund, completed_at, account_id").is("archived_at", null).order("created_at"),
    fetchAll<{ id: string; goal_id: string; date: string; amount_cents: number; note: string }>((a, b) =>
      s.supabase.from("goal_entries").select("id, goal_id, date, amount_cents, note").order("date", { ascending: false }).order("created_at", { ascending: false }).order("id").range(a, b)),
    s.supabase.from("plan_lines").select("goal_id").eq("year", s.year).is("archived_at", null).not("goal_id", "is", null),
    s.supabase.from("accounts").select("id, name, archived_at").order("sort").order("created_at"),
  ]);
  const accounts = must(accountsRes);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const goals = must(goalsRes);
  const inPlan = new Set(must(linesRes).map((l) => l.goal_id));
  const labels = [M.es.types, M.en.types];

  const views: GoalView[] = goals.map((g) => {
    const own = entries.filter((e) => e.goal_id === g.id);
    const plan = goalPlan(g.target_cents, own.map((e) => e.amount_cents), g.target_date, s.today);
    return {
      id: g.id, name: g.name, kind: g.kind, type: typeOf(g.kind, labels), targetCents: g.target_cents, targetDate: g.target_date, isEmergencyFund: g.is_emergency_fund,
      accountId: g.account_id, accountName: (g.account_id && accountName.get(g.account_id)) || "",
      completed: !!g.completed_at, inPlan: inPlan.has(g.id), plan, status: goalStatus(plan, g.target_cents, g.target_date, s.today),
      entries: own.map((e) => ({ id: e.id, date: e.date, amountCents: e.amount_cents, note: e.note })),
    };
  });
  const active = views.filter((g) => !g.completed).length;
  const limit = s.config.limits.free_goals;
  const blocked = atFreeLimit(s.tier, active, limit);

  return (
    <Metas
      goals={views} accounts={accounts.filter((a) => !a.archived_at).map((a) => ({ id: a.id, name: a.name }))} fmt={s.fmt} locale={s.locale} today={s.today} canEdit={s.canEdit} m={m} openNew={q.nueva === "1"}
      points={s.config.gamification ? { contrib: s.config.points.goal_contrib ?? 0, done: s.config.points.goal_done ?? 0 } : null}
      planHref={s.config.menu.plan === "on" ? "/plan" : null}
      wall={blocked ? <ProWall s={s} title={m.wallTitle} text={limit === 1 ? m.wallOne : fill(m.wallText, { n: limit })} bullets={m.wallBullets} /> : null}
    />
  );
}
