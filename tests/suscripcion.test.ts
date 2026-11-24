import { describe, expect, it } from "vitest";
import {
  activeGrant, canStartTrial, discounted, fromStripeAmount, toStripeAmount, invoiceInterval, isStaleEvent, isStudent, mapSubscription, monthlyEquivalent,
  pickRegion, priceFor, stateAfterSubscription, stripePriceFor, trialEnd, yearlySavingsPct, type Grant, type PriceRegion, type SubLike,
} from "@/app/(app)/suscripcion/lib";

const NOW = new Date("2026-11-24T00:00:00Z");
const sec = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

const region = (r: Partial<PriceRegion> & { region: string }): PriceRegion => ({
  currency: "USD", monthly_cents: null, yearly_cents: null, stripe_price_monthly: null, stripe_price_yearly: null, student_discount_pct: 0, ...r,
});
const REGIONS: PriceRegion[] = [
  region({ region: "AU", currency: "AUD", monthly_cents: 1299, yearly_cents: 12900, stripe_price_monthly: "price_au_m", stripe_price_yearly: "price_au_y", student_discount_pct: 30 }),
  region({ region: "DEFAULT", currency: "USD", monthly_cents: 999, yearly_cents: 9900, stripe_price_monthly: "price_d_m", stripe_price_yearly: "price_d_y" }),
  region({ region: "EU", currency: "EUR", monthly_cents: 899 }),
  region({ region: "CO", currency: "COP" }),
];

const sub = (s: Partial<SubLike>): SubLike => ({ id: "sub_1", status: "active", cancel_at_period_end: false, cancel_at: null, current_period_end: sec("2026-12-24T00:00:00Z"), interval: "month", ...s });
const g = (kind: Grant["kind"], expires_at: string | null, revoked_at: string | null = null): Grant => ({ kind, expires_at, revoked_at });

describe("precio por región", () => {
  it("usa el país si tiene región propia", () => {
    expect(pickRegion("AU", REGIONS)?.region).toBe("AU");
    expect(pickRegion("au", REGIONS)?.region).toBe("AU");
  });
  it("un país de la Unión Europea sin región propia paga con EU", () => {
    expect(pickRegion("ES", REGIONS)?.region).toBe("EU");
  });
  it("si no, DEFAULT", () => {
    expect(pickRegion("NZ", REGIONS)?.region).toBe("DEFAULT");
    expect(pickRegion("", REGIONS)?.region).toBe("DEFAULT");
    expect(pickRegion(null, REGIONS)?.region).toBe("DEFAULT");
  });
  it("sin DEFAULT ni coincidencia no hay región", () => {
    expect(pickRegion("NZ", [REGIONS[0]])).toBeNull();
  });
  it("precio vacío o cero → null (la pantalla muestra [PRECIO])", () => {
    const co = pickRegion("CO", REGIONS);
    expect(priceFor(co, "month")).toBeNull();
    expect(priceFor(region({ region: "X", monthly_cents: 0 }), "month")).toBeNull();
    expect(priceFor(pickRegion("AU", REGIONS), "year")).toBe(12900);
    expect(priceFor(null, "month")).toBeNull();
  });
  it("id del precio de Stripe por frecuencia", () => {
    const au = pickRegion("AU", REGIONS);
    expect(stripePriceFor(au, "month")).toBe("price_au_m");
    expect(stripePriceFor(au, "year")).toBe("price_au_y");
    expect(stripePriceFor(pickRegion("ES", REGIONS), "month")).toBeNull();
  });
});

describe("ahorro del anual", () => {
  it("12.99/mes contra 129/año ahorra 17%", () => {
    expect(yearlySavingsPct(1299, 12900)).toBe(17);
  });
  it("9.99/mes contra 99/año ahorra 17%", () => {
    expect(yearlySavingsPct(999, 9900)).toBe(17);
  });
  it("sin ahorro, con anual más caro o faltando un precio → null", () => {
    expect(yearlySavingsPct(1000, 12000)).toBeNull();
    expect(yearlySavingsPct(1000, 13000)).toBeNull();
    expect(yearlySavingsPct(null, 9900)).toBeNull();
    expect(yearlySavingsPct(999, null)).toBeNull();
  });
  it("equivalente mensual redondeado", () => {
    expect(monthlyEquivalent(12900)).toBe(1075);
    expect(monthlyEquivalent(9900)).toBe(825);
  });
});

describe("descuento de alumno", () => {
  it("30% de 12.99 = 9.09", () => {
    expect(discounted(1299, 30)).toBe(909);
  });
  it("limita el porcentaje entre 0 y 100", () => {
    expect(discounted(1000, 0)).toBe(1000);
    expect(discounted(1000, 150)).toBe(0);
    expect(discounted(1000, -5)).toBe(1000);
  });
  it("es alumno si tiene un acceso de alumno no retirado (aunque haya vencido)", () => {
    expect(isStudent([g("alumno", "2026-01-01T00:00:00Z")])).toBe(true);
    expect(isStudent([g("alumno", null, "2026-05-01T00:00:00Z")])).toBe(false);
    expect(isStudent([g("fundador", null)])).toBe(false);
    expect(isStudent([])).toBe(false);
  });
});

describe("suscripción de Stripe → estado del plan", () => {
  it("activa → pro con fin del periodo, frecuencia e ids", () => {
    const p = mapSubscription(sub({ interval: "year" }), [], "pro", NOW);
    expect(p).toMatchObject({ state: "pro", pro_until: "2026-12-24T00:00:00.000Z", billing_interval: "year", stripe_subscription_id: "sub_1", stripe_status: "active", cancel_at_period_end: false });
  });
  it("trialing → pro", () => {
    expect(mapSubscription(sub({ status: "trialing" }), [], "pro", NOW).state).toBe("pro");
  });
  it("past_due sigue en pro mientras Stripe reintenta", () => {
    expect(mapSubscription(sub({ status: "past_due" }), [], "pro", NOW).state).toBe("pro");
  });
  it("cancelada al final del periodo: sigue pro y lo marca (también con cancel_at del Portal)", () => {
    expect(mapSubscription(sub({ cancel_at_period_end: true }), [], "pro", NOW)).toMatchObject({ state: "pro", cancel_at_period_end: true });
    expect(mapSubscription(sub({ cancel_at: sec("2026-12-24T00:00:00Z") }), [], "pro", NOW)).toMatchObject({ state: "pro", cancel_at_period_end: true });
  });
  it("incomplete no cambia el estado (el primer pago no terminó)", () => {
    const p = mapSubscription(sub({ status: "incomplete" }), [], "pro", NOW);
    expect(p.state).toBeUndefined();
    expect(p.stripe_status).toBe("incomplete");
  });
  it.each(["canceled", "unpaid", "incomplete_expired", "paused"])("%s sin acceso gratis → solo lectura (nunca se borra nada)", (status) => {
    const p = mapSubscription(sub({ status }), [], "pro", NOW);
    expect(p.state).toBe("read_only");
    expect(p.cancel_at_period_end).toBe(false);
    expect("access_until" in p).toBe(false);
  });
  it.each(["free", "trial", "alumno", "read_only"] as const)("si venía de %s (nunca pagó o ya terminó) un fin de suscripción no cambia el estado", (prev) => {
    for (const status of ["incomplete_expired", "canceled", "unpaid"]) {
      const p = mapSubscription(sub({ status }), [], prev, NOW);
      expect(p.state).toBeUndefined();
      expect(p.stripe_status).toBe(status);
    }
  });
  it("frecuencia desconocida → null", () => {
    expect(mapSubscription(sub({ interval: "week" }), [], "pro", NOW).billing_interval).toBeNull();
  });
});

describe("a qué estado vuelve al terminar la suscripción", () => {
  it("con acceso de alumno vigente vuelve a alumno con su vencimiento", () => {
    const grants = [g("alumno", "2027-06-01T00:00:00Z")];
    expect(stateAfterSubscription(grants, NOW)).toEqual({ state: "alumno", accessUntil: "2027-06-01T00:00:00Z" });
    expect(mapSubscription(sub({ status: "canceled" }), grants, "pro", NOW)).toMatchObject({ state: "alumno", access_until: "2027-06-01T00:00:00Z" });
  });
  it("con acceso de alumno vencido o retirado → solo lectura", () => {
    expect(stateAfterSubscription([g("alumno", "2026-01-01T00:00:00Z")], NOW).state).toBe("read_only");
    expect(stateAfterSubscription([g("alumno", null, "2026-10-01T00:00:00Z")], NOW).state).toBe("read_only");
  });
  it("fundador gana sobre alumno; de por vida gana sobre una fecha", () => {
    expect(activeGrant([g("alumno", null), g("fundador", "2027-01-01T00:00:00Z")], NOW)).toEqual({ state: "fundador", accessUntil: "2027-01-01T00:00:00Z" });
    expect(activeGrant([g("alumno", "2027-01-01T00:00:00Z"), g("alumno", null)], NOW)).toEqual({ state: "alumno", accessUntil: null });
  });
  it("fundador de por vida al borrarse la suscripción", () => {
    expect(mapSubscription(sub({ status: "canceled" }), [g("fundador", null)], "pro", NOW)).toMatchObject({ state: "fundador", access_until: null });
  });
});

describe("avisos repetidos o desordenados", () => {
  it("ignora el fin de una suscripción vieja si la guardada sigue pagando", () => {
    expect(isStaleEvent("sub_new", "active", sub({ id: "sub_old", status: "canceled" }))).toBe(true);
  });
  it("no ignora avisos de la suscripción guardada ni si no hay ninguna", () => {
    expect(isStaleEvent("sub_1", "active", sub({ status: "canceled" }))).toBe(false);
    expect(isStaleEvent(null, null, sub({ status: "canceled" }))).toBe(false);
  });
  it("una suscripción nueva activa reemplaza a una vieja terminada", () => {
    expect(isStaleEvent("sub_old", "canceled", sub({ id: "sub_new", status: "active" }))).toBe(false);
  });
  it("el mismo aviso dos veces da el mismo resultado", () => {
    const a = mapSubscription(sub({}), [], "pro", NOW), b = mapSubscription(sub({}), [], "pro", NOW);
    expect(a).toEqual(b);
  });
});

describe("prueba gratis", () => {
  const trial = { enabled: true, days: 14 };
  it("solo en Gratis, una vez, y si está activada", () => {
    expect(canStartTrial(trial, { state: "free", trialUsed: false })).toBe(true);
    expect(canStartTrial(trial, { state: "free", trialUsed: true })).toBe(false);
    expect(canStartTrial(trial, { state: "read_only", trialUsed: false })).toBe(false);
    expect(canStartTrial({ enabled: false, days: 14 }, { state: "free", trialUsed: false })).toBe(false);
    expect(canStartTrial({ enabled: true, days: 0 }, { state: "free", trialUsed: false })).toBe(false);
  });
  it("termina en ahora + días", () => {
    expect(trialEnd(14, NOW)).toBe("2026-12-08T00:00:00.000Z");
  });
});

describe("historial", () => {
  it("periodo de factura de un año → anual; de un mes → mensual", () => {
    expect(invoiceInterval(sec("2026-01-01T00:00:00Z"), sec("2027-01-01T00:00:00Z"))).toBe("year");
    expect(invoiceInterval(sec("2026-01-01T00:00:00Z"), sec("2026-02-01T00:00:00Z"))).toBe("month");
    expect(invoiceInterval(null, null)).toBe("month");
  });
});

describe("montos en Stripe", () => {
  it("monedas con decimales van en centavos; sin decimales (CLP) en unidades", () => {
    expect(toStripeAmount(1299, "aud")).toBe(1299);
    expect(toStripeAmount(1299000, "COP")).toBe(1299000);
    expect(toStripeAmount(990000, "CLP")).toBe(9900);
    expect(fromStripeAmount(9900, "clp")).toBe(990000);
    expect(fromStripeAmount(1299, "USD")).toBe(1299);
  });
});
