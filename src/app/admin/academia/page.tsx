import type { Metadata } from "next";
import { fill } from "@/i18n";
import { formatDate } from "@/lib/engine";
import { localParts, orderLessons } from "@/app/(app)/academia/lib";
import { fetchAll, must } from "@/server/data";
import { requireAdmin, type Session } from "@/server/session";
import css from "../_shared/admin.module.css";
import { isUuid } from "../_shared/lib";
import { A } from "../_shared/messages";
import { fmtDay } from "../_shared/server";
import { AcademiaAdminView, type CourseItem, type CourseFull, type ModuleGroup, type LessonFull, type CommentRow } from "./AcademiaAdminView";
import { courseState, fmtDuration, stageLabel, STAGES } from "./lib";
import { M } from "./messages";

export const metadata: Metadata = { title: "Academia" };

type LessonRow = { id: string; course_id: string; module_id: string | null; title: string; description: string; duration_sec: number; points: number; cta_screen: string | null; tier: string; required: boolean; sort: number };
const one = (v: string | string[] | undefined) => (typeof v === "string" && isUuid(v) ? v : null);

type Search = { curso?: string | string[]; clase?: string | string[] };

export default async function AdminAcademia({ searchParams }: { searchParams: Promise<Search> }) {
  const s = await requireAdmin();
  const v = await loadView(s, await searchParams);
  return (
    <main className={css.page}>
      <AcademiaAdminView t={A[s.locale]} m={M[s.locale]} {...v} />
    </main>
  );
}

/** Todo lo que pinta la pantalla: cursos, el curso abierto con sus módulos y clases, la clase abierta y sus comentarios. */
async function loadView(s: Session, sp: Search) {
  const m = M[s.locale];
  const tz = s.profile.timezone || "Australia/Sydney";

  const [coursesRes, modules, lessons] = await Promise.all([
    s.supabase.from("courses").select("id, slug, stage, number, title, description, cover_url, status, publish_at, tier, priority, sort").order("sort").order("number"),
    fetchAll<{ id: string; course_id: string; title: string; sort: number }>((a, b) => s.supabase.from("course_modules").select("id, course_id, title, sort").order("sort").order("id").range(a, b)),
    fetchAll<LessonRow>((a, b) => s.supabase.from("lessons").select("id, course_id, module_id, title, description, duration_sec, points, cta_screen, tier, required, sort").order("sort").order("id").range(a, b)),
  ]);
  const courses = must(coursesRes);
  const nowMs = Date.now();

  const count = new Map<string, number>();
  lessons.forEach((l) => count.set(l.course_id, (count.get(l.course_id) ?? 0) + 1));
  const stateText = (status: string, publishAt: string | null) => {
    const st = courseState(status, publishAt, nowMs);
    return { st, label: st === "scheduled" ? fill(m.states.scheduled, { date: publishAt ? fmtDay(s, publishAt, "short") : A[s.locale].none }) : m.states[st] };
  };

  const selId = one(sp.curso) ?? courses[0]?.id ?? null;
  const sel = courses.find((c) => c.id === selId) ?? courses[0] ?? null;

  const items: CourseItem[] = courses.map((c) => {
    const n = count.get(c.id) ?? 0;
    const { st, label } = stateText(c.status, c.publish_at);
    return { id: c.id, label: stageLabel(c.stage, c.number), title: c.title, cover: c.cover_url, state: st, stateLabel: label, count: n === 1 ? m.lessonsOne : fill(m.lessonsN, { n }), selected: c.id === sel?.id };
  });

  let course: CourseFull | null = null;
  let groups: ModuleGroup[] = [];
  let lesson: LessonFull | null = null;
  let comments: CommentRow[] = [];

  if (sel) {
    const mods = modules.filter((x) => x.course_id === sel.id).sort((a, b) => a.sort - b.sort);
    const own = lessons.filter((l) => l.course_id === sel.id);
    const ordered = orderLessons(own.map((l) => ({ ...l, moduleId: l.module_id })), mods.map((x) => ({ id: x.id, sort: x.sort })));
    const pos = new Map(ordered.map((l, i) => [l.id, i + 1]));
    const toRow = (l: LessonRow) => ({ id: l.id, n: pos.get(l.id) ?? 0, title: l.title, duration: fmtDuration(l.duration_sec) });
    const modIds = new Set(mods.map((x) => x.id));
    groups = mods.map((x, i) => ({ id: x.id, title: x.title, n: i + 1, lessons: ordered.filter((l) => l.module_id === x.id).map(toRow) }));
    const loose = ordered.filter((l) => !l.module_id || !modIds.has(l.module_id));
    if (loose.length) groups.push({ id: null, title: "", n: 0, lessons: loose.map(toRow) });

    const { st } = stateText(sel.status, sel.publish_at);
    const when = sel.publish_at ? localParts(sel.publish_at, tz) : null;
    course = {
      id: sel.id, slug: sel.slug, label: stageLabel(sel.stage, sel.number), title: sel.title, stage: sel.stage, number: sel.number, description: sel.description,
      cover: sel.cover_url, tier: sel.tier === "pro" ? "pro" : "free", priority: sel.priority, state: st,
      scheduledText: st === "scheduled" && when ? fill(m.scheduledFor, { date: formatDate(when.date, s.locale, "long"), time: when.time }) : null,
      scheduleDate: st === "scheduled" && when ? when.date : "", scheduleTime: st === "scheduled" && when ? when.time : "09:00",
    };

    const lessonId = one(sp.clase);
    const l = (lessonId ? ordered.find((x) => x.id === lessonId) : null) ?? ordered[0] ?? null;
    if (l) {
      const [media, rows] = await Promise.all([
        s.supabase.from("lesson_media").select("video_url").eq("lesson_id", l.id).maybeSingle(),
        fetchAll<{ id: string; author_name: string; body: string; hidden_at: string | null; created_at: string }>((a, b) =>
          s.supabase.from("lesson_comments").select("id, author_name, body, hidden_at, created_at").eq("lesson_id", l.id).order("created_at", { ascending: false }).order("id").range(a, b)),
      ]);
      if (media.error) throw new Error(`db: ${media.error.message}`);
      lesson = {
        id: l.id, n: pos.get(l.id) ?? 1, moduleId: l.module_id && modIds.has(l.module_id) ? l.module_id : null, title: l.title, duration: fmtDuration(l.duration_sec),
        video: media.data?.video_url ?? "", cta: l.cta_screen ?? "", points: l.points, tier: l.tier === "pro" ? "pro" : "free", description: l.description, required: l.required,
      };
      comments = rows.map((r) => ({ id: r.id, author: r.author_name || m.anon, body: r.body, hidden: !!r.hidden_at, date: fmtDay(s, r.created_at, "short") }));
    }
  }

  const stages = [...new Set([...STAGES, ...courses.map((c) => c.stage)])];
  const covers = [...new Set(courses.map((c) => c.cover_url).filter(Boolean))].sort();
  const pts = s.config.points;
  const nextNumber = courses.reduce((a, c) => Math.max(a, c.number), 0) + 1;

  return {
    tz, items, course, groups, lesson, comments, stages, covers, nextNumber,
    points: { lesson: pts.lesson ?? 0, course: pts.course ?? 0, closure: pts.closure ?? 0, week_active: pts.week_active ?? 0 },
    levels: s.config.levels.map((x) => x.name).join(" · "),
  };
}
