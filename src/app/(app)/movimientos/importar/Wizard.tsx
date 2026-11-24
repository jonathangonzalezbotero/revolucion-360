"use client";
// Asistente "Importar CSV". El archivo se lee AQUÍ, en el navegador: al servidor solo llegan las filas ya convertidas.
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { fill } from "@/i18n";
import { Switch, useToast } from "@/components/ui/client";
import {
  closingBalance, formatDate, formatMoney, mappingWorks, guessMapping, mapRows, normalize, parseCsv,
  type CsvMapping, type CsvRow, type DateFormat, type ISODate, type MatchConfig, type MoneyFormat,
} from "@/lib/engine";
import { finishImport, importBatch, loadContext, saveFormat, setBalanceFromFile, startImport, type ImportContext } from "./actions";
import {
  BANKS, ROLES, appBalanceAt, chunk, classifyRows, columnCount, columnsInfo, countNorm, dateRange, fileProblem, formatFits,
  headerSignature, lineForYear, mappingFromRoles, merchantKey, missingRoles, patternOf, reconcile, repeatedDescriptions, rolesFromMapping, ruleForNorm, normRules,
  setRole, suggestFor, totals, type Classified, type LineCand, type Reconcile, type Role, type RuleLite, type SavedFormat,
} from "./lib";
import type { Msg } from "./messages";
import css from "./importar.module.css";

type Acc = { id: string; name: string; kind: string; institution: string };
type Cat = { id: string; name: string };
type Props = { accounts: Acc[]; categories: Cat[]; formats: { bank: string; mapping: SavedFormat }[]; cfg: MatchConfig; fmt: MoneyFormat; locale: "es" | "en"; t: Msg };
type Rule = RuleLite & { kind: "existing" | "suggested" | "added" };
type Final = Classified & { categoryId: string | null; planLine: LineCand | null };
type Done = {
  imported: number; inCents: number; outCents: number; dups: number; transfers: number; skipped: number; review: number; rulesOn: number;
  points: number; rec: Reconcile; fileEnd: ISODate; canUpdate: boolean; partial: string | null;
};

const PAGE = 100;
const OTHER = "other";
const guessBank = (institution: string): string | null => BANKS.find((b) => normalize(institution).includes(b.toLowerCase())) ?? null;
const ddmm = (d: ISODate) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function Check({ checked, onChange, label, labelledBy }: { checked: boolean; onChange: () => void; label?: string; labelledBy?: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} aria-labelledby={labelledBy} className={css.check} onClick={onChange}>
      {checked ? "✓" : ""}
    </button>
  );
}

export function Wizard({ accounts, categories, formats, cfg, fmt, locale, t }: Props) {
  const toast = useToast();
  const money = (c: number, sign = false) => formatMoney(c, fmt, { sign, cents: true });
  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const accName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);

  // ───── Paso 1: banco, cuenta y archivo ─────
  const [step, setStep] = useState(0);
  const [accountId, setAccountId] = useState(accounts[0].id);
  const [bank, setBank] = useState<string>(guessBank(accounts[0].institution) ?? BANKS[0]);
  const [otherBank, setOtherBank] = useState("");
  const [file, setFile] = useState<{ name: string; rows: string[][] } | null>(null);
  const [reading, setReading] = useState(false);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bankName = bank === OTHER ? otherBank.trim() : bank;
  const bankLabel = bankName || t.upload.yourBank;

  // ───── Paso 2: columnas ─────
  const [roles, setRoles] = useState<Role[]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [dateFormat, setDateFormat] = useState<DateFormat>("DMY");
  const [invert, setInvert] = useState(false);
  const [remember, setRemember] = useState(true);
  const [formatNote, setFormatNote] = useState<"saved" | "changed" | null>(null);
  const [setupFor, setSetupFor] = useState<string | null>(null);

  // ───── Pasos 3 y 4: revisión y reglas ─────
  const [ctx, setCtx] = useState<ImportContext | null>(null);
  const [rows, setRows] = useState<Classified[]>([]);
  const [fileRows, setFileRows] = useState<CsvRow[]>([]);
  const [skipped, setSkipped] = useState<{ line: number; reason: "date" | "amount" }[]>([]);
  const [manualCat, setManualCat] = useState<Record<number, string | null>>({});
  const [joined, setJoined] = useState<Record<number, string | null>>({});
  const [shown, setShown] = useState(PAGE);
  const [rules, setRules] = useState<Rule[]>([]);
  const [nk, setNk] = useState("");
  const [nc, setNc] = useState("");
  const [ruleErr, setRuleErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const mapping: CsvMapping = useMemo(() => mappingFromRoles(roles, { hasHeader, dateFormat, invert }), [roles, hasHeader, dateFormat, invert]);
  const missing = missingRoles(roles);
  const mapped = useMemo(() => (file && missing.length === 0 ? mapRows(file.rows, mapping) : null), [file, mapping, missing.length]);
  const range = mapped ? dateRange(mapped.rows) : null;
  const works = useMemo(() => (file && missing.length === 0 ? mappingWorks(file.rows, mapping) : false), [file, mapping, missing.length]);
  const columns = useMemo(() => (file ? columnsInfo(file.rows, hasHeader) : []), [file, hasHeader]);

  /** Se avanza solo con los botones (que recalculan todo); el indicador de pasos solo deja volver. */
  const dirty = () => setErr(null);
  const go = (n: number) => { setStep(n); setErr(null); };

  /** Columnas: el formato guardado de ese banco si todavía sirve; si no, se adivinan (y se avisa si el banco cambió su archivo). */
  function setupColumns(data: string[][], label: string) {
    const saved = formats.find((f) => f.bank.toLowerCase() === label.toLowerCase())?.mapping;
    let m: CsvMapping, note: "saved" | "changed" | null = null;
    if (saved && formatFits(saved, data)) { m = saved; note = "saved"; }
    else { m = guessMapping(data); note = saved ? "changed" : null; }
    setRoles(rolesFromMapping(m, columnCount(data)));
    setHasHeader(m.hasHeader); setDateFormat(m.dateFormat); setInvert(!!m.invert); setFormatNote(note); setSetupFor(label.toLowerCase());
    return { m, note };
  }

  async function readFile(f: File | undefined) {
    if (!f) return;
    setErr(null);
    const problem = fileProblem(f.name, f.size);
    if (problem) { setErr(t.errors[problem]); return; }
    setReading(true);
    try {
      const data = parseCsv(await f.text());
      if (data.length === 0) { setErr(t.errors.noRows); return; }
      setFile({ name: f.name, rows: data });
      setupColumns(data, bankName);
    } catch {
      setErr(t.errors.read);
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function toColumns() {
    if (!bankName) return setErr(t.errors.noBank);
    if (!accountId) return setErr(t.errors.noAccount);
    if (!file) return setErr(t.errors.noFile);
    const setup = setupFor !== bankName.toLowerCase() ? setupColumns(file.rows, bankName) : null;
    go(1);
    // con el formato guardado de ese banco (y que todavía sirve), el paso de columnas se salta
    if ((setup?.note ?? formatNote) === "saved") void toReview(setup?.m ?? mapping);
  }

  async function toReview(m: CsvMapping = mapping) {
    if (!file) return;
    const res0 = mapRows(file.rows, m), rg = dateRange(res0.rows);
    if (missingRoles(rolesFromMapping(m, columnCount(file.rows))).length || !mappingWorks(file.rows, m) || !rg) return setErr(t.cols.none);
    setBusy(true); setErr(null);
    if (remember) {
      await saveFormat({ bank: bankName, mapping: { ...m, invert: !!m.invert, headers: headerSignature(file.rows, m.hasHeader), columns: columnCount(file.rows) } });
    }
    const res = await loadContext({ accountId, from: rg.from, to: rg.to });
    setBusy(false);
    if (!res.ok) return setErr(res.error);
    setCtx(res.data);
    setFileRows(res0.rows);
    setSkipped(res0.skipped);
    setRows(classifyRows(res0.rows, accountId, res.data.existing, cfg));
    setManualCat({}); setJoined({}); setShown(PAGE);
    setRules(res.data.rules.map((r) => ({ key: r.id, pattern: r.pattern, categoryId: r.categoryId, lineId: r.lineId, on: true, kind: "existing" as const })));
    go(2);
  }

  // ───── Cada fila con su categoría y su línea del plan ─────
  const linesByMonth = useMemo(() => {
    const map = new Map<number, LineCand[]>();
    for (const l of ctx?.lines ?? []) map.set(l.month, [...(map.get(l.month) ?? []), l]);
    return map;
  }, [ctx]);
  // descripción normalizada una sola vez por fila, y patrones de reglas normalizados una vez por cambio de reglas
  const normByLine = useMemo(() => new Map(rows.map((r) => [r.line, normalize(r.description)])), [rows]);
  const nRules = useMemo(() => normRules(rules), [rules]);
  const final: Final[] = useMemo(() => rows.map((r) => {
    if (r.flag === "transfer" || !ctx) return { ...r, categoryId: null, planLine: null };
    const manual = manualCat[r.line];
    const rule = ruleForNorm(normByLine.get(r.line) ?? "", nRules);
    let categoryId = manual !== undefined ? manual : rule?.categoryId ?? null;
    const y = +r.date.slice(0, 4), m = +r.date.slice(5, 7);
    const monthLines = linesByMonth.get(m) ?? [];
    let planLine: LineCand | null = null;
    if (joined[r.line] !== undefined) planLine = joined[r.line] ? monthLines.find((l) => l.id === joined[r.line] && l.year === y) ?? null : null;
    else if (rule?.lineId && (manual === undefined || manual === rule.categoryId)) planLine = lineForYear(rule.lineId, y, ctx.ruleLines, monthLines);
    if (!categoryId && planLine && manual === undefined) categoryId = planLine.categoryId;
    return { ...r, categoryId, planLine };
  }), [rows, ctx, linesByMonth, manualCat, joined, normByLine, nRules]);

  const included = final.filter((r) => r.include);
  const taken = useMemo(() => new Set(included.filter((r) => r.planLine).map((r) => `${r.planLine!.id}:${+r.date.slice(5, 7)}`)), [included]);
  const nDup = final.filter((r) => r.flag === "dup" && !r.include).length;
  const nTf = included.filter((r) => r.flag === "transfer").length;
  const nNone = included.filter((r) => r.flag !== "transfer" && !r.categoryId && !r.planLine).length;
  const descs = included.filter((r) => r.flag !== "transfer").map((r) => r.description);
  const norms = included.filter((r) => r.flag !== "transfer").map((r) => normByLine.get(r.line) ?? "");
  const ruleHits = new Map(nRules.map((r) => [r.key, countNorm(r.np, norms)]));

  const setRow = (line: number, patch: Partial<Classified>) => setRows((xs) => xs.map((x) => (x.line === line ? { ...x, ...patch } : x)));
  const setAll = (include: boolean) => setRows((xs) => xs.map((x) => ({ ...x, include })));

  // ───── Reglas ─────
  function toRules() {
    const known = rules.filter((r) => r.kind !== "suggested");
    const prev = new Map(rules.filter((r) => r.kind === "suggested").map((r) => [r.pattern, r]));
    const suggested: Rule[] = repeatedDescriptions(descs, known).map(({ pattern }) => {
      const kept = prev.get(pattern);
      if (kept) return kept;
      // si el usuario ya les puso categoría a esas filas, la regla nace con esa categoría
      const votes = new Map<string, number>();
      for (const r of included) {
        const c = manualCat[r.line];
        if (c && merchantKey(r.description) === pattern) votes.set(c, (votes.get(c) ?? 0) + 1);
      }
      const categoryId = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return { key: `s:${pattern}`, pattern, categoryId, lineId: null, on: !!categoryId, kind: "suggested" };
    });
    setRules([...known.filter((r) => r.kind === "added"), ...suggested, ...known.filter((r) => r.kind === "existing")]);
    go(3);
  }
  const visibleRules = rules.filter((r) => r.kind !== "existing" || (ruleHits.get(r.key) ?? 0) > 0);
  const updRule = (key: string, patch: Partial<Rule>) => setRules((xs) => xs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  function addRule() {
    const pattern = patternOf(nk);
    if (!pattern) return setRuleErr(t.rules.errKw);
    if (!nc) return setRuleErr(t.rules.errCat);
    setRuleErr(null);
    setRules((xs) => [{ key: `a:${pattern}:${Date.now()}`, pattern, categoryId: nc, lineId: null, on: true, kind: "added" }, ...xs.filter((r) => !(r.kind !== "existing" && r.pattern === pattern))]);
    setNk("");
  }

  // ───── Importar en lotes de 500 ─────
  async function runImport() {
    if (!ctx || included.length === 0 || busy) return;
    setBusy(true); setErr(null);
    const fileEnd = dateRange(fileRows)!.to;
    const rec = reconcile(closingBalance(fileRows), ctx.account.kind, appBalanceAt(ctx.account, ctx.accountTx, included, fileEnd));
    const start = await startImport({
      accountId, bank: bankName, total: fileRows.length + skipped.length, duplicates: nDup, transfers: nTf,
      balanceDiff: rec.status === "diff" ? rec.diffCents : rec.status === "ok" ? 0 : null,
    });
    if (!start.ok) { setBusy(false); return setErr(start.error); }
    let count = 0, failed = false;
    setProgress({ done: 0, total: included.length });
    for (const batch of chunk(included)) {
      const res = await importBatch({
        importId: start.data, accountId,
        rows: batch.map((r) => ({ date: r.date, amountCents: r.amountCents, raw: r.description.slice(0, 300), categoryId: r.categoryId, lineId: r.planLine?.id ?? null, pairId: r.flag === "transfer" ? r.pairId : null })),
      });
      if (!res.ok) { failed = true; setErr(res.error); break; }
      count += res.data.inserted;
      setProgress({ done: count, total: included.length });
    }
    const newRules = rules.filter((r) => r.kind !== "existing" && r.on && (r.categoryId || r.lineId)).map((r) => ({ pattern: r.pattern, categoryId: r.categoryId, lineId: r.lineId }));
    const fin = await finishImport({ importId: start.data, rules: newRules });
    const imported = fin.ok ? fin.data.imported : count;
    const sent = included.slice(0, count);
    const sums = totals(sent);
    setDone({
      imported, ...sums, dups: nDup, transfers: sent.filter((r) => r.flag === "transfer").length, skipped: skipped.length,
      review: sent.filter((r) => r.flag !== "transfer" && !r.categoryId && !r.planLine).length,
      rulesOn: rules.filter((r) => r.on && (r.categoryId || r.lineId) && (r.kind !== "existing" || (ruleHits.get(r.key) ?? 0) > 0)).length,
      points: fin.ok ? fin.points ?? 0 : 0, rec, fileEnd, canUpdate: ctx.account.balanceDate <= fileEnd,
      partial: failed ? fill(t.done.partial, { n: count, total: included.length }) : null,
    });
    if (imported > 0) toast(imported === 1 ? t.done.toastOne : fill(t.done.toast, { n: imported }), fin.ok ? fin.points : undefined);
    setProgress(null); setBusy(false);
    setStep(4);
  }

  async function applyFileBalance() {
    if (!done || done.rec.status !== "diff") return;
    setBusy(true);
    const res = await setBalanceFromFile({ accountId, balanceCents: done.rec.fileCents, date: done.fileEnd });
    setBusy(false);
    if (!res.ok) return setErr(res.error);
    setDone({ ...done, rec: { status: "ok", fileCents: done.rec.fileCents } });
    toast(fill(t.done.updated, { acct: accName.get(accountId) ?? "" }));
  }

  function restart() {
    setStep(0); setFile(null); setErr(null); setRoles([]); setFormatNote(null); setSetupFor(null);
    setCtx(null); setRows([]); setFileRows([]); setSkipped([]); setManualCat({}); setJoined({}); setRules([]); setDone(null); setShown(PAGE);
  }

  const locked = step === 4 || busy;
  const alert = err ? <p role="alert" className={css.alert}>{err}</p> : null;

  return (
    <>
      <ol aria-label={t.stepsAria} className={css.steps}>
        {t.steps.map((label, i) => (
          <li key={label}>
            <button type="button" className={css.stepBtn} aria-current={step === i ? "step" : undefined} disabled={locked || i > step} onClick={() => setStep(i)}>
              <span className={css.dot} data-on={i <= step}>{i < step ? "✓" : i + 1}</span>
              <span className={css.stepLabel}>{label}</span>
            </button>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <section className={css.panel} aria-label={t.steps[0]}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span id="imp-bank" className="label">{t.upload.bankQ}</span>
            <div role="radiogroup" aria-labelledby="imp-bank" className={css.chips}>
              {[...BANKS, OTHER].map((b) => (
                <button key={b} type="button" role="radio" aria-checked={bank === b} className={css.chip} onClick={() => { setBank(b); dirty(); }}>
                  {b === OTHER ? t.upload.other : b}
                </button>
              ))}
            </div>
            {bank === OTHER ? (
              <div className="field" style={{ maxWidth: 360, marginTop: 6 }}>
                <label htmlFor="imp-other">{t.upload.otherLabel}</label>
                <input id="imp-other" className={css.sel} value={otherBank} maxLength={60} placeholder={t.upload.otherPh} onChange={(e) => { setOtherBank(e.target.value); dirty(); }} />
              </div>
            ) : null}
          </div>
          <div className="field" style={{ maxWidth: 360 }}>
            <label htmlFor="imp-acc">{t.upload.accountQ}</label>
            <select id="imp-acc" className={css.sel} value={accountId} onChange={(e) => {
              setAccountId(e.target.value); dirty();
              const g = guessBank(accounts.find((a) => a.id === e.target.value)?.institution ?? "");
              if (g && !file) setBank(g);
            }}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className={css.drop} data-over={over} role="group" aria-label={t.upload.dropAria}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); void readFile(e.dataTransfer.files?.[0]); }}>
            <span aria-hidden="true" className={css.csvIcon}>CSV</span>
            <span className={css.dropText} aria-live="polite">
              {reading ? <strong style={{ fontSize: 15 }}>{t.upload.reading}</strong> : file ? (
                <>
                  <strong style={{ fontSize: 15, overflowWrap: "anywhere" }}>{file.name}</strong>
                  <span className="small muted">
                    {mapped && range
                      ? mapped.rows.length === 1 ? fill(t.upload.infoOne, { from: formatDate(range.from, locale, "day") })
                        : fill(t.upload.info, { n: mapped.rows.length, from: formatDate(range.from, locale, "day"), to: formatDate(range.to, locale, "day") })
                      : fill(t.upload.infoNone, { n: Math.max(0, file.rows.length - (hasHeader ? 1 : 0)) })}
                  </span>
                </>
              ) : (
                <>
                  <strong style={{ fontSize: 15 }}>{t.upload.drop}</strong>
                  <span className="small muted">{t.upload.dropSub}</span>
                </>
              )}
            </span>
            <input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void readFile(e.target.files?.[0])} />
            <button type="button" className="btn btn-secondary" disabled={reading} onClick={() => inputRef.current?.click()}>{file ? t.upload.change : t.upload.choose}</button>
          </div>
          <details className={css.how}>
            <summary>{fill(t.upload.howTo, { bank: bankLabel })}</summary>
            <ol>{t.upload.how.map((h) => <li key={h}>{h}</li>)}</ol>
            <Link href="/academia" style={{ fontWeight: 600 }}>{t.upload.video}</Link>
          </details>
          {alert}
          <div className={css.nav}>
            <button type="button" className="btn" disabled={reading} onClick={toColumns}>{t.upload.next}</button>
          </div>
        </section>
      ) : null}

      {step === 1 && file ? (
        <section className={css.panel} aria-label={t.steps[1]} style={{ gap: 18 }}>
          <div className={css.head}><h2>{t.cols.title}</h2><span className={css.sub}>{t.cols.sub}</span></div>
          {formatNote === "saved" ? <p className={`${css.note} banner-info`}>{fill(t.cols.saved, { bank: bankLabel })}</p> : null}
          {formatNote === "changed" ? <p role="alert" className={css.note} style={{ background: "var(--ambar-fondo)", color: "var(--ambar-texto)", fontWeight: 600 }}>{fill(t.cols.changed, { bank: bankLabel })}</p> : null}
          <table className={css.table}>
            <thead><tr><th scope="col">{t.cols.thFile}</th><th scope="col">{t.cols.thSamples}</th><th scope="col" style={{ width: 260 }}>{t.cols.thApp}</th></tr></thead>
            <tbody>
              {columns.map((c, i) => {
                const k = c.name ?? fill(t.cols.colN, { n: i + 1 });
                return (
                  <tr key={i}>
                    <th scope="row"><code className={css.code}>{k}</code></th>
                    <td className={`${css.samples} num`}>{c.samples.length ? c.samples.join(" · ") : t.cols.noSamples}</td>
                    <td>
                      <label htmlFor={`imp-col-${i}`} className="sr-only">{fill(t.cols.colAria, { k })}</label>
                      <select id={`imp-col-${i}`} className={`${css.sel} ${css.selSm}`} value={roles[i] ?? "ignore"} onChange={(e) => { setRoles(setRole(roles, i, e.target.value as Role)); dirty(); }}>
                        {ROLES.map((r) => <option key={r} value={r}>{t.cols.roles[r]}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px", alignItems: "flex-end" }}>
            <div className="field" style={{ width: 220 }}>
              <label htmlFor="imp-fmt">{t.cols.dateFmt}</label>
              <select id="imp-fmt" className={css.sel} value={dateFormat} onChange={(e) => { setDateFormat(e.target.value as DateFormat); dirty(); }}>
                {(["DMY", "MDY", "YMD"] as const).map((f) => <option key={f} value={f}>{t.cols.fmts[f]}</option>)}
              </select>
            </div>
            <div className={css.checkRow}><Check checked={hasHeader} labelledBy="imp-hdr" onChange={() => { setHasHeader(!hasHeader); dirty(); }} /><span id="imp-hdr">{t.cols.header}</span></div>
            <div className={css.checkRow}><Check checked={invert} labelledBy="imp-inv" onChange={() => { setInvert(!invert); dirty(); }} /><span id="imp-inv">{t.cols.invert}</span></div>
          </div>
          <div className={css.checkRow}><Check checked={remember} labelledBy="imp-save" onChange={() => setRemember(!remember)} /><span id="imp-save">{fill(t.cols.remember, { bank: bankLabel })}</span></div>
          {missing.length ? <p role="alert" className={css.alert}>{fill(t.cols.missing, { list: missing.map((x) => t.cols.missingNames[x]).join(", ") })}</p> : null}
          {file && missing.length === 0 && !works ? <p role="alert" className={css.alert}>{t.cols.none}</p> : null}
          {mapped && mapped.rows.length > 0 ? (
            <div className="stack" style={{ gap: 8 }}>
              <span className="label">{t.cols.preview}</span>
              <table className={`${css.table} ${css.revTable}`} aria-label={t.cols.previewAria}>
                <thead><tr><th scope="col" className="sr-only">{t.review.thImport}</th><th scope="col">{t.review.thDate}</th><th scope="col">{t.review.thDesc}</th><th scope="col" style={{ textAlign: "right" }}>{t.review.thAmount}</th><th scope="col" className="sr-only">{t.review.thCat}</th></tr></thead>
                <tbody>
                  {mapped.rows.slice(0, 3).map((r) => (
                    <tr key={r.line}>
                      <td aria-hidden="true" />
                      <td className="num muted">{ddmm(r.date)}</td>
                      <td><span className={css.desc}><strong>{r.description || t.untitled}</strong></span></td>
                      <td className={`${css.amt} num`} style={{ color: r.amountCents > 0 ? "var(--verde-fuerte)" : "var(--tinta)" }}>{money(r.amountCents, true)}</td>
                      <td aria-hidden="true" />
                    </tr>
                  ))}
                </tbody>
              </table>
              {mapped.skipped.length ? <span className="small muted">{mapped.skipped.length === 1 ? t.cols.skippedOne : fill(t.cols.skipped, { n: mapped.skipped.length })}</span> : null}
            </div>
          ) : null}
          {alert}
          <div className={css.nav}>
            <button type="button" className="btn btn-secondary" onClick={() => go(0)}>{t.cols.back}</button>
            <button type="button" className="btn" disabled={busy || missing.length > 0 || !works} onClick={() => void toReview()}>{busy ? t.cols.loading : t.cols.next}</button>
          </div>
        </section>
      ) : null}

      {step === 2 && ctx ? (
        <section className={css.panel} aria-label={t.steps[2]} style={{ gap: 18 }}>
          <div className={css.pills}>
            <span className={css.pill} style={{ background: "var(--verde-fondo)", color: "var(--verde-fuerte)" }}>{fill(t.review.toImport, { n: included.length })}</span>
            {nDup ? <span className={css.pill} style={{ background: "var(--ambar-fondo)", color: "var(--ambar-oscuro)" }}>{nDup === 1 ? t.review.dupOne : fill(t.review.dup, { n: nDup })}</span> : null}
            {nTf ? <span className={css.pill} style={{ background: "var(--azul-fondo)", color: "var(--azul-oscuro)" }}>{nTf === 1 ? t.review.transferOne : fill(t.review.transfer, { n: nTf })}</span> : null}
            {nNone ? <span className={css.pill} style={{ background: "var(--linea-2)", color: "var(--tinta-2)" }}>{fill(t.review.none, { n: nNone })}</span> : null}
            {skipped.length ? <span className={css.pill} style={{ background: "var(--rojo-fondo)", color: "var(--rojo-texto)" }}>{skipped.length === 1 ? t.review.skippedOne : fill(t.review.skipped, { n: skipped.length })}</span> : null}
          </div>
          <div className="row wrap" style={{ gap: 16 }}>
            <button type="button" className="link" onClick={() => setAll(true)}>{t.review.all}</button>
            <button type="button" className="link" onClick={() => setAll(false)}>{t.review.clear}</button>
          </div>
          <table className={`${css.table} ${css.revTable}`}>
            <thead><tr>
              <th scope="col" style={{ width: 40 }}><span className="sr-only">{t.review.thImport}</span></th>
              <th scope="col" style={{ width: 60 }}>{t.review.thDate}</th>
              <th scope="col">{t.review.thDesc}</th>
              <th scope="col" style={{ textAlign: "right" }}>{t.review.thAmount}</th>
              <th scope="col" style={{ width: 210 }}>{t.review.thCat}</th>
            </tr></thead>
            <tbody>
              {final.slice(0, shown).map((r) => {
                const none = r.flag !== "transfer" && !r.categoryId && !r.planLine;
                const sug = r.include && r.flag !== "transfer" && !r.planLine && joined[r.line] === undefined ? suggestFor(r, accountId, ctx.lines, taken, cfg) : null;
                return (
                  <tr key={r.line} style={{ background: r.flag === "dup" ? "var(--revisar-fondo)" : none ? "var(--papel-claro)" : "var(--blanco)", opacity: r.include ? 1 : 0.5 }}>
                    <td><Check checked={r.include} label={t.review.importAria} onChange={() => setRow(r.line, { include: !r.include })} /></td>
                    <td className="num muted">{ddmm(r.date)}</td>
                    <td>
                      <span className={css.desc}>
                        <strong>{r.description || t.untitled}</strong>
                        {r.flag === "dup" && r.dupOf ? <span className={css.flagDup}>{fill(t.review.dupNote, { date: ddmm(r.dupOf.date) })}</span> : null}
                        {r.flag === "transfer" ? (
                          <span className={css.suggest}>
                            <span className={css.flagTf}>{fill(t.review.tfNote, { account: accName.get(r.pairAccountId ?? "") ?? "" })}</span>
                            <button type="button" className="link" style={{ fontSize: 12 }} onClick={() => setRow(r.line, { flag: "new", pairId: null, pairAccountId: null })}>{t.review.tfUndo}</button>
                          </span>
                        ) : null}
                        {r.planLine && r.flag !== "transfer" ? (
                          <span className={css.suggest}>
                            <span>{fill(t.review.joined, { line: r.planLine.name })}</span>
                            <button type="button" className="link" style={{ fontSize: 12 }} onClick={() => setJoined((j) => ({ ...j, [r.line]: null }))}>{t.review.unjoin}</button>
                          </span>
                        ) : null}
                        {sug ? (
                          <span className={css.suggest}>
                            <span>{fill(t.review.suggest, { line: sug.name })}</span>
                            <button type="button" className="pill pill-tap" onClick={() => setJoined((j) => ({ ...j, [r.line]: sug.id }))}>{t.review.join}</button>
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className={`${css.amt} num`} style={{ color: r.amountCents > 0 ? "var(--verde-fuerte)" : "var(--tinta)" }}>{money(r.amountCents, true)}</td>
                    <td className={css.catCell}>
                      {r.flag === "transfer" ? <span className="small muted">{t.review.between}</span> : (
                        <>
                          <label htmlFor={`imp-cat-${r.line}`} className="sr-only">{fill(t.review.catAria, { desc: r.description })}</label>
                          <select id={`imp-cat-${r.line}`} className={`${css.sel} ${css.selSm}`} value={r.categoryId ?? ""} onChange={(e) => setManualCat((mc) => ({ ...mc, [r.line]: e.target.value || null }))}>
                            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            <option value="">{t.review.noCat}</option>
                          </select>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {final.length > shown ? (
            <div className="row wrap" style={{ gap: 14 }}>
              <span className="small muted">{fill(t.review.showing, { shown, total: final.length })}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShown((n) => n + PAGE)}>{fill(t.review.more, { n: Math.min(PAGE, final.length - shown) })}</button>
            </div>
          ) : null}
          {skipped.length ? (
            <details className={css.how}>
              <summary>{t.review.skippedTitle} ({skipped.length})</summary>
              <ul style={{ margin: "10px 0 0", paddingLeft: 20, lineHeight: 1.7 }}>
                {skipped.slice(0, 50).map((x) => <li key={x.line}>{fill(t.review.skippedLine, { line: x.line, reason: x.reason === "date" ? t.review.reasonDate : t.review.reasonAmount })}</li>)}
              </ul>
            </details>
          ) : null}
          {included.length === 0 ? <p role="alert" className={css.alert}>{t.review.nothing}</p> : null}
          {alert}
          <div className={css.nav}>
            <button type="button" className="btn btn-secondary" onClick={() => go(1)}>{t.review.back}</button>
            <button type="button" className="btn" disabled={included.length === 0} onClick={toRules}>{t.review.next}</button>
          </div>
        </section>
      ) : null}

      {step === 3 && ctx ? (
        <section className={css.panel} aria-label={t.steps[3]} style={{ gap: 18 }}>
          <div className={css.head}><h2>{t.rules.title}</h2><span className={css.sub}>{t.rules.sub}</span></div>
          {visibleRules.length ? (
            <ul className={css.rules}>
              {visibleRules.map((r) => {
                const n = ruleHits.get(r.key) ?? 0;
                const k = r.pattern.toUpperCase();
                return (
                  <li key={r.key}>
                    <span className={css.ruleText}>
                      {t.rules.contains} <code className={css.code}>{k}</code> →{" "}
                      {r.kind === "suggested" ? (
                        <>
                          <label htmlFor={`imp-rc-${r.key}`} className="sr-only">{fill(t.rules.catAria, { k })}</label>
                          <select id={`imp-rc-${r.key}`} className={`${css.sel} ${css.selSm}`} style={{ width: 200, display: "inline-block", verticalAlign: "middle" }} value={r.categoryId ?? ""}
                            onChange={(e) => updRule(r.key, { categoryId: e.target.value || null, on: !!e.target.value })}>
                            <option value="">{t.rules.pick}</option>
                            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </>
                      ) : <strong>{(r.categoryId && catName.get(r.categoryId)) || ctx.ruleLines[r.lineId ?? ""]?.name || t.review.noCat}</strong>}
                      {" "}<span className="small muted">· {fill(t.rules.applies, { n: n === 1 ? t.rules.one : fill(t.rules.many, { n }) })}{r.kind === "suggested" ? ` · ${t.rules.repeated}` : ""}</span>
                    </span>
                    <Switch checked={r.on} disabled={!r.categoryId && !r.lineId} label={fill(t.rules.toggle, { k })} onChange={(v) => updRule(r.key, { on: v })} />
                  </li>
                );
              })}
            </ul>
          ) : <p className="small muted" style={{ margin: 0 }}>{t.rules.empty}</p>}
          <div className={css.ruleForm}>
            <div className="field">
              <label htmlFor="imp-nk">{t.rules.newKw}</label>
              <input id="imp-nk" type="text" className={css.sel} value={nk} maxLength={80} placeholder={t.rules.ph} onChange={(e) => setNk(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRule(); } }} />
            </div>
            <div className="field">
              <label htmlFor="imp-nc">{t.rules.cat}</label>
              <select id="imp-nc" className={css.sel} value={nc} onChange={(e) => setNc(e.target.value)}>
                <option value="">{t.rules.pick}</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <button type="button" className="btn btn-dashed" style={{ minHeight: 46 }} onClick={addRule}>{t.rules.add}</button>
          </div>
          {ruleErr ? <p role="alert" className={css.alert}>{ruleErr}</p> : null}
          {alert}
          <div className={css.nav}>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => go(2)}>{t.rules.back}</button>
            <button type="button" className="btn" disabled={busy || included.length === 0} onClick={runImport} aria-live="polite">
              {progress ? fill(t.rules.importing, { done: progress.done, total: progress.total }) : included.length === 1 ? t.rules.importOne : fill(t.rules.importN, { n: included.length })}
            </button>
          </div>
        </section>
      ) : null}

      {step === 4 && done ? (
        <section className={css.done} aria-label={t.steps[4]}>
          <span className="small muted">{fill(t.done.head, { acct: accName.get(accountId) ?? "" })}</span>
          <p className={css.doneTitle}>
            {done.imported === 0 ? t.done.titleZero : done.imported === 1 ? t.done.titleOne : fill(t.done.title, { n: done.imported })}
            {done.points > 0 ? <> <span className={css.mark}>{fill(t.done.pts, { n: done.points })}</span></> : null}
          </p>
          <div className={css.doneGrid}>
            <div><span className="xs muted">{t.done.in}</span><strong className="num">{money(done.inCents, true)}</strong></div>
            <div><span className="xs muted">{t.done.out}</span><strong className="num">{money(-done.outCents)}</strong></div>
            <div><span className="xs muted">{t.done.dups}</span><strong className="num">{done.dups}</strong></div>
            <div><span className="xs muted">{t.done.rulesOn}</span><strong className="num">{done.rulesOn}</strong></div>
          </div>
          <span className="small muted">{fill(t.done.extra, { t: done.transfers, d: done.skipped, r: done.review })}</span>
          {done.partial ? <p role="alert" className={css.alert}>{done.partial}</p> : null}
          <div className={css.recon}>
            {done.rec.status === "none" ? <span>{t.done.noBal}</span> : null}
            {done.rec.status === "ok" ? <span>{fill(t.done.ok, { amount: money(done.rec.fileCents) })}</span> : null}
            {done.rec.status === "diff" ? (
              <>
                <span style={{ color: "var(--tinta)", fontWeight: 600 }}>{fill(t.done.diff, { file: money(done.rec.fileCents), app: money(done.rec.appCents), diff: money(done.rec.diffCents, true) })}</span>
                <span>{t.done.diffHint}</span>
                {done.canUpdate ? (
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={applyFileBalance}>
                    {fill(t.done.useFile, { amount: money(done.rec.fileCents), acct: accName.get(accountId) ?? "" })}
                  </button>
                ) : <span>{t.done.newer}</span>}
              </>
            ) : null}
          </div>
          {alert}
          <div className="row wrap" style={{ gap: 10 }}>
            <Link href="/movimientos" className="btn btn-yellow" style={{ minHeight: 48, fontSize: 15 }}>{t.done.see}</Link>
            <button type="button" className="btn btn-secondary" style={{ minHeight: 48, fontSize: 15, background: "transparent" }} onClick={restart}>{t.done.again}</button>
          </div>
        </section>
      ) : null}
    </>
  );
}
