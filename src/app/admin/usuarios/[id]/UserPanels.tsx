"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fill } from "@/i18n";
import { Pill } from "@/components/ui/basics";
import { ConfirmButton, useToast } from "@/components/ui/client";
import { Icon } from "@/components/ui/Icon";
import css from "../../_shared/admin.module.css";
import { ConfirmEmail } from "../../_shared/ConfirmEmail";
import { GrantFields, type GrantValue } from "../../_shared/GrantFields";
import type { AdminText } from "../../_shared/messages";
import { deleteAccount, markExportDone } from "../../soporte/actions";
import { addNote, addToGroup, deleteNote, grantOne, removeFromGroup, revokeAccess, sendPasswordReset, setRole, setSuspended, resetMfa } from "./actions";
import type { UserText } from "./messages";

type R = { ok: true } | { ok: false; error: string };
/** Ejecuta una acción, avisa y refresca. Devuelve el error (o null). */
function useAct() {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const act = (fn: () => Promise<R>, okText: string, after?: () => void) =>
    new Promise<string | null>((resolve) => start(async () => {
      const r = await fn();
      if (!r.ok) { toast(r.error); return resolve(r.error); }
      toast(okText); after?.(); router.refresh(); resolve(null);
    }));
  return { act, busy, router, toast };
}

export function AccessPanel({ t, m, locale, today, userId, state, from, kind }: { t: AdminText; m: UserText; locale: string; today: string; userId: string; state: string; from?: string; kind: "alumno" | "fundador" }) {
  const { act, busy } = useAct();
  const free = state === "alumno" || state === "fundador";
  const [v, setV] = useState<GrantValue>({ kind, mode: "meses", months: free ? "3" : "12", until: "" });
  return (
    <>
      <div className="stack" style={{ gap: 12, borderTop: "1px solid var(--linea-2)", paddingTop: 14 }}>
        <strong style={{ fontSize: 13 }}>{free ? m.extend : m.giveTitle}</strong>
        <GrantFields t={t} locale={locale} today={today} from={from} value={v} onChange={setV} idPrefix="ex" />
        {state === "pro" ? <span className="xs muted">{t.grant.proNote}</span> : null}
        <div><button type="button" className="btn" disabled={busy} onClick={() => act(() => grantOne({ userId, ...v }), m.extended)}>{free ? m.extendBtn : m.giveBtn}</button></div>
      </div>
      {free ? (
        <div className="row wrap" style={{ borderTop: "1px solid var(--linea-2)", paddingTop: 14 }}>
          <ConfirmButton className={`btn btn-danger ${css.btnDanger}`} label={m.revoke} confirmLabel={m.revokeConfirm} onConfirm={() => act(() => revokeAccess({ userId }), m.revoked).then(() => undefined)} />
        </div>
      ) : null}
    </>
  );
}

export function GroupsPanel({ m, userId, groups, all }: { m: UserText; userId: string; groups: { id: string; name: string }[]; all: { id: string; name: string }[] }) {
  const { act, busy } = useAct();
  const left = all.filter((g) => !groups.some((x) => x.id === g.id));
  const [pick, setPick] = useState("");
  const chosen = left.some((g) => g.id === pick) ? pick : left[0]?.id ?? "";
  return (
    <section aria-labelledby="gp" className={css.section}>
      <h2 id="gp">{m.groups}</h2>
      {groups.length === 0 ? <span className="small muted">{m.groupsEmpty}</span> : (
        <div className={css.chips}>
          {groups.map((g) => (
            <span key={g.id} className={css.chip}>{g.name}
              <button type="button" className={css.chipX} disabled={busy} aria-label={fill(m.removeGroup, { name: g.name })} onClick={() => act(() => removeFromGroup({ userId, groupId: g.id }), m.removed)}><Icon name="x" size={16} /></button>
            </span>
          ))}
        </div>
      )}
      {left.length ? (
        <div className="row wrap" style={{ gap: 10 }}>
          <label htmlFor="add-g" className="sr-only">{m.addGroup}</label>
          <select id="add-g" className="input" value={chosen} onChange={(e) => setPick(e.target.value)} style={{ width: "auto", minWidth: 220, maxWidth: "100%" }}>
            {left.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button type="button" className="btn btn-secondary" disabled={busy || !chosen} onClick={() => act(() => addToGroup({ userId, groupId: chosen }), m.added)}>{m.addBtn}</button>
        </div>
      ) : all.length ? <span className="xs muted">{m.noGroupsLeft}</span> : null}
    </section>
  );
}

export function NotesPanel({ m, userId, notes }: { m: UserText; userId: string; notes: { id: string; body: string; when: string }[] }) {
  const { act, busy } = useAct();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = async () => { setError(null); const e = await act(() => addNote({ userId, body }), m.noteSaved, () => setBody("")); if (e) setError(e); };
  return (
    <section aria-labelledby="no" className={css.section}>
      <h2 id="no"><label htmlFor="nt">{m.notes}</label></h2>
      <textarea id="nt" rows={3} className="textarea" value={body} maxLength={1000} aria-describedby="nt-help" onChange={(e) => setBody(e.target.value)} />
      <span id="nt-help" className="xs muted">{m.notesHelp}</span>
      {error ? <p role="alert" className={css.err}>{error}</p> : null}
      <div><button type="button" className="btn btn-secondary" disabled={busy || !body.trim()} onClick={save}>{m.addNote}</button></div>
      {notes.length === 0 ? <span className="small muted">{m.notesEmpty}</span> : notes.map((n) => (
        <div key={n.id} className="row-between" style={{ borderTop: "1px solid var(--linea-2)", paddingTop: 10, alignItems: "flex-start" }}>
          <span className="stack" style={{ gap: 2, minWidth: 0 }}><span style={{ fontSize: 14, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{n.body}</span><span className="xs muted">{n.when}</span></span>
          <ConfirmButton className="btn btn-ghost btn-sm" label={<Icon name="trash" size={16} />} confirmLabel={m.deleteNoteConfirm} ariaLabel={m.deleteNote} confirmAriaLabel={m.deleteNoteConfirm}
            onConfirm={() => act(() => deleteNote({ userId, noteId: n.id }), m.noteDeleted).then(() => undefined)} />
        </div>
      ))}
    </section>
  );
}

export function AccountPanel({ t, m, userId, email, role, self, rows }: { t: AdminText; m: UserText; userId: string; email: string; role: string; self: boolean; rows: { k: string; v: string }[] }) {
  const { act, busy, router, toast } = useAct();
  const [modal, setModal] = useState<"mfa" | "role" | null>(null);
  const toAdmin = role !== "admin";
  return (
    <section aria-labelledby="cu" className={css.section} style={{ gap: 4 }}>
      <h2 id="cu" style={{ marginBottom: 8 }}>{m.account}</h2>
      {rows.map((r) => <div key={r.k} className={css.kv}><span>{r.k}</span><span>{r.v}</span></div>)}
      <div className="row wrap" style={{ gap: 8, paddingTop: 12 }}>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => act(() => sendPasswordReset({ userId }), m.resetSent)}>{m.reset}</button>
        <button type="button" className="btn btn-secondary" onClick={() => setModal("mfa")}>{m.mfa}</button>
        {self ? null : <button type="button" className="btn btn-secondary" onClick={() => setModal("role")}>{toAdmin ? m.roleBtnAdmin : m.roleBtnUser}</button>}
      </div>
      <span className="xs muted" style={{ paddingTop: 6 }}>{self ? m.roleSelf : m.mfaShort}</span>
      <ConfirmEmail open={modal === "mfa"} onClose={() => setModal(null)} title={m.mfaTitle} help={m.mfaHelp} email={email} label={m.typeEmail} button={m.mfaBtn} confirmButton={m.mfaConfirm} closeLabel={t.cancel}
        onConfirm={async (typed) => {
          const r = await resetMfa({ userId, email: typed });
          if (!r.ok) return r.error;
          toast(r.data ? fill(m.mfaDone, { n: r.data }) : m.mfaNone);
          router.refresh();
          return null;
        }} />
      <ConfirmEmail open={modal === "role"} onClose={() => setModal(null)} title={toAdmin ? m.roleTitleAdmin : m.roleTitleUser} help={toAdmin ? m.roleHelpAdmin : m.roleHelpUser} email={email} label={m.typeEmail}
        button={toAdmin ? m.roleBtnAdmin : m.roleBtnUser} confirmButton={m.roleConfirm} closeLabel={t.cancel} danger={!toAdmin}
        onConfirm={(typed) => act(() => setRole({ userId, role: toAdmin ? "admin" : "user", email: typed }), m.roleDone)} />
    </section>
  );
}

export function PrivacyPanel({ t, m, userId, email, self, isAdmin, suspended, requests }: {
  t: AdminText; m: UserText; userId: string; email: string; self: boolean; isAdmin: boolean; suspended: boolean;
  requests: { id: string; kind: string; status: string; due: string; requested: string }[];
}) {
  const { act, busy, router } = useAct();
  const [del, setDel] = useState(false);
  return (
    <section aria-labelledby="pv" className={css.section}>
      <h2 id="pv">{m.privacy}</h2>
      <strong style={{ fontSize: 13 }}>{m.requests}</strong>
      {requests.length === 0 ? <span className="small muted">{m.requestsEmpty}</span> : requests.map((r) => (
        <div key={r.id} className="row-between wrap" style={{ borderTop: "1px solid var(--linea-2)", paddingTop: 10 }}>
          <span className="stack" style={{ gap: 2 }}>
            <strong style={{ fontSize: 14 }}>{r.kind === "delete" ? m.reqDelete : m.reqExport}</strong>
            <span className="xs muted">{r.requested}{r.status === "pending" ? ` · ${fill(m.reqDue, { date: r.due })}` : ""}</span>
          </span>
          <span className="row" style={{ gap: 8 }}>
            <Pill tone={r.status === "pending" ? "warn" : r.status === "done" ? "ok" : "neutral"}>{m.reqStatus[r.status] ?? r.status}</Pill>
            {r.kind === "export" && r.status === "pending" ? <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act(() => markExportDone({ requestId: r.id }), m.markedDone)}>{m.markDone}</button> : null}
          </span>
        </div>
      ))}
      {self ? null : (
        <div className="row wrap" style={{ gap: 8, borderTop: "1px solid var(--linea-2)", paddingTop: 12 }}>
          {suspended
            ? <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => act(() => setSuspended({ userId, on: false }), m.unsuspendedMsg)}>{m.unsuspend}</button>
            : <ConfirmButton className={`btn btn-danger ${css.btnDanger}`} label={m.suspend} confirmLabel={m.suspendConfirm} onConfirm={() => act(() => setSuspended({ userId, on: true }), m.suspendedMsg).then(() => undefined)} />}
        </div>
      )}
      <div className={css.danger}>
        <strong>{m.del}</strong>
        <span className="small" style={{ color: "var(--tinta-2)", lineHeight: 1.5 }}>{self ? m.delSelf : isAdmin ? m.delAdmin : m.delHelp}</span>
        {self || isAdmin ? null : <div><button type="button" className={`btn btn-danger ${css.btnDanger}`} onClick={() => setDel(true)}>{m.delBtn}</button></div>}
      </div>
      <ConfirmEmail open={del} onClose={() => setDel(false)} title={m.del} help={m.delHelp} email={email} label={m.typeEmail} button={m.delBtn} confirmButton={m.delConfirm} closeLabel={t.cancel} danger
        onConfirm={(typed) => act(() => deleteAccount({ userId, email: typed }), m.deleted, () => router.push("/admin/usuarios"))} />
    </section>
  );
}
