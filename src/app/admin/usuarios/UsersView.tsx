"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fill } from "@/i18n";
import { Empty } from "@/components/ui/basics";
import { Switch, useToast } from "@/components/ui/client";
import { createGroup, grantGroup, grantUsers } from "../_shared/actions";
import css from "../_shared/admin.module.css";
import { GRANT_DEFAULT, GrantFields, type GrantValue } from "../_shared/GrantFields";
import { USER_ROLES } from "../_shared/lib";
import type { AdminText } from "../_shared/messages";
import { AdminHeader } from "../_shared/ui";
import { createInvite, exportUsers, setInviteActive } from "./actions";
import { PLAN_FILTERS, type PlanKey } from "./lib";
import type { UsersText } from "./messages";
import { PlanPill } from "./PlanPill";

export type UserRow = { id: string; name: string; email: string; country: string; plan: PlanKey; planLabel: string; groups: string[]; until: string; last: string; failed: boolean; suspended: boolean };
export type CodeRow = { code: string; kind: string; active: boolean; uses: number; max: number | null; duration: string; group: string };
type Group = { id: string; name: string; members: number };
type Who = "uno" | "grupo" | "codigo";

export function UsersView({ t, m, locale, today, q, filter, grantNote, role, country, countries, rows, codes, groups, countText, pager }: {
  t: AdminText; m: UsersText; locale: string; today: string; q: string; filter: string; grantNote: string; role: string; country: string; countries: { code: string; name: string }[];
  rows: UserRow[]; codes: CodeRow[]; groups: Group[]; countText: string; pager: React.ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState<Who>("uno");
  const [grant, setGrant] = useState<GrantValue>(GRANT_DEFAULT);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [emails, setEmails] = useState("");
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [newGroup, setNewGroup] = useState<string | null>(null);
  const [code, setCode] = useState({ code: "", maxUses: "", groupId: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const pickAll = () => setPicked((p) => { const n = new Set(p); rows.forEach((r) => (allPicked ? n.delete(r.id) : n.add(r.id))); return n; });

  const mailText = (mail: { sent: number; of: number } | null) => (mail ? ` ${fill(t.grant.mailed, { n: mail.sent, total: mail.of })}` : "");
  const done = (text: string) => { setMsg({ ok: true, text }); toast(text); router.refresh(); };
  const submit = () => start(async () => {
    setMsg(null);
    if (who === "uno") {
      if (picked.size === 0 && !emails.trim()) return setMsg({ ok: false, text: m.errPick });
      const r = await grantUsers({ ...grant, ids: [...picked], emails });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      const base = (r.data.granted === 1 ? m.grantedOne : fill(m.granted, { n: r.data.granted })) + mailText(r.data.mail);
      setPicked(new Set()); setEmails("");
      return done(r.data.notFound.length ? `${base} ${fill(m.notFound, { list: r.data.notFound.join(", ") })}` : base);
    }
    if (who === "grupo") {
      if (!groupId) return setMsg({ ok: false, text: m.errGroup });
      const r = await grantGroup({ ...grant, groupId });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      return done((r.data.granted === 1 ? m.grantedOne : fill(m.granted, { n: r.data.granted })) + mailText(r.data.mail));
    }
    const r = await createInvite({ ...grant, code: code.code, maxUses: code.maxUses, groupId: code.groupId || null });
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setCode({ code: "", maxUses: "", groupId: "" });
    done(fill(m.codeCreated, { code: r.data }));
  });
  const addGroup = () => start(async () => {
    if (!newGroup?.trim()) return setMsg({ ok: false, text: m.errName });
    const r = await createGroup({ name: newGroup });
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setGroupId(r.data.id); setNewGroup(null);
    done(fill(m.groupCreated, { name: r.data.name }));
  });
  const doExport = () => start(async () => {
    const r = await exportUsers({ q, filtro: filter, rol: role, pais: country });
    if (!r.ok) return toast(r.error);
    const url = URL.createObjectURL(new Blob(["﻿" + r.data], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `usuarios-${today}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast(m.exported);
  });
  const setActive = (c: string, active: boolean) => start(async () => {
    const r = await setInviteActive({ code: c, active });
    if (!r.ok) return toast(r.error);
    router.refresh();
  });

  const WHOS: [Who, string][] = [["uno", m.whoUno], ["grupo", m.whoGrupo], ["codigo", m.whoCodigo]];
  const selGroup = groups.find((g) => g.id === groupId);

  return (
    <>
      <AdminHeader eyebrow={m.eyebrow} title={m.title}>
        <button type="button" className="btn" aria-expanded={open} onClick={() => { setOpen(!open); setMsg(null); }}>{m.give}</button>
      </AdminHeader>

      {open ? (
        <section aria-labelledby="gift" className={css.formOpen}>
          <h2 id="gift">{m.giftTitle}</h2>
          <div className="stack" style={{ gap: 8 }}>
            <span id="g-who" style={{ fontSize: 13, fontWeight: 600 }}>{m.who}</span>
            <div role="radiogroup" aria-labelledby="g-who" className={css.who3}>
              {WHOS.map(([id, l]) => <button key={id} type="button" role="radio" aria-checked={who === id} onClick={() => { setWho(id); setMsg(null); }}>{l}</button>)}
            </div>

            {who === "uno" ? (
              <>
                <span className="small muted">{picked.size ? fill(m.selected, { n: picked.size }) : m.selectedNone}</span>
                <label htmlFor="g-mails" className="sr-only">{m.emails}</label>
                <textarea id="g-mails" rows={2} className="textarea" placeholder={m.emailsPh} value={emails} onChange={(e) => setEmails(e.target.value)} style={{ maxWidth: 560 }} />
              </>
            ) : null}

            {who === "grupo" ? (
              <>
                <div className="row wrap" style={{ gap: 10 }}>
                  <label htmlFor="g-grp" className="sr-only">{m.group}</label>
                  {groups.length ? (
                    <select id="g-grp" className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)} style={{ width: "auto", minWidth: 280, maxWidth: "100%" }}>
                      {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  ) : <span className="small muted">{m.noGroups}</span>}
                  <button type="button" className="btn btn-dashed" aria-expanded={newGroup !== null} onClick={() => setNewGroup(newGroup === null ? "" : null)}>{m.newGroup}</button>
                </div>
                {selGroup ? <span className="xs muted">{fill(m.groupMembers, { n: selGroup.members })}</span> : null}
                {newGroup !== null ? (
                  <div className="stack" style={{ background: "var(--papel-3)", borderRadius: 14, padding: 16, maxWidth: 620 }}>
                    <strong style={{ fontSize: 15 }}>{m.newGroupTitle}</strong>
                    <div className="field"><label htmlFor="ng-n">{m.groupName}</label><input id="ng-n" className="input" value={newGroup} maxLength={80} placeholder={m.groupNamePh} onChange={(e) => setNewGroup(e.target.value)} /></div>
                    <span className="xs muted">{m.groupHelp}</span>
                    <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNewGroup(null)}>{t.cancel}</button>
                      <button type="button" className="btn btn-sm" disabled={busy} onClick={addGroup}>{m.createGroup}</button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {who === "codigo" ? (
              <>
                <div className="row wrap" style={{ gap: 10, alignItems: "flex-end" }}>
                  <div className="field"><label htmlFor="g-code">{m.code}</label><input id="g-code" className="input" value={code.code} maxLength={40} placeholder={m.codePh} onChange={(e) => setCode({ ...code, code: e.target.value.toUpperCase().replace(/\s/g, "") })} style={{ width: 200, fontWeight: 600, letterSpacing: ".08em" }} /></div>
                  <div className="field"><label htmlFor="g-max">{m.maxUses}</label><input id="g-max" className="input num" inputMode="numeric" value={code.maxUses} placeholder={m.maxUsesPh} onChange={(e) => setCode({ ...code, maxUses: e.target.value.replace(/\D/g, "") })} style={{ width: 160 }} /></div>
                  <div className="field"><label htmlFor="g-cg">{m.codeGroup}</label>
                    <select id="g-cg" className="input" value={code.groupId} onChange={(e) => setCode({ ...code, groupId: e.target.value })} style={{ width: "auto", minWidth: 200 }}>
                      <option value="">{m.noGroup}</option>
                      {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>
                </div>
                <span className="xs muted">{m.codeHelp}</span>
              </>
            ) : null}
          </div>

          <GrantFields t={t} locale={locale} today={today} value={grant} onChange={setGrant} idPrefix="g" showNotify={who !== "codigo"} />
          <span className="small muted">{grantNote} {who !== "codigo" ? t.grant.notify : ""}</span>
          {msg ? <p role="status" className={msg.ok ? css.ok : css.err}>{msg.text}</p> : null}
          <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>{t.cancel}</button>
            <button type="button" className="btn" disabled={busy} onClick={submit}>{busy ? t.grant.giving : who === "codigo" ? m.createCode : t.grant.give}</button>
          </div>
        </section>
      ) : null}

      <form method="get" action="/admin/usuarios" className={css.toolbar} role="search">
        <label htmlFor="u-q" className="sr-only">{m.search}</label>
        <input id="u-q" name="q" type="search" className="input" defaultValue={q} placeholder={m.searchPh} />
        <label htmlFor="u-p" className="sr-only">{m.plan}</label>
        <select id="u-p" name="filtro" className="input" defaultValue={filter} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
          {PLAN_FILTERS.map((f) => <option key={f} value={f}>{m.filters[f]}</option>)}
        </select>
        <label htmlFor="u-c" className="sr-only">{m.country}</label>
        <select id="u-c" name="pais" className="input" defaultValue={country} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
          <option value="all">{m.countryAll}</option>
          {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          <option value="otro">{m.countryOther}</option>
        </select>
        <label htmlFor="u-r" className="sr-only">{m.role}</label>
        <select id="u-r" name="rol" className="input" defaultValue={role} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
          {USER_ROLES.map((r) => <option key={r} value={r}>{m.roles[r]}</option>)}
        </select>
        <button type="submit" className="btn btn-secondary">{m.searchBtn}</button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={doExport}>{m.export}</button>
      </form>

      {rows.length === 0 ? (
        <Empty icon="search" title={m.empty} text={m.emptySub}><Link href="/admin/usuarios" className="btn btn-secondary btn-sm">{m.clear}</Link></Empty>
      ) : (
        <section className={css.tableCard} aria-label={countText}>
          <div className="table-scroll">
            <table className={css.table} style={{ minWidth: 860 }}>
              <thead><tr>
                <th scope="col" style={{ width: 44 }}><input type="checkbox" aria-label={m.pickAll} checked={allPicked} onChange={pickAll} style={{ width: 20, height: 20, accentColor: "var(--tinta)" }} /></th>
                <th scope="col">{m.colUser}</th><th scope="col">{m.colCountry}</th><th scope="col">{m.colPlan}</th><th scope="col">{m.colUntil}</th><th scope="col">{m.colLast}</th><th scope="col" className="r">{m.colActions}</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><input type="checkbox" aria-label={fill(m.pickRow, { name: r.name })} checked={picked.has(r.id)} onChange={() => toggle(r.id)} style={{ width: 20, height: 20, accentColor: "var(--tinta)" }} /></td>
                    <td><span className={css.who}><strong>{r.name}</strong><span>{r.email}</span></span></td>
                    <td>{r.country}</td>
                    <td><span className="stack" style={{ gap: 4 }}><PlanPill t={t} plan={r.plan} label={r.planLabel} failed={r.failed} suspended={r.suspended} />{r.groups.length ? <span className="xs muted">{r.groups.join(", ")}</span> : null}</span></td>
                    <td style={{ color: "var(--tinta-2)" }}>{r.until}</td>
                    <td style={{ color: "var(--gris)" }}>{r.last}</td>
                    <td className="r"><Link href={`/admin/usuarios/${r.id}`} className="btn btn-secondary btn-sm">{m.manage}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <div className="row-between wrap"><span className="xs muted">{countText}</span>{pager}</div>
      <span className="xs muted">{m.footer}</span>

      <section aria-labelledby="codes" className={css.section}>
        <div><h2 id="codes">{m.codes}</h2><span className="xs muted">{m.codesSub}</span></div>
        {codes.length === 0 ? <Empty icon="users" title={m.codesEmpty} text={m.codesEmptySub} /> : (
          <div className="table-scroll">
            <table className={`${css.table} ${css.plain}`} style={{ minWidth: 640 }}>
              <thead><tr><th scope="col">{m.cCode}</th><th scope="col">{m.cKind}</th><th scope="col">{m.cDur}</th><th scope="col">{m.cGroup}</th><th scope="col">{m.cUses}</th><th scope="col" className="r">{m.cActive}</th></tr></thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.code}>
                    <td><strong style={{ letterSpacing: ".06em" }}>{c.code}</strong></td>
                    <td>{t.kinds[c.kind] ?? c.kind}</td>
                    <td>{c.duration}</td>
                    <td>{c.group}</td>
                    <td className="num">{c.max ? fill(m.usesOf, { n: c.uses, max: c.max }) : c.uses}</td>
                    <td className="r"><span style={{ display: "inline-flex" }}><Switch checked={c.active} disabled={busy} label={fill(m.toggleCode, { code: c.code })} onChange={(v) => setActive(c.code, v)} /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
