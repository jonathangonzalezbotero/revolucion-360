"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { fill } from "@/i18n";
import type { AudiencePreset, Block } from "@/lib/crm/schema";
import { Empty } from "@/components/ui/basics";
import { Modal, useToast } from "@/components/ui/client";
import css from "../_shared/admin.module.css";
import { AdminHeader } from "../_shared/ui";
import c from "../crm/crm.module.css";
import { PRESET_KEYS, shortDay } from "../crm/lib";
import { audienceCount, cancelSend, confirmSend, saveDraft, sendTest } from "./actions";
import { BlocksEditor, type LessonOption } from "./BlocksEditor";
import { EmailPreview, usePreview } from "./EmailPreview";
import type { CampanasText } from "./messages";

export type CampaignListRow = { id: string; name: string; status: string; audience: string; opened: string; clicked: string };
export type CampaignDraftView = {
  id: string | null; name: string; status: "draft" | "scheduled" | "sending" | "sent" | "cancelled";
  subject: string; preheader: string; preset: AudiencePreset; blocks: Block[]; sendMode: "now" | "local"; scheduledLocal: string | null;
};
type R<T> = { ok: true; data: T } | { ok: false; error: string };

export function CampaignsView({ m, locale, rows, draft, count: initialCount, lessons, legalReady, appUrl, selected }: {
  m: CampanasText; locale: "es" | "en"; rows: CampaignListRow[]; draft: CampaignDraftView; count: number; lessons: LessonOption[]; legalReady: boolean; appUrl: string; selected: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [doing, setDoing] = useState<"save" | "test" | "confirm" | "cancel" | null>(null);
  const busy = pending && doing !== null;
  const [d, setD] = useState(draft);
  const [count, setCount] = useState<number | null>(initialCount);
  const [error, setError] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const countSeq = useRef(0);
  const editable = d.status === "draft";
  const preview = usePreview({ subject: d.subject, preheader: d.preheader, blocks: d.blocks });

  const patch = (p: Partial<CampaignDraftView>) => { setError(null); setTestMsg(null); setD((x) => ({ ...x, ...p })); };
  // Contar no bloquea los botones (va aparte de las acciones que escriben).
  const setPreset = async (preset: AudiencePreset) => {
    patch({ preset });
    setCount(null);
    const n = ++countSeq.current;
    const r = await audienceCount(preset);
    if (n !== countSeq.current) return;
    setCount(r.ok ? r.data : null);
    if (!r.ok) setError(r.error);
  };
  const payload = (id: string | null = d.id) => ({ id, subject: d.subject, preheader: d.preheader, preset: d.preset, blocks: d.blocks, sendMode: d.sendMode, scheduledLocal: d.scheduledLocal });
  const act = <T,>(kind: NonNullable<typeof doing>, fn: () => Promise<R<T>>, onOk: (data: T) => void) => {
    setDoing(kind);
    start(async () => {
      setError(null);
      const r = await fn();
      setDoing(null);
      if (!r.ok) { setError(r.error); toast(r.error); return; }
      onOk(r.data);
    });
  };
  const goTo = (id: string) => { router.replace(`/admin/campanas?c=${id}`); router.refresh(); };

  const save = () => act("save", () => saveDraft(payload()), (id) => { toast(m.saved); if (id !== d.id) goTo(id); else router.refresh(); });
  const test = () => act("test", () => sendTest({ campaignId: d.id, subject: d.subject, preheader: d.preheader, blocks: d.blocks }), (r) => {
    const text = r.status === "sent" ? fill(m.testSent, { email: r.email }) : r.status === "skipped" ? m.testSkipped : m.testFailed;
    setTestMsg({ ok: r.status === "sent", text });
  });
  const missing = !d.subject.trim() ? m.missingSubject : !d.blocks.length ? m.missingContent : d.sendMode === "local" && !d.scheduledLocal ? m.missingDate : null;
  const openConfirm = () => { if (missing) { setError(missing); return; } setError(null); setConfirming(true); };
  /**
   * Guarda lo que está en pantalla y luego confirma. El id se guarda apenas existe: si la confirmación falla (p. ej. la
   * hora ya pasó), el siguiente intento actualiza esa misma campaña en vez de crear otra.
   */
  const confirm = () => act("confirm", async (): Promise<R<string>> => {
    const saved = await saveDraft(payload());
    if (!saved.ok) return saved;
    const id = saved.data;
    if (id !== d.id) setD((x) => ({ ...x, id }));
    const r = await confirmSend({ id, preset: d.preset });
    return r.ok ? { ok: true, data: id } : r;
  }, (id) => {
    setConfirming(false);
    toast(d.sendMode === "now" ? m.confirmedNow : m.confirmedLater);
    goTo(id);
  });
  const cancel = () => act("cancel", () => cancelSend(d.id), () => { toast(m.cancelled); router.refresh(); });

  const whenText = d.scheduledLocal ? `${shortDay(d.scheduledLocal.slice(0, 10), locale)} ${d.scheduledLocal.slice(11)}` : "";
  const title = !d.id ? m.newTitle : fill(editable ? m.editTitle : m.viewTitle, { name: d.name || d.subject || m.noSubject });
  const roNote = d.status === "sent" || d.status === "cancelled" ? m.readOnlySent : d.status === "scheduled" ? m.readOnlyScheduled : d.status === "sending" ? m.readOnlySending : null;

  return (
    <>
      <AdminHeader eyebrow={m.eyebrow} title={m.title}>
        <Link href="/admin/campanas?c=nueva" className="btn">{m.newCampaign}</Link>
      </AdminHeader>

      <section aria-labelledby="cl" className={c.box} style={{ gap: 10 }}>
        <h2 id="cl">{m.listTitle}</h2>
        {rows.length === 0 ? (
          <Empty image="/ilustraciones/vacio-analisis.webp" title={m.empty} text={m.emptySub} />
        ) : (
          <div className="table-scroll">
            <table className={c.list} style={{ minWidth: 640 }}>
              <thead><tr><th scope="col">{m.colName}</th><th scope="col">{m.colStatus}</th><th scope="col">{m.colAudience}</th><th scope="col" style={{ textAlign: "right" }}>{m.colOpened}</th><th scope="col" style={{ textAlign: "right" }}>{m.colClicked}</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} data-row aria-selected={r.id === selected} onClick={() => router.push(`/admin/campanas?c=${r.id}`)}>
                    <td><Link href={`/admin/campanas?c=${r.id}`} className={c.rowLink} onClick={(e) => e.stopPropagation()}>{r.name}</Link></td>
                    <td className="muted">{r.status}</td>
                    <td>{r.audience}</td>
                    <td className="num" style={{ textAlign: "right" }}>{r.opened}</td>
                    <td className="num" style={{ textAlign: "right" }}>{r.clicked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className={c.editorGrid}>
        <section aria-labelledby="ed" className={c.editor}>
          <h2 id="ed">{title}</h2>
          {roNote ? <div className="banner banner-info" role="status">{roNote}</div> : null}
          {!legalReady && editable ? (
            <div className="banner" role="alert"><span>{m.legalBlock}</span><Link href="/admin/paises" className="btn btn-secondary btn-sm">{m.legalLink}</Link></div>
          ) : null}
          <div className="field">
            <label htmlFor="cs">{m.subject}</label>
            <input id="cs" className="input" style={{ height: 46 }} maxLength={200} value={d.subject} disabled={!editable} onChange={(e) => patch({ subject: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="cpr">{m.preheader}</label>
            <input id="cpr" className="input" style={{ height: 46 }} maxLength={200} value={d.preheader} disabled={!editable} onChange={(e) => patch({ preheader: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="ca">{m.audience}</label>
            <select id="ca" className="input" style={{ height: 46 }} value={d.preset} disabled={!editable} onChange={(e) => setPreset(e.target.value as AudiencePreset)}>
              {PRESET_KEYS.map((k) => <option key={k} value={k}>{m.presets[k]}</option>)}
            </select>
            <span className="num xs muted" role="status">{count === null ? m.counting : fill(count === 1 ? m.audienceCountOne : m.audienceCount, { n: count.toLocaleString("en-AU") })}</span>
          </div>
          <div className="field">
            <span className="label">{m.content}</span>
            <BlocksEditor id="cb" blocks={d.blocks} onChange={(blocks) => patch({ blocks })} m={m.blocks} lessons={lessons} appUrl={appUrl} disabled={!editable} />
          </div>
          {editable ? (
            <>
              <div role="radiogroup" aria-label={m.whenLabel} className={c.when}>
                {(["now", "local"] as const).map((w) => (
                  <button key={w} type="button" role="radio" aria-checked={d.sendMode === w} onClick={() => patch({ sendMode: w })}>{w === "now" ? m.now : m.later}</button>
                ))}
              </div>
              {d.sendMode === "local" ? (
                <div className="field">
                  <label htmlFor="cw">{m.scheduleLabel}</label>
                  <input id="cw" type="datetime-local" className="input" style={{ height: 46 }} value={d.scheduledLocal ?? ""} aria-describedby="cw-h" onChange={(e) => patch({ scheduledLocal: e.target.value.slice(0, 16) || null })} />
                  <span id="cw-h" className="xs muted">{m.scheduleHelp}</span>
                </div>
              ) : null}
            </>
          ) : null}
          {testMsg ? <p role="status" className={testMsg.ok ? css.ok : css.err}>{testMsg.text}</p> : null}
          {error ? <p role="alert" className={css.err}>{error}</p> : null}
          <div className={c.actionsEnd}>
            {editable ? (
              <>
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={save}>{busy && doing === "save" ? m.saving : m.saveDraft}</button>
                <button type="button" className="btn btn-secondary" disabled={busy || !d.subject.trim() || !d.blocks.length} onClick={test}>{busy && doing === "test" ? m.testing : m.test}</button>
                <button type="button" className="btn" disabled={busy || !legalReady} onClick={openConfirm}>{m.confirm}</button>
              </>
            ) : d.status === "scheduled" || d.status === "sending" ? (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={cancel}>{m.cancelSend}</button>
            ) : null}
          </div>
        </section>
        <EmailPreview m={m} data={preview.data} loading={preview.loading} empty={!d.blocks.length} />
      </div>

      <Modal open={confirming} onClose={() => setConfirming(false)} title={m.confirmTitle} labelClose={m.close}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{count === null ? m.counting : count === 1 ? m.confirmToOne : fill(m.confirmTo, { n: count.toLocaleString("en-AU") })}</p>
        <p className="small muted" style={{ margin: 0 }}>{m.confirmOnly}</p>
        <p className="small" style={{ margin: 0 }}>{d.sendMode === "now" ? m.confirmNow : fill(m.confirmLater, { when: whenText })}</p>
        {error ? <p role="alert" className={css.err}>{error}</p> : null}
        <div className={c.actionsEnd}>
          <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>{m.cancel}</button>
          <button type="button" className="btn" disabled={busy || !legalReady} onClick={confirm}>{busy && doing === "confirm" ? m.confirming : d.sendMode === "now" ? m.confirmGo : m.confirmGoLater}</button>
        </div>
      </Modal>
    </>
  );
}
