"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { fill } from "@/i18n";
import { guessSystemeColumns, hasNewsletter, mapSystemeRows, SYSTEME_COLUMNS, SYSTEME_MAX_ROWS, systemeSummary, type SystemeColumn } from "@/lib/crm/connections";
import { parseCsv } from "@/lib/engine/csv";
import { useToast } from "@/components/ui/client";
import css from "../_shared/admin.module.css";
import c from "../crm/crm.module.css";
import { chunks } from "../crm/lib";
import { importSystemeBatch, previewSysteme } from "./actions";
import x from "./conexiones.module.css";
import type { ConexionesText } from "./messages";

/**
 * "Importar desde systeme.io": lee el CSV en el navegador (no se guarda), adivina las columnas (se pueden cambiar), muestra
 * una vista previa (nuevos/actualizados, consentimiento por newsletter, etiquetas a crear, teléfonos inválidos, 5 filas)
 * y manda tandas de 100 filas. La etiqueta newsletter da consentimiento de correo con constancia; un archivo de bajas
 * entra de baja; el consentimiento por columna solo con la constancia escrita (como Importar en Contactos).
 */
export function ImportSysteme({ m }: { m: ConexionesText }) {
  const router = useRouter();
  const toast = useToast();
  const [table, setTable] = useState<string[][] | null>(null);
  const [cols, setCols] = useState<Partial<Record<SystemeColumn, number>>>({});
  const [allUnsub, setAllUnsub] = useState(false);
  const [lookup, setLookup] = useState<{ rows: unknown; existing: Set<string>; tags: string[] } | null>(null);
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
  const mapped = useMemo(() => (table && cols.email !== undefined ? mapSystemeRows(table.slice(1), cols, { allUnsubscribed: allUnsub }) : null), [table, cols, allUnsub]);
  const rows = useMemo(() => mapped?.rows ?? [], [mapped]);
  const withConsent = rows.filter((r) => r.consent && !r.unsubscribed && !hasNewsletter(r.tags)).length;
  const fresh = lookup && lookup.rows === rows ? lookup : null; // la respuesta es de estas filas (no de un mapeo anterior)
  const sum = useMemo(() => systemeSummary(rows, fresh?.existing ?? null, fresh?.tags ?? null), [rows, fresh]);
  const tagKey = sum.tags.join("\n");

  // Vista previa: pregunta al servidor qué correos y etiquetas ya existen (solo lee). Tandas de 2,000 correos.
  useEffect(() => {
    let live = true;
    if (!rows.length) return;
    (async () => {
      const existing = new Set<string>();
      let tags: string[] = [];
      const emails = rows.map((r) => r.email);
      for (let i = 0; i < emails.length || i === 0; i += 2000) {
        const r = await previewSysteme({ emails: emails.slice(i, i + 2000), tags: i === 0 ? tagKey.split("\n").filter(Boolean).slice(0, 500) : [] });
        if (!live) return;
        if (!r.ok) { setError(r.error); return; }
        r.data.existing.forEach((e) => existing.add(e));
        if (i === 0) tags = r.data.existingTags;
      }
      if (live) setLookup({ rows, existing, tags });
    })();
    return () => { live = false; };
  }, [rows, tagKey]);

  const run = async () => {
    const total = rows.length;
    const acc = { created: 0, updated: 0, invalid: 0, unsubscribed: 0, consented: 0, consentSkipped: 0, alreadyConsented: 0 };
    let done = 0;
    setError(null);
    setProgress({ done, total });
    for (const batch of chunks(rows, 100)) {
      const r = await importSystemeBatch({ rows: batch, proof: withConsent ? proof : "" });
      if (!r.ok) { setError(r.error); setProgress(null); router.refresh(); return; }
      for (const k of Object.keys(acc) as (keyof typeof acc)[]) acc[k] += r.data[k];
      done += batch.length;
      setProgress({ done, total });
    }
    setProgress(null);
    const parts = [fill(m.impDone, { created: acc.created, updated: acc.updated })];
    if (acc.unsubscribed) parts.push(fill(m.impDoneUnsub, { n: acc.unsubscribed }));
    if (acc.consented) parts.push(fill(m.impDoneConsent, { n: acc.consented }));
    if (acc.alreadyConsented) parts.push(fill(m.impDoneAlready, { n: acc.alreadyConsented }));
    if (acc.consentSkipped) parts.push(fill(m.impDoneSkipped, { n: acc.consentSkipped }));
    if (acc.invalid) parts.push(fill(m.impDoneInvalid, { n: acc.invalid }));
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
      {table ? (
        <label className="small" style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 44 }}>
          <input type="checkbox" checked={allUnsub} onChange={(e) => setAllUnsub(e.target.checked)} />
          {m.impAllUnsub}
        </label>
      ) : null}
      {table && cols.email === undefined ? <p role="alert" className={css.err}>{m.impErrors.no_email}</p> : null}
      {mapped ? (
        <>
          <p className="small" style={{ margin: 0 }} role="status">
            <strong>{fill(m.impSummary, { n: sum.total.toLocaleString("en-AU") })}</strong>
            <br />{sum.created === null ? m.impChecking : fill(m.impCounts, { created: sum.created.toLocaleString("en-AU"), updated: (sum.updated ?? 0).toLocaleString("en-AU") })}
            {mapped.invalid ? <><br />{fill(m.impInvalid, { n: mapped.invalid })}</> : null}
            {mapped.duplicates ? <><br />{fill(m.impDup, { n: mapped.duplicates })}</> : null}
            {sum.unsubscribed ? <><br />{fill(m.impUnsub, { n: sum.unsubscribed })}</> : null}
            <br />{fill(m.impNewsletter, { n: sum.newsletter.toLocaleString("en-AU") })}
            {sum.newTags === null ? null : <><br />{sum.newTags.length ? fill(m.impNewTags, { list: sum.newTags.join(", ") }) : m.impNoNewTags}</>}
            {mapped.renamedTags.length ? <><br />{fill(m.impRenamed, { list: mapped.renamedTags.map((t) => `${t.from} → ${t.to ?? m.impDropped}`).join(" · ") })}</> : null}
            {mapped.invalidPhones ? <><br />{fill(m.impBadPhones, { n: mapped.invalidPhones })} {mapped.invalidPhoneSamples.map((x) => `${x.email}: ${x.raw}`).join(" · ")}{mapped.invalidPhones > mapped.invalidPhoneSamples.length ? " …" : ""}</> : null}
            {mapped.invalidPartnerPhones ? <><br />{fill(m.impBadPartnerPhones, { n: mapped.invalidPartnerPhones })}</> : null}
          </p>
          {rows.length ? (
            <div className="field">
              <span className="label">{m.impPreview}</span>
              <div className="table-scroll">
                <table className={c.previewTable}>
                  <thead><tr><th>{m.cols.email}</th><th>{m.cols.firstName}</th><th>{m.cols.phone}</th><th>{m.cols.country}</th><th>{m.cols.tags}</th><th>{m.colPartner}</th><th>{m.colNewsletter}</th><th>{m.cols.unsubscribed}</th><th>{m.cols.createdAt}</th></tr></thead>
                  <tbody>{rows.slice(0, 5).map((r) => (
                    <tr key={r.email}>
                      <td>{r.email}</td><td>{r.name}</td><td>{r.phone}</td><td>{r.country}</td><td>{r.tags.join(", ")}</td>
                      <td>{[r.fields.partners_name, r.fields.partners_phone, r.fields.partners_email].filter(Boolean).join(" · ")}</td>
                      <td>{yesNo(!r.unsubscribed && hasNewsletter(r.tags))}</td><td>{yesNo(r.unsubscribed)}</td><td>{r.createdAt ? r.createdAt.slice(0, 10) : ""}</td>
                    </tr>
                  ))}</tbody>
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
          <p className={c.hint}>{m.impPartnerNote}</p>
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
