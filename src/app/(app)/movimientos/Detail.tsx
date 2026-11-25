"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { fill } from "@/i18n";
import { PageHeader } from "@/components/ui/basics";
import { Modal, useToast } from "@/components/ui/client";
import { formatDate, formatMoney, monthName } from "@/lib/engine";
import { addTx, linkLine, type AddResult } from "./actions";
import { AddPanel, type AddMode } from "./AddPanel";
import { EditPanel } from "./EditPanel";
import { filterTotals, foldedActive, matchRow, movHref, STATES, type Filter, type MovRow, type Query, type StateFilter } from "./lib";
import css from "./mov.module.css";
import type { Acc, AddPayload, Cat, Ctx, GoalOpt, LineOpt } from "./types";
import { ILLU } from "@/lib/images";

export type Period = { kind: "month" | "year" | "any"; year: number; month: number | null; label: string };
type Tool = "rules" | "recurring";
type Props = {
  header: { title: string; eyebrow: string };
  /** Meses (solo móvil): van debajo de los botones, encima de los filtros. */
  months: React.ReactNode;
  /** Avisos (solo lectura, recurrentes registrados): entre el encabezado y los filtros. */
  children: React.ReactNode;
  rows: MovRow[]; categories: Cat[]; accounts: Acc[]; linesByYear: Record<string, LineOpt[]>;
  period: Period; years: number[]; initial: Filter; lineName: string | null; query: Query;
  flags: { csv: boolean; recurring: boolean };
  /** "Más opciones": reglas y recurrentes (se muestran debajo de la lista al elegirlos) y el enlace a Análisis por comercio. */
  tools: { rules: React.ReactNode; ruleCount: number; recurring: React.ReactNode; recCount: number; merchantsHref: string | null };
  ctx: Ctx;
  /** Metas para "¿Tiene que ver con una meta?" y lo que hoy cuenta cada movimiento ("in:<meta>", "out:<meta>" o ""). */
  goals: GoalOpt[]; goalChoice: Record<string, string>;
};

const PAGE = 200;

export function Detail({ header, months, children, rows, categories, accounts, linesByYear, period, years, initial, lineName, query, flags, tools, ctx, goals, goalChoice }: Props) {
  const { t, c, fmt, locale } = ctx;
  const router = useRouter();
  const toast = useToast();
  const canWrite = ctx.canEdit;
  const [filter, setFilter] = useState<Filter>(initial);
  const otherYear = period.year !== Number(ctx.today.slice(0, 4));
  const folded = foldedActive(filter, otherYear && years.length > 1);
  const [moreFilters, setMoreFilters] = useState(folded > 0);
  const [add, setAdd] = useState<AddMode | null>(null);
  const [tool, setTool] = useState<Tool | null>(null);
  const [menu, setMenu] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState(false);
  const [dup, setDup] = useState<{ payload: AddPayload; info: NonNullable<AddResult["duplicate"]> } | null>(null);
  const [suggest, setSuggest] = useState<{ txId: string; lineId: string; name: string; month: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const toolRef = useRef<HTMLDivElement>(null);

  const catById = useMemo(() => new Map(categories.map((x) => [x.id, x])), [categories]);
  const accById = useMemo(() => new Map(accounts.map((x) => [x.id, x])), [accounts]);
  const visible = useMemo(() => rows.filter((r) => matchRow(r, filter)), [rows, filter]);
  const totals = useMemo(() => filterTotals(rows, filter), [rows, filter]);
  const editing = editId ? rows.find((r) => r.id === editId) ?? null : null;
  const set = (patch: Partial<Filter>) => { setFilter((f) => ({ ...f, ...patch })); setLimit(PAGE); };

  // "Más opciones": se cierra con Escape o tocando fuera
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node) && !(e.target as Element).closest?.("[data-mov-menu]")) setMenu(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [menu]);

  const openAdd = (mode: AddMode) => { setEditId(null); setMenu(false); setAdd(mode); };
  const pickTool = (x: Tool) => {
    setMenu(false);
    setTool(x);
    setTimeout(() => toolRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 60);
  };

  const goPeriod = (q: Partial<Query>) => router.push(movHref({ ...query, cat: filter.cat, cuenta: filter.account, ...q }));

  /**
   * "Por revisar" sin mes trae solo los por revisar de todas las fechas. Si el estado cambia a otro (o a "Todos"),
   * esa lista no alcanza: se carga el mes en curso completo con el nuevo estado.
   */
  const pickState = (state: StateFilter) => {
    if (period.kind === "any" && query.ver === "revisar" && state !== "revisar") {
      set({ state });
      return goPeriod({ ver: "", anio: "", mes: "", estado: state });
    }
    set({ state });
  };

  /** Guarda un movimiento a mano. Si hay uno parecido, avisa y deja decidir; si coincide con una línea del plan, la sugiere. */
  const submit = async (payload: AddPayload, force = false): Promise<boolean> => {
    setBusy(true);
    const r = await addTx({ ...payload, force });
    setBusy(false);
    if (!r.ok) { toast(r.error); return false; }
    if (r.data.duplicate) { setDup({ payload, info: r.data.duplicate }); return false; }
    setDup(null);
    toast(r.data.repeated ? t.panel.savedRec : t.panel.saved, r.points);
    if (r.data.suggestion && r.data.id) setSuggest({ txId: r.data.id, ...r.data.suggestion });
    router.refresh();
    return true;
  };

  const confirmSuggestion = async () => {
    if (!suggest) return;
    const r = await linkLine({ id: suggest.txId, lineId: suggest.lineId });
    setSuggest(null);
    if (!r.ok) return toast(r.error);
    toast(fill(t.edit.linked, { name: r.data.name }));
    router.refresh();
  };

  const stateLabel: Record<StateFilter, string> = { "": t.filters.allStates, revisar: t.filters.toReview, plan: t.filters.inPlan, transfer: t.filters.transfers, manual: t.filters.manual };
  const monthValue = period.kind === "any" ? "any" : period.kind === "year" ? "all" : String(period.month);

  const pillOf = (r: MovRow): { label: string; cls: string; style?: React.CSSProperties } => {
    if (r.kind === "transfer") return { label: c.status.transfer, cls: "pill", style: { background: "var(--azul-fondo)", color: "var(--azul-texto)" } };
    if (r.status === "review") return { label: c.status.review, cls: "pill pill-warn" };
    if (r.parts.length) return { label: t.list.st.split, cls: "pill" };
    if (r.lineId) return { label: t.list.st.plan, cls: "pill pill-ok" };
    if (r.edited) return { label: c.status.edited, cls: "pill pill-yellow" };
    return { label: t.list.st[r.source], cls: "pill" };
  };
  const catLabel = (r: MovRow) => {
    if (r.kind === "transfer") return t.list.between;
    if (r.parts.length) return r.parts.map((p) => (p.categoryId ? catById.get(p.categoryId)?.name : null) ?? t.list.noCat).join(" + ");
    return (r.categoryId ? catById.get(r.categoryId)?.name : null) ?? t.list.noCat;
  };

  const rowBody = (r: MovRow) => {
    const pill = pillOf(r);
    const catColor = r.categoryId ? catById.get(r.categoryId)?.color : null;
    // como el mockup: transferencia en azul sobre su fondo; sin categoría, ámbar sobre su fondo
    const avatar: React.CSSProperties = r.kind === "transfer" ? { color: "var(--azul-oscuro)", background: "var(--azul-fondo)" }
      : catColor ? { color: catColor } : { color: "var(--ambar-texto)", background: "var(--rojo-fondo)" };
    return (
      <>
        <span aria-hidden="true" className={css.avatar} style={avatar}>{r.description.trim().charAt(0).toUpperCase()}</span>
        <span className={css.rowMain}>
          <span>{r.description}</span>
          <span className="xs muted">{catLabel(r)} · {(r.accountId ? accById.get(r.accountId)?.name : null) ?? t.list.noAccount} · {formatDate(r.date, locale, period.kind === "any" ? "long" : "short")}</span>
        </span>
        <span className={css.right}>
          <span className={`${pill.cls} ${css.rowPill}`} style={pill.style}>{pill.label}</span>
          <span className={`num ${css.amt}`}>{formatMoney(r.amountCents, fmt, { sign: true })}</span>
        </span>
      </>
    );
  };

  /** Los botones de arriba: uno principal ("+ Gasto") y, al lado, los secundarios. En el teléfono van en su propia fila. */
  const actions = (mobile: boolean) => (
    <div className={mobile ? `${css.actions} ${css.mobileBar} only-mobile-grid` : `${css.actions} only-desktop`}>
      {canWrite ? (
        <>
          <button type="button" className={`btn ${css.addBtn}`} aria-pressed={add === "move"} onClick={() => openAdd("move")}>{t.actions.expense}</button>
          {flags.csv ? <Link href="/movimientos/importar" className={`btn btn-secondary ${css.secBtn}`}>{t.actions.csv}</Link> : null}
          <button type="button" className={`btn btn-secondary ${css.secBtn}`} aria-pressed={add === "transfer"} onClick={() => openAdd("transfer")}>{t.actions.transfer}</button>
        </>
      ) : null}
      <div className={css.menuWrap} ref={mobile ? undefined : menuRef} data-mov-menu>
        <button type="button" className={`btn btn-secondary ${css.secBtn}`} aria-expanded={menu} aria-haspopup="true" onClick={() => setMenu((v) => !v)}>
          {t.actions.more} <span aria-hidden="true">▾</span>
        </button>
        {menu ? (
          <div className={css.menu} role="group" aria-label={t.actions.more}>
            <button type="button" aria-pressed={tool === "rules"} onClick={() => pickTool("rules")}>
              <strong>{t.rules.title}</strong><span className="xs muted">{tools.ruleCount === 1 ? t.actions.ruleOne : fill(t.actions.rules, { n: tools.ruleCount })}</span>
            </button>
            {flags.recurring ? (
              <button type="button" aria-pressed={tool === "recurring"} onClick={() => pickTool("recurring")}>
                <strong>{t.rec.title}</strong><span className="xs muted">{tools.recCount === 1 ? t.actions.recOne : fill(t.actions.recs, { n: tools.recCount })}</span>
              </button>
            ) : null}
            {tools.merchantsHref ? (
              <Link href={tools.merchantsHref}><strong>{t.actions.merchants}</strong><span className="xs muted">{t.actions.merchantsSub}</span></Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      <div className={css.head}>
        <PageHeader title={header.title} eyebrow={<span className="only-desktop">{header.eyebrow}</span>}>{actions(false)}</PageHeader>
        {actions(true)}
        {months}
      </div>

      {children}

      <div className={`${css.card} ${css.filters}`}>
        <div className={css.filterRow}>
          <div className={`${css.fld} ${css.fmonth}`}>
            <label htmlFor="f-mes">{t.months.label}</label>
            <select id="f-mes" className={css.fsel} value={monthValue} onChange={(e) => goPeriod({ mes: e.target.value === "any" ? "" : e.target.value, anio: String(period.year) })}>
              {period.kind === "any" ? <option value="any">{t.months.any}</option> : null}
              <option value="all">{fill(t.months.allYear, { year: period.year })}</option>
              {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthName(i + 1, locale)} {period.year}</option>)}
            </select>
          </div>
          <div className={`${css.fld} ${css.fcat}`}>
            <label htmlFor="f-cat">{t.filters.category}</label>
            <select id="f-cat" className={css.fsel} value={filter.cat} onChange={(e) => set({ cat: e.target.value })}>
              <option value="">{t.filters.allCats}</option>
              {categories.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
          <div className={`${css.fld} ${css.fsearchWrap}`}>
            <label htmlFor="f-buscar">{t.filters.search}</label>
            <input id="f-buscar" type="search" className={css.fsearch} placeholder={t.filters.searchPh} value={filter.q} onChange={(e) => set({ q: e.target.value })} />
          </div>
          <button type="button" className={css.moreBtn} aria-expanded={moreFilters} aria-controls="f-more" onClick={() => setMoreFilters((v) => !v)}>
            {folded ? fill(t.filters.moreN, { n: folded }) : t.filters.more} <span aria-hidden="true">{moreFilters ? "▴" : "▾"}</span>
          </button>
        </div>
        <div id="f-more" className={css.filterRow} hidden={!moreFilters}>
          <div className={css.fld}>
            <label htmlFor="f-cuenta">{t.filters.account}</label>
            <select id="f-cuenta" className={css.fsel} value={filter.account} onChange={(e) => set({ account: e.target.value })}>
              <option value="">{t.filters.allAccounts}</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className={css.fld}>
            <label htmlFor="f-estado">{t.filters.state}</label>
            <select id="f-estado" className={css.fsel} value={filter.state} onChange={(e) => pickState(e.target.value as StateFilter)}>
              {STATES.map((v) => <option key={v} value={v}>{stateLabel[v]}</option>)}
            </select>
          </div>
          {years.length > 1 ? (
            <div className={css.fld}>
              <label htmlFor="f-anio">{t.months.year}</label>
              <select id="f-anio" className={css.fsel} value={period.year} onChange={(e) => goPeriod({ anio: e.target.value, mes: period.kind === "month" ? String(period.month) : period.kind === "year" ? "all" : "" })}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          ) : null}
        </div>
        {filter.line && lineName ? (
          <div className="banner banner-info" style={{ padding: "10px 14px" }}>
            <span>{fill(t.filters.line, { name: lineName })}</span>
            <button type="button" className="link" style={{ minHeight: 44 }} onClick={() => { set({ line: "" }); router.replace(movHref({ ...query, linea: "", mes: period.kind === "any" ? "" : query.mes })); }}>{t.filters.clearLine}</button>
          </div>
        ) : null}
      </div>

      <div className={css.cols}>
        <section className={`${css.card} ${css.listCard}`} aria-labelledby="mov-list">
          <div className={css.listHead}>
            <h2 id="mov-list" style={{ fontSize: 15 }}>{period.label}<span className="only-mobile"> · {visible.length}</span></h2>
            <span className="num small muted only-desktop">{canWrite ? (visible.length === 1 ? t.list.countOne : fill(t.list.count, { n: visible.length })) : fill(t.list.countRO, { n: visible.length })}</span>
            {visible.length ? (
              <span className="num small muted" style={{ flexBasis: "100%" }}>
                {t.list.in} <strong style={{ color: "var(--tinta)" }}>{formatMoney(totals.inCents, fmt)}</strong> · {t.list.out} <strong style={{ color: "var(--tinta)" }}>{formatMoney(totals.outCents, fmt)}</strong>
              </span>
            ) : null}
          </div>
          {visible.length === 0 ? (
            <div className={css.emptyList}>
              {rows.length === 0 ? <Image src={ILLU.vacioMovimientos} alt="" aria-hidden="true" width={112} height={112} sizes="112px" className="empty-img" style={{ margin: "-6px 0 -4px" }} /> : null}
              <span style={{ fontSize: 15, fontWeight: 600 }}>{t.list.emptyTitle}</span>
              <span className="small muted">{flags.csv ? t.list.emptyText : t.list.emptyTextNoCsv}</span>
              {canWrite ? (
                <div className="row wrap" style={{ justifyContent: "center" }}>
                  <button type="button" className="btn btn-sm" style={{ minHeight: 44 }} onClick={() => openAdd("move")}>{t.actions.expense}</button>
                  {flags.csv ? <Link href="/movimientos/importar" className="btn btn-secondary btn-sm" style={{ minHeight: 44 }}>{t.actions.csv}</Link> : null}
                </div>
              ) : null}
            </div>
          ) : (
            <ul className={css.list}>
              {visible.slice(0, limit).map((r) => (
                <li key={r.id}>
                  {canWrite ? (
                    <button type="button" className={css.rowBtn} data-review={r.status === "review"} aria-pressed={editId === r.id} aria-label={fill(t.list.editAria, { name: r.description })} onClick={() => { setAdd(null); setEditId(r.id); }}>
                      {rowBody(r)}
                      <span aria-hidden="true" className="only-desktop" style={{ color: "var(--gris-5)", fontSize: 18 }}>›</span>
                    </button>
                  ) : <div className={css.rowBtn} data-review={r.status === "review"}>{rowBody(r)}</div>}
                </li>
              ))}
              {visible.length > limit ? <li style={{ padding: "8px 12px" }}><button type="button" className="btn btn-secondary btn-sm btn-block" style={{ minHeight: 44 }} onClick={() => setLimit((n) => n + PAGE)}>{fill(t.list.more, { n: Math.min(PAGE, visible.length - limit) })}</button></li> : null}
            </ul>
          )}
        </section>

        {editing && canWrite ? (
          <EditPanel key={editing.id} row={editing} categories={categories} accounts={accounts} linesByYear={linesByYear} recurring={flags.recurring} ctx={ctx} onClose={() => setEditId(null)}
            goals={goals} goal={goalChoice[editing.id] ?? ""} />
        ) : canWrite && add ? (
          <AddPanel key={add} mode={add} categories={categories} accounts={accounts} linesByYear={linesByYear} flags={flags} defaultAccount={filter.account} busy={busy} ctx={ctx}
            onClose={() => setAdd(null)} onSubmit={submit} />
        ) : null}
      </div>

      {tool ? (
        <div ref={toolRef} className={css.toolWrap}>
          <div className="row-between">
            <span className="small muted">{t.actions.more}</span>
            <button type="button" className="link" style={{ minHeight: 44 }} onClick={() => setTool(null)}>{t.actions.hide}</button>
          </div>
          {tool === "rules" ? tools.rules : tools.recurring}
        </div>
      ) : null}

      <Modal open={!!dup} onClose={() => setDup(null)} title={t.panel.dupTitle} labelClose={c.actions.close}>
        {dup ? (
          <>
            <p style={{ fontSize: 14 }}>{fill(t.panel.dup, { desc: dup.info.description, date: formatDate(dup.info.date, locale), amount: formatMoney(dup.info.amountCents, fmt, { sign: true }) })}</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setDup(null)}>{t.panel.dupNo}</button>
              <button type="button" className="btn" style={{ flex: 1 }} disabled={busy} onClick={() => submit(dup.payload, true)}>{t.panel.dupYes}</button>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal open={!!suggest} onClose={() => setSuggest(null)} title={t.edit.lineShort} labelClose={c.actions.close}>
        {suggest ? (
          <>
            <p style={{ fontSize: 14 }}>{fill(t.edit.suggest, { name: suggest.name, month: monthName(suggest.month, locale).toLowerCase() })}</p>
            <p className="xs muted">{t.edit.lineHint}</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setSuggest(null)}>{t.edit.suggestNo}</button>
              <button type="button" className="btn" style={{ flex: 1 }} onClick={confirmSuggestion}>{t.edit.suggestYes}</button>
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}
