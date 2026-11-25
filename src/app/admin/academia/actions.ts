"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { videoEmbed, safeCta } from "@/app/(app)/academia/lib";
import { fail, ok } from "@/server/action";
import { fetchAll, must } from "@/server/data";
import type { Session } from "@/server/session";
import { adminAction, adminText, audit } from "../_shared/server";
import { checkCover, parseDuration, PRIORITIES, slugify, zonedToUtc } from "./lib";
import { M } from "./messages";

// Lo que cambia aquí se ve en la Academia del usuario, en el resumen del panel y en el registro.
const PATHS = ["/admin/academia", "/admin/actividad", "/admin", "/academia"];
/** Las páginas de cada curso y de cada clase (rutas con segmento dinámico). */
function refreshAcademia() {
  revalidatePath("/(app)/academia/[curso]", "page");
  revalidatePath("/(app)/academia/[curso]/[clase]", "page");
}

const Id = z.string().uuid();
const Tier = z.enum(["free", "pro"]);
/** Número entero escrito en un campo: vacío o con letras no vale (z.coerce convertiría "" en 0). */
const digits = (max: number) => z.union([z.string(), z.number()]).transform(String).pipe(z.string().regex(/^\d{1,4}$/)).transform(Number).pipe(z.number().int().min(0).max(max));
const text = (max: number) => z.string().max(max).default("").transform((v) => v.trim());
const m = (s: Session) => M[s.locale];

async function courseExists(s: Session, id: string) {
  const r = await s.supabase.from("courses").select("id, title").eq("id", id).maybeSingle();
  if (r.error) throw new Error(`db: ${r.error.message}`);
  return r.data;
}

// ───────── Cursos ─────────
const CourseIn = z.object({
  id: Id.nullable().default(null),
  title: text(120), stage: text(60), number: digits(999).pipe(z.number().min(1)),
  description: text(1000), cover: text(500), tier: Tier,
  priority: z.enum(PRIORITIES).nullable().default(null),
});

/** Crea (como borrador) o edita un curso. El enlace (slug) se arma del título al crearlo y no cambia. */
export async function saveCourse(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const t = m(s);
    const p = CourseIn.safeParse(input);
    if (!p.success) return fail(p.error.issues.some((i) => i.path[0] === "number") ? t.errors.number : adminText(s).errors.generic);
    const d = p.data;
    if (!d.title || !d.stage) return fail(t.errors.title);
    const cover = checkCover(d.cover);
    if (cover === null) return fail(t.errors.cover);
    const row = { title: d.title, stage: d.stage, number: d.number, sort: d.number, description: d.description, cover_url: cover, tier: d.tier, priority: d.priority };
    if (d.id) {
      const r = must(await s.supabase.from("courses").update(row).eq("id", d.id).select("id").single());
      await audit(s, "curso_editar", null, { course: r.id, name: d.title, tier: d.tier });
      refreshAcademia();
      return ok(r.id);
    }
    const slug = slugify(d.title) || `curso-${d.number}`;
    const { data, error } = await s.supabase.from("courses").insert({ ...row, slug, status: "draft" }).select("id").single();
    if (error) return fail(error.code === "23505" ? t.errors.slug : adminText(s).errors.generic);
    await audit(s, "curso_crear", null, { course: data.id, name: d.title });
    return ok(data.id);
  });
}

/** Publicar ya o volver a borrador. Nunca se borra un curso: el avance de los alumnos se conserva. */
export async function setCourseStatus(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const p = z.object({ id: Id, status: z.enum(["draft", "published"]) }).safeParse(input);
    if (!p.success) return fail(adminText(s).errors.generic);
    const patch = p.data.status === "published" ? { status: "published", publish_at: new Date().toISOString() } : { status: "draft" };
    const r = must(await s.supabase.from("courses").update(patch).eq("id", p.data.id).select("id, title").single());
    await audit(s, p.data.status === "published" ? "curso_publicar" : "curso_borrador", null, { course: r.id, name: r.title });
    refreshAcademia();
    return ok(undefined);
  });
}

/** Programa la publicación: día y hora escritos en la zona horaria del admin. */
export async function scheduleCourse(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const t = m(s);
    const p = z.object({ id: Id, date: z.string().max(10), time: z.string().max(5) }).safeParse(input);
    if (!p.success) return fail(t.errors.date);
    const at = zonedToUtc(p.data.date, p.data.time, s.profile.timezone || "Australia/Sydney");
    if (!at || Date.parse(at) <= Date.now()) return fail(t.errors.date);
    const r = must(await s.supabase.from("courses").update({ status: "scheduled", publish_at: at }).eq("id", p.data.id).select("id, title").single());
    await audit(s, "curso_programar", null, { course: r.id, name: r.title, until: p.data.date });
    refreshAcademia();
    return ok(undefined);
  });
}

// ───────── Módulos ─────────
export async function createModule(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const p = z.object({ courseId: Id, title: text(80) }).safeParse(input);
    if (!p.success || !p.data.title) return fail(m(s).errors.module);
    if (!(await courseExists(s, p.data.courseId))) return fail(m(s).errors.missing);
    const mods = must(await s.supabase.from("course_modules").select("sort").eq("course_id", p.data.courseId));
    const sort = mods.reduce((a, x) => Math.max(a, x.sort), 0) + 1;
    const r = must(await s.supabase.from("course_modules").insert({ course_id: p.data.courseId, title: p.data.title, sort }).select("id").single());
    await audit(s, "modulo_crear", null, { course: p.data.courseId, module: r.id, name: p.data.title });
    refreshAcademia();
    return ok(r.id);
  });
}

export async function renameModule(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const p = z.object({ id: Id, title: text(80) }).safeParse(input);
    if (!p.success || !p.data.title) return fail(m(s).errors.module);
    must(await s.supabase.from("course_modules").update({ title: p.data.title }).eq("id", p.data.id).select("id").single());
    await audit(s, "modulo_renombrar", null, { module: p.data.id, name: p.data.title });
    refreshAcademia();
    return ok(undefined);
  });
}

/** Nuevo orden de los módulos de un curso (todos sus ids, en orden). */
export async function reorderModules(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const p = z.object({ courseId: Id, ids: z.array(Id).min(1).max(200) }).safeParse(input);
    if (!p.success) return fail(adminText(s).errors.generic);
    const current = must(await s.supabase.from("course_modules").select("id").eq("course_id", p.data.courseId));
    if (!sameSet(current.map((x) => x.id), p.data.ids)) return fail(m(s).errors.missing);
    for (const [i, id] of p.data.ids.entries()) {
      must(await s.supabase.from("course_modules").update({ sort: i + 1 }).eq("id", id).eq("course_id", p.data.courseId).select("id").single());
    }
    await audit(s, "modulo_ordenar", null, { course: p.data.courseId });
    refreshAcademia();
    return ok(undefined);
  });
}

// ───────── Clases ─────────
async function lessonsIn(s: Session, courseId: string, moduleId: string | null) {
  return fetchAll<{ id: string; sort: number }>((a, b) => {
    const q = s.supabase.from("lessons").select("id, sort").eq("course_id", courseId);
    return (moduleId ? q.eq("module_id", moduleId) : q.is("module_id", null)).order("sort").order("id").range(a, b);
  });
}
async function moduleOk(s: Session, courseId: string, moduleId: string | null) {
  if (!moduleId) return true;
  const r = await s.supabase.from("course_modules").select("id").eq("id", moduleId).eq("course_id", courseId).maybeSingle();
  if (r.error) throw new Error(`db: ${r.error.message}`);
  return !!r.data;
}

/** Crea una clase al final de su módulo, con los puntos por clase de la configuración. */
export async function createLesson(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const t = m(s);
    const p = z.object({ courseId: Id, moduleId: Id.nullable().default(null), title: text(160) }).safeParse(input);
    if (!p.success || !p.data.title) return fail(t.errors.title);
    if (!(await courseExists(s, p.data.courseId)) || !(await moduleOk(s, p.data.courseId, p.data.moduleId))) return fail(t.errors.missing);
    const sort = (await lessonsIn(s, p.data.courseId, p.data.moduleId)).reduce((a, x) => Math.max(a, x.sort), 0) + 1;
    const points = Math.max(0, Math.min(1000, Math.round(s.config.points.lesson ?? 10)));
    const r = must(await s.supabase.from("lessons").insert({ course_id: p.data.courseId, module_id: p.data.moduleId, title: p.data.title, points, sort }).select("id").single());
    await audit(s, "clase_crear", null, { course: p.data.courseId, lesson: r.id, name: p.data.title });
    refreshAcademia();
    return ok(r.id);
  });
}

const LessonIn = z.object({
  id: Id, moduleId: Id.nullable().default(null), title: text(160), duration: text(10), video: text(500),
  cta: text(120), points: digits(1000), tier: Tier, description: text(2000), required: z.boolean(),
});

/** Guarda título, duración, video, pantalla del botón, puntos, plan, descripción, obligatoria y módulo. */
export async function saveLesson(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const t = m(s);
    const p = LessonIn.safeParse(input);
    if (!p.success) return fail(p.error.issues.some((i) => i.path[0] === "points") ? t.errors.points : adminText(s).errors.generic);
    const d = p.data;
    if (!d.title) return fail(t.errors.title);
    const duration = parseDuration(d.duration);
    if (duration === null) return fail(t.errors.duration);
    if (d.video && !videoEmbed(d.video)) return fail(t.errors.video);
    const cta = d.cta ? safeCta(d.cta) : null;
    if (d.cta && !cta) return fail(t.errors.cta);

    const cur = await s.supabase.from("lessons").select("id, course_id, module_id, sort").eq("id", d.id).maybeSingle();
    if (cur.error) throw new Error(`db: ${cur.error.message}`);
    if (!cur.data) return fail(t.errors.missing);
    if (!(await moduleOk(s, cur.data.course_id, d.moduleId))) return fail(t.errors.missing);
    const moved = cur.data.module_id !== d.moduleId;
    const sort = moved ? (await lessonsIn(s, cur.data.course_id, d.moduleId)).reduce((a, x) => Math.max(a, x.sort), 0) + 1 : cur.data.sort;

    must(await s.supabase.from("lessons").update({
      title: d.title, description: d.description, duration_sec: duration, points: d.points, cta_screen: cta, tier: d.tier, required: d.required, module_id: d.moduleId, sort,
    }).eq("id", d.id).select("id").single());
    must(await s.supabase.from("lesson_media").upsert({ lesson_id: d.id, video_url: d.video }, { onConflict: "lesson_id" }).select("lesson_id").single());
    await audit(s, "clase_editar", null, { course: cur.data.course_id, lesson: d.id, name: d.title, tier: d.tier, video: d.video ? "si" : "no" });
    refreshAcademia();
    return ok(undefined);
  });
}

/** Nuevo orden de las clases de un módulo (o de las que no tienen módulo). */
export async function reorderLessons(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const p = z.object({ courseId: Id, moduleId: Id.nullable().default(null), ids: z.array(Id).min(1).max(500) }).safeParse(input);
    if (!p.success) return fail(adminText(s).errors.generic);
    const current = await lessonsIn(s, p.data.courseId, p.data.moduleId);
    if (!sameSet(current.map((x) => x.id), p.data.ids)) return fail(m(s).errors.missing);
    for (const [i, id] of p.data.ids.entries()) {
      must(await s.supabase.from("lessons").update({ sort: i + 1 }).eq("id", id).eq("course_id", p.data.courseId).select("id").single());
    }
    await audit(s, "clase_ordenar", null, { course: p.data.courseId, module: p.data.moduleId ?? undefined });
    refreshAcademia();
    return ok(undefined);
  });
}

// ───────── Comentarios: ocultar o mostrar (nunca se borran desde aquí) ─────────
export async function setCommentHidden(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const p = z.object({ id: Id, hidden: z.boolean() }).safeParse(input);
    if (!p.success) return fail(adminText(s).errors.generic);
    const r = must(await s.supabase.from("lesson_comments").update({ hidden_at: p.data.hidden ? new Date().toISOString() : null }).eq("id", p.data.id).select("id, lesson_id").single());
    // Sin el texto del comentario en el registro.
    await audit(s, p.data.hidden ? "clase_comentario_ocultar" : "clase_comentario_mostrar", null, { comment: r.id, lesson: r.lesson_id });
    refreshAcademia();
    return ok(undefined);
  });
}

// ───────── Puntos (app_config.points): solo las 4 claves de esta pantalla ─────────
const Pts = digits(1000);
export async function savePoints(input: unknown) {
  return adminAction([...PATHS, "/admin/menu"], async (s) => {
    const p = z.object({ lesson: Pts, course: Pts, closure: Pts, week_active: Pts }).safeParse(input);
    if (!p.success) return fail(m(s).errors.points);
    const cur = await s.supabase.from("app_config").select("value").eq("key", "points").maybeSingle();
    if (cur.error) throw new Error(`db: ${cur.error.message}`);
    const base = cur.data?.value && typeof cur.data.value === "object" && !Array.isArray(cur.data.value) ? cur.data.value : {};
    const value = { ...base, ...p.data };
    must(await s.supabase.from("app_config").upsert({ key: "points", value, updated_at: new Date().toISOString() }, { onConflict: "key" }).select("key").single());
    await audit(s, "academia_puntos", null, p.data);
    refreshAcademia();
    return ok(undefined);
  });
}

function sameSet(a: string[], b: string[]) {
  if (a.length !== b.length || new Set(b).size !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}
