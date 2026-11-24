import type { Metadata } from "next";
import Link from "next/link";
import { Empty, Pill } from "@/components/ui/basics";
import { fetchAll, must } from "@/server/data";
import { requireAdmin } from "@/server/session";
import css from "../_shared/admin.module.css";
import { ACTION_GROUPS, actionGroupFilter, isUuid, listHref, pageCount, pageRange, parseActionGroup, parsePage } from "../_shared/lib";
import { A, actionLabel } from "../_shared/messages";
import { describeDetail, fmtDay, fmtTime, loadAdmins, lookupUsers } from "../_shared/server";
import { AdminHeader, Pager } from "../_shared/ui";
import { FilterForm } from "./FilterForm";
import { M } from "./messages";

export const metadata: Metadata = { title: "Registro de actividad" };

export default async function AdminActividad({ searchParams }: { searchParams: Promise<{ accion?: string | string[]; admin?: string | string[]; p?: string | string[] }> }) {
  const s = await requireAdmin();
  const t = A[s.locale], m = M[s.locale];
  const sp = await searchParams;
  const group = parseActionGroup(sp.accion);
  const adminId = typeof sp.admin === "string" && isUuid(sp.admin) ? sp.admin : null;
  const page = parsePage(sp.p);
  const { limit, offset } = pageRange(page);

  let q = s.supabase.from("admin_audit").select("id, admin_id, action, target_user, detail, at", { count: "exact" });
  if (group !== "all") q = q.or(actionGroupFilter(group));
  if (adminId) q = q.eq("admin_id", adminId);
  const [logRes, admins, groups, mfaRes] = await Promise.all([
    q.order("at", { ascending: false }).range(offset, offset + limit - 1),
    loadAdmins(s),
    fetchAll((a, b) => s.supabase.from("groups").select("id, name").order("id").range(a, b)),
    s.supabase.from("app_config").select("value").eq("key", "admin_mfa_required").maybeSingle(),
  ]);
  const mfaOn = String(must(mfaRes)?.value ?? "true") !== "false";
  const log = must(logRes), total = logRes.count ?? 0;
  const known = new Map(admins.map((a) => [a.id, a]));
  const people = await lookupUsers(s, [...log.map((l) => l.target_user), ...log.map((l) => l.admin_id)].filter((id) => id && !known.has(id)));
  admins.forEach((a) => people.set(a.id, a));
  const groupNames = new Map(groups.map((g) => [g.id, g.name]));
  const filtered = group !== "all" || adminId;

  return (
    <main className={css.page}>
      <AdminHeader eyebrow={m.eyebrow} title={m.title} />
      <section aria-labelledby="lg" className={css.section}>
        <div className="row-between wrap">
          <h2 id="lg">{m.recent}</h2>
          <FilterForm m={m} group={group} adminId={adminId ?? ""} groups={["all", ...Object.keys(ACTION_GROUPS)]} admins={admins.map((a) => ({ id: a.id, name: a.name || a.email }))} />
        </div>
        {log.length === 0 ? (
          <Empty icon="search" title={m.empty} text={m.emptySub}>{filtered ? <Link href="/admin/actividad" className="btn btn-secondary btn-sm">{m.clear}</Link> : null}</Empty>
        ) : (
          <div className="table-scroll">
            <table className={`${css.table} ${css.plain}`} style={{ minWidth: 820 }}>
              <thead><tr><th scope="col">{m.colDate}</th><th scope="col">{m.colWho}</th><th scope="col">{m.colAction}</th><th scope="col">{m.colUser}</th><th scope="col">{m.colDetail}</th></tr></thead>
              <tbody>
                {log.map((l) => {
                  const who = l.admin_id ? people.get(l.admin_id) : null;
                  const target = l.target_user ? people.get(l.target_user) : null;
                  const d = (l.detail ?? {}) as Record<string, unknown>;
                  return (
                    <tr key={l.id}>
                      <td className="num" style={{ color: "var(--gris)", whiteSpace: "nowrap" }}>{fmtDay(s, l.at, "short")} {fmtTime(s, l.at)}</td>
                      <td style={{ fontWeight: 600 }}>{who ? who.name || who.email : l.admin_id ? t.deleted : t.system}</td>
                      <td>{actionLabel(t, l.action)}</td>
                      <td>{target ? <Link href={`/admin/usuarios/${target.id}`} className="link" style={{ fontSize: 14, fontWeight: 500 }}>{target.email}</Link> : l.target_user ? <span className="muted">{typeof d.email === "string" ? d.email : t.deleted}</span> : t.none}</td>
                      <td style={{ color: "var(--tinta-2)" }}>{describeDetail(s, l.action, { ...d, email: undefined }, groupNames) || t.none}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager t={t} page={page} pages={pageCount(total)} href={(p) => listHref("/admin/actividad", { accion: group, admin: adminId, p })} />
        <span className="xs muted">{m.locked}</span>
      </section>

      <section aria-labelledby="ad" className={css.section}>
        <div className="row-between wrap">
          <h2 id="ad">{m.admins}</h2>
          <Link href="/admin/usuarios" className="btn btn-dashed btn-sm">{m.invite}</Link>
        </div>
        <span className="xs muted">{m.inviteHelp}</span>
        <div className="table-scroll">
          <table className={`${css.table} ${css.plain}`} style={{ minWidth: 620 }}>
            <thead><tr><th scope="col">{m.colName}</th><th scope="col">{m.colEmail}</th><th scope="col">{m.colRole}</th><th scope="col">{m.colSecurity}</th><th scope="col" className="r"><span className="sr-only">{m.manage}</span></th></tr></thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{a.name || a.email}{a.id === s.userId ? <span className="muted" style={{ fontWeight: 500 }}> · {m.you}</span> : null}</td>
                  <td style={{ color: "var(--gris)" }}>{a.email}</td>
                  <td>{m.owner}</td>
                  <td><Pill tone={mfaOn ? "ok" : "warn"}>{mfaOn ? m.security : m.securityOff}</Pill></td>
                  <td className="r"><Link href={`/admin/usuarios/${a.id}`} className="btn btn-secondary btn-sm">{m.manage}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <span className="xs muted">{m.securityNote}</span>
      </section>
    </main>
  );
}
