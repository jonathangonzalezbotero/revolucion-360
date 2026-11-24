import type { Metadata } from "next";
import { fill } from "@/i18n";
import { fetchAll, must } from "@/server/data";
import { requireAdmin } from "@/server/session";
import css from "../_shared/admin.module.css";
import { isUuid } from "../_shared/lib";
import { A } from "../_shared/messages";
import { fmtDay, lookupUsers } from "../_shared/server";
import { M } from "./messages";
import { GroupsView, type GroupRow, type MemberRow } from "./GroupsView";

export const metadata: Metadata = { title: "Grupos" };
const MAX_MEMBERS = 200;

export default async function AdminGrupos({ searchParams }: { searchParams: Promise<{ ver?: string | string[] }> }) {
  const s = await requireAdmin();
  const t = A[s.locale], m = M[s.locale];
  const raw = (await searchParams).ver;
  const ver = typeof raw === "string" && isUuid(raw) ? raw : null;
  const [groupsRes, members] = await Promise.all([
    s.supabase.from("groups").select("id, name, note, created_at").order("created_at", { ascending: false }),
    fetchAll((a, b) => s.supabase.from("group_members").select("group_id, user_id").order("group_id").order("user_id").range(a, b)),
  ]);
  const groups = must(groupsRes);
  const count = new Map<string, number>();
  members.forEach((x) => count.set(x.group_id, (count.get(x.group_id) ?? 0) + 1));
  const rows: GroupRow[] = groups.map((g) => {
    const n = count.get(g.id) ?? 0;
    return { id: g.id, name: g.name, note: g.note, members: n, membersText: n === 1 ? m.membersOne : fill(m.members, { n }), created: fmtDay(s, g.created_at, "short") };
  });
  let open: { id: string; members: MemberRow[]; more: number } | null = null;
  if (ver && groups.some((g) => g.id === ver)) {
    const ids = members.filter((x) => x.group_id === ver).map((x) => x.user_id);
    const users = await lookupUsers(s, ids.slice(0, MAX_MEMBERS));
    open = {
      id: ver,
      members: [...users.values()].map((u) => ({ id: u.id, name: u.name || u.email, email: u.email })).sort((a, b) => a.name.localeCompare(b.name)),
      more: Math.max(0, ids.length - MAX_MEMBERS),
    };
  }
  return (
    <main className={css.page}>
      <GroupsView t={t} m={m} locale={s.locale} today={s.today} groups={rows} open={open} />
    </main>
  );
}
