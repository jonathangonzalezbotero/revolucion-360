import "server-only";
import { fail, ok, type Result } from "@/server/action";
import { fetchAll } from "@/server/data";
import { untypedDb, type Db } from "@/server/crm";
import type { Session } from "@/server/session";
import type { LessonOption } from "../campanas/BlocksEditor";
import { crmErrorKey } from "./lib";
import { M } from "./messages";

// Piezas de servidor que comparten Contactos, Campañas y Automatizaciones.

/** Cliente de la sesión del Dueño para las funciones de @/server/crm (la base impone que solo el Dueño lea crm_*). */
export const crmOf = (s: Session): Db => untypedDb(s.supabase);

/**
 * Corre una función del motor y traduce su error corto ("invalid", "legal_incomplete"…) a un texto. Un error que no
 * conocemos se registra sin datos personales y se muestra el genérico.
 */
export async function crmTry<T>(s: Session, fn: (db: Db) => Promise<T>, errors: Record<string, string> = M[s.locale].errors): Promise<Result<T>> {
  try {
    return ok(await fn(crmOf(s)));
  } catch (e) {
    const key = crmErrorKey(e);
    if (key === "generic") console.error("[admin/crm]", e instanceof Error ? e.message.slice(0, 120) : "error");
    return fail(errors[key] ?? M[s.locale].errors[key] ?? M[s.locale].errors.generic);
  }
}

/** Dirección pública de la app (para las imágenes y enlaces del correo). */
export const publicAppUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();

/** Clases de cursos publicados, para el bloque "Clase de la Academia" (enlace a /academia/<curso>/<clase>). */
export async function loadLessons(s: Session): Promise<LessonOption[]> {
  const [courses, lessons] = await Promise.all([
    fetchAll((a, b) => s.supabase.from("courses").select("id, slug, title, status, sort, number").order("sort").order("number").range(a, b)),
    fetchAll((a, b) => s.supabase.from("lessons").select("id, course_id, title, sort").order("sort").order("id").range(a, b)),
  ]);
  const published = courses.filter((x) => x.status === "published");
  return published.flatMap((co) => lessons.filter((l) => l.course_id === co.id).map((l) => ({ href: `/academia/${co.slug}/${l.id}`, title: l.title, course: co.title })));
}
