import type { Metadata } from "next";
import { fill } from "@/i18n";
import { AUDIENCE_PRESETS, AudienceSchema, BlocksSchema, type Block } from "@/lib/crm/schema";
import { CRM_FOOTNOTE } from "@/lib/crm/labels";
import { legalReady } from "@/lib/crm/render";
import { Empty } from "@/components/ui/basics";
import { must } from "@/server/data";
import { campaignRates, countAudience, getCampaign, listCampaigns, type CampaignRow } from "@/server/crm";
import { requireAdmin, type Session } from "@/server/session";
import { mergeLegal } from "@/app/legal/lib";
import css from "../_shared/admin.module.css";
import { isUuid } from "../_shared/lib";
import { AdminHeader } from "../_shared/ui";
import c from "../crm/crm.module.css";
import { audiencePreset, campaignWhen, crmMissing, firstWord, fmtRate } from "../crm/lib";
import { crmOf, loadLessons, publicAppUrl } from "../crm/server";
import { CampaignsView, type CampaignDraftView, type CampaignListRow } from "./CampaignsView";
import { M } from "./messages";

export const metadata: Metadata = { title: "Campañas de correo" };

type Search = { c?: string | string[] };

export default async function AdminCampanas({ searchParams }: { searchParams: Promise<Search> }) {
  const s = await requireAdmin("crm");
  const m = M[s.locale];
  const sp = await searchParams;
  let view: Awaited<ReturnType<typeof load>>;
  try {
    view = await load(s, typeof sp.c === "string" ? sp.c : "");
  } catch (e) {
    if (!crmMissing(e)) throw e;
    return (
      <main className={css.page}>
        <AdminHeader eyebrow={m.eyebrow} title={m.title} />
        <Empty image="/ilustraciones/vacio-analisis.webp" title={m.notReady} text={m.notReadySub} />
      </main>
    );
  }
  return (
    <main className={css.page}>
      <CampaignsView key={`${view.draft.id ?? "nueva"}:${view.draft.status}`} m={m} locale={s.locale} {...view} />
      <p className={c.foot}>{CRM_FOOTNOTE[s.locale]}</p>
    </main>
  );
}

async function load(s: Session, sel: string) {
  const m = M[s.locale];
  const db = crmOf(s);
  const tz = s.profile.timezone || "Australia/Sydney";
  const [campaigns, legalRow, lessons] = await Promise.all([
    listCampaigns(db),
    s.supabase.from("app_config").select("value").eq("key", "legal").maybeSingle(),
    loadLessons(s),
  ]);
  const l = mergeLegal(must(legalRow)?.value);

  const rows: CampaignListRow[] = campaigns.map((x) => {
    const when = campaignWhen(x, s.locale, tz, String(s.year));
    const status = m.status[x.status] ?? x.status;
    const a = AudienceSchema.safeParse(x.audience);
    const preset = a.success ? audiencePreset(a.data) : null;
    const done = x.status === "sending" || x.status === "sent" || x.status === "cancelled";
    const rates = done ? campaignRates(x) : null;
    return {
      id: x.id, name: x.name || x.subject || m.noSubject,
      status: when ? fill(m.statusWhen, { status, when }) : status,
      audience: done && x.recipients_count === 1 ? m.onePerson : preset ? m.presets[preset] : m.custom,
      opened: rates ? fmtRate(rates.opened) : m.dash, clicked: rates ? fmtRate(rates.clicked) : m.dash,
    };
  });

  // Campaña abierta: la elegida, si no el primer borrador, si no una nueva.
  const pick = isUuid(sel) ? sel : sel === "nueva" ? null : campaigns.find((x) => x.status === "draft")?.id ?? null;
  const row = pick ? await getCampaign(db, pick) : null;
  const draft = row ? toDraft(row) : newDraft(m.defaultHeading, firstWord(s.profile.name));
  const count = await countAudience(db, AUDIENCE_PRESETS[draft.preset]);

  return { rows, draft, count, lessons, legalReady: legalReady({ company: l.company, abn: l.abn, address: l.address }), appUrl: publicAppUrl(), selected: row?.id ?? null };
}

function toDraft(r: CampaignRow): CampaignDraftView {
  const a = AudienceSchema.safeParse(r.audience);
  const b = BlocksSchema.safeParse(r.blocks);
  return {
    id: r.id, name: r.name || r.subject, status: r.status as CampaignDraftView["status"], subject: r.subject, preheader: r.preheader,
    preset: (a.success ? audiencePreset(a.data) : null) ?? "all", blocks: b.success ? b.data : [], sendMode: r.send_mode, scheduledLocal: r.scheduled_local,
  };
}

function newDraft(heading: string, signature: string): CampaignDraftView {
  const blocks: Block[] = [{ type: "heading", text: heading }, { type: "text", text: "" }];
  if (signature) blocks.push({ type: "signature", text: signature });
  return { id: null, name: "", status: "draft", subject: "", preheader: "", preset: "paying_first", blocks, sendMode: "now", scheduledLocal: null };
}
