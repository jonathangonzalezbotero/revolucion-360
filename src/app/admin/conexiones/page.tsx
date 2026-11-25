import type { Metadata } from "next";
import { fill } from "@/i18n";
import { CRM_FOOTNOTE } from "@/lib/crm/labels";
import { legalReady } from "@/lib/crm/render";
import { TriggerSchema } from "@/lib/crm/schema";
import { Empty } from "@/components/ui/basics";
import { connectionLog, getAntiBot, listAutomations, listConnections, listTags } from "@/server/crm";
import { loadLegal } from "@/server/crm/db";
import { requireAdmin, type Session } from "@/server/session";
import css from "../_shared/admin.module.css";
import { isUuid } from "../_shared/lib";
import { AdminHeader } from "../_shared/ui";
import { activityDate, crmMissing, PUBLIC_APP_URL, relativeTime } from "../crm/lib";
import { crmOf, publicAppUrl } from "../crm/server";
import { ConnectionsView, type ConnView, type LogLine } from "./ConnectionsView";
import { M } from "./messages";

export const metadata: Metadata = { title: "Conexiones web" };

type Search = { c?: string | string[] };

export default async function AdminConexiones({ searchParams }: { searchParams: Promise<Search> }) {
  const s = await requireAdmin("crm");
  const m = M[s.locale];
  const sp = await searchParams;
  let view: Awaited<ReturnType<typeof load>>;
  try {
    view = await load(s, typeof sp.c === "string" && isUuid(sp.c) ? sp.c : null);
  } catch (e) {
    if (!crmMissing(e)) throw e;
    return (
      <main className={css.page}>
        <AdminHeader eyebrow={m.eyebrow} title={m.title} />
        <Empty image="/ilustraciones/vacio-movimientos.webp" title={m.notReady} text={m.notReadySub} />
      </main>
    );
  }
  return (
    <main className={css.page}>
      <ConnectionsView m={m} footnote={CRM_FOOTNOTE[s.locale]} {...view} />
    </main>
  );
}

async function load(s: Session, wanted: string | null) {
  const m = M[s.locale];
  const db = crmOf(s);
  const [conns, tags, autos, antiBot, legal] = await Promise.all([listConnections(db), listTags(db), listAutomations(db), getAntiBot(db), loadLegal(db)]);
  const selected = conns.find((c) => c.id === wanted) ?? conns[0] ?? null;
  const log = selected ? await connectionLog(db, selected.id) : [];
  const now = new Date();
  const tz = s.profile.timezone || "Australia/Sydney";

  // Automatizaciones ACTIVAS que arrancan con lo que pone cada conexión: sus etiquetas, "Llegó por una conexión web" o "Confirmó su correo".
  const active = autos.filter((a) => a.status === "active").map((a) => ({ name: a.name, t: TriggerSchema.safeParse(a.trigger) })).filter((a) => a.t.success);
  const flowsFor = (c: { id: string; tag_ids: string[] }) => active.filter(({ t }) => {
    const tr = t.data!;
    if (tr.kind === "tag_added") return !!tr.tagId && c.tag_ids.includes(tr.tagId);
    if (tr.kind === "web_connection" || tr.kind === "email_confirmed") return !tr.connectionId || tr.connectionId === c.id;
    return false;
  }).map((a) => a.name);

  const tagName = new Map(tags.map((t) => [t.id, t.name]));
  const list: ConnView[] = conns.map((c) => ({
    id: c.id, slug: c.slug, name: c.name, status: c.status, tagIds: c.tag_ids.filter((t) => tagName.has(t)), origins: c.origins, thanksUrl: c.thanks_url ?? "",
    doubleOptIn: c.double_opt_in, contacts: c.contacts.toLocaleString("en-AU"),
    last: relativeTime(c.lastAt, now, m.rel) ?? m.never, flows: flowsFor(c),
  }));
  const lastBrowser = log.find((l) => l.via === "browser");
  const lines: LogLine[] = log.map((l) => ({
    when: activityDate(l.at, now, tz, { today: m.today, yesterday: m.yesterday }, s.locale),
    who: l.count > 1 ? fill(m.many, { n: l.count.toLocaleString("en-AU") }) : l.email ?? m.noEmail,
    what: (l.count > 1 ? m.rejectedMany[l.result] : undefined) ?? m.results[l.result] ?? l.result,
    bad: l.result.startsWith("rejected_") || l.result === "no_consent" || l.result === "suppressed",
  }));
  const base = publicAppUrl();
  return {
    list, selectedId: selected?.id ?? null, log: lines,
    shield: !lastBrowser ? "none" as const : lastBrowser.result === "rejected_turnstile" ? "bad" as const : "ok" as const,
    tags: tags.map((t) => ({ id: t.id, name: t.name, system: !!t.system_key })),
    siteKey: antiBot.siteKey, secretSet: antiBot.secretSet, legalOk: legalReady(legal),
    appUrl: /^https:\/\//.test(base) ? base : base || PUBLIC_APP_URL,
  };
}
