"use client";
import { useId, useState } from "react";
import { fill } from "@/i18n";
import { formatDate, formatMoney, monthName, monthShort, parseMoney, weekdayName, type Frequency, type MoneyFormat } from "@/lib/engine";
import { ConfirmButton, Segmented } from "@/components/ui/client";
import type { FixedReason } from "@/lib/engine/habito";
import type { Category, CategoryKind } from "@/server/data";
import { addCategory, addLine, editLine, removeLine, setLineType } from "./actions";
import { cellText, firstWeekday, inRange, lineShape, manualCount, type CellRow, type LineLite, type NewFrequency, type NewMode, type SavedLine } from "./lib";
import type { PlanText } from "./messages";
import css from "./plan.module.css";

export type FormText = { cancel: string; saving: string; errName: string; errAmount: string; errDate: string };
type Locale = "es" | "en";
const MODES: NewMode[] = ["once", "range", "all"];
const FREQS: NewFrequency[] = ["monthly", "fortnightly", "weekly"];
const KINDS: CategoryKind[] = ["expense", "income", "debt", "saving", "goal"];
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** Línea nueva: en escritorio va abierta sobre la rejilla; en móvil, dentro de la hoja inferior (`sheet`). */
export function AddForm({ year, defaultMonth, selMonth, categories, fmt, locale, m, t, sheet, onCancel, onAdded, onCategory }: {
  year: number; defaultMonth: number; selMonth: number; categories: Category[]; fmt: MoneyFormat; locale: Locale; m: PlanText; t: FormText; sheet?: boolean;
  onCancel: () => void; onAdded: (saved: SavedLine, points?: number) => void; onCategory: (c: Category) => void;
}) {
  const a = m.add, id = useId();
  const [name, setName] = useState("");
  const [catId, setCatId] = useState(categories[0]?.id ?? "");
  const [mode, setMode] = useState<NewMode>("all");
  const [from, setFrom] = useState(defaultMonth);
  const [to, setTo] = useState(12);
  const [freq, setFreq] = useState<NewFrequency>("monthly");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(firstWeekday(year));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [catName, setCatName] = useState("");
  const [catKind, setCatKind] = useState<CategoryKind>("expense");

  const amountCents = Math.max(0, parseMoney(amount) ?? 0);
  const form = { mode, from, to, frequency: freq, firstPayDate: date || null };
  const months = lineShape({ ...form, amountCents }, year).months;
  const pays = lineShape({ ...form, amountCents: 1 }, year).months;
  const total = months.reduce((x, y) => x + y, 0);
  const group = categories.find((c) => c.id === catId);
  const pick = (kind: (c: Category) => boolean) => categories.find(kind)?.id ?? catId;
  const presets = [
    { label: a.presets.extra, apply: () => { setName(a.presetNames.extra); setCatId(pick((c) => c.kind === "income")); setMode("once"); setFrom(12); setTo(12); setFreq("monthly"); } },
    { label: a.presets.debt, apply: () => { setName(a.presetNames.debt); setCatId(pick((c) => c.kind === "debt")); setMode("range"); setFrom(11); setTo(12); setFreq("monthly"); } },
    { label: a.presets.rent, apply: () => { setName(a.presetNames.rent); setCatId(categories.find((c) => c.isBasic)?.id ?? pick((c) => c.kind === "expense")); setMode("all"); setFrom(1); setTo(12); setFreq("weekly"); } },
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError(t.errName);
    if (amountCents <= 0) return setError(t.errAmount);
    if (freq !== "monthly" && !date) return setError(t.errDate);
    setBusy(true);
    const r = await addLine({ year, categoryId: catId, name, mode, from, to, frequency: freq, amount, firstPayDate: date || null });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onAdded(r.data, r.points);
  }
  async function createCategory() {
    setBusy(true);
    const r = await addCategory({ name: catName, kind: catKind });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onCategory(r.data);
    setCatId(r.data.id);
    setCatOpen(false);
    setCatName("");
    setError("");
  }

  const monthSelect = (label: string, value: number, set: (v: number) => void, key: string) => (
    <div className="field">
      <label htmlFor={`${id}-${key}`}>{label}</label>
      <select id={`${id}-${key}`} className="select" value={value} onChange={(e) => set(Number(e.target.value))}>
        {MONTHS.map((x) => <option key={x} value={x}>{monthName(x, locale)}</option>)}
      </select>
    </div>
  );
  const qName = (
    <div className={css.q}>
      <label htmlFor={`${id}-name`}>{sheet ? a.nameShort : a.name}</label>
      <input id={`${id}-name`} className="input" type="text" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder={sheet ? a.namePhShort : a.namePh} style={sheet ? undefined : { height: 48 }} />
    </div>
  );
  const qWhere = (
    <div className={css.q}>
      <span className={css.ql} id={`${id}-cat`}>{sheet ? a.whereShort : a.where}</span>
      <div role="radiogroup" aria-labelledby={`${id}-cat`} className={css.chips}>
        {categories.map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={c.id === catId} className={css.chip} onClick={() => setCatId(c.id)}><i aria-hidden="true" style={{ background: c.color }} />{c.name}</button>
        ))}
        <button type="button" className={`${css.chip} ${css.chipNew}`} aria-expanded={catOpen} onClick={() => setCatOpen(!catOpen)}>{a.newCat}</button>
      </div>
      {catOpen ? (
        <div className={css.catForm}>
          <div className="field"><label htmlFor={`${id}-cn`}>{m.cat.name}</label><input id={`${id}-cn`} className="input" type="text" maxLength={40} value={catName} onChange={(e) => setCatName(e.target.value)}
            onKeyDown={(e) => { if (e.key !== "Enter") return; e.preventDefault(); if (catName.trim() && !busy) void createCategory(); }} /></div>
          <div className="field"><label htmlFor={`${id}-ck`}>{m.cat.kind}</label>
            <select id={`${id}-ck`} className="select" value={catKind} onChange={(e) => setCatKind(e.target.value as CategoryKind)}>{KINDS.map((k) => <option key={k} value={k}>{m.cat.kinds[k]}</option>)}</select>
          </div>
          <button type="button" className="btn btn-secondary" disabled={busy || !catName.trim()} onClick={createCategory}>{m.cat.create}</button>
        </div>
      ) : null}
    </div>
  );
  const qWhen = (
    <div className={css.q}>
      <span className={css.ql} id={`${id}-when`}>{a.when}</span>
      <div role="radiogroup" aria-labelledby={`${id}-when`} className={css.seg3}>
        {MODES.map((x) => <button key={x} type="button" role="radio" aria-checked={x === mode} onClick={() => setMode(x)}>{(sheet ? a.modesShort : a.modes)[x]}</button>)}
      </div>
      {mode !== "all" ? (
        <div className={css.pair}>
          {monthSelect(mode === "once" ? a.month : a.from, from, setFrom, "from")}
          {mode === "range" ? monthSelect(a.to, to, setTo, "to") : null}
        </div>
      ) : null}
    </div>
  );
  const qFreq = (
    <div className={css.q}>
      <span className={css.ql} id={`${id}-freq`}>{sheet ? a.freqShort : a.freq}</span>
      <div role="radiogroup" aria-labelledby={`${id}-freq`} className={css.seg3}>
        {FREQS.map((x) => <button key={x} type="button" role="radio" aria-checked={x === freq} onClick={() => setFreq(x)}>{(sheet ? a.freqsShort : a.freqs)[x]}</button>)}
      </div>
      {freq !== "monthly" ? (
        <div className="field">
          <label htmlFor={`${id}-date`}>{a.firstPay}</label>
          <input id={`${id}-date`} className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <span className="hint">{sheet || !date ? a.firstPayHintShort : fill(a.firstPayHint, { day: `${weekdayName(date, locale)} ${formatDate(date, locale, "day")}` })}</span>
        </div>
      ) : null}
    </div>
  );
  const qAmount = (
    <div className={css.q}>
      <label htmlFor={`${id}-amt`}>{sheet ? a.amountShort[freq] : fill(a.amount, { per: a.per[freq] })}</label>
      <input id={`${id}-amt`} className={`input num ${css.amount}`} type="text" inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={a.amountPh} />
    </div>
  );
  const preview = sheet ? (
    <div className={css.sum}>
      <span className="small">{amountCents ? fill(a.inMonth, { amount: formatMoney(months[selMonth - 1], fmt), month: monthName(selMonth, locale).toLowerCase() }) : a.typeAmount}</span>
      <strong className="num">{formatMoney(total, fmt)} <span className="xs">{a.inYear}</span></strong>
    </div>
  ) : (
    <div className={css.preview}>
      <div className={css.previewHead}>
        <strong>{a.preview}</strong>
        <span className="muted"><strong style={{ color: "var(--tinta)" }}>{name.trim() || a.newLine}</strong> {fill(a.previewIn, { group: group?.name ?? "" })} <strong className="num" style={{ color: "var(--tinta)" }}>{amountCents ? formatMoney(total, fmt) : "—"}</strong></span>
      </div>
      <div aria-hidden="true" className={css.previewCells}>
        {MONTHS.map((x) => {
          const on = inRange(form, x);
          const text = !on ? "—" : amountCents ? formatMoney(months[x - 1], fmt) : freq === "monthly" ? a.unknown : pays[x - 1] === 1 ? a.payOne : fill(a.pays, { n: pays[x - 1] });
          return <div key={x} className={on ? css.on : undefined}><span>{monthShort(x, locale)}</span><span className="num">{text}</span></div>;
        })}
      </div>
    </div>
  );
  const buttons = sheet
    ? <button type="submit" className="btn btn-block" disabled={busy} style={{ minHeight: 52, fontSize: 15 }}>{busy ? t.saving : a.submit}</button>
    : (
      <div className={css.actions}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>{t.cancel}</button>
        <button type="submit" className="btn" disabled={busy}>{busy ? t.saving : a.submit}</button>
      </div>
    );
  const presetRow = (
    <div className={css.presets}>
      {sheet ? null : <span className="xs muted" style={{ fontWeight: 500 }}>{a.examples}</span>}
      {presets.map((p) => <button key={p.label} type="button" className={css.preset} onClick={p.apply}>{p.label}</button>)}
    </div>
  );
  const alert = error ? <p className="error" role="alert">{error}</p> : null;

  if (sheet) return (
    <form onSubmit={submit} className={`stack ${css.sheet}`} style={{ gap: 16 }} noValidate>
      {presetRow}{qName}{qWhere}{qWhen}{qFreq}{qAmount}{preview}{alert}{buttons}
    </form>
  );
  return (
    <form onSubmit={submit} className="stack" style={{ gap: 22 }} noValidate>
      <div className={css.addHead}>
        <div className="stack" style={{ gap: 4 }}><h2 style={{ fontSize: 20 }}>{a.title}</h2><span className="small muted">{a.sub}</span></div>
        {presetRow}
      </div>
      <div className={css.addCols}><div>{qName}{qWhere}</div><div>{qWhen}{qFreq}{qAmount}</div></div>
      {preview}{alert}{buttons}
    </form>
  );
}

const EDIT_FREQS: Frequency[] = ["monthly", "fortnightly", "weekly", "yearly", "once"];

/** Editar una línea: los meses editados a mano se conservan, salvo que se pida "aplicar a todos los meses". */
export function EditForm({ line, row, auto, categories, defaultFrom, locale, m, t, onSaved, onRemoved, onType }: {
  line: LineLite; row: CellRow | undefined; auto: FixedReason | null | undefined; categories: Category[]; defaultFrom: number; locale: Locale; m: PlanText; t: FormText;
  onSaved: (saved: SavedLine, kept: number) => void; onRemoved: () => void; onType: (lineId: string, fixed: boolean | null) => void;
}) {
  const e = m.edit, id = useId();
  const [name, setName] = useState(line.name);
  const [catId, setCatId] = useState(line.categoryId);
  const [freq, setFreq] = useState<Frequency>(line.frequency);
  const [amount, setAmount] = useState(cellText(line.amountCents));
  const [date, setDate] = useState(line.firstPayDate ?? "");
  // Un pago único o anual se mueve entero: si solo se recalculara desde hoy, cambiarle la fecha dejaría el monto viejo en su mes anterior.
  const [from, setFrom] = useState(line.frequency === "once" || line.frequency === "yearly" ? 1 : defaultFrom);
  const [applyAll, setApplyAll] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const sameSide = categories.filter((c) => (c.kind === "income") === (line.kind === "income"));
  const freqs = line.frequency === "custom" ? [...EDIT_FREQS, "custom" as const] : EDIT_FREQS;
  const amountCents = parseMoney(amount);
  // La fecha solo se exige al cambiar de frecuencia: una línea semanal sin fecha se puede renombrar tal cual.
  const needsDate = freq !== line.frequency && (freq === "once" || freq === "weekly" || freq === "fortnightly");
  const recalc = freq !== "custom" && (freq !== line.frequency || amountCents !== line.amountCents || (date || null) !== line.firstPayDate);
  const kept = recalc ? manualCount(row, from) : 0;

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!name.trim()) return setError(t.errName);
    if (freq !== "custom" && (amountCents === null || amountCents < 0)) return setError(t.errAmount);
    if (freq !== "custom" && needsDate && !date) return setError(t.errDate);
    setBusy(true);
    const r = await editLine({ lineId: line.id, name, categoryId: catId, frequency: freq, amount, firstPayDate: date || null, overwriteManual: applyAll && kept > 0, fromMonth: from });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onSaved({ line: r.data.line, row: r.data.row }, r.data.keptManual);
  }
  async function remove() {
    const r = await removeLine({ lineId: line.id });
    if (!r.ok) return setError(r.error);
    onRemoved();
  }

  return (
    <form onSubmit={submit} className="stack" style={{ gap: 14 }} noValidate>
      <div className="field"><label htmlFor={`${id}-n`}>{e.name}</label><input id={`${id}-n`} className="input" type="text" maxLength={80} value={name} onChange={(x) => setName(x.target.value)} /></div>
      <div className="field"><label htmlFor={`${id}-c`}>{e.category}</label>
        <select id={`${id}-c`} className="select" value={catId} onChange={(x) => setCatId(x.target.value)}>{sameSide.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </div>
      <div className="field"><label htmlFor={`${id}-f`}>{e.frequency}</label>
        <select id={`${id}-f`} className="select" value={freq} onChange={(x) => setFreq(x.target.value as Frequency)}>{freqs.map((f) => <option key={f} value={f}>{e.freqs[f]}</option>)}</select>
      </div>
      {freq === "custom" ? <p className="small muted">{e.customHint}</p> : (
        <div className={css.pair}>
          <div className="field"><label htmlFor={`${id}-a`}>{e.amount}</label><input id={`${id}-a`} className="input input-money" type="text" inputMode="decimal" autoComplete="off" value={amount} onChange={(x) => setAmount(x.target.value)} placeholder={m.add.amountPh} /></div>
          <div className="field"><label htmlFor={`${id}-d`}>{freq === "once" ? e.dateOnce : e.date}</label><input id={`${id}-d`} className="input" type="date" value={date} onChange={(x) => setDate(x.target.value)} /></div>
        </div>
      )}
      {recalc ? (
        <div className="field"><label htmlFor={`${id}-from`}>{e.from}</label>
          <select id={`${id}-from`} className="select" value={from} onChange={(x) => setFrom(Number(x.target.value))}>{MONTHS.map((x) => <option key={x} value={x}>{monthName(x, locale)}</option>)}</select>
        </div>
      ) : null}
      {line.kind === "expense" ? <TypeField line={line} auto={auto} m={m} onType={onType} onError={setError} /> : null}
      {kept > 0 ? (
        <div className={css.notice} role="status">
          <span>{kept === 1 ? e.manualOne : fill(e.manual, { n: kept })}</span>
          <label className={css.check}><input type="checkbox" checked={applyAll} onChange={(x) => setApplyAll(x.target.checked)} /><span>{e.applyAll}<small>{e.applyAllHint}</small></span></label>
        </div>
      ) : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button type="submit" className="btn btn-block" disabled={busy}>{busy ? t.saving : e.save}</button>
      <div className="row-between wrap" style={{ borderTop: "1px solid var(--linea-2)", paddingTop: 12 }}>
        <span className="xs muted" style={{ flex: "1 1 180px" }}>{e.removeHint}</span>
        <ConfirmButton onConfirm={remove} label={e.remove} confirmLabel={e.removeConfirm} />
      </div>
    </form>
  );
}

type LineType = "auto" | "fixed" | "flex";
const toType = (fixed: boolean | null | undefined): LineType => (fixed === true ? "fixed" : fixed === false ? "flex" : "auto");
const fromType = (v: LineType): boolean | null => (v === "auto" ? null : v === "fixed");

/**
 * "Tipo de gasto" de una línea de gasto. Se guarda al tocarlo (no espera "Guardar cambios"): solo decide si la línea
 * cuenta en "Hoy puedes gastar". En Automático explica cómo la clasifica hoy la regla (`auto`, calculado en el servidor);
 * si aún no hay dato (línea recién creada), solo dice que lo decidimos por ti.
 */
function TypeField({ line, auto, m, onType, onError }: {
  line: LineLite; auto: FixedReason | null | undefined; m: PlanText; onType: (lineId: string, fixed: boolean | null) => void; onError: (e: string) => void;
}) {
  const ty = m.type;
  const [value, setValue] = useState<LineType>(toType(line.fixed));
  const [busy, setBusy] = useState(false);
  async function change(v: LineType) {
    if (busy || v === value) return;
    const prev = value;
    setValue(v);
    setBusy(true);
    const r = await setLineType({ lineId: line.id, fixed: fromType(v) });
    setBusy(false);
    if (!r.ok) { setValue(prev); return onError(r.error); }
    onError("");
    onType(line.id, fromType(v));
  }
  const hint = value === "fixed" ? ty.fixedHint : value === "flex" ? ty.flexHint
    : auto === undefined ? ty.autoHint : auto === null ? ty.autoFlex : fill(ty.autoFixed, { reason: ty.reasons[auto] });
  return (
    <div className="field" aria-busy={busy}>
      <span className="label">{ty.label}</span>
      <Segmented label={ty.label} value={value} onChange={change}
        options={[{ value: "auto", label: ty.auto }, { value: "fixed", label: ty.fixed }, { value: "flex", label: ty.flex }]} />
      <span className="hint" aria-live="polite">{hint}</span>
    </div>
  );
}
