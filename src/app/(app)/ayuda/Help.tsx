"use client";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { fill } from "@/i18n";
import { Empty } from "@/components/ui/basics";
import { Modal, useToast } from "@/components/ui/client";
import { ReplayTourButton } from "@/components/shell/Tour";
import { createTicket, replyTicket } from "./actions";
import { browserLabel, buildTech, searchFaqs, TECH_KEYS, TOPICS, type Tech, type Topic } from "./lib";
import type { AyudaMessages } from "./messages";
import css from "./ayuda.module.css";

export type TicketView = {
  id: string; code: string; topic: Topic; subject: string; status: "open" | "answered" | "closed"; updated: string;
  messages: { id: string; body: string; fromAdmin: boolean; when: string }[];
};
type Faq = { id: string; topic: string; question: string; answer: string };
type Props = { m: AyudaMessages; faqs: Faq[]; tickets: TicketView[]; server: { appLanguage: string; plan: string; country: string; version: string }; course: { title: string; lessons: number } | null; tour: boolean };

const STATUS_PILL = { open: "pill-warn", answered: "pill-ok", closed: "" } as const;

// Datos del navegador: solo existen en el cliente (en el servidor quedan vacíos).
const noop = () => () => {};
const clientInfo = () => `${browserLabel(navigator.userAgent)}|${window.screen.width}×${window.screen.height}|${navigator.language}`;
const useClientInfo = () => useSyncExternalStore(noop, clientInfo, () => "||");

export function Help({ m, faqs, tickets, server, course, tour }: Props) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [topic, setTopic] = useState<string>("all");
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [form, setForm] = useState(false);
  const [f, setF] = useState({ topic: "problem" as Topic, message: "", withTech: true });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [caseId, setCaseId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [replyError, setReplyError] = useState("");
  const [pending, start] = useTransition();

  const info = useClientInfo();
  // Lo mismo que se guarda: pasa por la misma lista blanca que usa el servidor.
  const tech: Tech = useMemo(() => {
    const [browser, screen, language] = info.split("|");
    return buildTech({ browser, screen, language, ...server });
  }, [info, server]);
  const topics = useMemo(() => [...new Set(faqs.map((x) => x.topic))], [faqs]);
  const shown = searchFaqs(faqs, q, topic);
  const current = tickets.find((t) => t.id === caseId) ?? null;

  const send = () => {
    setError("");
    if (!f.message.trim()) return setError(m.missing);
    start(async () => {
      const r = await createTicket({ topic: f.topic, message: f.message, withTech: f.withTech, tech: { browser: tech.browser, screen: tech.screen, language: tech.language } });
      if (!r.ok) return setError(r.error);
      setF({ topic: "problem", message: "", withTech: true });
      setForm(false);
      setSent(true);
    });
  };
  const sendReply = () => {
    if (!current) return;
    setReplyError("");
    if (!reply.trim()) return setReplyError(m.missing);
    start(async () => {
      const r = await replyTicket({ ticketId: current.id, message: reply });
      if (!r.ok) return setReplyError(r.error);
      setReply("");
      toast(m.replySent);
    });
  };

  return (
    <main className="page">
      <header className="page-header">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="muted" style={{ fontSize: 14 }}><span className="only-desktop">{m.eyebrow}</span><span className="only-mobile">{m.eyebrowShort}</span></span>
          <h1>{m.title}</h1>
        </div>
      </header>

      <div>
        <label htmlFor="help-q" className="sr-only">{m.search}</label>
        <input id="help-q" type="search" className={css.search} value={q} onChange={(e) => { setQ(e.target.value); setOpenFaq(null); }} placeholder={m.searchPh} />
      </div>

      {form ? (
        <section aria-labelledby="help-form" className="form-open" style={{ padding: "24px 26px", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <h2 id="help-form" style={{ fontSize: 20 }}>{m.formTitle}</h2>
            <span className="small muted" style={{ lineHeight: 1.5 }}>{m.formSub}</span>
          </div>
          <div className="field">
            <label htmlFor="help-topic">{m.topic}</label>
            <select id="help-topic" className="input" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value as Topic })}>
              {TOPICS.map((t) => <option key={t} value={t}>{m.ticketTopics[t]}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="help-msg">{m.message}</label>
            <textarea id="help-msg" className="textarea" rows={5} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} placeholder={m.messagePh} maxLength={5000} />
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <button type="button" role="checkbox" aria-checked={f.withTech} aria-labelledby="help-tech" className={css.check} onClick={() => setF({ ...f, withTech: !f.withTech })}>{f.withTech ? "✓" : ""}</button>
            <span id="help-tech" style={{ fontSize: 13, color: "var(--tinta-2)", lineHeight: 1.5 }}>{m.tech1} <strong>{m.tech2}</strong> {m.tech3}</span>
          </div>
          {f.withTech ? (
            <div className={css.techBox}>
              <span className="xs muted">{m.techShows}</span>
              <dl className={css.tech}>
                {TECH_KEYS.filter((k) => tech[k]).map((k) => (
                  <div key={k}><dt>{m.techLabels[k]}</dt><dd className="num">{tech[k]}</dd></div>
                ))}
              </dl>
            </div>
          ) : null}
          {error ? <p role="alert" className={css.alert}>{error}</p> : null}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-secondary" onClick={() => { setForm(false); setError(""); }}>{m.cancel}</button>
            <button type="button" className="btn" disabled={pending} onClick={send}>{pending ? m.sending : m.send}</button>
          </div>
        </section>
      ) : null}

      <div className={css.grid}>
        <section aria-labelledby="help-faq" className="stack">
          <h2 id="help-faq" style={{ fontSize: 17 }}>{m.faqTitle}</h2>
          {faqs.length === 0 ? (
            <Empty icon="help" title={m.noFaqs} text={m.noFaqsSub}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setForm(true); setSent(false); }}>{m.write}</button>
            </Empty>
          ) : (
            <>
              {topics.length > 1 ? (
                <div role="radiogroup" aria-labelledby="help-faq" className={css.chips}>
                  {["all", ...topics].map((t) => (
                    <button key={t} type="button" role="radio" aria-checked={topic === t} className={css.chip} onClick={() => { setTopic(t); setOpenFaq(null); }}>{t === "all" ? m.all : m.topics[t] ?? t}</button>
                  ))}
                </div>
              ) : null}
              <div className={css.faqs}>
                {shown.map((x) => {
                  const on = openFaq === x.id;
                  return (
                    <div key={x.id} className={css.faq}>
                      <button type="button" aria-expanded={on} aria-controls={`faq-${x.id}`} className={css.faqBtn} onClick={() => setOpenFaq(on ? null : x.id)}>
                        <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          <span className={css.faqTopic}>{m.topics[x.topic] ?? x.topic}</span>
                          <span style={{ fontSize: 15, fontWeight: 600 }}>{x.question}</span>
                        </span>
                        <span aria-hidden="true" className={css.sign}>{on ? "–" : "+"}</span>
                      </button>
                      {on ? <p id={`faq-${x.id}`} className={css.answer}>{x.answer}</p> : null}
                    </div>
                  );
                })}
                {shown.length === 0 ? <p className={css.none}>{m.none}</p> : null}
              </div>
            </>
          )}
        </section>

        <div className="stack" style={{ gap: 16 }}>
          <section className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={{ fontSize: 17 }}>{m.notFound}</h2>
            <p style={{ fontSize: 14, color: "var(--tinta-2)", lineHeight: 1.5 }}>{m.notFoundSub}</p>
            <button type="button" className="btn" aria-expanded={form} style={{ alignSelf: "flex-start", minHeight: 46 }} onClick={() => { setForm(!form); setSent(false); setError(""); }}>{m.write}</button>
            {sent ? <p role="status" className={css.sent}>{m.sent}</p> : null}
            <h3 style={{ fontSize: 14, marginTop: 8 }}>{m.cases}</h3>
            {tickets.length === 0 ? <p className="small muted">{m.noCases}</p> : (
              <ul className={css.cases}>
                {tickets.map((t) => (
                  <li key={t.id}>
                    <button type="button" className={css.caseBtn} aria-label={fill(m.openCase, { code: t.code })} onClick={() => { setCaseId(t.id); setReply(""); setReplyError(""); }}>
                      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                        <span className={css.caseTitle}>{t.subject}</span>
                        <span className="xs muted">{t.code} · {t.updated}</span>
                      </span>
                      <span className={`pill ${STATUS_PILL[t.status]}`}>{m.status[t.status]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {course ? (
            <Link href="/academia" className={css.academy}>
              <span className="xs muted" style={{ fontWeight: 600 }}>{m.academy}</span>
              <strong style={{ fontSize: 16 }}>{fill(course.lessons === 1 ? m.courseOne : m.course, { title: course.title, n: course.lessons })}</strong>
              <span className={css.mark}>{m.seeLessons}</span>
            </Link>
          ) : null}
          {tour ? <ReplayTourButton label={m.tourAgain} /> : null}
        </div>
      </div>

      <Modal open={!!current} onClose={() => setCaseId(null)} title={current ? `${current.code} · ${m.ticketTopics[current.topic]}` : ""} labelClose={m.cancel}>
        {current ? (
          <div className="stack" style={{ gap: 14 }}>
            <strong style={{ fontSize: 15 }}>{current.subject} <span className={`pill ${STATUS_PILL[current.status]}`} style={{ marginLeft: 6 }}>{m.status[current.status]}</span></strong>
            <ol className={css.thread}>
              {current.messages.map((x) => (
                <li key={x.id} data-admin={x.fromAdmin || undefined}>
                  <span className="xs muted" style={{ fontWeight: 600 }}>{x.fromAdmin ? m.support : m.you} · {x.when}</span>
                  <p>{x.body}</p>
                </li>
              ))}
            </ol>
            {current.status === "closed" ? <p className="xs muted">{m.closedNote}</p> : null}
            <div className="field">
              <label htmlFor="help-reply">{m.reply}</label>
              <textarea id="help-reply" className="textarea" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={m.replyPh} maxLength={5000} />
            </div>
            {replyError ? <p role="alert" className={css.alert}>{replyError}</p> : null}
            <button type="button" className="btn" disabled={pending} style={{ alignSelf: "flex-end" }} onClick={sendReply}>{pending ? m.sending : m.reply}</button>
          </div>
        ) : null}
      </Modal>
    </main>
  );
}
