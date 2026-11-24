"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fill } from "@/i18n";
import { Empty } from "@/components/ui/basics";
import { ConfirmButton, Modal, useToast } from "@/components/ui/client";
import { Icon } from "@/components/ui/Icon";
import { createGroup, grantGroup } from "../_shared/actions";
import css from "../_shared/admin.module.css";
import { GRANT_DEFAULT, GrantFields, type GrantValue } from "../_shared/GrantFields";
import type { AdminText } from "../_shared/messages";
import { AdminHeader } from "../_shared/ui";
import { addMembers, deleteGroup, removeMember, renameGroup } from "./actions";
import type { GroupsText } from "./messages";

export type GroupRow = { id: string; name: string; note: string; members: number; membersText: string; created: string };
export type MemberRow = { id: string; name: string; email: string };
type R = { ok: true } | { ok: false; error: string };

export function GroupsView({ t, m, locale, today, groups, open }: { t: AdminText; m: GroupsText; locale: string; today: string; groups: GroupRow[]; open: { id: string; members: MemberRow[]; more: number } | null }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [form, setForm] = useState<{ name: string; note: string } | null>(null);
  const [rename, setRename] = useState<{ id: string; name: string; old: string } | null>(null);
  const [emails, setEmails] = useState("");
  const [grant, setGrant] = useState<GrantValue>(GRANT_DEFAULT);
  const [error, setError] = useState<string | null>(null);
  const act = (fn: () => Promise<R>, okText: string | ((r: R) => string), after?: () => void) => new Promise<void>((resolve) => start(async () => {
    setError(null);
    const r = await fn();
    if (!r.ok) { setError(r.error); toast(r.error); return resolve(); }
    toast(typeof okText === "string" ? okText : okText(r)); after?.(); router.refresh(); resolve();
  }));
  const current = open ? groups.find((g) => g.id === open.id) : null;

  return (
    <>
      <AdminHeader eyebrow={m.eyebrow} title={m.title}>
        <button type="button" className="btn" aria-expanded={form !== null} onClick={() => setForm(form ? null : { name: "", note: "" })}>{m.create}</button>
      </AdminHeader>

      {form ? (
        <section aria-labelledby="ng" className={css.formOpen}>
          <h2 id="ng">{m.newTitle}</h2>
          <div className={css.grid2}>
            <div className="field"><label htmlFor="ng-n">{m.name}</label><input id="ng-n" className="input" value={form.name} maxLength={80} placeholder={m.namePh} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field"><label htmlFor="ng-o">{m.note}</label><input id="ng-o" className="input" value={form.note} maxLength={300} placeholder={m.notePh} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
          </div>
          <span className="xs muted">{m.help}</span>
          {error ? <p role="alert" className={css.err}>{error}</p> : null}
          <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setForm(null)}>{t.cancel}</button>
            <button type="button" className="btn" disabled={busy} onClick={() => form.name.trim() ? act(() => createGroup(form), m.created, () => setForm(null)) : setError(m.errName)}>{m.createBtn}</button>
          </div>
        </section>
      ) : null}

      {groups.length === 0 ? <Empty icon="users" title={m.empty} text={m.emptySub}><button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm({ name: "", note: "" })}>{m.createBtn}</button></Empty> : (
        <section className={css.tableCard}>
          <div className="table-scroll">
            <table className={css.table} style={{ minWidth: 640 }}>
              <thead><tr><th scope="col">{m.colName}</th><th scope="col">{m.colMembers}</th><th scope="col">{m.colCreated}</th><th scope="col" className="r"><span className="sr-only">{m.see}</span></th></tr></thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id}>
                    <td><span className={css.who}><strong>{g.name}</strong>{g.note ? <span>{g.note}</span> : null}</span></td>
                    <td className="num">{g.membersText}</td>
                    <td style={{ color: "var(--gris)" }}>{g.created}</td>
                    <td className="r">
                      <span className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                        <Link href={open?.id === g.id ? "/admin/grupos" : `/admin/grupos?ver=${g.id}`} className="btn btn-secondary btn-sm" aria-expanded={open?.id === g.id}>{open?.id === g.id ? m.hide : m.see}</Link>
                        <button type="button" className="btn btn-ghost btn-sm" aria-label={`${m.rename}: ${g.name}`} onClick={() => setRename({ id: g.id, name: g.name, old: g.name })} style={{ width: 40, padding: 0 }}><Icon name="edit" size={16} /></button>
                        <ConfirmButton className="btn btn-ghost btn-sm" label={<Icon name="trash" size={16} />} confirmLabel={m.delConfirm} ariaLabel={`${m.del}: ${g.name}`} confirmAriaLabel={m.delConfirm}
                          onConfirm={() => act(() => deleteGroup({ id: g.id }), m.deleted, () => { if (open?.id === g.id) router.push("/admin/grupos"); })} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {groups.length ? <span className="xs muted">{m.delHelp}</span> : null}

      {open && current ? (
        <div className={css.two}>
          <section aria-labelledby="mb" className={css.section}>
            <h2 id="mb">{fill(m.membersTitle, { name: current.name })}</h2>
            {open.members.length === 0 ? <span className="small muted">{m.membersEmpty}</span> : (
              <div className="stack" style={{ gap: 0 }}>
                {open.members.map((u) => (
                  <div key={u.id} className="row-between" style={{ borderTop: "1px solid var(--linea-2)", padding: "8px 0" }}>
                    <span className={css.who}><strong style={{ fontSize: 14 }}>{u.name}</strong><span>{u.email}</span></span>
                    <span className="row" style={{ gap: 4 }}>
                      <Link href={`/admin/usuarios/${u.id}`} className="btn btn-ghost btn-sm">{m.manage}</Link>
                      <button type="button" className={css.chipX} disabled={busy} aria-label={fill(m.remove, { name: u.name })} onClick={() => act(() => removeMember({ groupId: open.id, userId: u.id }), m.removed)}><Icon name="x" size={16} /></button>
                    </span>
                  </div>
                ))}
                {open.more ? <span className="xs muted" style={{ paddingTop: 8 }}>{fill(m.more, { n: open.more })}</span> : null}
              </div>
            )}
            <div className="stack" style={{ gap: 8, borderTop: "1px solid var(--linea-2)", paddingTop: 12 }}>
              <label htmlFor="add-m" style={{ fontSize: 13, fontWeight: 600 }}>{m.add}</label>
              <textarea id="add-m" rows={2} className="textarea" value={emails} placeholder={m.addPh} onChange={(e) => setEmails(e.target.value)} />
              <div><button type="button" className="btn btn-secondary" disabled={busy || !emails.trim()}
                onClick={() => act(() => addMembers({ groupId: open.id, emails }), (r) => {
                  const d = (r as { ok: true; data: { added: number; notFound: string[] } }).data;
                  return fill(m.addedN, { n: d.added }) + (d.notFound.length ? ` ${fill(m.notFound, { list: d.notFound.join(", ") })}` : "");
                }, () => setEmails(""))}>{m.addBtn}</button></div>
            </div>
          </section>
          <section aria-labelledby="ga" className={css.section} style={{ gap: 16 }}>
            <h2 id="ga">{m.grantTitle}</h2>
            <GrantFields t={t} locale={locale} today={today} value={grant} onChange={setGrant} idPrefix="gg" />
            <span className="xs muted">{t.grant.note} {t.grant.notify}</span>
            {error ? <p role="alert" className={css.err}>{error}</p> : null}
            <div><button type="button" className="btn" disabled={busy || current.members === 0}
              onClick={() => act(() => grantGroup({ ...grant, groupId: open.id }), (r) => fill(m.grantedN, { n: (r as { ok: true; data: { granted: number } }).data.granted }))}>{busy ? t.grant.giving : t.grant.give}</button></div>
          </section>
        </div>
      ) : null}

      <Modal open={rename !== null} onClose={() => setRename(null)} title={m.rename} labelClose={t.close}>
        {rename ? (
          <>
            <div className="field"><label htmlFor="rn">{fill(m.renameLabel, { name: rename.old })}</label><input id="rn" className="input" value={rename.name} maxLength={80} onChange={(e) => setRename({ ...rename, name: e.target.value })} /></div>
            <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setRename(null)}>{t.cancel}</button>
              <button type="button" className="btn" disabled={busy || !rename.name.trim()} onClick={() => act(() => renameGroup({ id: rename.id, name: rename.name }), m.renamed, () => setRename(null))}>{t.save}</button>
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}
