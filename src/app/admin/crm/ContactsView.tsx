"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { fill } from "@/i18n";
import { Empty } from "@/components/ui/basics";
import { ConfirmButton, Modal, useToast } from "@/components/ui/client";
import { Icon } from "@/components/ui/Icon";
import css from "../_shared/admin.module.css";
import { listHref } from "../_shared/lib";
import type { AdminText } from "../_shared/messages";
import { AdminHeader, Pager } from "../_shared/ui";
import { addContact, emailContact, enrollInAutomation, importBatch, tagContact, unsubscribeContact, untagContact } from "./actions";
import c from "./crm.module.css";
import { chunks, parseContactsCsv, type ImportParse, type ImportRow } from "./lib";
import type { CrmText } from "./messages";

export type TagView = { id: string | null; name: string; bg: string; fg: string };
export type ContactRowView = { id: string; href: string; name: string; email: string; src: string; tags: TagView[]; last: string };
export type ContactPanel = {
  id: string; name: string; email: string; initial: string; tags: TagView[]; src: string; consent: boolean; cons: string;
  sms: string | null; phone: string | null; country: string | null; tl: { d: string; t: string }[]; autos: { name: string; status: string }[];
};
type R<T> = { ok: true; data: T } | { ok: false; error: string };
type Opt = { id: string; name: string };

export function ContactsView({ m, t, summary, rows, total, panel, filters, q, f, page, pages, ownTags, automations, countries, filtered, signature }: {
  m: CrmText; t: AdminText;
  summary: { contacts: number; newWeek: number; leadsNoAccount: number; marketingPct: number; unsubscribed30d: number };
  rows: ContactRowView[]; total: number; panel: ContactPanel | null;
  filters: { key: string; name: string; href: string; current: boolean }[];
  q: string; f: string; page: number; pages: number; ownTags: Opt[]; automations: Opt[]; countries: { code: string; name: string }[]; filtered: boolean; signature: string;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<null | "new" | "import" | "email" | "auto">(null);
  const close = () => setModal(null);
  const fmt = (n: number) => n.toLocaleString("en-AU");

  return (
    <>
      <AdminHeader eyebrow={m.eyebrow} title={m.title}>
        <button type="button" className="btn btn-secondary" style={{ minHeight: 46 }} onClick={() => setModal("import")}>{m.importCsv}</button>
        <button type="button" className="btn" style={{ minHeight: 46 }} onClick={() => setModal("new")}>{m.addContact}</button>
      </AdminHeader>

      <div className={c.cards}>
        <div className={c.card}><span>{m.cards.contacts}</span><span className={`num big ${c.cardNum}`}>{fmt(summary.contacts)}</span><span>{fill(m.cards.newWeek, { n: fmt(summary.newWeek) })}</span></div>
        <div className={c.card}><span>{m.cards.leads}</span><span className={`num big ${c.cardNum}`}>{fmt(summary.leadsNoAccount)}</span><span>{m.cards.leadsSub}</span></div>
        <div className={c.card}><span>{m.cards.marketing}</span><span className={`num big ${c.cardNum}`}>{summary.marketingPct}%</span><span>{m.cards.marketingSub}</span></div>
        <div className={c.card}><span>{m.cards.unsub}</span><span className={`num big ${c.cardNum}`}>{fmt(summary.unsubscribed30d)}</span><span>{m.cards.unsubSub}</span></div>
      </div>

      <div className={c.split}>
        <section aria-label={m.listLabel} className={c.box}>
          <SearchBox m={m} q={q} f={f} total={total} />
          <div className={c.chips} aria-label={m.filterLabel} role="navigation">
            {filters.map((x) => <Link key={x.key || "all"} href={x.href} className={c.chip} aria-current={x.current ? "true" : undefined}>{x.name}</Link>)}
          </div>
          {rows.length === 0 ? (
            filtered ? <Empty icon="search" title={m.noMatch} text={m.noMatchSub} /> : (
              <Empty image="/ilustraciones/vacio-cuentas.webp" title={m.empty} text={m.emptySub}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModal("import")}>{m.importCsv}</button>
              </Empty>
            )
          ) : (
            <div className="table-scroll">
              <table className={c.list} style={{ minWidth: 560 }}>
                <thead><tr><th scope="col">{m.colContact}</th><th scope="col">{m.colTags}</th><th scope="col">{m.colSource}</th><th scope="col">{m.colLast}</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} data-row aria-selected={panel?.id === r.id} onClick={() => router.push(r.href, { scroll: false })}>
                      <td><span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <Link href={r.href} scroll={false} className={c.rowLink} onClick={(e) => e.stopPropagation()}>{r.name}</Link>
                        <span className={c.mail}>{r.email}</span>
                      </span></td>
                      <td><Tags tags={r.tags} /></td>
                      <td style={{ color: "var(--tinta-2)" }}>{r.src}</td>
                      <td className="muted">{r.last}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager t={t} page={page} pages={pages} href={(p) => listHref("/admin/crm", { q, f, p })} />
        </section>

        {panel ? (
          <Ficha key={panel.id} m={m} p={panel} ownTags={ownTags} onEmail={() => setModal("email")} onAuto={() => setModal("auto")} />
        ) : (
          <aside className={c.ficha}><Empty icon="user" title={m.pickContact} text={m.pickContactSub} /></aside>
        )}
      </div>

      <Modal open={modal === "new"} onClose={close} title={m.newTitle} labelClose={m.close}>
        <NewContact m={m} countries={countries} onDone={close} />
      </Modal>
      <Modal open={modal === "import"} onClose={close} title={m.impTitle} labelClose={m.close}>
        <ImportCsv m={m} onDone={close} />
      </Modal>
      {panel ? (
        <>
          <Modal open={modal === "email"} onClose={close} title={fill(m.mailTitle, { name: panel.name })} labelClose={m.close}>
            <QuickEmail m={m} contactId={panel.id} signature={signature} onDone={close} />
          </Modal>
          <Modal open={modal === "auto"} onClose={close} title={m.autoTitle} labelClose={m.close}>
            <Enroll m={m} contactId={panel.id} automations={automations} onDone={close} />
          </Modal>
        </>
      ) : null}
    </>
  );
}

function Tags({ tags, onRemove, removeLabel }: { tags: TagView[]; onRemove?: (id: string) => void; removeLabel?: string }) {
  return (
    <span className={c.tags}>
      {tags.map((tg) => (
        <span key={tg.id ?? tg.name} className={c.tag} style={{ background: tg.bg, color: tg.fg }}>
          {tg.name}
          {onRemove && tg.id ? <button type="button" className={c.tagX} aria-label={fill(removeLabel ?? "", { name: tg.name })} onClick={() => onRemove(tg.id!)}><Icon name="x" size={12} /></button> : null}
        </span>
      ))}
    </span>
  );
}

/** Buscar por nombre o correo: la lista vive en la dirección (se actualiza al dejar de escribir). */
function SearchBox({ m, q, f, total }: { m: CrmText; q: string; f: string; total: number }) {
  const router = useRouter();
  const [v, setV] = useState(q);
  useEffect(() => {
    if (v.trim() === q) return; // sin cambios: no tocar la dirección (conserva página y ficha)
    const tm = setTimeout(() => router.replace(listHref("/admin/crm", { q: v.trim(), f }), { scroll: false }), 350);
    return () => clearTimeout(tm);
  }, [v, q, f, router]);
  return (
    <div className={c.search}>
      <label htmlFor="cq" className={c.srOnly}>{m.search}</label>
      <input id="cq" type="search" className="input" value={v} maxLength={80} placeholder={m.searchPh} onChange={(e) => setV(e.target.value)} />
      <span className="num small muted">{total === 1 ? m.countOne : fill(m.count, { n: total.toLocaleString("en-AU") })}</span>
    </div>
  );
}

function useAct() {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = <T,>(fn: () => Promise<R<T>>, onOk: (d: T) => void) => start(async () => {
    setError(null);
    const r = await fn();
    if (!r.ok) { setError(r.error); toast(r.error); return; }
    onOk(r.data);
    router.refresh();
  });
  return { busy, error, setError, act, toast };
}

function Ficha({ m, p, ownTags, onEmail, onAuto }: { m: CrmText; p: ContactPanel; ownTags: Opt[]; onEmail: () => void; onAuto: () => void }) {
  const { busy, error, act, toast } = useAct();
  const [tagOpen, setTagOpen] = useState(false);
  const [tagId, setTagId] = useState("");
  const [tagName, setTagName] = useState("");
  const has = new Set(p.tags.map((tg) => tg.id));
  const choices = ownTags.filter((tg) => !has.has(tg.id));
  const saveTag = () => act(() => tagContact({ contactId: p.id, tagId: tagName.trim() ? null : tagId || null, name: tagName }), () => { setTagOpen(false); setTagId(""); setTagName(""); });

  return (
    <aside aria-labelledby="cp" className={c.ficha}>
      <div className="row">
        <span aria-hidden="true" className={c.avatar}>{p.initial}</span>
        <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <h2 id="cp" style={{ margin: 0, fontSize: 18, fontWeight: 600, overflowWrap: "anywhere" }}>{p.name}</h2>
          <span className={`small muted ${c.mail}`} style={{ fontSize: 13 }}>{p.email}</span>
        </span>
      </div>
      <div className={c.tags} style={{ gap: 6, alignItems: "center" }}>
        <Tags tags={p.tags} removeLabel={m.tagRemove} onRemove={(id) => act(() => untagContact({ contactId: p.id, tagId: id }), () => undefined)} />
        <button type="button" className={`${c.dashed} ${c.dashedSm}`} aria-expanded={tagOpen} onClick={() => setTagOpen(!tagOpen)}>{m.addTag}</button>
      </div>
      {tagOpen ? (
        <div className={c.tagForm}>
          {choices.length ? (
            <div className="field">
              <label htmlFor="tg-pick">{m.tagPick}</label>
              <select id="tg-pick" className="input" value={tagId} onChange={(e) => setTagId(e.target.value)}>
                <option value="">—</option>
                {choices.map((tg) => <option key={tg.id} value={tg.id}>{tg.name}</option>)}
              </select>
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="tg-new">{m.tagNew}</label>
            <input id="tg-new" className="input" maxLength={40} placeholder={m.tagNewPh} value={tagName} onChange={(e) => setTagName(e.target.value)} />
          </div>
          <div className={c.actions}>
            <button type="button" className="btn btn-sm" disabled={busy || (!tagId && !tagName.trim())} onClick={saveTag}>{m.tagSave}</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTagOpen(false)}>{m.cancel}</button>
          </div>
        </div>
      ) : null}
      <dl className={c.dl}>
        <dt>{m.source}</dt><dd>{p.src}</dd>
        <dt>{m.marketing}</dt><dd>{p.cons}</dd>
        {p.sms !== null ? <><dt>{m.sms}</dt><dd>{p.sms}</dd></> : null}
        {p.phone ? <><dt>{m.phone}</dt><dd className="num">{p.phone}</dd></> : null}
        <dt>{m.country}</dt><dd>{p.country ?? m.none}</dd>
      </dl>
      {p.consent ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div><ConfirmButton className={`btn btn-secondary btn-sm ${c.btnMd}`} label={m.unsubscribe} confirmLabel={m.unsubscribeConfirm}
            onConfirm={() => act(() => unsubscribeContact({ contactId: p.id }), () => toast(m.unsubscribed))} /></div>
          <p className={c.hint}>{m.consentNote}</p>
        </div>
      ) : null}
      {error ? <p role="alert" className={css.err}>{error}</p> : null}
      <h3 style={{ margin: "6px 0 0", fontSize: 14, fontWeight: 600 }}>{m.activity}</h3>
      {p.tl.length ? (
        <ol className={c.timeline}>{p.tl.map((e, i) => <li key={i}><span>{e.d}</span><span>{e.t}</span></li>)}</ol>
      ) : <p className={c.hint}>{m.noEvents}</p>}
      {p.autos.length ? (
        <p className={c.hint}><strong>{m.inAutomations}:</strong> {p.autos.map((a) => `${a.name} (${a.status})`).join(" · ")}</p>
      ) : null}
      <div className={c.actions}>
        <button type="button" className={`btn btn-secondary ${c.btnMd}`} disabled={!p.consent} aria-describedby={!p.consent ? "cp-nc" : undefined} onClick={onEmail}>{m.sendEmail}</button>
        <button type="button" className={`btn btn-secondary ${c.btnMd}`} onClick={onAuto}>{m.addToAuto}</button>
      </div>
      {!p.consent ? <p id="cp-nc" className={c.hint}>{m.noConsentHint}</p> : null}
    </aside>
  );
}

function NewContact({ m, countries, onDone }: { m: CrmText; countries: { code: string; name: string }[]; onDone: () => void }) {
  const { busy, error, act, toast } = useAct();
  const [v, setV] = useState({ email: "", name: "", phone: "", country: "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form className="stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); act(() => addContact(v), () => { toast(m.created); setV({ email: "", name: "", phone: "", country: "" }); onDone(); }); }}>
      <div className={c.formGrid}>
        <div className="field"><label htmlFor="nc-e">{m.email}</label><input id="nc-e" className="input" type="email" required autoComplete="off" maxLength={254} value={v.email} onChange={set("email")} /></div>
        <div className="field"><label htmlFor="nc-n">{m.name}</label><input id="nc-n" className="input" autoComplete="off" maxLength={120} value={v.name} onChange={set("name")} /></div>
        <div className="field"><label htmlFor="nc-p">{m.phone}</label><input id="nc-p" className="input" type="tel" autoComplete="off" maxLength={30} placeholder={m.phonePh} value={v.phone} onChange={set("phone")} /></div>
        <div className="field"><label htmlFor="nc-c">{m.countryPick}</label>
          <select id="nc-c" className="input" value={v.country} onChange={set("country")}>
            <option value="">{m.noCountry}</option>
            {countries.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
          </select></div>
      </div>
      <p className={c.hint}>{m.newNote}</p>
      {error ? <p role="alert" className={css.err}>{error}</p> : null}
      <div className={c.actionsEnd}>
        <button type="button" className="btn btn-secondary" onClick={onDone}>{m.cancel}</button>
        <button type="submit" className="btn" disabled={busy || !v.email.trim()}>{busy ? m.creating : m.create}</button>
      </div>
    </form>
  );
}

function ImportCsv({ m, onDone }: { m: CrmText; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [parsed, setParsed] = useState<ImportParse | null>(null);
  const [proof, setProof] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    setError(null); setResult(null);
    if (!file) { setParsed(null); return; }
    setParsed(parseContactsCsv(await file.text()));
  };
  const rows: ImportRow[] = parsed?.ok ? parsed.rows : [];
  const run = async () => {
    const total = rows.length;
    let created = 0, updated = 0, invalid = 0, skipped = 0, done = 0;
    setProgress({ done, total });
    for (const batch of chunks(rows, 100)) {
      const r = await importBatch({ rows: batch, proof });
      if (!r.ok) { setError(r.error); setProgress(null); router.refresh(); return; }
      created += r.data.created; updated += r.data.updated; invalid += r.data.invalid; skipped += r.data.consentSkipped;
      done += batch.length;
      setProgress({ done, total });
    }
    setProgress(null);
    const parts = [fill(m.impDone, { created, updated })];
    if (skipped) parts.push(fill(m.impSkipped, { n: skipped }));
    if (invalid) parts.push(fill(m.impInvalidDone, { n: invalid }));
    setResult(parts.join(" "));
    toast(parts[0]);
    router.refresh();
  };
  const yesNo = (b: boolean) => (b ? m.yes : m.no);

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="field">
        <label htmlFor="imp-f">{m.impFile}</label>
        <input id="imp-f" type="file" accept=".csv,text/csv" className="input" style={{ paddingTop: 9 }} aria-describedby="imp-h" onChange={(e) => onFile(e.target.files?.[0])} />
        <span id="imp-h" className="xs muted">{m.impHelp}</span>
      </div>
      {parsed && !parsed.ok ? <p role="alert" className={css.err}>{m.impErrors[parsed.error]}</p> : null}
      {parsed?.ok ? (
        <>
          <p className="small" style={{ margin: 0 }} role="status">
            <strong>{rows.length === 1 ? m.impSummaryOne : fill(m.impSummary, { n: rows.length.toLocaleString("en-AU") })}</strong>
            {" · "}{parsed.withConsent ? fill(m.impConsent, { n: parsed.withConsent }) : m.impNoConsent}
            {parsed.invalid ? <><br />{fill(m.impInvalid, { n: parsed.invalid })}</> : null}
            {parsed.duplicates ? <><br />{fill(m.impDup, { n: parsed.duplicates })}</> : null}
          </p>
          {rows.length ? (
            <div className="field">
              <span className="label">{m.impPreview}</span>
              <div className="table-scroll">
                <table className={c.previewTable}>
                  <thead><tr><th>{m.email}</th><th>{m.name}</th><th>{m.phone}</th><th>{m.country}</th><th>{m.colTags}</th><th>{m.impConsentTitle}</th></tr></thead>
                  <tbody>{rows.slice(0, 5).map((r) => <tr key={r.email}><td>{r.email}</td><td>{r.name}</td><td>{r.phone}</td><td>{r.country}</td><td>{r.tags.join(", ")}</td><td>{yesNo(r.consent)}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          ) : null}
          <div className="field">
            <span className="label">{m.impConsentTitle}</span>
            <p className={c.hint}>{m.impConsentNote}</p>
          </div>
          {parsed.withConsent ? (
            <div className="field">
              <label htmlFor="imp-p">{m.impProof}</label>
              <input id="imp-p" className="input" maxLength={50} placeholder={m.impProofPh} value={proof} onChange={(e) => setProof(e.target.value)} />
              {!proof.trim() ? <span className="xs" style={{ color: "var(--ambar-texto)" }}>{m.impProofMissing}</span> : null}
            </div>
          ) : null}
        </>
      ) : null}
      {error ? <p role="alert" className={css.err}>{error}</p> : null}
      {result ? <p role="status" className={css.ok}>{result}</p> : null}
      <div className={c.actionsEnd}>
        <button type="button" className="btn btn-secondary" onClick={onDone}>{result ? m.close : m.cancel}</button>
        {!result ? (
          <button type="button" className="btn" disabled={!rows.length || !!progress} onClick={run}>
            {progress ? fill(m.impBusy, { done: progress.done, total: progress.total }) : rows.length === 1 ? m.impGoOne : fill(m.impGo, { n: rows.length.toLocaleString("en-AU") })}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function QuickEmail({ m, contactId, signature, onDone }: { m: CrmText; contactId: string; signature: string; onDone: () => void }) {
  const { busy, error, act, toast } = useAct();
  const [v, setV] = useState({ subject: "", heading: "", text: "", signature });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form className="stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); act(() => emailContact({ contactId, ...v }), () => { toast(m.queued); onDone(); }); }}>
      <div className="field"><label htmlFor="qe-s">{m.subject}</label><input id="qe-s" className="input" required maxLength={200} value={v.subject} onChange={set("subject")} /></div>
      <div className="field"><label htmlFor="qe-h">{m.heading}</label><input id="qe-h" className="input" maxLength={200} placeholder={m.headingPh} value={v.heading} onChange={set("heading")} /></div>
      <div className="field"><label htmlFor="qe-b">{m.body}</label><textarea id="qe-b" className={c.textarea} required rows={6} maxLength={5000} value={v.text} onChange={set("text")} /></div>
      <div className="field"><label htmlFor="qe-f">{m.signature}</label><input id="qe-f" className="input" maxLength={120} value={v.signature} onChange={set("signature")} /></div>
      <p className={c.hint}>{m.mailNote}</p>
      {error ? <p role="alert" className={css.err}>{error}</p> : null}
      <div className={c.actionsEnd}>
        <button type="button" className="btn btn-secondary" onClick={onDone}>{m.cancel}</button>
        <button type="submit" className="btn" disabled={busy || !v.subject.trim() || !v.text.trim()}>{busy ? m.queuing : m.queue}</button>
      </div>
    </form>
  );
}

function Enroll({ m, contactId, automations, onDone }: { m: CrmText; contactId: string; automations: Opt[]; onDone: () => void }) {
  const { busy, error, act, toast } = useAct();
  const [id, setId] = useState(automations[0]?.id ?? "");
  if (!automations.length) {
    return <Empty icon="spark" title={m.autoNone}><Link href="/admin/automatizaciones" className={`btn btn-secondary btn-sm ${c.tap}`}>{m.autoGo}</Link></Empty>;
  }
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="field">
        <label htmlFor="en-a">{m.autoPick}</label>
        <select id="en-a" className="input" value={id} onChange={(e) => setId(e.target.value)}>
          {automations.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <p className={c.hint}>{m.autoNote}</p>
      {error ? <p role="alert" className={css.err}>{error}</p> : null}
      <div className={c.actionsEnd}>
        <button type="button" className="btn btn-secondary" onClick={onDone}>{m.cancel}</button>
        <button type="button" className="btn" disabled={busy || !id} onClick={() => act(() => enrollInAutomation({ contactId, automationId: id }), (added) => { toast(added ? m.enrolled : m.alreadyIn); onDone(); })}>{m.enroll}</button>
      </div>
    </div>
  );
}
