import Image from "next/image";
import { fill } from "@/i18n";
import type { BadgeKey, LevelDef } from "@/lib/engine";
import type { PerfilMessages } from "./messages";
import { WildcardButton } from "./Forms";
import css from "./perfil.module.css";
import { badgeSrc } from "@/lib/images";

export type BadgeView = { key: BadgeKey; earned: string | null; progress: number | null; hint: string };
export type LevelView = { index: number; total: number; name: string; next: string | null; toNext: number; progress: number };
export type StreakView = { weeks: number; thisWeekCounts: boolean; wildcardAvailable: boolean; missedWeek: string | null; missedLabel: string };

const EARN_KEYS = ["lesson", "course", "closure", "debt_paid", "goal_done", "goal_contrib", "week_active"] as const;

/** Nivel, racha, insignias y puntos. Todo en amarillo (nunca verde): son logros, no dinero. */
export function Achievements({ m, points, level, levels, streak, badges, pointValues, canUseWildcard }: {
  m: PerfilMessages; points: number; level: LevelView; levels: LevelDef[]; streak: StreakView; badges: BadgeView[]; pointValues: Record<string, number>; canUseWildcard: boolean;
}) {
  const pct = Math.round(level.progress * 100);
  const got = badges.filter((b) => b.earned).length;
  const streakTitle = streak.weeks === 0 ? m.streak.titleZero : streak.weeks === 1 ? m.streak.titleOne : fill(m.streak.title, { n: streak.weeks });
  const sorted = [...levels].sort((a, b) => a.min - b.min);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <section aria-label={m.level.label} id="nivel" className={css.levelBand}>
        <span role="img" aria-label={level.next ? fill(m.level.aria, { n: level.index, total: level.total, pct, next: level.index + 1 }) : fill(m.level.ariaMax, { n: level.index, total: level.total })}
          className={css.levelRing} style={{ background: `conic-gradient(var(--amarillo) 0 ${pct}%, var(--linea) ${pct}% 100%)` }}>
          <span className={css.levelHole}><span className={`big ${css.levelNum}`}>{level.index}</span><span className={css.levelOf}>{fill(m.level.of, { n: level.total })}</span></span>
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 160px" }}>
          <span className={css.levelLabel}>{m.level.label.toUpperCase()}</span>
          <strong style={{ fontSize: 24 }}>{level.name}</strong>
          <span className="muted" style={{ fontSize: 14 }}><strong className="num" style={{ color: "var(--tinta)" }}>{points.toLocaleString("en-US")}</strong> {m.level.points}</span>
        </div>
        <div style={{ flex: "2 1 220px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div aria-hidden="true" className={css.levelTrack}><span style={{ width: `${pct}%` }} /></div>
          <span className="muted" style={{ fontSize: 13 }}>{level.next ? <>{m.level.toNextA} <strong style={{ color: "var(--tinta)" }}>{level.toNext.toLocaleString("en-US")}</strong> {m.level.toNextB} <strong style={{ color: "var(--tinta)" }}>{level.next}</strong></> : m.level.max}</span>
        </div>
        <div id="racha" className={css.streak}>
          <span aria-hidden="true" className={css.flame}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--amarillo)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3c.5 3.5 4.5 5.5 4.5 10a4.5 4.5 0 0 1-9 0c0-2 1-3.4 2-4.4.2 1.7 1 2.7 2 3.2-.4-3.3.1-6.2.5-8.8z" /></svg>
          </span>
          <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <strong style={{ fontSize: 15 }}>{streakTitle}</strong>
            <span className="xs" style={{ color: "var(--amarillo-texto)" }}>{streak.thisWeekCounts ? m.streak.counts : m.streak.notYet} · {streak.wildcardAvailable ? m.streak.wildcard : m.streak.wildcardUsed}</span>
          </span>
        </div>
      </section>

      {streak.missedWeek && streak.wildcardAvailable ? (
        <section aria-labelledby="comodin" className={css.wildcard}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 280px" }}>
            <h2 id="comodin" style={{ fontSize: 16 }}>{m.streak.missedTitle}</h2>
            <span style={{ fontSize: 14, lineHeight: 1.5 }}>{fill(m.streak.missedText, { date: streak.missedLabel })}</span>
          </div>
          {canUseWildcard ? <WildcardButton week={streak.missedWeek} m={m} /> : null}
        </section>
      ) : null}

      <div className={css.logrosGrid}>
        <section aria-labelledby="insignias-t" id="insignias" className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 id="insignias-t" style={{ fontSize: 17 }}>{m.badges} <span className="muted" style={{ fontSize: 13 }}>{fill(m.badgesCount, { n: got, total: badges.length })}</span></h2>
          <ul className={css.badges}>
            {badges.map((b) => {
              const t = m.badge[b.key];
              return (
                <li key={b.key} className={css.badge}>
                  <Image src={badgeSrc(b.key)} alt="" width={76} height={76} className={css.badgeImg} style={b.earned ? undefined : { filter: "grayscale(1)", opacity: 0.45 }} />
                  <strong style={{ fontSize: 13, color: b.earned ? "var(--tinta)" : "var(--gris-3)" }}>{t.t}</strong>
                  <span className={css.badgeDesc}>{t.d}</span>
                  {b.earned ? <span className={`pill pill-yellow ${css.earned}`}>{fill(m.earned, { date: b.earned })}</span> : (
                    <>
                      {b.progress !== null ? <div aria-hidden="true" className={css.badgeTrack}><span style={{ width: `${Math.round(b.progress * 100)}%` }} /></div> : null}
                      {b.hint ? <span className={css.badgeHint}>{b.hint}</span> : null}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        <div className="stack" style={{ gap: 16 }}>
          <section aria-labelledby="ganar" className="card" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <h2 id="ganar" style={{ fontSize: 16, marginBottom: 8 }}>{m.earn}</h2>
            {EARN_KEYS.filter((k) => (pointValues[k] ?? 0) > 0).map((k) => (
              <div key={k} className={css.earnRow}><span>{m.earnItems[k]}</span><span className="pill pill-yellow num">+{pointValues[k]}</span></div>
            ))}
          </section>
          <section aria-labelledby="niveles" className="card" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <h2 id="niveles" style={{ fontSize: 16, marginBottom: 8 }}>{m.levels}</h2>
            {sorted.map((l, i) => {
              const cur = i + 1 === level.index, reached = i + 1 <= level.index;
              return (
                <div key={l.name} className={css.levelRow} aria-current={cur ? "true" : undefined} style={{ background: cur ? "var(--amarillo-pastel)" : "transparent", fontWeight: cur ? 600 : 450, color: reached ? "var(--tinta)" : "var(--gris-4)" }}>
                  <span>{l.name}</span><span className="num xs muted">{l.min.toLocaleString("en-US")}+</span>
                </div>
              );
            })}
          </section>
        </div>
      </div>
    </div>
  );
}
