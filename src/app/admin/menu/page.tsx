import type { Metadata } from "next";
import { fill } from "@/i18n";
import { must } from "@/server/data";
import { requireAdmin } from "@/server/session";
import css from "../_shared/admin.module.css";
import { FLAG_KEYS, MENU_KEYS, POINT_KEYS, valuesToForm, type StudentForm } from "./lib";
import { M } from "./messages";
import { MenuView } from "./MenuView";

export const metadata: Metadata = { title: "Menú y funciones" };

export default async function AdminMenu() {
  const s = await requireAdmin();
  const m = M[s.locale];
  const c = s.config;
  // `admin_mfa_required` no está en s.config: se lee tal cual (la base lo da por encendido si falta).
  const [mfaRes, coursesRes] = await Promise.all([
    s.supabase.from("app_config").select("value").eq("key", "admin_mfa_required").maybeSingle(),
    s.supabase.from("courses").select("slug, number, title, status").order("sort").order("number"),
  ]);
  const mfaRow = must(mfaRes);
  // Cursos para "Un curso fijo" (el Diagnóstico solo lo muestra si está publicado; si no, usa el automático).
  const courses = must(coursesRes).map((x) => ({
    slug: x.slug, label: fill(x.status === "published" ? m.courseOption : m.courseOptionDraft, { n: String(x.number).padStart(2, "0"), title: x.title }),
  }));
  const student: StudentForm = { mode: c.diagCta.student.mode, course: c.diagCta.student.course };
  const form = valuesToForm({
    menu: Object.fromEntries(MENU_KEYS.map((k) => [k, c.menu[k] ?? "on"])) as typeof c.menu,
    flags: Object.fromEntries(FLAG_KEYS.map((k) => [k, c.flags[k] === true])) as typeof c.flags,
    gamification_enabled: c.gamification,
    admin_mfa_required: mfaRow?.value !== false,
    points: Object.fromEntries(POINT_KEYS.map((k) => [k, Number.isInteger(c.points[k]) ? c.points[k] : 0])) as Record<(typeof POINT_KEYS)[number], number>,
    levels: c.levels.map((l) => ({ name: String(l.name ?? ""), min: Number(l.min) || 0 })),
  });
  const names = Object.fromEntries(["inicio", ...MENU_KEYS].map((k) => [k, s.t.nav[k as keyof typeof s.t.nav]])) as Record<"inicio" | (typeof MENU_KEYS)[number], string>;
  return (
    <main className={css.page}>
      {/* La clave fuerza a empezar de cero cuando lo guardado cambia (después de guardar). */}
      <MenuView key={JSON.stringify([form, student])} m={m} names={names} initial={form} aal2={s.aal === "aal2"} student={student} courses={courses} />
    </main>
  );
}
