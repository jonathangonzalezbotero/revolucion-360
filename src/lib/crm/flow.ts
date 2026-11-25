// CRM: automatizaciones (disparadores, pasos, salidas). PURO, probado en tests/crm.test.ts.
// El motor (src/server/crm/engine.ts) junta los hechos de la base y aplica lo que estas funciones deciden.
import { formKey, type Check, type EventKind, type ExitRules, type LeafStepT, type Stage, type Step, type Trigger } from "./schema";
import { waitUntil } from "./time";

// ───────── Disparador ─────────
export type EventLite = { kind: EventKind | string; ref: string };

/** ¿Este evento inicia la automatización? (los parámetros van en el ref del evento: días, etiqueta, formulario, hito). */
export function matchesTrigger(t: Trigger, e: EventLite): boolean {
  if (t.kind !== e.kind) return false;
  const parts = e.ref.split(":");
  switch (t.kind) {
    case "inactive_days": return parts[0] === String(t.days);
    case "charge_upcoming": return parts[0] === String(t.days) && (!t.firstOnly || parts[2] === "first");
    case "tag_added": return parts[0] === t.tagId;
    case "web_form": return !t.form || parts[0] === formKey(t.form);
    case "goal_milestone": return !t.pct || parts[parts.length - 1] === String(t.pct);
    default: return true;
  }
}

/** Ref de la inscripción: un mismo hecho nunca inscribe dos veces (aviso repetido, etiqueta ↔ disparador en bucle). */
export const enrollmentRef = (e: EventLite) => `${e.kind}:${e.ref}`.slice(0, 160);

// ───────── Salida ─────────
export type ExitReason = "unsubscribed" | "cancelled" | "goal";
/**
 * ¿Este evento (posterior a la inscripción) lo saca? Se da de baja del correo, su suscripción terminó (salvo que la
 * automatización empiece justo por eso) o cumplió el objetivo.
 */
export function exitFor(rules: ExitRules, trigger: Trigger, e: EventLite): ExitReason | null {
  if (rules.onUnsubscribe && e.kind === "unsubscribed" && e.ref.startsWith("email:")) return "unsubscribed";
  if (rules.onCancel && e.kind === "subscription_ended" && trigger.kind !== "subscription_ended") return "cancelled";
  if (rules.goal && e.kind === rules.goal.kind) return "goal";
  return null;
}

// ───────── Pasos ─────────
type Op = { step: Step; next: string | null; yes?: string | null; no?: string | null };
export type Program = { first: string | null; ops: Map<string, Op> };

/** Aplana los pasos (con las ramas sí/no de las condiciones) en un programa: cada paso sabe cuál sigue. */
export function compile(steps: Step[]): Program {
  const ops = new Map<string, Op>();
  const chain = (list: LeafStepT[], after: string | null): string | null => {
    list.forEach((s, i) => ops.set(s.id, { step: s, next: list[i + 1]?.id ?? after }));
    return list[0]?.id ?? after;
  };
  steps.forEach((s, i) => {
    const after = steps[i + 1]?.id ?? null;
    if (s.type === "condition") ops.set(s.id, { step: s, next: after, yes: chain(s.yes, after), no: chain(s.no, after) });
    else ops.set(s.id, { step: s, next: after });
  });
  return { first: steps[0]?.id ?? null, ops };
}

/** Lo que se sabe del contacto para decidir una condición (nunca montos). */
export type Facts = {
  hasAccount: boolean;
  stage: Stage;
  tagIds: Set<string>;
  /** Eventos del contacto: tipo → fechas (ISO). */
  events: Map<string, string[]>;
  enrolledAt: string;
  lastActiveAt: string | null;
  chargeAt: string | null;
};

export function evaluate(c: Check, f: Facts): boolean {
  switch (c.type) {
    case "event": {
      const at = f.events.get(c.kind) ?? [];
      return c.since === "enrolled" ? at.some((x) => x >= f.enrolledAt) : at.length > 0;
    }
    case "has_account": return f.hasAccount;
    case "stage": return c.stages.includes(f.stage);
    case "active_since_enrolled": return !!f.lastActiveAt && f.lastActiveAt > f.enrolledAt;
    case "has_tag": return f.tagIds.has(c.tagId);
  }
}

export type Action =
  | { type: "email"; step: Extract<LeafStepT, { type: "email" }> }
  | { type: "sms"; step: Extract<LeafStepT, { type: "sms" }> }
  | { type: "tag"; step: Extract<LeafStepT, { type: "tag" }> };
export type Outcome =
  | { status: "active"; nextStepId: string; nextAt: Date }
  | { status: "done" }
  | { status: "missing" }; // el paso donde estaba ya no existe (editaron la automatización)

/**
 * Avanza una inscripción desde `fromId` hasta la próxima espera (o el final). Devuelve lo que hay que hacer ahora
 * (correos, SMS, etiquetas, en orden) y dónde queda. Una espera deja `nextStepId` = el paso que sigue a la espera.
 */
export function advance(p: Program, fromId: string | null, f: Facts, now: Date): { actions: Action[]; outcome: Outcome } {
  const actions: Action[] = [];
  let id = fromId;
  for (let guard = 0; guard < 200; guard++) {
    if (id === null) return { actions, outcome: { status: "done" } };
    const op = p.ops.get(id);
    if (!op) return { actions, outcome: { status: "missing" } };
    const s = op.step;
    switch (s.type) {
      case "wait": {
        const at = waitUntil(s, now, f.chargeAt);
        if (at > now) return op.next ? { actions, outcome: { status: "active", nextStepId: op.next, nextAt: at } } : { actions, outcome: { status: "done" } };
        id = op.next;
        break;
      }
      case "email": actions.push({ type: "email", step: s }); id = op.next; break;
      case "sms": actions.push({ type: "sms", step: s }); id = op.next; break;
      case "tag":
        actions.push({ type: "tag", step: s });
        if (s.action === "add") f.tagIds.add(s.tagId); else f.tagIds.delete(s.tagId);
        id = op.next;
        break;
      case "exit": return { actions, outcome: { status: "done" } };
      case "condition": id = (evaluate(s.check, f) ? op.yes : op.no) ?? null; break;
    }
  }
  return { actions, outcome: { status: "done" } };
}

/**
 * Etiquetas que usa una automatización: `own` (pasos "Etiquetar" y condiciones "¿Tiene la etiqueta?") deben ser etiquetas
 * PROPIAS (las de sistema salen de la etapa: no se ponen a mano y no están en crm_contact_tags); `any` (el disparador
 * "Se le puso una etiqueta") puede ser también de sistema.
 */
export function tagRefs(trigger: Trigger, steps: Step[]): { own: string[]; any: string[] } {
  const own = new Set<string>();
  const leaf = (s: LeafStepT) => { if (s.type === "tag") own.add(s.tagId); };
  for (const s of steps) {
    if (s.type === "condition") {
      if (s.check.type === "has_tag") own.add(s.check.tagId);
      [...s.yes, ...s.no].forEach(leaf);
    } else leaf(s);
  }
  return { own: [...own], any: trigger.kind === "tag_added" && trigger.tagId ? [trigger.tagId] : [] };
}

/** Fuente de un mensaje de automatización (única por contacto en la cola). */
export const automationSourceKey = (automationId: string, stepId: string, enrollmentId: string) => `auto:${automationId}:${stepId}:${enrollmentId}`;
export const campaignSourceKey = (campaignId: string) => `campaign:${campaignId}`;
