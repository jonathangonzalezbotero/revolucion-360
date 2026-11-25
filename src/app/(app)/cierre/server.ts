import "server-only";
import { fetchAll, loadCategories, loadMonthView, must, type MonthView } from "@/server/data";
import { computeHolding } from "@/lib/engine/inversiones";
import { isMissingTable } from "@/app/api/export/lib";
import { ASSET_COLS, OP_COLS, toState, untyped, type AssetRow, type OpRow } from "../inversiones/lib";
import type { Session } from "@/server/session";
import { categoryReal, type CatResult, type Period, type Totals, type UnplannedInput } from "./lib";

/** Plan frente a lo real del mes, por categoría, con los totales escritos a mano (nivel "totales") si los hay. */
export async function closeData(s: Session, p: Period): Promise<{ view: MonthView; plan: Totals; cats: CatResult[]; unplanned: UnplannedInput[] }> {
  const [view, categories, totalsRes] = await Promise.all([
    loadMonthView(s, p.year, p.month), loadCategories(s),
    s.supabase.from("month_totals").select("category_id, amount_cents").eq("year", p.year).eq("month", p.month),
  ]);
  // Los totales escritos a mano solo mandan en el nivel "totales" (Movimientos solo los lee ahí)
  // "Totales del mes" ya no existe en Movimientos (25 nov 2026): los totales que alguien guardó antes solo cuentan en
  // meses que ya terminaron; en el mes en curso y después mandan sus movimientos.
  const pastMonth = p.year * 12 + p.month < s.year * 12 + s.month;
  const totals = new Map(s.profile.movLevel === "totals" && pastMonth ? must(totalsRes).map((r) => [r.category_id, r.amount_cents]) : []);
  const groups = new Map(view.groups.map((g) => [g.category.id, g]));
  const unplanned = view.unplanned.map((t) => ({ categoryId: t.categoryId, amountCents: t.amountCents }));
  const cats = categoryReal(
    categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind, plannedCents: groups.get(c.id)?.plannedCents ?? 0, linesRealCents: groups.get(c.id)?.realCents ?? 0 })),
    unplanned, totals,
  );
  return { view, plan: view.plan, cats, unplanned };
}

/**
 * Activos de Inversiones que siguen abiertos, con sus operaciones (tablas `assets` / `asset_operations` de la
 * migración 20261125000032). El paso de saldos escribe el precio o saldo de hoy de cada uno. Si la migración aún no
 * está aplicada, el cierre sigue sin el bloque de inversiones (nunca se cae el cierre por eso).
 */
export async function closeAssets(s: Session): Promise<{ assets: AssetRow[]; ops: OpRow[] }> {
  if (s.config.menu.inversiones === "off") return { assets: [], ops: [] };
  const db = untyped(s.supabase);
  const res = await db.from("assets").select(ASSET_COLS).is("archived_at", null).order("created_at");
  if (isMissingTable(res.error)) return { assets: [], ops: [] };
  const assets = must(res) as AssetRow[];
  if (!assets.length) return { assets, ops: [] };
  const ids = assets.map((a) => a.id);
  const ops = await fetchAll<OpRow>((a, b) => db.from("asset_operations").select(OP_COLS).in("asset_id", ids).is("deleted_at", null).order("date").order("created_at").order("id").range(a, b));
  return { assets, ops };
}

/** Nombre del activo en el cierre: "VOO · Stake". */
export const assetName = (a: Pick<AssetRow, "name" | "platform">) => [a.name, a.platform].filter(Boolean).join(" · ");
/** Lo que vale hoy (cantidad × precio, o saldo + aportes posteriores), con la misma cuenta que Inversiones. */
export const assetValue = (a: AssetRow, ops: OpRow[]) => computeHolding(toState(a, ops.filter((o) => o.asset_id === a.id))).valueCents;
