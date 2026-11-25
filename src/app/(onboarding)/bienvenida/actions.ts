"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { fail, ok, run } from "@/server/action";
import { must } from "@/server/data";
import { createDefaultCategories } from "@/server/plan-write";
import { track } from "@/server/rewards";
import { GOAL_KEYS, isCurrency, localeForNewUser, safeTimezone, withObjectives } from "./lib";
import { M } from "./messages";

const Space = z.object({
  name: z.string().trim().min(1).max(80),
  country: z.string().trim().min(2).max(10),
  currency: z.string().trim().max(3),
  timezone: z.string().max(64).optional(),
  goals: z.array(z.enum(GOAL_KEYS)).max(GOAL_KEYS.length),
});

/**
 * "Crear mi espacio": guarda nombre, país, moneda, zona horaria, frecuencia de pago y términos del país,
 * crea las categorías sugeridas y deja listo el asistente (onboarding_step = 'wizard').
 */
export async function createSpace(input: unknown) {
  return run({ allowInactive: true, revalidate: ["/bienvenida", "/asistente"] }, async (s) => {
    const m = M[s.locale];
    if (s.profile.onboardingStep === "done") return ok(null); // ya terminó: no se toca su perfil desde aquí
    const p = Space.safeParse(input);
    if (!p.success) return fail(p.error.issues[0]?.path[0] === "name" ? m.errors.name : m.errors.country);
    const country = must(await s.supabase.from("countries").select("code, currency, timezone, pay_frequency, terms, default_locale").eq("code", p.data.country).eq("enabled", true).maybeSingle());
    if (!country) return fail(m.errors.country);
    // "Otro país" elige su moneda; un país con ficha propia usa la suya
    const currency = country.code === "OTHER" && isCurrency(p.data.currency) ? p.data.currency : country.currency;
    const payFrequency = ["weekly", "fortnightly", "monthly"].includes(country.pay_frequency) ? country.pay_frequency : "monthly";
    const goals = [...new Set(p.data.goals)];
    // Primer guardado: el usuario nuevo empieza en el idioma de su país (si no lo cambió él; ver localeForNewUser).
    const locale = localeForNewUser({ step: s.profile.onboardingStep, current: s.profile.locale, countryDefault: country.default_locale });
    must(await s.supabase.from("profiles").update({
      ...(locale ? { locale } : {}),
      name: p.data.name, country: country.code, currency, timezone: safeTimezone(p.data.timezone, country.timezone), pay_frequency: payFrequency,
      // Lo que quiere lograr: objetivos del perfil, nunca metas (Metas los sugiere). `wizard` queda vacío para el asistente.
      terms: (country.terms ?? {}) as NonNullable<Json>, prefs: withObjectives(s.profile.prefs, goals) as NonNullable<Json>, wizard: {}, onboarding_step: "wizard",
    }).eq("id", s.userId).select("id"));
    // Igual que Perfil: la cookie hace que las pantallas sin sesión (entrar, legal) salgan en el mismo idioma.
    if (locale) (await cookies()).set("r360_locale", locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    await createDefaultCategories(s, country.code);
    await track(s, "onboarding_done");
    return ok(null);
  });
}

/**
 * "Empezar en blanco": sin asistente. Abre la app. Lo que eligió en la bienvenida ya quedó como objetivos del perfil:
 * no se crean metas (Metas los sugiere).
 */
export async function startBlank() {
  const r = await run({ allowInactive: true, revalidate: ["/inicio", "/plan", "/metas"] }, async (s) => {
    if (s.profile.onboardingStep === "welcome") return fail(s.t.errors.generic);
    if (s.profile.onboardingStep === "done") return ok({ next: "/plan" });
    must(await s.supabase.from("profiles").update({ onboarding_step: "done", wizard: {} }).eq("id", s.userId).select("id"));
    await track(s, "onboarding_blank");
    return ok({ next: "/plan" });
  });
  if (r.ok) redirect("/plan"); // fuera de run(): la redirección no puede quedar atrapada como error
  return r;
}
