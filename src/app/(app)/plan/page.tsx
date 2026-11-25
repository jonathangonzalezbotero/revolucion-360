import type { Metadata } from "next";
import Link from "next/link";
import { fill } from "@/i18n";
import { Empty, PageHeader } from "@/components/ui/basics";
import { fixedReasons, type FixedReason } from "@/lib/engine/habito";
import { loadPlan, must } from "@/server/data";
import { requireUser } from "@/server/session";
import { clampYear, linkedByMonth, marksByLine, monthState, toCellState, type LineLite, type LinkOptions } from "./lib";
import { M } from "./messages";
import { loadFixedInput } from "../repaso/data";
import { PlanGrid } from "./PlanGrid";
import { Soon } from "./Soon";

export const metadata: Metadata = { title: "Plan anual" };

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ anio?: string | string[] }> }) {
  const s = await requireUser();
  const m = M[s.locale];
  if (s.config.menu.plan !== "on") return <Soon title={s.t.nav.plan} t={m.soon} />;
  const year = clampYear((await searchParams).anio, s.year);
  const plan = await loadPlan(s, year);

  if (plan.lines.length === 0) {
    return (
      <main className="page">
        <PageHeader title={fill(m.title, { year })} eyebrow={m.eyebrow} />
        <Empty icon="plan" title={fill(m.empty.title, { year })} text={year === s.year ? m.empty.text : m.empty.other}>
          <div className="row wrap">
            {year !== s.year ? <Link href="/plan" className="btn btn-secondary btn-sm">{fill(m.empty.back, { year: s.year })}</Link> : null}
            {s.canEdit && year >= s.year ? <Link href="/asistente" className="btn btn-sm">{m.empty.cta}</Link> : null}
          </div>
        </Empty>
      </main>
    );
  }

  // "Duplicar como plan N+1" solo se ofrece si el año siguiente aún no existe (abrirlo lo copia: `loadPlan`).
  const next = year === s.year ? await s.supabase.from("plan_lines").select("id", { count: "exact", head: true }).eq("year", year + 1).is("archived_at", null) : null;
  if (next?.error) throw new Error(`db: ${next.error.message}`);
  // "Tipo de gasto": lo que eligió el usuario y cómo la clasifica hoy la regla automática (sin su elección), para explicarlo en pantalla.
  const { overrides, ...rule } = await loadFixedInput(s, plan);
  const reasons = fixedReasons(rule);
  const auto: Record<string, FixedReason | null> = Object.fromEntries(plan.lines.filter((l) => l.kind === "expense").map((l) => [l.id, reasons.get(l.id) ?? null]));
  const lines: LineLite[] = plan.lines.map((l) => ({
    id: l.id, name: l.name, kind: l.kind, categoryId: l.categoryId, year: l.year, frequency: l.frequency, amountCents: l.amountCents, firstPayDate: l.firstPayDate,
    debtId: l.debtId ?? null, goalId: l.goalId ?? null, fixed: overrides?.get(l.id) ?? null,
  }));
  // "Pagado" en la rejilla: movimientos unidos del año (ya los trae la regla de fijos) y marcas a mano.
  const linked = linkedByMonth(rule.linked, year);
  const linkedCount: Record<string, number> = {};
  for (const t of rule.linked) linkedCount[t.lineId] = (linkedCount[t.lineId] ?? 0) + 1;
  // "Unir a": metas, deudas y activos del usuario. Los cumplidos, saldados o de jubilación solo se muestran si la línea ya está unida a ellos.
  const [goals, debts, assets] = await Promise.all([
    s.supabase.from("goals").select("id, name, completed_at").is("archived_at", null).order("created_at").then(must),
    s.supabase.from("debts").select("id, name, closed_at").order("created_at").then(must),
    s.supabase.from("assets").select("id, name, kind, plan_line_id").is("archived_at", null).order("created_at").then(must),
  ]);
  const links: LinkOptions = {
    goals: goals.map((g) => ({ id: g.id, name: g.name, off: !!g.completed_at })),
    debts: debts.map((d) => ({ id: d.id, name: d.name, off: !!d.closed_at })),
    assets: assets.map((a) => ({ id: a.id, name: a.name, off: a.kind === "retirement", lineId: a.plan_line_id })),
  };

  return (
    <main className="page" style={{ maxWidth: 1280 }}>
      <PlanGrid key={year} year={year} curYear={s.year} defaultMonth={year === s.year ? s.month : 1} canEdit={s.canEdit} nextExists={(next?.count ?? 0) > 0}
        states={Array.from({ length: 12 }, (_, i) => monthState(year, i + 1, s.year, s.month))}
        categories={plan.categories} lines={lines} auto={auto} cells={toCellState(lines, plan.cells)} fmt={s.fmt} locale={s.locale} m={m}
        linked={linked} marks={marksByLine(lines.map((l) => l.id), plan.marks)} linkedCount={linkedCount} links={links}
        t={{ cancel: s.t.actions.cancel, saving: s.t.actions.saving, close: s.t.actions.close, errName: s.t.errors.name, errAmount: s.t.errors.amount, errDate: s.t.errors.date }} />
    </main>
  );
}
