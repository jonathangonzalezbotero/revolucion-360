import "server-only";
import { cache } from "react";
import { dailyAllowance, fixedLineIds, monthAvailable, fixedOverrides, fixedSlots, flexibleBudget, flexibleSpend, type Allowance, type ByCategory, type MonthAvailable, type FixedInput, type HabitLine, type LinkedTx } from "@/lib/engine/habito";
import { fetchAll, loadMonthView, loadPlan, loadTx, monthRange, must, type MonthView, type PlanData } from "@/server/data";
import type { Session } from "@/server/session";

// "Disponible del mes" (Inicio) y el día a día del mes, con la sesión del usuario (RLS). Lo usan Inicio y el Repaso.
// Mismas reglas que la tarea de avisos (src/app/api/cron/habito/data.ts): todo sale de src/lib/engine/habito.ts.

export type HabitView = {
  plan: PlanData; view: MonthView; lines: HabitLine[];
  fixed: Set<string>;
  /** Líneas pagadas este mes ("lineId:mes"). */
  paid: Set<string>;
  budget: { totalCents: number; byCategory: ByCategory };
  spent: { totalCents: number; byCategory: ByCategory };
  allowance: Allowance;
  /** "Disponible del mes" de Inicio: lo que queda para el día a día hasta fin de mes. */
  available: MonthAvailable;
};

/**
 * Todo lo que la regla de "fijo / del día a día" necesita para un año del plan, con la elección del usuario (`overrides`).
 * Lo usan "Disponible del mes" (Inicio), el Repaso y el interruptor "Tipo de gasto" de Plan (que muestra la regla sin `overrides`).
 */
export const loadFixedInput = cache(async (s: Session, plan: PlanData): Promise<FixedInput> => {
  const y = plan.year;
  const [recRes, linkedRows, lineRows] = await Promise.all([
    s.supabase.from("recurring").select("plan_line_id").eq("active", true).not("plan_line_id", "is", null),
    fetchAll<{ plan_line_id: string | null; date: string; amount_cents: number; kind: string; is_split: boolean }>((a, b) =>
      s.supabase.from("transactions").select("plan_line_id, date, amount_cents, kind, is_split").is("deleted_at", null).not("plan_line_id", "is", null)
        .gte("date", `${y}-01-01`).lte("date", `${y}-12-31`).order("date").order("id").range(a, b)),
    // `plan_lines.fixed` (migración 20261125000035). select("*") a propósito: mientras la migración no esté aplicada la columna
    // no existe y nombrarla rompería Inicio; así simplemente no llega y todo queda en automático. Cast puntual hasta regenerar tipos.
    fetchAll<{ id: string }>((a, b) => s.supabase.from("plan_lines").select("*").eq("year", y).is("archived_at", null).order("id").range(a, b)),
  ]);
  const linked: LinkedTx[] = linkedRows.filter((t) => t.plan_line_id && t.kind === "normal" && !t.is_split).map((t) => ({ lineId: t.plan_line_id!, date: t.date, amountCents: t.amount_cents }));
  const recurringLineIds = must(recRes).map((r) => r.plan_line_id).filter((x): x is string => !!x);
  const overrides = fixedOverrides(lineRows as { id: string; fixed?: boolean | null }[]);
  return { lines: plan.lines, categories: plan.categories, cells: plan.cells, marks: plan.marks, recurringLineIds, linked, overrides };
});

export const loadHabit = cache(async (s: Session): Promise<HabitView> => {
  const [plan, view, monthTx] = await Promise.all([
    loadPlan(s, s.year),
    loadMonthView(s, s.year, s.month),
    loadTx(s, ...monthRange(s.year, s.month)),
  ]);
  const lines: HabitLine[] = plan.lines;
  const input = await loadFixedInput(s, plan);
  const linked = input.linked;
  const fixed = fixedLineIds(input);

  const budget = flexibleBudget(lines, plan.cells, s.month, fixed);
  const thisMonth = `${s.year}-${String(s.month).padStart(2, "0")}`;
  const slots = fixedSlots(lines, plan.cells, s.month, fixed, linked.filter((t) => t.date.startsWith(thisMonth)));
  const spent = flexibleSpend(monthTx, lines, plan.categories, fixed, slots);
  const allowance = dailyAllowance({ budgetCents: budget.totalCents, spentCents: spent.totalCents, today: s.today, planNetCents: view.plan.net });
  const available = monthAvailable({ budgetCents: budget.totalCents, spentCents: spent.totalCents, today: s.today, planNetCents: view.plan.net });
  const paid = new Set(view.groups.flatMap((g) => g.lines).filter((l) => l.status === "paid" || l.status === "paid_manual" || l.status === "over").map((l) => `${l.line.id}:${s.month}`));
  return { plan, view, lines, fixed, paid, budget, spent, allowance, available };
});
