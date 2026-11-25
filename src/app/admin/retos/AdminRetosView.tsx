"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fill, type Locale } from "@/i18n";
import { Empty } from "@/components/ui/basics";
import { Switch, useToast } from "@/components/ui/client";
import { formatDate, type ISODate } from "@/lib/engine";
import {
  ACTIONS, adminStatus, AUDIENCES, IMAGES, imageSrc, MEASURES, pctOf, POINT_CAP, targetOf,
  type Action, type Audience, type ImageKey, type Measure,
} from "@/app/(app)/retos/lib";
import shared from "../_shared/admin.module.css";
import { AdminHeader } from "../_shared/ui";
import { saveChallenge } from "./actions";
import type { AdminRetosMessages } from "./messages";
import css from "./retos.module.css";

export type ChallengeItem = {
  id: string; title: string; description: string; image: string; measure: Measure; action: Action | null; wildcards: number; days: number;
  starts_on: ISODate | null; audience: Audience; group_id: string | null; invite_code: string | null; points: number; badge_name: string | null;
  show_board: boolean; status: "draft" | "published"; target: number; joined: number; done: number; left: number;
};
type Group = { id: string; name: string };
type Form = {
  id: string | null; status: "draft" | "published"; title: string; description: string; image: ImageKey; measure: Measure; action: Action;
  wildcards: string; days: string; startsOn: string; audience: Audience; groupId: string; inviteCode: string; points: string; badgeName: string; showBoard: boolean;
};
type Props = { m: AdminRetosMessages; locale: Locale; today: ISODate; items: ChallengeItem[]; groups: Group[]; creator: string };

const NEW: Form = {
  id: null, status: "draft", title: "", description: "", image: "meta-emergencia", measure: "checkin", action: "expense",
  wildcards: "1", days: "30", startsOn: "", audience: "all", groupId: "", inviteCode: "", points: "30", badgeName: "", showBoard: false,
};
const toForm = (c: ChallengeItem): Form => ({
  id: c.id, status: c.status, title: c.title, description: c.description, image: (IMAGES as readonly string[]).includes(c.image) ? (c.image as ImageKey) : "meta-emergencia",
  measure: c.measure, action: c.action ?? "expense", wildcards: String(c.wildcards), days: String(c.days), startsOn: c.starts_on ?? "",
  audience: c.audience, groupId: c.group_id ?? "", inviteCode: c.invite_code ?? "", points: String(c.points), badgeName: c.badge_name ?? "", showBoard: c.show_board,
});
const int = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);

export function AdminRetosView({ m, locale, today, items, groups, creator }: Props) {
  const [sel, setSel] = useState<string | null>(items[0]?.id ?? null);
  const current = items.find((c) => c.id === sel) ?? null;
  const groupName = new Map(groups.map((g) => [g.id, g.name]));

  const statusText = (c: ChallengeItem) => {
    const st = adminStatus({ status: c.status, startsOn: c.starts_on, days: c.days }, today);
    return { st, text: st === "scheduled" ? fill(m.status.scheduled, { date: formatDate(c.starts_on!, locale, "short") }) : m.status[st] };
  };
  const audText = (c: { audience: Audience; group_id: string | null; invite_code: string | null }) =>
    c.audience === "all" ? m.aud.all : c.audience === "group" ? (c.group_id && groupName.get(c.group_id)) || m.audNoGroup : fill(m.audCode, { code: c.invite_code ?? "" });
  const howText = (c: { measure: Measure; action: Action | null }) =>
    c.measure === "checkin" ? m.howList.checkin : fill(m.howList.app, { action: m.actionsShort[c.action ?? "expense"] });

  return (
    <>
      <AdminHeader eyebrow={m.eyebrow} title={m.title}>
        <button type="button" className="btn" onClick={() => setSel(null)}>{m.add}</button>
      </AdminHeader>

      <section aria-labelledby="rt-list" className={shared.section}>
        <h2 id="rt-list">{m.list}</h2>
        {items.length ? (
          <div className={css.tableWrap}>
            <table className={`${shared.table} ${shared.plain}`}>
              <thead>
                <tr><th>{m.cols.title}</th><th>{m.cols.status}</th><th>{m.cols.aud}</th><th>{m.cols.how}</th><th className={shared.r}>{m.cols.joined}</th><th className={shared.r}>{m.cols.done}</th><th className={shared.r}>{m.cols.left}</th></tr>
              </thead>
              <tbody>
                {items.map((c) => {
                  const { st, text } = statusText(c);
                  const early = st === "draft" || st === "scheduled";
                  return (
                    <tr key={c.id} aria-selected={c.id === sel} className={css.row} onClick={() => setSel(c.id)}>
                      <td><button type="button" className={css.rowBtn} onClick={(e) => { e.stopPropagation(); setSel(c.id); }}>{c.title}</button></td>
                      <td className={css.status} data-active={st === "active" || st === "open"}>{text}</td>
                      <td>{audText(c)}</td>
                      <td className={css.muted}>{howText(c)}</td>
                      <td className={`${shared.r} num`}>{c.joined}</td>
                      <td className={`${shared.r} num`}>{early ? "—" : pctOf(c.done, c.joined)}</td>
                      <td className={`${shared.r} num`}>{early ? "—" : pctOf(c.left, c.joined)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty icon="target" title={m.empty} text={m.emptySub} />}
      </section>

      <Editor key={current?.id ?? "new"} m={m} locale={locale} start={current ? toForm(current) : NEW} groups={groups} creator={creator}
        onSaved={(id) => setSel(id)} />
    </>
  );
}

function Editor({ m, locale, start, groups, creator, onSaved }: { m: AdminRetosMessages; locale: Locale; start: Form; groups: Group[]; creator: string; onSaved: (id: string) => void }) {
  const [f, setF] = useState<Form>(start);
  const [error, setError] = useState("");
  const [pending, go] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const locked = f.status === "published";
  const isApp = f.measure === "app";
  const days = int(f.days), wild = int(f.wildcards) || 0, pts = int(f.points) || 0;
  const target = Number.isFinite(days) && days > 0 ? targetOf(isApp ? f.action : null, days, wild) : null;
  const unit = isApp && f.action === "lesson" ? m.units.lesson : isApp && f.action === "closure" ? m.units.closure : m.units.day;

  const save = (publish: boolean) => go(async () => {
    setError("");
    const r = await saveChallenge({
      id: f.id, title: f.title, description: f.description, image: f.image, measure: f.measure, action: isApp ? f.action : null,
      wildcards: Number.isFinite(int(f.wildcards)) ? int(f.wildcards) : 0, days: Number.isFinite(days) ? days : 0, startsOn: f.startsOn || null,
      audience: f.audience, groupId: f.groupId || null, inviteCode: f.inviteCode.trim() || null, points: Number.isFinite(int(f.points)) ? int(f.points) : -1,
      badgeName: f.badgeName.trim() || null, showBoard: f.showBoard, publish,
    });
    if (!r.ok) { setError(r.error); return; }
    setF((x) => ({ ...x, id: r.data.id, status: publish || x.status === "published" ? "published" : "draft" })); // otro clic antes de recargar no crea otro
    toast(r.data.text);
    onSaved(r.data.id);
    router.refresh();
  });

  // "Así lo ve el alumno"
  const groupName = groups.find((g) => g.id === f.groupId)?.name ?? m.aud.group;
  const who = f.audience === "all" ? m.forAll : fill(m.createdBy, { who: f.audience === "group" ? groupName : m.byCode, name: creator });
  const how = isApp ? fill(m.phowApp, { action: m.actions[f.action].toLowerCase() }) : m.phowCheck;
  const startText = f.startsOn ? `${formatDate(f.startsOn, locale, "short")} ${f.startsOn.slice(0, 4)}` : m.pstartJoin;
  const badge = f.badgeName.trim();
  const prize = pts > 0 && badge ? fill(m.prizeBoth, { n: pts, name: badge }) : pts > 0 ? fill(m.prizePts, { n: pts }) : badge ? fill(m.prizeBadge, { name: badge }) : m.noPrize;

  return (
    <div className={css.two}>
      <section aria-labelledby="rt-ed" className={shared.section} style={{ gap: 14 }}>
        <h2 id="rt-ed">{f.id ? m.edit : m.newTitle}</h2>
        <div className="field"><label htmlFor="rt-t">{m.fTitle}</label><input id="rt-t" className="input" maxLength={80} value={f.title} onChange={(e) => set("title", e.target.value)} /></div>
        <div className="field"><label htmlFor="rt-d">{m.fDesc}</label><input id="rt-d" className="input" maxLength={240} value={f.description} onChange={(e) => set("description", e.target.value)} /></div>
        <div className="field">
          <span className="label" id="rt-img">{m.fImg}</span>
          <div role="radiogroup" aria-labelledby="rt-img" className={css.imgs}>
            {IMAGES.map((k, i) => (
              <button key={k} type="button" role="radio" aria-checked={f.image === k} aria-label={`${m.fImg} ${i + 1}`} className={css.imgBtn} onClick={() => set("image", k)}>
                <Image src={imageSrc(k)} alt="" width={48} height={48} sizes="48px" />
              </button>
            ))}
          </div>
        </div>
        {locked ? <p className={css.note}>{m.locked}</p> : null}
        <div className={css.grid}>
          <div className="field"><label htmlFor="rt-k">{m.fMeasure}</label>
            <select id="rt-k" className="input" value={f.measure} disabled={locked} onChange={(e) => set("measure", e.target.value as Measure)}>
              {MEASURES.map((x) => <option key={x} value={x}>{m.measure[x]}</option>)}
            </select></div>
          {isApp ? (
            <div className="field"><label htmlFor="rt-a">{m.fAction}</label>
              <select id="rt-a" className="input" value={f.action} disabled={locked} onChange={(e) => set("action", e.target.value as Action)}>
                {ACTIONS.map((x) => <option key={x} value={x}>{m.actions[x]}</option>)}
              </select></div>
          ) : null}
          <div className="field"><label htmlFor="rt-c">{isApp ? m.fWildApp : m.fWild}</label>
            <input id="rt-c" className="input num" inputMode="numeric" placeholder="1" value={f.wildcards} disabled={locked} onChange={(e) => set("wildcards", e.target.value)} /></div>
          <div className="field"><label htmlFor="rt-n">{m.fDays}</label>
            <input id="rt-n" className="input num" inputMode="numeric" placeholder="30" value={f.days} disabled={locked} onChange={(e) => set("days", e.target.value)} /></div>
          <div className="field"><label htmlFor="rt-s">{m.fStart}</label>
            <input id="rt-s" className="input" type="date" value={f.startsOn} disabled={locked} aria-describedby="rt-s-h" onChange={(e) => set("startsOn", e.target.value)} />
            <span id="rt-s-h" className={css.hint}>{m.fStartHint}</span></div>
          <div className="field"><label htmlFor="rt-u">{m.fAud}</label>
            <select id="rt-u" className="input" value={f.audience} disabled={locked} onChange={(e) => set("audience", e.target.value as Audience)}>
              {AUDIENCES.map((x) => <option key={x} value={x}>{m.aud[x]}</option>)}
            </select></div>
          {f.audience === "group" ? (
            <div className="field"><label htmlFor="rt-g">{m.fGroup}</label>
              <select id="rt-g" className="input" value={f.groupId} disabled={locked} onChange={(e) => set("groupId", e.target.value)}>
                <option value="">{groups.length ? m.pickGroup : m.noGroups}</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select></div>
          ) : null}
          {f.audience === "code" ? (
            <div className="field"><label htmlFor="rt-cd">{m.fCode}</label>
              <input id="rt-cd" className="input" maxLength={40} placeholder={m.fCodePh} value={f.inviteCode} disabled={locked} onChange={(e) => set("inviteCode", e.target.value.toUpperCase())} /></div>
          ) : null}
          <div className="field"><label htmlFor="rt-p">{m.fPts}</label>
            <input id="rt-p" className="input num" inputMode="numeric" placeholder={String(POINT_CAP[f.measure])} value={f.points} onChange={(e) => set("points", e.target.value)} /></div>
          <div className="field"><label htmlFor="rt-b">{m.fBadge}</label>
            <input id="rt-b" className="input" maxLength={40} placeholder={m.fBadgePh} value={f.badgeName} onChange={(e) => set("badgeName", e.target.value)} /></div>
        </div>
        <p className={css.hint}>
          {target !== null ? `${fill(m.target, { n: target, unit })} ` : ""}{fill(m.capNote, { checkin: POINT_CAP.checkin, app: POINT_CAP.app })}
        </p>
        <div className={css.switchRow}><span>{m.board}</span><Switch checked={f.showBoard} label={m.board} onChange={(v) => set("showBoard", v)} /></div>
        <div className={css.note}><strong>{m.crm}</strong> {m.crmText} {m.crmDraft}</div>
        {error ? <p role="alert" className={css.error}>{error}</p> : null}
        <div className={css.buttons}>
          {locked ? (
            <button type="button" className="btn" disabled={pending} onClick={() => save(false)}>{pending ? m.saving : m.saveChanges}</button>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => save(false)}>{m.saveDraft}</button>
              <button type="button" className="btn" disabled={pending} onClick={() => save(true)}>{pending ? m.saving : m.publish}</button>
            </>
          )}
        </div>
      </section>

      <section aria-labelledby="rt-pv" className={`${shared.section} ${css.previewBox}`}>
        <h2 id="rt-pv">{m.preview}</h2>
        <article className={css.preview}>
          <Image src={imageSrc(f.image)} alt="" width={96} height={96} sizes="96px" className={css.previewImg} />
          <span className={css.small}>{who}</span>
          <strong className={css.previewTitle}>{f.title || m.fTitle}</strong>
          {f.description ? <span className={css.previewDesc}>{f.description}</span> : null}
          <span className={css.small}>{fill(m.pmeta, { how, days: Number.isFinite(days) ? days : "—", start: startText })}</span>
          <span className={css.small}>{m.prize} <strong className={css.strong}>{prize}</strong></span>
          <span className={css.fakeBtn} aria-hidden="true">{m.join}</span>
        </article>
        <p className={css.small} style={{ margin: 0, lineHeight: 1.5 }}>{m.privacy}</p>
      </section>
    </div>
  );
}
