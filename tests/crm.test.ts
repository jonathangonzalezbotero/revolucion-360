// CRM: a quién, cuándo y cuántas veces se envía (src/lib/crm). Sin base de datos ni red.
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  advance, AUDIENCE_PRESETS, AudienceSchema, BlocksSchema, campaignSendAt, campaignStartsAt, chargeRef, chargeWindow, compile, enrollmentRef, evaluate,
  exitFor, ExitRulesSchema, formKey, inactiveRef, inactiveWindow, IngestSchema, isUpcomingCharge, legalReady, matchesTrigger, MAX_ATTEMPTS, mayMarket,
  maySms, parseTestNumbers, personalize, renderMarketingEmail, renderSms, resolveTz, retryAt, smsSendAt, stageFor, StepsSchema, tagRefs,
  toE164, TriggerSchema, unsubscribeHeaders, unsubscribeUrl, waitUntil, zonedToUtc,
  type ConsentFacts, type Facts, type Step,
} from "@/lib/crm";
import { smsKeyword, twilioSignature, verifySvix, verifyTwilio } from "@/lib/crm/sign";

const at = (s: string) => new Date(s);
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

describe("etapa = etiqueta de sistema según el estado de la cuenta", () => {
  it("lead sin cuenta o sin activar; primer mes en prueba de Stripe; pagando; alumno; solo lectura", () => {
    expect(stageFor({ hasUser: false, state: "pro", stripeStatus: "active" })).toBe("lead");
    expect(stageFor({ hasUser: true, state: "free", stripeStatus: null })).toBe("lead");
    expect(stageFor({ hasUser: true, state: "pro", stripeStatus: "trialing" })).toBe("primer_mes");
    expect(stageFor({ hasUser: true, state: "trial", stripeStatus: null })).toBe("primer_mes");
    expect(stageFor({ hasUser: true, state: "pro", stripeStatus: "active" })).toBe("pagando");
    expect(stageFor({ hasUser: true, state: "pro", stripeStatus: "past_due" })).toBe("pagando");
    expect(stageFor({ hasUser: true, state: "alumno", stripeStatus: null })).toBe("alumno");
    expect(stageFor({ hasUser: true, state: "fundador", stripeStatus: null })).toBe("alumno");
    expect(stageFor({ hasUser: true, state: "read_only", stripeStatus: "canceled" })).toBe("solo_lectura");
    expect(stageFor({ hasUser: true, state: null, stripeStatus: null })).toBe("lead");
  });
});

describe("consentimiento: se revisa justo antes de enviar", () => {
  const base: ConsentFacts = { emailConsent: true, emailUnsubscribedAt: null, smsConsent: true, smsUnsubscribedAt: null, phone: "+61412345678", emailSuppressed: false, smsSuppressed: false };
  it("correo solo con consentimiento, sin baja y sin supresión", () => {
    expect(mayMarket("email", base)).toEqual({ ok: true });
    expect(mayMarket("email", { ...base, emailConsent: false })).toEqual({ ok: false, reason: "no_consent" });
    expect(mayMarket("email", { ...base, emailConsent: false, emailUnsubscribedAt: "2026-11-01T00:00:00Z" })).toEqual({ ok: false, reason: "unsubscribed" });
    expect(mayMarket("email", { ...base, emailSuppressed: true })).toEqual({ ok: false, reason: "suppressed" });
  });
  it("SMS exige teléfono, consentimiento propio y que no haya respondido STOP", () => {
    expect(mayMarket("sms", base)).toEqual({ ok: true });
    expect(mayMarket("sms", { ...base, phone: null })).toEqual({ ok: false, reason: "no_phone" });
    expect(mayMarket("sms", { ...base, smsConsent: false })).toEqual({ ok: false, reason: "no_consent" });
    expect(mayMarket("sms", { ...base, smsSuppressed: true })).toEqual({ ok: false, reason: "suppressed" });
    // El consentimiento de correo no sirve para SMS
    expect(mayMarket("sms", { ...base, smsConsent: false, emailConsent: true }).ok).toBe(false);
  });
  it("fuera de producción, SMS solo a los números de prueba", () => {
    const test = parseTestNumbers("+61400000001, nope ,+61400000002");
    expect(test).toEqual(["+61400000001", "+61400000002"]);
    expect(maySms("+61400000001", false, test)).toBe(true);
    expect(maySms("+61412345678", false, test)).toBe(false);
    expect(maySms("+61412345678", true, [])).toBe(true);
    expect(maySms("0412345678", true, [])).toBe(false);
  });
});

describe("reintentos con tope", () => {
  it("10, 20 y 40 minutos; después del intento 3 ya no se reintenta", () => {
    const now = at("2026-11-25T00:00:00Z");
    expect(retryAt(1, now)?.toISOString()).toBe("2026-11-25T00:10:00.000Z");
    expect(retryAt(2, now)?.toISOString()).toBe("2026-11-25T00:20:00.000Z");
    expect(retryAt(MAX_ATTEMPTS, now)).toBeNull();
  });
});

describe("detecciones por tiempo", () => {
  const now = at("2026-11-25T10:00:00Z");
  it("no abre la app en X días: ventana de 3 días y una vez por periodo de inactividad", () => {
    expect(inactiveWindow(now, 14)).toEqual({ from: "2026-11-08T10:00:00.000Z", to: "2026-11-11T10:00:00.000Z" });
    expect(inactiveRef(14, "2026-11-10T22:00:00Z")).toBe("14:2026-11-10");
    // El ref cambia si vuelve a entrar y se vuelve a ir: otra vez cuenta
    expect(inactiveRef(14, "2026-12-01T10:00:00Z")).not.toBe(inactiveRef(14, "2026-11-10T22:00:00Z"));
  });
  it("faltan X días para un cobro: solo suscripciones que siguen; el primero se distingue", () => {
    expect(chargeWindow(now, 3)).toEqual({ from: "2026-11-25T10:00:00.000Z", to: "2026-11-28T10:00:00.000Z" });
    expect(chargeRef(3, "2026-11-27T05:00:00Z", true)).toBe("3:2026-11-27:first");
    const e = { state: "pro", stripeStatus: "trialing", cancelAtPeriodEnd: false, proUntil: "2026-11-27T05:00:00Z" };
    expect(isUpcomingCharge(e)).toBe(true);
    expect(isUpcomingCharge({ ...e, cancelAtPeriodEnd: true })).toBe(false);
    expect(isUpcomingCharge({ ...e, stripeStatus: "past_due" })).toBe(false);
    expect(isUpcomingCharge({ ...e, state: "read_only" })).toBe(false);
  });
});

describe("hora de cada persona", () => {
  it("7:00 en Sydney (verano, +11), Bogotá (-5) y Londres (+0)", () => {
    expect(zonedToUtc("2026-12-01T07:00", "Australia/Sydney").toISOString()).toBe("2026-11-30T20:00:00.000Z");
    expect(zonedToUtc("2026-07-01T07:00", "Australia/Sydney").toISOString()).toBe("2026-06-30T21:00:00.000Z"); // invierno, +10
    expect(zonedToUtc("2026-12-01T07:00", "America/Bogota").toISOString()).toBe("2026-12-01T12:00:00.000Z");
    expect(zonedToUtc("2026-12-01T07:00", "Europe/London").toISOString()).toBe("2026-12-01T07:00:00.000Z");
  });
  it("cambio de horario: una hora que no existe cae en la siguiente; una que existe dos veces, en la primera", () => {
    // Sydney adelanta el reloj el 4 oct 2026 a las 2:00 (pasa a 3:00): las 2:30 no existen → 3:30 AEDT
    expect(zonedToUtc("2026-10-04T02:30", "Australia/Sydney").toISOString()).toBe("2026-10-03T16:30:00.000Z");
    // Sydney atrasa el reloj el 5 abr 2026 a las 3:00 (vuelve a 2:00): las 2:30 pasan dos veces → la primera (AEDT)
    expect(zonedToUtc("2026-04-05T02:30", "Australia/Sydney").toISOString()).toBe("2026-04-04T15:30:00.000Z");
  });
  it("una campaña programada empieza cuando la primera zona del mundo llega a la hora, y a cada quien le sale a su hora", () => {
    expect(campaignStartsAt("2026-12-01T07:00").toISOString()).toBe("2026-11-30T17:00:00.000Z"); // Kiritimati, +14
    const now = at("2026-11-30T17:05:00Z");
    expect(campaignSendAt("local", "2026-12-01T07:00", "Australia/Sydney", now).toISOString()).toBe("2026-11-30T20:00:00.000Z");
    expect(campaignSendAt("local", "2026-12-01T07:00", "America/Bogota", now).toISOString()).toBe("2026-12-01T12:00:00.000Z");
    expect(campaignSendAt("local", "2026-12-01T07:00", "Pacific/Kiritimati", now)).toEqual(now); // ya pasó: sale ya
    expect(campaignSendAt("now", null, "Australia/Sydney", now)).toEqual(now);
  });
  it("zona del contacto, si no la de su país, si no Sydney", () => {
    expect(resolveTz("America/Bogota", "Australia/Sydney")).toBe("America/Bogota");
    expect(resolveTz(null, "America/Mexico_City")).toBe("America/Mexico_City");
    expect(resolveTz("Nope/Zone", null)).toBe("Australia/Sydney");
  });
  it("SMS nunca de noche: fuera de 9:00–20:00 espera a las 9:00 siguientes", () => {
    expect(smsSendAt(at("2026-11-25T03:00:00Z"), "Australia/Sydney").toISOString()).toBe("2026-11-25T03:00:00.000Z"); // 14:00 en Sydney
    expect(smsSendAt(at("2026-11-25T11:00:00Z"), "Australia/Sydney").toISOString()).toBe("2026-11-25T22:00:00.000Z"); // 22:00 → 9:00 del 26
    expect(smsSendAt(at("2026-11-25T18:00:00Z"), "Australia/Sydney").toISOString()).toBe("2026-11-25T22:00:00.000Z"); // 5:00 → 9:00 del mismo día
  });
  it("esperar N días u horas, o hasta el cobro", () => {
    const now = at("2026-11-25T10:00:00Z");
    expect(waitUntil({ days: 1 }, now, null).toISOString()).toBe("2026-11-26T10:00:00.000Z");
    expect(waitUntil({ days: 0, hours: 3 }, now, null).toISOString()).toBe("2026-11-25T13:00:00.000Z");
    expect(waitUntil({ until: "charge" }, now, "2026-11-28T00:00:00Z").toISOString()).toBe("2026-11-28T00:00:00.000Z");
    expect(waitUntil({ until: "charge" }, now, null)).toEqual(now);
  });
});

describe("teléfono a E.164", () => {
  it("con +, con 00, nacional con el país del perfil, y lo que no se puede saber", () => {
    expect(toE164("+61 412 345 678")).toBe("+61412345678");
    expect(toE164("0061 412 345 678")).toBe("+61412345678");
    expect(toE164("0412 345 678", "AU")).toBe("+61412345678");
    expect(toE164("300 123 4567", "CO")).toBe("+573001234567");
    expect(toE164("573001234567", "CO")).toBe("+573001234567");
    expect(toE164("0412 345 678", "OTHER")).toBeNull();
    expect(toE164("0412 345 678")).toBeNull();
    expect(toE164("hola")).toBeNull();
    expect(toE164("+12")).toBeNull();
  });
});

describe("disparadores y salidas", () => {
  it("cada disparador con sus parámetros en el ref del evento", () => {
    expect(matchesTrigger({ kind: "first_month_paid" }, { kind: "first_month_paid", ref: "sub_1" })).toBe(true);
    expect(matchesTrigger({ kind: "first_month_paid" }, { kind: "paying", ref: "sub_1" })).toBe(false);
    expect(matchesTrigger({ kind: "inactive_days", days: 14 }, { kind: "inactive_days", ref: "14:2026-11-10" })).toBe(true);
    expect(matchesTrigger({ kind: "inactive_days", days: 14 }, { kind: "inactive_days", ref: "7:2026-11-10" })).toBe(false);
    expect(matchesTrigger({ kind: "charge_upcoming", days: 3, firstOnly: true }, { kind: "charge_upcoming", ref: "3:2026-11-27:first" })).toBe(true);
    expect(matchesTrigger({ kind: "charge_upcoming", days: 3, firstOnly: true }, { kind: "charge_upcoming", ref: "3:2026-11-27:renew" })).toBe(false);
    expect(matchesTrigger({ kind: "tag_added", tagId: U1 }, { kind: "tag_added", ref: `${U1}:2026-11-25` })).toBe(true);
    expect(matchesTrigger({ kind: "tag_added", tagId: U1 }, { kind: "tag_added", ref: `${U2}:2026-11-25` })).toBe(false);
    expect(matchesTrigger({ kind: "web_form", form: "Ruta 2026" }, { kind: "web_form", ref: "ruta-2026:20261125" })).toBe(true);
    expect(matchesTrigger({ kind: "web_form" }, { kind: "web_form", ref: "lo-que-sea:1" })).toBe(true);
    expect(matchesTrigger({ kind: "goal_milestone", pct: 50 }, { kind: "goal_milestone", ref: `${U1}:50` })).toBe(true);
    expect(matchesTrigger({ kind: "goal_milestone", pct: 50 }, { kind: "goal_milestone", ref: `${U1}:75` })).toBe(false);
  });
  it("un mismo hecho inscribe una sola vez (ref de la inscripción)", () => {
    expect(enrollmentRef({ kind: "payment_failed", ref: "2026-11-25T00:00:00.000Z" })).toBe("payment_failed:2026-11-25T00:00:00.000Z");
  });
  it("sale si se da de baja del correo, si su suscripción termina o si cumplió el objetivo", () => {
    const rules = ExitRulesSchema.parse({ goal: { kind: "signup" } });
    const trig = { kind: "diagnostic_done" } as const;
    expect(exitFor(rules, trig, { kind: "unsubscribed", ref: "email:1" })).toBe("unsubscribed");
    expect(exitFor(rules, trig, { kind: "unsubscribed", ref: "sms:1" })).toBeNull();
    expect(exitFor(rules, trig, { kind: "subscription_ended", ref: "sub" })).toBe("cancelled");
    expect(exitFor(rules, trig, { kind: "signup", ref: "" })).toBe("goal");
    expect(exitFor(rules, trig, { kind: "wizard_done", ref: "" })).toBeNull();
    // "Reactivar solo lectura" empieza justo cuando termina la suscripción: eso no lo saca
    expect(exitFor(rules, { kind: "subscription_ended" }, { kind: "subscription_ended", ref: "sub" })).toBeNull();
    expect(exitFor({ onUnsubscribe: false, onCancel: false, goal: null }, trig, { kind: "unsubscribed", ref: "email:1" })).toBeNull();
  });
});

describe("pasos: el flujo Bienvenida del mockup", () => {
  const blocks = [{ type: "text", text: "Hola" }] as const;
  const steps = StepsSchema.parse([
    { id: "w0", type: "wait" },
    { id: "m1", type: "email", subject: "Tu año en un solo lugar empieza hoy", blocks },
    { id: "w1", type: "wait", days: 1 },
    { id: "c1", type: "condition", check: { type: "event", kind: "wizard_done" }, no: [{ id: "m2", type: "email", subject: "Te faltan 5 minutos para tu plan", blocks }] },
    { id: "w2", type: "wait", days: 3 },
    { id: "m3", type: "email", subject: "Tu primer cierre de mes, paso a paso", blocks },
    { id: "t1", type: "tag", tagId: U1 },
  ]) as Step[];
  const p = compile(steps);
  const facts = (over: Partial<Facts> = {}): Facts => ({
    hasAccount: true, stage: "primer_mes", tagIds: new Set(), events: new Map(), enrolledAt: "2026-11-25T00:00:00.000Z", lastActiveAt: null, chargeAt: null, ...over,
  });
  it("al instante: correo 1 y espera 1 día", () => {
    const now = at("2026-11-25T00:00:00Z");
    const r = advance(p, p.first, facts(), now);
    expect(r.actions.map((a) => a.step.id)).toEqual(["m1"]);
    expect(r.outcome).toEqual({ status: "active", nextStepId: "c1", nextAt: at("2026-11-26T00:00:00Z") });
  });
  it("no terminó el asistente: correo 2; sí lo terminó: se lo salta", () => {
    const now = at("2026-11-26T00:00:00Z");
    expect(advance(p, "c1", facts(), now).actions.map((a) => a.step.id)).toEqual(["m2"]);
    const done = facts({ events: new Map([["wizard_done", ["2026-11-25T05:00:00.000Z"]]]) });
    const r = advance(p, "c1", done, now);
    expect(r.actions).toEqual([]);
    expect(r.outcome).toEqual({ status: "active", nextStepId: "m3", nextAt: at("2026-11-29T00:00:00Z") });
  });
  it("al final: correo 3, etiqueta y termina", () => {
    const r = advance(p, "m3", facts(), at("2026-11-29T00:00:00Z"));
    expect(r.actions.map((a) => `${a.type}:${a.step.id}`)).toEqual(["email:m3", "tag:t1"]);
    expect(r.outcome).toEqual({ status: "done" });
  });
  it("si editaron la automatización y el paso ya no existe, sale", () => {
    expect(advance(p, "borrado", facts(), at("2026-11-29T00:00:00Z")).outcome).toEqual({ status: "missing" });
  });
  it("salir en una rama (Lead del diagnóstico: ¿creó su cuenta? sí → salir)", () => {
    const q = compile(StepsSchema.parse([
      { id: "c", type: "condition", check: { type: "has_account" }, yes: [{ id: "x", type: "exit" }] },
      { id: "m", type: "email", subject: "Prueba un mes por $1", blocks },
    ]) as Step[]);
    expect(advance(q, q.first, facts({ hasAccount: true }), at("2026-11-25T00:00:00Z"))).toEqual({ actions: [], outcome: { status: "done" } });
    expect(advance(q, q.first, facts({ hasAccount: false }), at("2026-11-25T00:00:00Z")).actions.map((a) => a.step.id)).toEqual(["m"]);
  });
  it("condiciones: evento desde que entró, etapa, volvió a la app, etiqueta", () => {
    const f = facts({ events: new Map([["first_closure", ["2026-11-20T00:00:00.000Z"]]]), lastActiveAt: "2026-11-26T00:00:00.000Z", tagIds: new Set([U2]) });
    expect(evaluate({ type: "event", kind: "first_closure", since: "ever" }, f)).toBe(true);
    expect(evaluate({ type: "event", kind: "first_closure", since: "enrolled" }, f)).toBe(false);
    expect(evaluate({ type: "stage", stages: ["pagando"] }, f)).toBe(false);
    expect(evaluate({ type: "active_since_enrolled" }, f)).toBe(true);
    expect(evaluate({ type: "has_tag", tagId: U2 }, f)).toBe(true);
  });
});

describe("etiquetas de una automatización", () => {
  it("los pasos y condiciones usan etiquetas propias; el disparador puede usar una de sistema", () => {
    const steps = StepsSchema.parse([
      { id: "t", type: "tag", tagId: U1 },
      { id: "c", type: "condition", check: { type: "has_tag", tagId: U2 }, yes: [{ id: "t2", type: "tag", tagId: U1, action: "remove" }] },
    ]) as Step[];
    expect(tagRefs({ kind: "tag_added", tagId: U2 }, steps)).toEqual({ own: [U1, U2], any: [U2] });
    expect(tagRefs({ kind: "wizard_done" }, [])).toEqual({ own: [], any: [] });
  });
});

describe("formas validadas (zod)", () => {
  it("bloques: enlaces solo https o rutas de la app", () => {
    expect(BlocksSchema.safeParse([{ type: "button", text: "Revisar mi plan", href: "/plan" }]).success).toBe(true);
    expect(BlocksSchema.safeParse([{ type: "button", text: "x", href: "https://revoluciondeldinero.com/clase" }]).success).toBe(true);
    expect(BlocksSchema.safeParse([{ type: "button", text: "x", href: "javascript:alert(1)" }]).success).toBe(false);
    expect(BlocksSchema.safeParse([{ type: "button", text: "x", href: "//evil.com" }]).success).toBe(false);
    expect(BlocksSchema.safeParse([{ type: "image", src: "http://inseguro.com/a.png" }]).success).toBe(false);
    expect(BlocksSchema.safeParse([{ type: "nope" }]).success).toBe(false);
  });
  it("pasos con ids únicos; disparadores con sus parámetros", () => {
    expect(StepsSchema.safeParse([{ id: "a", type: "wait" }, { id: "a", type: "exit" }]).success).toBe(false);
    expect(TriggerSchema.safeParse({ kind: "inactive_days" }).success).toBe(false);
    expect(TriggerSchema.safeParse({ kind: "inactive_days", days: 14 }).success).toBe(true);
    expect(TriggerSchema.safeParse({ kind: "tag_added" }).success).toBe(false);
  });
  it("públicos del mockup", () => {
    for (const a of Object.values(AUDIENCE_PRESETS)) expect(AudienceSchema.parse(a)).toEqual(a);
    expect(AudienceSchema.parse({})).toEqual({ stages: [], tagIds: [], noAccount: false });
  });
  it("ingreso de leads: sin campos de más, correo en minúsculas, consentimiento desmarcado por defecto", () => {
    const ok = IngestSchema.parse({ email: " Ana@Correo.com ", source: "webinar", sourceDetail: "Ordena tu plata en 2027" });
    expect(ok.email).toBe("ana@correo.com");
    expect(ok.consent).toEqual({ email: false, sms: false });
    expect(IngestSchema.safeParse({ email: "a@b.co", amount: 100 }).success).toBe(false);
    expect(IngestSchema.safeParse({ email: "no-es-correo" }).success).toBe(false);
    expect(formKey("Ruta 2026 · Diagnóstico")).toBe("ruta-2026-diagnostico");
  });
});

describe("correo de marketing (Spam Act)", () => {
  const legal = { company: "Revolución del Dinero Pty Ltd", abn: "12 345 678 901", address: "1 George St, Sydney NSW 2000" };
  const r = renderMarketingEmail({
    subject: "Tu diciembre sin sustos", preheader: "Lo que yo hago", locale: "es", appUrl: "https://app.revoluciondeldinero.com/", name: "Ana María", legal,
    token: "a".repeat(64), fromLabel: "Jonathan · Revolución 360",
    blocks: [
      { type: "heading", text: "Hola, [nombre]" }, { type: "text", text: "Uno <b>dos</b>\n\nTres" },
      { type: "button", text: "Revisar mi plan de diciembre", href: "/plan" }, { type: "signature", text: "Jonathan" },
    ],
  });
  it("personaliza, escapa el HTML y vuelve absolutas las rutas de la app", () => {
    expect(r.html).toContain("Hola, Ana");
    expect(r.html).not.toContain("<b>dos</b>");
    expect(r.html).toContain("&lt;b&gt;dos&lt;/b&gt;");
    expect(r.html).toContain('href="https://app.revoluciondeldinero.com/plan"');
    expect(r.text).toContain("Revisar mi plan de diciembre: https://app.revoluciondeldinero.com/plan");
  });
  it("lleva razón social, ABN, dirección, baja y preferencias", () => {
    for (const s of [r.html, r.text]) {
      expect(s).toContain("Revolución del Dinero Pty Ltd, ABN 12 345 678 901 · 1 George St, Sydney NSW 2000");
      expect(s).toContain(unsubscribeUrl("https://app.revoluciondeldinero.com", "a".repeat(64)).replace(/&/g, s === r.html ? "&amp;" : "&"));
      expect(s).toContain("/correo/preferencias?t=");
      expect(s).toContain("Darte de baja");
      expect(s).toContain("Elegir qué correos recibo");
    }
    expect(unsubscribeHeaders("https://x/u")).toEqual({ "List-Unsubscribe": "<https://x/u>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
  });
  it("sin nombre, el saludo queda limpio", () => {
    expect(personalize("Hola, [nombre]", "")).toBe("Hola");
    expect(personalize("[Nombre], mira esto", null)).toBe("mira esto");
    expect(personalize("Hi [name]!", "Laura Gómez")).toBe("Hi Laura!");
  });
  it("sin datos legales reales no sale marketing", () => {
    expect(legalReady(legal)).toBe(true);
    expect(legalReady({ company: "[RAZÓN SOCIAL]", abn: "[ABN]", address: "[DIRECCIÓN]" })).toBe(false);
    expect(legalReady({ ...legal, address: "" })).toBe(false);
  });
  it("SMS con remitente y STOP", () => {
    expect(renderSms("Hola [nombre], tu plan te espera.", "es", "Ana")).toBe("Revolución 360: Hola Ana, tu plan te espera. Responde STOP para no recibir más.");
    expect(renderSms("Your plan is waiting.", "en", null)).toContain("Reply STOP to opt out.");
  });
  it("nunca un monto ni un signo de dinero en lo que arma el CRM por su cuenta", () => {
    const empty = renderMarketingEmail({ subject: "S", preheader: "", blocks: [{ type: "text", text: "Hola" }], locale: "en", appUrl: "https://a", name: null, legal, token: null, fromLabel: "" });
    expect(empty.html).not.toMatch(/\$\s?\d/);
  });
});

describe("firmas de los webhooks", () => {
  it("Svix (Resend): firma válida, inválida y vieja", () => {
    const secretRaw = Buffer.from("secreto-de-prueba-123456");
    const secret = `whsec_${secretRaw.toString("base64")}`;
    const body = JSON.stringify({ type: "email.opened", data: { email_id: "abc" } });
    const now = at("2026-11-25T00:00:00Z");
    const ts = String(Math.floor(now.getTime() / 1000));
    const sig = createHmac("sha256", secretRaw).update(`msg_1.${ts}.${body}`).digest("base64");
    expect(verifySvix({ id: "msg_1", timestamp: ts, signature: `v1,${sig}`, body, secret, now })).toBe(true);
    expect(verifySvix({ id: "msg_1", timestamp: ts, signature: `v1,otra v1,${sig}`, body, secret, now })).toBe(true);
    expect(verifySvix({ id: "msg_1", timestamp: ts, signature: `v1,${sig}`, body: body + " ", secret, now })).toBe(false);
    expect(verifySvix({ id: "msg_1", timestamp: ts, signature: `v1,${sig}`, body, secret, now: at("2026-11-25T00:06:00Z") })).toBe(false);
    expect(verifySvix({ id: null, timestamp: ts, signature: `v1,${sig}`, body, secret, now })).toBe(false);
  });
  it("Twilio: ejemplo de su documentación", () => {
    const url = "https://mycompany.com/myapp.php?foo=1&bar=2";
    const params = { CallSid: "CA1234567890ABCDE", Caller: "+12349013030", Digits: "1234", From: "+12349013030", To: "+18005551212" };
    expect(twilioSignature(url, params, "12345")).toBe("0/KCTR6DLpKmkAf8muzZqo1nDgQ=");
    expect(verifyTwilio({ url, params, signature: "0/KCTR6DLpKmkAf8muzZqo1nDgQ=", authToken: "12345" })).toBe(true);
    expect(verifyTwilio({ url, params: { ...params, Digits: "9" }, signature: "0/KCTR6DLpKmkAf8muzZqo1nDgQ=", authToken: "12345" })).toBe(false);
    expect(verifyTwilio({ url, params, signature: null, authToken: "12345" })).toBe(false);
  });
  it("palabras STOP y START", () => {
    expect(smsKeyword(" stop ")).toBe("stop");
    expect(smsKeyword("Baja")).toBe("stop");
    expect(smsKeyword("START")).toBe("start");
    expect(smsKeyword("hola, stop por favor")).toBeNull();
  });
});
