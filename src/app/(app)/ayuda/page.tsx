import type { Metadata } from "next";
import { formatDate, todayIn } from "@/lib/engine";
import { must } from "@/server/data";
import { requireUser } from "@/server/session";
import { appVersion, asTopic, ticketCode } from "./lib";
import { M } from "./messages";
import { Help, type TicketView } from "./Help";

export const metadata: Metadata = { title: "Ayuda" };

export default async function AyudaPage() {
  const s = await requireUser();
  const m = M[s.locale];
  const tz = s.profile.timezone || "Australia/Sydney";
  const [faqRes, ticketRes, courseRes] = await Promise.all([
    s.supabase.from("faqs").select("id, topic, question, answer").eq("published", true).eq("locale", s.locale).order("sort").order("question"),
    s.supabase.from("support_tickets").select("id, topic, subject, status, created_at, updated_at, ticket_messages(id, body, from_admin, created_at)").eq("user_id", s.userId).order("updated_at", { ascending: false }).limit(50),
    s.config.menu.academia === "on"
      ? s.supabase.from("courses").select("title, lessons(id)").eq("slug", "empieza-aqui").eq("status", "published").maybeSingle()
      : null,
  ]);
  const faqs = must(faqRes);
  const tickets = must(ticketRes);
  const course = courseRes ? must(courseRes) : null;

  const day = (iso: string) => formatDate(todayIn(tz, new Date(iso)), s.locale, "short");
  const views: TicketView[] = tickets.map((t) => ({
    id: t.id, code: ticketCode(t.id), topic: asTopic(t.topic), subject: t.subject, status: t.status as TicketView["status"], updated: day(t.updated_at),
    messages: [...(t.ticket_messages ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((x) => ({ id: x.id, body: x.body, fromAdmin: x.from_admin, when: day(x.created_at) })),
  }));

  return (
    <Help
      m={m}
      faqs={faqs}
      tickets={views}
      // El servidor fija estos datos técnicos; el cliente agrega navegador, pantalla e idioma. El usuario ve todo antes de enviar.
      server={{ appLanguage: s.locale, plan: s.entitlement.state, country: s.profile.country, version: appVersion(process.env.VERCEL_GIT_COMMIT_SHA) }}
      course={course ? { title: course.title, lessons: course.lessons.length } : null}
    />
  );
}
