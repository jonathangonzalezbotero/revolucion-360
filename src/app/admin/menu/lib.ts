// Cálculos puros de "Menú y funciones" (sin base de datos). Probados en tests/admin-menu.test.ts.
import { z } from "zod";
import type { FeatureKey, LevelDef, MenuState, Tier } from "@/lib/engine";
import type { MenuKey } from "@/server/config";

/** Secciones del menú, en el orden en que las ve el usuario. Inicio siempre está visible y no se edita. */
export const MENU_KEYS = ["plan", "movimientos", "cuentas", "metas", "proyeccion", "analisis", "deudas", "inversiones", "academia", "cierre"] as const satisfies readonly MenuKey[];
/** Función (Gratis o Pro) que manda en cada sección. Cuentas no tiene: siempre es de todos. */
export const SECTION_FEATURE: Record<MenuKey, FeatureKey | null> = {
  plan: "plan", movimientos: "mov", cuentas: null, metas: "metas", proyeccion: "proy",
  analisis: "ana", deudas: "deudas", inversiones: "inv", academia: "acad", cierre: "cierre",
};
/** Funciones que viven dentro de una sección y tienen su propio plan mínimo. */
export const INNER_FEATURES = ["diag", "csv", "escenarios", "recurrentes"] as const satisfies readonly FeatureKey[];
export const FEATURE_KEYS = ["plan", "diag", "metas", "proy", "mov", "ana", "inv", "cierre", "acad", "deudas", "csv", "escenarios", "recurrentes"] as const satisfies readonly FeatureKey[];
export const FLAG_KEYS = ["csv", "comercios", "remesas", "multimoneda"] as const;
export const POINT_KEYS = ["lesson", "course", "closure", "debt_paid", "goal_done", "goal_contrib", "week_active", "first_step"] as const;
export const MENU_STATES = ["on", "soon", "off"] as const satisfies readonly MenuState[];

export type FlagKey = (typeof FLAG_KEYS)[number];
export type PointKey = (typeof POINT_KEYS)[number];
export const MAX_POINTS = 1000;
export const MAX_LEVEL_MIN = 1_000_000;
export const MAX_LEVELS = 10;
export const MAX_FREE_GOALS = 50;

/** Todo lo que edita la pantalla. Los puntos y los mínimos de nivel llegan como texto del formulario. */
export type MenuForm = {
  menu: Record<MenuKey, MenuState>;
  features: Record<FeatureKey, Tier>;
  flags: Record<FlagKey, boolean>;
  freeGoals: string;
  gamification: boolean;
  adminMfa: boolean;
  points: Record<PointKey, string>;
  levels: { name: string; min: string }[];
};

/** Valores limpios que se guardan en app_config. */
export type MenuValues = {
  menu: Record<MenuKey, MenuState>;
  features: Record<FeatureKey, Tier>;
  flags: Record<FlagKey, boolean>;
  limits: { free_goals: number };
  gamification_enabled: boolean;
  admin_mfa_required: boolean;
  points: Record<PointKey, number>;
  levels: LevelDef[];
};
export type ConfigKey = keyof MenuValues;
export const CONFIG_KEYS = ["menu", "features", "flags", "limits", "gamification_enabled", "admin_mfa_required", "points", "levels"] as const satisfies readonly ConfigKey[];

const obj = <K extends string, S extends z.ZodTypeAny>(keys: readonly K[], s: S) =>
  z.object(Object.fromEntries(keys.map((k) => [k, s])) as Record<K, S>).strict();

/** Forma exacta de cada clave de app_config (zod). Booleanos reales: la base compara `value::text = 'false'`. */
export const Schemas = {
  menu: obj(MENU_KEYS, z.enum(MENU_STATES)),
  features: obj(FEATURE_KEYS, z.enum(["free", "pro"])),
  flags: obj(FLAG_KEYS, z.boolean()),
  limits: z.object({ free_goals: z.number().int().min(0).max(MAX_FREE_GOALS) }).strict(),
  gamification_enabled: z.boolean(),
  admin_mfa_required: z.boolean(),
  points: obj(POINT_KEYS, z.number().int().min(0).max(MAX_POINTS)),
  levels: z.array(z.object({ name: z.string().trim().min(1).max(30), min: z.number().int().min(0).max(MAX_LEVEL_MIN) }).strict()).min(1).max(MAX_LEVELS),
} satisfies Record<ConfigKey, z.ZodTypeAny>;

/** Forma del formulario que llega del cliente. */
export const FormSchema = z.object({
  menu: Schemas.menu,
  features: Schemas.features,
  flags: Schemas.flags,
  freeGoals: z.string().max(10),
  gamification: z.boolean(),
  adminMfa: z.boolean(),
  points: obj(POINT_KEYS, z.string().max(10)),
  levels: z.array(z.object({ name: z.string().max(60), min: z.string().max(12) })).max(MAX_LEVELS + 5),
});

/** Entero escrito a mano ("1,000" o "1.000" también valen). null si no es un entero entre 0 y max. */
export function parseWhole(text: string, max: number): number | null {
  const t = text.trim();
  if (!/^\d{1,9}$/.test(t) && !/^\d{1,3}(?:[.,]\d{3}){1,2}$/.test(t)) return null;
  const n = Number(t.replace(/[.,]/g, ""));
  return n <= max ? n : null;
}

export type LevelError = "levelName" | "levelMin" | "levelZero" | "levelDup" | "levelCount";
/** Niveles válidos: 1 a 10, nombre sin repetir, exactamente uno desde 0 y mínimos distintos. Se guardan ordenados. */
export function checkLevels(rows: { name: string; min: string }[]): { ok: true; levels: LevelDef[] } | { ok: false; error: LevelError; index?: number } {
  if (rows.length < 1 || rows.length > MAX_LEVELS) return { ok: false, error: "levelCount" };
  const out: LevelDef[] = [];
  for (let i = 0; i < rows.length; i++) {
    const name = rows[i].name.trim().replace(/\s+/g, " ");
    if (!name || name.length > 30) return { ok: false, error: "levelName", index: i };
    const min = parseWhole(rows[i].min, MAX_LEVEL_MIN);
    if (min === null) return { ok: false, error: "levelMin", index: i };
    out.push({ name, min });
  }
  if (out.filter((l) => l.min === 0).length !== 1) return { ok: false, error: "levelZero" };
  if (new Set(out.map((l) => l.min)).size !== out.length) return { ok: false, error: "levelDup" };
  if (new Set(out.map((l) => l.name.toLowerCase())).size !== out.length) return { ok: false, error: "levelName" };
  return { ok: true, levels: [...out].sort((a, b) => a.min - b.min) };
}

export type FormError = LevelError | "points" | "freeGoals";
/** Del formulario a los valores que se guardan. Nunca deja pasar algo fuera de forma. */
export function formToValues(f: MenuForm): { ok: true; values: MenuValues } | { ok: false; error: FormError; field?: string } {
  const points = {} as Record<PointKey, number>;
  for (const k of POINT_KEYS) {
    const n = parseWhole(f.points[k] ?? "", MAX_POINTS);
    if (n === null) return { ok: false, error: "points", field: k };
    points[k] = n;
  }
  const freeGoals = parseWhole(f.freeGoals, MAX_FREE_GOALS);
  if (freeGoals === null) return { ok: false, error: "freeGoals" };
  const lv = checkLevels(f.levels);
  if (!lv.ok) return { ok: false, error: lv.error, field: lv.index === undefined ? undefined : String(lv.index) };
  return {
    ok: true,
    values: {
      menu: { ...f.menu }, features: { ...f.features }, flags: { ...f.flags }, limits: { free_goals: freeGoals },
      gamification_enabled: f.gamification, admin_mfa_required: f.adminMfa, points, levels: lv.levels,
    },
  };
}

/** De lo guardado en la base (ya completado con los valores por defecto) al formulario. */
export function valuesToForm(v: MenuValues): MenuForm {
  return {
    menu: { ...v.menu }, features: { ...v.features }, flags: { ...v.flags }, freeGoals: String(v.limits.free_goals),
    gamification: v.gamification_enabled, adminMfa: v.admin_mfa_required,
    points: Object.fromEntries(POINT_KEYS.map((k) => [k, String(v.points[k])])) as Record<PointKey, string>,
    levels: [...v.levels].sort((a, b) => a.min - b.min).map((l) => ({ name: l.name, min: String(l.min) })),
  };
}

/** Comparación estable de dos valores JSON (sin importar el orden de las claves de un objeto). */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameJson(x, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object), kb = Object.keys(b as object);
    return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

export type Change = { key: ConfigKey; value: unknown; changed: string[] };
/**
 * Qué claves cambian y qué hay que escribir. Se escribe la clave entera, conservando lo que ya
 * existía en la base y esta pantalla no conoce (p. ej. un punto o un límite nuevo).
 * `changed` lista las subclaves que cambiaron (para el registro; nunca valores).
 */
export function diffConfig(stored: Partial<Record<ConfigKey, unknown>>, next: MenuValues, prev?: MenuValues): Change[] {
  const out: Change[] = [];
  for (const key of CONFIG_KEYS) {
    const before = stored[key];
    const want = next[key] as unknown;
    if (key === "levels" || typeof want !== "object" || want === null) {
      if (!sameJson(before, want)) out.push({ key, value: want, changed: [] });
      continue;
    }
    const base = before && typeof before === "object" && !Array.isArray(before) ? (before as Record<string, unknown>) : {};
    const wantObj = want as Record<string, unknown>;
    // Con `prev` (lo que el admin vio al abrir), solo se aplican las subclaves que él cambió:
    // así no se pisa lo que otra pantalla (Planes, Academia) guardó después en la misma clave.
    const prevObj = prev ? (prev[key] as unknown as Record<string, unknown>) : null;
    const edited = Object.keys(wantObj).filter((k) => !prevObj || !sameJson(prevObj[k], wantObj[k]));
    const patch = Object.fromEntries(edited.map((k) => [k, wantObj[k]]));
    const changed = edited.filter((k) => !sameJson(base[k], wantObj[k]));
    if (changed.length) out.push({ key, value: { ...base, ...patch }, changed });
  }
  return out;
}

const FORM_KEY: Record<keyof MenuForm, ConfigKey> = {
  menu: "menu", features: "features", flags: "flags", freeGoals: "limits", gamification: "gamification_enabled",
  adminMfa: "admin_mfa_required", points: "points", levels: "levels",
};
/**
 * Claves que el admin tocó en esta pantalla. Solo esas se guardan: así una pestaña vieja no pisa
 * lo que otro admin cambió después (p. ej. los puntos desde la Academia).
 */
export function touchedKeys(initial: MenuForm, current: MenuForm): ConfigKey[] {
  const out = (Object.keys(FORM_KEY) as (keyof MenuForm)[]).filter((k) => !sameJson(initial[k], current[k])).map((k) => FORM_KEY[k]);
  return CONFIG_KEYS.filter((k) => out.includes(k));
}

/** Nombre de la acción en el registro (empieza por "menu" o "config" para caer en el filtro "Contenido"). */
export const AUDIT_ACTION: Record<ConfigKey, string> = {
  menu: "menu_secciones", features: "menu_planes", flags: "menu_funciones", limits: "config_limites",
  gamification_enabled: "config_logros", admin_mfa_required: "config_2pasos_admin", points: "config_puntos", levels: "config_niveles",
};

export type PreviewItem = { key: MenuKey | "inicio"; soon: boolean; pro: boolean };
/** "Así lo ve un usuario": Inicio y las secciones que no están ocultas, con su marca de Pronto o Pro. */
export function menuPreview(menu: Record<MenuKey, MenuState>, features: Partial<Record<FeatureKey, Tier>>): PreviewItem[] {
  const items: PreviewItem[] = [{ key: "inicio", soon: false, pro: false }];
  for (const k of MENU_KEYS) {
    if (menu[k] === "off") continue;
    const f = SECTION_FEATURE[k];
    items.push({ key: k, soon: menu[k] === "soon", pro: f ? (features[f] ?? "free") === "pro" : false });
  }
  return items;
}
