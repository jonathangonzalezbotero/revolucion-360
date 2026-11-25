"use client";
import { useState } from "react";
import { fill } from "@/i18n";
import type { Block } from "@/lib/crm/schema";
import { Icon } from "@/components/ui/Icon";
import c from "../crm/crm.module.css";
import { blockSummary, IMAGE_SUGGESTIONS, imageUrl, move, newBlock, type NewBlockKind } from "../crm/lib";
import type { BlocksText } from "./messages";

/** Clase de la Academia que se puede poner en un correo (curso publicado). */
export type LessonOption = { href: string; title: string; course: string };

/**
 * Bloques de contenido de un correo ("Contenido" del mockup): cada bloque se ve como su resumen; al tocarlo se edita.
 * Lo usan Campañas y los pasos de correo de Automatizaciones.
 */
export function BlocksEditor({ id, blocks, onChange, m, lessons, appUrl, disabled, only }: {
  id: string; blocks: Block[]; onChange: (b: Block[]) => void; m: BlocksText; lessons: LessonOption[]; appUrl: string; disabled?: boolean;
  /** Solo estos tipos de bloque se pueden agregar (correo transaccional: sin imágenes ni clases). */
  only?: readonly Block["type"][];
}) {
  const [open, setOpen] = useState<number | null>(null);
  const set = (i: number, b: Block) => onChange(blocks.map((x, j) => (j === i ? b : x)));
  const add = (kind: NewBlockKind) => {
    const next = [...blocks, newBlock(kind, { image: kind === "image" ? "" : undefined, lesson: kind === "lesson" ? lessons[0] : undefined })];
    onChange(next);
    setOpen(kind === "divider" ? null : next.length - 1);
  };
  const ADD = ([["text", m.addText], ["image", m.addImage], ["button", m.addButton], ["lesson", m.addLesson], ["divider", m.addDivider]] as [NewBlockKind, string][])
    .filter(([k]) => !only || only.includes(k));
  const name = (b: Block) => m[b.type];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className={c.blockList}>
        {blocks.length === 0 ? <span className="muted">{m.noBlocks}</span> : blocks.map((b, i) => (
          <div key={i} className={c.blockItem}>
            <div className={c.blockHead}>
              <button type="button" className={c.blockSum} aria-expanded={open === i} aria-label={fill(m.edit, { name: name(b) })} disabled={disabled} onClick={() => setOpen(open === i ? null : i)}>
                {blockSummary(b, m)}
              </button>
              {disabled ? null : (
                <>
                  <button type="button" className={c.iconBtn} aria-label={fill(m.up, { name: name(b) })} disabled={i === 0} onClick={() => { onChange(move(blocks, i, -1)); setOpen(null); }}>↑</button>
                  <button type="button" className={c.iconBtn} aria-label={fill(m.down, { name: name(b) })} disabled={i === blocks.length - 1} onClick={() => { onChange(move(blocks, i, 1)); setOpen(null); }}>↓</button>
                  <button type="button" className={c.iconBtn} aria-label={fill(m.remove, { name: name(b) })} onClick={() => { onChange(blocks.filter((_, j) => j !== i)); setOpen(null); }}><Icon name="x" size={16} /></button>
                </>
              )}
            </div>
            {open === i && !disabled ? (
              <div className={c.blockBody}>
                <BlockFields id={`${id}-${i}`} b={b} set={(x) => set(i, x)} m={m} lessons={lessons} appUrl={appUrl} />
                <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(null)}>{m.done}</button></div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {disabled ? null : (
        <div className={c.actions} style={{ gap: 6 }}>
          {ADD.map(([k, label]) => <button key={k} type="button" className={c.dashed} disabled={k === "lesson" && !lessons.length} title={k === "lesson" && !lessons.length ? m.noLessons : undefined} onClick={() => add(k)}>{label}</button>)}
        </div>
      )}
    </div>
  );
}

function BlockFields({ id, b, set, m, lessons, appUrl }: { id: string; b: Block; set: (b: Block) => void; m: BlocksText; lessons: LessonOption[]; appUrl: string }) {
  const input = (key: string, label: string, value: string, onValue: (v: string) => void, opts: { max?: number; help?: string; ph?: string } = {}) => (
    <div className="field">
      <label htmlFor={`${id}-${key}`}>{label}</label>
      <input id={`${id}-${key}`} className="input" value={value} maxLength={opts.max ?? 200} placeholder={opts.ph} aria-describedby={opts.help ? `${id}-${key}-h` : undefined} onChange={(e) => onValue(e.target.value)} />
      {opts.help ? <span id={`${id}-${key}-h`} className="xs muted">{opts.help}</span> : null}
    </div>
  );
  switch (b.type) {
    case "heading": return input("h", m.fHeading, b.text, (text) => set({ ...b, text }));
    case "signature": return input("s", m.fSignature, b.text, (text) => set({ ...b, text }), { max: 120 });
    case "text":
      return (
        <div className="field">
          <label htmlFor={`${id}-t`}>{m.fText}</label>
          <textarea id={`${id}-t`} className={c.textarea} rows={6} maxLength={5000} value={b.text} aria-describedby={`${id}-t-h`} onChange={(e) => set({ ...b, text: e.target.value })} />
          <span id={`${id}-t-h`} className="xs muted">{m.fTextHelp}</span>
        </div>
      );
    case "button":
      return (
        <>
          {input("bt", m.fButtonText, b.text, (text) => set({ ...b, text }), { max: 80 })}
          {input("bh", m.fHref, b.href, (href) => set({ ...b, href }), { max: 500, help: m.fHrefHelp, ph: "/plan" })}
        </>
      );
    case "image":
      return (
        <>
          {input("is", m.fImage, b.src, (src) => set({ ...b, src: src.trim() }), { max: 500, ph: "https://" })}
          <div className="field">
            <label htmlFor={`${id}-ip`}>{m.fImagePick}</label>
            <select id={`${id}-ip`} className="input" value="" onChange={(e) => { if (e.target.value) set({ ...b, src: imageUrl(e.target.value, appUrl) }); }}>
              <option value="">{m.fImageNone}</option>
              {IMAGE_SUGGESTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          {input("ia", m.fAlt, b.alt, (alt) => set({ ...b, alt }))}
          {input("il", m.fImageLink, b.href ?? "", (href) => set({ ...b, href: href.trim() || undefined }), { max: 500, help: m.fHrefHelp })}
        </>
      );
    case "lesson":
      return lessons.length === 0 ? <p className={c.hint}>{m.noLessons}</p> : (
        <div className="field">
          <label htmlFor={`${id}-l`}>{m.fLesson}</label>
          <select id={`${id}-l`} className="input" value={lessons.some((l) => l.href === b.href) ? b.href : ""} onChange={(e) => {
            const l = lessons.find((x) => x.href === e.target.value);
            if (l) set({ type: "lesson", title: l.title, href: l.href, course: l.course });
          }}>
            <option value="" disabled>{m.fLessonPick}</option>
            {lessons.map((l) => <option key={l.href} value={l.href}>{l.course} · {l.title}</option>)}
          </select>
        </div>
      );
    case "divider": return null;
  }
}
