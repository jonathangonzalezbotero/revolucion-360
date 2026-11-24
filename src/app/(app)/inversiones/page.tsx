import type { Metadata } from "next";
import Link from "next/link";
import { fill } from "@/i18n";
import { Empty, PageHeader } from "@/components/ui/basics";
import { ProWall } from "@/components/shell/ProWall";
import { cellMap, cellOf } from "@/lib/engine";
import { fetchAll, loadPlan, must } from "@/server/data";
import { requireUser } from "@/server/session";
import { term } from "@/server/terms";
import { Inversiones, type InvView } from "./Inversiones";
import { INV_TYPES, typeOf, valueSeries, type EntryKind, type InvType } from "./lib";
import { M } from "./messages";

export const metadata: Metadata = { title: "Inversiones" };

export default async function InversionesPage() {
  const s = await requireUser();
  const m = M[s.locale];
  if (s.config.menu.inversiones !== "on") {
    return (
      <main className="page">
        <PageHeader title={m.title} eyebrow={m.eyebrow} />
        <Empty icon="bars" title={m.soonTitle} text={m.soonText}><Link href="/inicio" className="btn btn-secondary btn-sm">{m.goHome}</Link></Empty>
      </main>
    );
  }
  if (!s.has("inv")) {
    return <main className="page"><PageHeader title={m.title} eyebrow={m.eyebrow} /><ProWall s={s} title={m.proTitle} bullets={m.proBullets} /></main>;
  }

  const [invRes, entries, plan, countryRes] = await Promise.all([
    s.supabase.from("investments").select("id, platform, name, contributed_cents, value_cents, value_date, archived_at").order("created_at"),
    fetchAll<{ id: string; investment_id: string; date: string; kind: string; amount_cents: number }>((a, b) =>
      s.supabase.from("investment_entries").select("id, investment_id, date, kind, amount_cents").order("date", { ascending: false }).order("created_at", { ascending: false }).order("id").range(a, b)),
    loadPlan(s, s.year),
    s.supabase.from("countries").select("terms").eq("code", s.profile.country).maybeSingle(),
  ]);
  const investments = must(invRes);
  const countryTerms = (must(countryRes)?.terms ?? {}) as Record<string, string>;
  const retirement = term(s, "retirement", countryTerms);
  // El tipo es el texto guardado en `name`: se reconoce en cualquier idioma y con cualquier nombre local de la jubilación.
  const labelSets = [M.es.types, M.en.types].flatMap((t) => [retirement, term(s, "retirement"), "Super"].map((r) => Object.fromEntries(INV_TYPES.map((k) => [k, fill(t[k], { retirement: r })])) as Record<InvType, string>));
  const types = Object.fromEntries(INV_TYPES.map((k) => [k, fill(m.types[k], { retirement })])) as Record<InvType, string>;

  const cells = cellMap(plan.cells);
  const catKind = new Map(plan.categories.map((c) => [c.id, c.kind]));
  const yearOf = (lineId: string, upTo = 12) => Array.from({ length: upTo }, (_, i) => cellOf(cells, lineId, i + 1)).reduce((a, b) => a + b, 0);
  const linked = plan.lines.filter((l) => l.investmentId);
  const options = plan.lines.filter((l) => catKind.get(l.categoryId) === "saving" || l.investmentId).map((l) => ({ id: l.id, name: l.name, takenBy: l.investmentId ?? null }));
  const planCents = linked.reduce((a, l) => a + yearOf(l.id, s.month), 0);
  const incomeCents = plan.lines.filter((l) => l.kind === "income").reduce((a, l) => a + yearOf(l.id, s.month), 0);

  const views: InvView[] = investments.map((i) => {
    const line = linked.find((l) => l.investmentId === i.id);
    return {
      id: i.id, platform: i.platform, type: typeOf(i.name, labelSets), contributedCents: i.contributed_cents, valueCents: i.value_cents, valueDate: i.value_date,
      archived: !!i.archived_at, line: line ? { id: line.id, name: line.name, yearCents: yearOf(line.id) } : null,
      entries: entries.filter((e) => e.investment_id === i.id).map((e) => ({ id: e.id, date: e.date, kind: e.kind as EntryKind, amountCents: e.amount_cents })),
    };
  });
  const activeIds = new Set(views.filter((v) => !v.archived).map((v) => v.id));
  const series = valueSeries(entries.slice().reverse().filter((e) => activeIds.has(e.investment_id)).map((e) => ({ investmentId: e.investment_id, date: e.date, kind: e.kind as EntryKind, amountCents: e.amount_cents })));

  return (
    <main className="page">
      <Inversiones
        items={views} series={series} lines={options} planCents={planCents} incomeCents={incomeCents} types={types} retirement={retirement}
        showSuper={s.profile.country === "AU" && !views.some((v) => !v.archived && v.type === "super")}
        fmt={s.fmt} locale={s.locale} today={s.today} year={s.year} canEdit={s.canEdit} planOn={s.config.menu.plan === "on"}
        m={m} t={{ cancel: s.t.actions.cancel, save: s.t.actions.save, add: s.t.actions.add, disclaimer: s.t.disclaimer }}
        category={plan.categories.find((c) => c.kind === "saving")?.name ?? m.category}
      />
    </main>
  );
}
