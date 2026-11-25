// Automatizaciones en el panel: textos de pasos, disparador y salida, y pasos nuevos. PURO (tests/admin-crm.test.ts).
// Los ids de los pasos que ya existen nunca se cambian: las inscripciones activas apuntan a ellos.
import type { Block, Check, ConditionStepT, EventKind, ExitRules, LeafStepT, Stage, Step, Trigger } from "@/lib/crm/schema";
import { newStepId } from "../crm/lib";

export type StepType = Step["type"];
export const STEP_TYPES: StepType[] = ["wait", "email", "sms", "condition", "tag", "exit"];
export const LEAF_TYPES: LeafStepT["type"][] = ["wait", "email", "sms", "tag", "exit"];

/** Colores de cada tipo de paso (mockup: Esperar, Enviar correo, Condición, Etiquetar) con tokens; SMS y Salir agregados. */
export const STEP_TONE: Record<StepType, { bg: string; fg: string }> = {
  wait: { bg: "var(--linea-2)", fg: "var(--tinta-2)" },
  email: { bg: "var(--verde-fondo)", fg: "var(--verde-fuerte)" },
  sms: { bg: "var(--teal-fondo)", fg: "var(--verde-texto)" },
  condition: { bg: "var(--amarillo-pastel)", fg: "var(--amarillo-texto)" },
  tag: { bg: "var(--azul-fondo)", fg: "var(--azul-oscuro)" },
  exit: { bg: "var(--rojo-fondo)", fg: "var(--rojo-texto)" },
};

export type StepTexts = {
  waitNow: string; waitDay: string; waitDays: string; waitHour: string; waitHours: string; waitDaysHours: string; waitCharge: string;
  emailSum: string; smsSum: string; tagAdd: string; tagRemove: string; exitSum: string; empty: string;
  checkEvent: string; checkEventSince: string; checkAccount: string; checkStage: string; checkActive: string; checkTag: string;
};
export type Ctx = { t: StepTexts; events: Record<string, string>; stages: Record<string, string>; tagName: (id: string) => string };

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function waitSummary(s: { days?: number; hours?: number; until?: "charge" }, t: StepTexts): string {
  if (s.until === "charge") return t.waitCharge;
  const d = s.days ?? 0, h = s.hours ?? 0;
  if (!d && !h) return t.waitNow;
  if (d && h) return fill(t.waitDaysHours, { d, h });
  if (d) return d === 1 ? t.waitDay : fill(t.waitDays, { n: d });
  return h === 1 ? t.waitHour : fill(t.waitHours, { n: h });
}

/** Pregunta de una condición: "¿Terminó el asistente?", "¿Creó su cuenta?"… */
export function checkSummary(c: Check, x: Ctx): string {
  switch (c.type) {
    case "event": return fill(c.since === "enrolled" ? x.t.checkEventSince : x.t.checkEvent, { event: x.events[c.kind] ?? c.kind });
    case "has_account": return x.t.checkAccount;
    case "stage": return fill(x.t.checkStage, { stages: c.stages.map((s) => x.stages[s] ?? s).join(" / ") });
    case "active_since_enrolled": return x.t.checkActive;
    case "has_tag": return fill(x.t.checkTag, { tag: x.tagName(c.tagId) });
  }
}

/** Resumen de un paso como en el mockup: 'Correo · "Tu año en un solo lugar empieza hoy"', "Esperar 1 día"… */
export function stepSummary(s: Step, x: Ctx): string {
  switch (s.type) {
    case "wait": return waitSummary(s, x.t);
    case "email": return fill(x.t.emailSum, { subject: s.subject.trim() ? short(s.subject.trim()) : x.t.empty });
    case "sms": return fill(x.t.smsSum, { body: s.body.trim() ? short(s.body.trim(), 50) : x.t.empty });
    case "tag": return fill(s.action === "remove" ? x.t.tagRemove : x.t.tagAdd, { tag: x.tagName(s.tagId) });
    case "exit": return x.t.exitSum;
    case "condition": return checkSummary(s.check, x);
  }
}

export type TriggerTexts = { first: string; anyForm: string; pct: string };
/** "Empieza cuando": el disparador con sus parámetros ("No abre la app en 14 días", "Se le puso una etiqueta: Webinar"). */
export function triggerSummary(tr: Trigger, label: string, t: TriggerTexts, tagName: (id: string) => string, connName: (id: string) => string = () => "—"): string {
  switch (tr.kind) {
    case "web_connection":
    case "email_confirmed": return tr.connectionId ? `${label}: ${connName(tr.connectionId)}` : label;
    case "tag_added": return tr.tagId ? `${label}: ${tagName(tr.tagId)}` : label;
    case "web_form": return tr.form ? `${label}: ${tr.form}` : label;
    case "goal_milestone": return tr.pct ? `${label} · ${fill(t.pct, { n: tr.pct })}` : label;
    case "charge_upcoming": return tr.firstOnly ? `${label} · ${t.first}` : label;
    default: return label;
  }
}

/** "Sale de la automatización si: se da de baja, cancela su cuenta o ya cumplió el objetivo (creó su cuenta)." */
export function exitSentence(r: ExitRules, t: { unsub: string; cancel: string; goal: string; or: string; never: string }, events: Record<string, string>): string {
  const parts = [r.onUnsubscribe ? t.unsub : null, r.onCancel ? t.cancel : null, r.goal ? fill(t.goal, { goal: (events[r.goal.kind] ?? r.goal.kind).toLowerCase() }) : null].filter((p): p is string => !!p);
  if (!parts.length) return t.never;
  if (parts.length === 1) return `${parts[0]}.`;
  return `${parts.slice(0, -1).join(", ")} ${t.or} ${parts[parts.length - 1]}.`;
}

/** Todos los ids (incluye las ramas sí / no). */
export function stepIds(steps: Step[]): string[] {
  return steps.flatMap((s) => (s.type === "condition" ? [s.id, ...s.yes.map((y) => y.id), ...s.no.map((n) => n.id)] : [s.id]));
}

/** Paso nuevo con id que no choca con ninguno. Correo con título "Hola, [nombre]" y un texto vacío para llenar. */
export function newStep(type: StepType, taken: Iterable<string>, d: { heading: string; tagId: string | null; rand?: () => number }): Step {
  const id = newStepId(taken, d.rand);
  switch (type) {
    case "wait": return { id, type, days: 1, hours: 0 };
    case "email": return { id, type, subject: "", preheader: "", blocks: [{ type: "heading", text: d.heading }, { type: "text", text: "" }] as Block[] };
    case "sms": return { id, type, body: "" };
    case "tag": return { id, type, tagId: d.tagId ?? "", action: "add" };
    case "exit": return { id, type };
    case "condition": return { id, type, check: { type: "has_account" }, yes: [], no: [] } as ConditionStepT;
  }
}

/** Reemplaza un paso por id (en la lista principal o dentro de una rama). */
export function replaceStep(steps: Step[], id: string, next: Step | null): Step[] {
  const leaf = (list: LeafStepT[]) => list.flatMap((s) => (s.id === id ? (next ? [next as LeafStepT] : []) : [s]));
  return steps.flatMap((s) => {
    if (s.id === id) return next ? [next] : [];
    if (s.type === "condition") return [{ ...s, yes: leaf(s.yes), no: leaf(s.no) }];
    return [s];
  });
}

/** Eventos que sirven como objetivo de salida o en "¿Pasó X?". */
export const GOAL_KINDS: EventKind[] = ["signup", "first_month_paid", "paying", "student_code", "wizard_done", "first_closure", "goal_milestone", "diagnostic_done", "web_form", "payment_failed", "subscription_ended", "web_connection", "email_confirmed"];

/**
 * Disparadores que se ofrecen (mockup AdminAuto: 13). "Llenó un formulario web" es de la API vieja /api/crm/ingest (la
 * reemplazan las Conexiones web): solo aparece si la automatización abierta ya lo usa.
 */
export const visibleTriggers = <K extends string>(all: readonly K[], current?: string): K[] => all.filter((k) => k !== "web_form" || k === current);
export const CHECK_TYPES: Check["type"][] = ["event", "has_account", "stage", "active_since_enrolled", "has_tag"];
export const STAGE_KEYS: Stage[] = ["lead", "primer_mes", "pagando", "alumno", "solo_lectura"];
