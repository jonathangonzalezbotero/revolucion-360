import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { must } from "@/server/data";
import { requireUser } from "@/server/session";
import { isGoalKey, readObjectives, type GoalKey } from "./lib";
import { M } from "./messages";
import { Welcome } from "./Welcome";

export const metadata: Metadata = { title: "Bienvenida" };

export default async function BienvenidaPage() {
  const s = await requireUser({ allowOnboarding: true });
  if (s.profile.onboardingStep === "done") redirect("/inicio");
  const m = M[s.locale];
  const [countriesRes, factors] = await Promise.all([
    s.supabase.from("countries").select("code, name, currency").eq("enabled", true).order("sort"),
    s.supabase.auth.mfa.listFactors(),
  ]);
  const names: Record<string, string> = m.account.countries;
  const countries = must(countriesRes).map((c) => ({ code: c.code, name: names[c.code] ?? c.name, currency: c.currency }));
  // Lo que ya eligió (si vuelve a la bienvenida antes de terminar): objetivos del perfil; antes vivían en wizard.seed.
  const seed = (s.profile.wizard.seed as { goals?: unknown } | undefined)?.goals;
  const saved = readObjectives(s.profile.prefs);
  const chosen: GoalKey[] = saved.length ? saved : (Array.isArray(seed) ? seed : []).filter(isGoalKey);
  return (
    <Welcome
      m={m}
      created={s.profile.onboardingStep === "wizard"}
      canEdit={s.canEdit}
      readOnlyText={s.t.errors.readOnly}
      name={s.profile.name}
      country={countries.some((c) => c.code === s.profile.country) ? s.profile.country : countries[0]?.code ?? ""}
      currency={s.profile.currency}
      countries={countries}
      chosen={chosen}
      mfaOn={!!factors.data?.totp?.some((f) => f.status === "verified")}
    />
  );
}
