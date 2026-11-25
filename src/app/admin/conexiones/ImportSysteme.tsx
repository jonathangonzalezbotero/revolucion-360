"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { fill } from "@/i18n";
import { guessSystemeColumns, mapSystemeRows, SYSTEME_COLUMNS, SYSTEME_MAX_ROWS, type SystemeColumn } from "@/lib/crm/connections";
import { parseCsv } from "@/lib/engine/csv";
import { useToast } from "@/components/ui/client";
import css from "../_shared/admin.module.css";
import c from "../crm/crm.module.css";
import { chunks } from "../crm/lib";
import { importSystemeBatch } from "./actions";
import x from "./conexiones.module.css";
import type { ConexionesText } from "./messages";

/**
 * "Importar desde systeme.io": lee el CSV en el navegador (no se guarda), adivina las columnas (se pueden cambiar), muestra
 * una vista previa y manda tandas de 100 filas. Quien estaba dado de baja allá entra de baja; el consentimiento de
 * marketing solo con una columna explícita Y la constancia escrita (como Importar en Contactos).
 */
export function ImportSysteme({ m }: { m: ConexionesText }) {
  const router = useRouter();
  const toast = useToast();
  const [table, setTable] = useState<string[][] | null>(null);
  const [cols, setCols] = useState<Partial<Record<SystemeColumn, number>>>({});
  const [proof, setProof] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    setError(null); setResult(null); setTable(null);
    if (!file) return;
    const t = parseCsv(await file.text());
    if (t.length < 2) { setError(m.impErrors.empty); return; }
    if (t.length - 1 > SYSTEME_MAX_ROWS) { setError(m.impErrors.too_many); return; }
    setTable(t);
    setCols(guessSystemeColumns(t[0]));
  };
  const header = table?.[0] ?? [];
  const mapped = useMemo(() => (table && cols.email !== undefined ? mapSystemeRows(table.slice(1), cols) : null), [table, cols]);
  const rows = mapped?.rows ?? [];
  const withConsent = rows.filter((r) => r.consent && !r.unsubscribed).length;
  const unsub = rows.filter((r) => r.unsubscribed).length;

  const run = async () => {
    const total = rows.length;
    const sum = { created: 0, updated: 0, invalid: 0, unsubscribed: 0, consented: 0, consentSkipped: 0 };
    let done = 0;
    setError(null);
    setProgress({ done, total });
    for (const batch of chunks(rows, 100)) {
      const r = await importSystemeBatch({ rows: batch, proof: withConsent ? proof : "" });
      if (!r.ok) { setError(r.error); setProgress(null); router.refresh(); return; }
      for (const k of Object.keys(sum) as (keyof typeof sum)[]) sum[k] += r.data[k];
      done += batch.length;
      setProgress({ done, total });
    }
    setProgress(null);
    const parts = [fill(m.impDone, { created: sum.created, updated: sum.updated })];
    if (sum.unsubscribed) parts.push(fill(m.impDoneUnsub, { n: sum.unsubscribed }));
    if (sum.consented) parts.push(fill(m.impDoneConsent, { n: sum.consented }));
    if (sum.consentSkipped) parts.push(fill(m.impDoneSkipped, { n: sum.consentSkipped }));
    if (sum.invalid) parts.push(fill(m.impDoneInvalid, { n: sum.invalid }));
    setResult(parts.join(" "));
    toast(parts[0]);
    router.refresh();
  };
  const yesNo = (b: boolean) => (b ? m.yes : m.no);

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="field">
        <label htmlFor="sys-f">{m.impFile}</label>
        <input id="sys-f" type="file" accept=".csv,text/csv" className="input" style={{ paddingTop: 9 }} aria-describedby="sys-h" onChange={(e) => onFile(e.target.files?.[0])} />
        <span id="sys-h" className="xs muted">{m.impHelp}</span>
      </div>
      {error ? <p role="alert" className={css.err}>{error}</p> : null}
      {table ? (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 8 }}>{m.impMap}</legend>
          <div className={x.mapGrid}>
            {SYSTEME_COLUMNS.map((k) => (
              <div key={k} className="field">
                <label htmlFor={`sys-${k}`}>{m.cols[k]}</label>
                <select id={`sys-${k}`} className="input" value={cols[k] ?? ""} onChange={(e) => setCols({ ...cols, [k]: e.target.value === "" ? undefined : Number(e.target.value) })}>
                  <option value="">{m.impNone}</option>
                  {header.map((h, i) => <option key={i} value={i}>{h || `#${i + 1}`}</option>)}
                </select>
              </div>
            ))}
          </div>
        </fieldset>
      ) : null}
      {table && cols.email === undefined ? <p role="alert" className={css.err}>{m.impErrors.no_email}</p> : null}
      {mapped ? (
        <>
          <p className="small" style={{ margin: 0 }} role="status">
            <strong>{fill(m.impSummary, { n: rows.length.toLocaleString("en-AU") })}</strong>
            {mapped.invalid ? <><br />{fill(m.impInvalid, { n: mapped.invalid })}</> : null}
            {mapped.duplicates ? <><br />{fill(m.impDup, { n: mapped.duplicates })}</> : null}
            {unsub ? <><br />{fill(m.impUnsub, { n: unsub })}</> : null}
          </p>
          {rows.length ? (
            <div className="field">
              <span className="label">{m.impPreview}</span>
              <div className="table-scroll">
                <table className={c.previewTable}>
                  <thead><tr><th>{m.cols.email}</th><th>{m.cols.firstName}</th><th>{m.cols.phone}</th><th>{m.cols.tags}</th><th>{m.cols.unsubscribed}</th><th>{m.cols.consent}</th></tr></thead>
                  <tbody>{rows.slice(0, 5).map((r) => <tr key={r.email}><td>{r.email}</td><td>{r.name}</td><td>{r.phone}</td><td>{r.tags.join(", ")}</td><td>{yesNo(r.unsubscribed)}</td><td>{yesNo(r.consent)}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          ) : null}
          <div className="field">
            <span className="label">{m.impConsentTitle}</span>
            {cols.consent === undefined || !withConsent ? <p className={c.hint}>{m.impConsentNone}</p> : (
              <>
                <p className={c.hint}>{fill(m.impConsentRows, { n: withConsent })}</p>
                <label htmlFor="sys-p" className={c.srOnly}>{m.impProof}</label>
                <textarea id="sys-p" className={c.textarea} style={{ minHeight: 70 }} maxLength={500} placeholder={m.impProofPh} value={proof} aria-describedby="sys-ph" onChange={(e) => setProof(e.target.value)} />
                <span id="sys-ph" className="xs muted">{m.impProof} · {m.impNoProof}</span>
              </>
            )}
          </div>
          <p className={c.hint}>{m.impTagsNote}</p>
          {result ? <p role="status" className={x.statusBox}>{result}</p> : null}
          <div className={c.actionsEnd}>
            <button type="button" className="btn" disabled={!!progress || !rows.length} onClick={run}>
              {progress ? fill(m.impGoing, { done: progress.done, total: progress.total }) : fill(m.impGo, { n: rows.length.toLocaleString("en-AU") })}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
