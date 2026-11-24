"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fill } from "@/i18n";
import { Empty, Pill } from "@/components/ui/basics";
import { ConfirmButton, Modal, Switch, useToast } from "@/components/ui/client";
import { Icon } from "@/components/ui/Icon";
import css from "../_shared/admin.module.css";
import { ConfirmEmail } from "../_shared/ConfirmEmail";
import type { AdminText } from "../_shared/messages";
import { deleteAccount, deleteFaq, markExportDone, moveFaq, replyTicket, saveFaq, setFaqPublished, setTicketStatus } from "./actions";
import type { SupportText } from "./messages";

type R = { ok: true } | { ok: false; error: string };
function useAct() {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const act = (fn: () => Promise<R>, okText: string, after?: () => void) =>
    new Promise<string | null>((resolve) => start(async () => {
      const r = await fn();
      if (!r.ok) { toast(r.error); return resolve(r.error); }
      if (okText) toast(okText);
      after?.(); router.refresh(); resolve(null);
    }));
  return { act, busy };
}

export function CaseActions({ m, ticketId, status }: { m: SupportText; ticketId: string; status: string }) {
  const { act, busy } = useAct();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    setError(null);
    if (!body.trim()) return setError(m.errReply);
    const e = await act(() => replyTicket({ ticketId, body }), m.replied, () => setBody(""));
    if (e) setError(e);
  };
  return (
    <div className="stack" style={{ gap: 10, borderTop: "1px solid var(--linea-2)", paddingTop: 14 }}>
      <label htmlFor="reply" style={{ fontSize: 13, fontWeight: 600 }}>{m.reply}</label>
      <textarea id="reply" rows={4} className="textarea" value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} />
      {error ? <p role="alert" className={css.err}>{error}</p> : null}
      <div className="row wrap" style={{ gap: 10, justifyContent: "space-between" }}>
        {status === "closed"
          ? <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => act(() => setTicketStatus({ ticketId, status: "open" }), m.reopened)}>{m.reopen}</button>
          : <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => act(() => setTicketStatus({ ticketId, status: "closed" }), m.closed)}>{m.close}</button>}
        <button type="button" className="btn" disabled={busy} onClick={send}>{m.replyBtn}</button>
      </div>
    </div>
  );
}

export function PrivacyActions({ t, m, requestId, kind, userId, email, self }: { t: AdminText; m: SupportText; requestId: string; kind: string; userId: string; email: string; self: boolean }) {
  const { act, busy } = useAct();
  const [open, setOpen] = useState(false);
  if (kind === "export") return <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act(() => markExportDone({ requestId }), m.markedDone)}>{m.markDone}</button>;
  if (self) return null;
  return (
    <>
      <button type="button" className={`btn btn-danger btn-sm ${css.btnDanger}`} onClick={() => setOpen(true)}>{m.completeDelete}</button>
      <span style={{ textAlign: "left" }}>
        <ConfirmEmail open={open} onClose={() => setOpen(false)} title={m.delTitle} help={m.delHelp} email={email} label={m.typeEmail} button={m.delBtn} confirmButton={m.delConfirm} closeLabel={t.cancel} danger
          onConfirm={(typed) => act(() => deleteAccount({ userId, email: typed }), m.deleted)} />
      </span>
    </>
  );
}

type Faq = { id: string; topic: string; question: string; answer: string; locale: string; sort: number; published: boolean };
type Draft = { id: string | null; topic: string; question: string; answer: string; locale: "es" | "en" };

export function FaqManager({ t, m, locale, faqs }: { t: AdminText; m: SupportText; locale: string; faqs: Faq[] }) {
  const { act, busy } = useAct();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const blank: Draft = { id: null, topic: "general", question: "", answer: "", locale: locale === "en" ? "en" : "es" };
  const save = async () => {
    if (!draft) return;
    setError(null);
    const e = await act(() => saveFaq(draft), m.faqSaved, () => setDraft(null));
    if (e) setError(e);
  };
  const byLocale = ["es", "en"].map((l) => ({ l, list: faqs.filter((f) => f.locale === l) })).filter((g) => g.list.length);
  return (
    <section aria-labelledby="faq" className={css.section}>
      <div className="row-between wrap">
        <div><h2 id="faq">{m.faq}</h2><span className="xs muted">{m.faqSub}</span></div>
        <button type="button" className="btn btn-dashed" onClick={() => { setError(null); setDraft(blank); }}>{m.newFaq}</button>
      </div>
      {faqs.length === 0 ? <Empty icon="help" title={m.faqEmpty} text={m.faqEmptySub} /> : byLocale.map((g) => (
        <div key={g.l} className="stack" style={{ gap: 0 }}>
          <span className="eyebrow" style={{ padding: "8px 0" }}>{m.locales[g.l]}</span>
          {g.list.map((f, i) => (
            <div key={f.id} className="row-between wrap" style={{ borderTop: "1px solid var(--linea-2)", padding: "12px 0", alignItems: "flex-start" }}>
              <span className="stack" style={{ gap: 4, flex: "1 1 320px", minWidth: 0 }}>
                <strong style={{ fontSize: 14 }}>{f.question}</strong>
                <span className="xs muted" style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{f.answer}</span>
                <span className="row" style={{ gap: 6 }}><Pill>{f.topic}</Pill><Pill tone={f.published ? "ok" : "neutral"}>{f.published ? m.published : m.hidden}</Pill></span>
              </span>
              <span className="row" style={{ gap: 4 }}>
                <Switch checked={f.published} disabled={busy} label={fill(m.publish, { q: f.question })} onChange={(v) => act(() => setFaqPublished({ id: f.id, published: v }), "")} />
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy || i === 0} aria-label={fill(m.up, { q: f.question })} onClick={() => act(() => moveFaq({ id: f.id, dir: "up" }), "")} style={{ width: 40, padding: 0 }}><span aria-hidden="true">↑</span></button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy || i === g.list.length - 1} aria-label={fill(m.down, { q: f.question })} onClick={() => act(() => moveFaq({ id: f.id, dir: "down" }), "")} style={{ width: 40, padding: 0 }}><span aria-hidden="true">↓</span></button>
                <button type="button" className="btn btn-ghost btn-sm" aria-label={`${m.edit}: ${f.question}`} onClick={() => { setError(null); setDraft({ id: f.id, topic: f.topic, question: f.question, answer: f.answer, locale: f.locale === "en" ? "en" : "es" }); }} style={{ width: 40, padding: 0 }}><Icon name="edit" size={16} /></button>
                <ConfirmButton className="btn btn-ghost btn-sm" label={<Icon name="trash" size={16} />} confirmLabel={m.delFaqConfirm} ariaLabel={`${m.del}: ${f.question}`} confirmAriaLabel={m.delFaqConfirm}
                  onConfirm={() => act(() => deleteFaq({ id: f.id }), m.faqDeleted).then(() => undefined)} />
              </span>
            </div>
          ))}
        </div>
      ))}
      <Modal open={draft !== null} onClose={() => setDraft(null)} title={draft?.id ? m.editFaq : m.newFaqTitle} labelClose={t.close}>
        {draft ? (
          <>
            <div className={css.grid2}>
              <div className="field"><label htmlFor="fq-t">{m.faqTopic}</label><input id="fq-t" className="input" value={draft.topic} maxLength={40} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} /></div>
              <div className="field"><label htmlFor="fq-l">{m.faqLocale}</label>
                <select id="fq-l" className="input" value={draft.locale} onChange={(e) => setDraft({ ...draft, locale: e.target.value === "en" ? "en" : "es" })}>
                  <option value="es">{m.locales.es}</option><option value="en">{m.locales.en}</option>
                </select>
              </div>
            </div>
            <div className="field"><label htmlFor="fq-q">{m.faqQuestion}</label><input id="fq-q" className="input" value={draft.question} maxLength={300} onChange={(e) => setDraft({ ...draft, question: e.target.value })} /></div>
            <div className="field"><label htmlFor="fq-a">{m.faqAnswer}</label><textarea id="fq-a" rows={5} className="textarea" value={draft.answer} maxLength={4000} onChange={(e) => setDraft({ ...draft, answer: e.target.value })} /></div>
            {draft.id ? null : <span className="xs muted">{m.faqNewHidden}</span>}
            {error ? <p role="alert" className={css.err}>{error}</p> : null}
            <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setDraft(null)}>{t.cancel}</button>
              <button type="button" className="btn" disabled={busy} onClick={save}>{busy ? t.saving : m.saveFaq}</button>
            </div>
          </>
        ) : null}
      </Modal>
    </section>
  );
}
