"use client";
import { useEffect, useRef, useState } from "react";
import { fill } from "@/i18n";
import { BlockSchema, type Block } from "@/lib/crm/schema";
import c from "../crm/crm.module.css";
import { previewContent } from "./actions";
import type { CampanasText } from "./messages";

export type Preview = { from: string; subject: string; preheader: string; html: string; legalReady: boolean };

/**
 * Pide la vista previa al servidor (`previewEmail` del motor: el mismo correo que sale, con el pie legal real) un momento
 * después de que se deja de escribir. Ignora respuestas viejas.
 */
export function usePreview(content: { subject: string; preheader: string; blocks: Block[] }, enabled = true) {
  const [state, setState] = useState<{ data: Preview | null; loading: boolean }>({ data: null, loading: enabled });
  const seq = useRef(0);
  // Solo los bloques completos (uno a medio escribir no tumba la vista previa).
  const key = JSON.stringify({ ...content, blocks: content.blocks.filter((b) => BlockSchema.safeParse(b).success) });
  useEffect(() => {
    if (!enabled) return;
    const n = ++seq.current;
    const t = setTimeout(async () => {
      setState((p) => ({ ...p, loading: true }));
      const r = await previewContent(JSON.parse(key));
      if (n !== seq.current) return;
      setState((p) => ({ data: r.ok ? r.data : p.data, loading: false }));
    }, 500);
    return () => clearTimeout(t);
  }, [key, enabled]);
  return state;
}

/** "Vista previa": Computador / Celular y el correo en un iframe aislado (sin scripts ni acceso a la página). */
export function EmailPreview({ m, data, loading, empty, headless }: { m: CampanasText; data: Preview | null; loading: boolean; empty?: boolean; headless?: boolean }) {
  const [dev, setDev] = useState<"desk" | "mob">("desk");
  const devices = (
    <div role="radiogroup" aria-label={m.device} className={c.devices}>
      {(["desk", "mob"] as const).map((d) => (
        <button key={d} type="button" role="radio" aria-checked={dev === d} onClick={() => setDev(d)}>{d === "desk" ? m.desktop : m.mobile}</button>
      ))}
    </div>
  );
  const card = (
    <div className={c.mailCard} style={{ width: dev === "desk" ? 560 : 340 }}>
      {data ? (
        <>
          <div className={c.mailHead}>{fill(m.from, { from: data.from })}<br /><strong>{data.subject || m.noSubject}</strong>{data.preheader ? <><br />{data.preheader}</> : null}</div>
          {empty ? <p className={c.previewNote}>{m.previewEmpty}</p> : <iframe title={m.previewFrame} className={c.frame} sandbox="" srcDoc={data.html} />}
        </>
      ) : <p className={c.previewNote} role="status">{loading ? m.previewLoading : m.previewEmpty}</p>}
    </div>
  );
  if (headless) return <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>{devices}{card}</div>;
  return (
    <section aria-labelledby="pvh" className={c.previewBox} aria-busy={loading}>
      <div className={c.previewHead}><h2 id="pvh">{m.previewTitle}</h2>{devices}</div>
      {card}
    </section>
  );
}
