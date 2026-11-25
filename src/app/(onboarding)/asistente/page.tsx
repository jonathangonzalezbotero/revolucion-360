import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Empty } from "@/components/ui/basics";
import { cellMap, cellOf, monthName } from "@/lib/engine";
import { loadCategories, loadPlan, must } from "@/server/data";
import { requireUser } from "@/server/session";
import { wizardContext } from "./context";
import { answersFromPlan, AnswersSchema, defaultAnswers, hasLinks, pickCategory } from "./lib";
import { M } from "./messages";
import { Wizard } from "./Wizard";

export const metadata: Metadata = { title: "Arma tu plan" };

export default async function AsistentePage() {
  const s = await requireUser({ allowOnboarding: true });
  if (s.profile.onboardingStep === "welcome") redirect("/bienvenida");
  const m = M[s.locale];
  if (!s.canEdit) {
    return (
      <main className="page" style={{ margin: "0 auto" }}>
        <h1>{m.title}</h1>
        <Empty icon="lock" title={s.t.readOnly.title} text={s.t.readOnly.body}><Link href="/inicio" className="btn btn-secondary btn-sm">{m.readOnlyCta}</Link></Empty>
      </main>
    );
  }
  const { ctx, freelance } = wizardContext(s);
  const [cats, ctry, plan] = await Promise.all([
    loadCategories(s),
    s.supabase.from("countries").select("tax_reserve_enabled").eq("code", s.profile.country).maybeSingle().then(must),
    loadPlan(s, ctx.year),
  ]);
  const familyId = pickCategory(cats, "family");
  // Las metas que eligió en la bienvenida llegan como punto de partida (aquí les pone nombre, monto y fecha)
  const seeds: Record<string, string> = m.goals.seeds;
  const seed = (s.profile.wizard.seed as { goals?: unknown } | undefined)?.goals;
  const goalNames = (Array.isArray(seed) ? seed : []).map((g) => seeds[String(g)]).filter(Boolean);
  const fallback = defaultAnswers({ payFrequency: s.profile.payFrequency, incomeName: m.income.defaultName, goalNames });
  // Si ya tiene plan del año, el asistente arranca con sus datos (`answersFromPlan`) y al guardar actualiza esas líneas.
  // Un avance guardado se respeta solo si ya venía del plan; uno armado desde cero, con un plan existente, duplicaría líneas.
  const goalIds = [...new Set(plan.lines.map((l) => l.goalId).filter((x): x is string => !!x))];
  const goals = goalIds.length ? must(await s.supabase.from("goals").select("id, name, target_cents, target_date").in("id", goalIds).is("archived_at", null)) : [];
  const fromPlan = plan.lines.length
    ? answersFromPlan(plan.lines, goals.map((g) => ({ id: g.id, name: g.name, targetCents: g.target_cents, targetDate: g.target_date })), fallback, ctx.labels, ctx.remesas)
    : null;
  const saved = AnswersSchema.safeParse(s.profile.wizard.answers);
  const initial = saved.success && (!fromPlan || !hasLinks(fromPlan) || hasLinks(saved.data)) ? saved.data : fromPlan ?? fallback;
  // El resto del plan en el mes que muestra el resumen: así el último paso cuadra con Inicio.
  const cells = cellMap(plan.cells);
  const existing = plan.lines.map((l) => ({ id: l.id, kind: l.kind, monthCents: cellOf(cells, l.id, ctx.month) }));
  const currencies: Record<string, string> = m.currencies;
  return (
    <Wizard
      m={m}
      fmt={s.fmt}
      ctx={ctx}
      monthLabel={monthName(s.month, s.locale).toLowerCase()}
      redo={s.profile.onboardingStep === "done" || plan.lines.length > 0}
      loaded={hasLinks(initial)}
      existing={existing}
      initial={initial}
      freelance={freelance}
      currencyName={currencies[s.profile.currency] ?? s.profile.currency}
      familyCategory={cats.find((c) => c.id === familyId)?.name ?? m.family.category}
      taxSection={s.t.nav.deudas}
      taxReserve={ctry?.tax_reserve_enabled !== false}
      yes={s.t.yes}
      no={s.t.no}
    />
  );
}
