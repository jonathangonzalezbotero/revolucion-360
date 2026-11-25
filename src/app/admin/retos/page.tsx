import type { Metadata } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Empty } from "@/components/ui/basics";
import { must } from "@/server/data";
import { requireAdmin } from "@/server/session";
import { notReady } from "@/app/(app)/retos/server";
import css from "../_shared/admin.module.css";
import { AdminHeader } from "../_shared/ui";
import { M } from "./messages";
import { AdminRetosView, type ChallengeItem } from "./AdminRetosView";

export const metadata: Metadata = { title: "Retos" };

type Row = Omit<ChallengeItem, "joined" | "done" | "left">;
const COLS = "id, title, description, image, measure, action, wildcards, days, starts_on, audience, group_id, invite_code, points, badge_name, show_board, status, target";

/**
 * Retos del panel (solo el Dueño): lista con SOLO totales (se unieron, terminaron, salieron; `admin_challenge_totals`),
 * editor y "Así lo ve el alumno". Nunca qué hizo cada persona ni montos.
 */
export default async function AdminRetos() {
  const s = await requireAdmin("retos");
  const m = M[s.locale];
  const db = s.supabase as unknown as SupabaseClient; // tablas de la migración 037: sin tipos hasta regenerarlos
  const [chRes, totRes, groupsRes] = await Promise.all([
    db.from("challenges").select(COLS).order("created_at", { ascending: false }),
    db.rpc("admin_challenge_totals"),
    s.supabase.from("groups").select("id, name").order("name"),
  ]);
  if (notReady(chRes.error) || notReady(totRes.error)) {
    return (
      <main className={css.page}>
        <AdminHeader eyebrow={m.eyebrow} title={m.title} />
        <Empty icon="target" title={m.notReadyTitle} text={m.notReadyText} />
      </main>
    );
  }
  const totals = new Map((must(totRes) as { challenge_id: string; joined: number; done: number; left_count: number }[]).map((t) => [t.challenge_id, t]));
  const items: ChallengeItem[] = (must(chRes) as Row[]).map((c) => {
    const t = totals.get(c.id);
    return { ...c, joined: t?.joined ?? 0, done: t?.done ?? 0, left: t?.left_count ?? 0 };
  });
  return (
    <main className={css.page}>
      <AdminRetosView m={m} locale={s.locale} today={s.today} items={items} groups={must(groupsRes)} creator={s.profile.name.trim().split(/\s+/)[0] ?? ""} />
    </main>
  );
}
