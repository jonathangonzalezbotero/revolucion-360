import type { Metadata } from "next";
import Link from "next/link";
import { fill } from "@/i18n";
import { Empty } from "@/components/ui/basics";
import { must } from "@/server/data";
import { requireAdmin, type Session } from "@/server/session";
import css from "./_shared/admin.module.css";
import { pct } from "./_shared/lib";
import { A } from "./_shared/messages";
import { loadDropoff } from "./_shared/server";
import { AdminHeader } from "./_shared/ui";
import { billingFrom, monthlyIncome, usd } from "./planes/lib";

export const metadata: Metadata = { title: "Resumen" };

type Summary = {
  users: number; new_users: number; active: number; pro: number; trial: number; free_access: number; read_only: number;
  failed_payments: number; expiring: number; privacy_pending: number; tickets_open: number;
  academy: { lessons_seen: number; top_lesson: string | null; avg_rating: number | null };
};
/** `admin_plan_summary` (migración 20261125000029_un_plan.sql): solo conteos. */
type PlanSummary = {
  first_month: number; monthly: number; yearly: number;
  funnel: { paid_first: number; wizard: number; returned: number; closure: number; kept: number };
};
type RpcResult<T> = { data: T | null; error: { message: string; code?: string } | null };

/** Quién paga y el camino del primer mes. null si la migración aún no está aplicada (PostgREST responde PGRST202). */
async function loadPlanSummary(s: Session, days: number): Promise<PlanSummary | null> {
  const r = (await s.supabase.rpc("admin_plan_summary" as never, { p_days: days } as never)) as unknown as RpcResult<PlanSummary>;
  if (r.error?.code === "PGRST202") return null;
  return must(r);
}

export default async function AdminResumen({ searchParams }: { searchParams: Promise<{ dias?: string | string[] }> }) {
  const s = await requireAdmin();
  const t = A[s.locale], m = t.resumen;
  const days = (await searchParams).dias === "90" ? 90 : 30;
  const [sumRes, plan, billingRes, drop] = await Promise.all([
    s.supabase.rpc("admin_summary", { p_days: days }),
    loadPlanSummary(s, days),
    s.supabase.from("app_config").select("value").eq("key", "billing").maybeSingle(),
    loadDropoff(s, days),
  ]);
  const sum = must(sumRes) as unknown as Summary;
  const billing = billingFrom(must(billingRes)?.value);
  const nf = new Intl.NumberFormat(s.locale === "en" ? "en-AU" : "es-CO");
  // Mensual cuenta también a quien está en su primer mes (ya eligió el plan mensual). Ingreso = conteo × precio (ver monthlyIncome).
  const paying = plan ? plan.first_month + plan.monthly + plan.yearly : sum.pro;
  const income = plan ? usd(monthlyIncome(billing, { firstMonth: plan.first_month, monthly: plan.monthly, yearly: plan.yearly })) : t.none;
  const f = plan?.funnel ?? null;
  const steps = f ? [
    { label: fill(m.fSignup, { first: usd(billing.first_month_cents) }), n: f.paid_first }, { label: m.fWizard, n: f.wizard }, { label: m.fReturned, n: f.returned },
    { label: m.fClosure, n: f.closure }, { label: fill(m.fPro, { monthly: usd(billing.monthly_cents) }), n: f.kept },
  ] : [];
  const alerts = [
    { n: sum.failed_payments, text: m.failed, href: "/admin/usuarios?filtro=failed", bad: true },
    { n: sum.expiring, text: m.expiring, href: "/admin/usuarios?filtro=expiring7" },
    { n: sum.privacy_pending, text: m.privacy, href: "/admin/soporte?tab=privacidad" },
    { n: sum.tickets_open, text: m.tickets, href: "/admin/soporte?estado=open" },
  ].filter((a) => a.n > 0);
  const stats = [
    { k: m.users, v: nf.format(sum.users), sub: fill(m.newUsers, { n: nf.format(sum.new_users), d: days }) },
    { k: fill(m.active, { d: days }), v: nf.format(sum.active), sub: fill(m.ofTotal, { pct: pct(sum.active, sum.users) }) },
    { k: m.pro, v: nf.format(paying), sub: plan ? fill(m.income, { monthly: nf.format(plan.first_month + plan.monthly), yearly: nf.format(plan.yearly), amount: income }) : t.none },
    { k: m.free, v: nf.format(sum.free_access), sub: m.freeSub },
  ];
  const ac = sum.academy;

  return (
    <main className={css.page}>
      <AdminHeader eyebrow={m.eyebrow} title={m.title}>
        <div role="group" aria-label={m.period} className="seg">
          <Link href="/admin" aria-current={days === 30 ? "page" : undefined}>{m.d30}</Link>
          <Link href="/admin?dias=90" aria-current={days === 90 ? "page" : undefined}>{m.d90}</Link>
        </div>
      </AdminHeader>

      <div className={css.stats}>
        {stats.map((x) => (
          <div key={x.k} className={css.stat}>
            <span style={{ fontSize: 13, color: "var(--gris)" }}>{x.k}</span>
            <span className="num big" style={{ fontSize: 26, fontWeight: 600 }}>{x.v}</span>
            <span style={{ fontSize: 12, color: "var(--gris)" }}>{x.sub}</span>
          </div>
        ))}
      </div>

      <div className={css.two}>
        <section aria-labelledby="fun" className={css.section} style={{ gap: 14 }}>
          <h2 id="fun">{m.funnel}</h2>
          {!f || f.paid_first === 0 ? <Empty icon="users" title={m.funnelEmpty} text={m.funnelEmptySub} /> : (
            <>
              {steps.map((st, i) => {
                const p = pct(st.n, f.paid_first);
                return (
                  <div key={st.label} className="stack" style={{ gap: 6 }}>
                    <div className="row-between" style={{ fontSize: 14 }}><span>{st.label}</span><strong className="num">{p}% <span className="xs muted" style={{ fontWeight: 500 }}>({nf.format(st.n)})</span></strong></div>
                    <div aria-hidden="true" className={css.funnelTrack}><div className={css.funnelBar} style={{ width: `${Math.min(100, p)}%`, opacity: 1 - i * 0.12 }} /></div>
                  </div>
                );
              })}
              <span style={{ fontSize: 12, color: "var(--gris)" }}>{m.funnelNote}</span>
            </>
          )}
        </section>
        <section aria-labelledby="alert" className={css.section}>
          <h2 id="alert">{m.attention}</h2>
          {alerts.length === 0 ? <Empty icon="tick" title={m.allClear} text={m.allClearSub} /> : alerts.map((a) => (
            <Link key={a.href} href={a.href} className={`${css.alert} ${a.bad ? css.alertBad : ""}`}>{fill(a.text, { n: nf.format(a.n) })} <span aria-hidden="true">›</span></Link>
          ))}
        </section>
      </div>

      <section aria-labelledby="acad" className={css.section}>
        <h2 id="acad">{m.academy}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, fontSize: 14 }}>
          <span style={{ background: "var(--papel)", borderRadius: 12, padding: 14 }}>{m.seen}: <strong className="num">{nf.format(ac.lessons_seen)}</strong></span>
          <span style={{ background: "var(--papel)", borderRadius: 12, padding: 14 }}>{m.top}: <strong>{ac.top_lesson ?? m.noData}</strong></span>
          <span style={{ background: "var(--papel)", borderRadius: 12, padding: 14 }}>{m.drop}: <strong>{drop ? drop.lesson : m.noData}</strong></span>
          <span style={{ background: "var(--papel)", borderRadius: 12, padding: 14 }}>{m.rating}: <strong className="num">{ac.avg_rating != null ? fill(m.ratingVal, { n: ac.avg_rating }) : m.noData}</strong></span>
        </div>
      </section>
    </main>
  );
}
