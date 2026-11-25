import { describe, expect, it } from "vitest";
import { BlockSchema, StepsSchema, type Step } from "@/lib/crm/schema";
import { EVENT_LABELS, STAGE_LABELS } from "@/lib/crm/labels";
import { ADMIN_SECTIONS, ROLE_SECTIONS, canUse, sectionOf } from "@/app/admin/actividad/roles";
import {
  activityDate, audiencePreset, blockSummary, campaignWhen, chunks, crmErrorKey, crmMissing, describeEvent, firstWord, fmtRate, imageUrl,
  isYes, mapHeaders, move, newBlock, newStepId, parseContactsCsv, quickEmailBlocks, relativeTime, splitImport, type BlockTexts,
} from "@/app/admin/crm/lib";
import { exitSentence, newStep, replaceStep, stepIds, stepSummary, triggerSummary, waitSummary, type Ctx } from "@/app/admin/automatizaciones/lib";
import { M as MA } from "@/app/admin/automatizaciones/messages";
import { M as MC } from "@/app/admin/campanas/messages";
import { M as MK } from "@/app/admin/crm/messages";

describe("permisos del CRM", () => {
  it("las tres rutas son la sección crm", () => {
    expect(sectionOf("/admin/crm")).toBe("crm");
    expect(sectionOf("/admin/crm?sel=1")).toBe("crm");
    expect(sectionOf("/admin/campanas")).toBe("crm");
    expect(sectionOf("/admin/campanas?c=nueva")).toBe("crm");
    expect(sectionOf("/admin/automatizaciones")).toBe("crm");
    expect(sectionOf("/admin/crmx")).toBeNull();
  });
  it("solo el Dueño", () => {
    expect(ADMIN_SECTIONS).toContain("crm");
    expect(canUse("owner", "crm")).toBe(true);
    expect(canUse("content", "crm")).toBe(false);
    expect(canUse("support", "crm")).toBe(false);
    expect(ROLE_SECTIONS.content).not.toContain("crm");
  });
});

describe("errores del motor", () => {
  it("traduce códigos conocidos y lo demás es genérico", () => {
    expect(crmErrorKey(new Error("legal_incomplete"))).toBe("legal_incomplete");
    expect(crmErrorKey(new Error("invalid_tag"))).toBe("invalid_tag");
    expect(crmErrorKey(new Error("db: 23505 duplicate"))).toBe("generic");
    expect(crmErrorKey("x")).toBe("generic");
  });
  it("detecta la migración sin aplicar", () => {
    expect(crmMissing(new Error("db: PGRST205 Could not find the table 'public.crm_contacts' in the schema cache"))).toBe(true);
    expect(crmMissing(new Error("db: PGRST202 Could not find the function public.crm_summary"))).toBe(true);
    expect(crmMissing(new Error('db: 42P01 relation "crm_tags" does not exist'))).toBe(true);
    expect(crmMissing(new Error("db: 42501 forbidden"))).toBe(false);
  });
});

describe("fechas relativas", () => {
  const now = new Date("2026-11-25T12:00:00Z");
  const t = MK.es.rel;
  it("como en el mockup", () => {
    expect(relativeTime(null, now, t)).toBeNull();
    expect(relativeTime("2026-11-25T11:59:40Z", now, t)).toBe("Hace un momento");
    expect(relativeTime("2026-11-25T11:35:00Z", now, t)).toBe("Hace 25 min");
    expect(relativeTime("2026-11-25T10:00:00Z", now, t)).toBe("Hace 2 h");
    expect(relativeTime("2026-11-24T10:00:00Z", now, t)).toBe("Hace 1 día");
    expect(relativeTime("2026-10-16T12:00:00Z", now, t)).toBe("Hace 40 días");
    expect(relativeTime("2026-11-26T12:00:00Z", now, t)).toBe("Hace un momento"); // reloj adelantado: nunca "hace -1"
  });
  it("línea de tiempo en la zona del admin", () => {
    const tz = "Australia/Sydney"; // UTC+11 en noviembre
    expect(activityDate("2026-11-25T09:12:00Z", now, tz, MK.es.day, "es")).toBe("Hoy 20:12");
    expect(activityDate("2026-11-24T05:00:00Z", now, tz, MK.es.day, "es")).toBe("Ayer");
    expect(activityDate("2026-11-12T05:00:00Z", now, tz, MK.es.day, "es")).toBe("12 nov");
    expect(activityDate("2025-11-12T05:00:00Z", now, tz, MK.es.day, "es")).toBe("12 nov 2025");
    expect(activityDate("2026-11-12T05:00:00Z", now, tz, MK.en.day, "en")).toBe("Nov 12");
    // 13:30 UTC del 24 = 00:30 del 25 en Sídney: es hoy, no ayer
    expect(activityDate("2026-11-24T13:30:00Z", now, tz, MK.es.day, "es")).toBe("Hoy 00:30");
  });
});

describe("campañas", () => {
  it("público guardado → opción del selector", () => {
    expect(audiencePreset({ stages: ["primer_mes", "pagando"], tagIds: [], noAccount: false })).toBe("paying_first");
    expect(audiencePreset({ stages: [], tagIds: [], noAccount: false })).toBe("all");
    expect(audiencePreset({ stages: [], tagIds: [], noAccount: true })).toBe("leads_no_account");
    expect(audiencePreset({ stages: ["alumno"], tagIds: [], noAccount: false })).toBe("alumnos");
    expect(audiencePreset({ stages: [], tagIds: ["123e4567-e89b-12d3-a456-426614174000"], noAccount: false })).toBeNull();
  });
  it("tasas como en el mockup", () => {
    expect(fmtRate(0.48)).toBe("48%");
    expect(fmtRate(0.092)).toBe("9.2%");
    expect(fmtRate(0.22)).toBe("22%");
    expect(fmtRate(0)).toBe("0%");
    expect(fmtRate(1)).toBe("100%");
  });
  it("estado con fecha", () => {
    const base = { send_mode: "local", scheduled_local: "2026-12-01T07:00", scheduled_at: null, sent_at: null, updated_at: "2026-11-20T00:00:00Z" };
    expect(campaignWhen({ ...base, status: "scheduled" }, "es", "Australia/Sydney", "2026")).toBe("1 dic 7:00");
    expect(campaignWhen({ ...base, status: "scheduled", scheduled_local: "2027-01-15T18:30" }, "es", "Australia/Sydney", "2026")).toBe("15 ene 2027 18:30");
    expect(campaignWhen({ ...base, status: "sent", sent_at: "2026-11-14T02:00:00Z" }, "es", "Australia/Sydney", "2026")).toBe("14 nov");
    expect(campaignWhen({ ...base, status: "draft" }, "es", "Australia/Sydney", "2026")).toBe("");
    expect(campaignWhen({ ...base, status: "scheduled", send_mode: "now", scheduled_local: null }, "es", "Australia/Sydney", "2026")).toBe("");
  });
  it("resumen de bloques como en el mockup", () => {
    const t: BlockTexts = MC.es.blocks;
    expect(blockSummary({ type: "heading", text: "Hola, [nombre]" }, t)).toBe('Título · "Hola, [nombre]"');
    expect(blockSummary({ type: "text", text: "Uno.\n\nDos.\n\nTres." }, t)).toBe("Texto · 3 párrafos");
    expect(blockSummary({ type: "text", text: "Uno." }, t)).toBe("Texto · 1 párrafo");
    expect(blockSummary({ type: "text", text: "  " }, t)).toBe("Texto · (vacío)");
    expect(blockSummary({ type: "button", text: "Revisar mi plan de diciembre", href: "/plan" }, t)).toBe('Botón · "Revisar mi plan de diciembre" → app');
    expect(blockSummary({ type: "button", text: "Ver", href: "https://revoluciondeldinero.com" }, t)).toBe('Botón · "Ver" → web');
    expect(blockSummary({ type: "signature", text: "Jonathan" }, t)).toBe("Firma · Jonathan");
    expect(blockSummary({ type: "divider" }, t)).toBe("Separador");
  });
  it("imágenes siempre https (el motor no acepta otra cosa)", () => {
    expect(imageUrl("/cursos/curso-01.webp", "https://app.revoluciondeldinero.com/")).toBe("https://app.revoluciondeldinero.com/cursos/curso-01.webp");
    expect(imageUrl("/cursos/curso-01.webp", "http://localhost:3000")).toBe("https://app.revoluciondeldinero.com/cursos/curso-01.webp");
    expect(imageUrl("/ilustraciones/cel-hito.webp", "")).toBe("https://app.revoluciondeldinero.com/ilustraciones/cel-hito.webp");
    expect(imageUrl("https://x.com/a.png", "http://localhost:3000")).toBe("https://x.com/a.png");
    expect(BlockSchema.safeParse(newBlock("image", { image: imageUrl("/cursos/curso-02.webp", null) })).success).toBe(true);
  });
  it("bloques nuevos y correo de una persona", () => {
    expect(BlockSchema.safeParse(newBlock("divider")).success).toBe(true);
    expect(BlockSchema.safeParse(newBlock("text")).success).toBe(true);
    expect(BlockSchema.safeParse(newBlock("lesson", { lesson: { title: "Gastos hormiga", href: "/academia/curso-1/abc", course: "Curso 1" } })).success).toBe(true);
    expect(BlockSchema.safeParse(newBlock("button")).success).toBe(false); // falta el texto del botón: se llena antes de guardar
    expect(quickEmailBlocks({ heading: "", text: " Hola ", signature: "Ana" })).toEqual([{ type: "text", text: "Hola" }, { type: "signature", text: "Ana" }]);
    expect(quickEmailBlocks({ heading: "Hola, [nombre]", text: "x", signature: "" })).toHaveLength(2);
    expect(firstWord(" Jonathan González ")).toBe("Jonathan");
    expect(firstWord(null)).toBe("");
  });
  it("mover bloques", () => {
    expect(move([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(move([1, 2, 3], 2, -1)).toEqual([1, 3, 2]);
    expect(move([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(move([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });
});

describe("importar CSV", () => {
  it("reconoce columnas en español e inglés", () => {
    expect(mapHeaders(["Correo", "Nombre", "Teléfono", "País", "Etiquetas", "Consentimiento"])).toEqual({ email: 0, name: 1, phone: 2, country: 3, tags: 4, consent: 5 });
    expect(mapHeaders(["name", "EMAIL"])).toEqual({ name: 0, email: 1 });
  });
  it("consentimiento solo con un sí explícito", () => {
    for (const v of ["sí", "Si", "yes", "TRUE", "1", "x"]) expect(isYes(v), v).toBe(true);
    for (const v of ["", "no", "0", "tal vez", undefined]) expect(isYes(v), String(v)).toBe(false);
  });
  it("filas válidas, inválidas y repetidas", () => {
    const csv = "correo,nombre,telefono,pais,etiquetas,consentimiento\nAna@Correo.com,Ana Morales,0412 345 678,au,Webinar|Ruta 2026,sí\nmalo,Pepe,,,,sí\nana@correo.com,Otra,,,,\ncarlos@correo.com,Carlos,,Colombia,,";
    const r = parseContactsCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toEqual([
      { email: "ana@correo.com", name: "Ana Morales", phone: "0412 345 678", country: "AU", tags: ["Webinar", "Ruta 2026"], consent: true },
      { email: "carlos@correo.com", name: "Carlos", phone: "", country: "", tags: [], consent: false },
    ]);
    expect(r.invalid).toBe(1);
    expect(r.duplicates).toBe(1);
    expect(r.withConsent).toBe(1);
  });
  it("sin columna de consentimiento nadie acepta", () => {
    const r = parseContactsCsv("email;name\nana@correo.com;Ana");
    expect(r.ok && r.withConsent).toBe(0);
  });
  it("errores claros", () => {
    expect(parseContactsCsv("")).toEqual({ ok: false, error: "empty" });
    expect(parseContactsCsv("correo\n")).toEqual({ ok: false, error: "empty" });
    expect(parseContactsCsv("nombre,pais\nAna,AU")).toEqual({ ok: false, error: "no_email" });
    const big = ["correo", ...Array.from({ length: 1001 }, (_, i) => `p${i}@correo.com`)].join("\n");
    expect(parseContactsCsv(big)).toEqual({ ok: false, error: "too_many" });
  });
  it("separa consentimiento y quita etiquetas de sistema", () => {
    const rows = [
      { email: "a@x.com", name: "", phone: "", country: "", tags: ["Lead", "Webinar"], consent: true },
      { email: "b@x.com", name: "", phone: "", country: "", tags: ["webinar", "Primer Mes", "VIP"], consent: false },
    ];
    const s = splitImport(rows, ["Lead", "Primer mes", "Pagando", "Alumno", "Solo lectura"]);
    expect(s.withConsent.map((r) => r.email)).toEqual(["a@x.com"]);
    expect(s.without.map((r) => r.email)).toEqual(["b@x.com"]);
    expect(s.withConsent[0].tags).toEqual(["Webinar"]);
    expect(s.without[0].tags).toEqual(["webinar", "VIP"]);
    expect(s.tagNames).toEqual(["Webinar", "VIP"]); // sin repetir mayúsculas
  });
  it("tandas", () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunks([], 100)).toEqual([]);
  });
});

describe("actividad del contacto", () => {
  const x = { events: EVENT_LABELS.es, stages: STAGE_LABELS.es, tagName: (id: string) => (id === "t1" ? "Webinar" : null), sms: "SMS" };
  it("nombra etiqueta y etapa sin datos personales", () => {
    expect(describeEvent({ kind: "first_closure", ref: "" }, x)).toBe("Hizo su primer cierre de mes");
    expect(describeEvent({ kind: "tag_added", ref: "t1:2026-11-25" }, x)).toBe("Se le puso una etiqueta: Webinar");
    expect(describeEvent({ kind: "tag_added", ref: "zz:2026-11-25" }, x)).toBe("Se le puso una etiqueta");
    expect(describeEvent({ kind: "stage_changed", ref: "pagando:20261125" }, x)).toBe("Cambió de etapa: Pagando");
    expect(describeEvent({ kind: "unsubscribed", ref: "sms:2026" }, x)).toBe("Se dio de baja (SMS)");
    expect(describeEvent({ kind: "unsubscribed", ref: "email:2026" }, x)).toBe("Se dio de baja");
    expect(describeEvent({ kind: "algo_nuevo", ref: "" }, x)).toBe("algo nuevo");
  });
});

describe("automatizaciones", () => {
  const ctx: Ctx = { t: MA.es.sum, events: EVENT_LABELS.es, stages: STAGE_LABELS.es, tagName: (id) => (id === "123e4567-e89b-12d3-a456-426614174000" ? "Bienvenida completa" : "—") };
  const TAG = "123e4567-e89b-12d3-a456-426614174000";
  it("esperas como en el mockup", () => {
    expect(waitSummary({ days: 0, hours: 0 }, ctx.t)).toBe("Al instante");
    expect(waitSummary({ days: 1 }, ctx.t)).toBe("Esperar 1 día");
    expect(waitSummary({ days: 3 }, ctx.t)).toBe("Esperar 3 días");
    expect(waitSummary({ hours: 5 }, ctx.t)).toBe("Esperar 5 horas");
    expect(waitSummary({ days: 2, hours: 4 }, ctx.t)).toBe("Esperar 2 días y 4 horas");
    expect(waitSummary({ until: "charge" }, ctx.t)).toBe("Esperar hasta el cobro");
  });
  it("resumen de pasos", () => {
    const steps: Step[] = [
      { id: "a", type: "email", subject: "Tu año en un solo lugar empieza hoy", preheader: "", blocks: [{ type: "text", text: "x" }] },
      { id: "b", type: "condition", check: { type: "event", kind: "wizard_done", since: "ever" }, yes: [], no: [] },
      { id: "c", type: "tag", tagId: TAG, action: "add" },
      { id: "d", type: "sms", body: "Tu plan te espera" },
      { id: "e", type: "condition", check: { type: "has_account" }, yes: [], no: [] },
      { id: "f", type: "exit" },
    ];
    expect(steps.map((s) => stepSummary(s, ctx))).toEqual([
      'Correo · "Tu año en un solo lugar empieza hoy"', "¿Terminó el asistente?", "Etiquetar: Bienvenida completa", 'SMS · "Tu plan te espera"', "¿Creó su cuenta?", "Sale de la automatización",
    ]);
    expect(stepSummary({ id: "g", type: "condition", check: { type: "stage", stages: ["pagando", "primer_mes"] }, yes: [], no: [] }, ctx)).toBe("¿Está en Pagando / Primer mes?");
  });
  it("disparador con sus datos", () => {
    const t = MA.es.trig;
    expect(triggerSummary({ kind: "inactive_days", days: 14 }, "No abre la app en 14 días", t, ctx.tagName)).toBe("No abre la app en 14 días");
    expect(triggerSummary({ kind: "tag_added", tagId: TAG }, "Se le puso una etiqueta", t, ctx.tagName)).toBe("Se le puso una etiqueta: Bienvenida completa");
    expect(triggerSummary({ kind: "charge_upcoming", days: 3, firstOnly: true }, "Faltan 3 días para un cobro", t, ctx.tagName)).toBe("Faltan 3 días para un cobro · primer cobro");
    expect(triggerSummary({ kind: "goal_milestone", pct: 50 }, "Llegó a un hito de meta", t, ctx.tagName)).toBe("Llegó a un hito de meta · 50%");
  });
  it("frase de salida", () => {
    const t = { unsub: MA.es.exitUnsub, cancel: MA.es.exitCancel, goal: MA.es.exitGoal, or: MA.es.exitOr, never: MA.es.exitNever };
    expect(exitSentence({ onUnsubscribe: true, onCancel: true, goal: { kind: "signup" } }, t, EVENT_LABELS.es))
      .toBe("se da de baja, cancela su cuenta o ya cumplió el objetivo (creó su cuenta en la app).");
    expect(exitSentence({ onUnsubscribe: true, onCancel: false, goal: null }, t, EVENT_LABELS.es)).toBe("se da de baja.");
    expect(exitSentence({ onUnsubscribe: false, onCancel: false, goal: null }, t, EVENT_LABELS.es)).toBe("nunca sale antes de terminar.");
  });
  it("ids nuevos nunca chocan y los viejos no cambian", () => {
    let i = 0;
    const seq = [0.5, 0.5, 0.25]; // el segundo choca con el primero
    const rand = () => seq[i++ % seq.length];
    const a = newStepId([], rand);
    const b = newStepId([a], rand);
    expect(a).not.toBe(b);
    expect(/^[A-Za-z0-9_-]{1,40}$/.test(a)).toBe(true);
    const steps: Step[] = [
      { id: "x1", type: "wait", days: 1, hours: 0 },
      { id: "x2", type: "condition", check: { type: "has_account" }, yes: [{ id: "y1", type: "exit" }], no: [{ id: "n1", type: "wait", days: 2, hours: 0 }] },
    ];
    expect(stepIds(steps)).toEqual(["x1", "x2", "y1", "n1"]);
    const edited = replaceStep(steps, "n1", { id: "n1", type: "wait", days: 5, hours: 0 });
    expect(stepIds(edited)).toEqual(["x1", "x2", "y1", "n1"]);
    expect(replaceStep(steps, "y1", null)[1]).toMatchObject({ yes: [] });
    expect(replaceStep(steps, "x1", null).map((s) => s.id)).toEqual(["x2"]);
  });
  it("pasos nuevos pasan las formas del motor una vez llenos", () => {
    const taken = ["a"];
    const email = newStep("email", taken, { heading: "Hola, [nombre]", tagId: null });
    const sms = newStep("sms", taken, { heading: "", tagId: null });
    const wait = newStep("wait", taken, { heading: "", tagId: null });
    const cond = newStep("condition", taken, { heading: "", tagId: null });
    const tag = newStep("tag", taken, { heading: "", tagId: TAG });
    expect(StepsSchema.safeParse([wait, cond, tag]).success).toBe(true);
    expect(StepsSchema.safeParse([email]).success).toBe(false); // sin asunto no se guarda
    expect(StepsSchema.safeParse([{ ...email, subject: "Bienvenida" }]).success).toBe(true);
    expect(StepsSchema.safeParse([{ ...sms, body: "Hola" }]).success).toBe(true);
  });
});
