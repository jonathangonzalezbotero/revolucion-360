"use client";
import { useRef, useState, useTransition } from "react";
import { fill } from "@/i18n";
import { Empty, PageHeader } from "@/components/ui/basics";
import { ConfirmButton, useToast } from "@/components/ui/client";
import { formatMoney, type Cents, type ISODate, type MoneyFormat } from "@/lib/engine";
import { ASSET_KINDS, type AssetKind, type Group, type OpKind, type Totals } from "@/lib/engine/inversiones";
import type { Result } from "@/server/action";
import { addOperation, createAsset, removeOperation, setAssetArchived, setAssetPrice, updateAsset } from "./actions";
import { resultText, resultTone } from "./lib";
import type { InversionesMessages } from "./messages";
import css from "./inversiones.module.css";

export type AssetView = {
  id: string; name: string; ticker: string; kind: AssetKind; kindLabel: string; color: string; ink: string; platform: string | null; byUnits: boolean; archived: boolean;
  qtyText: string | null; avgText: string | null;
  valueCents: Cents; costCents: Cents; gainCents: Cents; dividendsCents: Cents; hasPrice: boolean;
  priceInput: string; priceDateLabel: string | null; lineId: string | null;
  recurring: { line: string; amountCents: Cents } | null; recNeedsPrice: boolean;
  ops: { id: string; kind: OpKind; dateLabel: string; detail: string; amountCents: Cents }[];
};
export type GroupView = Group & { name: string; color: string };
type Props = {
  assets: AssetView[]; totals: Totals; byPlatform: GroupView[]; byKind: GroupView[]; lines: { id: string; name: string; takenBy: string | null }[];
  kinds: Record<AssetKind, string>; retirement: string; category: string;
  fmt: MoneyFormat; today: ISODate; canEdit: boolean; planOn: boolean;
  m: InversionesMessages; t: { cancel: string; save: string; add: string; disclaimer: string };
};
type Run = <T>(fn: () => Promise<Result<T>>, after: (r: Extract<Result<T>, { ok: true }>) => void, onError: (e: string) => void) => void;
type View = "asset" | "platform" | "kind";

export function Inversiones(p: Props) {
  const { m, fmt, canEdit } = p;
  const toast = useToast();
  const [pending, start] = useTransition();
  const [showNew, setShowNew] = useState(false);
  const [view, setView] = useState<View>("asset");
  const active = p.assets.filter((a) => !a.archived), archived = p.assets.filter((a) => a.archived);
  const [selId, setSelId] = useState<string | null>(null);
  const sel = active.find((a) => a.id === selId) ?? active[0] ?? null;
  const detailRef = useRef<HTMLElement>(null);
  const run: Run = (fn, after, onError) => start(async () => {
    const r = await fn();
    if (r.ok) after(r); else onError(r.error);
  });
  const money = (c: Cents) => formatMoney(c, fmt);
  const res = resultText(p.totals.gainCents, p.totals.costCents, fmt);
  const pick = (id: string) => {
    setSelId(id);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 899px)").matches) requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const groups = view === "platform" ? p.byPlatform : p.byKind;
  const countText = (n: number, one: string, many: string) => (n === 1 ? one : fill(many, { n }));

  return (
    <>
      <PageHeader title={m.title} eyebrow={<><span className="only-desktop">{m.eyebrow}</span><span className="only-mobile">{m.eyebrowShort}</span></>}>
        {canEdit ? (
          <>
            <button type="button" className="btn only-desktop" aria-expanded={showNew} onClick={() => setShowNew(!showNew)}>{m.add}</button>
            <button type="button" className={`${css.plus} only-mobile`} aria-expanded={showNew} aria-label={m.addAria} onClick={() => setShowNew(!showNew)}>+</button>
          </>
        ) : null}
      </PageHeader>

      <section aria-label={m.totals} className={css.totals}>
        <div>
          <span className={css.k}>{m.worth}</span><span className={`num big ${css.vMain}`}>{money(p.totals.valueCents)}</span>
          <span className={`${css.note} ${css.deskOnly}`}>{countText(active.length, m.countOne, m.count)}</span>
        </div>
        <div className={css.deskOnly}><span className={css.k}>{m.put}</span><span className={`num big ${css.v}`}>{money(p.totals.costCents)}</span></div>
        <div className={css.deskOnly}><span className={css.k}>{m.result}</span><span className={`num big ${css.v}`}>{res}</span></div>
        <div className={css.deskOnly}><span className={css.k}>{m.dividends}</span><span className={`num big ${css.v}`}>{money(p.totals.dividendsCents)}</span></div>
        <div className={css.mobileRow}>
          <span>{m.putShort} <strong className="num">{money(p.totals.costCents)}</strong></span>
          <span>{m.result} <strong className="num">{res}</strong></span>
        </div>
      </section>

      {showNew && canEdit ? (
        <NewAsset p={p} run={run} pending={pending} onClose={() => setShowNew(false)} onSaved={(id) => { setShowNew(false); setSelId(id); setView("asset"); toast(m.tCreated); }} />
      ) : null}

      {active.length === 0 ? (
        <Empty icon="sprout" title={m.emptyTitle} text={fill(m.emptyText, { retirement: p.retirement })}>
          {canEdit && !showNew ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowNew(true)}>{m.emptyCta}</button> : null}
        </Empty>
      ) : (
        <div className={css.main}>
          <section aria-label={m.listSection} className={css.listCard}>
            <div role="radiogroup" aria-label={m.views} className={css.seg}>
              {([["asset", m.viewAsset], ["platform", m.viewPlatform], ["kind", m.viewKind]] as const).map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={view === k} onClick={() => setView(k)}>{label}</button>
              ))}
            </div>
            {view === "asset" ? (
              <ul aria-label={m.list} className={css.rows}>
                {active.map((a) => (
                  <li key={a.id}>
                    <button type="button" className={css.row} aria-pressed={sel?.id === a.id} onClick={() => pick(a.id)}>
                      <span aria-hidden="true" className={css.tile} style={{ background: a.color, color: a.ink }}>{a.ticker}</span>
                      <span className={css.rowMid}>
                        <strong>{a.name}</strong>
                        <span>{[a.kindLabel, a.platform, a.qtyText ?? m.balance].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className={css.rowEnd}>
                        <strong className="num">{money(a.valueCents)}</strong>
                        <span className="num" style={{ color: resultTone(a.gainCents) }}>{resultText(a.gainCents, a.costCents, fmt)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className={css.groups}>
                {groups.map((g) => (
                  <li key={g.key}>
                    <div className={css.groupHead}>
                      <span className={css.groupName}><strong>{g.name}</strong><span>{countText(g.n, m.assetOne, m.assets)}</span></span>
                      <span className={css.groupNums}>
                        <span className="num" style={{ color: resultTone(g.gainCents) }}>{resultText(g.gainCents, 0, fmt)}</span>
                        <strong className="num">{money(g.valueCents)}</strong>
                      </span>
                    </div>
                    <div aria-hidden="true" className={css.track}><div style={{ width: `${(g.share * 100).toFixed(1)}%`, background: g.color }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {sel ? <Detail key={`${sel.id}:${sel.priceInput}`} a={sel} p={p} run={run} pending={pending} toast={toast} sectionRef={detailRef} /> : null}
        </div>
      )}

      <div className={css.bottom}>
        {active.length ? (
          <section aria-labelledby="inv-dist" className={`${css.dist} ${css.deskOnlyBlock}`}>
            <h2 id="inv-dist">{m.dist}</h2>
            {p.totals.valueCents > 0 ? (
              <div className="stack" style={{ gap: 12 }}>
                <div aria-hidden="true" className={css.stackBar}>{p.byKind.filter((d) => d.share > 0).map((d) => <div key={d.key} style={{ background: d.color, width: `${(d.share * 100).toFixed(1)}%` }} />)}</div>
                {p.byKind.filter((d) => d.share > 0).map((d) => (
                  <div key={d.key} className={css.distRow}>
                    <span aria-hidden="true" className={css.swatch} style={{ background: d.color }} />
                    <span style={{ flex: 1 }}>{d.name}</span>
                    <span className="num muted">{(d.share * 100).toFixed(0)}%</span>
                    <strong className="num" style={{ minWidth: 80, textAlign: "right" }}>{money(d.valueCents)}</strong>
                  </div>
                ))}
              </div>
            ) : <p className="small muted" style={{ lineHeight: 1.5 }}>{m.distEmpty}</p>}
          </section>
        ) : null}
        <div className="stack" style={{ gap: 8 }}>
          <p className={css.fine}>{m.tracking}</p>
          <p className={css.fine}>{p.t.disclaimer}</p>
        </div>
      </div>

      {archived.length ? (
        <details className={css.archived}>
          <summary>{fill(m.archived, { n: archived.length })}</summary>
          <ul>
            {archived.map((a) => (
              <li key={a.id}>
                <span>{a.name} <span className="xs muted">· {a.kindLabel} · {money(a.valueCents)}</span></span>
                {canEdit ? <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => setAssetArchived({ id: a.id, archived: false }), () => toast(m.tRestored), (e) => toast(e))}>{m.restore}</button> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

function NewAsset({ p, run, pending, onClose, onSaved }: { p: Props; run: Run; pending: boolean; onClose: () => void; onSaved: (id: string) => void }) {
  const { m } = p;
  const [f, setF] = useState({ name: "", kind: "etf" as AssetKind, platform: "" });
  const [error, setError] = useState("");
  return (
    <form aria-labelledby="inv-new" className={css.form} onSubmit={(e) => { e.preventDefault(); setError(""); run(() => createAsset(f), (r) => onSaved(r.data), setError); }}>
      <div className="stack" style={{ gap: 4 }}>
        <h2 id="inv-new" className={css.formTitle}>{m.newTitle}</h2>
        <span className="small muted" style={{ lineHeight: 1.5 }}>{fill(m.newSub, { retirement: p.retirement })}</span>
      </div>
      <div className={css.grid3}>
        <div className="field"><label htmlFor="inv-n">{m.name}</label><input id="inv-n" className={css.input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={m.namePh} maxLength={80} required /></div>
        <div className="field"><label htmlFor="inv-k">{m.type}</label><KindSelect id="inv-k" p={p} value={f.kind} onChange={(kind) => setF({ ...f, kind })} /></div>
        <div className="field"><label htmlFor="inv-p">{m.platform}</label><input id="inv-p" className={css.input} value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value })} placeholder={m.platformPh} maxLength={80} /></div>
      </div>
      {error ? <p role="alert" className="error">{error}</p> : null}
      <div className={css.actions}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>{p.t.cancel}</button>
        <button type="submit" className="btn" disabled={pending}>{p.t.add}</button>
      </div>
    </form>
  );
}

function KindSelect({ id, p, value, onChange }: { id: string; p: Props; value: AssetKind; onChange: (k: AssetKind) => void }) {
  return (
    <select id={id} className={css.input} value={value} onChange={(e) => onChange(e.target.value as AssetKind)}>
      {ASSET_KINDS.map((k) => <option key={k} value={k}>{p.kinds[k]}</option>)}
    </select>
  );
}

function Detail({ a, p, run, pending, toast, sectionRef }: { a: AssetView; p: Props; run: Run; pending: boolean; toast: (t: string, pts?: number) => void; sectionRef: React.RefObject<HTMLElement | null> }) {
  const { m, fmt, canEdit, today } = p;
  const [price, setPrice] = useState(a.priceInput);
  const [open, setOpen] = useState<"" | "op" | "edit">("");
  const [op, setOp] = useState({ kind: "buy" as OpKind, date: today, qty: "", price: "" });
  const [error, setError] = useState("");
  const money = (c: Cents) => formatMoney(c, fmt);
  const kindNames = a.byUnits ? m.opKinds : m.opKindsBalance;
  const showQty = a.byUnits && op.kind !== "dividend";
  const toggle = (k: typeof open) => { setOpen(open === k ? "" : k); setError(""); };
  const opColor = (k: OpKind) => (k === "sell" ? "var(--ambar-texto)" : k === "dividend" ? "var(--verde-fuerte)" : "var(--tinta)");

  return (
    <section ref={sectionRef} aria-labelledby={`inv-a-${a.id}`} className={css.detail}>
      <div className={css.detailHead}>
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <span className="xs muted">{a.platform ? fill(m.inPlatform, { type: a.kindLabel, platform: a.platform }) : a.kindLabel}</span>
          <h2 id={`inv-a-${a.id}`} className={css.detailTitle}>{a.name}</h2>
        </div>
        <strong className={`num big ${css.detailValue}`}>{money(a.valueCents)}</strong>
      </div>

      {open === "edit" && canEdit ? (
        <EditAsset a={a} p={p} run={run} pending={pending} onClose={() => setOpen("")} onSaved={(text) => { setOpen(""); toast(text); }} />
      ) : (
        <>
          <dl className={css.facts}>
            <div><dt>{m.has}</dt><dd className="num">{a.qtyText ?? m.balance}</dd>{a.avgText ? <dd className={`num ${css.sub}`}>{fill(m.avg, { price: a.avgText })}</dd> : null}</div>
            <div><dt>{m.put}</dt><dd className="num">{money(a.costCents)}</dd></div>
            <div><dt>{m.result}</dt><dd className="num" style={{ color: resultTone(a.gainCents) }}>{resultText(a.gainCents, a.costCents, fmt)}</dd></div>
            <div><dt>{m.div}</dt><dd className="num">{money(a.dividendsCents)}</dd></div>
          </dl>

          <form className={css.priceBox} onSubmit={(e) => {
            e.preventDefault(); setError("");
            run(() => setAssetPrice({ id: a.id, price }), () => toast(m.tPrice), setError);
          }}>
            <div className="field" style={{ flex: "1 1 180px", minWidth: 0 }}>
              <label htmlFor={`inv-pr-${a.id}`}>{a.byUnits ? m.priceUnit : m.priceBalance}</label>
              <span className={css.priceRow}>
                <input id={`inv-pr-${a.id}`} className={`${css.input} num`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={formatMoney(0, fmt)} disabled={!canEdit} />
                {canEdit && price.trim() && price !== a.priceInput ? <button type="submit" className="btn" disabled={pending}>{m.savePrice}</button> : null}
              </span>
            </div>
            <span className={css.updated}>{a.priceDateLabel ? fill(m.updated, { date: a.priceDateLabel }) : m.notUpdated}</span>
          </form>
          {!a.hasPrice && a.ops.length ? <p className="xs muted">{m.noPriceNote}</p> : null}

          {a.recurring ? (
            <span className={css.rec}>{fill(m.recurring, { kind: a.byUnits ? m.recBuy : m.recAdd, amount: money(a.recurring.amountCents), line: a.recurring.line })}</span>
          ) : null}
          {a.recNeedsPrice ? <p className={css.warn}>{m.recNeedsPrice}</p> : null}
          {error && open !== "op" ? <p role="alert" className="error">{error}</p> : null}

          <div className={css.opsHead}>
            <h3>{m.ops}</h3>
            {canEdit ? (
              <span className="row" style={{ gap: 8 }}>
                <button type="button" className={`btn btn-secondary ${css.small}`} onClick={() => toggle("edit")}>{m.edit}</button>
                <button type="button" className={`btn btn-secondary ${css.small}`} aria-expanded={open === "op"} onClick={() => toggle("op")}>{m.addOp}</button>
              </span>
            ) : null}
          </div>

          {open === "op" && canEdit ? (
            <form className={css.opForm} onSubmit={(e) => {
              e.preventDefault(); setError("");
              run(() => addOperation({ id: a.id, ...op, qty: showQty ? op.qty : "" }), (r) => {
                setOpen(""); setOp({ kind: "buy", date: today, qty: "", price: "" });
                toast((a.byUnits ? m.tOp : m.tOpBalance)[r.data.kind as OpKind]);
              }, setError);
            }}>
              <div className="stack" style={{ gap: 8 }}>
                <span id={`inv-ok-${a.id}`} className={css.lbl}>{m.opKind}</span>
                <div role="radiogroup" aria-labelledby={`inv-ok-${a.id}`} className={css.chips}>
                  {(["buy", "sell", "dividend"] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={op.kind === k} className={css.chip} onClick={() => setOp({ ...op, kind: k })}>{kindNames[k]}</button>)}
                </div>
              </div>
              <div className={showQty ? css.grid3 : css.grid2}>
                <div className="field"><label htmlFor={`inv-od-${a.id}`}>{m.date}</label><input id={`inv-od-${a.id}`} className={css.input} type="date" value={op.date} max={today} onChange={(e) => setOp({ ...op, date: e.target.value })} /></div>
                {showQty ? <div className="field"><label htmlFor={`inv-oq-${a.id}`}>{m.qty}</label><input id={`inv-oq-${a.id}`} className={`${css.input} num`} inputMode="decimal" value={op.qty} onChange={(e) => setOp({ ...op, qty: e.target.value })} placeholder="0" required /></div> : null}
                <div className="field"><label htmlFor={`inv-op-${a.id}`}>{showQty ? m.priceOrAmount : m.amount}</label><input id={`inv-op-${a.id}`} className={`${css.input} num`} inputMode="decimal" value={op.price} onChange={(e) => setOp({ ...op, price: e.target.value })} placeholder={formatMoney(0, fmt)} required /></div>
              </div>
              {error ? <p role="alert" className="error">{error}</p> : null}
              <div className={css.actions}>
                <button type="button" className="btn btn-secondary" onClick={() => toggle("op")}>{p.t.cancel}</button>
                <button type="submit" className="btn" disabled={pending}>{p.t.save}</button>
              </div>
            </form>
          ) : null}

          {a.ops.length ? (
            <ul className={css.ops}>
              {a.ops.map((o) => (
                <li key={o.id}>
                  <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                    <strong style={{ color: opColor(o.kind) }}>{kindNames[o.kind]}</strong>
                    <span className={`num ${css.sub}`}>{o.dateLabel} · {o.detail}</span>
                  </span>
                  <span className={css.opEnd}>
                    <strong className="num">{o.kind === "buy" ? money(o.amountCents) : `+${money(o.amountCents)}`}</strong>
                    {canEdit ? (
                      <ConfirmButton className={`btn btn-secondary ${css.remove}`} label={m.removeOp} confirmLabel={m.removeOpConfirm}
                        ariaLabel={fill(m.removeOpAria, { kind: kindNames[o.kind], date: o.dateLabel })} confirmAriaLabel={fill(m.removeOpConfirmAria, { kind: kindNames[o.kind], date: o.dateLabel })}
                        onConfirm={() => run(() => removeOperation({ id: o.id }), () => toast(m.tOpRemoved), setError)} />
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="small muted">{m.noOps}</p>}
        </>
      )}
    </section>
  );
}

function EditAsset({ a, p, run, pending, onClose, onSaved }: { a: AssetView; p: Props; run: Run; pending: boolean; onClose: () => void; onSaved: (text: string) => void }) {
  const { m } = p;
  const options = p.lines.filter((l) => !l.takenBy || l.takenBy === a.id);
  // Si su línea ya no está en el plan de este año, el campo arranca en "Ninguna" (y guardar la desliga).
  const [f, setF] = useState({ name: a.name, kind: a.kind, platform: a.platform ?? "", link: options.some((l) => l.id === a.lineId) ? (a.lineId as string) : "", monthly: "" });
  const [error, setError] = useState("");
  return (
    <form aria-labelledby={`inv-e-${a.id}`} className="stack" style={{ gap: 14 }} onSubmit={(e) => {
      e.preventDefault(); setError("");
      run(() => updateAsset({ id: a.id, ...f }), () => onSaved(m.tSaved), setError);
    }}>
      <h3 id={`inv-e-${a.id}`} className={css.lbl}>{fill(m.editTitle, { name: a.name })}</h3>
      <div className={css.grid3}>
        <div className="field"><label htmlFor={`inv-en-${a.id}`}>{m.name}</label><input id={`inv-en-${a.id}`} className={css.input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} required /></div>
        <div className="field"><label htmlFor={`inv-ek-${a.id}`}>{m.type}</label><KindSelect id={`inv-ek-${a.id}`} p={p} value={f.kind} onChange={(kind) => setF({ ...f, kind })} /></div>
        <div className="field"><label htmlFor={`inv-ep-${a.id}`}>{m.platform}</label><input id={`inv-ep-${a.id}`} className={css.input} value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value })} placeholder={m.platformPh} maxLength={80} /></div>
      </div>
      {p.planOn ? (
        <div className={css.grid2}>
          <div className="field">
            <label htmlFor={`inv-el-${a.id}`}>{m.link}</label>
            <select id={`inv-el-${a.id}`} className={css.input} value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })}>
              <option value="">{m.noLink}</option>
              {options.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              <option value="new">{fill(m.newLine, { category: p.category })}</option>
            </select>
          </div>
          {f.link === "new" ? (
            <div className="field"><label htmlFor={`inv-em-${a.id}`}>{m.monthly}</label><input id={`inv-em-${a.id}`} className={`${css.input} num`} inputMode="decimal" value={f.monthly} onChange={(e) => setF({ ...f, monthly: e.target.value })} placeholder={formatMoney(0, p.fmt)} required /><span className="hint">{m.monthlyHint}</span></div>
          ) : null}
        </div>
      ) : null}
      {error ? <p role="alert" className="error">{error}</p> : null}
      <div className={css.actions} style={{ justifyContent: "space-between" }}>
        <ConfirmButton label={m.archive} confirmLabel={m.archiveConfirm} className="btn btn-danger" onConfirm={() => run(() => setAssetArchived({ id: a.id, archived: true }), () => onSaved(m.tArchived), setError)} />
        <span className="row" style={{ gap: 10 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{p.t.cancel}</button>
          <button type="submit" className="btn" disabled={pending}>{p.t.save}</button>
        </span>
      </div>
      <p className="xs muted">{m.archiveHint}</p>
    </form>
  );
}
