import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fill } from "@/i18n";
import { Empty, PageHeader } from "@/components/ui/basics";
import { requireUser } from "@/server/session";
import { formatDate } from "@/lib/engine";
import { Countdown } from "../Countdown";
import { localParts } from "../lib";
import { M } from "../messages";
import { loadCatalog, loadCourse } from "../server";
import { Cover, LessonList } from "../ui";
import css from "../academia.module.css";

type Params = Promise<{ curso: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { curso } = await params;
  return { title: decodeURIComponent(curso).replace(/-/g, " ") };
}

export default async function CursoPage({ params }: { params: Params }) {
  const s = await requireUser();
  const m = M[s.locale];
  const { curso } = await params;
  const back = <Link href="/academia" className="link">‹ {m.academia}</Link>;
  if (s.config.menu.academia !== "on") {
    return (
      <main className="page">
        <PageHeader title={m.title} eyebrow={back} />
        <Empty icon="cap" title={m.soonTitle} text={m.soonText}><Link href="/inicio" className="btn btn-secondary btn-sm">{m.goHome}</Link></Empty>
      </main>
    );
  }
  const cv = await loadCourse(s, decodeURIComponent(curso));
  if (!cv) notFound();
  const { course, progress } = cv;
  const stage = m.stages[course.stage]?.label ?? course.stage.toUpperCase();
  const next = cv.lessons.find((l) => l.id === cv.nextId);

  if (course.upcoming && course.publishAt) {
    const { nowMs } = await loadCatalog(s);
    const p = localParts(course.publishAt, s.profile.timezone || "Australia/Sydney");
    const rel = { date: formatDate(p.date, s.locale, "day"), time: p.time };
    return (
      <main className="page">
        <PageHeader title={course.title} eyebrow={<>{back} · {stage}</>} />
        <div className={css.player} style={{ aspectRatio: "21 / 9" }} role="img" aria-label={fill(m.cover, { title: course.title })}><Cover src={course.coverUrl} /></div>
        <section aria-labelledby="rel" className={css.box} style={{ gap: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".12em", color: "var(--amarillo-texto)" }}>{m.comingSoon.toUpperCase()}</span>
          <h2 id="rel" style={{ fontSize: 22, fontWeight: 600 }}>{fill(m.courseUpcomingTitle, rel)}</h2>
          {course.description ? <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--gris-2)" }}>{course.description}</p> : null}
          <Countdown targetMs={Date.parse(course.publishAt)} serverNowMs={nowMs} t={{ cd: m.cd, cdAria: m.cdAria, released: m.released }} />
          <span style={{ fontSize: 13, color: "var(--gris)" }}>{fill(m.courseUpcomingText, rel)}</span>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <PageHeader title={course.title} eyebrow={<>{back} · {stage}</>}>
        {next ? <Link href={`/academia/${course.slug}/${next.id}`} className="btn">{progress.done > 0 ? m.continue : m.start}</Link> : null}
      </PageHeader>

      <div className={css.lessonLayout}>
        <div className={css.lessonMain}>
          <div className={css.player} style={{ aspectRatio: "21 / 9" }} role="img" aria-label={fill(m.cover, { title: course.title })}>
            <Cover src={course.coverUrl} />
          </div>
          {course.description ? (
            <section aria-label={m.about} className={css.box}>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--gris-2)" }}>{course.description}</p>
            </section>
          ) : null}
        </div>
        <div className={css.lessonAside}>
          <aside aria-labelledby="curso" className={css.box} style={{ padding: 18, gap: 12 }}>
            <h2 id="curso" style={{ fontSize: 16, fontWeight: 600, textTransform: "uppercase" }}>{course.title}</h2>
            <div role="progressbar" aria-label={m.progress} aria-valuenow={progress.pct} aria-valuemin={0} aria-valuemax={100} style={{ height: 6, borderRadius: 3, background: "var(--linea-2)" }}><div style={{ height: 6, borderRadius: 3, background: "var(--tinta)", width: `${progress.pct}%` }} /></div>
            <span className="num" style={{ fontSize: 13, color: "var(--gris)" }}>{fill(m.courseProgress, { n: progress.done, total: progress.total, pct: progress.pct })}</span>
            {cv.lessons.length === 0
              ? <Empty icon="cap" title={m.courseSoonTitle} text={m.courseSoonText} />
              : <LessonList cv={cv} m={m} gamification={s.config.gamification} />}
          </aside>
        </div>
      </div>
    </main>
  );
}
