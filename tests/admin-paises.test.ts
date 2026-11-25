import { describe, expect, it } from "vitest";
import { DEFAULT_BENCHMARKS } from "@/lib/engine";
import {
  benchToForm, categoriesToForm, colorFor, isCountryCode, isCurrencyCode, isHttpUrl, isTimezone, leadToForm, legalToForm,
  mergeBenchmarks, mergeCategories, mergeDiagCta, mergeLegalConfig, mergeTerms, missingFromCatalog, nextSort, revOf, statusOf, termsToForm,
} from "@/app/admin/paises/lib";

const AU_BENCH = { surplus: { good: 0.1, warn: 0 }, saving: { good: 0.15, warn: 0.05 }, debt: { good: 0.15, warn: 0.3 }, emergency: { good: 3, warn: 1 }, dependency: { good: 0.7, warn: 0.9 } };

describe("validaciones", () => {
  it("zona horaria real", () => {
    expect(isTimezone("Australia/Sydney")).toBe(true);
    expect(isTimezone("America/Argentina/Buenos_Aires")).toBe(true);
    expect(isTimezone("UTC")).toBe(true);
    expect(isTimezone("Marte/Base")).toBe(false);
    expect(isTimezone("")).toBe(false);
  });
  it("moneda ISO de 3 letras", () => {
    expect(isCurrencyCode("AUD")).toBe(true);
    expect(isCurrencyCode("COP")).toBe(true);
    expect(isCurrencyCode("aud")).toBe(false);
    expect(isCurrencyCode("AU")).toBe(false);
    expect(isCurrencyCode("ZZZ")).toBe(false);
  });
  it("solo enlaces http/https", () => {
    expect(isHttpUrl("https://revoluciondeldinero.com/clase")).toBe(true);
    expect(isHttpUrl("http://x.co")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("data:text/html,hi")).toBe(false);
    expect(isHttpUrl("revoluciondeldinero.com")).toBe(false);
  });
  it("código de país", () => {
    expect(isCountryCode("CO")).toBe(true);
    expect(isCountryCode("co")).toBe(false);
    expect(isCountryCode("OTHER")).toBe(false);
  });
});

describe("estado y orden", () => {
  it("genérico, publicado, borrador", () => {
    expect(statusOf({ code: "OTHER", enabled: true })).toBe("generic");
    expect(statusOf({ code: "AU", enabled: true })).toBe("published");
    expect(statusOf({ code: "CO", enabled: false })).toBe("draft");
  });
  it("un país nuevo siempre queda antes que el genérico", () => {
    expect(nextSort([{ code: "AU", sort: 0 }, { code: "OTHER", sort: 99 }])).toBe(1);
    expect(nextSort([{ code: "AU", sort: 98 }, { code: "OTHER", sort: 99 }])).toBe(98);
    expect(nextSort([{ code: "OTHER", sort: 99 }])).toBe(0);
  });
  it("catálogo sin los que ya existen", () => {
    const codes = missingFromCatalog(["AU", "OTHER", "CO"]).map((c) => c.code);
    expect(codes).not.toContain("AU");
    expect(codes).not.toContain("CO");
    expect(codes).toContain("CL");
  });
  it("huella estable", () => {
    expect(revOf("abc")).toBe(revOf("abc"));
    expect(revOf("abc")).not.toBe(revOf("abd"));
  });
});

describe("términos", () => {
  it("mezcla: conserva claves desconocidas y quita las vacías", () => {
    const raw = { retirement: "Super", freelance: "ABN", extra: "x" };
    expect(mergeTerms(raw, { retirement: " Superannuation ", freelance: "", bnpl: "Afterpay", tax_office: "ATO", company: "Pty Ltd" }))
      .toEqual({ retirement: "Superannuation", extra: "x", bnpl: "Afterpay", tax_office: "ATO", company: "Pty Ltd" });
  });
  it("formulario", () => {
    expect(termsToForm({ retirement: "Super", raro: 1 })).toEqual({ retirement: "Super", freelance: "", bnpl: "", tax_office: "", company: "" });
  });
});

describe("referencias del diagnóstico", () => {
  it("de la base al formulario en % y meses", () => {
    const f = benchToForm(AU_BENCH, DEFAULT_BENCHMARKS);
    expect(f.saving).toEqual({ good: "15", warn: "5" });
    expect(f.emergency).toEqual({ good: "3", warn: "1" });
    expect(f.dependency).toEqual({ good: "70", warn: "90" });
  });
  it("faltan datos → referencias generales", () => {
    expect(benchToForm({}, DEFAULT_BENCHMARKS).debt).toEqual({ good: "15", warn: "30" });
  });
  it("ida y vuelta sin pérdida y conservando claves extra", () => {
    const raw = { ...AU_BENCH, otra: { a: 1 }, saving: { good: 0.15, warn: 0.05, nota: "x" } };
    const r = mergeBenchmarks(raw, benchToForm(raw, DEFAULT_BENCHMARKS));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.saving).toEqual({ good: 0.15, warn: 0.05, nota: "x" });
      expect(r.value.otra).toEqual({ a: 1 });
      expect(r.value.emergency).toEqual({ good: 3, warn: 1 });
    }
  });
  it("acepta coma decimal", () => {
    const f = benchToForm(AU_BENCH, DEFAULT_BENCHMARKS);
    const r = mergeBenchmarks(AU_BENCH, { ...f, saving: { good: "12,5", warn: "5" } });
    expect(r.ok && (r.value.saving as { good: number }).good).toBe(0.125);
  });
  it("bueno tiene que ser mejor que atención según la dirección", () => {
    const f = benchToForm(AU_BENCH, DEFAULT_BENCHMARKS);
    expect(mergeBenchmarks(AU_BENCH, { ...f, saving: { good: "5", warn: "15" } })).toEqual({ ok: false, error: "order", key: "saving" });
    expect(mergeBenchmarks(AU_BENCH, { ...f, debt: { good: "30", warn: "15" } })).toEqual({ ok: false, error: "order", key: "debt" });
    expect(mergeBenchmarks(AU_BENCH, { ...f, debt: { good: "15", warn: "15" } }).ok).toBe(true);
  });
  it("números inválidos o fuera de rango", () => {
    const f = benchToForm(AU_BENCH, DEFAULT_BENCHMARKS);
    expect(mergeBenchmarks(AU_BENCH, { ...f, saving: { good: "abc", warn: "5" } })).toEqual({ ok: false, error: "number", key: "saving" });
    expect(mergeBenchmarks(AU_BENCH, { ...f, emergency: { good: "40", warn: "1" } })).toEqual({ ok: false, error: "number", key: "emergency" });
    expect(mergeBenchmarks(AU_BENCH, { ...f, surplus: { good: "10", warn: "-5" } }).ok).toBe(true);
  });
});

describe("categorías sugeridas", () => {
  const raw = [
    { name: "Ingresos", kind: "income", color: "#141612" },
    { name: "Hogar y básicos", kind: "expense", color: "#141612", is_basic: true },
    { name: "Vehículo", kind: "expense", color: "#6FA898" },
    { name: "Deudas", kind: "debt", color: "#C46A2A" },
  ];
  it("formulario con su posición en la base", () => {
    const f = categoriesToForm(raw);
    expect(f[1]).toEqual({ name: "Hogar y básicos", kind: "expense", basic: true, from: 1 });
    expect(categoriesToForm([{ name: "X", kind: "raro" }, "basura"])).toEqual([]);
  });
  it("conserva color e is_basic, renombra, quita y agrega con un color existente", () => {
    const r = mergeCategories(raw, [
      { name: "Ingresos", kind: "income", from: 0 },
      { name: "Casa y básicos", kind: "expense", from: 1 },
      { name: "HECS-HELP", kind: "debt", from: null },
      { name: "Afterpay / Zip", kind: "goal", from: null },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value[1]).toEqual({ name: "Casa y básicos", kind: "expense", color: "#141612", is_basic: true });
      expect(r.value[2]).toEqual({ name: "HECS-HELP", kind: "debt", color: "#C46A2A" });
      expect(r.value[3].color).toBe("#141612");
      expect(r.value).toHaveLength(4);
    }
  });
  it("errores", () => {
    expect(mergeCategories(raw, [])).toEqual({ ok: false, error: "catEmpty" });
    expect(mergeCategories(raw, [{ name: "  ", kind: "expense", from: null }])).toEqual({ ok: false, error: "catName" });
    expect(mergeCategories(raw, [{ name: "Deudas", kind: "debt", from: 3 }, { name: "deudas", kind: "debt", from: null }])).toEqual({ ok: false, error: "catDup" });
    expect(mergeCategories([], [{ name: "Nueva", kind: "expense", from: null }])).toEqual({ ok: false, error: "catColor" });
  });
  it("is_basic solo se escribe si cambió", () => {
    const r = mergeCategories(raw, [
      { name: "Hogar y básicos", kind: "expense", from: 1, basic: false },
      { name: "Vehículo", kind: "expense", from: 2, basic: false },
      { name: "Salud", kind: "expense", from: null, basic: true },
    ]);
    expect(r.ok && r.value).toEqual([
      { name: "Hogar y básicos", kind: "expense", color: "#141612", is_basic: false },
      { name: "Vehículo", kind: "expense", color: "#6FA898" },
      { name: "Salud", kind: "expense", color: "#141612", is_basic: true },
    ]);
  });
  it("color de una nueva", () => {
    expect(colorFor("debt", raw)).toBe("#C46A2A");
    expect(colorFor("saving", raw)).toBe("#141612");
    expect(colorFor("saving", [])).toBeNull();
  });
});

describe("app_config", () => {
  const cta = { lead: { title: "A", text: "B", url: "https://x.co", button: "C", extra: 1 }, student: { title: "S", text: "T", button: "U" }, otro: true };
  it("diag_cta: solo cambia lead y conserva student y claves extra", () => {
    expect(leadToForm(cta)).toEqual({ title: "A", text: "B", url: "https://x.co", button: "C" });
    const out = mergeDiagCta(cta, { title: " Nueva ", text: "", url: "https://y.co", button: "Ver" });
    expect(out).toEqual({ lead: { title: "Nueva", text: "", url: "https://y.co", button: "Ver", extra: 1 }, student: cta.student, otro: true });
  });
  it("legal: marcadores como vacío; vacío quita la clave; conserva las demás", () => {
    const raw = { company: "[RAZÓN SOCIAL]", abn: "12 345", contact: "a@b.co", updated: "[FECHA]", otra: "x" };
    const f = legalToForm(raw);
    expect(f).toEqual({ company: "", abn: "12 345", contact: "a@b.co", address: "", updated: "", version: "" });
    expect(mergeLegalConfig(raw, { ...f, company: "RD Pty Ltd", version: "1.0" })).toEqual({ abn: "12 345", contact: "a@b.co", otra: "x", company: "RD Pty Ltd", version: "1.0" });
  });
});
