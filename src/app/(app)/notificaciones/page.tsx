import type { Metadata } from "next";
import { formatDate, weekdayName } from "@/lib/engine";
import { must } from "@/server/data";
import { requireUser } from "@/server/session";
import { asKind, dayOf, groupOf, safeHref } from "./lib";
import { M } from "./messages";
import { Notifications, type NotifView } from "./Notifications";

export const metadata: Metadata = { title: "Notificaciones" };

const LIMIT = 200;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export default async function NotificacionesPage() {
  const s = await requireUser();
  const m = M[s.locale];
  const rows = must(await s.supabase.from("notifications").select("id, kind, title, body, href, read_at, created_at").order("created_at", { ascending: false }).limit(LIMIT));
  const tz = s.profile.timezone || "Australia/Sydney";
  const intl = s.locale === "en" ? "en-AU" : "es";
  const hour = new Intl.DateTimeFormat(intl, { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const items: NotifView[] = rows.map((r) => {
    const day = dayOf(r.created_at, tz);
    const group = groupOf(day, s.today);
    const at = new Date(r.created_at);
    const time = group === "today" ? hour.format(at) : group === "week" ? cap(weekdayName(day, s.locale).slice(0, 3)) : formatDate(day, s.locale, "short");
    return { id: r.id, kind: asKind(r.kind), title: r.title, body: r.body, href: safeHref(r.href), unread: !r.read_at, createdAt: r.created_at, group, time };
  });
  return <Notifications items={items} m={m} />;
}
