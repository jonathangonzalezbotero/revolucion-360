"use client";
import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fill } from "@/i18n";
import { annualTotals, formatMoney, monthName, monthShort, parseMoney, yearTotals, type MoneyFormat } from "@/lib/engine";
import { PageHeader } from "@/components/ui/basics";
import { Icon } from "@/components/ui/Icon";
import { Modal, useToast } from "@/components/ui/client";
import type { Category } from "@/server/data";
import { saveCell, toggleMark } from "./actions";
import {
  buildGroups, canToggle, cellStatus, cellText, compactNet, extraPays, isPaid, monthHref, negativeMonths, NORMAL_PAYS, parseCell, patchCell, patchMark, planHref, toPlanCells,
  type CellState, type GridGroup, type LineLite, type LinkedState, type LinkOptions, type MarkState, type MonthState, type SavedLine,
} from "./lib";
import { AddForm, EditForm, type FormText } from "./LineForms";
import type { FixedReason } from "@/lib/engine/habito";
import type { LineStatus } from "@/lib/engine";
import type { PlanText } from "./messages";
import css from "./plan.module.css";

type Locale = "es" | "en";
type Props = {
  year: number; curYear: number; defaultMonth: number; states: MonthState[]; canEdit: boolean; nextExists: boolean;
  categories: Category[]; lines: LineLite[]; cells: CellState;
  /** Cómo clasifica hoy la regla automática cada línea de gasto (null = del día a día). Viene fresca del servidor en cada refresco. */
  auto: Record<string, FixedReason | null>; fmt: MoneyFormat; locale: Locale; m: PlanText; t: FormText & { close: string };
  /** Suma de movimientos unidos por línea y mes (no cambia en esta pantalla). */
  linked: LinkedState;
  /** "Pagado · a mano" por línea y mes. */
  marks: MarkState;
  /** Movimientos unidos a cada línea este año: con alguno, no cambia entre ingreso y gasto. */
  linkedCount: Record<string, number>;
  /** Metas, deudas y activos para "Unir a". Se leen de las props: se refrescan al guardar. */
  links: LinkOptions;
};
type Commit = (e: React.FocusEvent<HTMLInputElement>) => void;
type Mark = (lineId: string, name: string, month: number, paid: boolean) => void;
type Adding = { where: "inline" | "sheet"; cat?: string } | null;
const NO_TX: (number | null)[] = Array<null>(12).fill(null);
const NO_MARKS: boolean[] = Array<boolean>(12).fill(false);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const selectAll = (e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.select();

/**
 * La rejilla del año. Las celdas viven aquí (no se vuelven a leer de las props): cada celda se guarda sola al salir
 * del campo, los totales se recalculan al instante y, si el guardado falla, la celda vuelve a su valor anterior.
 */
export function PlanGrid(props: Props) {
  const { year, curYear, defaultMonth, canEdit, nextExists, locale } = props;
  // Textos, formato y fondos de los meses no cambian durante la sesión: se fijan una vez para que las filas no se repinten con cada guardado.
  const [{ fmt, m, t, states }] = useState({ fmt: props.fmt, m: props.m, t: props.t, states: props.states });
  const toast = useToast();
  const [categories, setCategories] = useState(props.categories);
  const [lines, setLines] = useState(props.lines);
  const [cells, setCells] = useState(props.cells);
  const [fresh, setFresh] = useState<string[]>([]);
  const [marks, setMarks] = useState(props.marks);
  const [adding, setAdding] = useState<Adding>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const inlineRef = useRef<HTMLElement>(null);
  const linked = props.linked;

  const groups = useMemo(() => buildGroups(categories, lines, cells), [categories, lines, cells]);
  const planCells = useMemo(() => toPlanCells(cells), [cells]);
  const months = useMemo(() => yearTotals(lines, planCells), [lines, planCells]);
  const annual = useMemo(() => annualTotals(lines, planCells), [lines, planCells]);
  const rowIndex = useMemo(() => new Map(groups.flatMap((g) => g.rows).map((r, i) => [r.line.id, i])), [groups]);
  const neg = negativeMonths(months);

  const commit = useCallback<Commit>(async (e) => {
    const el = e.currentTarget;
    const lineId = el.dataset.line ?? "", month = Number(el.dataset.month), prev = Number(el.dataset.v), prevManual = el.dataset.m === "1";
    const raw = el.value, next = parseCell(raw, parseMoney);
    if (next === null) { el.value = cellText(prev); toast(m.grid.invalid); return; }
    if (next === prev) { el.value = cellText(prev); return; }
    setCells((c) => patchCell(c, lineId, month, next, true));
    const r = await saveCell({ lineId, month, amount: raw });
    if (r.ok) return;
    // Solo se devuelve si nadie la cambió otra vez mientras se guardaba
    setCells((c) => (c[lineId]?.a[month - 1] === next ? patchCell(c, lineId, month, prev, prevManual) : c));
    toast(r.error);
  }, [toast, m]);
  const openEdit = useCallback((id: string) => setEditing(id), []);

  /** "Pendiente" ↔ "Pagado · a mano", desde la celda del mes. Mismo dato que el Detalle del mes. */
  const mark = useCallback<Mark>(async (lineId, name, month, paid) => {
    setMarks((x) => patchMark(x, lineId, month, paid));
    const r = await toggleMark({ lineId, month, paid });
    if (!r.ok) { setMarks((x) => patchMark(x, lineId, month, !paid)); toast(r.error); return; }
    toast(fill(paid ? m.mes.marked : m.mes.unmarked, { name }), r.points);
  }, [toast, m]);
  /** Toda línea de gasto puede marcarse pagada desde su celda del mes (aprobado por Jonathan el 25 nov 2026). */
  const markable = useCallback((l: LineLite) => canEdit && l.kind === "expense", [canEdit]);

  function onKey(e: React.KeyboardEvent<HTMLTableElement>) {
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || el.dataset.r === undefined) return;
    const len = el.value.length, start = el.selectionStart ?? 0, end = el.selectionEnd ?? 0, whole = start === 0 && end === len;
    let r = Number(el.dataset.r), c = Number(el.dataset.month);
    if (e.key === "Enter" || e.key === "ArrowDown") r++;
    else if (e.key === "ArrowUp") r--;
    else if (e.key === "ArrowRight" && (whole || start === len)) c++;
    else if (e.key === "ArrowLeft" && (whole || end === 0)) c--;
    else if (e.key === "Escape") { el.value = cellText(Number(el.dataset.v)); el.select(); return; }
    else return;
    const next = e.currentTarget.querySelector<HTMLInputElement>(`input[data-r="${r}"][data-month="${c}"]`);
    if (next) { e.preventDefault(); next.focus(); }
    else if (e.key === "Enter") el.blur();
  }

  function merge(saved: SavedLine) {
    setLines((ls) => (ls.some((l) => l.id === saved.line.id) ? ls.map((l) => (l.id === saved.line.id ? saved.line : l)) : [...ls, saved.line]));
    setCells((c) => ({ ...c, [saved.line.id]: saved.row }));
  }
  function onAdded(saved: SavedLine, points?: number) {
    merge(saved);
    setFresh((f) => [...f, saved.line.id]);
    setAdding(null);
    toast(fill(m.add.added, { name: saved.line.name, total: formatMoney(saved.row.a.reduce((a, b) => a + b, 0), fmt) }), points);
  }
  function onSaved(saved: SavedLine, kept: number) {
    merge(saved);
    setEditing(null);
    toast(kept === 0 ? m.edit.saved : kept === 1 ? m.edit.savedKeptOne : fill(m.edit.savedKept, { n: kept }));
  }
  function onType(lineId: string, fixed: boolean | null) {
    setLines((ls) => ls.map((l) => (l.id === lineId ? { ...l, fixed } : l)));
    toast(fill(m.type.saved, { type: fixed === null ? m.type.auto : fixed ? m.type.fixed : m.type.flex }));
  }
  function onRemoved(line: LineLite) {
    setLines((ls) => ls.filter((l) => l.id !== line.id));
    setCells((c) => Object.fromEntries(Object.entries(c).filter(([k]) => k !== line.id)));
    setEditing(null);
    toast(fill(m.edit.removed, { name: line.name }));
  }
  const where = (): "inline" | "sheet" => (window.matchMedia("(max-width: 899px)").matches ? "sheet" : "inline");
  const openAdd = () => setAdding((a) => (a ? null : { where: where() }));
  const addIn = useCallback((cat: string) => setAdding({ where: where(), cat }), []);
  // En escritorio el formulario se abre arriba de la rejilla: se lleva la vista hasta él para que el clic no parezca muerto.
  useEffect(() => {
    if (adding?.where !== "inline" || !inlineRef.current) return;
    inlineRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    inlineRef.current.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  }, [adding]);
  const onCategory = (c: Category) => setCategories((cs) => [...cs, c]);
  const editLine = editing ? lines.find((l) => l.id === editing) : undefined;
  const addProps = { year, defaultMonth, categories, links: props.links, fmt, locale, m, t, onCancel: () => setAdding(null), onAdded, onCategory, initialCat: adding?.cat };
  const showPast = canEdit && (year < curYear || (year === curYear && defaultMonth > 1));
  const rowProps = { states, fresh, canEdit, fmt, locale, m, onCommit: commit, onEdit: openEdit, onMark: mark, markable, linked, marks, onAddIn: addIn, toast };
  const money = (v: number) => formatMoney(v, fmt);

  return (
    <>
      <PageHeader title={fill(m.title, { year })} eyebrow={<>
        <span className="only-desktop">{m.eyebrow}</span><span className="only-mobile">{m.eyebrowShort}</span>
        <span className={css.yearNav}>
          {year > curYear - 1 ? <Link href={planHref(year - 1, curYear)}>{fill(m.prevYear, { year: year - 1 })}</Link> : null}
          {year < curYear + 1 ? <Link href={planHref(year + 1, curYear)}>{fill(m.nextYear, { year: year + 1 })}</Link> : null}
        </span>
      </>}>
        {canEdit ? <Link href="/asistente" className="btn btn-secondary only-desktop">{m.assistant}</Link> : null}
        {canEdit && year === curYear && !nextExists ? <Link href={planHref(year + 1, curYear)} className="btn btn-secondary only-desktop">{fill(m.duplicate, { year: year + 1 })}</Link> : null}
        {canEdit ? (
          <>
            <button type="button" className="btn only-desktop" aria-expanded={adding?.where === "inline"} onClick={openAdd}>{m.addLine}</button>
            <button type="button" className={`only-mobile ${css.plus}`} aria-label={m.addLineAria} aria-expanded={adding?.where === "sheet"} onClick={openAdd}><Icon name="plus" size={22} /></button>
          </>
        ) : null}
      </PageHeader>

      {adding?.where === "inline" ? (
        <section ref={inlineRef} className="form-open only-desktop" aria-label={m.add.title} style={{ padding: "26px 28px", scrollMarginTop: 16 }}>
          <AddForm key={adding.cat ?? ""} {...addProps} selMonth={defaultMonth} />
        </section>
      ) : null}
      <Modal open={adding?.where === "sheet"} onClose={() => setAdding(null)} title={m.add.titleShort} labelClose={t.close}>
        {adding?.where === "sheet" ? <AddForm key={adding.cat ?? ""} {...addProps} selMonth={defaultMonth} sheet /> : null}
      </Modal>

      <section aria-label={m.totals.aria} className={`${css.totals} only-desktop`}>
        <div className={`${css.total} ${css.totalLead}`}><span>{m.totals.income}</span><span className="num big">{money(annual.income)}</span></div>
        <div className={css.total}><span>{m.totals.expense}</span><span className="num big">{money(annual.expense)}</span></div>
        <div className={css.total}><span>{annual.net < 0 ? m.totals.netNeg : m.totals.net}</span><span className={`num big ${annual.net < 0 ? css.warn : ""}`}>{money(Math.abs(annual.net))}</span></div>
        <div className={css.total}><span>{m.totals.negMonths}</span><span className={`num big ${neg > 0 ? css.warn : ""}`}>{fill(m.totals.ofTwelve, { n: neg })}</span></div>
      </section>

      <div className={`${css.legend} only-desktop`}>
        <span><i aria-hidden="true" className={css.past} />{m.legend.past}</span>
        <span><i aria-hidden="true" className={css.current} style={{ outline: "1.5px solid var(--tinta)" }} />{m.legend.current}</span>
        <span><i aria-hidden="true" className={css.future} />{m.legend.planned}</span>
        <span className={css.hint}>{canEdit ? m.legend.hint : m.legend.readOnly}</span>
      </div>
      {showPast ? <p className={`small muted ${css.pastNote}`}>{m.pastOptional}</p> : null}

      <section className={`${css.gridCard} only-desktop`}>
        <div className="table-scroll">
          <table className={css.table} aria-label={fill(m.grid.aria, { year })} onKeyDown={onKey}>
            <thead>
              <tr>
                <th scope="col">{m.grid.concept}</th>
                {MONTHS.map((x) => (
                  <th key={x} scope="col" className={css[states[x - 1]]} aria-current={states[x - 1] === "current" ? "date" : undefined}>
                    <Link href={monthHref(year, x, curYear)} title={fill(m.grid.seeMonth, { month: monthName(x, locale).toLowerCase() })}>{monthShort(x, locale)}{states[x - 1] === "current" ? " •" : ""}</Link>
                  </th>
                ))}
                <th scope="col">{m.grid.total}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <GroupRows key={g.category.id} g={g} rowIndex={rowIndex} {...rowProps} />
              ))}
            </tbody>
            <tfoot>
              <tr className={css.in}><th scope="row">{m.grid.in}</th>{months.map((x, i) => <td key={i} className="num">{money(x.income)}</td>)}<td className="num">{money(annual.income)}</td></tr>
              <tr className={css.out}><th scope="row">{m.grid.out}</th>{months.map((x, i) => <td key={i} className="num">{money(x.expense)}</td>)}<td className="num">{money(annual.expense)}</td></tr>
              <tr className={css.net}>
                <th scope="row">{m.grid.net}</th>
                {months.map((x, i) => <td key={i}><span className={`num ${css.netPill} ${x.net < 0 ? css.short : ""}`}>{money(x.net)}</span></td>)}
                <td className={`num ${annual.net < 0 ? css.warn : ""}`}>{money(annual.net)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <div className="only-mobile">
        <MobileViews groups={groups} nets={months.map((x) => x.net)} yearNet={annual.net} year={year} curYear={curYear} defaultMonth={defaultMonth} {...rowProps} />
      </div>

      <Modal open={!!editLine} onClose={() => setEditing(null)} title={m.edit.title} labelClose={t.close}>
        {editLine ? (
          <EditForm key={editLine.id} line={editLine} row={cells[editLine.id]} auto={props.auto[editLine.id]} onType={onType} categories={categories} defaultFrom={defaultMonth} locale={locale} m={m} t={t}
            links={props.links} linkedCount={props.linkedCount[editLine.id] ?? 0}
            onSaved={onSaved} onRemoved={() => onRemoved(editLine)} />
        ) : null}
      </Modal>
    </>
  );
}

type RowsProps = {
  states: MonthState[]; fresh: string[]; canEdit: boolean; fmt: MoneyFormat; locale: Locale; m: PlanText; onCommit: Commit; onEdit: (id: string) => void;
  onMark: Mark; markable: (l: LineLite) => boolean; linked: LinkedState; marks: MarkState; onAddIn: (cat: string) => void; toast: (text: string) => void;
};

function GroupRows({ g, rowIndex, ...p }: RowsProps & { g: GridGroup; rowIndex: Map<string, number> }) {
  return (
    <>
      <tr className={css.group}>
        <th scope="rowgroup">
          <span className={css.groupName}>
            <span aria-hidden="true" className={css.dot} style={{ background: g.category.color }} />{g.category.name}
            {p.canEdit ? <AddInButton name={g.category.name} m={p.m} onClick={() => p.onAddIn(g.category.id)} /> : null}
          </span>
        </th>
        {g.totals.map((v, i) => <td key={i} className="num">{v === 0 ? "—" : formatMoney(v, p.fmt)}</td>)}
        <td className="num">{formatMoney(g.total, p.fmt)}</td>
      </tr>
      {g.rows.map((r) => (
        <LineRow key={r.line.id} line={r.line} amounts={r.amounts} manual={r.manual} total={r.total} r={rowIndex.get(r.line.id) ?? 0} isNew={p.fresh.includes(r.line.id)}
          states={p.states} canEdit={p.canEdit} fmt={p.fmt} locale={p.locale} m={p.m} onCommit={p.onCommit} onEdit={p.onEdit}
          tx={p.linked[r.line.id] ?? NO_TX} marked={p.marks[r.line.id] ?? NO_MARKS} markable={p.markable(r.line)} onMark={p.onMark} toast={p.toast} />
      ))}
    </>
  );
}

/** "+" en el título de cada categoría: abre el formulario de nueva línea con esa categoría elegida. */
function AddInButton({ name, m, onClick }: { name: string; m: PlanText; onClick: () => void }) {
  return (
    <button type="button" className={css.addIn} aria-label={fill(m.grid.addInAria, { group: name })} title={fill(m.grid.addInTitle, { group: name })} onClick={onClick}>
      <Icon name="plus" size={14} />
    </button>
  );
}

type CellInfo = { status: LineStatus; toggle: boolean; extra: number | null };
/** Estado de cada mes de una línea: pagado, parcial, si se puede marcar a mano y si cae un pago de más. */
function cellInfo(line: LineLite, amounts: number[], manual: boolean[], tx: (number | null)[], marked: boolean[], markable: boolean): CellInfo[] {
  const extra = extraPays(line, { a: amounts, m: manual });
  return amounts.map((v, i) => {
    const status = cellStatus(v, tx[i], marked[i]);
    return { status, toggle: markable && canToggle(v, status), extra: extra[i] };
  });
}
const cellTone = (st: LineStatus) => (isPaid(st) ? css.paidCell : st === "partial" ? css.partialCell : "");

/** "5 pagos": se explica al pasar el mouse (title) y al tocarlo (aviso), y el lector de pantalla lo lee completo. */
function ExtraTag({ line, n, month, m, locale, toast, big }: { line: LineLite; n: number; month: number; m: PlanText; locale: Locale; toast: (t: string) => void; big?: boolean }) {
  const f = line.frequency === "fortnightly" ? "fortnightly" : "weekly";
  const why = fill(m.grid.extraWhy[line.kind][f], { n, normal: NORMAL_PAYS[f] });
  return (
    <button type="button" className={`${css.extraTag} ${big ? css.extraBig : ""}`} title={why} aria-label={fill(m.grid.extraAria, { n, month: monthName(month, locale), why })} onClick={() => toast(why)}>
      {fill(m.grid.extra, { n })}
    </button>
  );
}

/** Marcar o deshacer "Pagado · a mano"; si lo pagó un movimiento, solo dice "Pagado". */
function PaidControl({ line, month, info, m, locale, onMark, big, className = "" }: { line: LineLite; month: number; info: CellInfo; m: PlanText; locale: Locale; onMark: Mark; big?: boolean; className?: string }) {
  const { status } = info, monthLabel = monthName(month, locale);
  if (info.toggle) {
    const on = status === "paid_manual";
    const label = fill(on ? m.grid.undo : m.grid.mark, { line: line.name, month: monthLabel });
    return (
      <button type="button" className={`${css.markBtn} ${big ? css.markBig : ""} ${className}`} aria-pressed={on} aria-label={label} title={on ? m.mes.hintUndo : m.mes.hintMark} onClick={() => onMark(line.id, line.name, month, !on)}>
        <Icon name="tick" size={big ? 14 : 11} />{on ? m.grid.paid : big ? m.grid.markShort : null}
      </button>
    );
  }
  if (isPaid(status)) return <span className={css.paidTag} title={m.grid.paidTx}><Icon name="tick" size={big ? 14 : 11} />{status === "over" ? m.grid.over : m.grid.paid}</span>;
  if (status === "partial") return <span className={css.partialTag}>{m.grid.partial}</span>;
  return null;
}

/** Una fila de 12 celdas. Solo se repinta la fila que cambió (las demás conservan sus arreglos). */
const LineRow = memo(function LineRow({ line, amounts, manual, total, r, isNew, states, canEdit, fmt, locale, m, onCommit, onEdit, tx, marked, markable, onMark, toast }: Omit<RowsProps, "fresh" | "linked" | "marks" | "markable" | "onAddIn"> & {
  line: LineLite; amounts: number[]; manual: boolean[]; total: number; r: number; isNew: boolean; tx: (number | null)[]; marked: boolean[]; markable: boolean;
}) {
  const tag = isNew ? <span className={css.newTag}>{m.grid.newTag}</span> : null;
  const info = cellInfo(line, amounts, manual, tx, marked, markable);
  return (
    <tr className={`${css.line} ${isNew ? css.fresh : ""}`}>
      <th scope="row">
        {canEdit
          ? <button type="button" className={css.lineBtn} title={fill(m.grid.editLine, { name: line.name })} onClick={() => onEdit(line.id)}><span>{line.name}</span>{tag}<Icon name="edit" size={13} /></button>
          : <>{line.name}{tag}</>}
      </th>
      {amounts.map((v, i) => {
        const c = info[i], paidish = isPaid(c.status) || c.status === "partial";
        // Pendiente y marcable: el ✓ aparece al pasar el mouse o al enfocar la celda (no llena la tabla de botones).
        const reveal = c.toggle && c.status !== "paid_manual";
        return (
          <td key={i} className={`${css[states[i]]} ${cellTone(c.status)} ${reveal ? css.markable : ""}`}>
            {canEdit ? (
              <input key={v} className={`${css.cell} num`} type="text" inputMode="decimal" autoComplete="off" aria-label={fill(m.grid.cellAria, { line: line.name, month: monthName(i + 1, locale) })}
                defaultValue={cellText(v)} data-line={line.id} data-month={i + 1} data-r={r} data-v={v} data-m={manual[i] ? 1 : 0} onBlur={onCommit} onFocus={selectAll} />
            ) : <span className={`${css.cell} num`}>{cellText(v) || "—"}</span>}
            {reveal ? <PaidControl line={line} month={i + 1} info={c} m={m} locale={locale} onMark={onMark} className={css.reveal} /> : null}
            {(c.toggle && !reveal) || paidish || c.extra ? (
              <div className={css.foot}>
                {reveal ? null : <PaidControl line={line} month={i + 1} info={c} m={m} locale={locale} onMark={onMark} />}
                {c.extra ? <ExtraTag line={line} n={c.extra} month={i + 1} m={m} locale={locale} toast={toast} /> : null}
              </div>
            ) : null}
          </td>
        );
      })}
      <td className="num">{formatMoney(total, fmt)}</td>
    </tr>
  );
});

/** Móvil: "Por mes" (todas las líneas de un mes) y "Por línea" (los 12 meses de una línea). */
function MobileViews({ groups, nets, yearNet, year, curYear, defaultMonth, states, fresh, canEdit, fmt, locale, m, onCommit, onEdit, onMark, markable, linked, marks, onAddIn, toast }: RowsProps & {
  groups: GridGroup[]; nets: number[]; yearNet: number; year: number; curYear: number; defaultMonth: number;
}) {
  const [mode, setMode] = useState<"month" | "line">("month");
  const [sel, setSel] = useState(defaultMonth);
  const filled = groups.filter((g) => g.rows.length > 0);
  const all = filled.flatMap((g) => g.rows);
  const [lineId, setLineId] = useState(all[0]?.line.id ?? "");
  /** Fila o celda tocada: solo ahí aparece "Marcar pagado" (se queda hasta tocar otra). */
  const [active, setActive] = useState<string | null>(null);
  const row = all.find((r) => r.line.id === lineId) ?? all[0];
  const infoOf = (r: (typeof all)[number]) => cellInfo(r.line, r.amounts, r.manual, linked[r.line.id] ?? NO_TX, marks[r.line.id] ?? NO_MARKS, markable(r.line));
  const field = (id: string, lineKey: string, month: number, v: number, isManual: boolean, extra = "") => canEdit
    ? <input key={v} id={id} className={`${css.mInput} ${extra} num`} type="text" inputMode="decimal" autoComplete="off" defaultValue={cellText(v)} data-line={lineKey} data-month={month} data-v={v} data-m={isManual ? 1 : 0} onBlur={onCommit} onFocus={selectAll} />
    : <span id={id} className={`${css.mInput} ${extra} num`}>{cellText(v) || "—"}</span>;
  const rowInfo = row ? infoOf(row) : [];

  return (
    <div className={css.mobile}>
      <div role="group" aria-label={m.mobile.view} className={css.viewSeg}>
        <button type="button" aria-pressed={mode === "month"} onClick={() => setMode("month")}>{m.mobile.byMonth}</button>
        <button type="button" aria-pressed={mode === "line"} onClick={() => setMode("line")}>{m.mobile.byLine}</button>
      </div>

      <section aria-label={m.mobile.months} className={`dark-block ${css.yearBlock}`}>
        <div>
          <span style={{ fontSize: 13, color: "var(--oscuro-texto)" }}>{yearNet < 0 ? m.mobile.yearNetNeg : m.mobile.yearNet}</span>
          <span className="num" style={{ fontSize: 22, fontWeight: 600 }}>{formatMoney(Math.abs(yearNet), fmt)}</span>
        </div>
        <div className={css.monthsGrid}>
          {nets.map((n, i) => (
            <button key={i} type="button" className={css.monthBtn} aria-pressed={sel === i + 1} onClick={() => { setSel(i + 1); setMode("month"); }}>
              <span>{monthShort(i + 1, locale)}</span><span className={`num ${n < 0 ? css.shortMonth : ""}`}>{compactNet(n)}</span>
            </button>
          ))}
        </div>
      </section>

      {mode === "month" ? (
        <>
          <div className={css.mHead}>
            <h2>{monthName(sel, locale)} {year}</h2>
            <Link href={monthHref(year, sel, curYear)}>{m.mobile.vsReal}</Link>
          </div>
          {filled.map((g) => (
            <section key={g.category.id} className={css.mGroup}>
              <h3>
                <span><span aria-hidden="true" className={css.dot} style={{ background: g.category.color }} />{g.category.name}</span>
                <span className={css.mGroupEnd}>
                  <span className="num">{formatMoney(g.totals[sel - 1], fmt)}</span>
                  {canEdit ? <AddInButton name={g.category.name} m={m} onClick={() => onAddIn(g.category.id)} /> : null}
                </span>
              </h3>
              {g.rows.map((r) => {
                const c = infoOf(r)[sel - 1];
                return (
                  <div key={r.line.id} className={`${css.mRow} ${cellTone(c.status)}`} onFocus={() => setActive(`m-${r.line.id}`)} onClick={() => setActive(`m-${r.line.id}`)}>
                    <div className={css.mName}>
                      <label htmlFor={`m-${r.line.id}`}>{r.line.name}{fresh.includes(r.line.id) ? <> <span className={css.mTag}>{m.mobile.newTag}</span></> : null}</label>
                      {isPaid(c.status) || c.status === "partial" || c.extra ? (
                        <span className={css.mSub}>
                          {c.toggle ? null : <PaidControl line={r.line} month={sel} info={c} m={m} locale={locale} onMark={onMark} />}
                          {c.toggle && c.status === "paid_manual" ? <span className={css.paidTag}><Icon name="tick" size={11} />{m.grid.paid}</span> : null}
                          {c.extra ? <ExtraTag line={r.line} n={c.extra} month={sel} m={m} locale={locale} toast={toast} big /> : null}
                        </span>
                      ) : null}
                    </div>
                    {field(`m-${r.line.id}`, r.line.id, sel, r.amounts[sel - 1], r.manual[sel - 1])}
                    {c.toggle && (c.status === "paid_manual" || active === `m-${r.line.id}`) ? (
                      <button type="button" className={`${css.tap} ${css.tapAct}`} aria-pressed={c.status === "paid_manual"}
                        aria-label={fill(c.status === "paid_manual" ? m.grid.undo : m.grid.mark, { line: r.line.name, month: monthName(sel, locale) })}
                        onClick={() => onMark(r.line.id, r.line.name, sel, c.status !== "paid_manual")}>
                        {c.status === "paid_manual" ? m.grid.undoShort : m.grid.markShort}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </section>
          ))}
        </>
      ) : row ? (
        <section className={css.byLine}>
          <div className="field">
            <label htmlFor="plan-line" style={{ fontSize: 13, fontWeight: 600, color: "var(--tinta)" }}>{m.mobile.line}</label>
            <select id="plan-line" className="select" value={row.line.id} onChange={(e) => setLineId(e.target.value)}>
              {filled.map((g) => <optgroup key={g.category.id} label={g.category.name}>{g.rows.map((r) => <option key={r.line.id} value={r.line.id}>{r.line.name}</option>)}</optgroup>)}
            </select>
          </div>
          <p className="small muted">{m.mobile.lineHelp}</p>
          <div className={css.byLineCells}>
            {row.amounts.map((v, i) => {
              const c = rowInfo[i];
              return (
                <div key={i} className={`field ${css.byLineCell} ${cellTone(c.status)}`} style={{ gap: 4 }} onFocus={() => setActive(`l-${i}`)} onClick={() => setActive(`l-${i}`)}>
                  <label htmlFor={`l-${i}`}>{monthShort(i + 1, locale)}</label>
                  {field(`l-${i}`, row.line.id, i + 1, v, row.manual[i], states[i] === "past" ? "" : css.future)}
                  {(c.toggle && (c.status === "paid_manual" || active === `l-${i}`)) || isPaid(c.status) || c.status === "partial" ? <PaidControl line={row.line} month={i + 1} info={c} m={m} locale={locale} onMark={onMark} big /> : null}
                  {c.extra ? <ExtraTag line={row.line} n={c.extra} month={i + 1} m={m} locale={locale} toast={toast} big /> : null}
                </div>
              );
            })}
          </div>
          <div className={css.byLineTotal}><span>{m.mobile.yearTotal}</span><strong className="num">{formatMoney(row.total, fmt)}</strong></div>
          {canEdit ? <button type="button" className="btn btn-secondary" onClick={() => onEdit(row.line.id)}><Icon name="edit" size={16} />{m.mobile.editLine}</button> : null}
        </section>
      ) : null}
    </div>
  );
}
