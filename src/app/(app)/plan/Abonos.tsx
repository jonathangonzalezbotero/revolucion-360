"use client";
import { useState } from "react";
import { fill } from "@/i18n";
import { Icon } from "@/components/ui/Icon";
import { ConfirmButton, useToast } from "@/components/ui/client";
import { daysInMonth, formatDate, formatMoney, iso, monthName, parseMoney, type ISODate, type MoneyFormat } from "@/lib/engine";
import { abonoDate, abonoSuggestion, cellPay } from "@/lib/engine/registro";
import { deleteTx } from "../movimientos/actions";
import { addAbono, setLineClosed } from "./actions";
import { cellText, isClosedCell, type Abono, type LineLite } from "./lib";
import type { PlanText } from "./messages";
import css from "./plan.module.css";

type Locale = "es" | "en";
export type AbonoTarget = { lineId: string; month: number };

/**
 * Abonos de una celda (línea de gasto × mes): cuánto va pagado, la lista de abonos (con "Quitar", que es el borrado suave
 * de Movimientos), "Registrar abono" (un movimiento real unido a la línea) y "Dar por cerrado con $X".
 * Los números salen de las props (se refrescan solas después de cada acción); solo "cerrado" vive en el estado de la rejilla.
 */
export function AbonoPanel({ line, month, year, plannedCents, linkedCents, abonos, closed, canEdit, accounts, today, fmt, locale, m, saving, onAdded, onClosed }: {
  line: LineLite; month: number; year: number; plannedCents: number; linkedCents: number | null; abonos: Abono[]; closed: boolean; canEdit: boolean;
  accounts: { id: string; name: string }[]; today: ISODate; fmt: MoneyFormat; locale: Locale; m: PlanText; saving: string;
  onAdded: (lineId: string, month: number) => void; onClosed: (lineId: string, month: number, closed: boolean) => void;
}) {
  const a = m.abono;
  const toast = useToast();
  const money = (c: number) => formatMoney(c, fmt);
  const pay = cellPay(plannedCents, linkedCents);
  const isClosed = isClosedCell(plannedCents, linkedCents, closed);
  const monthLabel = monthName(month, locale);
  const [f, setF] = useState(() => ({ amount: cellText(abonoSuggestion(plannedCents, linkedCents)), date: abonoDate(today, year, month), account: "" }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await addAbono({ lineId: line.id, month, amount: f.amount, date: f.date, accountId: f.account || null });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onAdded(line.id, month);
    toast(fill(a.added, { amount: money(Math.abs(parseMoney(f.amount) ?? 0)), line: line.name }), r.points);
    setF((x) => ({ ...x, amount: "" }));
  };
  const remove = async (x: Abono) => {
    const r = await deleteTx({ id: x.id });
    if (!r.ok) return setError(r.error);
    toast(a.removed);
  };
  const close = async (on: boolean) => {
    setBusy(true);
    onClosed(line.id, month, on);
    const r = await setLineClosed({ lineId: line.id, month, closed: on });
    setBusy(false);
    if (!r.ok) { onClosed(line.id, month, !on); return setError(r.error); }
    toast(fill(on ? a.closed : a.reopened, { line: line.name, amount: money(pay.paidCents) }));
  };

  const status = isClosed ? fill(a.closedWith, { amount: money(pay.paidCents) })
    : pay.overCents > 0 ? fill(a.overBy, { amount: money(pay.overCents) })
    : `${fill(a.of, { paid: money(pay.paidCents), planned: money(pay.plannedCents) })}${pay.missingCents > 0 ? ` · ${fill(a.missing, { amount: money(pay.missingCents) })}` : ""}`;
  const covered = pay.missingCents === 0 && pay.paidCents > 0;

  return (
    <div className={css.abono}>
      <div className={css.abonoSum}>
        <span className="small muted">{a.planned}: <span className="num">{money(pay.plannedCents)}</span></span>
        <strong className="num" style={{ fontSize: 16 }}>{status}</strong>
        <span aria-hidden="true" className={`${css.payBar} ${css.payBarBig} ${covered || isClosed ? css.payBarDone : ""}`}><span style={{ width: `${Math.round(pay.pct * 100)}%` }} /></span>
        {isClosed && pay.missingCents > 0 ? <span className="small" style={{ color: "var(--verde-fuerte)" }}>{fill(a.savedNote, { amount: money(pay.missingCents) })}</span> : null}
      </div>

      <div className={css.abonoList}>
        <h3>{fill(a.list, { month: monthLabel.toLowerCase() })}</h3>
        {abonos.length === 0 ? <p className="small muted" style={{ margin: 0 }}>{a.none}</p> : (
          <ul>
            {abonos.map((x) => (
              <li key={x.id}>
                <span className="small">{formatDate(x.date, locale, "day")}</span>
                <span className="num" style={{ fontWeight: 600 }}>{money(Math.abs(x.amountCents))}</span>
                {canEdit && x.removable ? (
                  <ConfirmButton onConfirm={() => remove(x)} className={css.abonoX} label={<Icon name="x" size={14} />} confirmLabel={a.removeConfirm}
                    ariaLabel={fill(a.remove, { amount: money(Math.abs(x.amountCents)), date: formatDate(x.date, locale, "day") })} />
                ) : canEdit ? <span className="xs muted" title={a.partHint}>{a.partHint}</span> : null}
              </li>
            ))}
          </ul>
        )}
        {canEdit && abonos.some((x) => x.removable) ? <p className="xs muted" style={{ margin: 0 }}>{a.removeHint}</p> : null}
      </div>

      {canEdit && pay.missingCents > 0 && pay.paidCents > 0 && !isClosed ? (
        <div className={css.abonoClose}>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => close(true)}>{fill(a.close, { amount: money(pay.paidCents) })}</button>
          <span className="xs muted">{fill(a.closeHint, { missing: money(pay.missingCents) })}</span>
        </div>
      ) : null}
      {canEdit && isClosed ? (
        <button type="button" className={`btn btn-secondary btn-sm ${css.abonoReopen}`} disabled={busy} onClick={() => close(false)}>{a.reopen}</button>
      ) : null}

      {canEdit ? (
        <form className={css.abonoForm} onSubmit={add} aria-label={a.form}>
          <h3>{a.form}</h3>
          <div className={css.abonoGrid}>
            <div className="field"><label htmlFor="ab-amt">{a.amount}</label>
              <input id="ab-amt" className="input num" type="text" inputMode="decimal" autoComplete="off" value={f.amount} onChange={(e) => { setF({ ...f, amount: e.target.value }); setError(""); }} /></div>
            <div className="field"><label htmlFor="ab-date">{a.date}</label>
              <input id="ab-date" className="input" type="date" min={iso(year, month, 1)} max={iso(year, month, daysInMonth(year, month))} value={f.date} aria-describedby="ab-date-h"
                onChange={(e) => { setF({ ...f, date: e.target.value }); setError(""); }} /></div>
            <div className="field" style={{ gridColumn: "1 / -1" }}><label htmlFor="ab-acc">{a.account}</label>
              <select id="ab-acc" className="select" value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })}>
                <option value="">{a.noAccount}</option>
                {accounts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select></div>
          </div>
          <span id="ab-date-h" className="xs muted">{fill(a.dateHint, { month: monthLabel.toLowerCase() })}</span>
          {error ? <p role="alert" className="error" style={{ margin: 0 }}>{error}</p> : null}
          <button type="submit" className="btn" disabled={busy || !f.amount.trim()}>{busy ? saving : a.save}</button>
        </form>
      ) : error ? <p role="alert" className="error">{error}</p> : null}
    </div>
  );
}
