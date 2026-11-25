// Correos automáticos, tareas programadas y avisos: lógica pura (src/lib/email/lib.ts y templates.ts).
import { describe, expect, it } from "vitest";
import {
  allowsApp, allowsEmail, canGetCloseReminder, closeReminderPeriod, closureStreakBefore, currentWeekOf, escapeHtml, expiryBucket, expiryRef,
  expiryTransition, grantRef, isClosed, mayEmail, paymentRef, periodRef, readPrefs, safeToday, streakToSave,
} from "@/lib/email/lib";
import { accessEmail, closeEmail, grantEmail, paymentEmail, renderEmail, welcomeEmail, type AnyEmail } from "@/lib/email/templates";
import { nextStateOnExpiry, type ISODate } from "@/lib/engine";

const APP = "https://app.revoluciondeldinero.com";
const at = (s: string) => new Date(s);

describe("preferencias", () => {
  it("por defecto: recordatorio de cierre sí, últimos días del mes, correo y notificación", () => {
    const p = readPrefs({});
    expect(p.notify.close).toBe(true);
    expect(p.closeDay).toBe("last");
    expect(p.channel).toBe("both");
    expect(allowsEmail(p) && allowsApp(p)).toBe(true);
    expect(readPrefs(null).channel).toBe("both");
  });
  it("respeta el canal elegido", () => {
    expect(allowsEmail(readPrefs({ channel: "app" }))).toBe(false);
    expect(allowsApp(readPrefs({ channel: "app" }))).toBe(true);
    expect(allowsApp(readPrefs({ channel: "email" }))).toBe(false);
    expect(readPrefs({ notify: { close: false } }).notify.close).toBe(false);
    expect(readPrefs({ close_day: "nope" }).closeDay).toBe("last");
  });
});

describe("día de cierre en la zona horaria de cada usuario", () => {
  it("'last': desde que empiezan los últimos 10 días del mes; recuerda ese mismo mes", () => {
    expect(closeReminderPeriod("2026-11-20", "last")).toBeNull();
    expect(closeReminderPeriod("2026-11-21", "last")).toEqual({ year: 2026, month: 11 });
    expect(closeReminderPeriod("2026-11-30", "last")).toEqual({ year: 2026, month: 11 });
    expect(closeReminderPeriod("2026-02-19", "last")).toEqual({ year: 2026, month: 2 }); // febrero de 28 días
    expect(closeReminderPeriod("2026-12-01", "last")).toBeNull();
  });
  it("'first': primeros 5 días del mes siguiente; recuerda el mes que terminó (cruza el año)", () => {
    expect(closeReminderPeriod("2027-01-01", "first")).toEqual({ year: 2026, month: 12 });
    expect(closeReminderPeriod("2026-12-05", "first")).toEqual({ year: 2026, month: 11 });
    expect(closeReminderPeriod("2026-12-06", "first")).toBeNull();
    expect(closeReminderPeriod("2026-11-30", "first")).toBeNull();
  });
  it("el mismo instante es otro día según la zona: Sydney ya está en el último tramo, Bogotá no", () => {
    const now = at("2026-11-20T22:00:00Z"); // 21 nov 9:00 en Sydney · 20 nov 17:00 en Bogotá
    expect(closeReminderPeriod(safeToday("Australia/Sydney", now), "last")).toEqual({ year: 2026, month: 11 });
    expect(closeReminderPeriod(safeToday("America/Bogota", now), "last")).toBeNull();
    const dec1 = at("2026-11-30T22:00:00Z"); // 1 dic en Sydney · 30 nov en Bogotá
    expect(closeReminderPeriod(safeToday("Australia/Sydney", dec1), "first")).toEqual({ year: 2026, month: 11 });
    expect(closeReminderPeriod(safeToday("America/Bogota", dec1), "first")).toBeNull();
  });
  it("una zona inválida no rompe el lote", () => {
    expect(safeToday("Marte/Olimpo", at("2026-11-24T00:00:00Z"))).toBe("2026-11-24");
    expect(safeToday(null, at("2026-11-24T00:00:00Z"))).toBe("2026-11-24");
  });
  it("mes cerrado, reabierto y racha de cierres", () => {
    const rows = [
      { year: 2026, month: 9, reopened_at: null }, { year: 2026, month: 10, reopened_at: null },
      { year: 2026, month: 11, reopened_at: "2026-11-25T00:00:00Z" },
    ];
    expect(isClosed(rows, { year: 2026, month: 10 })).toBe(true);
    expect(isClosed(rows, { year: 2026, month: 11 })).toBe(false); // reabierto = abierto
    expect(closureStreakBefore(rows, { year: 2026, month: 11 })).toBe(2);
    expect(closureStreakBefore([{ year: 2026, month: 12, reopened_at: null }], { year: 2027, month: 1 })).toBe(1);
    expect(periodRef({ year: 2026, month: 3 })).toBe("2026-03");
  });
  it("el recordatorio es Pro por defecto; Admin puede ponerlo Gratis o apagar la sección", () => {
    expect(canGetCloseReminder("free", {}, "on", "free")).toBe(false);
    expect(canGetCloseReminder("pro", {}, "on", "pro")).toBe(true);
    expect(canGetCloseReminder("free", { cierre: "free" }, "on", "free")).toBe(true);
    expect(canGetCloseReminder("pro", {}, "off", "pro")).toBe(false);
    expect(canGetCloseReminder("pro", {}, "on", "read_only")).toBe(false); // solo lectura no puede cerrar
  });
});

describe("vencimientos", () => {
  const now = at("2026-11-24T10:00:00Z");
  it("ventana de 30 y 7 días", () => {
    expect(expiryBucket("2026-12-24T10:00:00Z", now)).toBe(30); // 30 días
    expect(expiryBucket("2026-12-25T10:00:00Z", now)).toBeNull(); // 31 días
    expect(expiryBucket("2026-12-02T10:00:00Z", now)).toBe(30); // 8 días
    expect(expiryBucket("2026-12-01T10:00:00Z", now)).toBe(7);
    expect(expiryBucket("2026-11-24T12:00:00Z", now)).toBe(7); // vence hoy más tarde
    expect(expiryBucket("2026-11-24T09:00:00Z", now)).toBeNull(); // ya venció
    expect(expiryBucket(null, now)).toBeNull(); // de por vida
  });
  it("transición de estados igual que nextStateOnExpiry del motor", () => {
    const base = { trialEndsAt: null, proUntil: null, accessUntil: null, stripeStatus: null };
    const trial = { ...base, state: "trial" as const, trialEndsAt: "2026-11-20T00:00:00Z" };
    const alumno = { ...base, state: "alumno" as const, accessUntil: "2026-11-23T00:00:00Z" };
    const pro = { ...base, state: "pro" as const, proUntil: "2026-11-01T00:00:00Z" };
    expect(expiryTransition(trial, [], now)).toEqual({ state: nextStateOnExpiry(trial, now) });
    expect(expiryTransition(trial, [], now)?.state).toBe("free");
    expect(expiryTransition(alumno, [], now)?.state).toBe("free");
    expect(expiryTransition(pro, [], now)?.state).toBe("read_only");
    expect(expiryTransition({ ...alumno, accessUntil: "2027-01-01T00:00:00Z" }, [], now)).toBeNull(); // vigente
    expect(expiryTransition({ ...base, state: "free" }, [], now)).toBeNull();
    expect(expiryTransition({ ...base, state: "fundador" }, [], now)).toBeNull();
  });
  it("Pro con Stripe todavía cobrando no pasa a solo lectura", () => {
    const pro = { state: "pro" as const, trialEndsAt: null, proUntil: "2026-11-01T00:00:00Z", accessUntil: null };
    for (const s of ["active", "trialing", "past_due"]) expect(expiryTransition({ ...pro, stripeStatus: s }, [], now)).toBeNull();
    expect(expiryTransition({ ...pro, stripeStatus: "canceled" }, [], now)?.state).toBe("read_only");
  });
  it("si tiene otro acceso gratis vigente, pasa a ese (nunca pierde datos ni acceso)", () => {
    const pro = { state: "pro" as const, trialEndsAt: null, proUntil: "2026-11-01T00:00:00Z", accessUntil: null, stripeStatus: "canceled" };
    expect(expiryTransition(pro, [{ kind: "fundador", expires_at: null, revoked_at: null }], now)).toEqual({ state: "fundador", accessUntil: null });
    const alumno = { state: "alumno" as const, trialEndsAt: null, proUntil: null, accessUntil: "2026-11-23T00:00:00Z", stripeStatus: null };
    expect(expiryTransition(alumno, [{ kind: "alumno", expires_at: "2026-11-23T00:00:00Z", revoked_at: null }], now)?.state).toBe("free");
    expect(expiryTransition(alumno, [{ kind: "alumno", expires_at: "2027-06-01T00:00:00Z", revoked_at: null }], now)).toEqual({ state: "alumno", accessUntil: "2027-06-01T00:00:00Z" });
  });
});

describe("racha", () => {
  const rows = (weeks: ISODate[], wild: ISODate[] = []) => [...weeks.map((w) => ({ weekStart: w, wildcard: false })), ...wild.map((w) => ({ weekStart: w, wildcard: true }))];
  const thisWeek = "2026-11-23"; // lunes
  it("racha de 2+ semanas, semana pasada vacía y comodín disponible → se puede salvar", () => {
    expect(streakToSave(rows(["2026-11-09", "2026-11-02", "2026-10-26"]), thisWeek)).toEqual({ missedWeek: "2026-11-16", weeks: 3 });
  });
  it("no avisa si registró la semana pasada, si la racha era de 1 o si ya gastó el comodín de ese mes", () => {
    expect(streakToSave(rows(["2026-11-16", "2026-11-09"]), thisWeek)).toBeNull();
    expect(streakToSave(rows(["2026-11-09"]), thisWeek)).toBeNull();
    expect(streakToSave(rows(["2026-11-09", "2026-11-02"], ["2026-11-02"]), thisWeek)).toBeNull();
    expect(streakToSave(rows(["2026-11-09", "2026-11-02"], ["2026-10-19"]), thisWeek)).toEqual({ missedWeek: "2026-11-16", weeks: 2 });
  });
  it("la semana se calcula en la zona del usuario", () => {
    const mondayUtc = at("2026-11-23T21:00:00Z"); // martes 8:00 en Sydney, lunes 16:00 en Bogotá: misma semana
    expect(currentWeekOf("Australia/Sydney", mondayUtc)).toBe("2026-11-23");
    expect(currentWeekOf("America/Bogota", mondayUtc)).toBe("2026-11-23");
  });
});

describe("plantillas", () => {
  const all: AnyEmail[] = [
    { kind: "welcome", data: { locale: "es", appUrl: APP, name: "Ana María" } },
    { kind: "close_reminder", data: { locale: "es", appUrl: APP, period: { year: 2026, month: 11 }, streak: 3, points: 30, showStreak: true } },
    { kind: "access_expiring", data: { locale: "es", appUrl: APP, until: "2027-03-01", daysLeft: 7, discountPct: 30 } },
    { kind: "payment_failed", data: { locale: "es", appUrl: APP, failedOn: "2026-11-24" } },
    { kind: "access_granted", data: { locale: "es", appUrl: APP, name: "Ana María", kind: "alumno", until: "2027-11-30" } },
    { kind: "access_granted", data: { locale: "es", appUrl: APP, name: "", kind: "fundador", until: null } },
  ];
  const withEn = [...all, ...all.map((e) => ({ ...e, data: { ...e.data, locale: "en" as const } }) as AnyEmail)];
  /** Texto visible del HTML (sin etiquetas ni estilos). */
  const visible = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ");
  const MONEY = [/\$/, /€|£/, /\b(AUD|USD|COP|MXN|EUR|NZD|GBP|CAD|CLP|PEN|ARS)\b/, /\d+[.,]\d{2}\b/, /\d{1,3}(,\d{3})+/, /\[PRECIO\]|\[MONTO\]/];

  it("ningún correo lleva montos ni datos financieros (ni en el HTML visible ni en el texto)", () => {
    for (const e of withEn) {
      const r = renderEmail(e);
      for (const text of [visible(r.html), r.text, r.subject]) for (const re of MONEY) expect(text, `${e.kind}/${e.data.locale}: ${re}`).not.toMatch(re);
    }
  });
  it("textos del mockup en español y enlace a preferencias en todos", () => {
    expect(welcomeEmail(all[0].data as never).subject).toBe("Tu año en un solo lugar empieza hoy");
    const w = welcomeEmail(all[0].data as never);
    expect(w.html).toContain("Hola, Ana. Qué bueno tenerte aquí.");
    expect(w.html).toContain(`${APP}/asistente`);
    const c = closeEmail(all[1].data as never);
    expect(c.subject).toBe("5 minutos para cerrar noviembre");
    expect(c.html).toContain("Noviembre se acaba. ¿Cómo te fue?");
    expect(c.html).toContain("3 cierres");
    expect(c.html).toContain("+30 puntos");
    expect(c.html).toContain("ajustas diciembre");
    const a = accessEmail(all[2].data as never);
    expect(a.subject).toBe("Tu acceso de alumno termina en 7 días");
    expect(a.html).toContain("Tu acceso de alumno termina el 1 de marzo.");
    expect(a.html).toContain("30% de descuento");
    expect(accessEmail({ ...(all[2].data as never as Parameters<typeof accessEmail>[0]), discountPct: null }).html).not.toContain("descuento");
    const p = paymentEmail(all[3].data as never);
    expect(p.html).toContain("rechazada el 24 de noviembre");
    expect(p.html).toContain("no se puede desactivar");
    for (const e of withEn) {
      const r = renderEmail(e);
      expect(r.html).toContain(`${APP}/perfil#notificaciones`);
      expect(r.html).toContain(`${APP}/brand/logo-360-dark.png`);
      expect(r.html).toMatch(/max-width:600px/);
      expect(r.html).toContain(`lang="${e.data.locale}"`);
    }
  });
  it("inglés según profiles.locale", () => {
    const c = closeEmail({ ...(all[1].data as never as Parameters<typeof closeEmail>[0]), locale: "en" });
    expect(c.subject).toBe("5 minutes to close November");
    expect(c.html).toContain("November is ending. How did it go?");
  });
  it("con close_day 'first' el mes ya terminó: el título lo dice en pasado", () => {
    const d = all[1].data as never as Parameters<typeof closeEmail>[0];
    expect(closeEmail({ ...d, late: true }).html).toContain("Noviembre ya terminó. ¿Cómo te fue?");
    expect(closeEmail({ ...d, late: true, locale: "en" }).html).toContain("November is over. How did it go?");
  });
  it("sin logros encendidos no muestra racha ni puntos; mes reabierto no promete puntos", () => {
    const d = all[1].data as never as Parameters<typeof closeEmail>[0];
    expect(closeEmail({ ...d, showStreak: false }).html).not.toContain("Racha actual");
    expect(closeEmail({ ...d, points: null }).html).not.toContain("puntos");
  });
  it("escapa el nombre del usuario", () => {
    const w = welcomeEmail({ locale: "es", appUrl: APP, name: "<script>x</script>" });
    expect(w.html).not.toContain("<script>");
    expect(escapeHtml(`"a"&'b'`)).toBe("&quot;a&quot;&amp;&#39;b&#39;");
  });
});

describe("envío seguro e idempotente", () => {
  it("fuera de producción solo a @revolucion360.test", () => {
    expect(mayEmail("demo@revolucion360.test", false)).toBe(true);
    expect(mayEmail("DEMO@Revolucion360.TEST ", false)).toBe(true);
    expect(mayEmail("alguien@gmail.com", false)).toBe(false);
    expect(mayEmail("alguien@gmail.com", true)).toBe(true);
    expect(mayEmail("", true)).toBe(false);
  });
  it("el ref es estable: misma entrada → mismo ref; otra fecha u otra ventana → otro ref", () => {
    expect(expiryRef("2027-03-01T13:00:00Z", 7)).toBe("2027-03-01-7");
    expect(expiryRef("2027-03-01T13:00:00Z", 7)).toBe(expiryRef("2027-03-01T13:00:00.000Z", 7));
    expect(expiryRef("2027-03-01T13:00:00Z", 30)).not.toBe(expiryRef("2027-03-01T13:00:00Z", 7));
    expect(paymentRef("2026-11-24T05:06:07+00:00")).toBe(paymentRef("2026-11-24T05:06:07.000Z"));
    expect(paymentRef("2026-11-24T05:06:07Z")).not.toBe(paymentRef("2026-12-24T05:06:07Z"));
    // El cierre de un mes tiene un solo ref, lo mande la ventana "last" o "first".
    expect(periodRef(closeReminderPeriod("2026-11-25", "last")!)).toBe(periodRef(closeReminderPeriod("2026-12-02", "first")!));
  });
});

describe("aviso de acceso gratis dado desde el panel", () => {
  it("dice qué acceso tiene y hasta cuándo, sin montos", () => {
    const r = grantEmail({ locale: "es", appUrl: APP, name: "Ana María", kind: "alumno", until: "2027-11-30" });
    expect(r.subject).toBe("Tienes acceso completo a Revolución 360");
    expect(r.html).toContain("Hola, Ana. Tienes acceso completo.");
    expect(r.html).toContain("acceso de alumno a todo Revolución 360 hasta el 30 de noviembre de 2027.");
    expect(r.text).toContain("Te avisamos antes de que venza.");
    expect(r.html).toContain(`${APP}/inicio`);
  });
  it("de por vida, fundador y en inglés", () => {
    expect(grantEmail({ locale: "es", appUrl: APP, name: "", kind: "fundador", until: null }).html).toContain("acceso de fundador a todo Revolución 360, de por vida.");
    const en = grantEmail({ locale: "en", appUrl: APP, name: "Ana", kind: "alumno", until: "2027-03-01" });
    expect(en.subject).toBe("You have full access to Revolución 360");
    expect(en.html).toContain("student access to all of Revolución 360 until March 1, 2027.");
    expect(en.html).toContain('lang="en"');
  });
  it("escapa el nombre", () => {
    expect(grantEmail({ locale: "es", appUrl: APP, name: "<b>x</b>", kind: "alumno", until: null }).html).not.toContain("<b>x</b>");
  });
  it("ref: el mismo acceso el mismo día no se repite; otra fecha u otro día, sí", () => {
    expect(grantRef("2026-11-25", "alumno", "2027-11-25")).toBe("2026-11-25-alumno-2027-11-25");
    expect(grantRef("2026-11-25", "alumno", null)).toBe("2026-11-25-alumno-vida");
    expect(grantRef("2026-11-25", "alumno", "2027-11-25")).not.toBe(grantRef("2026-11-25", "alumno", "2028-02-25"));
    expect(grantRef("2026-11-25", "alumno", null)).not.toBe(grantRef("2026-11-26", "alumno", null));
    expect(grantRef("2026-11-25", "alumno", null)).not.toBe(grantRef("2026-11-25", "fundador", null));
  });
});
