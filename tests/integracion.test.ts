import { describe, expect, it } from "vitest";
import { pricePatch } from "@/app/(app)/inversiones/lib";
import { couponOnlyForPlan } from "@/app/(app)/suscripcion/lib";
import { activationRedirect, type Entitlement } from "@/lib/engine";

describe("pricePatch (Inversiones y paso de saldos del Cierre)", () => {
  it("por unidades: precio por unidad en centavos con 10 decimales, como texto", () => {
    expect(pricePatch(true, "552.10", "en-AU")).toEqual({ unit_price_cents: "55210" });
    expect(pricePatch(true, "0.0004", "en-AU")).toEqual({ unit_price_cents: "0.04" });
  });
  it("por saldo: centavos enteros", () => {
    expect(pricePatch(false, "48,200.50", "en-AU")).toEqual({ balance_cents: 4820050 });
    expect(pricePatch(false, "0", "en-AU")).toEqual({ balance_cents: 0 });
  });
  it("rechaza vacío, texto y saldo negativo", () => {
    expect(pricePatch(false, "", "en-AU")).toBeNull();
    expect(pricePatch(false, "abc", "en-AU")).toBeNull();
    expect(pricePatch(false, "-5", "en-AU")).toBeNull();
    expect(pricePatch(true, "", "en-AU")).toBeNull();
  });
});

describe("couponOnlyForPlan: un cupón nunca descuenta el $1 del primer mes", () => {
  it("solo el producto del plan", () => {
    expect(couponOnlyForPlan({ applies_to: { products: ["prod_plan"] } }, "prod_plan")).toBe(true);
  });
  it("sin applies_to (cupón viejo, o pedido sin expand) no sirve", () => {
    expect(couponOnlyForPlan({}, "prod_plan")).toBe(false);
    expect(couponOnlyForPlan({ applies_to: null }, "prod_plan")).toBe(false);
    expect(couponOnlyForPlan({ applies_to: { products: [] } }, "prod_plan")).toBe(false);
    expect(couponOnlyForPlan(null, "prod_plan")).toBe(false);
  });
  it("si incluye otro producto (el del primer mes) no sirve", () => {
    expect(couponOnlyForPlan({ applies_to: { products: ["prod_plan", "prod_first"] } }, "prod_plan")).toBe(false);
    expect(couponOnlyForPlan({ applies_to: { products: ["prod_first"] } }, "prod_plan")).toBe(false);
    expect(couponOnlyForPlan({ applies_to: { products: ["prod_plan"] } }, "")).toBe(false);
  });
});

describe("cuenta sin activar: Mi perfil siempre se puede abrir", () => {
  const free: Entitlement = { state: "free", trialEndsAt: null, proUntil: null, accessUntil: null };
  it("/perfil no manda a /activar; las demás secciones sí", () => {
    expect(activationRedirect(free, "/perfil")).toBe(false);
    expect(activationRedirect(free, "/metas")).toBe(true);
  });
});
