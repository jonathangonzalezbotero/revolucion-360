"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fill } from "@/i18n";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/client";
import type { RecFrequency } from "./lib";
import css from "./mov.module.css";
import type { Acc, AddPayload, Cat, Ctx, LineOpt } from "./types";

export type AddMode = "move" | "transfer";
type Props = {
  /** "move": el registro rápido ("+ Gasto"), con Sale / Entra. "transfer": entre mis cuentas. */
  mode: AddMode;
  categories: Cat[]; accounts: Acc[]; linesByYear: Record<string, LineOpt[]>; flags: { recurring: boolean };
  defaultAccount: string; busy: boolean; ctx: Ctx; onClose: () => void; onSubmit: (p: AddPayload) => Promise<boolean>;
};

/**
 * Registrar a mano: panel lateral en escritorio, hoja inferior en el teléfono (lo cambia el CSS).
 * A la vista solo lo de siempre (monto, categoría, fecha, cuenta); línea del plan, repetir y nota van en "Más detalles".
 */
export function AddPanel({ mode, categories, accounts, linesByYear, flags, defaultAccount, busy, ctx, onClose, onSubmit }: Props) {
  const { t, c } = ctx;
  const transfer = mode === "transfer";
  const blank = { dir: "out" as "out" | "in", amount: "", date: ctx.today, acc: defaultAccount || accounts[0]?.id || "", to: "", desc: "", cat: "", line: "", note: "", repeat: "" as "" | RecFrequency };
  const [f, setF] = useState(blank);
  const [more, setMore] = useState(false);
  const up = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const lines = (linesByYear[f.date.slice(0, 4)] ?? []).filter((l) => (l.kind === "income") === (f.dir === "in") && (!f.cat || l.categoryId === f.cat));
  // las categorías del sentido elegido primero (un gasto rara vez va a "Ingresos")
  const income = (x: Cat) => x.kind === "income";
  const cats = f.dir === "in" ? [...categories.filter(income), ...categories.filter((x) => !income(x))] : [...categories.filter((x) => !income(x)), ...categories.filter(income)];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const done = await onSubmit({
      amount: f.amount, date: f.date, description: f.desc, accountId: f.acc || null, toAccountId: transfer ? f.to || null : null,
      categoryId: transfer ? null : f.cat || null, lineId: transfer ? null : f.line || null, type: transfer ? "transfer" : f.dir, note: f.note, repeat: transfer ? "" : f.repeat,
    });
    if (!done) return;
    // en el teléfono la hoja tapa la lista: se cierra para ver el movimiento nuevo
    if (window.matchMedia("(max-width: 899px)").matches) return onClose();
    // en escritorio se queda abierto para el siguiente, con el mismo sentido, cuenta y fecha
    setF({ ...blank, dir: f.dir, acc: f.acc, date: f.date, to: f.to });
  };

  const title = transfer ? t.panel.transferTitle : f.dir === "in" ? t.panel.incomeTitle : t.panel.expenseTitle;
  const saveLabel = transfer ? t.panel.saveTransfer : f.dir === "in" ? t.panel.saveIncome : t.panel.saveExpense;

  return (
    <div className={css.sideWrap} data-desktop="open" data-mobile="open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside aria-labelledby="add-h" className={css.side} style={{ gap: 16 }}>
        <div aria-hidden="true" className={css.grabber} />
        <div className="row-between">
          <h2 id="add-h" style={{ fontSize: 17 }}>{title}</h2>
          <button type="button" className={css.x} aria-label={c.actions.close} onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        <form style={{ display: "flex", flexDirection: "column", gap: 14 }} onSubmit={save}>
          {transfer ? null : (
            <div className={css.dirSeg}>
              <Segmented label={t.edit.dir} value={f.dir} onChange={(dir) => up({ dir, line: "" })} options={[{ value: "out", label: t.edit.out }, { value: "in", label: t.edit.in }]} />
            </div>
          )}
          <div className={css.fld}>
            <label htmlFor="m-monto">{fill(t.panel.amount, { currency: ctx.fmt.currency })}</label>
            <input id="m-monto" type="text" inputMode="decimal" placeholder="0.00" autoFocus className={`num ${css.in} ${css.inBig}`} value={f.amount} onChange={(e) => up({ amount: e.target.value })} />
          </div>

          {transfer ? (
            <div className={css.grid2}>
              <div className={css.fld}>
                <label htmlFor="m-cuenta">{t.panel.fromAccount}</label>
                <select id="m-cuenta" className={css.in} value={f.acc} onChange={(e) => up({ acc: e.target.value })}>
                  <option value="">{t.list.noAccount}</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className={css.fld}>
                <label htmlFor="m-destino">{t.panel.toAccount}</label>
                <select id="m-destino" className={css.in} value={f.to} onChange={(e) => up({ to: e.target.value })}>
                  <option value="">{t.panel.toAccountNone}</option>
                  {accounts.filter((a) => a.id !== f.acc).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <div className={css.fld}>
              <label htmlFor="m-cat">{t.panel.category}</label>
              <select id="m-cat" className={css.in} value={f.cat} onChange={(e) => up({ cat: e.target.value, line: "" })}>
                <option value="">{t.list.noCat}</option>
                {cats.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
          )}

          <div className={css.grid2}>
            <div className={css.fld}><label htmlFor="m-fecha">{t.panel.date}</label><input id="m-fecha" type="date" className={css.in} value={f.date} onChange={(e) => up({ date: e.target.value, line: "" })} /></div>
            {transfer ? (
              <div className={css.fld}><label htmlFor="m-desc">{t.panel.descOpt}</label><input id="m-desc" type="text" className={css.in} maxLength={160} value={f.desc} onChange={(e) => up({ desc: e.target.value })} /></div>
            ) : (
              <div className={css.fld}>
                <label htmlFor="m-cuenta">{t.panel.accountOpt}</label>
                <select id="m-cuenta" className={css.in} value={f.acc} onChange={(e) => up({ acc: e.target.value })}>
                  <option value="">{t.list.noAccount}</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )}
          </div>
          {transfer ? <span className="xs muted" style={{ marginTop: -6 }}>{t.edit.transferHint}</span> : (
            <div className={css.fld}><label htmlFor="m-desc">{t.panel.descOpt}</label><input id="m-desc" type="text" className={css.in} maxLength={160} placeholder={t.panel.descPh} value={f.desc} onChange={(e) => up({ desc: e.target.value })} /></div>
          )}
          {accounts.length === 0 ? <Link href="/cuentas" className="link" style={{ alignSelf: "flex-start" }}>{t.edit.addAccount}</Link> : null}

          <button type="button" className={css.disclosure} aria-expanded={more} aria-controls="add-more" onClick={() => setMore((v) => !v)}>
            {t.panel.moreDetails} <span aria-hidden="true">{more ? "▴" : "▾"}</span>
          </button>
          <div id="add-more" hidden={!more} style={{ display: more ? "flex" : "none", flexDirection: "column", gap: 14 }}>
            {transfer ? null : (
              <div className={css.fld}>
                <label htmlFor="m-linea">{t.panel.line}</label>
                <select id="m-linea" className={css.in} value={f.line} onChange={(e) => { const l = lines.find((x) => x.id === e.target.value); up(l ? { line: l.id, cat: l.categoryId } : { line: "" }); }}>
                  <option value="">{t.edit.none}</option>
                  {lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            )}
            {flags.recurring && !transfer ? (
              <div className={css.fld}>
                <label htmlFor="m-rep">{t.panel.repeat}</label>
                <select id="m-rep" className={css.in} value={f.repeat} onChange={(e) => up({ repeat: e.target.value as "" | RecFrequency })}>
                  <option value="">{t.edit.repeatNo}</option>
                  <option value="weekly">{t.rec.weekly}</option>
                  <option value="fortnightly">{t.rec.fortnightly}</option>
                  <option value="monthly">{t.rec.monthly}</option>
                </select>
              </div>
            ) : null}
            <div className={css.fld}><label htmlFor="m-nota">{t.panel.note}</label><input id="m-nota" type="text" className={css.in} maxLength={300} placeholder={t.edit.notePh} value={f.note} onChange={(e) => up({ note: e.target.value })} /></div>
          </div>

          <button type="submit" className="btn" style={{ minHeight: 48, fontSize: 15 }} disabled={busy}>{busy ? c.actions.saving : saveLabel}</button>
        </form>
      </aside>
    </div>
  );
}
