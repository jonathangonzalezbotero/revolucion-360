import { describe, expect, it } from "vitest";
import { parseMoney } from "@/lib/engine";
import {
  BILLING_DEFAULTS, billingFrom, billingToInput, centsToInput, checkBilling, checkCoupon, couponExpiry, mergeBilling, monthlyIncome, stripeExpiry, cleanCouponCode, parsePrice, yearlyEquivalent,
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

describe("precios del plan único (app_config.billing)", () => {
  it("sin la clave: los valores aprobados ($1, $8, $80, aviso 3 días)", () => {
    expect(billingFrom(undefined)).toEqual({ first_month_cents: 100, monthly_cents: 800, yearly_cents: 8000, notify_before_days: 3, notify_first_charge: true });
    expect(billingFrom(null)).toEqual(BILLING_DEFAULTS);
  });
  it("un valor raro cae al valor por defecto; lo válido se respeta", () => {
    expect(billingFrom({ monthly_cents: 900, yearly_cents: -1, first_month_cents: 1.5, notify_before_days: 99, notify_first_charge: false }))
      .toEqual({ first_month_cents: 100, monthly_cents: 900, yearly_cents: 8000, notify_before_days: 3, notify_first_charge: false });
  });
  it("al formulario y de vuelta sin perder centavos", () => {
    const b = { ...BILLING_DEFAULTS, monthly_cents: 799 };
    expect(billingToInput(b)).toEqual({ first: "1", monthly: "7.99", yearly: "80", notifyDays: "3" });
    expect(checkBilling(billingToInput(b))).toEqual({ ok: true, values: { first_month_cents: 100, monthly_cents: 799, yearly_cents: 8000, notify_before_days: 3 } });
  });
  it("los tres precios son obligatorios y mayores a cero; aviso de 1 a 30 días", () => {
    const ok = { first: "1", monthly: "8", yearly: "80", notifyDays: "3" };
    expect(checkBilling({ ...ok, first: "" })).toEqual({ ok: false, error: "first" });
    expect(checkBilling({ ...ok, monthly: "0" })).toEqual({ ok: false, error: "monthly" });
    expect(checkBilling({ ...ok, yearly: "abc" })).toEqual({ ok: false, error: "yearly" });
    expect(checkBilling({ ...ok, notifyDays: "0" })).toEqual({ ok: false, error: "notify" });
    expect(checkBilling({ ...ok, notifyDays: "31" })).toEqual({ ok: false, error: "notify" });
    expect(checkBilling({ ...ok, notifyDays: "2.5" })).toEqual({ ok: false, error: "notify" });
  });
  it("mezcla con lo guardado: conserva notify_first_charge y claves que no conoce; solo lista lo que cambió", () => {
    const stored = { first_month_cents: 100, monthly_cents: 800, yearly_cents: 8000, notify_before_days: 3, notify_first_charge: false, stripe_price_monthly: "price_x" };
    const r = mergeBilling(stored, { first_month_cents: 100, monthly_cents: 900, yearly_cents: 8000, notify_before_days: 3 });
    expect(r.changed).toEqual(["monthly_cents"]);
    expect(r.value).toEqual({ ...stored, monthly_cents: 900 });
    expect(mergeBilling(stored, { first_month_cents: 100, monthly_cents: 800, yearly_cents: 8000, notify_before_days: 3 }).changed).toEqual([]);
  });
  it("sin la clave guardada: se escribe completa la primera vez", () => {
    const r = mergeBilling(undefined, { first_month_cents: 100, monthly_cents: 800, yearly_cents: 8000, notify_before_days: 3 });
    expect(r.changed).toHaveLength(4);
    expect(r.value).toEqual(BILLING_DEFAULTS);
  });
  it("anual equivale a $6.67 al mes y ahorra 17%", () => {
    expect(yearlyEquivalent(800, 8000)).toEqual({ perMonth: 667, savingsPct: 17 });
    expect(yearlyEquivalent(800, 12000)).toEqual({ perMonth: 1000, savingsPct: 0 });
    expect(yearlyEquivalent(0, 8000).savingsPct).toBe(0);
  });
  it("ingreso de un mes: primer mes + mensual + anual ÷ 12", () => {
    expect(monthlyIncome(BILLING_DEFAULTS, { firstMonth: 3, monthly: 10, yearly: 6 })).toBe(300 + 8000 + 4000);
    expect(monthlyIncome(BILLING_DEFAULTS, { firstMonth: 0, monthly: 0, yearly: 1 })).toBe(667);
  });
});

describe("cupones", () => {
  const TODAY = "2026-11-25";
  const base = { code: "WEBINAR", pct: "50", months: "0", max: "", appliesTo: "both", until: "" };
  const cup = (o: Partial<typeof base>) => checkCoupon({ ...base, ...o }, TODAY);
  it("código en mayúsculas, solo letras y números", () => expect(cleanCouponCode("webinar-50 ñ")).toBe("WEBINAR50"));
  it("0 meses = para siempre; vacío = sin límite de usos; ambos planes y sin vencimiento", () =>
    expect(cup({})).toEqual({ ok: true, coupon: { code: "WEBINAR", percent_off: 50, duration_months: null, max_redemptions: null, applies_to: "both", expires_at: null } }));
  it("meses, usos, plan y vencimiento (fin del día elegido)", () =>
    expect(cup({ code: "alumnos50", months: "3", max: "100", appliesTo: "month", until: "2026-12-31" })).toEqual({
      ok: true, coupon: { code: "ALUMNOS50", percent_off: 50, duration_months: 3, max_redemptions: 100, applies_to: "month", expires_at: "2026-12-31T23:59:59Z" },
    }));
  it("vence mañana sí; hoy o antes no", () => {
    expect(cup({ until: "2026-11-26" })).toMatchObject({ ok: true, coupon: { expires_at: "2026-11-26T23:59:59Z" } });
    expect(cup({ until: "2026-11-25" })).toEqual({ ok: false, error: "untilPast" });
    expect(cup({ until: "2026-01-01" })).toEqual({ ok: false, error: "untilPast" });
  });
  it("errores", () => {
    expect(cup({ code: "AB" })).toEqual({ ok: false, error: "code" });
    expect(cup({ code: "AB-12" })).toEqual({ ok: false, error: "code" });
    expect(cup({ code: "WEB", pct: "0" })).toEqual({ ok: false, error: "pct" });
    expect(cup({ code: "WEB", pct: "101" })).toEqual({ ok: false, error: "pct" });
    expect(cup({ code: "WEB", pct: "10", months: "37" })).toEqual({ ok: false, error: "months" });
    expect(cup({ code: "WEB", pct: "10", months: "1", max: "0" })).toEqual({ ok: false, error: "max" });
    expect(cup({ appliesTo: "week" })).toEqual({ ok: false, error: "applies" });
    expect(cup({ until: "2026-02-30" })).toEqual({ ok: false, error: "until" });
    expect(cup({ until: "31/12/2026" })).toEqual({ ok: false, error: "until" });
  });
  it("vencimiento para Stripe en segundos Unix", () => {
    expect(stripeExpiry(null)).toEqual({});
    expect(stripeExpiry("2026-12-31T23:59:59Z")).toEqual({ expires_at: Date.UTC(2026, 11, 31, 23, 59, 59) / 1000 });
  });
  it("columna Vence: sin fecha, fecha o vencido", () => {
    const now = new Date("2026-11-25T10:00:00Z");
    expect(couponExpiry(null, now)).toEqual({ kind: "none" });
    expect(couponExpiry("2026-12-31T23:59:59Z", now)).toEqual({ kind: "date", day: "2026-12-31" });
    expect(couponExpiry("2026-11-24T23:59:59Z", now)).toEqual({ kind: "expired", day: "2026-11-24" });
  });
});
