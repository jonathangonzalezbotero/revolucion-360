"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fill } from "@/i18n";
import { EVENT_LABELS, STAGE_LABELS, triggerLabel } from "@/lib/crm/labels";
import { TRIGGER_KINDS, type Block, type Check, type ConditionStepT, type EventKind, type ExitRules, type LeafStepT, type Step, type Trigger } from "@/lib/crm/schema";
import { Empty } from "@/components/ui/basics";
import { Modal, useToast } from "@/components/ui/client";
import { Icon } from "@/components/ui/Icon";
import css from "../_shared/admin.module.css";
import { AdminHeader } from "../_shared/ui";
import { BlocksEditor, type LessonOption } from "../campanas/BlocksEditor";
import { EmailPreview, usePreview } from "../campanas/EmailPreview";
import type { CampanasText } from "../campanas/messages";
import c from "../crm/crm.module.css";
import { move } from "../crm/lib";
import { saveAuto, setAutoStatus } from "./actions";
import { CHECK_TYPES, exitSentence, GOAL_KINDS, LEAF_TYPES, newStep, replaceStep, STAGE_KEYS, STEP_TONE, STEP_TYPES, stepIds, stepSummary, triggerSummary, type Ctx, type StepType } from "./lib";
import type { AutoText } from "./messages";

export type AutoDraft = { id: string; name: string; status: "draft" | "active" | "paused"; inside: string; trigger: Trigger; steps: Step[]; exitRules: ExitRules };
type TagOpt = { id: string; name: string; system: boolean };
type R<T> = { ok: true; data: T } | { ok: false; error: string };
type Shared = { m: AutoText; mc: CampanasText; ctx: Ctx; ownTags: TagOpt[]; lessons: LessonOption[]; appUrl: string; heading: string; allIds: () => string[] };

export function AutomationsView({ m, mc, locale, initial, drafts, tags, lessons, appUrl, heading }: {
  m: AutoText; mc: CampanasText; locale: "es" | "en"; initial: string | null; drafts: AutoDraft[]; tags: TagOpt[]; lessons: LessonOption[]; appUrl: string; heading: string;
}) {
  const router = useRouter();
  const tagName = (id: string) => tags.find((t) => t.id === id)?.name ?? "—";
  const trig = (t: Trigger) => triggerSummary(t, triggerLabel(t, locale), m.trig, tagName);
  const current = drafts.find((d) => d.id === initial) ?? null;
  const fresh: AutoDraft = { id: "", name: m.newName, status: "draft", inside: m.dash, trigger: { kind: "first_month_paid" }, steps: [], exitRules: { onUnsubscribe: true, onCancel: true, goal: { kind: "signup" } } };

  return (
    <>
      <AdminHeader eyebrow={m.eyebrow} title={m.title}>
        <Link href="/admin/automatizaciones?a=nueva" className="btn" style={{ minHeight: 46 }}>{m.newAuto}</Link>
      </AdminHeader>
      <div className={c.autoGrid}>
        <section aria-label={m.listLabel} className={c.flows}>
          {drafts.length === 0 ? (
            <div className={c.box}><Empty image="/ilustraciones/vacio-movimientos.webp" title={m.empty} text={m.emptySub} /></div>
          ) : drafts.map((f) => (
            <button key={f.id} type="button" className={c.flow} aria-pressed={f.id === initial} onClick={() => router.push(`/admin/automatizaciones?a=${f.id}`, { scroll: false })}>
              <span><strong>{f.name}</strong><span style={{ fontSize: 12, fontWeight: 600, color: f.status === "active" ? "var(--verde-fuerte)" : "var(--gris)" }}>{m.status[f.status]}</span></span>
              <span className={c.flowSub}>{fill(m.startsWhenSum, { trig: trig(f.trigger) })}</span>
              <span className={`num ${c.flowN}`}>{f.inside}</span>
            </button>
          ))}
        </section>
        <Editor key={current?.id ?? "nueva"} m={m} mc={mc} locale={locale} draft={current ?? fresh} isNew={!current} tags={tags} lessons={lessons} appUrl={appUrl} heading={heading} trig={trig} tagName={tagName} />
      </div>
    </>
  );
}

function Editor({ m, mc, locale, draft, isNew, tags, lessons, appUrl, heading, trig, tagName }: {
  m: AutoText; mc: CampanasText; locale: "es" | "en"; draft: AutoDraft; isNew: boolean; tags: TagOpt[]; lessons: LessonOption[]; appUrl: string; heading: string;
  trig: (t: Trigger) => string; tagName: (id: string) => string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [d, setD] = useState(draft);
  const [dirty, setDirty] = useState(isNew);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const patch = (p: Partial<AutoDraft>) => { setError(null); setDirty(true); setD((x) => ({ ...x, ...p })); };
  const ownTags = tags.filter((t) => !t.system);
  const ctx: Ctx = { t: m.sum, events: EVENT_LABELS[locale], stages: STAGE_LABELS[locale], tagName };
  const shared: Shared = { m, mc, ctx, ownTags, lessons, appUrl, heading, allIds: () => stepIds(d.steps) };

  const payload = () => ({ id: d.id || null, name: d.name, trigger: d.trigger, steps: d.steps, exitRules: d.exitRules });
  const go = (id: string | null) => { if (id && id !== d.id) router.replace(`/admin/automatizaciones?a=${id}`, { scroll: false }); router.refresh(); };
  const run = (steps: (() => Promise<R<unknown>>)[], done: string, after: (id: string | null) => void) => start(async () => {
    setError(null);
    let id: string | null = d.id || null;
    for (const fn of steps) {
      const r = await fn();
      if (!r.ok) {
        setError(r.error); toast(r.error);
        // Si ya se guardó (p. ej. "Activar" una nueva sin pasos), queda abierta la guardada: nunca se crea dos veces.
        if (id && id !== d.id) go(id);
        return;
      }
      if (typeof r.data === "string") {
        if (r.data !== id) setD((p) => ({ ...p, id: r.data as string }));
        id = r.data;
        setDirty(false);
      }
    }
    setDirty(false);
    toast(done);
    after(id);
  });
  const save = () => run([() => saveAuto(payload())], m.saved, go);
  const toggle = () => {
    const status = d.status === "active" ? "paused" : "active";
    const steps: (() => Promise<R<unknown>>)[] = [];
    let id = d.id;
    if (dirty || !id) steps.push(async () => { const r = await saveAuto(payload()); if (r.ok) id = r.data; return r; });
    steps.push(() => setAutoStatus({ id, status }));
    run(steps, status === "active" ? m.activated : m.paused, (x) => { setD((p) => ({ ...p, status })); go(x); });
  };

  const setTrigger = (t: Partial<Trigger>) => patch({ trigger: { ...d.trigger, ...t } as Trigger });
  const kindNeedsDays = d.trigger.kind === "inactive_days" || d.trigger.kind === "charge_upcoming";
  const addTop = (type: StepType) => { patch({ steps: [...d.steps, newStep(type, stepIds(d.steps), { heading, tagId: ownTags[0]?.id ?? null })] }); setAdding(false); };
  const er = d.exitRules;

  return (
    <section aria-labelledby="fb" className={c.box} style={{ padding: 22, gap: 12 }}>
      <div className={c.flowHead}>
        <h2 id="fb">{d.name || m.newName}</h2>
        <span className={c.actions}>
          <button type="button" className={`btn btn-secondary ${c.btnMd}`} disabled={busy} onClick={toggle}>{d.status === "active" ? m.pause : m.activate}</button>
          <button type="button" className={`btn ${c.btnMd}`} disabled={busy} onClick={save}>{busy ? m.saving : m.save}</button>
        </span>
      </div>
      {error ? <p role="alert" className={css.err}>{error}</p> : null}
      {dirty && !isNew ? <p className={c.hint} role="status">{m.unsaved}</p> : null}
      <div className="field">
        <label htmlFor="au-n">{m.name}</label>
        <input id="au-n" className="input" maxLength={120} value={d.name} onChange={(e) => patch({ name: e.target.value })} />
      </div>

      <div className={c.trigger}>
        <span>{m.startsWhen}</span>
        <strong>{trig(d.trigger)}</strong>
        <div className={c.triggerRow}>
          <div className="field">
            <label htmlFor="au-k">{m.event}</label>
            <select id="au-k" className="input" value={d.trigger.kind} onChange={(e) => patch({ trigger: { kind: e.target.value as Trigger["kind"], ...(e.target.value === "inactive_days" || e.target.value === "charge_upcoming" ? { days: d.trigger.days ?? (e.target.value === "charge_upcoming" ? 3 : 14) } : {}) } as Trigger })}>
              {TRIGGER_KINDS.map((k) => <option key={k} value={k}>{triggerLabel({ kind: k }, locale)}</option>)}
            </select>
          </div>
          {kindNeedsDays ? (
            <div className="field" style={{ flex: "0 1 120px" }}>
              <label htmlFor="au-d">{m.days}</label>
              <input id="au-d" className="input num" type="number" min={1} max={365} value={d.trigger.days ?? ""} onChange={(e) => setTrigger({ days: clampInt(e.target.value, 1, 365) })} />
            </div>
          ) : null}
          {d.trigger.kind === "tag_added" ? (
            <div className="field">
              <label htmlFor="au-t">{m.tag}</label>
              <select id="au-t" className="input" value={d.trigger.tagId ?? ""} onChange={(e) => setTrigger({ tagId: e.target.value || undefined })}>
                <option value="" disabled>{m.pickTag}</option>
                {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          ) : null}
          {d.trigger.kind === "web_form" ? (
            <div className="field">
              <label htmlFor="au-f">{m.form}</label>
              <input id="au-f" className="input" maxLength={60} placeholder={m.formPh} value={d.trigger.form ?? ""} onChange={(e) => setTrigger({ form: e.target.value || undefined })} />
            </div>
          ) : null}
          {d.trigger.kind === "goal_milestone" ? (
            <div className="field">
              <label htmlFor="au-p">{m.pct}</label>
              <select id="au-p" className="input" value={d.trigger.pct ?? ""} onChange={(e) => setTrigger({ pct: e.target.value ? (Number(e.target.value) as 25 | 50 | 75 | 100) : undefined })}>
                <option value="">{m.pctAny}</option>
                {[25, 50, 75, 100].map((p) => <option key={p} value={p}>{p}%</option>)}
              </select>
            </div>
          ) : null}
        </div>
        {d.trigger.kind === "charge_upcoming" ? (
          <label className={c.check}><input type="checkbox" checked={!!d.trigger.firstOnly} onChange={(e) => setTrigger({ firstOnly: e.target.checked || undefined })} />{m.firstOnly}</label>
        ) : null}
      </div>

      <ol className={c.steps}>
        {d.steps.length === 0 ? <li className={c.hint}>{m.noSteps}</li> : null}
        <StepList list={d.steps} onChange={(steps) => patch({ steps })} s={shared} />
        <li>
          {adding ? (
            <div className={c.addMenu}>
              {STEP_TYPES.map((t) => <button key={t} type="button" className={c.dashed} onClick={() => addTop(t)}>{m.add[t]}</button>)}
            </div>
          ) : <button type="button" className={c.dashed} style={{ fontSize: 13, minHeight: 40, padding: "0 14px", borderRadius: 12 }} aria-expanded={adding} onClick={() => setAdding(true)}>{m.addStep}</button>}
        </li>
      </ol>

      <div className={c.exit}>
        <span><strong>{m.exitTitle}</strong> {exitSentence(er, { unsub: m.exitUnsub, cancel: m.exitCancel, goal: m.exitGoal, or: m.exitOr, never: m.exitNever }, EVENT_LABELS[locale])}</span>
        <label className={c.check}><input type="checkbox" checked={er.onUnsubscribe} onChange={(e) => patch({ exitRules: { ...er, onUnsubscribe: e.target.checked } })} />{m.exitUnsubLong}</label>
        <label className={c.check}><input type="checkbox" checked={er.onCancel} onChange={(e) => patch({ exitRules: { ...er, onCancel: e.target.checked } })} />{m.exitCancelLong}</label>
        <div className="field" style={{ maxWidth: 360 }}>
          <label htmlFor="au-g">{m.exitGoalPick}</label>
          <select id="au-g" className="input" value={er.goal?.kind ?? ""} onChange={(e) => patch({ exitRules: { ...er, goal: e.target.value ? { kind: e.target.value as EventKind } : null } })}>
            <option value="">{m.exitNoGoal}</option>
            {GOAL_KINDS.map((k) => <option key={k} value={k}>{EVENT_LABELS[locale][k]}</option>)}
          </select>
        </div>
      </div>
    </section>
  );
}

const clampInt = (v: string, min: number, max: number) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};

/** Lista de pasos (la principal o una rama sí / no, que solo lleva pasos simples). */
function StepList<T extends Step>({ list, onChange, s, leafOnly }: { list: T[]; onChange: (l: T[]) => void; s: Shared; leafOnly?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const name = (st: Step) => s.m.kinds[st.type];
  return (
    <>
      {list.map((st, i) => (
        <li key={st.id} className={c.step}>
          <div className={c.stepHead}>
            <span className={c.stepKind} style={{ background: STEP_TONE[st.type].bg, color: STEP_TONE[st.type].fg }}>{s.m.kinds[st.type]}</span>
            <button type="button" className={c.stepSum} aria-expanded={open === st.id} aria-label={fill(s.m.edit, { name: stepSummary(st, s.ctx) })} onClick={() => setOpen(open === st.id ? null : st.id)}>{stepSummary(st, s.ctx)}</button>
            <button type="button" className={c.iconBtn} aria-label={fill(s.m.up, { name: name(st) })} disabled={i === 0} onClick={() => onChange(move(list, i, -1))}>↑</button>
            <button type="button" className={c.iconBtn} aria-label={fill(s.m.down, { name: name(st) })} disabled={i === list.length - 1} onClick={() => onChange(move(list, i, 1))}>↓</button>
            <button type="button" className={c.iconBtn} aria-label={fill(s.m.remove, { name: name(st) })} onClick={() => onChange(list.filter((x) => x.id !== st.id))}><Icon name="x" size={16} /></button>
          </div>
          {open === st.id ? (
            <div className={c.stepBody}>
              <StepFields st={st} set={(x) => onChange(replaceStep(list as Step[], st.id, x) as T[])} s={s} />
              <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(null)}>{s.m.done}</button></div>
            </div>
          ) : null}
          {st.type === "condition" && !leafOnly ? <Branches st={st} set={(x) => onChange(list.map((y) => (y.id === st.id ? (x as T) : y)))} s={s} /> : null}
        </li>
      ))}
    </>
  );
}

function Branches({ st, set, s }: { st: ConditionStepT; set: (x: ConditionStepT) => void; s: Shared }) {
  const add = (which: "yes" | "no", type: LeafStepT["type"]) =>
    set({ ...st, [which]: [...st[which], newStep(type, s.allIds(), { heading: s.heading, tagId: s.ownTags[0]?.id ?? null }) as LeafStepT] });
  return (
    <div className={c.stepBody} style={{ gap: 12 }}>
      {(["yes", "no"] as const).map((w) => (
        <div key={w} className={c.branch}>
          <strong>{w === "yes" ? s.m.yes : s.m.no}</strong>
          {st[w].length ? <ol className={c.steps} style={{ paddingLeft: 0, borderLeft: 0 }}><StepList list={st[w]} onChange={(l) => set({ ...st, [w]: l })} s={s} leafOnly /></ol> : null}
          <div className={c.addMenu} aria-label={w === "yes" ? s.m.addToYes : s.m.addToNo} role="group">
            {LEAF_TYPES.map((t) => <button key={t} type="button" className={`${c.dashed} ${c.dashedSm}`} onClick={() => add(w, t)}>{s.m.add[t]}</button>)}
          </div>
        </div>
      ))}
    </div>
  );
}

function StepFields({ st, set, s }: { st: Step; set: (x: Step) => void; s: Shared }) {
  const { m } = s;
  const id = `st-${st.id}`;
  const [preview, setPreview] = useState(false);
  const tagSelect = (value: string, onValue: (v: string) => void, label: string) => s.ownTags.length === 0 ? <p className={c.hint}>{m.noOwnTags}</p> : (
    <div className="field">
      <label htmlFor={`${id}-tag`}>{label}</label>
      <select id={`${id}-tag`} className="input" value={value} onChange={(e) => onValue(e.target.value)}>
        <option value="" disabled>{m.pickTag}</option>
        {s.ownTags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </div>
  );
  switch (st.type) {
    case "wait":
      return (
        <>
          <label className={c.check}><input type="checkbox" checked={st.until === "charge"} onChange={(e) => set({ ...st, until: e.target.checked ? "charge" : undefined })} />{m.fUntilCharge}</label>
          {st.until !== "charge" ? (
            <div className={c.formGrid}>
              <div className="field"><label htmlFor={`${id}-d`}>{m.fDays}</label><input id={`${id}-d`} className="input num" type="number" min={0} max={365} value={st.days ?? 0} onChange={(e) => set({ ...st, days: clampInt(e.target.value, 0, 365) })} /></div>
              <div className="field"><label htmlFor={`${id}-h`}>{m.fHours}</label><input id={`${id}-h`} className="input num" type="number" min={0} max={23} value={st.hours ?? 0} onChange={(e) => set({ ...st, hours: clampInt(e.target.value, 0, 23) })} /></div>
            </div>
          ) : null}
        </>
      );
    case "email":
      return (
        <>
          <div className="field"><label htmlFor={`${id}-s`}>{m.fSubject}</label><input id={`${id}-s`} className="input" maxLength={200} value={st.subject} onChange={(e) => set({ ...st, subject: e.target.value })} /></div>
          <div className="field"><label htmlFor={`${id}-p`}>{m.fPreheader}</label><input id={`${id}-p`} className="input" maxLength={200} value={st.preheader} onChange={(e) => set({ ...st, preheader: e.target.value })} /></div>
          <div className="field"><span className="label">{m.fContent}</span>
            <BlocksEditor id={id} blocks={st.blocks} onChange={(blocks) => set({ ...st, blocks })} m={s.mc.blocks} lessons={s.lessons} appUrl={s.appUrl} /></div>
          <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => setPreview(true)}>{m.previewOpen}</button></div>
          <Modal open={preview} onClose={() => setPreview(false)} title={m.previewTitle} labelClose={m.close}>
            {preview ? <StepPreview mc={s.mc} subject={st.subject} preheader={st.preheader} blocks={st.blocks} /> : null}
          </Modal>
        </>
      );
    case "sms":
      return (
        <div className="field">
          <label htmlFor={`${id}-b`}>{m.fSms}</label>
          <textarea id={`${id}-b`} className={c.textarea} rows={3} maxLength={400} value={st.body} aria-describedby={`${id}-bh`} onChange={(e) => set({ ...st, body: e.target.value })} />
          <span id={`${id}-bh`} className="xs muted">{fill(m.smsHelp, { n: st.body.length })}</span>
        </div>
      );
    case "tag":
      return (
        <>
          {tagSelect(st.tagId, (tagId) => set({ ...st, tagId }), m.fTag)}
          <div className="field"><label htmlFor={`${id}-a`}>{m.fTagAction}</label>
            <select id={`${id}-a`} className="input" value={st.action} onChange={(e) => set({ ...st, action: e.target.value as "add" | "remove" })}>
              <option value="add">{m.tagAddOpt}</option><option value="remove">{m.tagRemoveOpt}</option>
            </select></div>
        </>
      );
    case "exit": return null;
    case "condition": {
      const ck = st.check;
      const setCheck = (check: Check) => set({ ...st, check });
      return (
        <>
          <div className="field"><label htmlFor={`${id}-c`}>{m.fCheck}</label>
            <select id={`${id}-c`} className="input" value={ck.type} onChange={(e) => {
              const t = e.target.value as Check["type"];
              setCheck(t === "event" ? { type: t, kind: "wizard_done", since: "ever" } : t === "stage" ? { type: t, stages: ["pagando"] } : t === "has_tag" ? { type: t, tagId: s.ownTags[0]?.id ?? "" } : { type: t });
            }}>
              {CHECK_TYPES.map((t) => <option key={t} value={t}>{m.checks[t]}</option>)}
            </select></div>
          {ck.type === "event" ? (
            <div className={c.formGrid}>
              <div className="field"><label htmlFor={`${id}-e`}>{m.fEvent}</label>
                <select id={`${id}-e`} className="input" value={ck.kind} onChange={(e) => setCheck({ ...ck, kind: e.target.value as EventKind })}>
                  {GOAL_KINDS.map((k) => <option key={k} value={k}>{s.ctx.events[k]}</option>)}
                </select></div>
              <div className="field"><label htmlFor={`${id}-w`}>{m.fSince}</label>
                <select id={`${id}-w`} className="input" value={ck.since} onChange={(e) => setCheck({ ...ck, since: e.target.value as "ever" | "enrolled" })}>
                  <option value="ever">{m.sinceEver}</option><option value="enrolled">{m.sinceEnrolled}</option>
                </select></div>
            </div>
          ) : null}
          {ck.type === "stage" ? (
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label">{m.fStages}</legend>
              {STAGE_KEYS.map((k) => (
                <label key={k} className={c.check}><input type="checkbox" checked={ck.stages.includes(k)} onChange={(e) => {
                  const next = e.target.checked ? [...ck.stages, k] : ck.stages.filter((x) => x !== k);
                  if (next.length) setCheck({ ...ck, stages: next });
                }} />{s.ctx.stages[k]}</label>
              ))}
            </fieldset>
          ) : null}
          {ck.type === "has_tag" ? tagSelect(ck.tagId, (tagId) => setCheck({ ...ck, tagId }), m.fTag) : null}
        </>
      );
    }
  }
}

function StepPreview({ mc, subject, preheader, blocks }: { mc: CampanasText; subject: string; preheader: string; blocks: Block[] }) {
  const p = usePreview({ subject, preheader, blocks });
  return <EmailPreview m={mc} data={p.data} loading={p.loading} empty={!blocks.length} headless />;
}
