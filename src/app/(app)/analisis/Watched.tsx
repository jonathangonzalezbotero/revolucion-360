"use client";
import { useState, useTransition } from "react";
import { fill } from "@/i18n";
import { ConfirmButton, useToast } from "@/components/ui/client";
import { Icon } from "@/components/ui/Icon";
import { formatMoney, type Cents, type MoneyFormat } from "@/lib/engine";
import type { Result } from "@/server/action";
import { addWatched, deleteWatched, updateWatched } from "./actions";
import { limitStatus, type WatchStats } from "./lib";
import type { AnalisisMessages } from "./messages";
import css from "./analisis.module.css";

export type WatchView = { id: string; name: string; pattern: string; limitCents: Cents | null; stats: WatchStats };
const COLORS: [string, string][] = [
  ["var(--rojo-fondo)", "var(--naranja)"], ["var(--ambar-fondo)", "var(--amarillo-oscuro)"], ["var(--azul-fondo)", "var(--azul)"],
  ["var(--verde-fondo)", "var(--tinta)"], ["var(--teal-fondo)", "var(--teal)"],
];

/** Comercios vigilados: cuánto se va en cada uno en el mes y en el año, cuántas veces, y cuánto llevas frente a tu límite del mes. */
export function Watched({ items, max, monthLabel, yearLabel, canEdit, fmt, m }: { items: WatchView[]; max: number; monthLabel: string; yearLabel: string; canEdit: boolean; fmt: MoneyFormat; m: AnalisisMessages }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: "", pattern: "", limit: "" });
  const [error, setError] = useState("");
  const full = items.length >= max;
  const money = (c: Cents) => formatMoney(c, fmt);

  function act<T>(fn: () => Promise<Result<T>>, done: () => void) {
    setError("");
    start(async () => {
      const r = await fn();
      if (r.ok) done(); else setError(r.error);
    });
  }

  return (
    <div className={css.watchCol}>
      <h3 className={css.h3}>{fill(m.watching, { n: items.length, max })}</h3>
      {items.length === 0 ? <p className="small muted" style={{ margin: 0 }}>{m.noWatch}</p> : null}
      {items.map((w, i) => {
        const [bg, fg] = COLORS[i % COLORS.length];
        const lim = limitStatus(w.stats.monthCents, w.limitCents);
        return (
          <article key={w.id} className={css.watch} aria-labelledby={`w-${w.id}`}>
            <div className="row-between">
              <span id={`w-${w.id}`} className={css.watchName}>
                <span aria-hidden="true" className={css.watchIcon} style={{ background: bg }}><span style={{ background: fg }} /></span>
                {w.name}
              </span>
              {canEdit ? (
                <span className="row" style={{ gap: 6 }}>
                  <button type="button" className={css.iconBtn} aria-label={fill(m.editWatch, { name: w.name })} aria-expanded={editing === w.id}
                    onClick={() => { setEditing(editing === w.id ? null : w.id); setEdit({ name: w.name, pattern: w.pattern, limit: w.limitCents ? money(w.limitCents) : "" }); setError(""); }}><Icon name="edit" size={16} /></button>
                  <ConfirmButton className={css.iconBtn} label={<Icon name="x" size={16} />} confirmLabel={m.confirmRemove}
                    ariaLabel={fill(m.stopWatching, { name: w.name })} confirmAriaLabel={`${m.confirmRemove}: ${fill(m.stopWatching, { name: w.name })}`}
                    onConfirm={() => act(() => deleteWatched(w.id), () => toast(m.watchRemoved))} />
                </span>
              ) : null}
            </div>
            {editing === w.id ? (
              <form className={css.editForm} onSubmit={(e) => { e.preventDefault(); act(() => updateWatched({ id: w.id, ...edit }), () => { setEditing(null); toast(m.watchSaved); }); }}>
                <div className="field"><label htmlFor={`wn-${w.id}`}>{m.watchName}</label><input id={`wn-${w.id}`} className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={60} /></div>
                <div className="field"><label htmlFor={`wp-${w.id}`}>{m.watchPattern}</label><input id={`wp-${w.id}`} className="input" value={edit.pattern} onChange={(e) => setEdit({ ...edit, pattern: e.target.value })} maxLength={60} required aria-describedby={`wh-${w.id}`} /><span id={`wh-${w.id}`} className="xs muted">{m.watchPatternHint}</span></div>
                <div className="field"><label htmlFor={`wl-${w.id}`}>{m.watchLimit}</label><input id={`wl-${w.id}`} className="input num" inputMode="decimal" value={edit.limit} onChange={(e) => setEdit({ ...edit, limit: e.target.value })} placeholder={m.watchLimitPh} maxLength={20} aria-describedby={`wlh-${w.id}`} /><span id={`wlh-${w.id}`} className="xs muted">{m.watchLimitHint}</span></div>
                <button type="submit" className="btn btn-sm" style={{ alignSelf: "flex-start" }} disabled={pending}>{m.saveWatch}</button>
              </form>
            ) : null}
            <dl className={css.stats}>
              <div><dt>{monthLabel}</dt><dd className="num">{money(w.stats.monthCents)}</dd><span className="xs muted">{w.stats.monthCount === 1 ? m.once : fill(m.times, { n: w.stats.monthCount })}</span></div>
              <div><dt>{yearLabel}</dt><dd className="num">{money(w.stats.yearCents)}</dd><span className="xs muted">{w.stats.yearCount === 1 ? m.once : fill(m.times, { n: w.stats.yearCount })}</span></div>
              <div><dt>{m.limit}</dt><dd className="num">{w.limitCents ? money(w.limitCents) : m.noLimit}</dd></div>
            </dl>
            {lim ? (
              <p className="xs" style={{ margin: 0, fontWeight: 600, color: lim.over ? "var(--rojo)" : "var(--gris)" }}>
                {lim.over ? fill(m.limitOver, { amount: money(lim.diffCents) }) : fill(m.limitLeft, { amount: money(lim.diffCents) })}
              </p>
            ) : null}
          </article>
        );
      })}
      {canEdit ? (
        full ? <p className="xs muted" style={{ margin: 0 }}>{fill(m.watchFull, { max })}</p> : (
          <form className={css.addRow} onSubmit={(e) => { e.preventDefault(); act(() => addWatched({ name: draft, pattern: draft }), () => { setDraft(""); toast(m.watchAdded); }); }}>
            <label htmlFor="watch-in" className="sr-only">{m.watchLabel}</label>
            <input id="watch-in" className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={m.watchPh} maxLength={60} />
            <button type="submit" className="btn" disabled={pending || !draft.trim()}>{m.watch}</button>
          </form>
        )
      ) : null}
      {error ? <p role="alert" className="small" style={{ color: "var(--rojo)", margin: 0 }}>{error}</p> : null}
    </div>
  );
}
