import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getConfig, type AppConfig } from "./config";
import { asLocale, type Locale } from "@/i18n";
import { COMMON, type Common } from "@/i18n/common";
import { canEdit, hasFeature, parts, tierOf, todayIn, type Entitlement, type FeatureKey, type ISODate, type MoneyFormat, type PlanState, type Tier } from "@/lib/engine";

export type Profile = {
  id: string; email: string; name: string; country: string; currency: string; timezone: string; locale: Locale;
  role: "user" | "admin"; terms: Record<string, string>; prefs: Record<string, unknown>;
  movLevel: "plan" | "totals" | "detail"; payFrequency: "weekly" | "fortnightly" | "monthly";
  onboardingStep: string; wizard: Record<string, unknown>; firstSteps: Record<string, boolean>; suspended: boolean; createdAt: string;
};
export type Session = {
  userId: string;
  aal: "aal1" | "aal2";
  profile: Profile;
  entitlement: Entitlement & { state: PlanState; trialUsed: boolean; billingInterval: string | null; cancelAtPeriodEnd: boolean; paymentFailedAt: string | null; hasStripe: boolean };
  tier: Tier;
  canEdit: boolean;          // false en solo lectura o suspendido
  isAdmin: boolean;
  config: AppConfig;
  locale: Locale;
  t: Common;                 // textos compartidos
  fmt: MoneyFormat;          // moneda del usuario
  today: ISODate;            // hoy en SU zona horaria
  year: number;
  month: number;             // 1–12
  has: (feature: FeatureKey) => boolean;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

const NUMBER_LOCALE: Record<string, string> = { AUD: "en-AU", USD: "en-US", NZD: "en-NZ", GBP: "en-GB", EUR: "es-ES", COP: "es-CO", MXN: "es-MX", CLP: "es-CL", PEN: "es-PE", ARS: "es-AR", CAD: "en-CA" };

/** Sesión del usuario, o null. Se resuelve una vez por petición. */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;
  const [{ data: p }, { data: e }, config] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("entitlements").select("*").eq("user_id", userId).maybeSingle(),
    getConfig(),
  ]);
  if (!p) return null;
  const locale = asLocale(p.locale);
  const entitlement = {
    state: (e?.state ?? "free") as PlanState, trialEndsAt: e?.trial_ends_at ?? null, proUntil: e?.pro_until ?? null, accessUntil: e?.access_until ?? null,
    trialUsed: !!e?.trial_used, billingInterval: e?.billing_interval ?? null, cancelAtPeriodEnd: !!e?.cancel_at_period_end,
    paymentFailedAt: e?.payment_failed_at ?? null, hasStripe: !!e?.stripe_customer_id,
  };
  const tier = tierOf(entitlement);
  const today = todayIn(p.timezone || "Australia/Sydney");
  const { y, m } = parts(today);
  const profile: Profile = {
    id: p.id, email: p.email, name: p.name, country: p.country, currency: p.currency, timezone: p.timezone, locale,
    role: p.role, terms: p.terms ?? {}, prefs: p.prefs ?? {}, movLevel: p.mov_level, payFrequency: p.pay_frequency,
    onboardingStep: p.onboarding_step, wizard: p.wizard ?? {}, firstSteps: p.first_steps ?? {}, suspended: !!p.suspended_at, createdAt: p.created_at,
  };
  return {
    userId, aal: (claims?.claims?.aal as "aal1" | "aal2") ?? "aal1", profile, entitlement, tier,
    canEdit: canEdit(entitlement) && !profile.suspended,
    isAdmin: p.role === "admin" && !p.suspended_at,
    config, locale, t: COMMON[locale],
    fmt: { currency: p.currency, numberLocale: NUMBER_LOCALE[p.currency] ?? "en-US" },
    today, year: y, month: m,
    has: (feature) => hasFeature(feature, tier, config.features),
    supabase,
  };
});

/** Para páginas de la app: exige sesión y onboarding terminado. */
export async function requireUser(opts: { allowOnboarding?: boolean } = {}): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/entrar");
  if (!opts.allowOnboarding && s.profile.onboardingStep !== "done") redirect(s.profile.onboardingStep === "wizard" ? "/asistente" : "/bienvenida");
  return s;
}

/** Para /admin: exige rol admin y verificación en 2 pasos (obligatoria salvo en local). */
export async function requireAdmin(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/entrar?ir=/admin");
  if (!s.isAdmin) redirect("/inicio");
  const { data: ok } = await s.supabase.rpc("is_admin");
  if (!ok) redirect("/dos-pasos?ir=/admin");
  return s;
}
