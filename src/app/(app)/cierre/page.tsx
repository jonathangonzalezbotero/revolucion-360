import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fill } from "@/i18n";
import { Empty, PageHeader } from "@/components/ui/basics";
import { Icon } from "@/components/ui/Icon";
import { cellMap, cellOf, expectedBalance, formatDate, formatMoney, monthName } from "@/lib/engine";
import { closureTarget } from "@/server/closure";
import { loadAccounts, loadPlan, loadTx, must } from "@/server/data";
import { requireUser } from "@/server/session";
import { Cierre, type CierreProps } from "./Cierre";
import { cardShown, deviations, nextPeriod, parsePeriod, pendingOptions, periodOfDate, readSnapshot, realTotals, type Period } from "./lib";
import { M } from "./messages";
import { assetName, closeAssets, closeData } from "./server";
import { formatUnitPrice } from "../inversiones/lib";
import { decFromDb } from "@/lib/engine/inversiones";
import { leftoverFor, raw } from "../metas/server";
import { movMode } from "@/lib/engine/registro";

export const metadata: Metadata = { title: "Cierre de mes" };

const planMonthHref = (p: Period, curYear: number) => `/plan/mes/${p.month}${p.year === curYear ? "" : `?anio=${p.year}`}`;

export default async function CierrePage({ searchParams }: { searchParams: Promise<{ anio?: string | string[]; mes?: string | string[] }> }) {
  const s = await requireUser();
  const m = M[s.locale];
  const sp = await searchParams;

  if (s.config.menu.cierre !== "on") {
    return (
      <main className="page">
        <PageHeader title={m.title} />
        <Empty icon="check" title={m.soonTitle} text={m.soonText}><Link href="/inicio" className="btn btn-secondary btn-sm">{m.goHome}</Link></Empty>
      </main>
    );
  }
  const today = { year: s.year, month: s.month };
  const target = await closureTarget(s);
  const asked = parsePeriod(sp.anio, sp.mes, today, periodOfDate(s.profile.createdAt));
  // El mes queda fijo en la dirección: así no cambia debajo del usuario cuando el cierre se guarda y la página se recarga.
  if (!asked) {
    const p = target ? { year: target.year, month: target.month } : today;
    redirect(`/cierre?anio=${p.year}&mes=${p.month}`);
  }
  const period: Period = asked;
  const next = nextPeriod(period);
  const name = monthName(period.month, s.locale), nextName = monthName(next.month, s.locale);
  const lower = name.toLowerCase(), nextLower = nextName.toLowerCase();

  const [data, closuresRes, reviewRes, nextPlan, thisPlan, accounts, inv] = await Promise.all([
    closeData(s, period),
    s.supabase.from("month_closures").select("year, month, closed_at, reopened_at, snapshot").order("year", { ascending: false }).order("month", { ascending: false }),
    s.supabase.from("transactions").select("id", { count: "exact", head: true }).eq("status", "review").is("deleted_at", null),
    loadPlan(s, next.year), loadPlan(s, period.year), loadAccounts(s),
    closeAssets(s),
  ]);
  // Lo que sobró: ¿a qué meta va? Una sola decisión por mes (aunque se reabra y se cierre de nuevo).
  const [goalsRes, decidedRes] = await Promise.all([
    s.config.menu.metas === "on" ? s.supabase.from("goals").select("id, name").is("archived_at", null).is("completed_at", null).order("created_at") : Promise.resolve({ data: [], error: null }),
    raw(s).from("goal_leftovers").select("year").eq("year", period.year).eq("month", period.month),
  ]);
  const decided = (must(decidedRes) as unknown[]).length > 0;
  // Activos de Inversiones: por unidades se escribe el precio por unidad de hoy; por saldo, el saldo de hoy.
  const investments: CierreProps["investments"] = inv.assets.map((a) => {
    const price = decFromDb(a.unit_price_cents);
    const date = a.price_date ? formatDate(a.price_date, s.locale, "short") : null;
    const note = !date ? m.noValue
      : a.by_units ? (price !== null ? fill(m.lastPrice, { amount: formatUnitPrice(price, s.fmt), date }) : m.noValue)
      : fill(m.lastValue, { amount: formatMoney(a.balance_cents ?? 0, s.fmt), date });
    return { id: a.id, name: assetName(a), byUnits: a.by_units, note };
  });
  const closures = must(closuresRes);
  if (reviewRes.error) throw new Error(`db: ${reviewRes.error.message}`);
  const view = data.view;
  const row = closures.find((r) => r.year === period.year && r.month === period.month);
  const closedSnap = row && !row.reopened_at ? readSnapshot(row.snapshot) : null; // puede faltar (snapshot vacío): el mes sigue cerrado
  const leftover: CierreProps["leftover"] = {
    goals: must(goalsRes).map((g) => ({ id: g.id, name: g.name })), decided,
    closedCents: row && !row.reopened_at && !decided && s.canEdit ? await leftoverFor(s, period, row.snapshot) : 0,
  };

  // 1. Revisa
  const nextIds = new Set(nextPlan.lines.map((l) => l.id));
  const canMove = (l: { id: string; name: string; categoryId: string }) =>
    next.year === period.year ? nextIds.has(l.id) : nextPlan.lines.some((x) => x.name === l.name && x.categoryId === l.categoryId);
  // En modo Mensual, lo del día a día sin movimientos ya cuenta como gastado según el plan: no queda pendiente.
  const pending: CierreProps["pending"] = data.pending.map((l) => ({
    lineId: l.line.id, name: l.line.name, status: l.status, plannedCents: l.plannedCents, realCents: l.realCents, missingCents: l.missingCents,
    opts: pendingOptions(l.status, canMove(l.line)),
  }));
  const over = view.groups.flatMap((g) => g.lines).filter((l) => l.status === "over" && l.line.kind === "expense").map((l) => ({ lineId: l.line.id, name: l.line.name, overCents: l.realCents - l.plannedCents }));

  // 2. Compara
  const known = new Set(data.cats.map((c) => c.id));
  const real = realTotals(data.cats, data.unplanned, known);

  // 3. Ajusta el mes siguiente
  const nmap = cellMap(nextPlan.cells);
  const nextIncome = nextPlan.lines.filter((l) => l.kind === "income").reduce((a, l) => a + cellOf(nmap, l.id, next.month), 0);
  const nextLines = nextPlan.lines.filter((l) => l.kind === "expense" && cellOf(nmap, l.id, next.month) > 0).map((l) => ({ lineId: l.id, name: l.name, cents: cellOf(nmap, l.id, next.month) }));

  // 4. Saldos: esperado = último saldo + movimientos posteriores (transferencias incluidas; el padre dividido no)
  const since = accounts.reduce((min, a) => (a.balanceDate < min ? a.balanceDate : min), s.today);
  const txs = accounts.length ? (await loadTx(s, since, s.today)).filter((t) => !t.isSplit) : [];
  const balances: CierreProps["balances"] = accounts.map((a) => {
    const moved = movMode(s.profile.movLevel) === "diario" || txs.some((t) => t.accountId === a.id && t.date > a.balanceDate);
    return {
      id: a.id, name: a.name, kind: a.kind, card: a.kind === "card", balanceCents: a.balanceCents, shownCents: cardShown(a.kind, a.balanceCents),
      expectedCents: expectedBalance(a, txs), reconcile: moved, dateLabel: formatDate(a.balanceDate, s.locale, "short"),
    };
  });

  // Lista de meses cerrados del año que se cierra
  const list: CierreProps["list"] = closures.filter((r) => r.year === period.year).map((r) => ({
    month: r.month, label: monthName(r.month, s.locale), reopened: !!r.reopened_at, href: `/cierre?anio=${r.year}&mes=${r.month}`, current: r.month === period.month,
  }));

  const props: CierreProps = {
    period, name, nextName, lower, nextLower, canEdit: s.canEdit, fmt: s.fmt, locale: s.locale, m, actions: s.t.actions,
    closed: row && !row.reopened_at ? { closedOn: closedSnap?.closedOn ? formatDate(closedSnap.closedOn, s.locale) : null, snapshot: closedSnap } : null,
    reopened: !!row?.reopened_at,
    hasPlan: thisPlan.lines.length > 0,
    pending, over, review: reviewRes.count ?? 0, unplanned: view.unplanned.length, assumed: data.assumed, saved: data.saved,
    compare: { plan: data.plan, real, devs: deviations(data.cats) },
    adjust: { year: next.year, month: next.month, income: nextIncome, lines: nextLines },
    balances, investments, list, leftover,
    links: { review: s.config.menu.movimientos === "on" ? "/movimientos?ver=revisar" : null, monthPlan: planMonthHref(period, s.year), nextPlan: planMonthHref(next, s.year), cuentas: "/cuentas" },
  };

  return (
    <main className="page">
      <PageHeader title={m.title} eyebrow={<><span className="only-desktop">{fill(m.eyebrow, { month: name, year: period.year })}</span><span className="only-mobile">{fill(m.eyebrowShort, { month: name })}</span></>}>
        <span className="only-mobile"><Link href="/inicio" className="btn btn-secondary" aria-label={m.close} style={{ width: 44, height: 44, padding: 0 }}><Icon name="x" size={20} /></Link></span>
      </PageHeader>
      <Cierre {...props} />
    </main>
  );
}
