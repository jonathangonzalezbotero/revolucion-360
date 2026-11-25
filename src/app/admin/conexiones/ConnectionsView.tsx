"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fill } from "@/i18n";
import { connectionUrl, formSnippet, normalizeHost, SAMPLE_JSON } from "@/lib/crm/connections";
import { Empty } from "@/components/ui/basics";
import { ConfirmButton, Modal, Switch, useToast } from "@/components/ui/client";
import { Icon } from "@/components/ui/Icon";
import css from "../_shared/admin.module.css";
import { AdminHeader } from "../_shared/ui";
import c from "../crm/crm.module.css";
import { newTag, regenerateKey, revealKey, saveConn, saveSiteKey, sendTest, setConnStatus } from "./actions";
import x from "./conexiones.module.css";
import { ImportSysteme } from "./ImportSysteme";
import type { ConexionesText } from "./messages";

export type ConnView = {
  id: string; slug: string; name: string; status: "active" | "paused"; tagIds: string[]; origins: string[]; thanksUrl: string; doubleOptIn: boolean;
  contacts: string; last: string; flows: string[];
};
export type LogLine = { when: string; who: string; what: string; bad: boolean };
type TagOpt = { id: string; name: string; system: boolean };
type R<T> = { ok: true; data: T } | { ok: false; error: string };

export function ConnectionsView({ m, footnote, list, selectedId, log, shield, tags, siteKey, secretSet, legalOk, appUrl }: {
  m: ConexionesText; footnote: string; list: ConnView[]; selectedId: string | null; log: LogLine[]; shield: "ok" | "bad" | "none";
  tags: TagOpt[]; siteKey: string; secretSet: boolean; legalOk: boolean; appUrl: string;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<null | "new" | "import">(null);
  const close = () => setModal(null);
  const current = list.find((l) => l.id === selectedId) ?? null;
  const tagName = (id: string) => tags.find((t) => t.id === id)?.name ?? "—";
  const pick = (id: string) => router.push(`/admin/conexiones?c=${id}`, { scroll: false });

  return (
    <>
      <AdminHeader eyebrow={m.eyebrow} title={m.title}>
        <button type="button" className="btn btn-secondary" style={{ minHeight: 46 }} onClick={() => setModal("import")}>{m.importSysteme}</button>
        <button type="button" className="btn" style={{ minHeight: 46 }} onClick={() => setModal("new")}>{m.newConn}</button>
      </AdminHeader>
      <p className={x.intro}>{m.intro}</p>

      <section aria-labelledby="wl" className={c.box} style={{ gap: 10 }}>
        <h2 id="wl">{m.listTitle}</h2>
        {list.length === 0 ? (
          <Empty image="/ilustraciones/vacio-movimientos.webp" title={m.empty} text={m.emptySub}>
            <button type="button" className="btn" onClick={() => setModal("new")}>{m.newConn}</button>
          </Empty>
        ) : (
          <div className="table-scroll">
            <table className={c.list}>
              <thead><tr><th>{m.colConn}</th><th>{m.colTags}</th><th>{m.colStatus}</th><th style={{ textAlign: "right" }}>{m.colContacts}</th><th style={{ textAlign: "right" }}>{m.colLast}</th></tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} data-row aria-selected={r.id === current?.id} onClick={() => pick(r.id)}>
                    <td><Link href={`/admin/conexiones?c=${r.id}`} scroll={false} className={c.rowLink} onClick={(e) => e.stopPropagation()}>{r.name}</Link></td>
                    <td><span className={c.tags}>{r.tagIds.map((t) => <span key={t} className={c.tag} style={{ background: "var(--linea-2)", color: "var(--tinta-2)" }}>{tagName(t)}</span>)}</span></td>
                    <td style={{ fontWeight: 600, color: r.status === "active" ? "var(--verde-fuerte)" : "var(--gris)" }}>{m.status[r.status]}</td>
                    <td className="num" style={{ textAlign: "right" }}>{r.contacts}</td>
                    <td style={{ textAlign: "right", color: "var(--gris)", whiteSpace: "nowrap" }}>{r.last}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className={x.grid}>
        {current ? (
          <Detail key={current.id} m={m} conn={current} tags={tags} tagName={tagName} shield={shield} siteKey={siteKey} secretSet={secretSet} legalOk={legalOk} appUrl={appUrl} />
        ) : null}
        <div className={x.side}>
          {current ? (
            <section aria-labelledby="wg" className={x.box}>
              <h2 id="wg" style={{ fontSize: 17 }}>{m.logTitle}</h2>
              {log.length === 0 ? <p className={x.small}>{m.logEmpty}</p> : (
                <ul className={x.log}>
                  {log.map((l, i) => (
                    <li key={i}>
                      <span><strong>{l.who}</strong><span className={x.muted}>{l.when}</span></span>
                      <span className={l.bad ? x.warnTxt : x.ok}>{l.what}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
          <section aria-labelledby="wr" className={x.box} style={{ gap: 8 }}>
            <h2 id="wr">{m.rulesTitle}</h2>
            <ul className={x.rules}>
              {m.rules.map((r) => {
                const [a, b] = r.split(m.rulesCode);
                return <li key={r}>{b === undefined ? r : <>{a}<code>{m.rulesCode}</code>{b}</>}</li>;
              })}
            </ul>
          </section>
          <AntiBot m={m} siteKey={siteKey} secretSet={secretSet} />
          <section aria-labelledby="wi" className={x.steps} style={{ gap: 8 }}>
            <h2 id="wi">{m.sysTitle}</h2>
            <ol>{m.sysSteps.map((t) => <li key={t}>{t}</li>)}</ol>
          </section>
        </div>
      </div>
      <p className={c.foot}>{footnote}</p>

      <Modal open={modal === "new"} onClose={close} title={m.newTitle} labelClose={m.close}>
        {modal === "new" ? <NewConnection m={m} onDone={(id) => { close(); router.push(`/admin/conexiones?c=${id}`, { scroll: false }); router.refresh(); }} /> : null}
      </Modal>
      <Modal open={modal === "import"} onClose={close} title={m.impTitle} labelClose={m.close}>
        {modal === "import" ? <ImportSysteme m={m} /> : null}
      </Modal>
    </>
  );
}

function NewConnection({ m, onDone }: { m: ConexionesText; onDone: (id: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await saveConn({ name, tagIds: [], origins: [], thanksUrl: null, doubleOptIn: false });
      if (!r.ok) { setError(r.error); return; }
      onDone(r.data);
    });
  };
  return (
    <form className="stack" onSubmit={submit}>
      <div className="field">
        <label htmlFor="nc-n">{m.newName}</label>
        <input id="nc-n" className="input" maxLength={80} required placeholder={m.newNamePh} value={name} aria-describedby="nc-h" onChange={(e) => setName(e.target.value)} />
        <span id="nc-h" className="xs muted">{m.newHelp}</span>
      </div>
      {error ? <p role="alert" className={css.err}>{error}</p> : null}
      <div className={c.actionsEnd}><button type="submit" className="btn" disabled={busy || !name.trim()}>{busy ? m.creating : m.create}</button></div>
    </form>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function Detail({ m, conn, tags, tagName, shield, siteKey, secretSet, legalOk, appUrl }: {
  m: ConexionesText; conn: ConnView; tags: TagOpt[]; tagName: (id: string) => string; shield: "ok" | "bad" | "none"; siteKey: string; secretSet: boolean; legalOk: boolean; appUrl: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [d, setD] = useState(conn);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [addingHost, setAddingHost] = useState(false);
  const [host, setHost] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [tagPick, setTagPick] = useState("");
  const [tagNew, setTagNew] = useState("");
  const [thanks, setThanks] = useState(conn.thanksUrl);
  const [tested, setTested] = useState<string | null>(null);
  const url = connectionUrl(appUrl, d.slug);
  const snippet = formSnippet(url, siteKey || null, m.snippet);
  const ownTags = tags.filter((t) => !t.system && !d.tagIds.includes(t.id));

  const say = (text: string) => { setError(null); setMsg(text); };
  const oops = (text: string) => { setMsg(null); setError(text); toast(text); };
  /** Guarda la conexión con el cambio (cada control guarda solo, como en el mockup: no hay botón "Guardar"). */
  const save = (next: Partial<ConnView>, done?: string) => start(async () => {
    const merged = { ...d, ...next };
    const r = await saveConn({ id: d.id, name: merged.name, tagIds: merged.tagIds, origins: merged.origins, thanksUrl: merged.thanksUrl.trim() || null, doubleOptIn: merged.doubleOptIn });
    if (!r.ok) { oops(r.error); return; }
    setD(merged);
    say(done ?? m.saved);
    router.refresh();
  });
  const withSecret = async (): Promise<string | null> => {
    if (secret) return secret;
    const r = await revealKey({ id: d.id });
    if (!r.ok) { oops(r.error); return null; }
    setSecret(r.data);
    return r.data;
  };
  const copy = async (text: string | null, done: string) => {
    if (text === null) return;
    if (await copyText(text)) say(done); else oops(m.copyFail);
  };
  const call = <T,>(fn: () => Promise<R<T>>, then: (data: T) => void) => start(async () => {
    const r = await fn();
    if (!r.ok) { oops(r.error); return; }
    then(r.data);
  });

  const addHost = (e: React.FormEvent) => {
    e.preventDefault();
    const h = normalizeHost(host);
    if (!h) { oops(m.originBad); return; }
    setHost(""); setAddingHost(false);
    if (!d.origins.includes(h)) save({ origins: [...d.origins, h] });
  };
  const addTag = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      let id = tagPick;
      if (tagNew.trim()) {
        const r = await newTag({ name: tagNew });
        if (!r.ok) { oops(r.error); return; }
        id = r.data;
      }
      if (!id) return;
      const tagIds = [...new Set([...d.tagIds, id])];
      const s = await saveConn({ id: d.id, name: d.name, tagIds, origins: d.origins, thanksUrl: d.thanksUrl.trim() || null, doubleOptIn: d.doubleOptIn });
      if (!s.ok) { oops(s.error); return; }
      setD({ ...d, tagIds }); setTagPick(""); setTagNew(""); setAddingTag(false); say(m.saved);
      router.refresh();
    });
  };
  const hostsText = d.origins.length ? d.origins.join(", ") : "—";

  return (
    <section aria-labelledby="wd" className={x.detail}>
      <h2 id="wd">{d.name}</h2>

      <div className={x.group}>
        <span className={x.label}>{m.url}</span>
        <div className={x.row}>
          <code className={x.codeLine} title={url}>{url}</code>
          <button type="button" className={`btn btn-secondary ${c.btnMd}`} onClick={() => copy(url, m.copiedUrl)}>{m.copy}</button>
        </div>
      </div>

      <div className={x.group}>
        <span className={x.label} id="wo">{m.origins}</span>
        <div className={x.hosts} aria-labelledby="wo">
          {d.origins.map((o) => (
            <span key={o} className={x.host}>{o}
              <button type="button" className={c.tagX} aria-label={fill(m.removeOrigin, { host: o })} disabled={busy} onClick={() => save({ origins: d.origins.filter((y) => y !== o) })}><Icon name="x" size={12} /></button>
            </span>
          ))}
          {!addingHost ? <button type="button" className={`${c.dashed} ${c.dashedSm}`} aria-expanded={false} onClick={() => setAddingHost(true)}>{m.addOrigin}</button> : null}
        </div>
        {d.origins.length === 0 ? <p className={x.small}>{m.noOrigins}</p> : null}
        {addingHost ? (
          <form className={x.inline} onSubmit={addHost}>
            <div className="field"><label htmlFor="wo-h" className={c.srOnly}>{m.addOrigin}</label>
              <input id="wo-h" className="input" autoFocus placeholder={m.originPh} value={host} onChange={(e) => setHost(e.target.value)} /></div>
            <button type="submit" className={`btn ${c.btnMd}`} disabled={busy || !host.trim()}>{m.addOriginBtn}</button>
            <button type="button" className={`btn btn-secondary ${c.btnMd}`} onClick={() => { setAddingHost(false); setHost(""); }}>{m.close}</button>
          </form>
        ) : null}
      </div>

      <div className={x.codeBox}>
        <div className={x.codeHead}><span>{m.codeTitle}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => copy(snippet, m.copiedCode)}>{m.copyCode}</button></div>
        <span className={x.small}>{m.codeHelp} <code className={x.mono}>cf-turnstile</code>.</span>
        <pre className={x.pre}>{snippet}</pre>
        <div className={x.shield}>
          <span className={`${x.shieldTxt} ${shield === "bad" ? x.warnTxt : shield === "ok" ? x.ok : x.muted}`}><span aria-hidden="true" className={x.dot} />
            {shield === "ok" ? m.shieldOk : shield === "bad" ? m.shieldBad : m.shieldNone}</span>
          <span className={x.muted}>{siteKey && secretSet ? fill(m.shieldNote, { hosts: hostsText }) : m.shieldNoteOff}</span>
        </div>
      </div>

      <div className={x.group}>
        <span className={x.label}>{m.secret}</span>
        <div className={x.row}>
          <code className={x.codeLine}>{show && secret ? secret : "rk_live_••••••••••••"}</code>
          <button type="button" className={`btn btn-secondary ${c.btnMd}`} disabled={busy} aria-pressed={show}
            onClick={() => { if (show) setShow(false); else start(async () => { if (await withSecret()) setShow(true); }); }}>{show ? m.hide : m.show}</button>
          <button type="button" className={`btn btn-secondary ${c.btnMd}`} disabled={busy} onClick={() => start(async () => {
            const k = await withSecret();
            if (k === null) return;
            // Safari no deja copiar después de esperar al servidor: se muestra la clave y el próximo clic copia.
            if (await copyText(k)) say(m.copiedKey); else { setShow(true); oops(m.copyFail); }
          })}>{m.copy}</button>
          <ConfirmButton className={`btn btn-secondary ${c.btnMd}`} label={m.regenerate} confirmLabel={m.regenerateConfirm} ariaLabel={m.regenerateAria}
            onConfirm={() => call(() => regenerateKey({ id: d.id }), (k) => { setSecret(k); setShow(true); say(m.newKey); })} />
        </div>
        <span className={x.warn}>{m.secretWarn}</span>
        <span className={x.small}>{m.secretHow}</span>
      </div>

      {msg ? <p role="status" className={x.status}>{msg}</p> : null}
      {error ? <p role="alert" className={css.err}>{error}</p> : null}

      <div className={x.group}>
        <span className={x.label}>{m.sampleTitle}</span>
        <pre className={x.preLg}>{SAMPLE_JSON}</pre>
        <span className={x.small}>{m.sampleNote}</span>
      </div>

      <div className={x.group} style={{ gap: 8 }}>
        <span className={x.label} id="wt">{m.tagsTitle}</span>
        <div className={x.hosts} aria-labelledby="wt">
          {d.tagIds.length === 0 ? <span className={x.small}>{m.noTags}</span> : null}
          {d.tagIds.map((t) => (
            <span key={t} className={c.tag} style={{ background: "var(--linea-2)", color: "var(--tinta-2)" }}>{tagName(t)}
              <button type="button" className={c.tagX} aria-label={fill(m.removeTag, { tag: tagName(t) })} disabled={busy} onClick={() => save({ tagIds: d.tagIds.filter((y) => y !== t) })}><Icon name="x" size={12} /></button>
            </span>
          ))}
          {!addingTag && d.tagIds.length < 10 ? <button type="button" className={`${c.dashed} ${c.dashedSm}`} onClick={() => setAddingTag(true)}>{m.addTag}</button> : null}
        </div>
        {addingTag ? (
          <form className={x.inline} onSubmit={addTag}>
            {ownTags.length ? (
              <div className="field"><label htmlFor="wt-p">{m.pickTag}</label>
                <select id="wt-p" className="input" value={tagPick} onChange={(e) => { setTagPick(e.target.value); if (e.target.value) setTagNew(""); }}>
                  <option value="">—</option>
                  {ownTags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select></div>
            ) : null}
            <div className="field"><label htmlFor="wt-n">{m.newTagName}</label>
              <input id="wt-n" className="input" maxLength={40} placeholder={m.newTagPh} value={tagNew} onChange={(e) => { setTagNew(e.target.value); if (e.target.value) setTagPick(""); }} /></div>
            <button type="submit" className={`btn ${c.btnMd}`} disabled={busy || (!tagPick && !tagNew.trim())}>{m.addTagBtn}</button>
            <button type="button" className={`btn btn-secondary ${c.btnMd}`} onClick={() => setAddingTag(false)}>{m.close}</button>
          </form>
        ) : null}
      </div>
      {conn.flows.length ? (
        <p className={x.noteOk}>{conn.flows.length === 1 ? fill(m.flowOk, { name: conn.flows[0] }) : fill(m.flowOkMany, { names: conn.flows.map((f) => `"${f}"`).join(", ") })}</p>
      ) : (
        <p className={x.noteWarn}>{m.noFlow} <Link href="/admin/automatizaciones?a=nueva">{m.createOne}</Link></p>
      )}

      <div className={x.switchRow}>
        <span><strong>{m.dbl}</strong><span className={x.small}>{m.dblSub}</span>
          {d.doubleOptIn && !legalOk ? <span className={x.warn}>{m.dblLegal}</span> : null}</span>
        <Switch checked={d.doubleOptIn} label={m.dbl} disabled={busy} onChange={(v) => save({ doubleOptIn: v })} />
      </div>

      <form className="field" onSubmit={(e) => { e.preventDefault(); save({ thanksUrl: thanks }); }}>
        <label htmlFor="wd-t">{m.thanks}</label>
        <div className={x.row}>
          <input id="wd-t" className="input" style={{ flex: "1 1 220px" }} type="url" inputMode="url" maxLength={500} placeholder={m.thanksPh} value={thanks} aria-describedby="wd-th" onChange={(e) => setThanks(e.target.value)} />
          <button type="submit" className={`btn btn-secondary ${c.btnMd}`} disabled={busy || thanks === d.thanksUrl}>{m.saveThanks}</button>
        </div>
        <span id="wd-th" className="xs muted">{m.thanksHelp}</span>
      </form>

      <div className={x.end}>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => call(() => sendTest({ id: d.id }), (email) => { setTested(email); router.refresh(); })}>{m.test}</button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => {
          const status = d.status === "active" ? "paused" : "active";
          call(() => setConnStatus({ id: d.id, status }), () => { setD({ ...d, status }); say(status === "active" ? m.activated : m.paused); router.refresh(); });
        }}>{d.status === "active" ? m.pause : m.activate}</button>
      </div>
      {tested ? <p role="status" className={x.statusBox}>{fill(m.tested, { email: tested })}</p> : null}
    </section>
  );
}

function AntiBot({ m, siteKey, secretSet }: { m: ConexionesText; siteKey: string; secretSet: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState(siteKey);
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const on = !!siteKey && secretSet;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await saveSiteKey({ siteKey: v });
      if (!r.ok) { setError(r.error); return; }
      setError(null); toast(m.abSaved); router.refresh();
    });
  };
  return (
    <section aria-labelledby="wt-ab" className={x.box}>
      <div className={x.boxHead}><h2 id="wt-ab">{m.abTitle}</h2><span className={on ? x.badgeOk : x.badgeOff}>{on ? m.abOn : m.abOff}</span></div>
      <span className="small" style={{ color: "var(--tinta-2)", lineHeight: 1.5 }}>{m.abIntro}</span>
      <form className="stack" style={{ gap: 10 }} onSubmit={submit}>
        <div className="field"><label htmlFor="tsk">{m.abSite}</label>
          <input id="tsk" className="input" type="text" autoComplete="off" spellCheck={false} placeholder={m.abSitePh} value={v} onChange={(e) => setV(e.target.value)} /></div>
        {error ? <p role="alert" className={css.err}>{error}</p> : null}
        <div><button type="submit" className={`btn btn-secondary ${c.btnMd}`} disabled={busy || v === siteKey}>{m.abSave}</button></div>
      </form>
      <div className="field"><span className="label">{m.abSecret}</span>
        <span className={secretSet ? x.ok : x.warn} style={{ fontSize: 13 }}>{secretSet ? m.abSecretSet : m.abSecretMissing}</span></div>
      <span className={x.small}>{m.abDomains}</span>
    </section>
  );
}
