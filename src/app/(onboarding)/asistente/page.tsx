import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Empty } from "@/components/ui/basics";
import { monthName } from "@/lib/engine";
import { loadCategories, must } from "@/server/data";
import { requireUser } from "@/server/session";
import { wizardContext } from "./context";
import { defaultAnswers, pickCategory, readAnswers } from "./lib";
import { M } from "./messages";
import { Wizard } from "./Wizard";

export const metadata: Metadata = { title: "Arma tu plan" };

export default async function AsistentePage() {
  const s = await requireUser({ allowOnboarding: true });
  if (s.profile.onboardingStep === "welcome") redirect("/bienvenida");
  const m = M[s.locale];
  if (!s.canEdit) {
    return (
      <main className="page" style={{ margin: "0 auto" }}>
        <h1>{m.title}</h1>
        <Empty icon="lock" title={s.t.readOnly.title} text={s.t.readOnly.body}><Link href="/inicio" className="btn btn-secondary btn-sm">{m.readOnlyCta}</Link></Empty>
      </main>
    );
  }
  const { ctx, freelance } = wizardContext(s);
  const [cats, ctry] = await Promise.all([
    loadCategories(s),
    s.supabase.from("countries").select("tax_reserve_enabled").eq("code", s.profile.country).maybeSingle().then(must),
  ]);
  const familyId = pickCategory(cats, "family");
  // Las metas que eligió en la bienvenida llegan como punto de partida (aquí les pone nombre, monto y fecha)
  const seeds: Record<string, string> = m.goals.seeds;
  const seed = (s.profile.wizard.seed as { goals?: unknown } | undefined)?.goals;
  const goalNames = (Array.isArray(seed) ? seed : []).map((g) => seeds[String(g)]).filter(Boolean);
  const fallback = defaultAnswers({ payFrequency: s.profile.payFrequency, incomeName: m.income.defaultName, goalNames });
  const currencies: Record<string, string> = m.currencies;
  return (
    <Wizard
      m={m}
      fmt={s.fmt}
      ctx={ctx}
      monthLabel={monthName(s.month, s.locale).toLowerCase()}
      redo={s.profile.onboardingStep === "done"}
      initial={readAnswers(s.profile.wizard.answers, fallback)}
      freelance={freelance}
      currencyName={currencies[s.profile.currency] ?? s.profile.currency}
      familyCategory={cats.find((c) => c.id === familyId)?.name ?? m.family.category}
      taxSection={s.t.nav.deudas}
      taxReserve={ctry?.tax_reserve_enabled !== false}
      yes={s.t.yes}
      no={s.t.no}
    />
  );
}
