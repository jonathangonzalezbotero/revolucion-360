"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fill } from "@/i18n";
import { Empty } from "@/components/ui/basics";
import { ConfirmButton, Modal, Segmented, useToast } from "@/components/ui/client";
import { formatDate, formatMoney, parts, weekdayName, type Cents, type ISODate } from "@/lib/engine";
import { addRecurring, deleteRecurring, setRecurringActive, updateRecurring } from "./actions";
import { moneyInput, type RecFrequency } from "./lib";
import css from "./mov.module.css";
import type { Acc, Cat, Ctx, GoalOpt, LineOpt } from "./types";

/** `anchorDay`: día del mes de un mensual (1–31); la próxima fecha puede caer antes en un mes corto. */
export type RecItem = {
  id: string; description: string; amountCents: Cents; frequency: RecFrequency; nextDate: ISODate; anchorDay: number | null; active: boolean;
  accountId: string | null; categoryId: string | null; lineId: string | null;
  /** Meta a la que va cada movimiento que genera, como aporte (migración 20261125000040). */
  goalId: string | null;
};

/**
 * Recurrentes: se registran solos en su fecha. Aquí se crean, se editan, se pausan y se borran.
 * `goals`: metas activas para "Meta (opcional)"; vacío si Metas está apagado (el campo no se muestra).
 */
export function Recurring({ items, categories, accounts, linesByYear, goals, ctx }: { items: RecItem[]; categories: Cat[]; accounts: Acc[]; linesByYear: Record<string, LineOpt[]>; goals: GoalOpt[]; ctx: Ctx }) {
  const { t, c, fmt, locale } = ctx;
  const router = useRouter();
  const toast = useToast();
  const blank = { desc: "", amount: "", dir: "out" as "in" | "out", acc: accounts[0]?.id ?? "", cat: "", line: "", frequency: "monthly" as RecFrequency, first: ctx.today, goal: "" };
  const [open, setOpen] = useState(false);
  /** null: nuevo; un id: editando ese recurrente. */
  const [editing, setEditing] = useState<string | null>(null);
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const up = (patch: Partial<typeof f>) => { setF((x) => ({ ...x, ...patch })); setError(""); };
  const lines = (linesByYear[f.first.slice(0, 4)] ?? []).filter((l) => (l.kind === "income") === (f.dir === "in") && (!f.cat || l.categoryId === f.cat));
  const freqLabel: Record<RecFrequency, string> = { weekly: t.rec.weekly, fortnightly: t.rec.fortnightly, monthly: t.rec.monthly };

  const when = (r: RecItem) => {
    if (r.frequency === "monthly") return `${freqLabel.monthly} · ${fill(t.rec.day, { d: r.anchorDay ?? parts(r.nextDate).d })}`;
    if (r.frequency === "weekly") return `${freqLabel.weekly} · ${weekdayName(r.nextDate, locale)}`;
    return `${freqLabel.fortnightly} · ${fill(t.rec.next, { date: formatDate(r.nextDate, locale, "short") })}`;
  };

  const goalName = new Map(goals.map((g) => [g.id, g.name]));
  // la meta que ya tenía (aunque ya no esté activa) se sigue viendo al editar
  const goalOpts = goals.filter((g) => g.active || g.id === f.goal);
  const openNew = () => { setEditing(null); setF(blank); setError(""); setOpen(true); };
  const openEdit = (r: RecItem) => {
    setEditing(r.id);
    setF({
      desc: r.description, amount: moneyInput(r.amountCents), dir: r.amountCents > 0 ? "in" : "out", acc: r.accountId ?? "", cat: r.categoryId ?? "", line: r.lineId ?? "",
      frequency: r.frequency, first: r.nextDate, goal: r.goalId ?? "",
    });
    setError("");
    setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const fields = { description: f.desc, amount: f.amount, direction: f.dir, accountId: f.acc || null, categoryId: f.cat || null, lineId: f.line || null, frequency: f.frequency, first: f.first, goalId: f.goal || null };
    const r = editing ? await updateRecurring({ id: editing, ...fields }) : await addRecurring(fields);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast(editing ? t.rec.updated : t.rec.created);
    setOpen(false);
    setEditing(null);
    setF(blank);
    router.refresh();
  };
  const toggle = async (r: RecItem) => {
    const res = await setRecurringActive({ id: r.id, active: !r.active });
    if (!res.ok) return toast(res.error);
    toast(r.active ? t.rec.pausedOk : t.rec.resumedOk);
    router.refresh();
  };
  const remove = async (r: RecItem) => {
    const res = await deleteRecurring({ id: r.id });
    if (!res.ok) return toast(res.error);
    toast(t.rec.removed);
    router.refresh();
  };

  return (
    <section aria-labelledby="rec" className={`${css.card} ${css.recCard}`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}><h2 id="rec" style={{ fontSize: 16 }}>{t.rec.title}</h2><span className="small muted">{t.rec.sub}</span></div>
        {ctx.canEdit ? <button type="button" className="btn btn-secondary btn-sm" style={{ minHeight: 44 }} onClick={openNew}>{t.rec.add}</button> : null}
      </div>
      {items.length === 0 ? <Empty icon="mov" title={t.rec.emptyTitle} text={t.rec.emptyText}>{ctx.canEdit ? <button type="button" className="btn btn-secondary btn-sm" onClick={openNew}>{t.rec.add}</button> : null}</Empty> : (
        <div className={css.recGrid}>
          {items.map((r) => (
            <div key={r.id} className={css.rec} data-paused={!r.active}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <strong style={{ fontSize: 14 }}>{r.description}</strong>
                  <span className="xs muted">{when(r)}</span>
                  {r.goalId && goalName.has(r.goalId) ? <span className="xs" style={{ color: "var(--verde-fuerte)", fontWeight: 600 }}>{fill(t.rec.toGoal, { name: goalName.get(r.goalId)! })}</span> : null}
                </span>
                <strong className="num" style={{ fontSize: 14 }}>{formatMoney(r.amountCents, fmt, { sign: true })}</strong>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {!r.active ? <span className="pill">{t.rec.paused}</span> : null}
                {ctx.canEdit ? (
                  <>
                    <button type="button" className={css.mini} style={{ marginLeft: "auto" }} aria-label={fill(t.rec.editAria, { name: r.description })} onClick={() => openEdit(r)}>{t.rec.edit}</button>
                    <button type="button" className={css.mini} onClick={() => toggle(r)}>{r.active ? t.rec.pause : t.rec.resume}</button>
                    <ConfirmButton onConfirm={() => remove(r)} label={t.rec.remove} confirmLabel={t.rec.removeConfirm} className={css.mini} />
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? t.rec.editTitle : t.rec.newTitle} labelClose={c.actions.close}>
        <form style={{ display: "flex", flexDirection: "column", gap: 14 }} onSubmit={save}>
          <div className={css.fld}><label htmlFor="r-desc">{t.edit.desc}</label><input id="r-desc" type="text" className={css.in} maxLength={120} value={f.desc} onChange={(e) => up({ desc: e.target.value })} /></div>
          <div className={css.fld}>
            <span className={css.lbl}>{t.edit.dir}</span>
            <Segmented label={t.edit.dir} value={f.dir} onChange={(v) => up({ dir: v, line: "" })} options={[{ value: "out", label: t.edit.out }, { value: "in", label: t.edit.in }]} />
          </div>
          <div className={css.grid2}>
            <div className={css.fld}><label htmlFor="r-amt">{t.edit.amount}</label><input id="r-amt" type="text" inputMode="decimal" className={`num ${css.in}`} style={{ fontSize: 16, fontWeight: 600 }} placeholder={formatMoney(0, fmt)} value={f.amount} onChange={(e) => up({ amount: e.target.value })} /></div>
            <div className={css.fld}>
              <label htmlFor="r-freq">{t.rec.frequency}</label>
              <select id="r-freq" className={css.in} value={f.frequency} onChange={(e) => up({ frequency: e.target.value as RecFrequency })}>
                <option value="weekly">{t.rec.weekly}</option><option value="fortnightly">{t.rec.fortnightly}</option><option value="monthly">{t.rec.monthly}</option>
              </select>
            </div>
          </div>
          <div className={css.grid2}>
            <div className={css.fld}><label htmlFor="r-first">{editing ? t.rec.nextDate : t.rec.first}</label><input id="r-first" type="date" className={css.in} value={f.first} onChange={(e) => up({ first: e.target.value, line: "" })} /></div>
            <div className={css.fld}>
              <label htmlFor="r-acc">{t.edit.account}</label>
              <select id="r-acc" className={css.in} value={f.acc} onChange={(e) => up({ acc: e.target.value })}>
                <option value="">{t.list.noAccount}</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <div className={css.grid2}>
            <div className={css.fld}>
              <label htmlFor="r-cat">{t.edit.category}</label>
              <select id="r-cat" className={css.in} value={f.cat} onChange={(e) => up({ cat: e.target.value, line: "" })}>
                <option value="">{t.list.noCat}</option>
                {categories.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
            <div className={css.fld}>
              <label htmlFor="r-line">{t.panel.line}</label>
              <select id="r-line" className={css.in} value={f.line} onChange={(e) => { const l = lines.find((x) => x.id === e.target.value); up(l ? { line: l.id, cat: l.categoryId } : { line: "" }); }}>
                <option value="">{t.edit.none}</option>
                {lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>
          {goalOpts.length > 0 ? (
            <div className={css.fld}>
              <label htmlFor="r-goal">{t.rec.goal}</label>
              <select id="r-goal" className={css.in} value={f.goal} onChange={(e) => up({ goal: e.target.value })} aria-describedby="r-goal-hint">
                <option value="">{t.edit.none}</option>
                {goalOpts.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <span id="r-goal-hint" className="xs muted">{t.rec.goalHint}</span>
            </div>
          ) : null}
          {error ? <p role="alert" className="error">{error}</p> : null}
          <button type="submit" className="btn" style={{ minHeight: 48 }} disabled={busy}>{busy ? c.actions.saving : editing ? t.edit.save : t.rec.save}</button>
        </form>
      </Modal>
    </section>
  );
}
