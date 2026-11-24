import type { Metadata } from "next";
import Link from "next/link";
import { fill } from "@/i18n";
import { Empty, Pill, type PillTone } from "@/components/ui/basics";
import { must } from "@/server/data";
import { requireAdmin } from "@/server/session";
import css from "../_shared/admin.module.css";
import { isUuid, listHref, pageCount, pageRange, parsePage } from "../_shared/lib";
import { A } from "../_shared/messages";
import { dayOf, fmtDay, fmtTime, lookupUsers } from "../_shared/server";
import { AdminHeader, Pager } from "../_shared/ui";
import { M } from "./messages";
import { CaseActions, FaqManager, PrivacyActions } from "./SupportParts";

export const metadata: Metadata = { title: "Soporte y privacidad" };

type SP = { tab?: string | string[]; estado?: string | string[]; caso?: string | string[]; p?: string | string[] };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const ST_TONE: Record<string, PillTone> = { open: "warn", answered: "ok", closed: "neutral" };

export default async function AdminSoporte({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requireAdmin();
  const t = A[s.locale], m = M[s.locale];
  const sp = await searchParams;
  const tab = first(sp.tab) === "privacidad" ? "privacidad" : first(sp.tab) === "faq" ? "faq" : "soporte";
  const estadoRaw = first(sp.estado);
  const estado = ["open", "answered", "closed", "all"].includes(estadoRaw) ? estadoRaw : "open";
  const caso = isUuid(first(sp.caso)) ? first(sp.caso) : null;
  const page = parsePage(sp.p);
  const { limit, offset } = pageRange(page);

  const [openRes, pendingRes] = await Promise.all([
    s.supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
    s.supabase.from("privacy_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  if (openRes.error || pendingRes.error) throw new Error("db: conteos de soporte");
  const tabs = [
    { id: "soporte", href: "/admin/soporte", label: fill(m.tabSupport, { n: openRes.count ?? 0 }) },
    { id: "privacidad", href: "/admin/soporte?tab=privacidad", label: fill(m.tabPrivacy, { n: pendingRes.count ?? 0 }) },
    { id: "faq", href: "/admin/soporte?tab=faq", label: m.tabFaq },
  ];

  let body: React.ReactNode = null;

  if (tab === "soporte" && caso) {
    const tk = must(await s.supabase.from("support_tickets").select("id, user_id, topic, subject, status, tech, created_at, ticket_messages(id, body, from_admin, created_at)").eq("id", caso).maybeSingle());
    if (!tk) {
      body = <Empty icon="chat" title={m.ticketsEmpty}><Link href="/admin/soporte" className="btn btn-secondary btn-sm">{m.backList}</Link></Empty>;
    } else {
      const users = await lookupUsers(s, [tk.user_id]);
      const u = users.get(tk.user_id);
      const msgs = [...(tk.ticket_messages ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const tech = tk.tech && typeof tk.tech === "object" && !Array.isArray(tk.tech) ? Object.entries(tk.tech as Record<string, unknown>).filter(([, v]) => v !== null && v !== "" && typeof v !== "object") : [];
      body = (
        <section aria-labelledby="case" className={css.section} style={{ gap: 16 }}>
          <Link href={listHref("/admin/soporte", { estado })} className="link" style={{ alignSelf: "flex-start" }}>{m.backList}</Link>
          <div className="row-between wrap" style={{ alignItems: "flex-start" }}>
            <div className="stack" style={{ gap: 4, minWidth: 0 }}>
              <h2 id="case" style={{ fontSize: 19 }}>{tk.subject}</h2>
              <span className="small muted">{m.from}: {u ? `${u.name || u.email} · ${u.email}` : m.deletedUser} · {m.topic}: {tk.topic} · {fmtDay(s, tk.created_at)}</span>
            </div>
            <span className="row" style={{ gap: 8 }}>
              <Pill tone={ST_TONE[tk.status]}>{m.stOne[tk.status] ?? tk.status}</Pill>
              {u ? <Link href={`/admin/usuarios/${u.id}`} className="btn btn-secondary btn-sm">{m.manageUser}</Link> : null}
            </span>
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <strong style={{ fontSize: 13 }}>{m.tech}</strong>
            {tech.length === 0 ? <span className="small muted">{m.techNone}</span> : (
              <div style={{ background: "var(--papel-3)", borderRadius: 12, padding: "4px 14px" }}>
                {tech.map(([k, v]) => <div key={k} className={css.kv} style={{ borderTop: 0 }}><span>{k}</span><span style={{ fontWeight: 500 }}>{String(v)}</span></div>)}
              </div>
            )}
            <span className="xs muted">{m.techNote}</span>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <strong style={{ fontSize: 13 }}>{m.thread}</strong>
            <div className={css.thread}>
              {msgs.map((x) => (
                <div key={x.id} className={`${css.msg} ${x.from_admin ? css.msgAdmin : ""}`}>
                  <span className="xs muted" style={{ display: "block", marginBottom: 4 }}>{x.from_admin ? m.you : m.user} · {fmtDay(s, x.created_at, "short")} {fmtTime(s, x.created_at)}</span>
                  {x.body}
                </div>
              ))}
            </div>
          </div>
          <CaseActions m={m} ticketId={tk.id} status={tk.status} />
        </section>
      );
    }
  } else if (tab === "soporte") {
    let q = s.supabase.from("support_tickets").select("id, user_id, subject, status, created_at, updated_at", { count: "exact" });
    if (estado !== "all") q = q.eq("status", estado);
    const res = await q.order("updated_at", { ascending: false }).range(offset, offset + limit - 1);
    const rows = must(res), total = res.count ?? 0;
    const users = await lookupUsers(s, rows.map((r) => r.user_id));
    body = (
      <section className={css.section}>
        <div role="group" aria-label={m.status} className="seg" style={{ alignSelf: "flex-start", flexWrap: "wrap" }}>
          {["open", "answered", "closed", "all"].map((st) => <Link key={st} href={listHref("/admin/soporte", { estado: st === "open" ? undefined : st })} aria-current={estado === st ? "page" : undefined}>{m.st[st]}</Link>)}
        </div>
        {rows.length === 0 ? <Empty icon="chat" title={m.ticketsEmpty} text={m.ticketsEmptySub} /> : (
          <div className="table-scroll">
            <table className={`${css.table} ${css.plain}`} style={{ minWidth: 720 }}>
              <thead><tr><th scope="col">{m.colUser}</th><th scope="col">{m.colSubject}</th><th scope="col">{m.colStatus}</th><th scope="col">{m.colReceived}</th><th scope="col" className="r"><span className="sr-only">{m.open}</span></th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const u = users.get(r.user_id);
                  return (
                    <tr key={r.id}>
                      <td><span className={css.who}><strong>{u ? u.name || u.email : m.deletedUser}</strong><span>{u?.email}</span></span></td>
                      <td>{r.subject}</td>
                      <td><Pill tone={ST_TONE[r.status]}>{m.stOne[r.status] ?? r.status}</Pill></td>
                      <td style={{ color: "var(--gris)" }}>{fmtDay(s, r.created_at, "short")}</td>
                      <td className="r"><Link href={listHref("/admin/soporte", { estado: estado === "open" ? undefined : estado, caso: r.id })} className="btn btn-secondary btn-sm">{m.open}</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager t={t} page={page} pages={pageCount(total)} href={(p) => listHref("/admin/soporte", { estado: estado === "open" ? undefined : estado, p })} />
      </section>
    );
  } else if (tab === "privacidad") {
    const res = await s.supabase.from("privacy_requests").select("id, user_id, kind, status, requested_at, due_at, done_at", { count: "exact" })
      .order("status", { ascending: false }).order("requested_at", { ascending: false }).range(offset, offset + limit - 1);
    const rows = must(res), total = res.count ?? 0;
    const users = await lookupUsers(s, rows.map((r) => r.user_id));
    body = (
      <section className={css.section}>
        {rows.length === 0 ? <Empty icon="shield" title={m.privacyEmpty} text={m.privacyEmptySub} /> : (
          <div className="table-scroll">
            <table className={`${css.table} ${css.plain}`} style={{ minWidth: 720 }}>
              <thead><tr><th scope="col">{m.colUser}</th><th scope="col">{m.colRequest}</th><th scope="col">{m.colStatus}</th><th scope="col">{m.colDue}</th><th scope="col" className="r"><span className="sr-only">{m.open}</span></th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const u = users.get(r.user_id);
                  const auto = r.kind === "export" && r.status === "done" && r.requested_at === r.done_at;
                  const late = r.status === "pending" && dayOf(s, r.due_at) < s.today;
                  return (
                    <tr key={r.id}>
                      <td><span className={css.who}><strong>{u ? u.name || u.email : m.deletedUser}</strong><span>{u?.email}</span></span></td>
                      <td>{r.kind === "delete" ? m.reqDelete : m.reqExport}<span className="xs muted" style={{ display: "block" }}>{fmtDay(s, r.requested_at, "short")}</span></td>
                      <td><Pill tone={r.status === "pending" ? "warn" : r.status === "done" ? "ok" : "neutral"}>{auto ? m.pStatus.auto : m.pStatus[r.status] ?? r.status}</Pill></td>
                      <td style={{ color: late ? "var(--rojo)" : "var(--gris)" }}>{r.status === "pending" ? <>{fmtDay(s, r.due_at, "short")}{late ? ` · ${m.late}` : ""}</> : t.none}</td>
                      <td className="r">{r.status === "pending" && u ? <PrivacyActions t={t} m={m} requestId={r.id} kind={r.kind} userId={u.id} email={u.email} self={u.id === s.userId} /> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager t={t} page={page} pages={pageCount(total)} href={(p) => listHref("/admin/soporte", { tab: "privacidad", p })} />
        <p className="xs muted" style={{ margin: 0, lineHeight: 1.5 }}>{m.privacyNote}</p>
      </section>
    );
  } else {
    const faqs = must(await s.supabase.from("faqs").select("id, topic, question, answer, locale, sort, published").order("locale", { ascending: false }).order("sort").order("question"));
    body = <FaqManager t={t} m={m} locale={s.locale} faqs={faqs} />;
  }

  return (
    <main className={css.page}>
      <AdminHeader eyebrow={m.eyebrow} title={m.title} />
      <nav aria-label={m.tabs} className={css.tabs}>
        {tabs.map((x) => <Link key={x.id} href={x.href} className={css.tab} aria-current={tab === x.id ? "page" : undefined}>{x.label}</Link>)}
      </nav>
      {body}
    </main>
  );
}
