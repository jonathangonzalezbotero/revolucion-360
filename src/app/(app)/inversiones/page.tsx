import type { Metadata } from "next";
import Link from "next/link";
import { fill } from "@/i18n";
import { Empty, PageHeader } from "@/components/ui/basics";
import { cellMap, cellOf, formatDate } from "@/lib/engine";
import { computeHolding, decFromDb, formatDec, groupAssets, portfolioTotals, sortOps, tickerOf, type AssetKind } from "@/lib/engine/inversiones";
import { fetchAll, loadPlan, must } from "@/server/data";
import { requireUser } from "@/server/session";
import { term } from "@/server/terms";
import { Inversiones, type AssetView, type GroupView } from "./Inversiones";
import { ASSET_COLS, centsInputText, formatAvgPrice, formatUnitPrice, KIND_COLOR, KIND_INK, OP_COLS, priceInputText, toState, untyped, type AssetRow, type OpRow } from "./lib";
import { M } from "./messages";
import { syncRecurring } from "./recurring";

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

  const db = untyped(s.supabase);
  const [assetRes, opRows, plan, countryRes] = await Promise.all([
    db.from("assets").select(ASSET_COLS).order("created_at"),
    fetchAll<OpRow>((a, b) => db.from("asset_operations").select(OP_COLS).is("deleted_at", null).order("date").order("created_at").order("id").range(a, b)),
    loadPlan(s, s.year),
    s.supabase.from("countries").select("terms").eq("code", s.profile.country).maybeSingle(),
  ]);
  const assets = must(assetRes) as AssetRow[];
  const countryTerms = (must(countryRes)?.terms ?? {}) as Record<string, string>;
  const retirement = term(s, "retirement", countryTerms);
  const kindLabel = (k: AssetKind) => fill(m.kinds[k], { retirement });

  // Compras recurrentes del plan que ya tocaban (si falla, la pantalla igual se muestra con lo que hay).
  let ops = opRows;
  try {
    const { added, relinked } = await syncRecurring(s, assets, opRows, plan.lines);
    if (added.length) ops = sortOps([...opRows, ...added].map((o) => ({ ...o, createdAt: o.created_at }))); // por fecha, como el resto
    for (const a of assets) if (relinked.has(a.id)) a.plan_line_id = relinked.get(a.id) as string;
  } catch (e) {
    console.error("[inversiones] recurrentes", e instanceof Error ? e.message : "error"); // sin montos
  }

  const cells = cellMap(plan.cells);
  const lineById = new Map(plan.lines.map((l) => [l.id, l]));
  const savingCats = new Set(plan.categories.filter((c) => c.kind === "saving").map((c) => c.id));
  const nf = s.fmt.numberLocale;
  const dateLabel = (d: string) => `${formatDate(d, s.locale, "short")}${+d.slice(0, 4) !== s.year ? ` ${d.slice(0, 4)}` : ""}`;

  const views: AssetView[] = assets.map((a) => {
    const mine = ops.filter((o) => o.asset_id === a.id);
    const h = computeHolding(toState(a, mine));
    const price = decFromDb(a.unit_price_cents);
    const line = a.plan_line_id ? lineById.get(a.plan_line_id) : undefined;
    const unitWord = a.kind === "crypto" && a.name.trim().length <= 5 && !/\s/.test(a.name.trim()) ? a.name.trim() : a.kind === "stocks" ? m.unitShares : m.unitUnits;
    return {
      id: a.id, name: a.name, ticker: tickerOf(a.name), kind: a.kind, kindLabel: kindLabel(a.kind), color: KIND_COLOR[a.kind], ink: KIND_INK[a.kind],
      platform: a.platform, byUnits: a.by_units, archived: !!a.archived_at,
      qtyText: a.by_units ? `${formatDec(h.qty, nf)} ${unitWord}` : null,
      avgText: h.avgCostCents !== null ? formatAvgPrice(h.avgCostCents, s.fmt) : null,
      valueCents: h.valueCents, costCents: h.costCents, gainCents: h.gainCents, dividendsCents: h.dividendsCents, hasPrice: h.hasPrice,
      priceInput: a.by_units ? (price !== null ? priceInputText(price, nf) : "") : a.balance_cents !== null ? centsInputText(a.balance_cents) : "",
      priceDateLabel: a.price_date ? dateLabel(a.price_date) : null,
      lineId: a.plan_line_id,
      recurring: line ? { line: line.name, amountCents: cellOf(cells, line.id, s.month) || line.amountCents } : null,
      recNeedsPrice: !!line && a.by_units && price === null,
      ops: mine.slice().reverse().map((o) => {
        const q = decFromDb(o.quantity), up = decFromDb(o.unit_price_cents);
        const rec = o.source === "recurring" ? ` · ${m.detRecurring}` : "";
        const detail = o.kind === "dividend" ? m.detCash
          : o.source === "migrated" ? m.detMigrated
          : a.by_units && q !== null ? `${formatDec(q, nf)} × ${up !== null ? formatUnitPrice(up, s.fmt) : "—"}${rec}`
          : `${m.detAmount}${rec}`;
        return { id: o.id, kind: o.kind, dateLabel: dateLabel(o.date), detail, amountCents: o.amount_cents };
      }),
    };
  }).sort((x, y) => y.valueCents - x.valueCents);

  const active = views.filter((v) => !v.archived);
  const totals = portfolioTotals(active);
  const byPlatform: GroupView[] = groupAssets(active.map((v) => ({ key: v.platform?.trim() || "", valueCents: v.valueCents, costCents: v.costCents })))
    .map((g) => ({ ...g, name: g.key || m.noPlatform, color: "var(--tinta)" }));
  const byKind: GroupView[] = groupAssets(active.map((v) => ({ key: v.kind, valueCents: v.valueCents, costCents: v.costCents })))
    .map((g) => ({ ...g, name: kindLabel(g.key as AssetKind), color: KIND_COLOR[g.key as AssetKind] }));
  // Una línea alimenta un solo activo (si no, la misma plata se sumaría dos veces).
  const lines = plan.lines.filter((l) => l.kind === "expense" && (savingCats.has(l.categoryId) || assets.some((a) => a.plan_line_id === l.id)))
    .map((l) => ({ id: l.id, name: l.name, takenBy: assets.find((a) => a.plan_line_id === l.id && !a.archived_at)?.id ?? null }));

  return (
    <main className="page">
      <Inversiones
        assets={views} totals={totals} byPlatform={byPlatform} byKind={byKind} lines={lines}
        kinds={Object.fromEntries((Object.keys(KIND_COLOR) as AssetKind[]).map((k) => [k, kindLabel(k)])) as Record<AssetKind, string>}
        retirement={retirement} category={plan.categories.find((c) => c.kind === "saving")?.name ?? m.category}
        fmt={s.fmt} today={s.today} canEdit={s.canEdit} planOn={s.config.menu.plan === "on"}
        m={m} t={{ cancel: s.t.actions.cancel, save: s.t.actions.save, add: s.t.actions.add, disclaimer: s.t.disclaimer }}
      />
    </main>
  );
}
