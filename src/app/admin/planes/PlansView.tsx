"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fill } from "@/i18n";
import { Empty, Pill } from "@/components/ui/basics";
import { Switch, useToast } from "@/components/ui/client";
import type { Tier } from "@/lib/engine";
import css from "../_shared/admin.module.css";
import { AdminHeader } from "../_shared/ui";
import { createCoupon, pushCoupon, savePlans, setCouponActive } from "./actions";
import { PLAN_FEATURES, changedFeatures, cleanCouponCode } from "./lib";
import type { PlanesText } from "./messages";
import p from "./planes.module.css";

export type RegionView = { region: string; name: string; currency: string; monthly: string; yearly: string; student: string; info: string; pending: boolean };
export type CouponView = { id: string; code: string; discount: string; uses: string; active: boolean; inStripe: boolean };
type R<T = unknown> = { ok: true; data: T } | { ok: false; error: string };
type RegionEdit = { region: string; monthly: string; yearly: string; student: string };
const EMPTY_CUP = { code: "", pct: "", months: "", max: "" };

export function PlansView({ m, stripeOn, regions, coupons, trial: trial0, features: feats0, freeGoals }: {
  m: PlanesText; stripeOn: boolean; regions: RegionView[]; coupons: CouponView[];
  trial: { enabled: boolean; days: string }; features: Record<string, Tier>; freeGoals: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [edits, setEdits] = useState<RegionEdit[]>(() => regions.map(({ region, monthly, yearly, student }) => ({ region, monthly, yearly, student })));
  const [trial, setTrial] = useState(trial0);
  const [feats, setFeats] = useState(feats0);
  const [cup, setCup] = useState<typeof EMPTY_CUP | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cupError, setCupError] = useState<string | null>(null);

  const act = <T,>(fn: () => Promise<R<T>>, onOk: (data: T) => string, onError: (e: string | null) => void = setError, after?: () => void) => start(async () => {
    onError(null);
    const r = await fn();
    if (!r.ok) { onError(r.error); toast(r.error); return; }
    toast(onOk(r.data)); after?.(); router.refresh();
  });

  const setEdit = (i: number, k: keyof Omit<RegionEdit, "region">, v: string) => setEdits(edits.map((e, j) => (j === i ? { ...e, [k]: v } : e)));
  const save = () => act(
    () => savePlans({ regions: edits, trial, features: changedFeatures(feats0, feats) }),
    (d: { changed: number; warning: string | null }) => (d.changed === 0 ? m.nothing : d.warning ?? m.saved),
  );
  const preview = (c: typeof EMPTY_CUP) => {
    const pct = c.pct.trim() || "0", n = c.months.trim();
    return !n || n === "0" ? fill(m.cup.previewForever, { pct }) : n === "1" ? fill(m.cup.previewOne, { pct }) : fill(m.cup.previewMonths, { pct, n });
  };
  const created = (d: { stripe: "ok" | "pending" | "off" }) => (d.stripe === "ok" ? m.cup.created : d.stripe === "pending" ? m.cup.createdPending : m.cup.createdOff);

  return (
    <>
      <AdminHeader eyebrow={m.eyebrow} title={m.title}>
        <button type="button" className="btn" disabled={busy} onClick={save}>{busy ? m.saving : m.save}</button>
      </AdminHeader>
      {error ? <p role="alert" className={css.err}>{error}</p> : null}
      {!stripeOn ? <div className="banner" role="status">{m.stripe.offNote}</div> : null}

      <div className={css.two}>
        <section aria-labelledby="pr" className={`${css.section} ${p.prices}`}>
          <h2 id="pr">{m.prices.title}</h2>
          {regions.length === 0 ? <Empty icon="globe" title={m.prices.empty} text={m.prices.emptySub} /> : (
            <>
              <div className={p.regionHead} aria-hidden="true"><span>{m.prices.region}</span><span>{m.prices.currency}</span><span>{m.prices.monthly}</span><span>{m.prices.yearly}</span><span>{m.prices.student}</span></div>
              {regions.map((r, i) => (
                <div key={r.region} className={p.regionRow}>
                  <span className={p.name}>{r.name}</span>
                  <span className={p.cur}>{r.currency}</span>
                  <label className={p.cell}><span className={p.mLabel} aria-hidden="true">{m.prices.monthly}</span><span className="sr-only">{fill(m.prices.monthlyOf, { region: r.name })}</span>
                    <input className="input num" inputMode="decimal" autoComplete="off" maxLength={20} placeholder="—" value={edits[i]?.monthly ?? ""} onChange={(e) => setEdit(i, "monthly", e.target.value)} /></label>
                  <label className={p.cell}><span className={p.mLabel} aria-hidden="true">{m.prices.yearly}</span><span className="sr-only">{fill(m.prices.yearlyOf, { region: r.name })}</span>
                    <input className="input num" inputMode="decimal" autoComplete="off" maxLength={20} placeholder="—" value={edits[i]?.yearly ?? ""} onChange={(e) => setEdit(i, "yearly", e.target.value)} /></label>
                  <label className={p.cell}><span className={p.mLabel} aria-hidden="true">{m.prices.student}</span><span className="sr-only">{fill(m.prices.studentOf, { region: r.name })}</span>
                    <input className="input num" inputMode="numeric" autoComplete="off" maxLength={3} value={edits[i]?.student ?? ""} onChange={(e) => setEdit(i, "student", e.target.value)} /></label>
                  {r.info ? <span className={`${p.info} ${r.pending ? p.infoPending : ""}`}>{r.info}</span> : null}
                </div>
              ))}
            </>
          )}
          <div className={p.trial}>
            <Switch checked={trial.enabled} onChange={(v) => setTrial({ ...trial, enabled: v })} label={m.trial.switch} />
            <strong>{m.trial.label}</strong>
            <label htmlFor="tr-d" className="sr-only">{m.trial.days}</label>
            <input id="tr-d" className={`input num ${p.days}`} inputMode="numeric" maxLength={2} value={trial.days} onChange={(e) => setTrial({ ...trial, days: e.target.value })} />
            <span className="small muted">{m.trial.unit}</span>
          </div>
          {!trial.enabled ? <p className={p.note}>{m.trial.off}</p> : null}
          <p className={p.note}>{m.prices.note}</p>
          <p className={p.note}><strong>{m.prices.syncNote}</strong></p>
          <p className={p.note}>{m.prices.studentNote}</p>
        </section>

        <section aria-labelledby="ft" className={`${css.section} ${p.feats}`}>
          <h2 id="ft">{m.feats.title}</h2>
          {PLAN_FEATURES.map((k) => {
            const pro = feats[k] === "pro";
            const name = fill(m.feats.names[k], { n: freeGoals });
            const lbl = pro ? m.feats.pro : m.feats.free;
            return (
              <div key={k} className={p.feat}>
                <span>{name}</span>
                <button type="button" className={`${p.tier} ${pro ? p.tierPro : p.tierFree}`} aria-label={`${fill(m.feats.toggle, { name })}: ${lbl}`}
                  onClick={() => setFeats({ ...feats, [k]: pro ? "free" : "pro" })}>{lbl}</button>
              </div>
            );
          })}
          <span className="xs muted" style={{ marginTop: 6 }}>{m.feats.help}</span>
          <span className="xs muted">{m.feats.founder} <Link href="/admin/usuarios?filtro=fundador">{m.feats.founderLink}</Link></span>
        </section>
      </div>

      <section aria-labelledby="cup" className={css.section}>
        <div className={p.cupHead}>
          <h2 id="cup">{m.cup.title}</h2>
          <button type="button" className={p.addBtn} aria-expanded={cup !== null} onClick={() => { setCupError(null); setCup(cup ? null : EMPTY_CUP); }}>{m.cup.add}</button>
        </div>
        {cup ? (
          <div className={p.cupForm}>
            <div className={p.cupGrid}>
              <div className="field"><label htmlFor="cu-c">{m.cup.code}</label><input id="cu-c" className={`input ${p.code}`} autoComplete="off" maxLength={40} value={cup.code} onChange={(e) => setCup({ ...cup, code: cleanCouponCode(e.target.value) })} /></div>
              <div className="field"><label htmlFor="cu-p">{m.cup.pct}</label><input id="cu-p" className="input num" inputMode="numeric" maxLength={3} value={cup.pct} onChange={(e) => setCup({ ...cup, pct: e.target.value })} /></div>
              <div className="field"><label htmlFor="cu-m">{m.cup.months}</label><input id="cu-m" className="input num" inputMode="numeric" maxLength={2} placeholder="0" value={cup.months} onChange={(e) => setCup({ ...cup, months: e.target.value })} /></div>
              <div className="field"><label htmlFor="cu-x">{m.cup.max}</label><input id="cu-x" className="input num" inputMode="numeric" maxLength={6} placeholder={m.cup.maxPh} value={cup.max} onChange={(e) => setCup({ ...cup, max: e.target.value })} /></div>
            </div>
            {cupError ? <p role="alert" className={css.err}>{cupError}</p> : null}
            <div className={p.cupFoot}>
              <span>{m.cup.preview} <strong>{preview(cup)}</strong></span>
              <div className="row" style={{ gap: 10 }}>
                <button type="button" className={`btn btn-secondary btn-sm ${p.tap}`} onClick={() => setCup(null)}>{m.cup.cancel}</button>
                <button type="button" className={`btn btn-sm ${p.tap}`} disabled={busy} onClick={() => act(() => createCoupon(cup), created, setCupError, () => setCup(null))}>{busy ? m.cup.creating : m.cup.create}</button>
              </div>
            </div>
            <span className="xs muted">{m.cup.help}</span>
          </div>
        ) : null}

        {coupons.length === 0 ? (
          <Empty icon="receipt" title={m.cup.empty} text={m.cup.emptySub}>
            {cup ? null : <button type="button" className={`btn btn-secondary btn-sm ${p.tap}`} onClick={() => setCup(EMPTY_CUP)}>{m.cup.add}</button>}
          </Empty>
        ) : (
          <div className="table-scroll">
            <table className={`${css.table} ${css.plain}`} style={{ minWidth: 640 }}>
              <thead><tr><th scope="col">{m.cup.colCode}</th><th scope="col">{m.cup.colDiscount}</th><th scope="col">{m.cup.colUses}</th><th scope="col">{m.cup.colState}</th><th scope="col" className="r">{m.cup.colAction}</th></tr></thead>
              <tbody>
                {coupons.map((c) => (
                  <tr key={c.id}>
                    <td className={p.code}>{c.code}</td>
                    <td>{c.discount}</td>
                    <td className="num">{c.uses}</td>
                    <td>
                      <span className={css.chips} style={{ gap: 6 }}>
                        <Pill tone={c.active ? "ok" : "neutral"}>{c.active ? m.cup.active : m.cup.paused}</Pill>
                        <Pill tone={c.inStripe ? "neutral" : "warn"}>{c.inStripe ? m.cup.inStripe : m.cup.notInStripe}</Pill>
                      </span>
                    </td>
                    <td className="r">
                      <span className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                        {!c.inStripe && stripeOn ? (
                          <button type="button" className={`btn btn-secondary btn-sm ${p.tap}`} disabled={busy} aria-label={fill(m.cup.pushOf, { code: c.code })}
                            onClick={() => act(() => pushCoupon({ id: c.id }), () => m.cup.pushedOk)}>{m.cup.pushStripe}</button>
                        ) : null}
                        <button type="button" className={`btn btn-dashed btn-sm ${p.tap}`} disabled={busy} aria-label={fill(c.active ? m.cup.pauseOf : m.cup.activateOf, { code: c.code })}
                          onClick={() => act(() => setCouponActive({ id: c.id, active: !c.active }), () => (c.active ? m.cup.pausedOk : m.cup.activatedOk))}>{c.active ? m.cup.pause : m.cup.activate}</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <span className="xs muted">{fill(m.stripe.line, { state: stripeOn ? m.stripe.on : m.stripe.off })}</span>
      </section>
    </>
  );
}
