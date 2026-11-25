import "server-only";
import type { Session } from "./session";
import { weekStart, type BadgeKey } from "@/lib/engine";

export type PointKind = "lesson" | "course" | "closure" | "debt_paid" | "goal_done" | "goal_contrib" | "week_active" | "first_step"
  | "goal_milestone" | "goal_used" | "goal_leftover"; // metas amables (20261125000031_metas.sql)

/** Suma puntos por un hecho real (la base de datos lo valida y nunca los da dos veces). Devuelve los puntos ganados. */
export async function award(s: Session, kind: PointKind, ref: string): Promise<number> {
  if (!s.config.gamification) return 0;
  const { data } = await s.supabase.rpc("award_points", { p_kind: kind, p_ref: ref });
  return typeof data === "number" ? data : 0;
}

const BADGE_NAMES: Record<BadgeKey, { es: string; en: string }> = {
  play: { es: "Primera clase", en: "First lesson" }, grid: { es: "Plan armado", en: "Plan built" }, check: { es: "Primer cierre", en: "First month close" },
  flame: { es: "3 cierres seguidos", en: "3 closes in a row" }, unlock: { es: "Primera deuda saldada", en: "First debt paid off" },
  shield: { es: "Colchón de 1 mes", en: "1-month cushion" }, flag: { es: "Meta cumplida", en: "Goal reached" }, cap: { es: "Curso completado", en: "Course completed" },
  sprout: { es: "Primera inversión", en: "First investment" }, star: { es: "Un año en orden", en: "A year in order" },
};
export const badgeName = (b: BadgeKey, locale: "es" | "en") => BADGE_NAMES[b][locale];

/** Intenta otorgar una insignia. Si la gana, deja la notificación. Devuelve true solo la primera vez. */
export async function tryBadge(s: Session, badge: BadgeKey): Promise<boolean> {
  if (!s.config.gamification) return false;
  const { data } = await s.supabase.rpc("award_badge", { p_badge: badge });
  if (data === true) {
    const name = badgeName(badge, s.locale);
    await notify(s, "logro", s.locale === "en" ? `New badge: ${name}` : `Nueva insignia: ${name}`, "", "/perfil#insignias", `badge-${badge}`);
    return true;
  }
  return false;
}

/** Registra que esta semana (lunes a domingo, en la zona horaria del usuario) cuenta para la racha. */
export async function touchWeek(s: Session): Promise<void> {
  const week = weekStart(s.today);
  await s.supabase.rpc("touch_week", { p_week_start: week });
  await award(s, "week_active", week);
}

export async function notify(s: Session, kind: string, title: string, body: string, href: string | null, dedupe: string): Promise<void> {
  await s.supabase.rpc("notify_me", { p_kind: kind, p_title: title, p_body: body, p_href: href ?? "", p_dedupe: dedupe });
}

/** Eventos del embudo del producto (sin montos). */
export async function track(s: Session, name: string): Promise<void> {
  await s.supabase.from("product_events").insert({ user_id: s.userId, name });
}

/** Marca uno de los 4 primeros pasos del usuario nuevo y da sus puntos una sola vez. */
export async function firstStep(s: Session, step: "plan" | "cuenta" | "gasto" | "clase"): Promise<number> {
  if (s.profile.firstSteps[step]) return 0;
  await s.supabase.from("profiles").update({ first_steps: { ...s.profile.firstSteps, [step]: true } }).eq("id", s.userId);
  return award(s, "first_step", step);
}
