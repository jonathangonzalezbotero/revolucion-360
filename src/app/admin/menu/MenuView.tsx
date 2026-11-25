"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { fill } from "@/i18n";
import { Switch, useToast } from "@/components/ui/client";
import { Icon } from "@/components/ui/Icon";
import type { MenuState } from "@/lib/engine";
import adm from "../_shared/admin.module.css";
import { AdminHeader } from "../_shared/ui";
import { saveDiagStudent, saveMenuConfig } from "./actions";
import { FLAG_KEYS, INNER_FEATURES, MAX_LEVELS, MENU_KEYS, MENU_STATES, POINT_KEYS, SECTION_FEATURE, STUDENT_MODES, formToValues, menuPreview, sameJson, touchedKeys, type MenuForm, type StudentForm, type StudentMode } from "./lib";
import type { MenuText } from "./messages";
import css from "./menu.module.css";

type SectionKey = (typeof MENU_KEYS)[number];

export function MenuView({ m, names, initial, aal2, student, courses }: {
  m: MenuText; names: Record<"inicio" | SectionKey, string>; initial: MenuForm; aal2: boolean; student: StudentForm; courses: { slug: string; label: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [f, setF] = useState<MenuForm>(initial);
  const [error, setError] = useState<string | null>(null);
  const [st, setSt] = useState<StudentForm>(student);
  const menuDirty = !sameJson(f, initial);
  // El curso fijo solo cuenta como cambio si el modo es "Un curso fijo".
  const stDirty = st.mode !== student.mode || (st.mode === "course" && st.course !== student.course);
  const dirty = menuDirty || stDirty;
  // Un curso guardado que ya no existe se sigue mostrando como opción (para no cambiarlo sin querer).
  const courseOptions = student.course && !courses.some((x) => x.slug === student.course) ? [...courses, { slug: student.course, label: fill(m.courseMissing, { slug: student.course }) }] : courses;
  const preview = useMemo(() => menuPreview(f.menu, f.features), [f.menu, f.features]);
  const radios = useRef<Record<string, HTMLButtonElement | null>>({});
  const mfaBlocked = f.adminMfa && !initial.adminMfa && !aal2;

  const set = <K extends keyof MenuForm>(k: K, v: MenuForm[K]) => { setError(null); setF((x) => ({ ...x, [k]: v })); };
  const pickState = (k: SectionKey, v: MenuState) => set("menu", { ...f.menu, [k]: v });
  const onStateKey = (k: SectionKey, e: React.KeyboardEvent) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const i = MENU_STATES.indexOf(f.menu[k]);
    const next = MENU_STATES[(i + d + MENU_STATES.length) % MENU_STATES.length];
    pickState(k, next);
    radios.current[`${k}-${next}`]?.focus();
  };
  const togglePlan = (fk: keyof MenuForm["features"]) => set("features", { ...f.features, [fk]: f.features[fk] === "pro" ? "free" : "pro" });

  const save = () => {
    if (menuDirty && mfaBlocked) { setError(m.errors.mfa); return; }
    const r = formToValues(f);
    if (menuDirty && !r.ok) {
      const msg = r.error === "points" ? fill(m.errors.points, { name: m.pointItems[r.field as keyof typeof m.pointItems] ?? "" }) : m.errors[r.error];
      setError(msg); toast(msg); return;
    }
    if (stDirty && st.mode === "course" && !st.course) { setError(m.errors.studentCourse); toast(m.errors.studentCourse); return; }
    start(async () => {
      setError(null);
      let changed = 0;
      if (menuDirty) {
        const res = await saveMenuConfig({ form: f, initial, keys: touchedKeys(initial, f) });
        if (!res.ok) { setError(res.error); toast(res.error); return; }
        changed += res.data.changed;
      }
      if (stDirty) {
        const res = await saveDiagStudent(st);
        if (!res.ok) { setError(res.error); toast(res.error); if (changed) router.refresh(); return; }
        changed += res.data.changed;
      }
      if (!changed) { setF(initial); setSt(student); toast(m.nothing); return; }
      toast(m.saved);
      router.refresh();
    });
  };

  const planButton = (fk: keyof MenuForm["features"], name: string) => {
    const pro = f.features[fk] === "pro";
    const label = pro ? m.pro : m.free;
    return (
      <button type="button" className={css.plan} aria-pressed={pro} aria-label={fill(m.planOf, { name, plan: label })} onClick={() => togglePlan(fk)}>{label}</button>
    );
  };

  return (
    <>
      <AdminHeader eyebrow={m.eyebrow} title={m.title}>
        <span className={css.status}>
          {dirty ? <><span role="status">{m.dirty}</span><button type="button" className={`btn btn-ghost btn-sm ${css.small}`} onClick={() => { setError(null); setF(initial); setSt(student); }}>{m.undo}</button></> : null}
          <button type="button" className="btn" disabled={busy || !dirty} onClick={save}>{busy ? m.saving : m.save}</button>
        </span>
      </AdminHeader>
      {error ? <p role="alert" className={adm.err}>{error}</p> : null}

      <div className={css.layout}>
        <div className={css.mainCol}>
          {/* ── Secciones del menú ── */}
          <section aria-labelledby="secs" className={css.card}>
            <h2 id="secs">{m.sections}</h2>
            <div className={css.head}><span>{m.alwaysHome}</span><span>{m.colHead}</span></div>
            {MENU_KEYS.map((k) => {
              const fk = SECTION_FEATURE[k];
              return (
                <div key={k} className={css.row}>
                  <strong className={css.name}>{names[k]}</strong>
                  <div role="radiogroup" aria-label={fill(m.stateOf, { name: names[k] })} className={css.states}>
                    {MENU_STATES.map((v) => {
                      const on = f.menu[k] === v;
                      return (
                        <button key={v} ref={(el) => { radios.current[`${k}-${v}`] = el; }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} data-v={v}
                          className={css.state} onClick={() => pickState(k, v)} onKeyDown={(e) => onStateKey(k, e)}>{m.states[v]}</button>
                      );
                    })}
                  </div>
                  {fk ? planButton(fk, names[k]) : <span className={css.planFixed}><span aria-hidden="true">{m.free}</span><span className="sr-only">{fill(m.alwaysFree, { name: names[k] })}</span></span>}
                </div>
              );
            })}
            <p className={css.help}>
              <strong>{m.helpSoonL}</strong> {m.helpSoon} <strong>{m.helpOffL}</strong> {m.helpOff} <strong>{m.helpPlanL}</strong> {m.helpPlan}
            </p>
          </section>

          {/* ── Funciones dentro de las secciones (Gratis o Pro) ── */}
          <section aria-labelledby="inner" className={css.card}>
            <h2 id="inner">{m.inner}</h2>
            <p className={css.cardSub}>{m.innerSub}</p>
            {INNER_FEATURES.map((k) => (
              <div key={k} className={css.row}>
                <span className={css.nameCol}><strong>{m.innerItems[k][0]}</strong><span>{m.innerItems[k][1]}</span></span>
                {planButton(k, m.innerItems[k][0])}
              </div>
            ))}
          </section>

          {/* ── Funciones encendidas o apagadas ── */}
          <section aria-labelledby="flags" className={css.card}>
            <h2 id="flags">{m.flags}</h2>
            {FLAG_KEYS.map((k) => (
              <div key={k} className={css.switchRow}>
                <span className={css.nameCol}><strong>{m.flagItems[k][0]}</strong><span>{m.flagItems[k][1]}</span></span>
                <Switch checked={f.flags[k]} label={m.flagItems[k][0]} onChange={(v) => set("flags", { ...f.flags, [k]: v })} />
              </div>
            ))}
          </section>

          {/* ── Siguiente paso al final del Diagnóstico ── */}
          <section aria-labelledby="cta" className={`${css.card} ${css.ctaCard}`}>
            <h2 id="cta">{m.cta}</h2>
            <p className={css.cardSub}>{m.ctaSub}</p>
            <div className={css.ctaBlock}>
              <strong>{m.ctaLead}</strong>
              <span className={css.ctaNote}>{m.ctaLeadNote} <Link href="/admin/paises">{m.ctaLeadLink}</Link></span>
            </div>
            <div className={css.ctaBlock}>
              <strong>{m.ctaStudent}</strong>
              <label htmlFor="cta-s" className="label">{m.ctaShow}</label>
              <select id="cta-s" className="select" value={st.mode} onChange={(e) => { setError(null); const mode = e.target.value as StudentMode; setSt({ mode, course: mode === "course" && !st.course ? courseOptions[0]?.slug ?? "" : st.course }); }}>
                {STUDENT_MODES.map((k) => <option key={k} value={k}>{m.ctaModes[k]}</option>)}
              </select>
              {st.mode === "course" ? (
                courseOptions.length ? <>
                  <label htmlFor="cta-c" className="label">{m.ctaCourse}</label>
                  <select id="cta-c" className="select" value={st.course} aria-describedby="cta-c-h" onChange={(e) => { setError(null); setSt({ ...st, course: e.target.value }); }}>
                    {courseOptions.map((x) => <option key={x.slug} value={x.slug}>{x.label}</option>)}
                  </select>
                  <span id="cta-c-h" className="hint">{m.ctaCourseHelp}</span>
                </> : <span className={css.ctaNote}>{m.ctaNoCourses} <Link href="/admin/academia">{m.ctaNoCoursesLink}</Link></span>
              ) : null}
            </div>
          </section>

          {/* ── Plan Gratis, logros y seguridad ── */}
          <section aria-labelledby="rules" className={css.card}>
            <h2 id="rules">{m.rules}</h2>
            <div className={css.switchRow}>
              <span className={css.nameCol}><label htmlFor="free-goals" style={{ fontSize: 14, fontWeight: 600 }}>{m.freeGoals}</label><span id="free-goals-sub">{m.freeGoalsSub}</span></span>
              <input id="free-goals" className={`input ${css.numInput}`} inputMode="numeric" aria-describedby="free-goals-sub" maxLength={3} value={f.freeGoals} onChange={(e) => set("freeGoals", e.target.value)} />
            </div>
            <div className={css.switchRow}>
              <span className={css.nameCol}><strong>{m.gamification}</strong><span>{m.gamificationSub}</span></span>
              <Switch checked={f.gamification} label={m.gamification} onChange={(v) => set("gamification", v)} />
            </div>
            <div className={css.switchRow}>
              <span className={css.nameCol}><strong>{m.adminMfa}</strong><span>{m.adminMfaSub}</span></span>
              <Switch checked={f.adminMfa} label={m.adminMfa} onChange={(v) => set("adminMfa", v)} />
            </div>
            {!f.adminMfa ? <p className={css.warn} role="note">{m.adminMfaOff}</p> : null}
            {mfaBlocked ? <p className={css.warn} role="note">{m.adminMfaNeed}</p> : null}
          </section>

          {/* ── Puntos y niveles ── */}
          <section aria-labelledby="pts" className={css.card}>
            <h2 id="pts">{m.points}</h2>
            <p className={css.cardSub}>{m.pointsSub}</p>
            {!f.gamification ? <p className={css.warn} role="note">{m.gamOff}</p> : null}
            <div className={css.pointsGrid}>
              {POINT_KEYS.map((k) => (
                <div key={k} style={{ display: "contents" }}>
                  <label htmlFor={`pt-${k}`}>{m.pointItems[k]}</label>
                  <input id={`pt-${k}`} className={`input ${css.numInput}`} inputMode="numeric" maxLength={5} value={f.points[k]} onChange={(e) => set("points", { ...f.points, [k]: e.target.value })} />
                </div>
              ))}
            </div>
            <div className={css.levels}>
              <span className={css.levelsHead}><strong>{m.levels}</strong><span>{m.levelsSub}</span></span>
              {f.levels.map((l, i) => {
                const n = i + 1;
                const upd = (patch: Partial<{ name: string; min: string }>) => set("levels", f.levels.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <div key={i} className={css.level}>
                    <span className={css.levelN} aria-hidden="true">{n}</span>
                    <input className="input" aria-label={fill(m.levelName, { n })} maxLength={30} value={l.name} onChange={(e) => upd({ name: e.target.value })} />
                    <span className={css.minWrap}>
                      <input className="input" aria-label={fill(m.levelMin, { n })} inputMode="numeric" maxLength={9} value={l.min} onChange={(e) => upd({ min: e.target.value })} />
                      <span aria-hidden="true">{m.pts}</span>
                    </span>
                    <button type="button" className={`btn btn-ghost ${css.iconBtn}`} aria-label={fill(m.removeLevel, { name: l.name || String(n) })} disabled={f.levels.length <= 1}
                      onClick={() => set("levels", f.levels.filter((_, j) => j !== i))}><Icon name="trash" size={16} /></button>
                  </div>
                );
              })}
              {f.levels.length < MAX_LEVELS ? (
                <button type="button" className={`btn btn-dashed btn-sm ${css.small}`} style={{ alignSelf: "flex-start" }} onClick={() => set("levels", [...f.levels, { name: "", min: "" }])}>{m.addLevel}</button>
              ) : null}
            </div>
          </section>
        </div>

        {/* ── Así lo ve un usuario ── */}
        <aside aria-labelledby="prev" className={css.aside}>
          <h2 id="prev">{m.preview}</h2>
          {preview.map((p) => (
            <div key={p.key} className={`${css.pv} ${p.soon ? css.pvSoon : ""}`}>
              <span aria-hidden="true" className={css.dot} />
              <span style={{ flex: 1 }}>{names[p.key]}</span>
              {p.soon ? <span className={css.soonTag}>{m.soon}</span> : null}
              {p.pro ? <span className={css.proTag}>{m.proBadge}</span> : null}
            </div>
          ))}
        </aside>
      </div>
    </>
  );
}
