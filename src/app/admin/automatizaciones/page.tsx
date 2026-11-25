import type { Metadata } from "next";
import { fill } from "@/i18n";
import { CRM_FOOTNOTE, triggerLabel } from "@/lib/crm/labels";
import { ExitRulesSchema, StepsSchema, TRIGGER_KINDS, TriggerSchema, type Trigger } from "@/lib/crm/schema";
import { Empty } from "@/components/ui/basics";
import { listAutomations, listConnections, listTags } from "@/server/crm";
import { requireAdmin, type Session } from "@/server/session";
import css from "../_shared/admin.module.css";
import { isUuid } from "../_shared/lib";
import { AdminHeader } from "../_shared/ui";
import { M as MC } from "../campanas/messages";
import c from "../crm/crm.module.css";
import { crmMissing } from "../crm/lib";
import { crmOf, loadLessons, publicAppUrl } from "../crm/server";
import { AutomationsView, type AutoDraft } from "./AutomationsView";
import { visibleTriggers } from "./lib";
import { M } from "./messages";

export const metadata: Metadata = { title: "Automatizaciones" };

type Search = { a?: string | string[] };

export default async function AdminAutomatizaciones({ searchParams }: { searchParams: Promise<Search> }) {
  const s = await requireAdmin("crm");
  const m = M[s.locale];
  const sp = await searchParams;
  let view: Awaited<ReturnType<typeof load>>;
  try {
    view = await load(s);
  } catch (e) {
    if (!crmMissing(e)) throw e;
    return (
      <main className={css.page}>
        <AdminHeader eyebrow={m.eyebrow} title={m.title} />
        <Empty image="/ilustraciones/vacio-movimientos.webp" title={m.notReady} text={m.notReadySub} />
      </main>
    );
  }
  // Abierta: la elegida (?a=id), una nueva (?a=nueva) o la primera.
  const sel = typeof sp.a === "string" && isUuid(sp.a) && view.drafts.some((d) => d.id === sp.a) ? sp.a : sp.a === "nueva" ? null : view.drafts[0]?.id ?? null;
  return (
    <main className={css.page}>
      <AutomationsView m={m} mc={MC[s.locale]} locale={s.locale} initial={sel} {...view} />
      <section aria-labelledby="tr" className={c.box} style={{ gap: 10, padding: "20px 22px" }}>
        <h2 id="tr" style={{ fontSize: 16 }}>{m.eventsTitle}</h2>
        <div className={c.events}>{visibleTriggers(TRIGGER_KINDS).map((k) => <span key={k}>{triggerLabel({ kind: k }, s.locale)}</span>)}</div>
      </section>
      <p className={c.foot}>{CRM_FOOTNOTE[s.locale]}</p>
    </main>
  );
}

async function load(s: Session) {
  const m = M[s.locale];
  const db = crmOf(s);
  // Conexiones web (migración 038): si aún no está aplicada, el editor funciona igual, sin elegir conexión.
  const [autos, tags, lessons, connections] = await Promise.all([listAutomations(db), listTags(db), loadLessons(s),
    listConnections(db).then((l) => l.map((x) => ({ id: x.id, name: x.name }))).catch((e: unknown) => { if (crmMissing(e)) return []; throw e; })]);
  const fallback: Trigger = { kind: "first_month_paid" };
  const drafts: AutoDraft[] = autos.map((a) => {
    const tr = TriggerSchema.safeParse(a.trigger), st = StepsSchema.safeParse(a.steps), ex = ExitRulesSchema.safeParse(a.exit_rules ?? {});
    return {
      id: a.id, name: a.name, status: a.status,
      inside: a.activeCount > 0 ? fill(m.inside, { n: a.activeCount.toLocaleString("en-AU") }) : m.dash,
      trigger: tr.success ? tr.data : fallback, steps: st.success ? st.data : [],
      exitRules: ex.success ? ex.data : { onUnsubscribe: true, onCancel: true, goal: null },
      transactional: a.transactional === true,
    };
  });
  return {
    drafts, lessons, connections, appUrl: publicAppUrl(), heading: MC[s.locale].defaultHeading,
    tags: tags.map((t) => ({ id: t.id, name: t.name, system: !!t.system_key })),
  };
}
