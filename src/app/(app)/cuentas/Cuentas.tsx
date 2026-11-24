"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { fill, type Locale } from "@/i18n";
import { Empty, PageHeader } from "@/components/ui/basics";
import { ConfirmButton, Modal, Switch, useToast } from "@/components/ui/client";
import { formatDate, formatMoney, parseMoney, type AccountKind, type Cents, type ISODate, type MoneyFormat } from "@/lib/engine";
import type { Result } from "@/server/action";
import { addAccount, archiveAccount, setAccountFlags, setBalance, transfer, updateAccount } from "./actions";
import { balanceCheck, cardBalance, initialOf, KIND_COLOR, KINDS } from "./lib";
import type { CuentasMessages } from "./messages";
import css from "./cuentas.module.css";

export type AccountView = {
  id: string; name: string; institution: string; kind: AccountKind; balanceCents: Cents; balanceDate: ISODate;
  inNetworth: boolean; inForecast: boolean; isEmergencyFund: boolean; expectedCents: Cents; reconcile: boolean;
  last: { id: string; title: string; sub: string; amountCents: Cents }[];
};
type Actions = { save: string; cancel: string; close: string };
type Props = {
  accounts: AccountView[]; fmt: MoneyFormat; locale: Locale; canEdit: boolean; m: CuentasMessages; t: Actions;
  totals: { net: Cents; avail: Cents; cards: Cents; businessOut: boolean };
  company: string; auRule: boolean; companyHref: string | null; movHref: string | null;
};
type Run = <T>(fn: () => Promise<Result<T>>, after?: (r: Extract<Result<T>, { ok: true }>) => void, onError?: (e: string) => void) => void;

const EMPTY_NEW = { name: "", institution: "", kind: "bank" as AccountKind, balance: "" };

function KindChips({ m, value, onChange, labelId }: { m: CuentasMessages; value: AccountKind; onChange: (k: AccountKind) => void; labelId: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span id={labelId} className="label">{m.type}</span>
      <div role="radiogroup" aria-labelledby={labelId} className={css.chips}>
        {KINDS.map((k) => <button key={k} type="button" role="radio" aria-checked={value === k} className={css.chip} onClick={() => onChange(k)}>{m.kinds[k]}</button>)}
      </div>
    </div>
  );
}

function Detail({ a, p, run, pending, sheet, onArchived }: { a: AccountView; p: Props; run: Run; pending: boolean; sheet?: boolean; onArchived: () => void }) {
  const { m, fmt, canEdit } = p;
  const toast = useToast();
  const [edit, setEdit] = useState<{ name: string; institution: string; kind: AccountKind } | null>(null);
  const [error, setError] = useState("");
  const sub = `${a.institution ? `${a.institution} · ` : ""}${m.kinds[a.kind]}`;
  const flag = (patch: { inForecast?: boolean; inNetworth?: boolean; isEmergencyFund?: boolean }) => run(() => setAccountFlags({ id: a.id, ...patch }), undefined, (e) => toast(e));
  const options: { label: string; sub: string; on: boolean; set: (v: boolean) => void }[] = [
    { label: m.forecast, sub: m.forecastSub, on: a.inForecast, set: (v) => flag({ inForecast: v }) },
    { label: m.networth, sub: m.networthSub, on: a.inNetworth, set: (v) => flag({ inNetworth: v }) },
    { label: m.fund, sub: m.fundSub, on: a.isEmergencyFund, set: (v) => flag({ isEmergencyFund: v }) },
  ];
  const uid = sheet ? "s" : "d";
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span className="xs muted">{sub}</span>
        {sheet ? null : <h2 id="det" style={{ fontSize: 20 }}>{a.name}</h2>}
        <span className="num big" style={{ fontSize: 28, marginTop: 4 }}>{formatMoney(a.balanceCents, fmt)}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {options.map((o) => (
          <div key={o.label} className={css.option}>
            <span><span style={{ fontSize: 14, fontWeight: 600 }}>{o.label}</span><span className="xs muted">{o.sub}</span></span>
            <Switch checked={o.on} onChange={o.set} label={o.label} disabled={!canEdit || pending} />
          </div>
        ))}
      </div>
      {a.kind === "business" ? (
        <p className={css.companyNote}>
          {fill(m.companyA, { company: p.company })}{" "}
          {p.companyHref ? <>{m.companyB} <Link href={p.companyHref}>{m.companyLink}</Link>. </> : null}
          {fill(m.companyC, { rule: p.auRule ? m.div7a : "" })}
        </p>
      ) : null}
      <h3 style={{ fontSize: 14, marginTop: 6 }}>{m.last}</h3>
      {a.last.length === 0 ? <span className="small muted">{m.noMoves}</span> : (
        <ul className={css.moves}>
          {a.last.map((x) => (
            <li key={x.id}><span><span style={{ fontWeight: 600 }}>{x.title}</span><span className="xs muted">{x.sub}</span></span><strong className="num">{formatMoney(x.amountCents, fmt, { sign: true })}</strong></li>
          ))}
        </ul>
      )}
      {p.movHref ? <Link href={p.movHref} style={{ fontSize: 14, fontWeight: 600 }}>{m.seeAll}</Link> : null}
      {canEdit ? (
        edit ? (
          <form className="stack" style={{ borderTop: "1px solid var(--linea-2)", paddingTop: 14 }} onSubmit={(e) => {
            e.preventDefault(); setError("");
            run(() => updateAccount({ id: a.id, ...edit }), () => { setEdit(null); toast(m.saved); }, setError);
          }}>
            <KindChips m={m} value={edit.kind} onChange={(kind) => setEdit({ ...edit, kind })} labelId={`ek-${uid}`} />
            <div className="field"><label htmlFor={`en-${uid}`}>{m.name}</label><input id={`en-${uid}`} className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={80} required /></div>
            <div className="field"><label htmlFor={`eb-${uid}`}>{m.bank}</label><input id={`eb-${uid}`} className="input" value={edit.institution} onChange={(e) => setEdit({ ...edit, institution: e.target.value })} maxLength={80} /></div>
            {error ? <p role="alert" className="error">{error}</p> : null}
            <div className="row wrap" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEdit(null)}>{m.cancel}</button>
              <button className="btn" disabled={pending}>{m.editSave}</button>
            </div>
          </form>
        ) : (
          <div className="row wrap">
            <button type="button" className={css.textBtn} onClick={() => { setError(""); setEdit({ name: a.name, institution: a.institution, kind: a.kind }); }}>{m.edit}</button>
            <ConfirmButton className={css.textBtn} label={m.archive} confirmLabel={m.archiveConfirm} onConfirm={() => new Promise<void>((done) => {
              run(() => archiveAccount({ id: a.id }), () => { toast(m.archived); onArchived(); done(); }, (e) => { toast(e); done(); });
            })} />
          </div>
        )
      ) : null}
    </>
  );
}

export function Cuentas(p: Props) {
  const { accounts, fmt, locale, canEdit, m, totals } = p;
  const toast = useToast();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"" | "new" | "tf">("");
  const [selId, setSelId] = useState(accounts[0]?.id ?? "");
  const [sheet, setSheet] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [nw, setNw] = useState(EMPTY_NEW);
  const [tf, setTf] = useState({ fromId: "", toId: "", amount: "" });
  const [error, setError] = useState("");

  const run: Run = (fn, after, onError) => start(async () => {
    const r = await fn();
    if (r.ok) after?.(r); else (onError ?? setError)(r.error);
  });
  const sel = accounts.find((a) => a.id === selId) ?? accounts[0];
  const open = (next: "new" | "tf") => { setError(""); setMode(mode === next ? "" : next); };
  const pick = (id: string) => { setSelId(id); if (window.matchMedia("(max-width: 899px)").matches) setSheet(true); };
  const dropDraft = (id: string) => setDrafts((d) => { const n = { ...d }; delete n[id]; return n; });
  const fromId = tf.fromId || accounts[0]?.id || "", toId = tf.toId || accounts.find((a) => a.id !== fromId)?.id || "";

  const saveBalance = (a: AccountView) => {
    const text = drafts[a.id];
    if (text === undefined) return;
    run(() => setBalance({ id: a.id, balance: text }), () => { dropDraft(a.id); toast(m.balanceSaved); }, (e) => toast(e));
  };

  const buttons = (mobile: boolean) => (
    <>
      {accounts.length > 1 ? <button type="button" className="btn btn-secondary" aria-expanded={mode === "tf"} onClick={() => open("tf")}>{m.move}</button> : null}
      <button type="button" className="btn" aria-expanded={mode === "new"} onClick={() => open("new")}>{mobile ? m.addShort : m.add}</button>
    </>
  );

  return (
    <main className="page">
      <PageHeader title={m.title} eyebrow={<><span className="only-desktop">{m.eyebrow}</span><span className="only-mobile">{m.eyebrowShort}</span></>}>
        {canEdit ? <div className="row wrap only-desktop">{buttons(false)}</div> : null}
      </PageHeader>

      {accounts.length > 0 ? (
        <section aria-label={m.totals} className={css.totals}>
          <div><span className={css.k}>{totals.businessOut ? m.net : m.netAll}</span><span className={`num big ${css.main}`}>{formatMoney(totals.net, fmt)}</span></div>
          <div><span className={css.k}>{m.avail}</span><span className={`num big ${css.side}`}>{formatMoney(totals.avail, fmt)}</span></div>
          <div><span className={css.k}>{m.cards}</span><span className={`num big ${css.side}`} style={totals.cards < 0 ? { color: "var(--rojo)" } : undefined}>{formatMoney(totals.cards, fmt)}</span></div>
        </section>
      ) : null}

      {canEdit && accounts.length > 0 ? <div className={css.mobileActions} style={accounts.length > 1 ? undefined : { gridTemplateColumns: "1fr" }}>{buttons(true)}</div> : null}

      {mode === "new" && canEdit ? (
        <form aria-labelledby="an-h" className="form-open" onSubmit={(e) => {
          e.preventDefault(); setError("");
          run(() => addAccount(nw), (r) => { setMode(""); setNw(EMPTY_NEW); setSelId(r.data.id); toast(r.data.inForecast ? m.added : m.addedPlain, r.points); });
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><h2 id="an-h" className={css.formTitle}>{m.addTitle}</h2><span className="small muted" style={{ lineHeight: 1.5 }}>{m.addSub}</span></div>
          <KindChips m={m} value={nw.kind} onChange={(kind) => setNw({ ...nw, kind })} labelId="an-k" />
          <div className={css.grid2}>
            <div className="field"><label htmlFor="an-n">{m.name}</label><input id="an-n" className="input" value={nw.name} onChange={(e) => setNw({ ...nw, name: e.target.value })} placeholder={m.namePh} maxLength={80} required autoFocus /></div>
            <div className="field"><label htmlFor="an-b">{m.bank}</label><input id="an-b" className="input" value={nw.institution} onChange={(e) => setNw({ ...nw, institution: e.target.value })} placeholder={m.bankPh} maxLength={80} /></div>
            <div className="field"><label htmlFor="an-s">{m.balance}</label><input id="an-s" className="input num" inputMode="decimal" value={nw.balance} onChange={(e) => setNw({ ...nw, balance: e.target.value })} placeholder={formatMoney(0, fmt)} /></div>
          </div>
          <span className="hint">{m.cardHint}</span>
          {error ? <p role="alert" className="error">{error}</p> : null}
          <div className="row wrap" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-secondary" onClick={() => setMode("")}>{m.cancel}</button>
            <button className="btn" disabled={pending}>{m.addCta}</button>
          </div>
        </form>
      ) : null}

      {mode === "tf" && canEdit ? (
        <form aria-labelledby="tf-h" className="form-open" onSubmit={(e) => {
          e.preventDefault(); setError("");
          run(() => transfer({ fromId, toId, amount: tf.amount }), (r) => { setMode(""); setTf({ ...tf, amount: "" }); toast(fill(m.tfDone, { amount: formatMoney(r.data.amountCents, fmt) })); });
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><h2 id="tf-h" className={css.formTitle}>{m.tfTitle}</h2><span className="small muted" style={{ lineHeight: 1.5 }}>{m.tfSub}</span></div>
          <div className={css.grid3}>
            <div className="field"><label htmlFor="tf-f">{m.from}</label><select id="tf-f" className="select" value={fromId} onChange={(e) => setTf({ ...tf, fromId: e.target.value })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            <div className="field"><label htmlFor="tf-t">{m.to}</label><select id="tf-t" className="select" value={toId} onChange={(e) => setTf({ ...tf, toId: e.target.value })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            <div className="field"><label htmlFor="tf-a">{m.amount}</label><input id="tf-a" className="input num" inputMode="decimal" value={tf.amount} onChange={(e) => setTf({ ...tf, amount: e.target.value })} placeholder={formatMoney(0, fmt)} required /></div>
          </div>
          {error ? <p role="alert" className="error">{error}</p> : null}
          <div className="row wrap" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-secondary" onClick={() => setMode("")}>{m.cancel}</button>
            <button className="btn" disabled={pending}>{m.tfCta}</button>
          </div>
        </form>
      ) : null}

      {accounts.length === 0 ? (
        mode === "new" ? null : (
          <Empty icon="wallet" title={m.emptyTitle} text={m.emptyText}>
            {canEdit ? <button type="button" className="btn" onClick={() => open("new")}>{m.emptyCta}</button> : null}
          </Empty>
        )
      ) : (
        <div className={css.layout}>
          <div className="stack">
            <div role="list" aria-label={m.list} className="stack">
              {accounts.map((a) => {
                const draft = drafts[a.id];
                const parsed = draft === undefined ? null : parseMoney(draft);
                const typed = parsed === null ? null : cardBalance(a.kind, parsed);
                const check = a.reconcile && typed !== null ? balanceCheck(typed, a.expectedCents) : null;
                return (
                  <article key={a.id} role="listitem" className={css.account} data-selected={a.id === sel?.id}>
                    <button type="button" className={css.pick} aria-pressed={a.id === sel?.id} onClick={() => pick(a.id)}>
                      <span aria-hidden="true" className={css.initial} style={{ background: KIND_COLOR[a.kind] }}>{initialOf(a.name)}</span>
                      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                        <strong style={{ fontSize: 15 }}>{a.name}</strong>
                        <span className="xs muted">{a.institution ? `${a.institution} · ` : ""}{m.kinds[a.kind]}{a.isEmergencyFund ? ` · ${m.fundTag}` : ""}</span>
                        {a.inNetworth ? null : <span style={{ fontSize: 11, color: "var(--azul-oscuro)", fontWeight: 600 }}>{m.notNet}</span>}
                      </span>
                    </button>
                    <div className={css.balance}>
                      <label htmlFor={`b-${a.id}`}>{m.balance}</label>
                      <input id={`b-${a.id}`} className="num" type="text" inputMode="decimal" readOnly={!canEdit} value={draft ?? formatMoney(a.balanceCents, fmt)}
                        onChange={(e) => setDrafts({ ...drafts, [a.id]: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") saveBalance(a); if (e.key === "Escape") dropDraft(a.id); }} />
                      <span className="xs muted">{a.kind === "card" && draft !== undefined && typed !== null ? formatMoney(typed, fmt) : fill(m.writtenOn, { date: formatDate(a.balanceDate, locale, "short") })}</span>
                    </div>
                    {check && check.state !== "ok" ? (
                      <div className={css.diff} role="status">
                        <span><strong>{fill(check.state === "missing" ? m.missing : m.extra, { amount: formatMoney(check.cents, fmt) })}</strong> {m.byMoves}</span>
                        {p.movHref ? <Link href={p.movHref}>{m.review}</Link> : null}
                      </div>
                    ) : null}
                    {draft !== undefined && canEdit ? (
                      <div className={css.saveRow}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => dropDraft(a.id)}>{m.cancel}</button>
                        <button type="button" className="btn btn-sm" disabled={pending || typed === null} onClick={() => saveBalance(a)}>{m.saveBalance}</button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
            <p className="xs muted">{m.note}</p>
          </div>
          {sel ? (
            <aside aria-labelledby="det" className={`card ${css.aside}`}>
              <Detail key={sel.id} a={sel} p={p} run={run} pending={pending} onArchived={() => setSelId("")} />
            </aside>
          ) : null}
        </div>
      )}

      {sel ? (
        <Modal open={sheet} onClose={() => setSheet(false)} title={sel.name} labelClose={p.t.close}>
          <Detail key={sel.id} a={sel} p={p} run={run} pending={pending} sheet onArchived={() => { setSheet(false); setSelId(""); }} />
        </Modal>
      ) : null}
    </main>
  );
}
