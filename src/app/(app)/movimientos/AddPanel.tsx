"use client";
import Link from "next/link";
import { useState } from "react";
import { fill } from "@/i18n";
import { Icon } from "@/components/ui/Icon";
import type { RecFrequency } from "./lib";
import css from "./mov.module.css";
import type { Acc, AddPayload, Cat, Ctx, LineOpt } from "./types";

type Props = {
  /** `open`: visible en escritorio. `full`: visible en móvil como hoja inferior ("Más opciones"). */
  open: boolean; full: boolean;
  categories: Cat[]; accounts: Acc[]; linesByYear: Record<string, LineOpt[]>; flags: { csv: boolean; recurring: boolean };
  defaultAccount: string; busy: boolean; ctx: Ctx; onClose: () => void; onSubmit: (p: AddPayload) => Promise<boolean>;
};

/** Agregar: a mano (formulario completo) o importar un CSV (enlace al asistente). */
export function AddPanel({ open, full, categories, accounts, linesByYear, flags, defaultAccount, busy, ctx, onClose, onSubmit }: Props) {
  const { t, c } = ctx;
  const [tab, setTab] = useState<"manual" | "csv">("manual");
  const blank = { type: "out" as AddPayload["type"], amount: "", date: ctx.today, acc: defaultAccount || accounts[0]?.id || "", to: "", desc: "", cat: "", line: "", note: "", repeat: "" as "" | RecFrequency };
  const [f, setF] = useState(blank);
  const up = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const transfer = f.type === "transfer";
  const lines = (linesByYear[f.date.slice(0, 4)] ?? []).filter((l) => (l.kind === "income") === (f.type === "in") && (!f.cat || l.categoryId === f.cat));
  const types: { id: AddPayload["type"]; label: string }[] = [{ id: "out", label: t.panel.expense }, { id: "in", label: t.panel.income }, { id: "transfer", label: t.panel.transfer }];

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const done = await onSubmit({
      amount: f.amount, date: f.date, description: f.desc, accountId: f.acc || null, toAccountId: transfer ? f.to || null : null,
      categoryId: transfer ? null : f.cat || null, lineId: transfer ? null : f.line || null, type: f.type, note: f.note, repeat: transfer ? "" : f.repeat,
    });
    if (done) setF({ ...blank, type: f.type, acc: f.acc, date: f.date });
  };

  return (
    <div className={css.sideWrap} data-desktop={open ? "open" : "closed"} data-mobile={full ? "open" : "closed"} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside aria-label={t.addAria} className={css.side} style={{ gap: 18 }}>
        <div aria-hidden="true" className={css.grabber} />
        <div className="row-between">
          <h2 style={{ fontSize: 17 }}>{t.panel.title}</h2>
          <button type="button" className={css.x} aria-label={c.actions.close} onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        {flags.csv ? (
          <div role="tablist" className={css.tabs}>
            <button type="button" role="tab" aria-selected={tab === "manual"} onClick={() => setTab("manual")}>{t.panel.manual}</button>
            <button type="button" role="tab" aria-selected={tab === "csv"} onClick={() => setTab("csv")}>{t.panel.csv}</button>
          </div>
        ) : null}

        {tab === "manual" || !flags.csv ? (
          <form style={{ display: "flex", flexDirection: "column", gap: 14 }} onSubmit={save}>
            <div role="radiogroup" aria-label={t.panel.type} className={css.types}>
              {types.map((x) => <button key={x.id} type="button" role="radio" aria-checked={f.type === x.id} onClick={() => up({ type: x.id, line: "" })}>{x.label}</button>)}
            </div>
            <div className={css.fld}>
              <label htmlFor="m-monto">{fill(t.panel.amount, { currency: ctx.fmt.currency })}</label>
              <input id="m-monto" type="text" inputMode="decimal" placeholder="0.00" className={`num ${css.in} ${css.inBig}`} value={f.amount} onChange={(e) => up({ amount: e.target.value })} />
            </div>
            <div className={css.grid2}>
              <div className={css.fld}><label htmlFor="m-fecha">{t.panel.date}</label><input id="m-fecha" type="date" className={css.in} value={f.date} onChange={(e) => up({ date: e.target.value, line: "" })} /></div>
              <div className={css.fld}>
                <label htmlFor="m-cuenta">{t.panel.account}</label>
                <select id="m-cuenta" className={css.in} value={f.acc} onChange={(e) => up({ acc: e.target.value })}>
                  <option value="">{t.list.noAccount}</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                {accounts.length === 0 ? <Link href="/cuentas" className="link">{t.edit.addAccount}</Link> : null}
              </div>
            </div>
            {transfer ? (
              <div className={css.fld}>
                <label htmlFor="m-destino">{t.panel.toAccount}</label>
                <select id="m-destino" className={css.in} value={f.to} onChange={(e) => up({ to: e.target.value })}>
                  <option value="">{t.panel.toAccountNone}</option>
                  {accounts.filter((a) => a.id !== f.acc).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <span className="xs muted">{t.edit.transferHint}</span>
              </div>
            ) : null}
            <div className={css.fld}><label htmlFor="m-desc">{t.panel.desc}</label><input id="m-desc" type="text" className={css.in} maxLength={160} placeholder={t.panel.descPh} value={f.desc} onChange={(e) => up({ desc: e.target.value })} /></div>
            {!transfer ? (
              <div className={css.grid2}>
                <div className={css.fld}>
                  <label htmlFor="m-cat">{t.panel.category}</label>
                  <select id="m-cat" className={css.in} value={f.cat} onChange={(e) => up({ cat: e.target.value, line: "" })}>
                    <option value="">{t.list.noCat}</option>
                    {categories.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </div>
                <div className={css.fld}>
                  <label htmlFor="m-linea">{t.panel.line}</label>
                  <select id="m-linea" className={css.in} value={f.line} onChange={(e) => { const l = lines.find((x) => x.id === e.target.value); up(l ? { line: l.id, cat: l.categoryId } : { line: "" }); }}>
                    <option value="">{t.edit.none}</option>
                    {lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              </div>
            ) : null}
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
            <button type="submit" className="btn" style={{ minHeight: 48, fontSize: 15 }} disabled={busy}>{busy ? c.actions.saving : t.panel.save}</button>
          </form>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className={css.csvBox}>
              <Icon name="upload" size={30} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>{t.panel.csvTitle}</span>
              <Link href="/movimientos/importar" className="btn">{t.panel.csvCta}</Link>
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: "var(--gris-2)" }}>
              {t.panel.csvBullets.map((b) => <li key={b} style={{ display: "flex", gap: 8 }}><Icon name="tick" size={15} /> {b}</li>)}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
