import type { Metadata } from "next";
import Link from "next/link";
import { fill } from "@/i18n";
import { Empty, ListLink, PageHeader } from "@/components/ui/basics";
import { monthShort } from "@/lib/engine";
import { loadAccounts, loadPlan, must } from "@/server/data";
import { requireUser } from "@/server/session";
import { Forecast } from "./Forecast";
import { horizon, offIdsOf, parseConfig, type LineKey, type YearPlan } from "./lib";
import { M } from "./messages";
import { TrackView } from "./TrackView";

export const metadata: Metadata = { title: "Proyección" };
type Search = Promise<{ meses?: string }>;

export default async function ProyeccionPage({ searchParams }: { searchParams: Search }) {
  const s = await requireUser();
  const m = M[s.locale];
  const q = await searchParams;
  if (s.config.menu.proyeccion !== "on") {
    return (
      <main className="page">
        <PageHeader title={m.title} />
        <Empty icon="trend" title={m.soonTitle} text={m.soonText}><Link href="/inicio" className="btn btn-secondary btn-sm">{m.goHome}</Link></Empty>
      </main>
    );
  }
  const [plan, accounts] = await Promise.all([loadPlan(s, s.year), loadAccounts(s)]);
  const inForecast = accounts.filter((a) => a.inForecast);
  if (inForecast.length === 0 || plan.lines.length === 0) {
    return (
      <main className="page">
        <TrackView />
        <PageHeader title={m.title} eyebrow={m.eyebrow12Short} />
        <Empty icon="trend" title={m.emptyTitle} text={m.emptyText}>
          <div className="list" style={{ alignSelf: "stretch", maxWidth: 560 }}>
            {inForecast.length === 0 ? <ListLink href="/cuentas" icon="wallet" title={m.noAccounts} text={m.noAccountsSub} /> : null}
            {plan.lines.length === 0 ? <ListLink href="/asistente" icon="plan" title={m.noPlan} text={m.noPlanSub} /> : null}
          </div>
        </Empty>
        <p className="xs muted">{s.t.disclaimer}</p>
      </main>
    );
  }

  // Por defecto, 12 meses desde el mes actual (como el mockup): el plan del año siguiente se pide y se crea si hace falta.
  const extended = q.meses !== "dic" && s.month > 1;
  const next = extended ? await loadPlan(s, s.year + 1) : null;
  const months = horizon(s.year, s.month, extended);
  const plan1: YearPlan = { lines: plan.lines, cells: plan.cells };
  const plan2: YearPlan | null = next ? { lines: next.lines, cells: next.cells } : null;
  const savingCats = new Set(plan.categories.filter((c) => c.kind === "saving" || c.kind === "goal").map((c) => c.id));
  const savingLineIds = [...plan.lines, ...(next?.lines ?? [])].filter((l) => savingCats.has(l.categoryId)).map((l) => l.id);
  const known: LineKey[] = [...plan.lines, ...(next?.lines ?? [])];

  const rows = must(await s.supabase.from("forecast_scenarios").select("id, name, config").order("created_at"));
  // Líneas apagadas que ya no están en el plan (otro año): se leen para buscarlas por nombre y categoría.
  const missing = [...new Set(rows.flatMap((r) => offIdsOf(r.config)))].filter((id) => /^[0-9a-f-]{36}$/i.test(id) && !known.some((k) => k.id === id));
  const oldRows = missing.length ? must(await s.supabase.from("plan_lines").select("id, name, category_id, kind").in("id", missing)) : [];
  const old = new Map<string, LineKey>(oldRows.map((l) => [l.id, { id: l.id, name: l.name, categoryId: l.category_id, kind: l.kind as LineKey["kind"] }]));
  const scenarios = rows.map((r) => ({ id: r.id, name: r.name, config: parseConfig(r.config, s.year, known, old) }));
  const startCents = inForecast.reduce((a, x) => a + x.balanceCents, 0);
  const label = (i: number) => `${monthShort(months[i].month, s.locale).toLowerCase()} ${months[i].year}`;
  const range = { from: label(0), to: label(months.length - 1) };
  const href = (meses: string | null) => (meses ? `/proyeccion?meses=${meses}` : "/proyeccion");

  return (
    <main className="page">
      <TrackView />
      <PageHeader title={m.title} eyebrow={<><span className="only-desktop">{fill(extended ? m.eyebrow12 : m.eyebrowDec, range)}</span><span className="only-mobile">{extended ? m.eyebrow12Short : m.eyebrowDecShort}</span></>}>
        {s.month > 1 ? (
          <nav aria-label={m.horizon} className="seg">
            <Link href={href(null)} aria-current={extended ? "page" : undefined}>{m.next12}</Link>
            <Link href={href("dic")} aria-current={!extended ? "page" : undefined}>{m.toDec}</Link>
          </nav>
        ) : null}
        {s.config.menu.plan === "on" ? <Link href="/plan" className="btn btn-secondary only-desktop">{m.editPlan}</Link> : null}
      </PageHeader>
      <Forecast
        months={months} plan1={plan1} plan2={plan2} startCents={startCents} savingLineIds={savingLineIds}
        usesDecember={extended && !next?.lines.length} nextYear={s.year + 1}
        scenarios={scenarios} canScenarios canEdit={s.canEdit}
        fmt={s.fmt} locale={s.locale} m={m}
        lock={null}
      />
      <p className="xs muted">{s.t.disclaimer}</p>
    </main>
  );
}
