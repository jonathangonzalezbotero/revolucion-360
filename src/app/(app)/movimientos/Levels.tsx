"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fill } from "@/i18n";
import { Switch, useToast } from "@/components/ui/client";
import { formatMoney, type Cents, type LineStatus } from "@/lib/engine";
import { saveTotals, setLevel, togglePaid } from "./actions";
import { movHref, type Level, type Query } from "./lib";
import css from "./mov.module.css";
import type { Ctx } from "./types";

/** Los 3 niveles. Se guarda en el perfil; en solo lectura solo cambia la vista. */
export function LevelPicker({ level, query, ctx }: { level: Level; query: Query; ctx: Ctx }) {
  const { t } = ctx;
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [picked, setPicked] = useState(level);
  const opts: { id: Level; label: string; desc: string }[] = [
    { id: "plan", label: t.levels.plan, desc: t.levels.planSub },
    { id: "totals", label: t.levels.totals, desc: t.levels.totalsSub },
    { id: "detail", label: t.levels.detail, desc: t.levels.detailSub },
  ];
  const pick = (id: Level) => {
    if (id === picked || busy) return;
    setPicked(id);
    start(async () => {
      if (!ctx.canEdit) return router.push(movHref({ ...query, ver: "", linea: "", nivel: id }));
      const r = await setLevel({ level: id });
      if (!r.ok) { setPicked(level); return toast(r.error); }
      toast(t.levels.saved);
      router.push(movHref({ ...query, ver: "", linea: "", nivel: "" }));
      router.refresh();
    });
  };
  return (
    <section aria-labelledby="mov-lv" className={`${css.card} ${css.levelCard}`}>
      <h2 id="mov-lv" style={{ fontSize: 15 }}>{t.levels.q}</h2>
      <div role="radiogroup" aria-labelledby="mov-lv" className={css.levels}>
        {opts.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={o.id === picked} className={css.level} onClick={() => pick(o.id)}>
            <span aria-hidden="true" className={css.dot} />
            <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <strong style={{ fontSize: 14 }}>{o.label}</strong>
              <span className="xs muted" style={{ lineHeight: 1.4 }}>{o.desc}</span>
            </span>
          </button>
        ))}
      </div>
      <span className="xs muted">{t.levels.note}</span>
    </section>
  );
}

export type PlanRow = { id: string; name: string; category: string; income: boolean; plannedCents: Cents; realCents: Cents; status: LineStatus };

/** Solo mi plan: cada "Pendiente" se toca y pasa a "Pagado · a mano" (el mismo dato que el Detalle del mes). */
export function PlanLevel({ rows, month, monthLabel, detailHref, ctx }: { rows: PlanRow[]; month: number; monthLabel: string; detailHref: string | null; ctx: Ctx }) {
  const { t, c, fmt } = ctx;
  const router = useRouter();
  const toast = useToast();
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const label: Record<LineStatus, string> = { pending: c.status.pending, paid: c.status.paid, paid_manual: c.status.paidManual, partial: c.status.partial, over: c.status.over, none: c.status.pending };

  const toggle = async (r: PlanRow, paid: boolean) => {
    setBusy(r.id);
    setLocal((x) => ({ ...x, [r.id]: paid }));
    const res = await togglePaid({ lineId: r.id, month, paid });
    setBusy(null);
    if (!res.ok) { setLocal((x) => ({ ...x, [r.id]: !paid })); return toast(res.error); }
    toast(fill(paid ? t.plan.marked : t.plan.unmarked, { name: r.name }));
    router.refresh();
  };

  return (
    <section aria-label={t.plan.aria} className={`${css.card} ${css.rowsCard}`}>
      <h2>{fill(t.plan.heading, { month: monthLabel })}</h2>
      {rows.map((r) => {
        const byTx = r.status === "paid" || r.status === "partial" || r.status === "over";
        const on = byTx ? r.status !== "partial" : local[r.id] ?? r.status === "paid_manual";
        const st = byTx ? label[r.status] : on ? label.paid_manual : label.pending;
        return (
          <div key={r.id} className={css.line}>
            <Switch checked={on} disabled={byTx || !ctx.canEdit || busy === r.id} label={fill(t.plan.switchAria, { name: r.name })} onChange={(v) => toggle(r, v)} />
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <strong style={{ fontSize: 14 }}>{r.name}</strong>
              <span className="xs" style={{ fontWeight: 600, color: on ? "var(--verde-fuerte)" : "var(--gris)" }}>
                {st}<span className="muted" style={{ fontWeight: 400 }}> · {r.income ? `${t.plan.received} · ` : ""}{r.category}</span>
              </span>
              {byTx ? <span className="xs muted">{t.plan.byTx}</span> : null}
            </span>
            <strong className="num" style={{ fontSize: 14 }}>{formatMoney(r.plannedCents, fmt)}</strong>
          </div>
        );
      })}
      {detailHref ? <div className={css.line} style={{ minHeight: 48 }}><Link href={detailHref} className="link">{t.plan.open}</Link></div> : null}
    </section>
  );
}

export type TotalRow = { id: string; name: string; income: boolean; planCents: Cents; savedCents: Cents | null; value: string };

/** Totales del mes: un número por categoría, comparado con el plan de esa categoría. */
export function TotalsLevel({ rows, year, month, monthLabel, ctx }: { rows: TotalRow[]; year: number; month: number; monthLabel: string; ctx: Ctx }) {
  const { t, fmt } = ctx;
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.id, r.value])));
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await saveTotals({ year, month, items: rows.map((r) => ({ categoryId: r.id, amount: values[r.id] ?? "" })) });
    setBusy(false);
    if (!res.ok) return toast(res.error);
    toast(t.totals.saved);
    router.refresh();
  };

  return (
    <form aria-label={t.totals.aria} className={`${css.card} ${css.rowsCard}`} style={{ paddingBottom: 14 }} onSubmit={save}>
      <h2 style={{ paddingBottom: 4 }}>{fill(t.totals.heading, { month: monthLabel })}</h2>
      <p className="xs muted" style={{ marginBottom: 6 }}>{t.totals.sub}</p>
      {rows.map((r) => {
        const diff = r.savedCents === null ? null : r.savedCents - r.planCents;
        const bad = diff !== null && (r.income ? diff < 0 : diff > 0);
        return (
          <div key={r.id} className={css.line} style={{ minHeight: 58 }}>
            <label htmlFor={`tot-${r.id}`} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <strong style={{ fontSize: 14 }}>{r.name}</strong>
              <span className="num xs muted">{fill(t.totals.plan, { amount: formatMoney(r.planCents, fmt) })}</span>
              {diff !== null ? (
                <span className={`num xs ${bad ? "neg" : "muted"}`} style={{ fontWeight: 600 }}>
                  {diff === 0 ? t.totals.equal : fill(diff > 0 ? t.totals.over : t.totals.under, { amount: formatMoney(Math.abs(diff), fmt) })}
                </span>
              ) : null}
            </label>
            <input id={`tot-${r.id}`} className={`num ${css.totalInput}`} type="text" inputMode="decimal" placeholder={formatMoney(0, fmt)} disabled={!ctx.canEdit}
              value={values[r.id] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [r.id]: e.target.value }))} />
          </div>
        );
      })}
      {ctx.canEdit ? <button type="submit" className="btn btn-block" style={{ minHeight: 48, marginTop: 8 }} disabled={busy}>{busy ? ctx.c.actions.saving : t.totals.save}</button> : null}
    </form>
  );
}
