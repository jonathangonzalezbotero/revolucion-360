"use client";
// Lo que se toca en una clase: completar, leer más y calificar.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fill } from "@/i18n";
import { ConfirmButton, useToast } from "@/components/ui/client";
import { addComment, completeLesson, deleteComment, rateLesson } from "../../actions";
import type { AcadMessages } from "../../messages";
import css from "../../academia.module.css";

type T = Pick<AcadMessages, "complete" | "completing" | "nextClass" | "backToCourse" | "about" | "more" | "less" | "noDescription" | "rateQ" | "rateGroup" | "rateStar" | "rateAfter" | "rated">;

/** "Completar y continuar": marca la clase como vista y, ya vista, lleva a la siguiente. */
export function CompleteButton({ lessonId, slug, done, canEdit, nextId, t }: { lessonId: string; slug: string; done: boolean; canEdit: boolean; nextId: string | null; t: T }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<{ done: boolean; nextId: string | null }>({ done, nextId });
  const [error, setError] = useState<string | null>(null);

  if (state.done || !canEdit) {
    const href = state.nextId ? `/academia/${slug}/${state.nextId}` : `/academia/${slug}`;
    return <Link href={href} className={css.mainBtn}>{state.nextId ? t.nextClass : t.backToCourse}</Link>;
  }
  return (
    <>
      <button type="button" className={css.mainBtn} disabled={pending} onClick={() => start(async () => {
        setError(null);
        const r = await completeLesson(lessonId);
        if (!r.ok) { setError(r.error); return; }
        setState({ done: true, nextId: r.data.nextId });
        toast(r.data.text, r.points);
        router.refresh();
      })}>{pending ? t.completing : t.complete}</button>
      {error ? <span role="alert" className="xs" style={{ color: "var(--rojo)", alignSelf: "center" }}>{error}</span> : null}
    </>
  );
}

/** Descripción con "Ver más" cuando es larga. */
export function About({ text, t }: { text: string; t: T }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 280;
  return (
    <section aria-labelledby="sobre" className={css.box}>
      <h2 id="sobre" style={{ fontSize: 16, fontWeight: 600 }}>{t.about}</h2>
      <p id="sobre-texto" style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--gris-2)", whiteSpace: "pre-line",
        ...(long && !open ? { display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" } : {}) }}>{text || t.noDescription}</p>
      {long ? <button type="button" aria-expanded={open} aria-controls="sobre-texto" onClick={() => setOpen(!open)} style={{ font: "inherit", alignSelf: "flex-start", fontSize: 14, fontWeight: 600, color: "var(--tinta)", background: "transparent", border: 0, padding: "6px 0", cursor: "pointer", minHeight: 44 }}>{open ? t.less : t.more}</button> : null}
    </section>
  );
}

/** Calificación 1 a 5. Solo se activa cuando la clase ya está vista. */
export function Rating({ lessonId, rating, enabled, t }: { lessonId: string; rating: number | null; enabled: boolean; t: T }) {
  const toast = useToast();
  const [value, setValue] = useState(rating ?? 0);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pick = (n: number) => start(async () => {
    const prev = value;
    setValue(n); setError(null);
    const r = await rateLesson({ lessonId, rating: n });
    if (!r.ok) { setValue(prev); setError(r.error); return; }
    toast(t.rated);
  });
  return (
    <section aria-label={t.rateGroup} className={css.box} style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", padding: 20 }}>
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{t.rateQ}</span>
        {!enabled ? <span className="xs muted">{t.rateAfter}</span> : null}
        {error ? <span role="alert" className="xs" style={{ color: "var(--rojo)" }}>{error}</span> : null}
      </span>
      <div role="radiogroup" aria-label={t.rateGroup} style={{ display: "flex", gap: 2 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={fill(t.rateStar, { n })} disabled={!enabled || pending}
            onClick={() => pick(n)} className={css.star} style={{ color: n <= value ? "var(--amarillo-oscuro)" : "var(--linea-campo)", opacity: enabled ? 1 : 0.6 }}>★</button>
        ))}
      </div>
    </section>
  );
}

export type CommentItem = { id: string; mine: boolean; author: string; body: string; when: string };
type CT = Pick<AcadMessages, "comments" | "commentLabel" | "commentPh" | "send" | "sending" | "noComments" | "deleteC" | "deleteConfirm" | "commentReadOnly" | "commentAdded" | "commentDeleted" | "you" | "charCount" | "commentEmpty">;

/** Comentarios de la clase: listar, comentar (si puede escribir) y borrar los propios con doble confirmación. */
export function Comments({ lessonId, items, canWrite, initial, t }: { lessonId: string; items: CommentItem[]; canWrite: boolean; initial: string; t: CT }) {
  const toast = useToast();
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const send = () => start(async () => {
    setError(null);
    if (!body.trim()) { setError(t.commentEmpty); return; }
    const r = await addComment({ lessonId, body });
    if (!r.ok) { setError(r.error); return; }
    setBody("");
    toast(t.commentAdded);
    router.refresh();
  });
  const avatar = (letter: string, mine: boolean) => (
    <span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: "50%", background: mine ? "var(--amarillo-pastel)" : "var(--linea-2)", color: "var(--tinta)", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{letter}</span>
  );
  return (
    <section aria-labelledby="com" className={css.box} style={{ gap: 12 }}>
      <h2 id="com" style={{ fontSize: 16, fontWeight: 600 }}>{t.comments}{items.length ? <span className="num" style={{ fontSize: 13, color: "var(--gris)", fontWeight: 600 }}> {items.length}</span> : null}</h2>
      {canWrite ? (
        <form onSubmit={(e) => { e.preventDefault(); send(); }} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          {avatar(initial, true)}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            <label htmlFor="cm" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{t.commentLabel}</label>
            <textarea id="cm" rows={3} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t.commentPh} aria-invalid={!!error} aria-describedby={error ? "cm-err" : "cm-n"}
              style={{ font: "inherit", fontSize: 14, width: "100%", padding: 12, border: "1.5px solid var(--linea-campo)", borderRadius: 12, resize: "vertical", boxSizing: "border-box" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {error ? <span id="cm-err" role="alert" className="xs" style={{ color: "var(--rojo)" }}>{error}</span> : <span id="cm-n" className="xs muted num">{fill(t.charCount, { n: body.length })}</span>}
              <button type="submit" className="btn btn-sm" disabled={pending || !body.trim()}>{pending ? t.sending : t.send}</button>
            </div>
          </div>
        </form>
      ) : <span className="small muted">{t.commentReadOnly}</span>}
      {items.length === 0 ? <span style={{ fontSize: 13, color: "var(--gris)" }}>{t.noComments}</span> : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
          {items.map((c) => (
            <li key={c.id} style={{ display: "flex", gap: 10, padding: "12px 0", borderTop: "1px solid var(--linea-2)" }}>
              {avatar((c.author || "?").charAt(0).toUpperCase(), c.mine)}
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 14 }}>{c.mine ? t.you : c.author || "—"}</strong>
                  <span className="xs muted">{c.when}</span>
                </span>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "var(--gris-2)", whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{c.body}</p>
              </div>
              {c.mine && canWrite ? (
                <div style={{ flex: "none" }}>
                  <ConfirmButton className="btn btn-ghost btn-sm" label={t.deleteC} confirmLabel={t.deleteConfirm} onConfirm={async () => {
                    const r = await deleteComment(c.id);
                    if (!r.ok) { toast(r.error); return; }
                    toast(t.commentDeleted);
                    router.refresh();
                  }} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
