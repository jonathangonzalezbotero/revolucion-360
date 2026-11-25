"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fill } from "@/i18n";
import { Icon } from "@/components/ui/Icon";
import { ConfirmButton, Segmented, Switch, useToast } from "@/components/ui/client";
import { formatMoney, monthName, parseMoney } from "@/lib/engine";
import { deleteTx, linkLine, setTxGoal, suggestFor, updateTx } from "./actions";
import { moneyInput, rulePattern, type MovRow, type RecFrequency } from "./lib";
import css from "./mov.module.css";
import type { Acc, Cat, Ctx, GoalOpt, LineOpt } from "./types";

type Props = {
  row: MovRow; categories: Cat[]; accounts: Acc[]; linesByYear: Record<string, LineOpt[]>; recurring: boolean; ctx: Ctx; onClose: () => void;
  goals: GoalOpt[];
  /** Lo que hoy cuenta este movimiento para una meta: "in:<meta>", "out:<meta>" o "". */
  goal: string;
};

/** Editar un movimiento: panel lateral en escritorio, hoja inferior en móvil (el mismo formulario; lo cambia el CSS). */
export function EditPanel({ row, categories, accounts, linesByYear, recurring, ctx, onClose, goals, goal }: Props) {
  const { t, c, fmt, locale } = ctx;
  const router = useRouter();
  const toast = useToast();
  const second = row.parts[1];
  const [d, setD] = useState({
    desc: row.description, amount: moneyInput(row.amountCents), dir: row.amountCents > 0 ? ("in" as const) : ("out" as const), date: row.date,
    cat: row.categoryId ?? "", acc: row.accountId ?? "", line: row.lineId ?? "", note: row.note, transfer: row.kind === "transfer",
    split: row.parts.length > 0, cat2: second?.categoryId ?? "", amount2: second ? moneyInput(second.amountCents) : "", rule: true, repeat: "" as "" | RecFrequency,
    goal,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState<{ lineId: string; name: string; month: number } | null>(null);
  const up = (patch: Partial<typeof d>) => { setD((x) => ({ ...x, ...patch })); setError(""); };

  // Sugerencia de línea del plan: se muestra y el usuario la confirma. Nunca se une sola.
  const wantsHint = !row.lineId && row.kind === "normal" && row.parts.length === 0;
  useEffect(() => {
    if (!wantsHint) return;
    let alive = true;
    suggestFor({ id: row.id }).then((r) => { if (alive && r.ok) setHint(r.data); });
    return () => { alive = false; };
  }, [row.id, wantsHint]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const lines = linesByYear[d.date.slice(0, 4)] ?? [];
  const bankText = row.raw || row.description;
  const changed = (d.cat !== (row.categoryId ?? "") || d.line !== (row.lineId ?? "")) && !!(d.cat || d.line);
  const offerRule = changed && !d.transfer && !!rulePattern(bankText);
  const total = parseMoney(d.amount), part2 = parseMoney(d.amount2);
  const rest = total !== null && part2 !== null ? Math.abs(total) - Math.abs(part2) : null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await updateTx({
      id: row.id, amount: d.amount, direction: d.dir, date: d.date, description: d.desc, categoryId: d.cat || null, accountId: d.acc || null, lineId: d.line || null,
      note: d.note, transfer: d.transfer, rule: offerRule && d.rule, repeat: d.repeat, split: d.split && !d.transfer ? { categoryId: d.cat2 || null, amount: d.amount2 } : null,
    });
    if (!r.ok) { setBusy(false); return setError(r.error); }
    // La meta va aparte y solo si cambió: así editar un movimiento nunca toca su meta sin querer.
    if (d.goal !== goal) {
      const g = await setTxGoal({ id: row.id, goal: d.goal });
      setBusy(false);
      if (!g.ok) return setError(g.error);
      const c = g.data.crossed.at(-1);
      toast(c ? fill(t.edit.goalMilestone, { pct: c.pct, name: c.name })
        : g.data.role === "in" ? fill(t.edit.goalSavedIn, { name: g.data.name }) : g.data.role === "out" ? t.edit.goalSavedOut : t.edit.goalSavedNone, g.points);
      onClose();
      router.refresh();
      return;
    }
    setBusy(false);
    const cat = categories.find((x) => x.id === d.cat)?.name ?? lines.find((l) => l.id === d.line)?.name ?? "";
    toast(r.data.ruled ? fill(t.edit.savedRule, { raw: bankText, cat }) : t.edit.saved);
    onClose();
    router.refresh();
  };

  const confirmHint = async () => {
    if (!hint) return;
    setBusy(true);
    const r = await linkLine({ id: row.id, lineId: hint.lineId });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast(fill(t.edit.linked, { name: r.data.name }));
    onClose();
    router.refresh();
  };

  const remove = async () => {
    const r = await deleteTx({ id: row.id });
    if (!r.ok) return setError(r.error);
    toast(t.edit.removed);
    onClose();
    router.refresh();
  };

  return (
    <div className={css.sideWrap} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form aria-labelledby="ed-h" className={`${css.side} ${css.edit}`} onSubmit={save}>
        <div aria-hidden="true" className={css.grabber} />
        <div className="row-between">
          <h2 id="ed-h" style={{ fontSize: 17 }}>{t.edit.title}</h2>
          <button type="button" className={css.x} aria-label={c.actions.close} onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <span className="xs muted">
          {fill(t.edit.origin, { src: t.edit.src[row.source] })}
          {row.raw ? <> · {t.edit.bank} <code style={{ background: "var(--papel)", borderRadius: 6, padding: "1px 6px" }}>{row.raw}</code></> : null}
        </span>

        {hint && !d.line && !d.transfer ? (
          <div className="banner banner-info" style={{ padding: 12 }}>
            <span style={{ flex: "1 1 200px", fontSize: 13 }}>{fill(t.edit.suggest, { name: hint.name, month: monthName(hint.month, locale).toLowerCase() })}</span>
            <span style={{ display: "flex", gap: 8 }}>
              <button type="button" className={css.mini} onClick={() => setHint(null)}>{t.edit.suggestNo}</button>
              <button type="button" className="btn btn-sm" disabled={busy} onClick={confirmHint}>{t.edit.suggestYes}</button>
            </span>
          </div>
        ) : null}

        <div className={css.fld}><label htmlFor="e-desc">{t.edit.desc}</label><input id="e-desc" type="text" className={css.in} maxLength={160} value={d.desc} onChange={(e) => up({ desc: e.target.value })} /></div>
        <div className={css.fld}>
          <span className={css.lbl}>{t.edit.dir}</span>
          <Segmented label={t.edit.dir} value={d.dir} onChange={(v) => up({ dir: v })} options={[{ value: "out", label: t.edit.out }, { value: "in", label: t.edit.in }]} />
        </div>
        <div className={css.grid2}>
          <div className={css.fld}><label htmlFor="e-amt">{t.edit.amount}</label><input id="e-amt" className={`num ${css.in}`} style={{ fontSize: 16, fontWeight: 600 }} type="text" inputMode="decimal" value={d.amount} onChange={(e) => up({ amount: e.target.value })} /></div>
          <div className={css.fld}><label htmlFor="e-date">{t.edit.date}</label><input id="e-date" type="date" className={css.in} value={d.date} onChange={(e) => { const v = e.target.value; up(v.slice(0, 4) === d.date.slice(0, 4) ? { date: v } : { date: v, line: "" }); }} /></div>
        </div>
        <div className={css.grid2}>
          <div className={css.fld}>
            <label htmlFor="e-cat">{t.edit.category}</label>
            <select id="e-cat" className={css.in} value={d.cat} disabled={d.transfer} onChange={(e) => up({ cat: e.target.value })}>
              <option value="">{t.list.noCat}</option>
              {categories.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
          <div className={css.fld}>
            <label htmlFor="e-acc">{t.edit.account}</label>
            <select id="e-acc" className={css.in} value={d.acc} onChange={(e) => up({ acc: e.target.value })}>
              <option value="">{t.list.noAccount}</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {accounts.length === 0 ? <Link href="/cuentas" className="link">{t.edit.addAccount}</Link> : null}
          </div>
        </div>
        <div className={css.fld}>
          <label htmlFor="e-line"><span className="only-desktop">{t.edit.line}</span><span className="only-mobile">{t.edit.lineShort}</span></label>
          <select id="e-line" className={css.in} value={d.line} disabled={d.transfer} onChange={(e) => { const l = lines.find((x) => x.id === e.target.value); up(l ? { line: l.id, cat: l.categoryId } : { line: "" }); }}>
            <option value="">{t.edit.none}</option>
            {lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <span className="xs muted">{t.edit.lineHint}</span>
        </div>

        {/* el original de un dividido no cuenta: la meta se elige en un movimiento sin dividir */}
        {goals.length > 0 && !d.split ? (
          <div className={css.fld}>
            <label htmlFor="e-goal">{t.edit.goal}</label>
            <select id="e-goal" className={css.in} value={d.goal} onChange={(e) => up({ goal: e.target.value })}>
              <option value="">{t.edit.none}</option>
              {goals.flatMap((g) => [
                ...(g.active || d.goal === `in:${g.id}` ? [<option key={`in:${g.id}`} value={`in:${g.id}`}>{fill(t.edit.goalIn, { name: g.name })}</option>] : []),
                <option key={`out:${g.id}`} value={`out:${g.id}`}>{fill(t.edit.goalOut, { name: g.name })}</option>,
              ])}
            </select>
            {d.goal.startsWith("out:") ? <span className={css.goalWin}>{t.edit.goalOutHint}</span> : null}
          </div>
        ) : null}

        {offerRule ? (
          <div className={css.soft} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <button type="button" role="checkbox" aria-checked={d.rule} aria-labelledby="e-rule" className={css.check} onClick={() => up({ rule: !d.rule })}>{d.rule ? <Icon name="tick" size={14} stroke={2.6} /> : null}</button>
            <span id="e-rule" style={{ fontSize: 13, lineHeight: 1.5 }}>{t.edit.rule} <strong>{bankText}</strong></span>
          </div>
        ) : null}

        <div className="row-between" style={{ minHeight: 44 }}>
          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{t.edit.transfer}</span><span className="xs muted">{t.edit.transferHint}</span></span>
          <Switch checked={d.transfer} label={t.edit.transfer} onChange={(v) => up(v ? { transfer: true, split: false, line: "" } : { transfer: false })} />
        </div>

        {!d.transfer ? (
          <>
            <button type="button" className={css.dashed} aria-expanded={d.split} onClick={() => up({ split: !d.split })}>{d.split ? t.edit.unsplit : t.edit.split}</button>
            {d.split ? (
              <div className={css.soft} style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 10 }}>
                <div className={css.fld}>
                  <label htmlFor="e-s2">{t.edit.split2}</label>
                  <select id="e-s2" className={css.in} value={d.cat2} onChange={(e) => up({ cat2: e.target.value })}>
                    <option value="">{t.list.noCat}</option>
                    {categories.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </div>
                <div className={css.fld}><label htmlFor="e-s2a">{t.edit.splitAmount}</label><input id="e-s2a" className={`num ${css.in}`} type="text" inputMode="decimal" placeholder={formatMoney(0, fmt)} value={d.amount2} onChange={(e) => up({ amount2: e.target.value })} /></div>
                <span className={`xs ${rest !== null && rest <= 0 ? "neg" : "muted"}`} style={{ gridColumn: "1 / -1" }}>
                  {rest !== null ? fill(t.edit.splitHint, { rest: formatMoney(rest, fmt) }) : t.edit.splitEx}
                </span>
              </div>
            ) : null}
          </>
        ) : null}

        {/* "Se repite" solo si este movimiento no generó ni nació ya de un recurrente */}
        {recurring && !row.recurringId && !d.transfer ? (
          <div className={css.fld}>
            <label htmlFor="e-rep">{t.edit.repeat}</label>
            <select id="e-rep" className={css.in} value={d.repeat} onChange={(e) => up({ repeat: e.target.value as "" | RecFrequency })}>
              <option value="">{t.edit.repeatNo}</option>
              <option value="weekly">{t.rec.weekly}</option>
              <option value="fortnightly">{t.rec.fortnightly}</option>
              <option value="monthly">{t.rec.monthly}</option>
            </select>
          </div>
        ) : null}

        <div className={css.fld}><label htmlFor="e-note">{t.edit.note}</label><input id="e-note" type="text" className={css.in} maxLength={300} placeholder={t.edit.notePh} value={d.note} onChange={(e) => up({ note: e.target.value })} /></div>
        {error ? <p role="alert" className="error">{error}</p> : null}
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: 46 }} onClick={onClose}>{c.actions.cancel}</button>
          <button type="submit" className="btn" style={{ flex: 2, minHeight: 46 }} disabled={busy}>{busy ? c.actions.saving : t.edit.save}</button>
        </div>
        <ConfirmButton onConfirm={remove} label={t.edit.remove} confirmLabel={t.edit.removeConfirm} className={`btn btn-danger ${css.del}`} />
      </form>
    </div>
  );
}
