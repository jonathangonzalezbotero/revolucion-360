// Retos: cálculos puros (con pruebas en tests/retos.test.ts). Las mismas reglas las impone la base
// (supabase/migrations/20261125000037_retos.sql): meta, ventana de días, tope de puntos y comodines.
import { z } from "zod";
import { addDays, diffDays, formatDate, parts, type ISODate } from "@/lib/engine";

export const MEASURES = ["checkin", "app"] as const;
export type Measure = (typeof MEASURES)[number];
/** Acciones que la app cuenta sola. Nunca un monto: solo que la acción pasó. */
export const ACTIONS = ["expense", "closure", "goal_contrib", "lesson", "open_app"] as const;
export type Action = (typeof ACTIONS)[number];
export const isAction = (v: unknown): v is Action => typeof v === "string" && (ACTIONS as readonly string[]).includes(v);
export const AUDIENCES = ["all", "group", "code"] as const;
export type Audience = (typeof AUDIENCES)[number];

/** Ilustraciones que el admin puede elegir (public/ilustraciones/*.webp). Las 8 del mockup primero. */
export const IMAGES = [
  "meta-emergencia", "vacio-movimientos", "meta-comprar", "cel-cierre", "onb-metas", "cel-racha", "meta-viaje", "meta-deuda",
  "meta-inversion", "meta-otra", "cel-hito", "cel-meta", "onb-plan", "onb-categorias", "onb-seguridad", "vacio-cuentas",
  "vacio-deudas", "vacio-inversiones", "vacio-metas", "vacio-analisis",
] as const;
export type ImageKey = (typeof IMAGES)[number];
export const isImage = (v: unknown): v is ImageKey => typeof v === "string" && (IMAGES as readonly string[]).includes(v);
export const imageSrc = (key: string) => `/ilustraciones/${isImage(key) ? key : "meta-emergencia"}.webp`;

/**
 * Tope del premio al terminar. Lo que marca la persona ("Sí, lo hice") no se puede comprobar: premio pequeño, como una
 * clase o un cierre (máx. 50). Lo que mide la app sí se comprueba en la base: puede ser grande (máx. 200, como 4 cursos).
 */
export const POINT_CAP: Record<Measure, number> = { checkin: 50, app: 200 };
export const MAX_DAYS = 120;
export const MAX_WILDCARDS = 30;

/** Acciones que se cuentan una vez por día. Clases y cierres se cuentan uno por uno. */
export const isDaily = (measure: Measure, action: Action | null) => measure === "checkin" || (action !== "lesson" && action !== "closure");

/** Unidades del reto: días; en "cierre de mes", cierres (⌈días / 30⌉). */
export const unitsOf = (action: Action | null, days: number) => (action === "closure" ? Math.ceil(days / 30) : days);

/** Meta: unidades − comodines (mínimo 1). Igual que la columna generada `challenges.target`. */
export const targetOf = (action: Action | null, days: number, wildcards: number) => Math.max(1, unitsOf(action, days) - wildcards);

/** Cifra que se muestra como "de N": días en lo diario (como el mockup: "11 de 30 días"), la meta en clases y cierres. */
export const goalShown = (measure: Measure, action: Action | null, days: number, target: number) => (isDaily(measure, action) ? days : target);

/** Último día del intento (incluido). */
export const lastDay = (start: ISODate, days: number): ISODate => addDays(start, days - 1);

export type Phase = "before" | "running" | "ended";
export function phaseOf(today: ISODate, start: ISODate, days: number): Phase {
  if (today < start) return "before";
  return today > lastDay(start, days) ? "ended" : "running";
}

/** Día del reto (1 = el primero). */
export const dayNumber = (today: ISODate, start: ISODate) => diffDays(today, start) + 1;

/**
 * Comodines que le quedan. Cada día pasado sin "Sí, lo hice" gasta uno; "Hoy no" gasta uno hoy. Nunca baja de 0 y nunca
 * quita lo logrado: solo dice cuántos días más puede fallar y aún terminarlo.
 */
export function wildcardsLeft(o: { wildcards: number; start: ISODate; today: ISODate; yesBefore: number; todayState: "yes" | "no" | null }): number {
  const elapsed = Math.max(0, diffDays(o.today, o.start));
  const missed = Math.max(0, elapsed - o.yesBefore);
  const left = Math.max(0, o.wildcards - missed);
  return o.todayState === "no" ? Math.max(0, left - 1) : left;
}

export type Dot = "done" | "today" | "open";
/**
 * Avance por día (o por clase/cierre). Diario: un punto por día de la ventana; hecho si ese día cuenta, amarillo hoy si
 * aún no cuenta. Por unidad: un punto por unidad de la meta; los primeros `count` hechos y el siguiente en amarillo.
 */
export function dotsFor(o: { daily: boolean; start: ISODate; days: number; today: ISODate; doneDays: Set<string>; count: number; target: number }): Dot[] {
  if (!o.daily) return Array.from({ length: o.target }, (_, i) => (i < o.count ? "done" : i === o.count ? "today" : "open"));
  return Array.from({ length: o.days }, (_, i) => {
    const d = addDays(o.start, i);
    if (o.doneDays.has(d)) return "done";
    return d === o.today ? "today" : "open";
  });
}

/**
 * Señal del menú (Retos amarillo en escritorio, punto en "Más" en el celular). Un intento con `status = 'active'` puede
 * tener ya los días vencidos (la base solo lo pasa a 'ended' al volver a entrar), así que "activo" = dentro de sus días o
 * aún por empezar. `pending` = falta el check-in de hoy en un reto que se marca a mano, ya empezado; solo si puede escribir.
 * Los retos que cuenta la app ("abrir la app", gastos…) nunca piden marcar.
 */
export type RetoSignal = { active: number; pending: boolean };
export function retoSignal(o: {
  today: ISODate; canEdit: boolean;
  members: { challengeId: string; startOn: ISODate; markedToday: boolean }[];
  challenges: ReadonlyMap<string, { measure: Measure; days: number }>;
}): RetoSignal {
  let active = 0, pending = false;
  for (const x of o.members) {
    const c = o.challenges.get(x.challengeId);
    if (!c) continue;
    const phase = phaseOf(o.today, x.startOn, c.days);
    if (phase === "ended") continue;
    active++;
    if (o.canEdit && c.measure === "checkin" && phase === "running" && !x.markedToday) pending = true;
  }
  return { active, pending };
}

/** Estado del reto en el panel. */
export type AdminStatus = "draft" | "open" | "scheduled" | "active" | "ended";
export function adminStatus(c: { status: "draft" | "published"; startsOn: ISODate | null; days: number }, today: ISODate): AdminStatus {
  if (c.status === "draft") return "draft";
  if (!c.startsOn) return "open";
  const p = phaseOf(today, c.startsOn, c.days);
  return p === "before" ? "scheduled" : p === "running" ? "active" : "ended";
}

/** ¿Alguien puede unirse hoy? (siempre abierto, o con fecha fija que aún no termina) */
export const joinable = (startsOn: ISODate | null, days: number, today: ISODate) => !startsOn || today <= lastDay(startsOn, days);

/** "18%" de los que se unieron; "—" si nadie se unió. */
export const pctOf = (n: number, total: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : "—");

/** "Del 1 al 7 de diciembre" · "Del 28 de noviembre al 5 de diciembre" · "Del 28 de diciembre de 2026 al 3 de enero de 2027". */
export function rangeLabel(start: ISODate, days: number, locale: string, t: { range: string }): string {
  const end = lastDay(start, days);
  const a = parts(start), b = parts(end);
  const sameYear = a.y === b.y;
  const from = sameYear ? (a.m === b.m && locale !== "en" ? String(a.d) : formatDate(start, locale, "day")) : formatDate(start, locale, "long");
  const to = sameYear ? formatDate(end, locale, "day") : formatDate(end, locale, "long");
  return t.range.replace("{from}", from).replace("{to}", to);
}

// ───────── Formulario del panel ─────────
const intIn = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "date");

export const ChallengeInput = z.object({
  id: z.string().uuid().nullable().default(null),
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).default(""),
  image: z.enum(IMAGES),
  measure: z.enum(MEASURES),
  action: z.enum(ACTIONS).nullable().default(null),
  wildcards: intIn(0, MAX_WILDCARDS).default(0),
  days: intIn(1, MAX_DAYS),
  startsOn: isoDate.nullable().default(null),
  audience: z.enum(AUDIENCES),
  groupId: z.string().uuid().nullable().default(null),
  inviteCode: z.string().trim().max(40).nullable().default(null),
  points: intIn(0, 1000),
  badgeName: z.string().trim().max(40).nullable().default(null),
  showBoard: z.boolean().default(false),
  publish: z.boolean().default(false),
});
export type ChallengeInputT = z.infer<typeof ChallengeInput>;

export type ChallengeError = "action" | "group" | "code" | "points" | "wildcards" | "start";
/** Reglas que no caben en la forma. Devuelve el primer problema (o null). `today` = hoy del admin. */
export function challengeProblem(c: ChallengeInputT, today: ISODate): ChallengeError | null {
  if (c.measure === "app" && !c.action) return "action";
  if (c.audience === "group" && !c.groupId) return "group";
  if (c.audience === "code" && !c.inviteCode) return "code";
  if (c.points > POINT_CAP[c.measure]) return "points";
  if (c.wildcards >= unitsOf(c.measure === "app" ? c.action : null, c.days)) return "wildcards";
  if (c.startsOn && c.publish && lastDay(c.startsOn, c.days) < today) return "start";
  return null;
}

/** Limpia lo que no aplica (acción solo si lo mide la app, grupo solo para un grupo, código solo para un código). */
export function normalizeChallenge(c: ChallengeInputT) {
  return {
    title: c.title, description: c.description, image: c.image, measure: c.measure,
    action: c.measure === "app" ? c.action : null, wildcards: c.wildcards, days: c.days, starts_on: c.startsOn,
    audience: c.audience, group_id: c.audience === "group" ? c.groupId : null,
    invite_code: c.audience === "code" ? (c.inviteCode ?? "").toUpperCase() : null,
    points: c.points, badge_name: c.badgeName ? c.badgeName : null, show_board: c.showBoard,
  };
}

/** Campos que ya no cambian una vez publicado (cambiarían las reglas de quien ya está adentro). */
export const LOCKED_WHEN_PUBLISHED = ["measure", "action", "wildcards", "days", "starts_on", "audience", "group_id", "invite_code"] as const;
