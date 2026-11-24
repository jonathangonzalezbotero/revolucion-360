// Puntos, niveles y racha. Solo premian buen comportamiento financiero.
import { addDays, type ISODate } from "./dates";

export type LevelDef = { name: string; min: number };
export const DEFAULT_LEVELS: LevelDef[] = [
  { name: "Despertar", min: 0 }, { name: "Orden", min: 300 }, { name: "Ahorro", min: 500 },
  { name: "Inversión", min: 1000 }, { name: "Revolucionario", min: 2000 },
];

export function levelFor(points: number, levels: LevelDef[] = DEFAULT_LEVELS) {
  const sorted = [...levels].sort((a, b) => a.min - b.min);
  let idx = 0;
  sorted.forEach((l, i) => { if (points >= l.min) idx = i; });
  const current = sorted[idx], next = sorted[idx + 1] ?? null;
  const progress = next ? (points - current.min) / (next.min - current.min) : 1;
  return { index: idx + 1, total: sorted.length, name: current.name, next: next?.name ?? null, toNext: next ? next.min - points : 0, progress: Math.min(1, Math.max(0, progress)) };
}

export type WeekRow = { weekStart: ISODate; wildcard: boolean };
export type Streak = { weeks: number; thisWeekCounts: boolean; wildcardAvailable: boolean; missedWeek: ISODate | null };

/**
 * Racha semanal (lunes a domingo). Una semana cuenta con al menos una acción válida.
 * La semana en curso no rompe la racha aunque aún no tenga acción.
 * `missedWeek` es la semana pasada sin acción que un comodín (1 por mes calendario) puede salvar.
 */
export function streak(rows: WeekRow[], currentWeekStart: ISODate): Streak {
  const set = new Map(rows.map((r) => [r.weekStart, r]));
  const thisWeekCounts = set.has(currentWeekStart);
  let weeks = 0;
  let cursor = thisWeekCounts ? currentWeekStart : addDays(currentWeekStart, -7);
  while (set.has(cursor)) { weeks++; cursor = addDays(cursor, -7); }
  const month = currentWeekStart.slice(0, 7);
  const wildcardUsedThisMonth = rows.some((r) => r.wildcard && r.weekStart.slice(0, 7) === month);
  const lastWeek = addDays(currentWeekStart, -7);
  const missed = !set.has(lastWeek) && set.has(addDays(lastWeek, -7)) ? lastWeek : null;
  return { weeks, thisWeekCounts, wildcardAvailable: !wildcardUsedThisMonth, missedWeek: missed };
}

export const BADGES = ["play", "grid", "check", "flame", "unlock", "shield", "flag", "cap", "sprout", "star"] as const;
export type BadgeKey = (typeof BADGES)[number];

export type BadgeFacts = {
  lessonsDone: number; planBuilt: boolean; closures: number; consecutiveClosures: number; debtsPaid: number;
  emergencyFundCents: number; basicExpensesCents: number; goalsDone: number; bestGoalProgress: number;
  coursesDone: number; bestCourseProgress: number; investments: number;
};
/** Avance de cada insignia (0 a 1). 1 = ganada. */
export function badgeProgress(f: BadgeFacts): Record<BadgeKey, number> {
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  return {
    play: f.lessonsDone > 0 ? 1 : 0,
    grid: f.planBuilt ? 1 : 0,
    check: f.closures > 0 ? 1 : 0,
    flame: clamp(f.consecutiveClosures / 3),
    unlock: f.debtsPaid > 0 ? 1 : 0,
    shield: f.basicExpensesCents > 0 ? clamp(f.emergencyFundCents / f.basicExpensesCents) : 0,
    flag: f.goalsDone > 0 ? 1 : clamp(f.bestGoalProgress),
    cap: f.coursesDone > 0 ? 1 : clamp(f.bestCourseProgress),
    sprout: f.investments > 0 ? 1 : 0,
    star: clamp(f.consecutiveClosures / 12),
  };
}

/** Meses cerrados seguidos terminando en el último cierre ("YYYY-MM"). */
export function consecutiveClosures(closed: string[]): number {
  if (closed.length === 0) return 0;
  const s = [...new Set(closed)].sort();
  let n = 1;
  for (let i = s.length - 1; i > 0; i--) {
    const [y, m] = s[i].split("-").map(Number);
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
    if (s[i - 1] === prev) n++; else break;
  }
  return n;
}
