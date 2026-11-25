import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_LEVELS, DEFAULT_MATCH, type FeatureConfig, type LevelDef, type MatchConfig, type MenuState } from "@/lib/engine";

export type MenuKey = "plan" | "movimientos" | "cuentas" | "metas" | "proyeccion" | "analisis" | "deudas" | "inversiones" | "academia" | "cierre";
export type AppConfig = {
  menu: Record<MenuKey, MenuState>;
  features: FeatureConfig;
  flags: { csv: boolean; comercios: boolean; remesas: boolean; multimoneda: boolean };
  limits: { free_goals: number };
  points: Record<string, number>;
  levels: LevelDef[];
  trial: { enabled: boolean; days: number };
  matching: MatchConfig;
  gamification: boolean;
  // student.mode: 'auto' = el curso que ataca la prioridad · 'course' = el curso fijo `course` (slug) · 'none' = nada. Sin mode = 'auto'.
  diagCta: { lead: { title: string; text: string; url: string; button: string }; student: { title: string; text: string; button: string; mode: DiagStudentMode; course: string } };
  legal: { company: string; abn: string; contact: string; updated: string };
};

const DEFAULTS: AppConfig = {
  menu: { plan: "on", movimientos: "on", cuentas: "on", metas: "on", proyeccion: "on", analisis: "on", deudas: "on", inversiones: "on", academia: "on", cierre: "on" },
  features: {},
  flags: { csv: true, comercios: true, remesas: true, multimoneda: false },
  limits: { free_goals: 2 },
  points: { lesson: 10, course: 50, closure: 30, debt_paid: 50, goal_done: 100, goal_contrib: 5, week_active: 5, first_step: 10 },
  levels: DEFAULT_LEVELS,
  trial: { enabled: true, days: 14 },
  matching: DEFAULT_MATCH,
  gamification: true,
  diagCta: { lead: { title: "", text: "", url: "", button: "" }, student: { title: "", text: "", button: "", mode: "auto", course: "" } },
  legal: { company: "[RAZÓN SOCIAL]", abn: "[ABN]", contact: "[CORREO DE CONTACTO]", updated: "[FECHA]" },
};

export type DiagStudentMode = "auto" | "course" | "none";
/** `diag_cta` guardado → forma completa: mezcla `lead` y `student` por separado (un `student: { mode }` no borra sus textos). */
function diagCtaFrom(raw: unknown): AppConfig["diagCta"] {
  const o = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
  const str = (x: unknown) => (typeof x === "string" ? x : "");
  const lead = o(o(raw).lead), stu = o(o(raw).student);
  const mode: DiagStudentMode = stu.mode === "course" || stu.mode === "none" ? stu.mode : "auto";
  return {
    lead: { title: str(lead.title), text: str(lead.text), url: str(lead.url), button: str(lead.button) },
    student: { title: str(stu.title), text: str(stu.text), button: str(stu.button), mode, course: str(stu.course) },
  };
}

/** Configuración que el admin edita en /admin. Se lee una vez por petición. */
export const getConfig = cache(async (): Promise<AppConfig> => {
  const supabase = await createClient();
  const { data } = await supabase.from("app_config").select("key, value");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v: Record<string, any> = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  const m = v.matching as { amount_pct?: number; days?: number; duplicate_days?: number } | undefined;
  return {
    menu: { ...DEFAULTS.menu, ...(v.menu ?? {}) },
    features: { ...(v.features ?? {}) },
    flags: { ...DEFAULTS.flags, ...(v.flags ?? {}) },
    limits: { ...DEFAULTS.limits, ...(v.limits ?? {}) },
    points: { ...DEFAULTS.points, ...(v.points ?? {}) },
    levels: Array.isArray(v.levels) && v.levels.length ? v.levels : DEFAULTS.levels,
    trial: { ...DEFAULTS.trial, ...(v.trial ?? {}) },
    matching: { amountPct: m?.amount_pct ?? 5, days: m?.days ?? 5, duplicateDays: m?.duplicate_days ?? 2 },
    gamification: v.gamification_enabled !== false,
    diagCta: diagCtaFrom(v.diag_cta),
    legal: { ...DEFAULTS.legal, ...(v.legal ?? {}) },
  };
});
