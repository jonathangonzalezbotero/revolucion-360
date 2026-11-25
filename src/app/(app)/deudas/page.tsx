import type { Metadata } from "next";
import Link from "next/link";
import { fill } from "@/i18n";
import { Empty, PageHeader } from "@/components/ui/basics";
import { cellMap, cellOf, todayIn, yearTotals } from "@/lib/engine";
import { fetchAll, loadAccounts, loadPlan, must } from "@/server/data";
import { requireUser } from "@/server/session";
import { term } from "@/server/terms";
import { Deudas, type DebtView } from "./Deudas";
import { Empresa } from "./Empresa";
import { Impuestos } from "./Impuestos";
import { companySummary, parseSchedule, taxReserveOf, taxStatus, type CompanyClass, type DebtKind, type PayFreq } from "./lib";
import { M } from "./messages";

export const metadata: Metadata = { title: "Deudas e impuestos" };

export default async function DeudasPage() {
  const s = await requireUser();
  const m = M[s.locale];
  if (s.config.menu.deudas !== "on") {
    return (
      <main className="page">
        <PageHeader title={m.title} eyebrow={m.eyebrow} />
        <Empty icon="receipt" title={m.soonTitle} text={m.soonText}><Link href="/inicio" className="btn btn-secondary btn-sm">{m.goHome}</Link></Empty>
      </main>
    );
  }

  const jan1 = `${s.year}-01-01`;
  const [debtsRes, payments, taxRes, taxEntries, coEntries, plan, accounts, countryRes, futureRes] = await Promise.all([
    s.supabase.from("debts").select("id, name, kind, balance_cents, start_balance_cents, rate_bps, payment_cents, payment_frequency, next_due, schedule, closed_at").order("created_at"),
    fetchAll<{ debt_id: string; amount_cents: number }>((a, b) => s.supabase.from("debt_payments").select("debt_id, amount_cents").gte("date", jan1).lte("date", `${s.year}-12-31`).order("id").range(a, b)),
    s.supabase.from("tax_settings").select("enabled, percent_bps").maybeSingle(),
    fetchAll<{ id: string; date: string; kind: string; amount_cents: number; note: string }>((a, b) => s.supabase.from("tax_entries").select("id, date, kind, amount_cents, note").order("date", { ascending: false }).order("created_at", { ascending: false }).order("id").range(a, b)),
    fetchAll<{ id: string; date: string; kind: string; class: string; amount_cents: number; note: string }>((a, b) => s.supabase.from("company_entries").select("id, date, kind, class, amount_cents, note").order("date", { ascending: false }).order("created_at", { ascending: false }).order("id").range(a, b)),
    loadPlan(s, s.year), loadAccounts(s),
    s.supabase.from("countries").select("terms, tax_reserve_enabled, tax_reserve_note").eq("code", s.profile.country).maybeSingle(),
    s.supabase.from("plan_lines").select("debt_id").gt("year", s.year).is("archived_at", null).not("debt_id", "is", null),
  ]);
  const debts = must(debtsRes), tax = must(taxRes), future = new Set(must(futureRes).map((l) => l.debt_id));
  const countryRow = must(countryRes);
  const countryTerms = (countryRow?.terms ?? {}) as Record<string, string>;
  const taxReserve = taxReserveOf(countryRow);
  const freelance = term(s, "freelance", countryTerms), retirement = term(s, "retirement", countryTerms), taxOffice = term(s, "tax_office", countryTerms);
  const company = term(s, "company", countryTerms), bnpl = term(s, "bnpl", countryTerms);

  // Plan: cuota del año por deuda (de su línea), ingresos del mes y del año para los porcentajes.
  const cells = cellMap(plan.cells);
  const year = yearTotals(plan.lines, plan.cells);
  const paidBy = new Map<string, number>();
  for (const pay of payments) paidBy.set(pay.debt_id, (paidBy.get(pay.debt_id) ?? 0) + pay.amount_cents);
  const tz = s.profile.timezone || "Australia/Sydney";

  const views: DebtView[] = debts.map((d) => {
    const lines = plan.lines.filter((l) => l.debtId === d.id);
    const vals = lines.flatMap((l) => Array.from({ length: 12 }, (_, i) => cellOf(cells, l.id, i + 1)));
    const later = lines.some((l) => Array.from({ length: 12 - s.month }, (_, i) => cellOf(cells, l.id, s.month + 1 + i)).some((v) => v > 0)) || future.has(d.id);
    return {
      id: d.id, name: d.name, kind: d.kind as DebtKind, balanceCents: d.balance_cents, startBalanceCents: d.start_balance_cents, rateBps: d.rate_bps,
      paymentCents: d.payment_cents, paymentFrequency: d.payment_frequency as PayFreq, nextDue: d.next_due, schedule: parseSchedule(d.schedule),
      closed: !!d.closed_at, closedDate: d.closed_at ? todayIn(tz, new Date(d.closed_at)) : null,
      paidYearCents: paidBy.get(d.id) ?? 0, range: vals.length ? [Math.min(...vals), Math.max(...vals)] : null, inPlan: lines.length > 0,
      askRemove: !!d.closed_at && later,
    };
  });
  const debtCat = plan.categories.find((c) => c.kind === "debt");

  const taxList = taxEntries.map((e) => ({ id: e.id, date: e.date, kind: e.kind as "ingreso" | "apartado" | "pago", amountCents: e.amount_cents, note: e.note }));
  const coList = coEntries.map((e) => ({ id: e.id, date: e.date, kind: e.kind as "aporte" | "retiro", cls: e.class as CompanyClass, amountCents: e.amount_cents, note: e.note }));
  const coSum = companySummary(coList.map((e) => ({ date: e.date, kind: e.kind, class: e.cls, amountCents: e.amountCents })), s.year);
  const business = accounts.find((a) => a.kind === "business");
  const coTitle = business?.name || fill(m.coDefault, { company });

  return (
    <main className="page">
      <Deudas
        debts={views} monthIncomeCents={year[s.month - 1].income} yearIncomeCents={year.reduce((a, x) => a + x.income, 0)}
        paidYearCents={payments.reduce((a, x) => a + x.amount_cents, 0)}
        fmt={s.fmt} locale={s.locale} today={s.today} year={s.year} canEdit={s.canEdit} m={m} t={{ cancel: s.t.actions.cancel, save: s.t.actions.save }}
        bnpl={bnpl} category={debtCat?.name ?? m.category} planOn={s.config.menu.plan === "on"}
      />
      {taxReserve.show ? <Impuestos
        note={taxReserve.note} enabled={!!tax?.enabled} percentBps={tax?.percent_bps ?? 0} status={taxStatus(taxList, tax?.percent_bps ?? 0, s.year, s.month)} entries={taxList.slice(0, 8)}
        freelance={freelance} retirement={retirement} taxOffice={taxOffice} year={s.year} today={s.today} canEdit={s.canEdit} m={m} fmt={s.fmt} locale={s.locale}
      /> : null}
      <Empresa
        title={coTitle} summaryLabel={business?.name ? fill(m.coSummaryNamed, { name: business.name }) : m.coSummary}
        note={s.profile.country === "AU" ? fill(m.co7a, { name: business?.name || m.coYours, company }) : m.coNoAdvice}
        retirement={retirement} taxOffice={taxOffice} sum={coSum}
        unclassified={coList.filter((e) => e.kind === "retiro" && e.cls === "sin_clasificar")} recent={coList.slice(0, 8)}
        year={s.year} today={s.today} canEdit={s.canEdit} m={m} fmt={s.fmt} locale={s.locale}
      />
    </main>
  );
}
