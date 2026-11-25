import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { fill } from "@/i18n";
import { Disclaimer, Empty } from "@/components/ui/basics";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cellMap, cellOf, diagnose, formatMoney, monthName, priority, type IndicatorKey, type Level } from "@/lib/engine";
import { loadDiagnosticInput, loadPlan, must } from "@/server/data";
import { requireUser } from "@/server/session";
import css from "./diagnostico.module.css";
import { benchmarksFrom, canDiagnose, joinNames, levelCounts, levelTone, pctText, referenceVars, studentStep, valueText, withFundState } from "./lib";
import { M } from "./messages";

export const metadata: Metadata = { title: "Diagnóstico" };

const TONE: Record<ReturnType<typeof levelTone>, { bg: string; fg: string }> = {
  ok: { bg: "var(--verde-fondo)", fg: "var(--verde-fuerte)" },
  warn: { bg: "var(--ambar-fondo)", fg: "var(--ambar-oscuro)" },
  bad: { bg: "var(--rojo-fondo)", fg: "var(--rojo-texto)" },
  neutral: { bg: "var(--linea-2)", fg: "var(--tinta-2)" },
};
const FOCUS_ICON: Record<IndicatorKey | "none", { icon: IconName; color: string }> = {
  surplus: { icon: "plan", color: "var(--naranja)" }, debt: { icon: "receipt", color: "var(--naranja)" }, emergency: { icon: "shield", color: "var(--teal)" },
  saving: { icon: "target", color: "var(--amarillo-oscuro)" }, dependency: { icon: "users", color: "var(--azul)" }, none: { icon: "spark", color: "var(--amarillo-oscuro)" },
};

export default async function DiagnosticoPage() {
  const s = await requireUser();
  const m = M[s.locale];
  // Mes del diagnóstico: el último cierre (no reabierto) si existe; si no, el mes en curso.
  const last = must(await s.supabase.from("month_closures").select("year, month").is("reopened_at", null).order("year", { ascending: false }).order("month", { ascending: false }).limit(1))[0];
  const year = last?.year ?? s.year, month = last?.month ?? s.month;
  const [input, plan, countriesRes] = await Promise.all([
    loadDiagnosticInput(s, year, month), loadPlan(s, year),
    s.supabase.from("countries").select("code, benchmarks").in("code", [s.profile.country, "OTHER"]),
  ]);
  const fundMarked = input.hasEmergencyFund;
  const countries = must(countriesRes);
  const b = benchmarksFrom((countries.find((c) => c.code === s.profile.country) ?? countries.find((c) => c.code === "OTHER"))?.benchmarks);
  const eyebrow = fill(last ? m.eyebrowClosed : m.eyebrowPlan, { month: monthName(month, s.locale), year });
  // Encabezado propio: título largo en escritorio y corto en móvil (PageHeader solo acepta un título)
  const header = (
    <header className={css.head}>
      <div>
        <span className="muted" style={{ fontSize: 14 }}>{eyebrow}</span>
        <h1><span className="only-desktop">{m.title}</span><span className="only-mobile">{m.titleShort}</span></h1>
      </div>
      <Link href="/inicio" className="btn only-desktop">{m.goHome}</Link>
    </header>
  );

  if (!canDiagnose(plan.lines.length, input.incomeCents)) {
    return (
      <main className="page">
        {header}
        <Empty icon="spark" title={m.emptyTitle} text={m.emptyText}><Link href="/asistente" className="btn btn-secondary btn-sm">{m.emptyCta}</Link></Empty>
        <Disclaimer text={`${s.t.disclaimer} ${m.footer}`} />
      </main>
    );
  }

  const ind = withFundState(diagnose(input, b), fundMarked);
  const pr = priority(ind);
  const money = (c: number) => formatMoney(c, s.fmt);

  // Nombres reales del plan para las notas (nunca "sueldo" fijo)
  const map = cellMap(plan.cells);
  const cat = new Map(plan.categories.map((c) => [c.id, c]));
  const incomeLines = plan.lines.filter((l) => l.kind === "income").map((l) => ({ name: l.name, cents: cellOf(map, l.id, month) })).sort((a, z) => z.cents - a.cents);
  const mainIncome = incomeLines[0]?.name ?? "";
  const debtNames = plan.lines.filter((l) => l.kind === "expense" && cat.get(l.categoryId)?.kind === "debt" && cellOf(map, l.id, month) > 0).map((l) => l.name);
  const surplusCents = input.incomeCents - input.expenseCents;

  const note: Record<IndicatorKey, string> = {
    surplus: fill(surplusCents < 0 ? m.note.surplusNeg : m.note.surplusPos, { amount: money(Math.abs(surplusCents)) }),
    saving: input.savingCents > 0 ? fill(m.note.saving, { amount: money(input.savingCents) }) : m.note.savingNone,
    debt: input.debtPaymentsCents > 0 ? (debtNames.length ? fill(m.note.debt, { amount: money(input.debtPaymentsCents), names: joinNames(debtNames, m.and) }) : fill(m.note.debtSimple, { amount: money(input.debtPaymentsCents) })) : m.note.debtNone,
    emergency: input.basicExpensesCents <= 0 ? m.note.emergencyNoBasic
      : fundMarked ? fill(m.note.emergency, { fund: money(input.emergencyFundCents), basic: money(input.basicExpensesCents) })
      : fill(m.note.emergencyNoFund, { basic: money(input.basicExpensesCents) }),
    dependency: fill(m.note.dependency, { amount: money(input.largestIncomeCents), total: money(input.incomeCents) }),
  };

  const focusKey = pr ?? "none";
  const byKey = new Map(ind.map((i) => [i.key, i]));
  const pctOf = (k: IndicatorKey) => { const v = byKey.get(k)?.value; return v === null || v === undefined ? "—" : pctText(v); };
  const focusText = fill(m.focus[focusKey].text, {
    good: pr ? referenceVars(pr, b).good : "", amount: money(input.debtPaymentsCents), pct: pr === "dependency" ? pctText(byKey.get("dependency")?.value ?? 0, 0) : pr ? pctOf(pr) : "", name: mainIncome,
  });
  const focusHref = focusKey === "debt" ? (s.config.menu.deudas === "on" ? "/deudas" : "/plan")
    : focusKey === "emergency" ? (s.config.menu.metas === "on" ? "/metas?nueva=1" : "/cuentas")
    : focusKey === "none" ? (s.config.menu.cierre === "on" ? "/cierre" : "/plan") : "/plan";
  const summary = m.summary[focusKey];

  // Imán de clientes: alumno → su curso (según /admin/menu: automático, fijo o nada); si no, la clase gratuita.
  const student = s.entitlement.state === "alumno" || s.entitlement.state === "fundador";
  const lead = s.config.diagCta.lead, stu = s.config.diagCta.student;
  const step = studentStep({ student, mode: stu.mode, course: stu.course });
  const COURSE_COLS = "slug, number, title, description, cover_url";
  // Curso fijo: solo si sigue publicado; si no, se cae al automático.
  const fixedCourse = step.fixedSlug
    ? must(await s.supabase.from("courses").select(COURSE_COLS).eq("status", "published").eq("slug", step.fixedSlug).limit(1))[0] ?? null
    : null;
  const course = fixedCourse ?? (step.show && pr
    ? must(await s.supabase.from("courses").select(COURSE_COLS).eq("status", "published").eq("priority", pr).order("sort").limit(1))[0] ?? null
    : null);
  const showLead = !student && !!lead.title;
  const focusName = pr ? m.name[pr].toLowerCase() : "";

  return (
    <main className="page">
      {header}

      <section aria-label={m.summaryLabel} className={css.summary}>
        <div>
          <span className="small muted only-desktop">{m.summaryLabel}</span>
          <p className={css.summaryText}>{summary.pre}<span className={css.hl}>{summary.hl}</span>{summary.post}</p>
        </div>
        <div className={css.counts}>
          {levelCounts(ind).map((c) => {
            const t = TONE[levelTone(c.level)];
            return <span key={c.level} className={css.count} style={{ background: t.bg, color: t.fg }}>{fill(m.count[c.level], { n: c.n })}</span>;
          })}
        </div>
      </section>

      <div className={css.grid}>
        {ind.map((i) => {
          const t = TONE[levelTone(i.level as Level)];
          const isPr = i.key === pr;
          return (
            <article key={i.key} className={css.card} data-priority={isPr}>
              <div className={css.cardHead}>
                <h3 style={{ fontSize: 15 }}>{m.name[i.key]}</h3>
                <span className={css.pills}>
                  {isPr ? <span className={`${css.level} pill-dark`}>{m.priorityPill}</span> : null}
                  <span className={css.level} style={{ background: t.bg, color: t.fg }}>{m.level[i.level]}</span>
                </span>
              </div>
              <div className={css.value}>
                <span className="num big">{valueText(i)}</span>
                <span className={css.unit}>{fill(m.unit[i.key], { name: mainIncome })}</span>
              </div>
              <span className={css.ref}>{fill(m.ref[i.key], referenceVars(i.key, b))}</span>
              <span className={css.note}>{note[i.key]}</span>
            </article>
          );
        })}
      </div>

      <h2 className={css.h2}>{m.focusTitle}</h2>
      <article className={css.focus}>
        <span aria-hidden="true" className={css.focusIcon}><Icon name={FOCUS_ICON[focusKey].icon} size={21} color={FOCUS_ICON[focusKey].color} /></span>
        <div className={css.focusBody}>
          <h3>{m.focus[focusKey].title}</h3>
          <p>{focusText}</p>
          <Link href={focusHref}>{m.focus[focusKey].cta}</Link>
        </div>
      </article>

      {showLead || step.show ? <section aria-label={m.nextStep} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {showLead ? (
          <div className={css.lead}>
            <div className={css.brand}><Image src="/brand/sello.png" alt="" width={44} height={44} /><span>{m.brand}</span></div>
            <h2 className={css.leadTitle}>{lead.title}</h2>
            {lead.text ? <p className={css.leadText}>{lead.text}</p> : null}
            {lead.url && lead.button ? <a href={lead.url} className={css.leadBtn} target="_blank" rel="noopener noreferrer">{lead.button}</a> : null}
          </div>
        ) : null}
        {step.show ? (
          <Link href={course ? `/academia/${encodeURIComponent(course.slug)}` : "/academia"} className={css.student}>
            {course?.cover_url ? <Image src={course.cover_url} alt="" width={160} height={90} unoptimized className={css.cover} /> : null}
            <span className={css.studentBody}>
              {fixedCourse ? <span className={css.eyebrow2}>{fill(m.studentEyebrowFixed, { n: String(fixedCourse.number).padStart(2, "0") })}</span>
                : pr ? <span className={css.eyebrow2}>{course ? fill(m.studentEyebrow, { focus: focusName, n: String(course.number).padStart(2, "0") }) : fill(m.studentEyebrowNoCourse, { focus: focusName })}</span> : null}
              <strong>{course?.title || stu.title || m.studentTitle}</strong>
              <span className={css.txt}>{course?.description || stu.text || m.studentText}</span>
              <span className={css.go}>{course ? `${stu.button || m.studentCta.replace(" ›", "")} ›` : m.studentCta}</span>
            </span>
          </Link>
        ) : null}
      </section> : null}

      <Disclaimer text={`${s.t.disclaimer} ${m.footer}`} />
    </main>
  );
}
