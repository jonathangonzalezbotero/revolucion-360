import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fill } from "@/i18n";
import { Empty, PageHeader } from "@/components/ui/basics";
import { categoryTotals, monthName, monthShort, parts } from "@/lib/engine";
import { loadAccounts, loadCategories, loadMonthView, loadPlan, loadTx, monthRange, must } from "@/server/data";
import { requireUser } from "@/server/session";
import { Detail, type Period } from "./Detail";
import { LevelPicker, PlanLevel, TotalsLevel, type PlanRow, type TotalRow } from "./Levels";
import { asLevel, buildRows, moneyInput, movHref, STATES, type Filter, type Query, type RecFrequency, type StateFilter } from "./lib";
import { M } from "./messages";
import css from "./mov.module.css";
import { Recurring, type RecItem } from "./Recurring";
import { generateDueRecurring, txAnyDate } from "./server";
import { choiceOfEntry } from "@/lib/engine/metas";
import { fetchAll } from "@/server/data";
import { raw, syncGoalLinks } from "../metas/server";
import type { Ctx, LineOpt } from "./types";

export const metadata: Metadata = { title: "Movimientos" };

type SP = Promise<{ [key: string]: string | string[] | undefined }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MovimientosPage({ searchParams }: { searchParams: SP }) {
  const s = await requireUser();
  const m = M[s.locale];
  if (s.config.menu.movimientos === "off") redirect("/inicio");
  if (s.config.menu.movimientos === "soon") {
    return (
      <main className="page">
        <PageHeader title={m.title} />
        <Empty icon="mov" title={m.soon.title} text={m.soon.text}><Link href="/inicio" className="btn btn-secondary btn-sm">{m.soon.cta}</Link></Empty>
      </main>
    );
  }

  const sp = await searchParams;
  const get = (k: string) => { const v = sp[k]; return typeof v === "string" ? v : ""; };
  const review = get("ver") === "revisar";
  const lineId = UUID.test(get("linea")) ? get("linea") : "";
  // "Por revisar" y "los pagos de esta línea" son listas de movimientos: abren en "Cada movimiento" sin cambiar el nivel guardado
  const level = asLevel(get("nivel")) ?? (review || lineId ? "detail" : s.profile.movLevel);
  const csv = s.config.flags.csv;

  // Recurrentes vencidos: se registran ANTES de leer los movimientos, para que la lista ya los traiga.
  const generated = s.canEdit ? await generateDueRecurring(s) : 0;

  // ───── Periodo y filtros de la dirección ─────
  const anio = Number(get("anio"));
  const year = Number.isInteger(anio) && anio >= 2000 && anio <= 2100 ? anio : s.year;
  const mesRaw = get("mes"), mesN = Number(mesRaw);
  const monthParam = Number.isInteger(mesN) && mesN >= 1 && mesN <= 12 ? mesN : null;
  const kind: Period["kind"] = monthParam ? "month" : mesRaw === "all" ? "year" : review || lineId ? "any" : year === s.year ? "month" : "year";
  const month = kind === "month" ? monthParam ?? s.month : null;
  /** Mes de los niveles "Solo mi plan" y "Totales": el elegido, o el mes en curso. */
  const workMonth = month ?? (year === s.year ? s.month : 12);
  const query: Query = { nivel: get("nivel") && asLevel(get("nivel")) ? get("nivel") : "", anio: year === s.year ? "" : String(year), mes: monthParam ? String(monthParam) : mesRaw === "all" ? "all" : "", ver: review ? "revisar" : "", linea: lineId };
  const monthLabel = monthName(workMonth, s.locale);

  const [categories, accounts] = await Promise.all([loadCategories(s), loadAccounts(s)]);
  const ctx: Ctx = { t: m, c: s.t, fmt: s.fmt, locale: s.locale, today: s.today, canEdit: s.canEdit };
  const cats = categories.map((c) => ({ id: c.id, name: c.name, color: c.color, kind: c.kind }));
  const accs = accounts.map((a) => ({ id: a.id, name: a.name }));
  const eyebrow = accounts.length ? fill(m.eyebrow, { accounts: accounts.slice(0, 3).map((a) => a.name).join(", ") }) : m.eyebrowNone;
  const linesOf = async (y: number): Promise<LineOpt[]> => (await loadPlan(s, y)).lines.map((l) => ({ id: l.id, name: l.name, categoryId: l.categoryId, kind: l.kind }));

  const months = (
    <div className={level === "detail" ? "only-mobile" : undefined}>
      <div role="group" aria-label={m.months.label} className={css.months}>
        {level === "detail" ? <Link href={movHref({ ...query, mes: "all" })} className={css.month} aria-current={kind === "year" ? "true" : undefined}>{fill(m.months.allYear, { year })}</Link> : null}
        {Array.from({ length: 12 }, (_, i) => (
          <Link key={i} href={movHref({ ...query, mes: String(i + 1) })} className={css.month} aria-current={(level === "detail" ? month : workMonth) === i + 1 ? "true" : undefined}>{monthShort(i + 1, s.locale)}</Link>
        ))}
      </div>
    </div>
  );
  const banners = (
    <>
      {!s.canEdit ? <div className="banner"><span>{m.readOnly}</span><Link href="/suscripcion" className="link">{s.t.readOnly.cta}</Link></div> : null}
      {generated > 0 ? <p role="status" className="banner banner-info">{generated === 1 ? m.rec.generatedOne : fill(m.rec.generated, { n: generated })}</p> : null}
    </>
  );
  const picker = <LevelPicker key={level} level={level} proLocked={false} query={query} ctx={ctx} />;

  // ───── Recurrentes (debajo de cualquier nivel, si el plan lo incluye) ─────
  const rec = must(await s.supabase.from("recurring").select("id, description, amount_cents, frequency, next_date, anchor_day, active").order("active", { ascending: false }).order("next_date"));
  const items: RecItem[] = rec.map((r) => ({ id: r.id, description: r.description, amountCents: r.amount_cents, frequency: r.frequency as RecFrequency, nextDate: r.next_date, anchorDay: r.anchor_day, active: r.active }));
  const recurring = <Recurring items={items} categories={cats} accounts={accs} linesByYear={{ [s.year]: await linesOf(s.year) }} ctx={ctx} />;

  // ───── Nivel 1: solo mi plan ─────
  if (level === "plan") {
    const view = await loadMonthView(s, year, workMonth);
    const rows: PlanRow[] = view.groups.flatMap((g) => g.lines.filter((l) => l.status !== "none").map((l) => ({
      id: l.line.id, name: l.line.name, category: g.category.name, income: l.line.kind === "income", plannedCents: l.plannedCents, realCents: l.realCents, status: l.status,
    })));
    return (
      <main className="page">
        <PageHeader title={m.title} eyebrow={<span className="only-desktop">{eyebrow}</span>} />
        {months}{banners}{picker}
        {rows.length === 0
          ? <Empty icon="plan" title={fill(m.plan.emptyTitle, { month: monthLabel.toLowerCase() })} text={m.plan.emptyText}><Link href="/plan" className="btn btn-secondary btn-sm">{m.plan.emptyCta}</Link></Empty>
          : <PlanLevel key={`${year}-${workMonth}`} rows={rows} month={workMonth} monthLabel={monthLabel} detailHref={year === s.year ? `/plan/mes/${workMonth}` : null} ctx={ctx} />}
        {recurring}
      </main>
    );
  }

  // ───── Nivel 2: totales del mes ─────
  if (level === "totals") {
    const [plan, saved] = await Promise.all([
      loadPlan(s, year),
      s.supabase.from("month_totals").select("category_id, amount_cents").eq("year", year).eq("month", workMonth),
    ]);
    const planned = categoryTotals(plan.lines, plan.cells, workMonth);
    const real = new Map(must(saved).map((r) => [r.category_id, r.amount_cents]));
    const rows: TotalRow[] = categories.map((c) => {
      const v = real.get(c.id);
      return { id: c.id, name: c.name, income: c.kind === "income", planCents: planned.get(c.id) ?? 0, savedCents: v ?? null, value: v === undefined ? "" : moneyInput(v) };
    });
    return (
      <main className="page">
        <PageHeader title={m.title} eyebrow={<span className="only-desktop">{eyebrow}</span>} />
        {months}{banners}{picker}
        {rows.length === 0
          ? <Empty icon="plan" title={m.totals.emptyTitle} text={m.totals.emptyText}><Link href="/plan" className="btn btn-secondary btn-sm">{m.totals.emptyCta}</Link></Empty>
          : <TotalsLevel key={`${year}-${workMonth}`} rows={rows} year={year} month={workMonth} monthLabel={monthLabel} ctx={ctx} />}
        {recurring}
      </main>
    );
  }

  // ───── Nivel 3: cada movimiento ─────
  // "¿Tiene que ver con una meta?": las metas para elegir y lo que hoy cuenta cada movimiento (elegido o automático).
  if (s.canEdit && s.config.menu.metas === "on") await syncGoalLinks(s);
  const [goalsRes, linked] = s.config.menu.metas === "on" ? await Promise.all([
    s.supabase.from("goals").select("id, name, completed_at").is("archived_at", null).order("created_at"),
    fetchAll<{ transaction_id: string; goal_id: string; amount_cents: number }>((a, b) =>
      raw(s).from("goal_entries").select("transaction_id, goal_id, amount_cents").not("transaction_id", "is", null).order("id").range(a, b)),
  ]) : [{ data: [], error: null }, []];
  const goals = must(goalsRes).map((g) => ({ id: g.id, name: g.name, active: !g.completed_at }));
  const goalChoice: Record<string, string> = Object.fromEntries(linked.map((e) => [e.transaction_id, choiceOfEntry({ goalId: e.goal_id, amountCents: e.amount_cents })]));

  const txs = kind === "any"
    ? await txAnyDate(s, review ? { review: true } : { lineId })
    : await loadTx(s, ...(kind === "month" ? monthRange(year, month!) : ([`${year}-01-01`, `${year}-12-31`] as [string, string])));
  const rows = buildRows(txs);
  const txYears = [...new Set(rows.map((r) => parts(r.date).y))].sort((a, b) => b - a).slice(0, 4);
  const lineYears = [...new Set([year, s.year, ...txYears])];
  const linesByYear: Record<string, LineOpt[]> = Object.fromEntries(await Promise.all(lineYears.map(async (y) => [String(y), await linesOf(y)] as const)));
  const first = must(await s.supabase.from("transactions").select("date").is("deleted_at", null).order("date").limit(1));
  const minYear = Math.min(first[0] ? parts(first[0].date).y : s.year, year, s.year);
  const years = Array.from({ length: Math.max(year, s.year) - minYear + 1 }, (_, i) => Math.max(year, s.year) - i);
  let lineName: string | null = null;
  if (lineId) {
    lineName = Object.values(linesByYear).flat().find((l) => l.id === lineId)?.name
      ?? must(await s.supabase.from("plan_lines").select("name").eq("id", lineId).limit(1))[0]?.name ?? null;
  }
  const state = (STATES as string[]).includes(get("estado")) ? (get("estado") as StateFilter) : review ? "revisar" : "";
  const initial: Filter = {
    cat: categories.some((c) => c.id === get("cat")) ? get("cat") : "", account: accounts.some((a) => a.id === get("cuenta")) ? get("cuenta") : "",
    state, q: get("q").slice(0, 80), line: lineName ? lineId : "",
  };
  const period: Period = {
    kind, year, month,
    label: kind === "month" ? `${monthName(month!, s.locale)} ${year}` : kind === "year" ? fill(m.months.allYear, { year }) : m.months.any,
  };

  return (
    <main className="page">
      <Detail header={{ title: m.title, eyebrow }} months={months} rows={rows} categories={cats} accounts={accs} linesByYear={linesByYear} period={period} years={years}
        initial={initial} lineName={lineName} query={query} flags={{ csv, recurring: true }} locked={false} ctx={ctx} goals={goals} goalChoice={goalChoice}>
        {banners}{picker}
      </Detail>
      {recurring}
    </main>
  );
}
