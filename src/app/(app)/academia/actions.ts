"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fill } from "@/i18n";
import { fail, ok, run } from "@/server/action";
import { award, firstStep, touchWeek, tryBadge } from "@/server/rewards";
import { cleanComment, courseProgress, lessonStates } from "./lib";
import { M } from "./messages";
import { loadCatalog, totalPoints } from "./server";
import { countChallenge } from "../retos/server";

const PATHS = ["/inicio", "/perfil"];
const Id = z.string().uuid();
/** La Academia, cada curso y cada clase (rutas con segmentos dinámicos: patrón + "page"). */
const revalidateAcademia = () => {
  revalidatePath("/academia");
  revalidatePath("/(app)/academia/[curso]", "page");
  revalidatePath("/(app)/academia/[curso]/[clase]", "page");
};

/** Marca la clase como vista: puntos, semana activa, primer paso, insignias y, si termina el curso, sus puntos y su insignia. */
export async function completeLesson(input: unknown) {
  return run({ revalidate: PATHS }, async (s) => {
    const m = M[s.locale];
    const p = Id.safeParse(input);
    if (!p.success) return fail(s.t.errors.notFound);
    const cat = await loadCatalog(s);
    const cv = cat.courses.find((c) => c.lessons.some((l) => l.id === p.data));
    const lesson = cv?.lessons.find((l) => l.id === p.data);
    if (!cv || !lesson) return fail(s.t.errors.notFound);
    const state = cv.states.get(lesson.id);
    if (state === "locked") return fail(m.errLocked);
    const next = cv.lessons[cv.lessons.findIndex((l) => l.id === lesson.id) + 1] ?? null;
    if (state === "done") return ok({ courseDone: cv.progress.complete, nextId: next?.id ?? null, text: m.toastSeen });

    const before = await totalPoints(s);
    const ins = await s.supabase.from("lesson_progress").insert({ user_id: s.userId, lesson_id: lesson.id });
    if (ins.error && ins.error.code !== "23505") throw new Error(`db: ${ins.error.message}`);
    await award(s, "lesson", lesson.id);
    await touchWeek(s);
    await countChallenge(s, "lesson", lesson.id); // Retos: "terminar una clase" (nunca lanza)
    await firstStep(s, "clase");
    await tryBadge(s, "play");

    const done = new Set(cat.done).add(lesson.id);
    const courseDone = courseProgress(cv.lessons.map((l) => l.id), done).complete;
    if (courseDone) {
      await award(s, "course", cv.course.id);
      await tryBadge(s, "cap");
    }
    const points = Math.max(0, (await totalPoints(s)) - before);
    // La siguiente clase puede haber quedado desbloqueada.
    const nextState = next ? lessonStates(cv.lessons, done).get(next.id) : null;
    revalidateAcademia();
    return ok(
      { courseDone, nextId: next && nextState !== "locked" ? next.id : null, text: courseDone ? fill(m.toastCourse, { title: cv.course.title }) : m.toastSeen },
      { points },
    );
  });
}

const Rate = z.object({ lessonId: Id, rating: z.number().int().min(1).max(5) });

/** Guarda la calificación (1 a 5). Solo de una clase ya vista: calificar no la marca como vista. */
export async function rateLesson(input: unknown) {
  return run({ revalidate: [] }, async (s) => {
    const m = M[s.locale];
    const p = Rate.safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const { data, error } = await s.supabase.from("lesson_progress").update({ rating: p.data.rating }).eq("user_id", s.userId).eq("lesson_id", p.data.lessonId).select("lesson_id");
    if (error) throw new Error(`db: ${error.message}`);
    if (!data || data.length === 0) return fail(m.errNotSeen);
    revalidateAcademia();
    return ok(p.data.rating);
  });
}

const NewComment = z.object({ lessonId: Id, body: z.string().max(4000) });

/** Publica un comentario en una clase liberada. El nombre visible es el del perfil. */
export async function addComment(input: unknown) {
  return run({ revalidate: [] }, async (s) => {
    const m = M[s.locale];
    const p = NewComment.safeParse(input);
    if (!p.success) return fail(m.commentTooLong);
    const body = cleanComment(p.data.body);
    if (!body) return fail(p.data.body.trim() ? m.commentTooLong : m.commentEmpty);
    const cat = await loadCatalog(s);
    if (!cat.courses.some((c) => c.lessons.some((l) => l.id === p.data.lessonId))) return fail(s.t.errors.notFound);
    const { data, error } = await s.supabase.from("lesson_comments")
      .insert({ lesson_id: p.data.lessonId, user_id: s.userId, author_name: s.profile.name || "", body }).select("id").single();
    if (error) throw new Error(`db: ${error.message}`);
    revalidateAcademia();
    return ok(data.id);
  });
}

/** Borra un comentario propio. */
export async function deleteComment(input: unknown) {
  return run({ revalidate: [] }, async (s) => {
    const p = Id.safeParse(input);
    if (!p.success) return fail(s.t.errors.notFound);
    const { data, error } = await s.supabase.from("lesson_comments").delete().eq("id", p.data).eq("user_id", s.userId).select("id");
    if (error) throw new Error(`db: ${error.message}`);
    if (!data || data.length === 0) return fail(s.t.errors.notFound);
    revalidateAcademia();
    return ok(p.data);
  });
}
