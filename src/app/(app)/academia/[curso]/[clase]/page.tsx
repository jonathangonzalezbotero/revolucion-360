import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fill } from "@/i18n";
import { Empty, PageHeader } from "@/components/ui/basics";
import { Icon } from "@/components/ui/Icon";
import { formatDate, monthName } from "@/lib/engine";
import { closureTarget } from "@/server/closure";
import type { MenuKey } from "@/server/config";
import { requireUser } from "@/server/session";
import { durationLabel, lessonStates, localParts, neighbors, safeCta, videoEmbed } from "../../lib";
import { M } from "../../messages";
import { loadCatalog, loadComments, loadCourse, loadVideoUrl } from "../../server";
import { Cover, LessonList } from "../../ui";
import { About, Comments, CompleteButton, Rating } from "./LessonClient";
import css from "../../academia.module.css";

type Params = Promise<{ curso: string; clase: string }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MENU_KEYS: MenuKey[] = ["plan", "movimientos", "cuentas", "metas", "proyeccion", "analisis", "deudas", "inversiones", "academia", "cierre"];

export const metadata: Metadata = { title: "Clase" };

export default async function ClasePage({ params }: { params: Params }) {
  const s = await requireUser();
  const m = M[s.locale];
  const { curso, clase } = await params;
  if (s.config.menu.academia !== "on") {
    return (
      <main className="page">
        <PageHeader title={m.title} eyebrow={<Link href="/academia" className="link">‹ {m.academia}</Link>} />
        <Empty icon="cap" title={m.soonTitle} text={m.soonText}><Link href="/inicio" className="btn btn-secondary btn-sm">{m.goHome}</Link></Empty>
      </main>
    );
  }
  if (!UUID.test(clase)) notFound();
  const cv = await loadCourse(s, decodeURIComponent(curso));
  const lesson = cv?.lessons.find((l) => l.id === clase);
  if (!cv || !lesson) notFound();

  const { course } = cv;
  const cat = await loadCatalog(s);
  const state = cv.states.get(lesson.id) ?? "open";
  const done = state === "done";
  const locker = state === "locked" ? cv.lessons.slice(0, cv.lessons.findIndex((l) => l.id === lesson.id)).find((l) => l.required && cv.states.get(l.id) !== "done") ?? null : null;
  const { prev, next } = neighbors(cv.lessons, lesson.id);
  const nextOpen = next && cv.states.get(next.id) !== "locked" ? next : null;
  // Si al ver esta clase se desbloquea la siguiente, el botón lleva a ella.
  const nextAfter = next && lessonStates(cv.lessons, new Set([...cat.done, lesson.id])).get(next.id) !== "locked" ? next : null;
  const modIdx = lesson.moduleId ? cv.modules.findIndex((x) => x.id === lesson.moduleId) + 1 : 0;
  const stageLabel = `${course.title.toUpperCase()}${modIdx > 0 ? ` · ${fill(m.module, { n: modIdx })}` : ""}`;
  const dur = durationLabel(lesson.durationSec, m.dur);
  const game = s.config.gamification;

  const tz = s.profile.timezone || "Australia/Sydney";
  const comments = (await loadComments(s, lesson.id)).map((c) => {
    const p = localParts(c.createdAt, tz);
    return { id: c.id, mine: c.userId === s.userId, author: c.author, body: c.body, when: `${formatDate(p.date, s.locale, "short")} · ${p.time}` };
  });
  const ct = {
    comments: m.comments, commentLabel: m.commentLabel, commentPh: m.commentPh, send: m.send, sending: m.sending, noComments: m.noComments, deleteC: m.deleteC,
    deleteConfirm: m.deleteConfirm, commentReadOnly: m.commentReadOnly, commentAdded: m.commentAdded, commentDeleted: m.commentDeleted, you: m.you, charCount: m.charCount, commentEmpty: m.commentEmpty,
  };

  const video = state !== "locked" ? videoEmbed(await loadVideoUrl(s, lesson.id)) : null;

  const cta = safeCta(lesson.ctaScreen);
  const ctaKey = cta?.split(/[/?#]/)[1] as MenuKey | undefined;
  const ctaVisible = cta && !(ctaKey && MENU_KEYS.includes(ctaKey) && s.config.menu[ctaKey] !== "on");
  const ctaBase = cta?.split(/[?#]/)[0] ?? "";
  const target = ctaBase === "/cierre" ? await closureTarget(s) : null;
  const screen = cta ? fill(m.screens[ctaBase] ?? m.screenOther, { month: monthName(target?.month ?? s.month, s.locale).toLowerCase() }) : "";

  const t = {
    complete: m.complete, completing: m.completing, nextClass: m.nextClass, backToCourse: m.backToCourse, about: m.about, more: m.more, less: m.less,
    noDescription: m.noDescription, rateQ: m.rateQ, rateGroup: m.rateGroup, rateStar: m.rateStar, rateAfter: m.rateAfter, rated: m.rated,
  };

  const meta = [dur, lesson.required ? <strong key="req" style={{ color: "var(--ambar-texto)" }}>{m.required}</strong> : null, game && lesson.points > 0 ? <span key="pts" style={{ color: "var(--amarillo-texto)", fontWeight: 600 }}>{fill(m.plusPoints, { n: lesson.points })}</span> : null].filter(Boolean);

  return (
    <main className="page" style={{ maxWidth: 1300 }}>
      <div className={css.lessonLayout}>
        <div className={css.lessonMain}>
          <div className={css.player}>
            {state === "locked" ? (
              <>
                <Cover src={course.coverUrl} dim />
                <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: 20, textAlign: "center", color: "var(--blanco)", maxWidth: 440 }}>
                  <span aria-hidden="true" style={{ width: 60, height: 60, borderRadius: "50%", background: "var(--blanco)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="lock" size={24} color="var(--tinta)" /></span>
                  <strong style={{ fontSize: 17 }}>{m.lockedTitle}</strong>
                  {locker ? <span style={{ fontSize: 14, color: "var(--oscuro-texto-2)" }}>{fill(m.lockedText, { title: locker.title })}</span> : null}
                  {locker ? <Link href={`/academia/${course.slug}/${locker.id}`} className="btn btn-yellow btn-sm">{m.goToLesson}</Link> : null}
                </div>
              </>
            ) : video?.kind === "iframe" ? (
              <iframe src={video.src} title={fill(m.videoTitle, { title: lesson.title })} allow="autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" loading="lazy" />
            ) : video?.kind === "video" ? (
              <video src={video.src} controls preload="metadata" playsInline title={fill(m.videoTitle, { title: lesson.title })} />
            ) : (
              <>
                <Cover src={course.coverUrl} dim />
                <div role="status" style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: 20, textAlign: "center", color: "var(--blanco)", maxWidth: 440 }}>
                  <span aria-hidden="true" style={{ width: 60, height: 60, borderRadius: "50%", background: "var(--blanco)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="play" size={24} color="var(--tinta)" /></span>
                  <strong style={{ fontSize: 17 }}>{m.noVideo}</strong>
                  <span style={{ fontSize: 14, color: "var(--oscuro-texto-2)" }}>{m.noVideoText}</span>
                </div>
              </>
            )}
          </div>

          <div className={css.lessonHead}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".12em" }}>{stageLabel}</span>
              <h1 className={css.lessonTitle}>{lesson.title}</h1>
              {meta.length || done ? (
                <span style={{ fontSize: 13, color: "var(--gris)", display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {done ? <span className="pill pill-dark"><Icon name="tick" size={12} /> {m.seen}</span> : null}
                  {meta.map((x, i) => <span key={i}>{i > 0 ? "· " : ""}{x}</span>)}
                </span>
              ) : null}
            </div>
            <div className={css.lessonActions}>
              <Link href={`/academia/${course.slug}`} aria-label={m.backCourse} className={css.iconBtn}>‹</Link>
              {state !== "locked" ? <CompleteButton lessonId={lesson.id} slug={course.slug} done={done} canEdit={s.canEdit} nextId={done || !s.canEdit ? nextOpen?.id ?? null : nextAfter?.id ?? null} t={t} /> : null}
            </div>
          </div>

          {ctaVisible && cta ? (
            <Link href={cta} className={css.cta}>
              <span aria-hidden="true" style={{ width: 42, height: 42, borderRadius: 12, background: "var(--amarillo-oscuro)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon name="wand" size={20} color="var(--tinta)" /></span>
              <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}><strong style={{ fontSize: 15 }}>{m.doNow}</strong><span style={{ fontSize: 13, color: "var(--rojo-texto)" }}>{fill(m.doNowText, { screen })}</span></span>
              <span aria-hidden="true" style={{ fontSize: 18 }}>›</span>
            </Link>
          ) : null}

          <About text={lesson.description} t={t} />
          <Rating lessonId={lesson.id} rating={cat.ratings.get(lesson.id) ?? null} enabled={done && s.canEdit} t={t} />
          <Comments lessonId={lesson.id} items={comments} canWrite={s.canEdit} initial={(s.profile.name || "?").charAt(0).toUpperCase()} t={ct} />

          {prev || nextOpen ? (
            <nav aria-label={m.title} className={css.navRow}>
              {prev ? <Link href={`/academia/${course.slug}/${prev.id}`} className="btn btn-secondary">{m.prevClass}</Link> : <span />}
              {nextOpen ? <Link href={`/academia/${course.slug}/${nextOpen.id}`} className="btn btn-secondary">{m.nextClass}</Link> : null}
            </nav>
          ) : null}
        </div>

        <div className={css.lessonAside}>
          <aside aria-labelledby="curso" className={css.box} style={{ padding: 18, gap: 12 }}>
            <h2 id="curso" style={{ fontSize: 16, fontWeight: 600, textTransform: "uppercase" }}><Link href={`/academia/${course.slug}`} style={{ textDecoration: "none" }}>{course.title}</Link></h2>
            <div role="progressbar" aria-label={m.progress} aria-valuenow={cv.progress.pct} aria-valuemin={0} aria-valuemax={100} style={{ height: 6, borderRadius: 3, background: "var(--linea-2)" }}><div style={{ height: 6, borderRadius: 3, background: "var(--tinta)", width: `${cv.progress.pct}%` }} /></div>
            <span className="num" style={{ fontSize: 13, color: "var(--gris)" }}>{fill(m.courseProgress, { n: cv.progress.done, total: cv.progress.total, pct: cv.progress.pct })}</span>
            <LessonList cv={cv} m={m} current={lesson.id} gamification={game} collapse />
          </aside>
        </div>
      </div>
    </main>
  );
}
