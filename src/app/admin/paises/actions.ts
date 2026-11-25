"use server";
import { z } from "zod";
import { fill } from "@/i18n";
import type { Json } from "@/lib/supabase/database.types";
import { fail, ok } from "@/server/action";
import { must } from "@/server/data";
import type { Session } from "@/server/session";
import { adminAction, adminText, audit } from "../_shared/server";
import {
  BENCH_KEYS, CATALOG, CATEGORY_KINDS, COUNTRY_LOCALES, GENERIC, TAX_NOTE_MAX, asCountryLocale, cleanTaxNote, LEGAL_KEYS, PAY_FREQUENCIES, TERM_KEYS, isCountryCode, isCurrencyCode, isHttpUrl, isTimezone,
  mergeBenchmarks, mergeCategories, mergeDiagCta, mergeLegalConfig, mergeTerms, nextSort,
} from "./lib";
import { M } from "./messages";

// Lo que lee cada dato: términos (deudas, inversiones, perfil, bienvenida), categorías (asistente, plan), referencias (diagnóstico).
const COUNTRY_PATHS = ["/admin/paises", "/admin/actividad", "/diagnostico", "/inicio", "/bienvenida", "/perfil", "/deudas", "/inversiones"];
const CTA_PATHS = ["/admin/paises", "/admin/actividad", "/diagnostico", "/inicio"];
const LEGAL_PATHS = ["/admin/paises", "/admin/actividad", "/legal/terminos", "/legal/privacidad", "/inicio"];

const Code = z.string().trim().toUpperCase().refine((v) => isCountryCode(v) || v === GENERIC);

async function loadCountry(s: Session, code: string) {
  return must(await s.supabase.from("countries").select("code, name, terms, categories, benchmarks, pay_frequency, enabled, default_locale, tax_reserve_enabled, tax_reserve_note").eq("code", code).maybeSingle());
}

/** Crea un país del catálogo como borrador (enabled = false), copiando el contenido de otro país. */
export async function createCountry(input: unknown) {
  return adminAction(COUNTRY_PATHS, async (s) => {
    const m = M[s.locale];
    const p = z.object({ code: z.string().trim().toUpperCase(), copyFrom: Code }).safeParse(input);
    if (!p.success) return fail(m.errors.code);
    const entry = CATALOG.find((c) => c.code === p.data.code);
    if (!entry) return fail(m.errors.code);
    const all = must(await s.supabase.from("countries").select("code, sort"));
    if (all.some((c) => c.code === entry.code)) return fail(m.errors.exists);
    const src = (await loadCountry(s, p.data.copyFrom)) ?? (await loadCountry(s, GENERIC));
    const { data, error } = await s.supabase.from("countries").insert({
      code: entry.code, name: entry.es, currency: entry.currency, timezone: entry.timezone, locale_number: entry.locale,
      pay_frequency: src?.pay_frequency ?? "monthly",
      terms: (src?.terms ?? {}) as NonNullable<Json>, categories: (src?.categories ?? []) as NonNullable<Json>, benchmarks: (src?.benchmarks ?? {}) as NonNullable<Json>,
      // Idioma y apartado de impuestos de independientes: también se copian del país de origen.
      default_locale: asCountryLocale(src?.default_locale), tax_reserve_enabled: src?.tax_reserve_enabled ?? true, tax_reserve_note: src?.tax_reserve_note ?? "",
      enabled: false, sort: nextSort(all),
    }).select("code").single();
    if (error) return fail(error.code === "23505" ? m.errors.exists : adminText(s).errors.generic);
    await audit(s, "pais_crear", null, { code: data.code, name: entry.es });
    return ok(data.code);
  });
}

const Bench = z.object(Object.fromEntries(BENCH_KEYS.map((k) => [k, z.object({ good: z.string().max(12), warn: z.string().max(12) })])) as Record<(typeof BENCH_KEYS)[number], z.ZodObject<{ good: z.ZodString; warn: z.ZodString }>>);
const SaveCountry = z.object({
  code: Code,
  currency: z.string().trim().toUpperCase(),
  timezone: z.string().trim().max(64),
  payFrequency: z.enum(PAY_FREQUENCIES),
  terms: z.object(Object.fromEntries(TERM_KEYS.map((k) => [k, z.string().max(40)])) as Record<(typeof TERM_KEYS)[number], z.ZodString>),
  categories: z.array(z.object({ name: z.string().max(60), kind: z.enum(CATEGORY_KINDS), from: z.number().int().min(0).max(1000).nullable(), basic: z.boolean() })).max(40),
  benchmarks: Bench,
  defaultLocale: z.enum(COUNTRY_LOCALES),
  taxReserveEnabled: z.boolean(),
  taxReserveNote: z.string().max(TAX_NOTE_MAX),
});

/** Guarda moneda, zona, frecuencia, términos, categorías y referencias. Todo se mezcla sobre la fila actual. */
export async function saveCountry(input: unknown) {
  return adminAction(COUNTRY_PATHS, async (s) => {
    const m = M[s.locale];
    const p = SaveCountry.safeParse(input);
    if (!p.success) {
      const path = String(p.error.issues[0]?.path[0] ?? "");
      return fail(path === "taxReserveNote" ? m.errors.taxNote : path === "defaultLocale" ? m.errors.locale : path === "terms" ? m.errors.term : path === "payFrequency" ? m.errors.freq : path === "categories" ? m.errors.catName : adminText(s).errors.generic);
    }
    const d = p.data;
    if (!isCurrencyCode(d.currency)) return fail(m.errors.currency);
    if (!isTimezone(d.timezone)) return fail(m.errors.timezone);
    const cur = await loadCountry(s, d.code);
    if (!cur) return fail(adminText(s).errors.generic);
    const bench = mergeBenchmarks(cur.benchmarks, d.benchmarks);
    if (!bench.ok) return fail(fill(m.errors[bench.error], { name: m.bench[bench.key] }));
    const cats = mergeCategories(cur.categories, d.categories);
    if (!cats.ok) return fail(m.errors[cats.error]);
    must(await s.supabase.from("countries").update({
      currency: d.currency, timezone: d.timezone, pay_frequency: d.payFrequency,
      terms: mergeTerms(cur.terms, d.terms), categories: cats.value as NonNullable<Json>, benchmarks: bench.value as NonNullable<Json>,
      default_locale: d.defaultLocale, tax_reserve_enabled: d.taxReserveEnabled, tax_reserve_note: cleanTaxNote(d.taxReserveNote),
    }).eq("code", d.code).select("code").single());
    await audit(s, "pais_editar", null, { code: d.code, name: cur.name });
    return ok(undefined);
  });
}

/** Publica o pasa a borrador. Nunca se borra un país; el genérico no se apaga (es el respaldo de todos). */
export async function setCountryEnabled(input: unknown) {
  return adminAction(COUNTRY_PATHS, async (s) => {
    const m = M[s.locale];
    const p = z.object({ code: Code, enabled: z.boolean() }).safeParse(input);
    if (!p.success) return fail(adminText(s).errors.generic);
    if (p.data.code === GENERIC && !p.data.enabled) return fail(m.errors.generic);
    const row = must(await s.supabase.from("countries").update({ enabled: p.data.enabled }).eq("code", p.data.code).select("code, name").single());
    await audit(s, p.data.enabled ? "pais_publicar" : "pais_ocultar", null, { code: row.code, name: row.name });
    return ok(undefined);
  });
}

/** Upsert de una fila de app_config (lee la actual primero: se mezcla, nunca se reemplaza a ciegas). */
async function readConfig(s: Session, key: string): Promise<unknown> {
  return must(await s.supabase.from("app_config").select("value").eq("key", key).maybeSingle())?.value ?? {};
}
async function writeConfig(s: Session, key: string, value: unknown) {
  must(await s.supabase.from("app_config").upsert({ key, value: value as NonNullable<Json>, updated_at: new Date().toISOString() }, { onConflict: "key" }).select("key").single());
}

/** Clase gratuita del Diagnóstico (`diag_cta.lead`). `student` no se toca. */
export async function saveDiagCta(input: unknown) {
  return adminAction(CTA_PATHS, async (s) => {
    const m = M[s.locale];
    const p = z.object({ title: z.string().max(120), text: z.string().max(400), url: z.string().trim().max(500), button: z.string().max(40) }).safeParse(input);
    if (!p.success) return fail(m.errors.long);
    if (p.data.url && !isHttpUrl(p.data.url)) return fail(m.errors.url);
    await writeConfig(s, "diag_cta", mergeDiagCta(await readConfig(s, "diag_cta"), p.data));
    await audit(s, "config_clase_gratuita", null, {});
    return ok(undefined);
  });
}

/** Datos legales (`legal`): razón social, ABN, contacto, dirección, fecha y versión. */
export async function saveLegal(input: unknown) {
  return adminAction(LEGAL_PATHS, async (s) => {
    const m = M[s.locale];
    const p = z.object(Object.fromEntries(LEGAL_KEYS.map((k) => [k, z.string().max(k === "address" ? 200 : 120)])) as Record<(typeof LEGAL_KEYS)[number], z.ZodString>).safeParse(input);
    if (!p.success) return fail(m.errors.long);
    await writeConfig(s, "legal", mergeLegalConfig(await readConfig(s, "legal"), p.data));
    await audit(s, "config_legal", null, {});
    return ok(undefined);
  });
}
