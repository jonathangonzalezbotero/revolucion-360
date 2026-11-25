"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fill } from "@/i18n";
import { Empty, Pill } from "@/components/ui/basics";
import { Switch, useToast } from "@/components/ui/client";
import { Icon } from "@/components/ui/Icon";
import admin from "../_shared/admin.module.css";
import type { AdminText } from "../_shared/messages";
import { AdminHeader } from "../_shared/ui";
import { createCountry, saveCountry, saveDiagCta, saveLegal, setCountryEnabled } from "./actions";
import { BENCH_KEYS, CATEGORY_KINDS, GENERIC, LEGAL_KEYS, PAY_FREQUENCIES, TERM_KEYS, type BenchForm, type CategoryKind, type CatView, type CountryStatus, type LeadForm, type LegalForm, type PayFrequency, type TermKey } from "./lib";
import type { PaisesText } from "./messages";
import css from "./paises.module.css";

export type CountryRow = { code: string; name: string; currency: string; status: CountryStatus };
export type CountryEdit = {
  rev: string; code: string; name: string; currency: string; timezone: string; enabled: boolean; payFrequency: PayFrequency;
  terms: Record<TermKey, string>; categories: CatView[]; benchmarks: BenchForm;
};
type R = { ok: true } | { ok: false; error: string };
type Act = (fn: () => Promise<R>, okText: string, after?: () => void) => void;

const href = (code: string) => `/admin/paises?pais=${encodeURIComponent(code)}`;

function useAct(): [boolean, string | null, Act] {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act: Act = (fn, okText, after) => start(async () => {
    setError(null);
    const r = await fn();
    if (!r.ok) { setError(r.error); toast(r.error); return; }
    toast(okText); after?.(); router.refresh();
  });
  return [busy, error, act];
}

export function CountriesView({ t, m, rows, edit, catalog, sources, timezones, lead, legal }: {
  t: AdminText; m: PaisesText; rows: CountryRow[]; edit: CountryEdit | null;
  catalog: { code: string; name: string; currency: string }[]; sources: { code: string; name: string }[];
  timezones: string[]; lead: LeadForm; legal: LegalForm;
}) {
  const router = useRouter();
  const [busy, error, act] = useAct();
  const [add, setAdd] = useState<{ code: string; copyFrom: string } | null>(null);
  const openAdd = () => setAdd(add ? null : { code: catalog[0]?.code ?? "", copyFrom: GENERIC });
  const picked = add ? catalog.find((c) => c.code === add.code) : undefined;

  return (
    <>
      <AdminHeader eyebrow={m.eyebrow} title={m.title}>
        <button type="button" className="btn" aria-expanded={add !== null} onClick={openAdd}>{m.add}</button>
      </AdminHeader>

      {add ? (
        <section aria-labelledby="ap" className={admin.formOpen} style={{ gap: 14 }}>
          <h2 id="ap">{m.addTitle}</h2>
          {catalog.length === 0 ? <span className="small muted">{m.addNone}</span> : (
            <div className={css.grid3}>
              <div className="field"><label htmlFor="ap-p">{m.country}</label>
                <select id="ap-p" className="select" value={add.code} onChange={(e) => setAdd({ ...add, code: e.target.value })}>
                  {catalog.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </div>
              <div className="field"><span className="label">{m.currency}</span><span className="num" style={{ height: 44, display: "flex", alignItems: "center", fontSize: 15, fontWeight: 600 }}>{picked?.currency ?? ""}</span></div>
              <div className="field"><label htmlFor="ap-b">{m.copyFrom}</label>
                <select id="ap-b" className="select" value={add.copyFrom} onChange={(e) => setAdd({ ...add, copyFrom: e.target.value })}>
                  {sources.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </div>
            </div>
          )}
          <span className="xs muted">{m.addNote}</span>
          {error ? <p role="alert" className={admin.err}>{error}</p> : null}
          <div className={css.actions}>
            <button type="button" className="btn btn-secondary" onClick={() => setAdd(null)}>{t.cancel}</button>
            <button type="button" className="btn" disabled={busy || !picked}
              onClick={() => act(() => createCountry(add), m.created, () => { const code = add.code; setAdd(null); router.push(href(code)); })}>{busy ? t.saving : m.createDraft}</button>
          </div>
        </section>
      ) : null}

      <div className={css.layout}>
        <section aria-label={m.listLabel} className={css.list}>
          {rows.map((c) => (
            <Link key={c.code} href={href(c.code)} className={css.item} aria-current={edit?.code === c.code ? "page" : undefined}>
              <span className={css.itemName}><strong>{c.name}</strong><span>{c.currency}</span></span>
              <Pill tone={c.status === "published" ? "ok" : "warn"}>{m.status[c.status]}</Pill>
            </Link>
          ))}
          <p className={css.listNote}>{m.genericNote}</p>
        </section>
        {edit ? <CountryEditor key={`${edit.code}-${edit.rev}`} t={t} m={m} c={edit} timezones={timezones} />
          : <div className={css.editor}><Empty icon="globe" title={m.addTitle} text={m.addNote}><button type="button" className="btn btn-secondary btn-sm" onClick={openAdd}>{m.add}</button></Empty></div>}
      </div>

      <div className={admin.two}>
        <CtaForm t={t} m={m} initial={lead} />
        <LegalFormView t={t} m={m} initial={legal} />
      </div>
    </>
  );
}

function CountryEditor({ t, m, c, timezones }: { t: AdminText; m: PaisesText; c: CountryEdit; timezones: string[] }) {
  const [busy, error, act] = useAct();
  const [currency, setCurrency] = useState(c.currency);
  const [timezone, setTimezone] = useState(c.timezone);
  const [freq, setFreq] = useState<PayFrequency>(c.payFrequency);
  const [terms, setTerms] = useState(c.terms);
  const [cats, setCats] = useState<CatView[]>(c.categories);
  const [bench, setBench] = useState<BenchForm>(c.benchmarks);
  const [newCat, setNewCat] = useState<{ name: string; kind: CategoryKind; basic: boolean; index: number | null } | null>(null);
  const generic = c.code === GENERIC;

  const addCat = () => {
    if (!newCat || !newCat.name.trim()) return;
    const item = { name: newCat.name.trim(), kind: newCat.kind, basic: newCat.kind === "expense" && newCat.basic };
    setCats(newCat.index === null ? [...cats, { ...item, from: null }] : cats.map((x, j) => (j === newCat.index ? { ...x, ...item } : x)));
    setNewCat(null);
  };
  const save = () => act(() => saveCountry({
    code: c.code, currency, timezone, payFrequency: freq, terms, benchmarks: bench,
    categories: cats.map((x) => ({ name: x.name, kind: x.kind, from: x.from, basic: x.basic })),
  }), m.savedCountry);

  return (
    <section aria-labelledby="ced" className={css.editor}>
      <h2 id="ced">{c.name} · <span className="num">{c.currency}</span></h2>

      <div className={css.publish}>
        <Switch checked={generic || c.enabled} label={m.publish} disabled={generic || busy}
          onChange={(v) => act(() => setCountryEnabled({ code: c.code, enabled: v }), fill(v ? m.published : m.unpublished, { name: c.name }))} />
        <span className="stack" style={{ gap: 2 }}>
          <strong style={{ fontSize: 14 }}>{m.state}: {generic ? m.status.generic : c.enabled ? m.status.published : m.status.draft}</strong>
          <span className="xs muted">{generic ? m.genericLocked : m.publishHelp}</span>
        </span>
      </div>

      <div className={css.grid2}>
        <div className="field"><label htmlFor="c-cur">{m.currencyLabel}</label>
          <input id="c-cur" className="input num" value={currency} maxLength={3} autoCapitalize="characters" spellCheck={false}
            onChange={(e) => setCurrency(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} aria-describedby={generic ? "c-cur-h" : undefined} />
          {generic ? <span id="c-cur-h" className="hint">{m.currencyHelp}</span> : null}
        </div>
        <div className="field"><label htmlFor="c-tz">{m.timezone}</label>
          <select id="c-tz" className="select" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {timezones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="c-frec">{m.freq}</label>
          <select id="c-frec" className="select" value={freq} onChange={(e) => setFreq(e.target.value as PayFrequency)}>
            {PAY_FREQUENCIES.map((f) => <option key={f} value={f}>{m.freqs[f]}</option>)}
          </select>
        </div>
      </div>

      <div className={css.block}>
        <h3>{m.termsTitle}</h3>
        <span className="xs muted">{m.termsHelp}</span>
        {TERM_KEYS.map((k) => (
          <div key={k} className={css.termRow}>
            <label htmlFor={`ct-${k}`}>{m.termKeys[k]}</label>
            <input id={`ct-${k}`} className="input" value={terms[k]} maxLength={40} placeholder={m.termKeys[k]} title={m.termEmpty}
              onChange={(e) => setTerms({ ...terms, [k]: e.target.value })} />
          </div>
        ))}
      </div>

      <div className={css.block}>
        <h3>{m.catsTitle}</h3>
        <span className="xs muted">{m.catsHelp}</span>
        <div className={css.chips}>
          {cats.map((x, i) => (
            <span key={`${x.name}-${i}`} className={css.chip}>
              <button type="button" className={css.chipName} aria-label={fill(m.catEdit, { name: x.name })} onClick={() => setNewCat({ name: x.name, kind: x.kind, basic: x.basic, index: i })}>
                {x.name} <span className={css.chipKind}>{m.kinds[x.kind]}{x.basic ? ` · ${m.basic}` : ""}</span>
              </button>
              <button type="button" className={css.chipX} aria-label={fill(m.catRemove, { name: x.name })} onClick={() => setCats(cats.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button>
            </span>
          ))}
          {newCat ? null : <button type="button" className={css.addChip} onClick={() => setNewCat({ name: "", kind: "expense", basic: false, index: null })}>{m.catAdd}</button>}
        </div>
        {newCat ? (
          <div className={css.catForm}>
            <div className="field"><label htmlFor="nc-n">{m.catName}</label><input id="nc-n" className="input" value={newCat.name} maxLength={40} autoFocus
              onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCat(); } }} /></div>
            <div className="field"><label htmlFor="nc-k">{m.catKind}</label>
              <select id="nc-k" className="select" value={newCat.kind} onChange={(e) => setNewCat({ ...newCat, kind: e.target.value as CategoryKind })}>
                {CATEGORY_KINDS.map((k) => <option key={k} value={k}>{m.kinds[k]}</option>)}
              </select>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => setNewCat(null)}>{t.cancel}</button>
            <button type="button" className="btn btn-secondary" disabled={!newCat.name.trim()} onClick={addCat}>{newCat.index === null ? m.catAddBtn : m.catSave}</button>
            {newCat.kind === "expense" ? (
              <label className={css.check}><input type="checkbox" checked={newCat.basic} onChange={(e) => setNewCat({ ...newCat, basic: e.target.checked })} /> {m.basicLabel}</label>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className={css.panel}>
        <h3>{m.benchTitle}</h3>
        <span className="xs muted">{m.benchHelp}</span>
        <div className={css.benchHead} aria-hidden="true"><span /><span>{m.benchGood}</span><span>{m.benchWarn}</span></div>
        {BENCH_KEYS.map((k) => {
          const unit = k === "emergency" ? m.monthsUnit : m.pctUnit;
          return (
            <div key={k} className={css.benchRow} role="group" aria-label={m.bench[k]}>
              <span>{m.bench[k]}</span>
              {(["good", "warn"] as const).map((w) => (
                <span key={w} className={css.unit}>
                  <input className="input num" inputMode="decimal" value={bench[k][w]} maxLength={12} aria-label={`${m.bench[k]}: ${w === "good" ? m.benchGood : m.benchWarn}`}
                    onChange={(e) => setBench({ ...bench, [k]: { ...bench[k], [w]: e.target.value } })} />
                  <span aria-hidden="true">{unit}</span>
                </span>
              ))}
            </div>
          );
        })}
      </div>

      {error ? <p role="alert" className={admin.err}>{error}</p> : null}
      <div className={css.actions}>
        <button type="button" className="btn" disabled={busy} onClick={save}>{busy ? t.saving : m.saveCountry}</button>
      </div>
    </section>
  );
}

function CtaForm({ t, m, initial }: { t: AdminText; m: PaisesText; initial: LeadForm }) {
  const [busy, error, act] = useAct();
  const [v, setV] = useState(initial);
  return (
    <section aria-labelledby="cta" className={admin.section} style={{ gap: 14 }}>
      <h2 id="cta">{m.ctaTitle}</h2>
      <span className="xs muted">{m.ctaHelp}</span>
      <div className="field"><label htmlFor="cta-t">{m.ctaFields.title}</label><input id="cta-t" className="input" value={v.title} maxLength={120} onChange={(e) => setV({ ...v, title: e.target.value })} /></div>
      <div className="field"><label htmlFor="cta-x">{m.ctaFields.text}</label><textarea id="cta-x" className="textarea" rows={3} value={v.text} maxLength={400} onChange={(e) => setV({ ...v, text: e.target.value })} /></div>
      <div className="field"><label htmlFor="cta-u">{m.ctaFields.url}</label><input id="cta-u" className="input" type="url" inputMode="url" value={v.url} maxLength={500} placeholder={m.ctaUrlPh} onChange={(e) => setV({ ...v, url: e.target.value })} /></div>
      <div className="field"><label htmlFor="cta-b">{m.ctaFields.button}</label><input id="cta-b" className="input" value={v.button} maxLength={40} onChange={(e) => setV({ ...v, button: e.target.value })} aria-describedby="cta-b-h" />
        <span id="cta-b-h" className="hint">{m.ctaNoBtn}</span></div>
      {error ? <p role="alert" className={admin.err}>{error}</p> : null}
      <div className={css.actions}>
        <button type="button" className="btn" disabled={busy} onClick={() => act(() => saveDiagCta(v), m.ctaSaved)}>{busy ? t.saving : m.save}</button>
      </div>
    </section>
  );
}

function LegalFormView({ t, m, initial }: { t: AdminText; m: PaisesText; initial: LegalForm }) {
  const [busy, error, act] = useAct();
  const [v, setV] = useState(initial);
  return (
    <section aria-labelledby="lg" className={admin.section} style={{ gap: 14 }}>
      <h2 id="lg">{m.legalTitle}</h2>
      <span className="xs muted">{m.legalHelp}</span>
      <div className={css.grid2}>
        {LEGAL_KEYS.map((k) => (
          <div key={k} className="field" style={k === "address" ? { gridColumn: "1 / -1" } : undefined}>
            <label htmlFor={`lg-${k}`}>{m.legalFields[k]}</label>
            <input id={`lg-${k}`} className="input" value={v[k]} maxLength={k === "address" ? 200 : 120} placeholder={m.legalPh[k] || undefined} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
          </div>
        ))}
      </div>
      {error ? <p role="alert" className={admin.err}>{error}</p> : null}
      <div className={css.actions}>
        <Link href="/legal/terminos" className="btn btn-ghost btn-sm" target="_blank" rel="noopener noreferrer">{m.seeTerms}</Link>
        <Link href="/legal/privacidad" className="btn btn-ghost btn-sm" target="_blank" rel="noopener noreferrer">{m.seePrivacy}</Link>
        <button type="button" className="btn" disabled={busy} onClick={() => act(() => saveLegal(v), m.legalSaved)}>{busy ? t.saving : m.save}</button>
      </div>
    </section>
  );
}
