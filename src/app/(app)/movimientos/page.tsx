import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fill } from "@/i18n";
import { Empty, PageHeader } from "@/components/ui/basics";
import { monthName, monthShort, parts } from "@/lib/engine";
import { loadAccounts, loadCategories, loadPlan, loadTx, monthRange, must } from "@/server/data";
import { requireUser } from "@/server/session";
import { Detail, type Period } from "./Detail";
import { buildRows, movHref, STATES, type Filter, type Query, type RecFrequency, type StateFilter } from "./lib";
import { M } from "./messages";
import css from "./mov.module.css";
import { Recurring, type RecItem } from "./Recurring";
import { Rules, type RuleItem } from "./Rules";
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
  const csv = s.config.flags.csv;
  // (Desde el 25 nov 2026 no hay "niveles": un `?nivel=` viejo se ignora. Marcar pagos fijos vive en el Plan anual.)

  // Recurrentes vencidos: se registran ANTES de leer los movimientos, para que la lista ya los traiga.
  const generated = s.canEdit ? await generateDueRecurring(s) : 0;

  // ───── Periodo y filtros de la dirección ─────
  const anio = Number(get("anio"));
  const year = Number.isInteger(anio) && anio >= 2000 && anio <= 2100 ? anio : s.year;
  const mesRaw = get("mes"), mesN = Number(mesRaw);
  const monthParam = Number.isInteger(mesN) && mesN >= 1 && mesN <= 12 ? mesN : null;
  const kind: Period["kind"] = monthParam ? "month" : mesRaw === "all" ? "year" : review || lineId ? "any" : year === s.year ? "month" : "year";
  const month = kind === "month" ? monthParam ?? s.month : null;
  const query: Query = { anio: year === s.year ? "" : String(year), mes: monthParam ? String(monthParam) : mesRaw === "all" ? "all" : "", ver: review ? "revisar" : "", linea: lineId };

  const [categories, accounts] = await Promise.all([loadCategories(s), loadAccounts(s)]);
  const ctx: Ctx = { t: m, c: s.t, fmt: s.fmt, locale: s.locale, today: s.today, canEdit: s.canEdit };
  const cats = categories.map((c) => ({ id: c.id, name: c.name, color: c.color, kind: c.kind }));
  const accs = accounts.map((a) => ({ id: a.id, name: a.name }));
  const eyebrow = accounts.length ? fill(m.eyebrow, { accounts: accounts.slice(0, 3).map((a) => a.name).join(", ") }) : m.eyebrowNone;
  const linesOf = async (y: number): Promise<LineOpt[]> => (await loadPlan(s, y)).lines.map((l) => ({ id: l.id, name: l.name, categoryId: l.categoryId, kind: l.kind }));

  const months = (
    <div className="only-mobile">
      <div role="group" aria-label={m.months.label} className={css.months}>
        <Link href={movHref({ ...query, mes: "all" })} className={css.month} aria-current={kind === "year" ? "true" : undefined}>{fill(m.months.allYear, { year })}</Link>
        {Array.from({ length: 12 }, (_, i) => (
          <Link key={i} href={movHref({ ...query, mes: String(i + 1) })} className={css.month} aria-current={month === i + 1 ? "true" : undefined}>{monthShort(i + 1, s.locale)}</Link>
        ))}
      </div>
    </div>
  );
  const banners = (
    <>
      {!s.canEdit ? <div className="banner"><span>{m.readOnly}</span>{s.plan === "read_only" ? <Link href="/activar" className="link">{s.t.readOnly.cta}</Link> : null}</div> : null}
      {generated > 0 ? <p role="status" className="banner banner-info">{generated === 1 ? m.rec.generatedOne : fill(m.rec.generated, { n: generated })}</p> : null}
    </>
  );

  // ───── Movimientos ─────
  // "¿Tiene que ver con una meta?": las metas para elegir y lo que hoy cuenta cada movimiento (elegido o automático).
  // Va después de generar los recurrentes: los que nacen como aporte a una meta entran a la meta aquí.
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

  // ───── "Más opciones": recurrentes y reglas ─────
  // `select("*")`: `recurring.goal_id` es de la migración 20261125000040 (sin aplicar); si aún no existe, no viene y queda sin meta.
  const [rec, ruleRows] = await Promise.all([
    s.supabase.from("recurring").select("*").order("active", { ascending: false }).order("next_date"),
    s.supabase.from("category_rules").select("id, pattern, category_id, plan_line_id").order("created_at", { ascending: false }),
  ]);
  const items: RecItem[] = must(rec).map((r) => ({
    id: r.id, description: r.description, amountCents: r.amount_cents, frequency: r.frequency as RecFrequency, nextDate: r.next_date, anchorDay: r.anchor_day, active: r.active,
    accountId: r.account_id, categoryId: r.category_id, lineId: r.plan_line_id, goalId: (r as { goal_id?: string | null }).goal_id ?? null,
  }));
  const rulesList = must(ruleRows);
  const ruleLineIds = [...new Set(rulesList.map((r) => r.plan_line_id).filter((id): id is string => !!id))];
  const ruleLines = ruleLineIds.length ? new Map(must(await s.supabase.from("plan_lines").select("id, name").in("id", ruleLineIds)).map((l) => [l.id, l.name])) : new Map<string, string>();
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const rules: RuleItem[] = rulesList.map((r) => ({
    id: r.id, pattern: r.pattern, category: (r.category_id && catName.get(r.category_id)) || null, line: (r.plan_line_id && ruleLines.get(r.plan_line_id)) || null,
  }));
  const recLines = linesByYear[String(s.year)] ?? await linesOf(s.year);

  return (
    <main className="page">
      <Detail header={{ title: m.title, eyebrow }} months={months} rows={rows} categories={cats} accounts={accs} linesByYear={linesByYear} period={period} years={years}
        initial={initial} lineName={lineName} query={query} flags={{ csv, recurring: true }} ctx={ctx} goals={goals} goalChoice={goalChoice}
        tools={{
          rules: <Rules items={rules} ctx={ctx} />, ruleCount: rules.length,
          recurring: <Recurring items={items} categories={cats} accounts={accs} linesByYear={{ ...linesByYear, [s.year]: recLines }} goals={goals} ctx={ctx} />, recCount: items.length,
          merchantsHref: s.config.menu.analisis === "on" ? "/analisis" : null,
        }}>
        {banners}
      </Detail>
    </main>
  );
}
