import type { Metadata } from "next";
import { fill } from "@/i18n";
import { CRM_FOOTNOTE, EVENT_LABELS, SOURCE_LABELS, STAGE_LABELS } from "@/lib/crm/labels";
import type { Source } from "@/lib/crm/schema";
import { Empty } from "@/components/ui/basics";
import { must } from "@/server/data";
import { getContact, getSummary, listAutomations, listContacts, listTags, type ContactListItem } from "@/server/crm";
import { requireAdmin, type Session } from "@/server/session";
import css from "../_shared/admin.module.css";
import { isUuid, listHref, pageCount, parsePage, parseSearch } from "../_shared/lib";
import { fmtDay } from "../_shared/server";
import { A } from "../_shared/messages";
import { AdminHeader } from "../_shared/ui";
import c from "./crm.module.css";
import { ContactsView, type ContactPanel, type ContactRowView, type TagView } from "./ContactsView";
import { activityDate, crmMissing, describeEvent, firstWord, isStage, OWN_TAG_TONE, relativeTime, STAGE_TONE } from "./lib";
import { M } from "./messages";
import { crmOf } from "./server";

export const metadata: Metadata = { title: "Contactos" };

const PAGE = 25;
type Search = { q?: string | string[]; f?: string | string[]; sel?: string | string[]; p?: string | string[] };

export default async function AdminContactos({ searchParams }: { searchParams: Promise<Search> }) {
  const s = await requireAdmin("crm");
  const m = M[s.locale];
  const sp = await searchParams;
  let view: Awaited<ReturnType<typeof load>>;
  try {
    view = await load(s, sp);
  } catch (e) {
    if (!crmMissing(e)) throw e;
    return (
      <main className={css.page}>
        <AdminHeader eyebrow={m.eyebrow} title={m.title} />
        <Empty image="/ilustraciones/vacio-cuentas.webp" title={m.notReady} text={m.notReadySub} />
      </main>
    );
  }
  return (
    <main className={css.page}>
      <ContactsView m={m} {...view} />
      <p className={c.foot}>{CRM_FOOTNOTE[s.locale]}</p>
    </main>
  );
}

async function load(s: Session, sp: Search) {
  const m = M[s.locale];
  const db = crmOf(s);
  const now = new Date();
  const tz = s.profile.timezone || "Australia/Sydney";
  const q = parseSearch(sp.q);
  const f = typeof sp.f === "string" ? sp.f : "";
  const page = parsePage(sp.p);
  const stage = isStage(f) ? f : null;
  const tagId = isUuid(f) ? f : null;

  const [summary, tags, list, automations, countriesRes] = await Promise.all([
    getSummary(db),
    listTags(db),
    listContacts(db, { q, stage, tagId, limit: PAGE, offset: (page - 1) * PAGE }),
    listAutomations(db),
    s.supabase.from("countries").select("code, name").order("sort"),
  ]);
  const countries = must(countriesRes);
  const countryName = (code: string | null) => (code ? countries.find((x) => x.code === code)?.name ?? code : null);
  const tagName = (id: string) => tags.find((t) => t.id === id)?.name ?? null;
  const stageLabels = STAGE_LABELS[s.locale];
  const sourceLabel = (src: string) => SOURCE_LABELS[s.locale][src as Source] ?? src;
  const stageTag = (st: string): TagView | null => (isStage(st) ? { id: null, name: stageLabels[st], ...STAGE_TONE[st] } : null);
  const ownTags = (ids: string[]): TagView[] => ids.map((id) => ({ id, name: tagName(id) ?? "", ...OWN_TAG_TONE })).filter((t) => t.name);

  const rows: ContactRowView[] = list.rows.map((r: ContactListItem) => ({
    id: r.id, href: listHref("/admin/crm", { q, f, p: page, sel: r.id }), name: r.name || r.email, email: r.email, src: sourceLabel(r.source),
    tags: [stageTag(r.stage), ...ownTags(r.tagIds)].filter((t): t is TagView => !!t),
    last: relativeTime(r.last_activity_at, now, m.rel) ?? m.noActivity,
  }));

  // Ficha: la elegida o la primera de la lista.
  const selId = typeof sp.sel === "string" && isUuid(sp.sel) ? sp.sel : rows[0]?.id ?? null;
  let panel: ContactPanel | null = null;
  if (selId) {
    try {
      const d = await getContact(db, selId);
      const ct = d.contact;
      const autoName = (id: string) => automations.find((a) => a.id === id)?.name ?? "";
      panel = {
        id: ct.id, name: ct.name || ct.email, email: ct.email, initial: (ct.name || ct.email).charAt(0).toUpperCase(),
        tags: [stageTag(ct.stage), ...ownTags(d.tagIds)].filter((t): t is TagView => !!t),
        src: ct.source_detail ? `${sourceLabel(ct.source)} · ${ct.source_detail}` : sourceLabel(ct.source),
        consent: ct.email_consent,
        cons: ct.email_consent ? m.marketingYes : ct.email_unsubscribed_at ? fill(m.unsubOn, { date: fmtDay(s, ct.email_unsubscribed_at) }) : m.marketingNo,
        sms: ct.phone ? (ct.sms_consent ? m.smsYes : m.smsNo) : null,
        phone: ct.phone, country: countryName(ct.country),
        tl: d.events.map((e) => ({ d: activityDate(e.at, now, tz, m.day, s.locale), t: describeEvent(e, { events: EVENT_LABELS[s.locale], stages: stageLabels, tagName, sms: m.sms }) })),
        autos: d.enrollments.map((e) => ({ name: autoName(e.automation_id), status: m.enrollStatus[e.status] ?? e.status })).filter((a) => a.name),
      };
    } catch (e) {
      if (crmMissing(e)) throw e; // la ficha que no existe (borrada) simplemente no se muestra
    }
  }

  const filters = [
    { key: "", name: m.all },
    ...(Object.keys(stageLabels) as (keyof typeof stageLabels)[]).map((k) => ({ key: k, name: stageLabels[k] })),
    ...tags.filter((t) => !t.system_key).map((t) => ({ key: t.id, name: t.name })),
  ].map((x) => ({ ...x, href: listHref("/admin/crm", { q, f: x.key }), current: x.key === f }));

  const pages = pageCount(list.total, PAGE);
  return {
    summary, rows, total: list.total, panel, filters, q, f, page, pages,
    ownTags: tags.filter((t) => !t.system_key).map((t) => ({ id: t.id, name: t.name })),
    automations: automations.filter((a) => a.status === "active").map((a) => ({ id: a.id, name: a.name })),
    countries: countries.map((x) => ({ code: x.code, name: x.name })),
    filtered: !!(q || f), t: A[s.locale], signature: firstWord(s.profile.name),
  };
}
