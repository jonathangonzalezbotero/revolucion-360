import "server-only";
import { daysInMonth, parts } from "@/lib/engine";
import type { Session } from "./session";

export type ClosureTarget = { year: number; month: number; daysLeft: number; overdue: boolean; progress: number };

/**
 * Qué mes toca cerrar:
 * - el mes anterior si no se cerró (y el usuario ya existía ese mes) → atrasado
 * - si no, el mes en curso durante sus últimos 10 días
 */
export async function closureTarget(s: Session): Promise<ClosureTarget | null> {
  if (s.config.menu.cierre !== "on") return null;
  const { d } = parts(s.today);
  const prev = s.month === 1 ? { year: s.year - 1, month: 12 } : { year: s.year, month: s.month - 1 };
  const { data } = await s.supabase.from("month_closures").select("year, month, reopened_at")
    .or(`and(year.eq.${prev.year},month.eq.${prev.month}),and(year.eq.${s.year},month.eq.${s.month})`);
  const closed = (y: number, m: number) => (data ?? []).some((r) => r.year === y && r.month === m && !r.reopened_at);
  const created = parts(s.profile.createdAt.slice(0, 10));
  const existedPrev = created.y < prev.year || (created.y === prev.year && created.m <= prev.month);
  if (existedPrev && !closed(prev.year, prev.month)) return { ...prev, daysLeft: 0, overdue: true, progress: 1 };
  const dim = daysInMonth(s.year, s.month);
  const daysLeft = dim - d;
  if (daysLeft <= 9 && !closed(s.year, s.month)) return { year: s.year, month: s.month, daysLeft, overdue: false, progress: d / dim };
  return null;
}

export async function isMonthClosed(s: Session, year: number, month: number): Promise<boolean> {
  const { data } = await s.supabase.from("month_closures").select("reopened_at").eq("year", year).eq("month", month).maybeSingle();
  return !!data && !data.reopened_at;
}
