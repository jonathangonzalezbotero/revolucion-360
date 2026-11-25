"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fill } from "@/i18n";
import { Empty, Pill, type PillTone } from "@/components/ui/basics";
import { ConfirmButton, Modal, Switch, useToast } from "@/components/ui/client";
import { Icon } from "@/components/ui/Icon";
import shared from "../_shared/admin.module.css";
import type { AdminText } from "../_shared/messages";
import { AdminHeader } from "../_shared/ui";
import {
  createLesson, createModule, renameModule, reorderLessons, reorderModules, saveCourse, saveLesson, savePoints, scheduleCourse, setCommentHidden, setCourseStatus,
} from "./actions";
import { CTA_SCREENS, moveItem, PRIORITIES, type CourseState } from "./lib";
import type { AcadAdminText } from "./messages";
import css from "./academia.module.css";

export type CourseItem = { id: string; label: string; title: string; cover: string; state: CourseState; stateLabel: string; count: string; selected: boolean };
export type CourseFull = {
  id: string; slug: string; label: string; title: string; stage: string; number: number; description: string; cover: string; groupId: string | null; priority: string | null;
  state: CourseState; scheduledText: string | null; scheduleDate: string; scheduleTime: string;
};
export type LessonRowView = { id: string; n: number; title: string; duration: string };
export type ModuleGroup = { id: string | null; title: string; n: number; lessons: LessonRowView[] };
export type LessonFull = { id: string; n: number; moduleId: string | null; title: string; duration: string; video: string; cta: string; points: number; description: string; required: boolean };
/** Grupo de alumnos que puede ver un curso ("Visible para"). */
export type Audience = { id: string; name: string };
export type CommentRow = { id: string; author: string; body: string; hidden: boolean; date: string };
type Points = { lesson: number; course: number; closure: number; week_active: number };
type R = { ok: true; data?: unknown } | { ok: false; error: string };

const TONE: Record<CourseState, PillTone> = { published: "ok", scheduled: "warn", draft: "neutral" };
const BASE = "/admin/academia";
const href = (curso: string, clase?: string) => `${BASE}?curso=${curso}${clase ? `&clase=${clase}` : ""}`;

export function AcademiaAdminView({ t, m, tz, items, course, groups, lesson, comments, stages, covers, nextNumber, points, levels, audiences }: {
  t: AdminText; m: AcadAdminText; tz: string; items: CourseItem[]; course: CourseFull | null; groups: ModuleGroup[]; lesson: LessonFull | null; comments: CommentRow[];
  stages: string[]; covers: string[]; nextNumber: number; points: Points; levels: string; audiences: Audience[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [courseForm, setCourseForm] = useState<"new" | "edit" | null>(null);
  const [schedOpen, setSchedOpen] = useState(false);
  const [modForm, setModForm] = useState<{ id: string | null; title: string; old: string } | null>(null);
  const [lessonForm, setLessonForm] = useState<{ moduleId: string | null; title: string } | null>(null);
  const [err, setErr] = useState<{ src: string; msg: string } | null>(null);
  const errorOf = (src: string) => (err?.src === src ? err.msg : null);

  /** Corre una acción: aviso al terminar, refresca la página y, si se pide, navega al resultado. */
  const act = (src: string, fn: () => Promise<R>, okText: string, after?: (r: R) => void) => new Promise<void>((resolve) => start(async () => {
    setErr(null);
    const r = await fn();
    if (!r.ok) { setErr({ src, msg: r.error }); toast(r.error); return resolve(); }
    toast(okText); after?.(r); router.refresh(); resolve();
  }));
  const openLesson = (v: { moduleId: string | null; title: string }) => { setErr(null); setLessonForm(v); };
  const openMod = (v: { id: string | null; title: string; old: string }) => { setErr(null); setModForm(v); };
  const newId = (r: R) => (r.ok && typeof r.data === "string" ? r.data : null);

  const realModules = groups.filter((g) => g.id !== null);

  return (
    <>
      <AdminHeader eyebrow={m.eyebrow} title={m.title}>
        <button type="button" className="btn" onClick={() => { setErr(null); setCourseForm("new"); }}>{m.newCourse}</button>
      </AdminHeader>

      {items.length === 0 ? (
        <Empty icon="cap" title={m.empty} text={m.emptySub}><button type="button" className="btn btn-secondary btn-sm" onClick={() => setCourseForm("new")}>{m.createCourse}</button></Empty>
      ) : (
        <div className={css.layout}>
          <nav aria-label={m.courses} className={css.courses}>
            {items.map((c) => (
              <Link key={c.id} href={href(c.id)} className={css.course} aria-current={c.selected ? "page" : undefined} scroll={false}>
                {/* eslint-disable-next-line @next/next/no-img-element -- la portada es una URL escrita en Admin (local o externa) */}
                {c.cover ? <img src={c.cover} alt="" loading="lazy" className={css.cover} /> : <span aria-hidden="true" className={css.cover} />}
                <span className={css.eyebrow}>{c.label}</span>
                <strong style={{ fontSize: 15 }}>{c.title}</strong>
                <span className="row" style={{ gap: 8, alignItems: "center" }}><Pill tone={TONE[c.state]}>{c.stateLabel}</Pill><span style={{ fontSize: 12, color: "var(--gris)" }}>{c.count}</span></span>
              </Link>
            ))}
          </nav>

          <PointsBox m={m} points={points} levels={levels} busy={busy} onSave={(p) => act("pts", () => savePoints(p), m.ptsSaved)} />

          {course ? (
            <section aria-labelledby="ed" className={css.editor}>
              <div className={css.head}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <span className={css.eyebrow} style={{ fontSize: 12 }}>{course.label}</span>
                  <h2 id="ed">{course.title}</h2>
                  {course.scheduledText ? <span className="small" style={{ color: "var(--ambar-texto)", fontWeight: 600 }}>{course.scheduledText}</span> : null}
                  {course.groupId ? <span><Pill tone="neutral">{fill(m.onlyGroup, { name: audiences.find((a) => a.id === course.groupId)?.name ?? t.none })}</Pill></span> : null}
                </div>
                <div className="row wrap" style={{ gap: 8 }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setErr(null); setCourseForm("edit"); }}>{m.editCourse}</button>
                  {course.state !== "published" ? (
                    <>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setErr(null); setSchedOpen(true); }}>{course.state === "scheduled" ? m.reschedule : m.schedule}</button>
                      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => act("status", () => setCourseStatus({ id: course.id, status: "published" }), m.published)}>{course.state === "scheduled" ? m.publishNow : m.publish}</button>
                    </>
                  ) : null}
                  {course.state !== "draft" ? (
                    <ConfirmButton className="btn btn-secondary btn-sm" label={m.toDraft} confirmLabel={m.toDraftConfirm} onConfirm={() => act("status", () => setCourseStatus({ id: course.id, status: "draft" }), m.drafted)} />
                  ) : null}
                </div>
              </div>
              {course.state !== "draft" ? <span className="xs muted">{m.toDraftHelp} {course.state === "published" ? <Link href={`/academia/${course.slug}`}>{m.openInApp}</Link> : null}</span> : null}

              {groups.length === 0 ? (
                <Empty icon="play" title={m.noLessons} text={m.noLessonsSub}>
                  <span className="row wrap" style={{ gap: 8, justifyContent: "center" }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => openLesson({ moduleId: null, title: "" })}>{m.addLesson}</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openMod({ id: null, title: "", old: "" })}>{m.addModule}</button>
                  </span>
                </Empty>
              ) : (
                <>
                  {groups.map((g, gi) => (
                    <div key={g.id ?? "none"} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div className={css.modHead}>
                        <span className={css.modLabel} style={{ flex: 1, minWidth: 0 }}>{g.id ? fill(m.module, { n: g.n, title: g.title }) : m.noModule}</span>
                        {g.id ? (
                          <>
                            <button type="button" className={css.iconBtn} aria-label={fill(m.renameModuleOf, { title: g.title })} onClick={() => openMod({ id: g.id, title: g.title, old: g.title })}><Icon name="edit" size={15} /></button>
                            <button type="button" className={css.iconBtn} disabled={busy || gi === 0} aria-label={fill(m.moveUp, { title: g.title })}
                              onClick={() => act("order", () => reorderModules({ courseId: course.id, ids: moveItem(realModules.map((x) => x.id as string), gi, -1) }), m.moved)}><Icon name="chevron" size={15} style={{ transform: "rotate(-90deg)" }} /></button>
                            <button type="button" className={css.iconBtn} disabled={busy || gi === realModules.length - 1} aria-label={fill(m.moveDown, { title: g.title })}
                              onClick={() => act("order", () => reorderModules({ courseId: course.id, ids: moveItem(realModules.map((x) => x.id as string), gi, 1) }), m.moved)}><Icon name="chevron" size={15} style={{ transform: "rotate(90deg)" }} /></button>
                          </>
                        ) : null}
                      </div>
                      {g.lessons.length ? (
                        <ol className={css.lessons}>
                          {g.lessons.map((l, li) => {
                            const ids = g.lessons.map((x) => x.id);
                            return (
                              <li key={l.id} className={css.lesson} data-on={lesson?.id === l.id}>
                                <Link href={href(course.id, l.id)} className={css.lessonLink} aria-current={lesson?.id === l.id ? "true" : undefined} scroll={false}>
                                  <span className={`num ${css.lessonNo}`}>{l.n}</span>
                                  <span className={css.lessonTitle}>{l.title}</span>
                                  {l.duration ? <span className={`num ${css.lessonDur}`}>{l.duration}</span> : null}
                                </Link>
                                <button type="button" className={css.iconBtn} disabled={busy || li === 0} aria-label={fill(m.moveUp, { title: l.title })}
                                  onClick={() => act("order", () => reorderLessons({ courseId: course.id, moduleId: g.id, ids: moveItem(ids, li, -1) }), m.moved)}><Icon name="chevron" size={15} style={{ transform: "rotate(-90deg)" }} /></button>
                                <button type="button" className={css.iconBtn} disabled={busy || li === ids.length - 1} aria-label={fill(m.moveDown, { title: l.title })}
                                  onClick={() => act("order", () => reorderLessons({ courseId: course.id, moduleId: g.id, ids: moveItem(ids, li, 1) }), m.moved)}><Icon name="chevron" size={15} style={{ transform: "rotate(90deg)" }} /></button>
                              </li>
                            );
                          })}
                        </ol>
                      ) : null}
                      <button type="button" className={css.dashed} onClick={() => openLesson({ moduleId: g.id, title: "" })}>{m.addLesson}</button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => openMod({ id: null, title: "", old: "" })}>{m.addModule}</button>
                </>
              )}

              {lesson ? (
                <LessonEditor key={lesson.id} m={m} t={t} lesson={lesson} modules={realModules} busy={busy} error={errorOf("lesson")}
                  onSave={(v) => act("lesson", () => saveLesson(v), m.lessonSaved)} />
              ) : null}

              {lesson ? (
                <section aria-labelledby="cm" style={{ display: "flex", flexDirection: "column" }}>
                  <h3 id="cm" style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600 }}>{m.comments}</h3>
                  {comments.length === 0 ? <span className="small muted" style={{ padding: "8px 0" }}>{m.commentsEmpty}</span> : comments.map((c) => (
                    <div key={c.id} className={css.comment}>
                      <div className="row-between" style={{ gap: 10, flexWrap: "wrap" }}>
                        <span className="row" style={{ gap: 8, alignItems: "center", minWidth: 0 }}>
                          <strong style={{ fontSize: 13 }}>{c.author}</strong>
                          <span className="xs muted">{c.date}</span>
                          <Pill tone={c.hidden ? "warn" : "neutral"}>{c.hidden ? m.hidden : m.visible}</Pill>
                        </span>
                        <button type="button" className="pill-tap pill" disabled={busy} aria-label={fill(c.hidden ? m.showOf : m.hideOf, { name: c.author })} style={{ minHeight: 44 }}
                          onClick={() => act("comment", () => setCommentHidden({ id: c.id, hidden: !c.hidden }), c.hidden ? m.commentShown : m.commentHidden)}>{c.hidden ? m.show : m.hide}</button>
                      </div>
                      <p className={css.commentBody} data-hidden={c.hidden}>{c.body}</p>
                    </div>
                  ))}
                </section>
              ) : null}
            </section>
          ) : null}
        </div>
      )}

      {/* Curso: crear o editar */}
      <Modal open={courseForm !== null} onClose={() => setCourseForm(null)} title={courseForm === "edit" ? m.editCourse : m.newCourseTitle} labelClose={t.close}>
        {courseForm ? (
          <CourseForm key={courseForm === "edit" ? course?.id : "new"} m={m} t={t} course={courseForm === "edit" ? course : null} stages={stages} covers={covers} nextNumber={nextNumber} audiences={audiences}
            busy={busy} error={errorOf("course")} onCancel={() => setCourseForm(null)}
            onSave={(v) => act("course", () => saveCourse(v), v.id ? m.courseSaved : m.courseCreated, (r) => { setCourseForm(null); const id = newId(r); if (!v.id && id) router.push(href(id), { scroll: false }); })} />
        ) : null}
      </Modal>

      {/* Programar publicación */}
      <Modal open={schedOpen && !!course} onClose={() => setSchedOpen(false)} title={m.scheduleTitle} labelClose={t.close}>
        {schedOpen && course ? <ScheduleForm key={course.id} m={m} t={t} tz={tz} course={course} busy={busy} error={errorOf("schedule")} onCancel={() => setSchedOpen(false)}
          onSave={(v) => act("schedule", () => scheduleCourse({ id: course.id, ...v }), m.scheduled, () => setSchedOpen(false))} /> : null}
      </Modal>

      {/* Módulo: crear o renombrar */}
      <Modal open={modForm !== null} onClose={() => setModForm(null)} title={modForm?.id ? m.renameModule : m.newModule} labelClose={t.close}>
        {modForm && course ? (
          <>
            <div className="field"><label htmlFor="mod-t">{modForm.id ? fill(m.renameModuleOf, { title: modForm.old }) : m.moduleTitle}</label>
              <input id="mod-t" className="input" value={modForm.title} maxLength={80} placeholder={m.modulePh} onChange={(e) => setModForm({ ...modForm, title: e.target.value })} /></div>
            {errorOf("module") ? <p role="alert" className={shared.err}>{errorOf("module")}</p> : null}
            <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setModForm(null)}>{t.cancel}</button>
              <button type="button" className="btn" disabled={busy || !modForm.title.trim()} onClick={() => modForm.id
                ? act("module", () => renameModule({ id: modForm.id, title: modForm.title }), m.moduleRenamed, () => setModForm(null))
                : act("module", () => createModule({ courseId: course.id, title: modForm.title }), m.moduleCreated, () => setModForm(null))}>{modForm.id ? t.save : m.create}</button>
            </div>
          </>
        ) : null}
      </Modal>

      {/* Clase nueva */}
      <Modal open={lessonForm !== null} onClose={() => setLessonForm(null)} title={m.newLesson} labelClose={t.close}>
        {lessonForm && course ? (
          <>
            <div className="field"><label htmlFor="nl-t">{m.lessonTitle}</label>
              <input id="nl-t" className="input" value={lessonForm.title} maxLength={160} placeholder={m.lessonTitlePh} onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })} /></div>
            {realModules.length ? (
              <div className="field"><label htmlFor="nl-m">{m.inModule}</label>
                <select id="nl-m" className="select" value={lessonForm.moduleId ?? ""} onChange={(e) => setLessonForm({ ...lessonForm, moduleId: e.target.value || null })}>
                  {realModules.map((g) => <option key={g.id} value={g.id as string}>{fill(m.module, { n: g.n, title: g.title })}</option>)}
                  <option value="">{m.noModule}</option>
                </select></div>
            ) : null}
            {errorOf("newLesson") ? <p role="alert" className={shared.err}>{errorOf("newLesson")}</p> : null}
            <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setLessonForm(null)}>{t.cancel}</button>
              <button type="button" className="btn" disabled={busy || !lessonForm.title.trim()}
                onClick={() => act("newLesson", () => createLesson({ courseId: course.id, moduleId: lessonForm.moduleId, title: lessonForm.title }), m.lessonCreated, (r) => {
                  setLessonForm(null); const id = newId(r); if (id) router.push(href(course.id, id), { scroll: false });
                })}>{m.create}</button>
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}

// ───────── Puntos y niveles ─────────
function PointsBox({ m, points, levels, busy, onSave }: { m: AcadAdminText; points: Points; levels: string; busy: boolean; onSave: (p: Partial<Record<keyof Points, string>>) => void }) {
  const init = { lesson: String(points.lesson), course: String(points.course), closure: String(points.closure), week_active: String(points.week_active) };
  const [v, setV] = useState(init);
  const dirty = (Object.keys(init) as (keyof Points)[]).some((k) => v[k] !== init[k]);
  const rows: [keyof Points, string][] = [["lesson", m.ptsLesson], ["course", m.ptsCourse], ["closure", m.ptsClosure], ["week_active", m.ptsWeek]];
  return (
    <section aria-labelledby="pts" className={`${css.box} ${css.points}`}>
      <h2 id="pts">{m.ptsTitle}</h2>
      <div className={css.ptsGrid}>
        {rows.map(([k, label]) => (
          <span key={k} style={{ display: "contents" }}>
            <label htmlFor={`pp-${k}`}>{label}</label>
            <input id={`pp-${k}`} className="input num" inputMode="numeric" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
          </span>
        ))}
      </div>
      <span style={{ fontSize: 12, color: "var(--gris)" }}>{fill(m.levels, { list: levels })} <Link href="/admin/menu">{m.levelsEdit}</Link></span>
      <span className="xs muted">{m.ptsHelp}</span>
      {dirty ? <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start" }} disabled={busy || (Object.keys(v) as (keyof Points)[]).some((k) => !v[k])} onClick={() => onSave(Object.fromEntries((Object.keys(v) as (keyof Points)[]).filter((k) => v[k] !== init[k]).map((k) => [k, v[k]])))}>{m.savePts}</button> : null}
    </section>
  );
}

// ───────── Editar clase ─────────
type LessonValue = { id: string; moduleId: string | null; title: string; duration: string; video: string; cta: string; points: string; description: string; required: boolean };
function LessonEditor({ m, t, lesson, modules, busy, error, onSave }: {
  m: AcadAdminText; t: AdminText; lesson: LessonFull; modules: ModuleGroup[]; busy: boolean; error: string | null; onSave: (v: LessonValue) => void;
}) {
  const [v, setV] = useState<LessonValue>({ ...lesson, points: String(lesson.points) });
  const set = (p: Partial<LessonValue>) => setV({ ...v, ...p });
  const screens: string[] = [...CTA_SCREENS];
  if (lesson.cta && !screens.includes(lesson.cta)) screens.push(lesson.cta);
  return (
    <section aria-labelledby="le" className={css.lessonEdit}>
      <h3 id="le">{fill(m.editLesson, { n: lesson.n, title: lesson.title })}</h3>
      <div className={css.grid2}>
        <div className="field"><label htmlFor="l-t">{m.titleField}</label><input id="l-t" className="input" value={v.title} maxLength={160} onChange={(e) => set({ title: e.target.value })} /></div>
        <div className="field"><label htmlFor="l-d">{m.duration}</label><input id="l-d" className="input num" inputMode="numeric" value={v.duration} maxLength={8} placeholder={m.durationPh} onChange={(e) => set({ duration: e.target.value })} /></div>
        <div className="field"><label htmlFor="l-vid">{m.video}</label><input id="l-vid" className="input" type="url" value={v.video} maxLength={500} placeholder={m.videoPh} onChange={(e) => set({ video: e.target.value })} /></div>
        <div className="field"><label htmlFor="l-scr">{m.cta}</label>
          <select id="l-scr" className="select" value={v.cta} onChange={(e) => set({ cta: e.target.value })}>
            {screens.map((p) => <option key={p} value={p}>{m.screens[p] ?? p}</option>)}
            <option value="">{m.ctaNone}</option>
          </select></div>
        <div className="field"><label htmlFor="l-pts">{m.points}</label><input id="l-pts" className="input num" inputMode="numeric" value={v.points} onChange={(e) => set({ points: e.target.value.replace(/\D/g, "").slice(0, 4) })} /></div>
        {modules.length ? (
          <div className="field"><label htmlFor="l-mod">{m.inModule}</label>
            <select id="l-mod" className="select" value={v.moduleId ?? ""} onChange={(e) => set({ moduleId: e.target.value || null })}>
              {modules.map((g) => <option key={g.id} value={g.id as string}>{fill(m.module, { n: g.n, title: g.title })}</option>)}
              <option value="">{m.noModule}</option>
            </select></div>
        ) : null}
      </div>
      <span className="xs muted">{m.videoHelp}</span>
      <div className="field"><label htmlFor="l-desc">{m.about}</label><textarea id="l-desc" rows={3} className="textarea" value={v.description} maxLength={2000} onChange={(e) => set({ description: e.target.value })} /></div>
      <div className="row" style={{ gap: 12, alignItems: "center" }}>
        <Switch checked={v.required} onChange={(x) => set({ required: x })} label={m.requiredLabel} />
        <span style={{ fontSize: 14, fontWeight: 600 }}>{m.required}</span>
      </div>
      {error ? <p role="alert" className={shared.err}>{error}</p> : null}
      <div><button type="button" className="btn btn-secondary" disabled={busy || !v.title.trim() || !v.points} onClick={() => onSave(v)}>{busy ? t.saving : m.saveLesson}</button></div>
    </section>
  );
}

// ───────── Curso: crear o editar ─────────
type CourseValue = { id: string | null; title: string; stage: string; number: string; description: string; cover: string; groupId: string | null; priority: string | null };
function CourseForm({ m, t, course, stages, covers, nextNumber, audiences, busy, error, onCancel, onSave }: {
  m: AcadAdminText; t: AdminText; course: CourseFull | null; stages: string[]; covers: string[]; nextNumber: number; audiences: Audience[]; busy: boolean; error: string | null; onCancel: () => void; onSave: (v: CourseValue) => void;
}) {
  const [v, setV] = useState<CourseValue>(course
    ? { id: course.id, title: course.title, stage: course.stage, number: String(course.number), description: course.description, cover: course.cover, groupId: course.groupId, priority: course.priority }
    : { id: null, title: "", stage: stages[0] ?? "", number: String(nextNumber), description: "", cover: "", groupId: null, priority: null });
  // "Solo un grupo" se elige aunque el grupo aún no esté puesto: el servidor pide elegirlo.
  const [forGroup, setForGroup] = useState(!!v.groupId);
  const set = (p: Partial<CourseValue>) => setV({ ...v, ...p });
  // Un grupo guardado que ya no aparece se sigue mostrando como opción (no se cambia sin querer).
  const options = v.groupId && !audiences.some((a) => a.id === v.groupId) ? [...audiences, { id: v.groupId, name: t.none }] : audiences;
  return (
    <>
      <div className="field"><label htmlFor="c-t">{m.courseTitle}</label><input id="c-t" className="input" value={v.title} maxLength={120} placeholder={m.courseTitlePh} onChange={(e) => set({ title: e.target.value })} /></div>
      <div className={css.grid2}>
        <div className="field"><label htmlFor="c-s">{m.stage}</label>
          <select id="c-s" className="select" value={v.stage} onChange={(e) => set({ stage: e.target.value })}>{stages.map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
        <div className="field"><label htmlFor="c-n">{m.number}</label><input id="c-n" className="input num" inputMode="numeric" value={v.number} onChange={(e) => set({ number: e.target.value.replace(/\D/g, "").slice(0, 3) })} /></div>
        <div className="field"><label htmlFor="c-vis">{m.visibleFor}</label>
          <select id="c-vis" className="select" value={forGroup ? "group" : "all"} aria-describedby="c-vis-h"
            onChange={(e) => { const g = e.target.value === "group"; setForGroup(g); set({ groupId: g ? v.groupId ?? options[0]?.id ?? null : null }); }}>
            <option value="all">{m.visibleAll}</option><option value="group">{m.visibleGroup}</option>
          </select></div>
        <div className="field"><label htmlFor="c-p">{m.priority}</label>
          <select id="c-p" className="select" value={v.priority ?? ""} onChange={(e) => set({ priority: e.target.value || null })}>
            <option value="">{m.priorityNone}</option>
            {PRIORITIES.map((k) => <option key={k} value={k}>{m.indicators[k]}</option>)}
          </select></div>
      </div>
      {forGroup ? (
        options.length ? (
          <div className="field"><label htmlFor="c-grp">{m.pickGroup}</label>
            <select id="c-grp" className="select" value={v.groupId ?? ""} onChange={(e) => set({ groupId: e.target.value || null })}>
              {options.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></div>
        ) : <span className="small muted">{m.noGroups} <Link href="/admin/grupos">{m.createGroup}</Link></span>
      ) : null}
      <span id="c-vis-h" className="xs muted">{m.visibleHelp}</span>
      <span className="xs muted">{m.priorityHelp}</span>
      <div className="field"><label htmlFor="c-cov">{m.cover}</label>
        <input id="c-cov" className="input" list="c-cov-list" value={v.cover} maxLength={500} placeholder={m.coverPh} onChange={(e) => set({ cover: e.target.value })} />
        <datalist id="c-cov-list">{covers.map((x) => <option key={x} value={x} />)}</datalist>
        <span className="xs muted">{m.coverHelp}</span></div>
      {/* eslint-disable-next-line @next/next/no-img-element -- vista previa de la URL escrita */}
      {v.cover.trim() ? <img src={v.cover.trim()} alt="" className={css.cover} style={{ maxWidth: 280 }} /> : null}
      <div className="field"><label htmlFor="c-d">{m.description}</label><textarea id="c-d" rows={3} className="textarea" value={v.description} maxLength={1000} onChange={(e) => set({ description: e.target.value })} /></div>
      <span className="xs muted">{course ? fill(m.slug, { slug: course.slug }) : m.slugNew}</span>
      {error ? <p role="alert" className={shared.err}>{error}</p> : null}
      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>{t.cancel}</button>
        <button type="button" className="btn" disabled={busy || !v.title.trim() || !v.number || (forGroup && !v.groupId)} onClick={() => onSave(v)}>{course ? m.saveCourse : m.createCourse}</button>
      </div>
    </>
  );
}

// ───────── Programar publicación (en la hora del admin) ─────────
function ScheduleForm({ m, t, tz, course, busy, error, onCancel, onSave }: {
  m: AcadAdminText; t: AdminText; tz: string; course: CourseFull; busy: boolean; error: string | null; onCancel: () => void; onSave: (v: { date: string; time: string }) => void;
}) {
  const [date, setDate] = useState(course.scheduleDate);
  const [time, setTime] = useState(course.scheduleTime);
  return (
    <>
      <div className={css.grid2}>
        <div className="field"><label htmlFor="sc-d">{m.day}</label><input id="sc-d" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="field"><label htmlFor="sc-t">{m.time}</label><input id="sc-t" className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
      </div>
      <span className="xs muted">{fill(m.tzNote, { tz })}</span>
      {error ? <p role="alert" className={shared.err}>{error}</p> : null}
      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>{t.cancel}</button>
        <button type="button" className="btn" disabled={busy || !date || !time} onClick={() => onSave({ date, time })}>{m.scheduleBtn}</button>
      </div>
    </>
  );
}
