import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fill } from "@/i18n";
import { Pill } from "@/components/ui/basics";
import { must } from "@/server/data";
import { requireAdmin } from "@/server/session";
import css from "../../_shared/admin.module.css";
import { expiryDay, isUuid } from "../../_shared/lib";
import { A, actionLabel } from "../../_shared/messages";
import { describeDetail, fmtDay, fmtExpiry, loadUser, lookupUsers } from "../../_shared/server";
import { AdminHeader, StatePill } from "../../_shared/ui";
import { M } from "./messages";
import { AccessPanel, AccountPanel, GroupsPanel, NotesPanel, PrivacyPanel } from "./UserPanels";

export const metadata: Metadata = { title: "Gestionar usuario" };

export default async function AdminUsuario({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const t = A[s.locale], m = M[s.locale];
  const u = await loadUser(s, id);
  if (!u) notFound();
  const [coursesRes, groupsRes, countryRes, auditRes] = await Promise.all([
    s.supabase.from("courses").select("id, status, publish_at"),
    s.supabase.from("groups").select("id, name").order("name"),
    s.supabase.from("countries").select("name, currency").eq("code", u.country).maybeSingle(),
    s.supabase.from("admin_audit").select("id, admin_id, action, detail, at").eq("target_user", id).order("at", { ascending: false }).limit(30),
  ]);
  // Solo cuentan las clases de cursos liberados: el admin también ve los borradores.
  const nowIso = new Date().toISOString();
  const live = must(coursesRes).filter((c) => c.status === "published" || (c.status === "scheduled" && !!c.publish_at && c.publish_at <= nowIso)).map((c) => c.id);
  const lessonsRes = live.length ? await s.supabase.from("lessons").select("id", { count: "exact", head: true }).in("course_id", live) : { count: 0, error: null };
  if (lessonsRes.error) throw new Error(`db: ${lessonsRes.error.message}`);
  const allGroups = must(groupsRes), log = must(auditRes);
  const country = countryRes.error ? null : countryRes.data;
  const admins = await lookupUsers(s, log.map((l) => l.admin_id));
  const groupNames = new Map(allGroups.map((g) => [g.id, g.name]));

  const free = u.state === "alumno" || u.state === "fundador";
  const untilText = free ? (u.access_until ? fmtExpiry(s, u.access_until) : m.lifetime)
    : u.state === "pro" && u.pro_until ? fill(m.renews, { date: fmtDay(s, u.pro_until) })
    : u.state === "trial" && u.trial_ends_at ? fill(m.trialEnds, { date: fmtDay(s, u.trial_ends_at) })
    : u.state === "read_only" && u.pro_until ? fill(m.ends, { date: fmtDay(s, u.pro_until) }) : t.none;
  const wizard = u.onboarding_step === "done" ? m.wizardDone : u.onboarding_step === "wizard" ? m.wizardMid : m.wizardNo;
  const now = new Date();
  const self = u.id === s.userId;

  return (
    <main className={css.page}>
      <Link href="/admin/usuarios" className="link" style={{ fontSize: 14, alignSelf: "flex-start" }}>{m.back}</Link>
      <AdminHeader eyebrow={u.email} title={u.name || u.email}>
        {u.role === "admin" ? <Pill tone="dark">{self ? m.you : m.admin}</Pill> : null}
        {u.suspended_at ? <Pill tone="bad">{t.suspended}</Pill> : null}
      </AdminHeader>

      <div className={css.detail}>
        <div className={css.col}>
          <section aria-labelledby="pa" className={css.section} style={{ gap: 14 }}>
            <h2 id="pa">{m.plan}</h2>
            <div className="row wrap" style={{ gap: 24, alignItems: "flex-start" }}>
              <div className="stack" style={{ gap: 4 }}>
                <span className="label">{m.planK}</span>
                <StatePill t={t} state={u.state} failed={!!u.payment_failed_at} />
                <span className="small muted">{u.groups.length ? fill(m.groupK, { list: u.groups.map((g) => g.name).join(", ") }) : m.noGroup}</span>
              </div>
              <div className="stack" style={{ gap: 4 }}><span className="label">{m.untilK}</span><strong style={{ fontSize: 20 }}>{untilText}</strong></div>
            </div>
            {u.payment_failed_at ? <p className="banner" style={{ margin: 0 }}>{fill(m.failed, { date: fmtDay(s, u.payment_failed_at) })}</p> : null}
            {u.cancel_at_period_end ? <span className="small muted">{m.cancels}</span> : null}
            <AccessPanel t={t} m={m} locale={s.locale} today={s.today} userId={u.id} state={u.state}
              from={free && u.access_until ? expiryDay(u.access_until) : undefined} kind={u.state === "fundador" ? "fundador" : "alumno"} />
          </section>

          <section aria-labelledby="us" className={css.section}>
            <h2 id="us">{m.usage}</h2>
            <div className={css.tiles}>
              {[
                { k: m.wizard, v: wizard }, { k: m.closures, v: String(u.closures) },
                { k: m.lessons, v: lessonsRes.count ? fill(m.lessonsOf, { n: u.lessons_done, total: lessonsRes.count }) : String(u.lessons_done) },
                { k: m.points, v: String(u.points) }, { k: m.badges, v: String(u.badges) }, { k: m.weeks, v: String(u.weeks_active) },
              ].map((x) => <div key={x.k} className={css.tile}><span className="xs muted">{x.k}</span><strong className="num" style={{ fontSize: 20 }}>{x.v}</strong></div>)}
            </div>
            <span className="xs muted">{m.usageNote}</span>
          </section>

          <section aria-labelledby="gr" className={css.section}>
            <h2 id="gr">{m.grants}</h2>
            {u.grants.length === 0 ? <span className="small muted">{m.grantsEmpty}</span> : u.grants.map((g) => {
              const live = !g.revoked_at && (!g.expires_at || new Date(g.expires_at) > now);
              return (
                <div key={g.id} className="row-between" style={{ borderTop: "1px solid var(--linea-2)", paddingTop: 10, alignItems: "flex-start" }}>
                  <span className="stack" style={{ gap: 2 }}>
                    <strong style={{ fontSize: 14 }}>{fill(m.grantLine, { kind: t.kinds[g.kind] ?? g.kind, from: fmtDay(s, g.created_at) })}</strong>
                    <span className="xs muted">{[g.expires_at ? fill(m.grantUntil, { date: fmtExpiry(s, g.expires_at) }) : m.grantLife, g.invite_code ? fill(m.grantCode, { code: g.invite_code }) : "", g.revoked_at ? fill(m.grantRevoked, { date: fmtDay(s, g.revoked_at) }) : ""].filter(Boolean).join(" · ")}</span>
                  </span>
                  <Pill tone={live ? "ok" : "neutral"}>{live ? m.active : m.expired}</Pill>
                </div>
              );
            })}
          </section>

          <GroupsPanel m={m} userId={u.id} groups={u.groups} all={allGroups} />
          <NotesPanel m={m} userId={u.id} notes={u.notes.map((n) => ({ id: n.id, body: n.body, when: fmtDay(s, n.created_at) }))} />
        </div>

        <div className={css.col}>
          <AccountPanel t={t} m={m} userId={u.id} email={u.email} role={u.role} self={self}
            rows={[
              { k: m.country, v: country ? `${country.name} · ${country.currency}` : u.country },
              { k: m.signed, v: fmtDay(s, u.created_at) },
              { k: m.last, v: u.last_active_at ? fmtDay(s, u.last_active_at) : m.never },
              { k: m.role, v: t.roles[u.role] ?? u.role },
            ]} />
          <PrivacyPanel t={t} m={m} userId={u.id} email={u.email} self={self} isAdmin={u.role === "admin"} suspended={!!u.suspended_at}
            requests={u.privacy.map((r) => ({ id: r.id, kind: r.kind, status: r.status, due: fmtDay(s, r.due_at), requested: fmtDay(s, r.requested_at) }))} />
          <section aria-labelledby="lg" className={css.section} style={{ gap: 4 }}>
            <h2 id="lg" style={{ marginBottom: 8 }}>{m.history}</h2>
            {log.length === 0 ? <span className="small muted">{m.historyEmpty}</span> : log.map((l) => {
              const detail = describeDetail(s, l.action, l.detail, groupNames);
              const who = l.admin_id ? admins.get(l.admin_id) : null;
              return (
                <div key={l.id} className="stack" style={{ gap: 2, padding: "10px 0", borderTop: "1px solid var(--linea-2)" }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{actionLabel(t, l.action)}{detail ? <span className="muted" style={{ fontWeight: 500 }}> · {detail}</span> : null}</span>
                  <span className="xs muted">{who ? who.name || who.email : l.admin_id ? t.deleted : t.system} · {fmtDay(s, l.at)}</span>
                </div>
              );
            })}
          </section>
        </div>
      </div>
    </main>
  );
}
