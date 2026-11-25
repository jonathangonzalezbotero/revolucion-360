"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fill } from "@/i18n";
import { Pill } from "@/components/ui/basics";
import { ConfirmButton, Modal, useToast } from "@/components/ui/client";
import css from "../_shared/admin.module.css";
import type { AdminText } from "../_shared/messages";
import { inviteAdmin, setAdminRole } from "./actions";
import type { M } from "./messages";
import { ADMIN_ROLES, type AdminRole } from "./roles";

export type AdminRow = { id: string; name: string; email: string; role: AdminRole; mfa: boolean | null };
type Text = (typeof M)["es"];

/** Sección "Administradores" de Registro de actividad: la ven todos; invitar y cambiar roles, solo el Dueño. */
export function AdminsView({ m, t, admins, me, isOwner, mfaOn }: { m: Text; t: AdminText; admins: AdminRow[]; me: string; isOwner: boolean; mfaOn: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [invite, setInvite] = useState<{ email: string; role: AdminRole } | null>(null);
  const [edit, setEdit] = useState<{ row: AdminRow; role: AdminRole } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const roleName = (r: string) => t.adminRoles[r] ?? r;
  const close = () => { setInvite(null); setEdit(null); setError(null); };

  const send = (fn: () => Promise<{ ok: true; data: string } | { ok: false; error: string }>, okText: (data: string) => string) => start(async () => {
    setError(null);
    const r = await fn();
    if (!r.ok) { setError(r.error); return; }
    toast(okText(r.data));
    close();
    router.refresh();
  });

  const roleField = (id: string, value: AdminRole, onChange: (r: AdminRole) => void) => (
    <fieldset className="stack" style={{ gap: 8, border: 0, padding: 0, margin: 0 }}>
      <legend style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{m.inviteRole}</legend>
      {ADMIN_ROLES.map((r) => (
        <label key={r} htmlFor={`${id}-${r}`} className="row" style={{ gap: 10, alignItems: "flex-start", padding: "10px 12px", border: "1px solid var(--linea)", borderRadius: "var(--r-md)", cursor: "pointer", background: value === r ? "var(--amarillo-suave)" : "var(--blanco)" }}>
          <input id={`${id}-${r}`} type="radio" name={id} value={r} checked={value === r} onChange={() => onChange(r)} style={{ marginTop: 3 }} />
          <span className="stack" style={{ gap: 2 }}><strong style={{ fontSize: 14 }}>{roleName(r)}</strong><span className="xs muted">{m.roleDesc[r]}</span></span>
        </label>
      ))}
    </fieldset>
  );

  return (
    <section aria-labelledby="ad" className={css.section}>
      <div className="row-between wrap">
        <h2 id="ad">{m.admins}</h2>
        {isOwner ? <button type="button" className="btn btn-dashed btn-sm" onClick={() => { setError(null); setInvite({ email: "", role: "support" }); }}>{m.invite}</button> : null}
      </div>
      <div className="table-scroll">
        <table className={`${css.table} ${css.plain}`} style={{ minWidth: 620 }}>
          <thead><tr><th scope="col">{m.colName}</th><th scope="col">{m.colRole}</th><th scope="col">{m.colCan}</th><th scope="col">{m.colSecurity}</th>{isOwner ? <th scope="col" className="r"><span className="sr-only">{m.change}</span></th> : null}</tr></thead>
          <tbody>
            {admins.map((a) => {
              const name = a.name || a.email;
              return (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{name}{a.id === me ? <span className="muted" style={{ fontWeight: 500 }}> · {m.you}</span> : null}</td>
                  <td>{roleName(a.role)}</td>
                  <td style={{ color: "var(--tinta-2)" }}>{m.can[a.role]}</td>
                  <td>{a.mfa === null
                    ? <Pill tone={mfaOn ? "ok" : "warn"}>{mfaOn ? m.security : m.securityOff}</Pill>
                    : <Pill tone={a.mfa ? "ok" : "warn"}>{a.mfa ? m.mfaOn : m.mfaOff}</Pill>}</td>
                  {isOwner ? (
                    <td className="r">{a.id === me ? null : (
                      <button type="button" className="btn btn-secondary btn-sm" aria-label={fill(m.changeAria, { name })} onClick={() => { setError(null); setEdit({ row: a, role: a.role }); }}>{m.change}</button>
                    )}</td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <span className="xs muted">{m.securityNote}</span>

      <Modal open={invite !== null} onClose={close} title={m.inviteTitle} labelClose={t.close}>
        {invite ? (
          <form className="stack" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); send(() => inviteAdmin(invite), (msg) => msg); }}>
            <div className="field">
              <label htmlFor="inv-e">{m.inviteEmail}</label>
              <input id="inv-e" type="email" className="input" autoComplete="off" required maxLength={200} placeholder={m.inviteEmailPh} value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
            </div>
            {roleField("inv-r", invite.role, (role) => setInvite({ ...invite, role }))}
            <span className="xs muted">{m.inviteNote}</span>
            {error ? <p role="alert" className={css.err}>{error}</p> : null}
            <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={close}>{t.cancel}</button>
              <button type="submit" className="btn" disabled={busy}>{busy ? m.inviting : m.inviteBtn}</button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal open={edit !== null} onClose={close} title={edit ? fill(m.changeTitle, { name: edit.row.name || edit.row.email }) : m.change} labelClose={t.close}>
        {edit ? (
          <div className="stack" style={{ gap: 14 }}>
            <span className="muted" style={{ fontSize: 14 }}>{edit.row.email}</span>
            {roleField("chg-r", edit.role, (role) => setEdit({ ...edit, role }))}
            {error ? <p role="alert" className={css.err}>{error}</p> : null}
            <div className="row wrap" style={{ justifyContent: "space-between", gap: 10 }}>
              <ConfirmButton className="btn btn-danger btn-sm" label={m.remove} confirmLabel={m.removeConfirm}
                onConfirm={() => send(() => setAdminRole({ userId: edit.row.id, role: "none" }), () => fill(m.removed, { name: edit.row.name || edit.row.email }))} />
              <div className="row" style={{ gap: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={close}>{t.cancel}</button>
                <button type="button" className="btn" disabled={busy || edit.role === edit.row.role}
                  onClick={() => send(() => setAdminRole({ userId: edit.row.id, role: edit.role }), (r) => fill(m.changed, { role: roleName(r) }))}>{m.changeBtn}</button>
              </div>
            </div>
            <span className="xs muted">{m.removeNote}</span>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
