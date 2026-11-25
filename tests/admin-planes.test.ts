import { describe, expect, it } from "vitest";
import { parseMoney } from "@/lib/engine";
import {
  centsToInput, changedFeatures, checkCoupon, checkTrial, cleanCouponCode, parsePrice, priceSync, regionPatch, regionSync, sortRegions,
} from "@/app/admin/planes/lib";

describe("precio en el campo y de vuelta", () => {
  it("ida y vuelta sin perder centavos", () => {
    for (const c of [1499, 1500, 14900, 99, 1, 2_990_000, 12_900_000, 100_000_000_00, 105]) expect(parseMoney(centsToInput(c))).toBe(c);
  });
  it("sin separador de miles", () => {
    expect(centsToInput(2_990_000)).toBe("29900");
    expect(centsToInput(1499)).toBe("14.99");
    expect(centsToInput(1490)).toBe("14.90");
    expect(centsToInput(null)).toBe("");
  });
  it("vacío = sin precio; cero, negativo o texto = error", () => {
    expect(parsePrice("")).toEqual({ ok: true, cents: null });
    expect(parsePrice("  ")).toEqual({ ok: true, cents: null });
    expect(parsePrice("14,99")).toEqual({ ok: true, cents: 1499 });
    expect(parsePrice("$149")).toEqual({ ok: true, cents: 14900 });
    expect(parsePrice("0").ok).toBe(false);
    expect(parsePrice("-5").ok).toBe(false);
    expect(parsePrice("abc").ok).toBe(false);
  });
});

describe("cambios de una región", () => {
  const row = { region: "AU", monthly_cents: 1499, yearly_cents: 14900, student_discount_pct: 0 };
  it("sin cambios no escribe nada", () => expect(regionPatch(row, { region: "AU", monthly: "14.99", yearly: "149", student: "0" })).toEqual({ ok: true, patch: {} }));
  it("solo lo que cambió", () => expect(regionPatch(row, { region: "AU", monthly: "16.99", yearly: "149", student: "50" })).toEqual({ ok: true, patch: { monthly_cents: 1699, student_discount_pct: 50 } }));
  it("vaciar un precio lo deja en null", () => expect(regionPatch(row, { region: "AU", monthly: "14.99", yearly: "", student: "" })).toEqual({ ok: true, patch: { yearly_cents: null } }));
  it("errores por campo", () => {
    expect(regionPatch(row, { region: "AU", monthly: "0", yearly: "149", student: "0" })).toEqual({ ok: false, error: "monthly" });
    expect(regionPatch(row, { region: "AU", monthly: "14.99", yearly: "x", student: "0" })).toEqual({ ok: false, error: "yearly" });
    expect(regionPatch(row, { region: "AU", monthly: "14.99", yearly: "149", student: "101" })).toEqual({ ok: false, error: "student" });
    expect(regionPatch(row, { region: "AU", monthly: "14.99", yearly: "149", student: "12.5" })).toEqual({ ok: false, error: "student" });
  });
  it("orden del mockup", () => expect(sortRegions([{ region: "EU" }, { region: "NZ" }, { region: "AU" }, { region: "DEFAULT" }]).map((r) => r.region)).toEqual(["AU", "DEFAULT", "EU", "NZ"]));
});

describe("sincronía con Stripe", () => {
  it("sin monto no hay nada que sincronizar", () => expect(priceSync(null, null, null, null, "AUD")).toBe("none"));
  it("monto sin precio en Stripe = pendiente", () => expect(priceSync(1499, null, null, 1499, "AUD")).toBe("pending"));
  it("mismo monto y moneda = al día", () => expect(priceSync(1499, "price_1", { amount: 1499, currency: "aud" }, 1499, "AUD")).toBe("ok"));
  it("monto distinto o precio apagado = pendiente", () => {
    expect(priceSync(1699, "price_1", { amount: 1499, currency: "aud" }, 1699, "AUD")).toBe("pending");
    expect(priceSync(1699, "price_1", null, 1699, "AUD")).toBe("pending");
  });
  it("sin respuesta de Stripe = no se sabe", () => expect(priceSync(1499, "price_1", undefined, 1499, "AUD")).toBe("unknown"));
  it("la región toma el peor estado", () => {
    expect(regionSync(["ok", "pending"])).toBe("pending");
    expect(regionSync(["ok", "none"])).toBe("ok");
    expect(regionSync(["none", "none"])).toBe("none");
    expect(regionSync(["ok", "unknown"])).toBe("unknown");
  });
});

describe("prueba gratis", () => {
  it("días de 1 a 90", () => {
    expect(checkTrial(true, "14")).toEqual({ ok: true, trial: { enabled: true, days: 14 } });
    expect(checkTrial(false, 7)).toEqual({ ok: true, trial: { enabled: false, days: 7 } });
    expect(checkTrial(true, "0").ok).toBe(false);
    expect(checkTrial(true, "91").ok).toBe(false);
    expect(checkTrial(true, "1.5").ok).toBe(false);
  });
});

describe("qué incluye cada plan", () => {
  it("solo manda las funciones que cambiaron", () => {
    expect(changedFeatures({ plan: "free", mov: "pro" }, { plan: "free", mov: "free" })).toEqual({ mov: "free" });
    expect(changedFeatures({ plan: "free" }, { plan: "free" })).toEqual({});
  });
  it("sin valor cuenta como Gratis", () => expect(changedFeatures({}, { plan: "free", ana: "pro" })).toEqual({ ana: "pro" }));
  it("ignora funciones que esta pantalla no muestra", () => expect(changedFeatures({ csv: "pro" }, { csv: "free" })).toEqual({}));
});

describe("cupones", () => {
  it("código en mayúsculas, solo letras y números", () => expect(cleanCouponCode("webinar-50 ñ")).toBe("WEBINAR50"));
  it("0 meses = para siempre; vacío = sin límite de usos", () =>
    expect(checkCoupon({ code: "WEBINAR", pct: "50", months: "0", max: "" })).toEqual({ ok: true, coupon: { code: "WEBINAR", percent_off: 50, duration_months: null, max_redemptions: null } }));
  it("meses y usos", () =>
    expect(checkCoupon({ code: "alumnos50", pct: "50", months: "3", max: "100" })).toEqual({ ok: true, coupon: { code: "ALUMNOS50", percent_off: 50, duration_months: 3, max_redemptions: 100 } }));
  it("errores", () => {
    expect(checkCoupon({ code: "AB", pct: "50", months: "0", max: "" })).toEqual({ ok: false, error: "code" });
    expect(checkCoupon({ code: "AB-12", pct: "50", months: "0", max: "" })).toEqual({ ok: false, error: "code" });
    expect(checkCoupon({ code: "WEB", pct: "0", months: "0", max: "" })).toEqual({ ok: false, error: "pct" });
    expect(checkCoupon({ code: "WEB", pct: "101", months: "0", max: "" })).toEqual({ ok: false, error: "pct" });
    expect(checkCoupon({ code: "WEB", pct: "10", months: "37", max: "" })).toEqual({ ok: false, error: "months" });
    expect(checkCoupon({ code: "WEB", pct: "10", months: "1", max: "0" })).toEqual({ ok: false, error: "max" });
  });
});
