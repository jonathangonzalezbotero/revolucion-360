import type { Metadata } from "next";
import { DEFAULT_BENCHMARKS } from "@/lib/engine";
import { must } from "@/server/data";
import { requireAdmin } from "@/server/session";
import css from "../_shared/admin.module.css";
import { A } from "../_shared/messages";
import { asCountryLocale, benchToForm, categoriesToForm, GENERIC, isTimezone, leadToForm, legalToForm, missingFromCatalog, statusOf, termsToForm, type PayFrequency, PAY_FREQUENCIES, revOf } from "./lib";
import { M } from "./messages";
import { CountriesView, type CountryRow, type CountryEdit } from "./CountriesView";

export const metadata: Metadata = { title: "Contenido por país" };

/** Zonas del motor de JS (se arma en el servidor para que el cliente no difiera al hidratar). */
function timezones(current: string): string[] {
  let all: string[] = [];
  try { all = Intl.supportedValuesOf("timeZone"); } catch { all = []; }
  const set = new Set(all.filter(isTimezone));
  set.add("UTC");
  if (isTimezone(current)) set.add(current);
  return [...set].sort();
}

export default async function AdminPaises({ searchParams }: { searchParams: Promise<{ pais?: string | string[] }> }) {
  const s = await requireAdmin();
  const t = A[s.locale], m = M[s.locale];
  const raw = (await searchParams).pais;
  const [countriesRes, configRes] = await Promise.all([
    s.supabase.from("countries").select("code, name, currency, timezone, pay_frequency, terms, categories, benchmarks, enabled, sort, default_locale, tax_reserve_enabled, tax_reserve_note").order("sort").order("code"),
    s.supabase.from("app_config").select("key, value").in("key", ["diag_cta", "legal"]),
  ]);
  const countries = must(countriesRes);
  const config = new Map(must(configRes).map((r) => [r.key, r.value]));

  const rows: CountryRow[] = countries.map((c) => ({ code: c.code, name: c.name, currency: c.code === GENERIC ? m.userPicks : c.currency, status: statusOf(c) }));
  const wanted = typeof raw === "string" ? raw.toUpperCase() : "";
  const sel = countries.find((c) => c.code === wanted) ?? countries[0] ?? null;
  const edit: CountryEdit | null = sel ? {
    rev: revOf(JSON.stringify([sel.currency, sel.timezone, sel.pay_frequency, sel.terms, sel.categories, sel.benchmarks, sel.default_locale, sel.tax_reserve_enabled, sel.tax_reserve_note])), code: sel.code, name: sel.name, currency: sel.currency, timezone: sel.timezone, enabled: sel.enabled,
    payFrequency: (PAY_FREQUENCIES as readonly string[]).includes(sel.pay_frequency) ? (sel.pay_frequency as PayFrequency) : "monthly",
    terms: termsToForm(sel.terms), categories: categoriesToForm(sel.categories), benchmarks: benchToForm(sel.benchmarks, DEFAULT_BENCHMARKS),
    defaultLocale: asCountryLocale(sel.default_locale), taxReserveEnabled: sel.tax_reserve_enabled, taxReserveNote: sel.tax_reserve_note,
  } : null;
  const catalog = missingFromCatalog(countries.map((c) => c.code)).map((c) => ({ code: c.code, name: s.locale === "en" ? c.en : c.es, currency: c.currency }));
  const sources = countries.map((c) => ({ code: c.code, name: c.name }));

  return (
    <main className={css.page}>
      <CountriesView t={t} m={m} rows={rows} edit={edit} catalog={catalog} sources={sources}
        timezones={timezones(sel?.timezone ?? "UTC")} lead={leadToForm(config.get("diag_cta"))} legal={legalToForm(config.get("legal"))} />
    </main>
  );
}
