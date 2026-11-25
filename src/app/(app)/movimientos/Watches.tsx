"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fill } from "@/i18n";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/client";
import { formatMoney } from "@/lib/engine";
import { addWatch, removeWatch } from "./actions";
import css from "./mov.module.css";
import type { Ctx } from "./types";

export type WatchItem = { id: string; name: string; pattern: string; tag: string | null; monthCents: number; yearCents: number; yearCount: number };

/**
 * "Vigilar un gasto": una palabra ("McDonald's", "café") y/o una etiqueta puesta a mano (#helado).
 * Tarjetas discretas arriba de la lista: "Cafés: $86 este mes · $1,020 en el año". Es solo una vista: nada del plan cambia.
 */
export function Watches({ items, max, ctx }: { items: WatchItem[]; max: number; ctx: Ctx }) {
  const { t, fmt, canEdit } = ctx;
  const w = t.watch;
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", pattern: "", tag: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!items.length && !canEdit) return null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await addWatch(f);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast(fill(w.added, { name: f.name || f.pattern || `#${f.tag.replace(/^#+/, "")}` }));
    setF({ name: "", pattern: "", tag: "" });
    setOpen(false);
    router.refresh();
  };
  const remove = async (item: WatchItem) => {
    const r = await removeWatch({ id: item.id });
    if (!r.ok) return toast(r.error);
    toast(fill(w.removed, { name: item.name }));
    router.refresh();
  };
  const money = (c: number) => formatMoney(c, fmt);

  return (
    <section aria-labelledby="watch-h" className={`${css.card} ${css.watch}`}>
      <div className={css.watchHead}>
        <h2 id="watch-h">{w.title}</h2>
        {canEdit && items.length < max ? (
          <button type="button" className={css.dashed} aria-expanded={open} onClick={() => { setOpen(!open); setError(""); }}>{w.add}</button>
        ) : null}
      </div>
      {items.length ? (
        <ul className={css.watchGrid}>
          {items.map((x) => (
            <li key={x.id} className={css.watchItem}>
              <div>
                <strong>{x.name}</strong>
                <span className="small num">{fill(w.line, { month: money(x.monthCents), year: money(x.yearCents) })}</span>
                <span className="xs muted">
                  {[x.pattern || null, x.tag ? `#${x.tag}` : null].filter(Boolean).join(" · ")}
                  {x.yearCount ? ` · ${x.yearCount === 1 ? w.timesOne : fill(w.times, { n: x.yearCount })}` : ""}
                </span>
              </div>
              {canEdit ? (
                <button type="button" className={css.tagX} aria-label={fill(w.remove, { name: x.name })} title={fill(w.remove, { name: x.name })} onClick={() => remove(x)}><Icon name="x" size={14} /></button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : <p className="small muted">{w.empty}</p>}
      {open ? (
        <form className={css.watchForm} aria-label={w.addTitle} onSubmit={save}>
          <div className={css.fld}><label htmlFor="w-word">{w.word}</label><input id="w-word" type="text" className={css.in} maxLength={60} placeholder={w.wordPh} value={f.pattern} onChange={(e) => { setF({ ...f, pattern: e.target.value }); setError(""); }} /></div>
          <div className={css.fld}><label htmlFor="w-tag">{w.tag}</label><input id="w-tag" type="text" className={css.in} maxLength={60} placeholder={w.tagPh} value={f.tag} onChange={(e) => { setF({ ...f, tag: e.target.value }); setError(""); }} /></div>
          <div className={css.fld}><label htmlFor="w-name">{w.name}</label><input id="w-name" type="text" className={css.in} maxLength={60} placeholder={w.namePh} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <p className="xs muted" style={{ gridColumn: "1 / -1", margin: 0 }}>{w.help} {w.note}</p>
          {error ? <p role="alert" className="error" style={{ gridColumn: "1 / -1" }}>{error}</p> : null}
          <div className={css.watchBtns}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>{w.cancel}</button>
            <button type="submit" className="btn btn-sm" disabled={busy}>{busy ? ctx.c.actions.saving : w.save}</button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
