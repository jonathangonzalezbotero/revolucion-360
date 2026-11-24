import "server-only";
import { loadCategories, loadMonthView, must, type MonthView } from "@/server/data";
import type { Session } from "@/server/session";
import { categoryReal, type CatResult, type Period, type Totals, type UnplannedInput } from "./lib";

/** Plan frente a lo real del mes, por categoría, con los totales escritos a mano (nivel "totales") si los hay. */
export async function closeData(s: Session, p: Period): Promise<{ view: MonthView; plan: Totals; cats: CatResult[]; unplanned: UnplannedInput[] }> {
  const [view, categories, totalsRes] = await Promise.all([
    loadMonthView(s, p.year, p.month), loadCategories(s),
    s.supabase.from("month_totals").select("category_id, amount_cents").eq("year", p.year).eq("month", p.month),
  ]);
  // Los totales escritos a mano solo mandan en el nivel "totales" (Movimientos solo los lee ahí)
  const totals = new Map(s.profile.movLevel === "totals" ? must(totalsRes).map((r) => [r.category_id, r.amount_cents]) : []);
  const groups = new Map(view.groups.map((g) => [g.category.id, g]));
  const unplanned = view.unplanned.map((t) => ({ categoryId: t.categoryId, amountCents: t.amountCents }));
  const cats = categoryReal(
    categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind, plannedCents: groups.get(c.id)?.plannedCents ?? 0, linesRealCents: groups.get(c.id)?.realCents ?? 0 })),
    unplanned, totals,
  );
  return { view, plan: view.plan, cats, unplanned };
}
