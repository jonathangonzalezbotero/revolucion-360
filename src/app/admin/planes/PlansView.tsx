"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fill } from "@/i18n";
import { Empty, Pill } from "@/components/ui/basics";
import { useToast } from "@/components/ui/client";
import css from "../_shared/admin.module.css";
import { AdminHeader } from "../_shared/ui";
import { createCoupon, pushCoupon, saveBilling, setCouponActive } from "./actions";
import { COUPON_APPLIES } from "@/app/(app)/suscripcion/lib";
import { checkBilling, cleanCouponCode, usd, yearlyEquivalent, type BillingInput } from "./lib";
import type { PlanesText } from "./messages";
import p from "./planes.module.css";

export type CouponView = { id: string; code: string; discount: string; applies: string; uses: string; until: string; expired: boolean; active: boolean; inStripe: boolean };
type R<T = unknown> = { ok: true; data: T } | { ok: false; error: string };
const EMPTY_CUP = { code: "", pct: "", months: "", max: "", appliesTo: "both", until: "" };

export function PlansView({ m, stripeOn, prices: saved, sync, coupons, minUntil }: {
  m: PlanesText; stripeOn: boolean; prices: BillingInput; sync: "ok" | "pending" | "unknown" | null; coupons: CouponView[]; minUntil: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [pr, setPr] = useState<BillingInput>(saved);
  const [cup, setCup] = useState<typeof EMPTY_CUP | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cupError, setCupError] = useState<string | null>(null);

  const act = <T,>(fn: () => Promise<R<T>>, onOk: (data: T) => string, onError: (e: string | null) => void = setError, after?: () => void) => start(async () => {
    onError(null);
    const r = await fn();
    if (!r.ok) { onError(r.error); toast(r.error); return; }
    toast(onOk(r.data)); after?.(); router.refresh();
  });

  const setP = (k: keyof BillingInput, v: string) => { setError(null); setPr({ ...pr, [k]: v }); };
  const save = () => act(() => saveBilling(pr), (d: { changed: number }) => (d.changed === 0 ? m.nothing : m.saved));
  // "Anual equivale a…" sigue lo que se escribe; "Cómo funciona" muestra lo guardado (lo que hoy se cobra).
  const live = checkBilling(pr);
  const eq = live.ok ? yearlyEquivalent(live.values.monthly_cents, live.values.yearly_cents) : null;
  const now = checkBilling(saved);
  const cur = now.ok ? now.values : null;
  const preview = (c: typeof EMPTY_CUP) => {
    const pct = c.pct.trim() || "0", n = c.months.trim();
    return !n || n === "0" ? fill(m.cup.previewForever, { pct }) : n === "1" ? fill(m.cup.previewOne, { pct }) : fill(m.cup.previewMonths, { pct, n });
  };
  const created = (d: { stripe: "ok" | "pending" | "off" }) => (d.stripe === "ok" ? m.cup.created : d.stripe === "pending" ? m.cup.createdPending : m.cup.createdOff);
  const field = (id: string, k: keyof BillingInput, label: string) => (
    <div className="field">
      <label htmlFor={id} className={p.lbl}>{label}</label>
      <input id={id} className="input num" inputMode="decimal" autoComplete="off" maxLength={12} value={pr[k]} onChange={(e) => setP(k, e.target.value)} />
    </div>
  );

  return (
    <>
      <AdminHeader eyebrow={m.eyebrow} title={m.title}>
        <button type="button" className="btn" disabled={busy} onClick={save}>{busy ? m.saving : m.save}</button>
      </AdminHeader>
      {error ? <p role="alert" className={css.err}>{error}</p> : null}
      {!stripeOn ? <div className="banner" role="status">{m.stripe.offNote}</div> : null}
      {sync === "pending" ? <div className="banner" role="alert">{m.prices.syncPending}</div> : null}

      <div className={css.two}>
        <section aria-labelledby="pr" className={`${css.section} ${p.prices}`}>
          <h2 id="pr">{m.prices.title}</h2>
          <div className={p.priceGrid}>
            {field("pp-1", "first", m.prices.first)}
            {field("pp-m", "monthly", m.prices.monthly)}
            {field("pp-y", "yearly", m.prices.yearly)}
          </div>
          {eq ? <span className={p.equiv} role="status">{fill(m.prices.equiv, { amount: usd(eq.perMonth), pct: eq.savingsPct })}</span> : null}
          <div className={p.notify}>
            <label htmlFor="pp-r">{m.prices.notify}</label>
            <input id="pp-r" className={`input num ${p.days}`} inputMode="numeric" autoComplete="off" maxLength={2} value={pr.notifyDays} onChange={(e) => setP("notifyDays", e.target.value)} />
            <span className="small muted">{m.prices.days}</span>
          </div>
          <p className={p.note}>{m.prices.note}</p>
          <p className={p.note}><strong>{m.prices.syncNote}</strong>{sync ? ` ${m.prices.sync[sync]}` : ""}</p>
        </section>

        <section aria-labelledby="ft" className={`${css.section} ${p.how}`}>
          <h2 id="ft">{m.how.title}</h2>
          {cur ? (
            <ol className={p.steps}>
              <li>{fill(m.how.s1, { amount: usd(cur.first_month_cents) })}</li>
              <li>{m.how.s2}</li>
              <li>{fill(m.how.s3, { monthly: usd(cur.monthly_cents), yearly: usd(cur.yearly_cents) })}</li>
              <li>{m.how.s4a} <strong>{m.how.s4b}</strong>{m.how.s4c}</li>
              <li>{m.how.s5} <Link href="/admin/usuarios">{m.how.s5link}</Link>{m.how.s5end}</li>
            </ol>
          ) : null}
          <span className="xs muted">{m.how.foot}</span>
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
              <div className="field"><label htmlFor="cu-a">{m.cup.appliesTo}</label>
                <select id="cu-a" className="input" value={cup.appliesTo} onChange={(e) => setCup({ ...cup, appliesTo: e.target.value })}>
                  {COUPON_APPLIES.map((a) => <option key={a} value={a}>{m.cup.applies[a]}</option>)}
                </select></div>
              <div className="field"><label htmlFor="cu-x">{m.cup.max}</label><input id="cu-x" className="input num" inputMode="numeric" maxLength={6} placeholder={m.cup.maxPh} value={cup.max} onChange={(e) => setCup({ ...cup, max: e.target.value })} /></div>
              <div className="field"><label htmlFor="cu-v">{m.cup.until}</label><input id="cu-v" className="input" type="date" min={minUntil} aria-describedby="cu-v-h" value={cup.until} onChange={(e) => setCup({ ...cup, until: e.target.value })} />
                <span id="cu-v-h" className="xs muted">{m.cup.untilHelp}</span></div>
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
            <table className={`${css.table} ${css.plain}`} style={{ minWidth: 880 }}>
              <thead><tr><th scope="col">{m.cup.colCode}</th><th scope="col">{m.cup.colDiscount}</th><th scope="col">{m.cup.colApplies}</th><th scope="col">{m.cup.colUses}</th><th scope="col">{m.cup.colUntil}</th><th scope="col">{m.cup.colState}</th><th scope="col" className="r">{m.cup.colAction}</th></tr></thead>
              <tbody>
                {coupons.map((c) => (
                  <tr key={c.id}>
                    <td className={p.code}>{c.code}</td>
                    <td>{c.discount}</td>
                    <td>{c.applies}</td>
                    <td className="num">{c.uses}</td>
                    <td>{c.expired ? <span className={css.chips} style={{ gap: 6 }}><Pill tone="warn">{m.cup.expired}</Pill><span className="small muted">{c.until}</span></span> : c.until}</td>
                    <td>
                      <span className={css.chips} style={{ gap: 6 }}>
                        {c.expired ? null : <Pill tone={c.active ? "ok" : "neutral"}>{c.active ? m.cup.active : m.cup.paused}</Pill>}
                        <Pill tone={c.inStripe ? "neutral" : "warn"}>{c.inStripe ? m.cup.inStripe : m.cup.notInStripe}</Pill>
                      </span>
                    </td>
                    <td className="r">
                      <span className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                        {!c.inStripe && stripeOn && !c.expired ? (
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
