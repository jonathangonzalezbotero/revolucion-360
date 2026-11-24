import type { Metadata } from "next";
import Link from "next/link";
import { fill } from "@/i18n";
import { Empty } from "@/components/ui/basics";
import { formatMoney } from "@/lib/engine";
import { must } from "@/server/data";
import { requireAdmin } from "@/server/session";
import css from "./_shared/admin.module.css";
import { pct } from "./_shared/lib";
import { A } from "./_shared/messages";
import { AdminHeader } from "./_shared/ui";

export const metadata: Metadata = { title: "Resumen" };

type Summary = {
  users: number; new_users: number; active: number; pro: number; trial: number; free_access: number; read_only: number;
  failed_payments: number; expiring: number; privacy_pending: number; tickets_open: number;
  funnel: { signup: number; wizard: number; returned: number; closure: number; pro: number };
  academy: { lessons_seen: number; top_lesson: string | null; avg_rating: number | null };
};
const NUMBER_LOCALE: Record<string, string> = { AUD: "en-AU", USD: "en-US", NZD: "en-NZ", GBP: "en-GB", EUR: "es-ES", COP: "es-CO", MXN: "es-MX", CLP: "es-CL", PEN: "es-PE", ARS: "es-AR", CAD: "en-CA" };

export default async function AdminResumen({ searchParams }: { searchParams: Promise<{ dias?: string | string[] }> }) {
  const s = await requireAdmin();
  const t = A[s.locale], m = t.resumen;
  const days = (await searchParams).dias === "90" ? 90 : 30;
  const [sumRes, priceRes] = await Promise.all([
    s.supabase.rpc("admin_summary", { p_days: days }),
    s.supabase.from("price_regions").select("currency, monthly_cents").eq("region", "DEFAULT").maybeSingle(),
  ]);
  const sum = must(sumRes) as unknown as Summary;
  const price = priceRes.error ? null : priceRes.data;
  const income = price?.monthly_cents
    ? formatMoney(sum.pro * price.monthly_cents, { currency: price.currency, numberLocale: NUMBER_LOCALE[price.currency] ?? "en-US" })
    : "[MONTO]";
  const nf = new Intl.NumberFormat(s.locale === "en" ? "en-AU" : "es-CO");
  const f = sum.funnel;
  const steps = [
    { label: m.fSignup, n: f.signup }, { label: m.fWizard, n: f.wizard }, { label: m.fReturned, n: f.returned },
    { label: m.fClosure, n: f.closure }, { label: m.fPro, n: f.pro },
  ];
  const alerts = [
    { n: sum.failed_payments, text: m.failed, href: "/admin/usuarios?filtro=failed", bad: true },
    { n: sum.expiring, text: m.expiring, href: "/admin/usuarios?filtro=expiring" },
    { n: sum.privacy_pending, text: m.privacy, href: "/admin/soporte?tab=privacidad" },
    { n: sum.tickets_open, text: m.tickets, href: "/admin/soporte?estado=open" },
  ].filter((a) => a.n > 0);
  const stats = [
    { k: m.users, v: nf.format(sum.users), sub: fill(m.newUsers, { n: nf.format(sum.new_users), d: days }) },
    { k: fill(m.active, { d: days }), v: nf.format(sum.active), sub: fill(m.ofTotal, { pct: pct(sum.active, sum.users) }) },
    { k: m.pro, v: nf.format(sum.pro), sub: fill(m.income, { amount: income }) },
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
          {f.signup === 0 ? <Empty icon="users" title={m.funnelEmpty} text={m.funnelEmptySub} /> : (
            <>
              {steps.map((st, i) => {
                const p = pct(st.n, f.signup);
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
          <span style={{ background: "var(--papel)", borderRadius: 12, padding: 14 }}>{m.drop}: <strong>{m.noData}</strong></span>
          <span style={{ background: "var(--papel)", borderRadius: 12, padding: 14 }}>{m.rating}: <strong className="num">{ac.avg_rating != null ? fill(m.ratingVal, { n: ac.avg_rating }) : m.noData}</strong></span>
        </div>
      </section>
    </main>
  );
}
