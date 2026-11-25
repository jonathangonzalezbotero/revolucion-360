// CRM: formas de los datos (zod) y listas cerradas. PURO: sin base de datos ni red (tests/crm.test.ts).
// Nada de esto lleva montos: el CRM solo guarda contacto, etiquetas, consentimiento y eventos de uso (CLAUDE.md regla 4).
import { z } from "zod";

// ───────── Etapas (etiquetas de sistema) ─────────
export const STAGES = ["lead", "primer_mes", "pagando", "alumno", "solo_lectura"] as const;
export type Stage = (typeof STAGES)[number];

export const SOURCES = ["webinar", "diagnostico", "web", "app", "importado", "manual"] as const;
export type Source = (typeof SOURCES)[number];

// ───────── Eventos ─────────
/** Los 12 eventos del mockup que pueden iniciar una automatización (AdminAuto › "Eventos de la app…"). */
export const TRIGGER_KINDS = [
  "first_month_paid", // Pagó su primer mes
  "student_code", // Entró con código de alumno
  "wizard_done", // Terminó el asistente
  "first_closure", // Hizo su primer cierre
  "inactive_days", // No abre la app en X días (lo detecta el motor)
  "goal_milestone", // Llegó a un hito de meta
  "charge_upcoming", // Faltan X días para un cobro (lo detecta el motor)
  "payment_failed", // Pago fallido
  "subscription_ended", // Suscripción terminó
  "diagnostic_done", // Hizo el diagnóstico
  "tag_added", // Se le puso una etiqueta
  "web_form", // Llenó un formulario web
] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

/** Eventos que solo quedan en la actividad del contacto (no inician automatizaciones). */
export const HISTORY_KINDS = [
  "signup", "paying", "webinar_registered", "imported", "created_manually", "stage_changed",
  "subscribed", "unsubscribed", "email_sent", "sms_sent", "email_opened", "email_clicked", "email_bounced", "email_complained",
] as const;
export type HistoryKind = (typeof HISTORY_KINDS)[number];
export type EventKind = TriggerKind | HistoryKind;
export const EVENT_KINDS: readonly EventKind[] = [...TRIGGER_KINDS, ...HISTORY_KINDS];
export const isEventKind = (k: unknown): k is EventKind => typeof k === "string" && (EVENT_KINDS as readonly string[]).includes(k);

/** Eventos de la app que cambian el estado de la cuenta: tras ellos se recalcula la etapa del contacto. */
export const STAGE_EVENTS: readonly EventKind[] = ["signup", "first_month_paid", "paying", "student_code", "payment_failed", "subscription_ended"];

/** Ref de un evento: ids, fechas o porcentajes (nunca nombres ni montos). Se limpia a un juego seguro de caracteres. */
export const cleanRef = (ref: string | number | null | undefined) => String(ref ?? "").replace(/[^A-Za-z0-9:_.\-]/g, "").slice(0, 120);
/** Clave de un formulario o webinar en el ref ("Ruta 2026" → "ruta-2026"): la misma en el ingreso y en el disparador. */
export const formKey = (name: string | null | undefined) =>
  String(name ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

// ───────── Público de una campaña ─────────
export const AudienceSchema = z.object({
  stages: z.array(z.enum(STAGES)).max(STAGES.length).default([]),
  tagIds: z.array(z.string().uuid()).max(50).default([]),
  /** Solo leads sin cuenta en la app. */
  noAccount: z.boolean().default(false),
});
export type Audience = z.infer<typeof AudienceSchema>;

/** Opciones del selector "Para quién" del mockup. Siempre + solo quienes aceptaron recibir correos. */
export const AUDIENCE_PRESETS = {
  paying_first: { stages: ["pagando", "primer_mes"], tagIds: [], noAccount: false },
  all: { stages: [], tagIds: [], noAccount: false },
  leads_no_account: { stages: [], tagIds: [], noAccount: true },
  alumnos: { stages: ["alumno"], tagIds: [], noAccount: false },
  read_only: { stages: ["solo_lectura"], tagIds: [], noAccount: false },
} as const satisfies Record<string, Audience>;
export type AudiencePreset = keyof typeof AUDIENCE_PRESETS;

// ───────── Bloques del editor de correo ─────────
/** Enlace permitido: https://… o una ruta de la app ("/plan"). Nunca javascript:, data:, etc. */
const Href = z.string().trim().max(500).refine((v) => /^https:\/\/[^\s"'<>]+$/i.test(v) || /^\/(?!\/)[^\s"'<>]*$/.test(v), "href");
const Text = (max: number) => z.string().max(max);

export const BlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: Text(200) }), // Título · "Hola, [nombre]"
  z.object({ type: z.literal("text"), text: Text(5000) }), // Texto (párrafos separados por línea en blanco)
  z.object({ type: z.literal("image"), src: z.string().trim().max(500).regex(/^https:\/\/[^\s"'<>]+$/i), alt: Text(200).default(""), href: Href.optional() }),
  z.object({ type: z.literal("button"), text: Text(80).min(1), href: Href }), // Botón · "Revisar mi plan" → app
  z.object({ type: z.literal("lesson"), title: Text(200).min(1), href: Href, course: Text(120).default("") }), // Clase de la Academia
  z.object({ type: z.literal("divider") }), // Separador
  z.object({ type: z.literal("signature"), text: Text(120) }), // Firma · Jonathan
]);
export type Block = z.infer<typeof BlockSchema>;
export const BlocksSchema = z.array(BlockSchema).max(40);

// ───────── Automatizaciones ─────────
export const TriggerSchema = z.object({
  kind: z.enum(TRIGGER_KINDS),
  /** "No abre la app en X días" y "Faltan X días para un cobro". */
  days: z.number().int().min(1).max(365).optional(),
  /** "Faltan X días para el PRIMER cobro" (fin del primer mes). */
  firstOnly: z.boolean().optional(),
  /** "Se le puso una etiqueta": cuál. */
  tagId: z.string().uuid().optional(),
  /** "Llenó un formulario web": cuál (vacío = cualquiera). */
  form: z.string().trim().max(60).optional(),
  /** "Llegó a un hito de meta": cuál (25/50/75/100; vacío = cualquiera). */
  pct: z.union([z.literal(25), z.literal(50), z.literal(75), z.literal(100)]).optional(),
}).superRefine((t, ctx) => {
  if ((t.kind === "inactive_days" || t.kind === "charge_upcoming") && !t.days) ctx.addIssue({ code: "custom", message: "days", path: ["days"] });
  if (t.kind === "tag_added" && !t.tagId) ctx.addIssue({ code: "custom", message: "tagId", path: ["tagId"] });
});
export type Trigger = z.infer<typeof TriggerSchema>;

export const StepId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);

export const CheckSchema = z.discriminatedUnion("type", [
  /** ¿Pasó X? (ej. ¿Terminó el asistente?). since: 'ever' = alguna vez; 'enrolled' = desde que entró aquí. */
  z.object({ type: z.literal("event"), kind: z.enum([...TRIGGER_KINDS, "signup", "paying"] as [EventKind, ...EventKind[]]), since: z.enum(["ever", "enrolled"]).default("ever") }),
  /** ¿Creó su cuenta? */
  z.object({ type: z.literal("has_account") }),
  /** ¿Está en alguna de estas etapas? (ej. ¿El pago salió bien? = Pagando). */
  z.object({ type: z.literal("stage"), stages: z.array(z.enum(STAGES)).min(1) }),
  /** ¿Volvió a la app desde que entró aquí? */
  z.object({ type: z.literal("active_since_enrolled") }),
  /** ¿Tiene esta etiqueta? */
  z.object({ type: z.literal("has_tag"), tagId: z.string().uuid() }),
]);
export type Check = z.infer<typeof CheckSchema>;

const WaitStep = z.object({
  id: StepId, type: z.literal("wait"),
  days: z.number().int().min(0).max(365).default(0), hours: z.number().int().min(0).max(23).default(0),
  /** "Esperar hasta el cobro": hasta la fecha de cobro (pro_until) del contacto. */
  until: z.literal("charge").optional(),
});
const EmailStep = z.object({ id: StepId, type: z.literal("email"), subject: Text(200).min(1), preheader: Text(200).default(""), blocks: BlocksSchema.min(1) });
const SmsStep = z.object({ id: StepId, type: z.literal("sms"), body: Text(400).min(1) });
const TagStep = z.object({ id: StepId, type: z.literal("tag"), tagId: z.string().uuid(), action: z.enum(["add", "remove"]).default("add") });
const ExitStep = z.object({ id: StepId, type: z.literal("exit") });
const LeafStep = z.discriminatedUnion("type", [WaitStep, EmailStep, SmsStep, TagStep, ExitStep]);
const ConditionStep = z.object({ id: StepId, type: z.literal("condition"), check: CheckSchema, yes: z.array(LeafStep).max(20).default([]), no: z.array(LeafStep).max(20).default([]) });

export const StepSchema = z.union([LeafStep, ConditionStep]);
export type LeafStepT = z.infer<typeof LeafStep>;
export type ConditionStepT = z.infer<typeof ConditionStep>;
export type Step = z.infer<typeof StepSchema>;
export const StepsSchema = z.array(StepSchema).max(40).superRefine((steps, ctx) => {
  const ids = new Set<string>();
  const visit = (s: { id: string }) => {
    if (ids.has(s.id)) ctx.addIssue({ code: "custom", message: `duplicate:${s.id}` });
    ids.add(s.id);
  };
  for (const s of steps) {
    visit(s);
    if (s.type === "condition") [...s.yes, ...s.no].forEach(visit);
  }
});

export const ExitRulesSchema = z.object({
  onUnsubscribe: z.boolean().default(true),
  onCancel: z.boolean().default(true),
  /** Cumplió el objetivo (ej. creó su cuenta = signup; pagó = first_month_paid). */
  goal: z.object({ kind: z.enum([...TRIGGER_KINDS, "signup", "paying"] as [EventKind, ...EventKind[]]) }).nullable().default(null),
});
export type ExitRules = z.infer<typeof ExitRulesSchema>;

// ───────── API de ingreso de leads (POST /api/crm/ingest) ─────────
export const INGEST_MAX_BYTES = 8 * 1024;
export const IngestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().max(120).default(""),
  phone: z.string().trim().max(30).optional(),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
  timezone: z.string().trim().max(64).optional(),
  locale: z.enum(["es", "en"]).optional(),
  source: z.enum(["webinar", "diagnostico", "web"]).default("web"),
  /** Nombre del webinar o del formulario (se ve en Origen; no lleva datos personales). */
  sourceDetail: z.string().trim().max(80).default(""),
  /** Formulario (para "Llenó un formulario web"); por defecto el origen. */
  form: z.string().trim().max(60).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  consent: z.object({ email: z.boolean().default(false), sms: z.boolean().default(false) }).default({ email: false, sms: false }),
  /** Constancia del consentimiento (opcional): texto exacto de la casilla, URL del formulario, IP y navegador de quien lo llenó. */
  evidence: z.object({
    text: z.string().trim().max(500).optional(),
    url: z.string().trim().max(500).optional(),
    ip: z.string().trim().max(64).optional(),
    userAgent: z.string().trim().max(300).optional(),
  }).strict().optional(),
}).strict();
export type Ingest = z.infer<typeof IngestSchema>;
