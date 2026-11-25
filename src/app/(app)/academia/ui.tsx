// Piezas de la Academia sin estado (sirven en las tres páginas).
import Link from "next/link";
import { fill } from "@/i18n";
import { Icon } from "@/components/ui/Icon";
import { durationLabel } from "./lib";
import type { AcadMessages } from "./messages";
import type { CourseView, Lesson } from "./server";
import css from "./academia.module.css";
import { coverSrc } from "@/lib/images";

/** Portada: la URL la escribe Admin (local en /cursos o externa), por eso es <img> y no next/image. Las de fábrica (.jpg) se pintan en .webp. */
export function Cover({ src, dim }: { src: string; dim?: boolean }) {
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element -- la portada puede venir de una URL externa escrita en Admin
  return <img src={coverSrc(src)} alt="" loading="lazy" decoding="async" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: dim ? 0.55 : 1 }} />;
}

const coverPill: React.CSSProperties = { position: "absolute", top: 12, left: 12, fontSize: 12, fontWeight: 600, padding: "5px 10px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 5 };

/** `release`: texto "Se libera el …" de un curso programado a futuro (no se abre). */
export function CourseCard({ cv, m, featured, showMeta = true, release }: { cv: CourseView; m: AcadMessages; featured?: boolean; showMeta?: boolean; release?: string }) {
  const { course, lessons, progress, nextId } = cv;
  const soon = lessons.length === 0;
  const started = progress.done > 0 && !progress.complete;
  const dur = durationLabel(lessons.reduce((a, l) => a + l.durationSec, 0), m.dur);
  const count = lessons.length === 1 ? m.lessonsOne : fill(m.lessonsN, { n: lessons.length });
  const target = nextId ? `/academia/${course.slug}/${nextId}` : `/academia/${course.slug}`;
  const btn: React.CSSProperties = { textDecoration: "none", textAlign: "center", fontSize: 14, fontWeight: 600, padding: 13, borderRadius: 12, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 };

  const upcoming = course.upcoming;
  let action: React.ReactNode;
  if (upcoming) action = <span style={{ ...btn, background: "var(--ambar-fondo)", color: "var(--ambar-texto)" }}>{release}</span>;
  else if (soon) action = <span style={{ ...btn, background: "var(--ambar-fondo)", color: "var(--ambar-texto)" }}>{m.cardSoon}</span>;
  else if (progress.complete) action = <Link href={`/academia/${course.slug}`} style={{ ...btn, background: "var(--papel-3)", color: "var(--tinta)", border: "1px solid var(--linea)" }}>{m.review}</Link>;
  else if (started) action = <Link href={target} style={{ ...btn, background: "var(--tinta)", color: "var(--blanco)" }}>{m.continue}</Link>;
  else action = <Link href={target} style={{ ...btn, background: "var(--amarillo-suave)", color: "var(--tinta)" }}>{m.start}</Link>;

  return (
    <article className={css.card} style={{ border: featured ? "2px solid var(--amarillo-oscuro)" : "1px solid var(--linea)" }}>
      <div role="img" aria-label={fill(m.cover, { title: course.title })} style={{ position: "relative", aspectRatio: "16 / 9", background: "var(--bloque-oscuro)", overflow: "hidden" }}>
        <Cover src={course.coverUrl} />
        {upcoming ? <span style={{ ...coverPill, background: "var(--ambar-fondo)", color: "var(--ambar-texto)" }}>{m.comingSoon}</span>
          : soon ? <span style={{ ...coverPill, background: "var(--ambar-fondo)", color: "var(--ambar-texto)" }}>{m.soon}</span>
          : progress.complete ? <span style={{ ...coverPill, background: "var(--blanco)", color: "var(--tinta)" }}><Icon name="tick" size={12} /> {m.completed}</span>
          : started ? <span style={{ ...coverPill, background: "var(--blanco)", color: "var(--tinta)" }}>{fill(m.yourCourse, { pct: progress.pct })}</span> : null}
        <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 5, background: "var(--oscuro-linea)" }}><div style={{ height: 5, width: `${progress.pct}%`, background: "var(--amarillo)" }} /></div>
      </div>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        <strong style={{ fontSize: 15, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".01em", minHeight: 38 }}>{course.title}</strong>
        {showMeta ? <span style={{ fontSize: 12, color: "var(--gris)" }}>{upcoming ? m.comingSoon : soon ? m.soon : dur ? `${count} · ${dur}` : count}</span> : null}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--gris-2)" }}><span>{m.progress}</span><span className="num">{progress.pct}%</span></div>
        <div role="progressbar" aria-label={m.progress} aria-valuenow={progress.pct} aria-valuemin={0} aria-valuemax={100} style={{ height: 6, borderRadius: 3, background: "var(--linea-2)" }}><div style={{ height: 6, borderRadius: 3, background: "var(--tinta)", width: `${progress.pct}%` }} /></div>
        <div style={{ marginTop: "auto" }}>{action}</div>
      </div>
    </article>
  );
}

/** Temario del curso: módulos y clases con su estado. `current` resalta la clase abierta. `collapse`: solo queda abierto el módulo de la clase abierta. */
export function LessonList({ cv, m, current, gamification, collapse }: { cv: CourseView; m: AcadMessages; current?: string; gamification: boolean; collapse?: boolean }) {
  const groups: { title: string | null; index: number | null; lessons: Lesson[] }[] = cv.modules.map((mod, i) => ({ title: mod.title, index: i + 1, lessons: cv.lessons.filter((l) => l.moduleId === mod.id) }));
  const loose = cv.lessons.filter((l) => !l.moduleId || !cv.modules.some((mod) => mod.id === l.moduleId));
  if (loose.length) groups.push({ title: null, index: null, lessons: loose });
  const firstLockerBefore = (id: string): Lesson | null => {
    const idx = cv.lessons.findIndex((l) => l.id === id);
    return cv.lessons.slice(0, idx).find((l) => l.required && cv.states.get(l.id) !== "done") ?? null;
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {groups.filter((g) => g.lessons.length).map((g) => {
        const doneN = g.lessons.filter((l) => cv.states.get(l.id) === "done").length;
        return (
          <details key={g.index ?? "loose"} className={css.module} open={!collapse || g.lessons.some((l) => l.id === current)} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <summary>
              <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase" }}>{g.index ? fill(m.moduleTitle, { n: g.index, title: g.title ?? "" }) : m.otherLessons}</span>
              <span className="num" style={{ fontSize: 12, color: "var(--gris)", flex: "none" }}>{doneN}/{g.lessons.length} <span aria-hidden="true" className={css.chev} style={{ display: "inline-block" }}>▾</span></span>
            </summary>
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              {g.lessons.map((l) => {
                const st = cv.states.get(l.id) ?? "open";
                const isCur = l.id === current;
                const dark = isCur;
                const dur = durationLabel(l.durationSec, m.dur);
                const locker = st === "locked" ? firstLockerBefore(l.id) : null;
                const icon = st === "done" ? "✓" : st === "locked" ? null : st === "next" ? "▸" : "·";
                const inner = (
                  <>
                    <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: "50%", flex: "none", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center",
                      background: st === "done" ? (dark ? "var(--amarillo)" : "var(--tinta)") : st === "next" || isCur ? "var(--amarillo)" : dark ? "var(--oscuro-3)" : "var(--linea-2)",
                      color: st === "done" ? (dark ? "var(--tinta)" : "var(--blanco)") : "var(--tinta)" }}>
                      {icon ?? <Icon name="lock" size={12} color={dark ? "var(--blanco)" : "var(--gris-4)"} />}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{l.title}</span>
                      <span style={{ fontSize: 12, opacity: 0.75 }}>
                        {m.st[st]}{locker ? ` · ${fill(m.lockedBy, { title: locker.title })}` : ""}{l.required && st !== "done" && !locker ? ` · ${m.required}` : ""}
                        {gamification && st !== "done" && l.points > 0 ? ` · ${fill(m.plusPoints, { n: l.points })}` : ""}
                      </span>
                    </span>
                    {dur ? <span className="num" style={{ fontSize: 12, opacity: 0.7, flex: "none" }}>{dur}</span> : null}
                  </>
                );
                const rowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: 12, minHeight: 44, textDecoration: "none",
                  background: dark ? "var(--tinta)" : "transparent", color: dark ? "var(--blanco)" : st === "locked" ? "var(--gris-4)" : "var(--tinta)" };
                return (
                  <li key={l.id}>
                    {st === "locked" ? <div style={rowStyle}>{inner}</div>
                      : <Link href={`/academia/${cv.course.slug}/${l.id}`} aria-current={isCur ? "page" : undefined} className={css.lessonRow} style={rowStyle}>{inner}</Link>}
                  </li>
                );
              })}
            </ol>
          </details>
        );
      })}
    </div>
  );
}
