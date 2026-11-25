import "server-only";
import { cache } from "react";
import { fetchAll, must } from "@/server/data";
import type { Session } from "@/server/session";
import { courseProgress, isUpcoming, lessonStates, nextLessonId, orderLessons, type LessonState } from "./lib";

// Lectura de la Academia. La base solo devuelve cursos publicados (o programados ya vencidos) y sus clases,
// y un curso de un grupo solo a sus miembros (y al admin): la regla vive en la base (RLS), no aquí.

export type Course = { id: string; slug: string; stage: string; number: number; title: string; description: string; coverUrl: string; priority: string | null; sort: number; publishAt: string | null; upcoming: boolean };
export type Module = { id: string; courseId: string; title: string; sort: number };
export type Lesson = { id: string; courseId: string; moduleId: string | null; title: string; description: string; durationSec: number; points: number; ctaScreen: string | null; required: boolean; sort: number };
export type CourseView = {
  course: Course; modules: Module[]; lessons: Lesson[];          // clases en el orden del curso
  states: Map<string, LessonState>; nextId: string | null;
  progress: ReturnType<typeof courseProgress>;
};
export type Catalog = { courses: CourseView[]; done: Set<string>; ratings: Map<string, number | null>; nowMs: number };

type CourseRow = { id: string; slug: string; stage: string; number: number; title: string; description: string; cover_url: string; priority: string | null; sort: number; status: string; publish_at: string | null };
type LessonRow = { id: string; course_id: string; module_id: string | null; title: string; description: string; duration_sec: number; points: number; cta_screen: string | null; required: boolean; sort: number };
const toCourse = (c: CourseRow, nowMs: number): Course => ({ id: c.id, slug: c.slug, stage: c.stage, number: c.number, title: c.title, description: c.description, coverUrl: c.cover_url, priority: c.priority, sort: c.sort, publishAt: c.publish_at, upcoming: isUpcoming(c.status, c.publish_at, nowMs) });
const toLesson = (l: LessonRow): Lesson => ({ id: l.id, courseId: l.course_id, moduleId: l.module_id, title: l.title, description: l.description, durationSec: l.duration_sec, points: l.points, ctaScreen: l.cta_screen, required: l.required, sort: l.sort });

function view(course: Course, modules: Module[], lessons: Lesson[], done: Set<string>): CourseView {
  const mods = modules.filter((m) => m.courseId === course.id).sort((a, b) => a.sort - b.sort);
  const ordered = orderLessons(lessons.filter((l) => l.courseId === course.id), mods);
  return { course, modules: mods, lessons: ordered, states: lessonStates(ordered, done), nextId: nextLessonId(ordered, done), progress: courseProgress(ordered.map((l) => l.id), done) };
}

/** Todos los cursos visibles con sus clases y el avance del usuario. */
export const loadCatalog = cache(async (s: Session): Promise<Catalog> => {
  const [courses, modules, lessons, progress] = await Promise.all([
    s.supabase.from("courses").select("id, slug, stage, number, title, description, cover_url, priority, sort, status, publish_at").order("sort").order("number"),
    fetchAll<{ id: string; course_id: string; title: string; sort: number }>((a, b) => s.supabase.from("course_modules").select("id, course_id, title, sort").order("sort").order("id").range(a, b)),
    fetchAll<LessonRow>((a, b) => s.supabase.from("lessons").select("id, course_id, module_id, title, description, duration_sec, points, cta_screen, required, sort").order("sort").order("id").range(a, b)),
    fetchAll<{ lesson_id: string; rating: number | null }>((a, b) => s.supabase.from("lesson_progress").select("lesson_id, rating").eq("user_id", s.userId).order("lesson_id").range(a, b)),
  ]);
  const nowMs = Date.now();
  const done = new Set(progress.map((p) => p.lesson_id));
  const mods = modules.map((m) => ({ id: m.id, courseId: m.course_id, title: m.title, sort: m.sort }));
  const ls = lessons.map(toLesson);
  return {
    courses: must(courses).map((c) => view(toCourse(c, nowMs), mods, ls, done)),
    done, ratings: new Map(progress.map((p) => [p.lesson_id, p.rating])), nowMs,
  };
});

/** Un curso por su slug, o null si no existe o no está publicado. */
export async function loadCourse(s: Session, slug: string): Promise<CourseView | null> {
  const cat = await loadCatalog(s);
  return cat.courses.find((c) => c.course.slug === slug) ?? null;
}

/** Puntos totales del usuario (suma de point_events, sin el tope de 1,000 filas). */
export async function totalPoints(s: Session): Promise<number> {
  const rows = await fetchAll<{ points: number }>((a, b) => s.supabase.from("point_events").select("points").eq("user_id", s.userId).order("id").range(a, b));
  return rows.reduce((a, r) => a + r.points, 0);
}

/** Video de la clase. Vacío si no hay fila: o no se subió, o la base no lo entrega porque no tiene acceso. */
export async function loadVideoUrl(s: Session, lessonId: string): Promise<string> {
  const r = await s.supabase.from("lesson_media").select("video_url").eq("lesson_id", lessonId).maybeSingle();
  if (r.error) throw new Error(`db: ${r.error.message}`);
  return r.data?.video_url ?? "";
}

export type Comment = { id: string; userId: string; author: string; body: string; createdAt: string };
/** Comentarios visibles de una clase, del más viejo al más nuevo. */
export async function loadComments(s: Session, lessonId: string): Promise<Comment[]> {
  const rows = await fetchAll<{ id: string; user_id: string; author_name: string; body: string; created_at: string }>((a, b) =>
    s.supabase.from("lesson_comments").select("id, user_id, author_name, body, created_at").eq("lesson_id", lessonId).is("hidden_at", null)
      .order("created_at").order("id").range(a, b));
  return rows.map((r) => ({ id: r.id, userId: r.user_id, author: r.author_name, body: r.body, createdAt: r.created_at }));
}
