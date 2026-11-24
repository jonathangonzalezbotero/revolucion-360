import type { Metadata } from "next";
import { fill } from "@/i18n";
import { fetchAll, must } from "@/server/data";
import { requireAdmin } from "@/server/session";
import css from "../_shared/admin.module.css";
import { listHref, pageCount, pageRange, parseFilter, parsePage, parseSearch } from "../_shared/lib";
import { A } from "../_shared/messages";
import { fmtDay, fmtExpiry } from "../_shared/server";
import { Pager } from "../_shared/ui";
import { M } from "./messages";
import { UsersView, type CodeRow, type UserRow } from "./UsersView";

export const metadata: Metadata = { title: "Usuarios y accesos" };

export default async function AdminUsuarios({ searchParams }: { searchParams: Promise<{ q?: string | string[]; filtro?: string | string[]; p?: string | string[] }> }) {
  const s = await requireAdmin();
  const t = A[s.locale], m = M[s.locale];
  const sp = await searchParams;
  const q = parseSearch(sp.q), filter = parseFilter(sp.filtro), page = parsePage(sp.p);
  const { limit, offset } = pageRange(page);
  const [usersRes, groupsRes, codesRes, countriesRes, members] = await Promise.all([
    s.supabase.rpc("admin_users", { p_search: q, p_filter: filter, p_limit: limit, p_offset: offset }),
    s.supabase.from("groups").select("id, name").order("name"),
    s.supabase.from("invite_codes").select("code, kind, months, until, group_id, max_uses, uses, active, created_at").order("created_at", { ascending: false }).limit(200),
    s.supabase.from("countries").select("code, name"),
    fetchAll((a, b) => s.supabase.from("group_members").select("group_id").order("group_id").range(a, b)),
  ]);
  const users = must(usersRes), groups = must(groupsRes), codes = must(codesRes), countries = must(countriesRes);
  const total = users[0]?.total ?? 0;
  const pages = pageCount(total);
  const country = new Map(countries.map((c) => [c.code, c.name]));
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const memberCount = new Map<string, number>();
  members.forEach((x) => memberCount.set(x.group_id, (memberCount.get(x.group_id) ?? 0) + 1));

  const until = (u: (typeof users)[number]): string => {
    if (u.state === "alumno" || u.state === "fundador") return u.access_until ? fill(m.expires, { date: fmtExpiry(s, u.access_until) }) : m.lifetime;
    if (u.state === "pro" && u.pro_until) return fill(m.renews, { date: fmtDay(s, u.pro_until) });
    if (u.state === "read_only" && u.pro_until) return fill(m.ends, { date: fmtDay(s, u.pro_until) });
    return t.none;
  };
  const rows: UserRow[] = users.map((u) => ({
    id: u.id, name: u.name || t.noName, email: u.email, country: country.get(u.country) ?? u.country, state: u.state,
    groups: u.groups ?? [], until: until(u), last: u.last_active_at ? fmtDay(s, u.last_active_at, "short") : t.none,
    failed: !!u.payment_failed_at, suspended: !!u.suspended_at,
  }));
  const codeRows: CodeRow[] = codes.map((c) => ({
    code: c.code, kind: c.kind, active: c.active, uses: c.uses, max: c.max_uses,
    duration: c.months ? fill(m.months, { n: c.months }) : c.until ? fill(m.untilDate, { date: fmtExpiry(s, c.until) }) : m.lifetime,
    group: c.group_id ? groupName.get(c.group_id) ?? t.none : t.none,
  }));

  return (
    <main className={css.page}>
      <UsersView
        t={t} m={m} locale={s.locale} today={s.today} q={q} filter={filter} rows={rows} codes={codeRows}
        groups={groups.map((g) => ({ id: g.id, name: g.name, members: memberCount.get(g.id) ?? 0 }))}
        countText={total === 1 ? m.countOne : fill(m.count, { n: total })}
        pager={<Pager t={t} page={page} pages={pages} href={(p) => listHref("/admin/usuarios", { q, filtro: filter, p })} />}
      />
    </main>
  );
}
