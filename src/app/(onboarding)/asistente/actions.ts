"use server";
import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { fail, ok, run } from "@/server/action";
import { must, type CategoryKind } from "@/server/data";
import { createDefaultCategories, createLine } from "@/server/plan-write";
import { firstStep, touchWeek, track, tryBadge } from "@/server/rewards";
import type { Session } from "@/server/session";
import { wizardContext } from "./context";
import { AnswersSchema, buildDrafts, pickCategory, roleOf, type CatLite, type Role } from "./lib";
import { M } from "./messages";

/** Guarda el avance en cada paso: si cierra y vuelve, sigue donde iba. */
export async function saveProgress(input: unknown) {
  return run({ allowInactive: true }, async (s) => {
    const p = AnswersSchema.safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const seed = s.profile.wizard.seed as Json | undefined;
    must(await s.supabase.from("profiles").update({ wizard: { ...(seed ? { seed } : {}), answers: p.data } }).eq("id", s.userId).select("id"));
    return ok(null);
  });
}

const ROLE_KIND: Record<Role, CategoryKind> = { income: "income", basic: "expense", family: "expense", debt: "debt", goal: "goal" };

/** La categoría de cada tipo de línea. Si el usuario no la tiene (la borró o nunca existió), se crea. */
async function categoryFor(s: Session, cats: CatLite[], role: Role): Promise<string> {
  const found = pickCategory(cats, role);
  if (found) return found;
  const m = M[s.locale];
  const kind = ROLE_KIND[role];
  // primero la sugerida del país (con su color); si no existe, una genérica
  const country = must(await s.supabase.from("countries").select("categories").in("code", [s.profile.country, "OTHER"]).order("sort").limit(1))[0];
  const suggested = ((country?.categories ?? []) as { name: string; kind: string; color: string; is_basic?: boolean }[])
    .find((c) => c.kind === kind && (role === "family" ? /famil|remes/i.test(c.name) : role === "basic" ? !!c.is_basic : true));
  const name = suggested?.name ?? (role === "family" ? m.family.category : m.categories[role]);
  const sort = must(await s.supabase.from("categories").select("sort").order("sort", { ascending: false }).limit(1))[0]?.sort ?? -1;
  const row = must(await s.supabase.from("categories").insert({
    user_id: s.userId, name, kind, is_basic: role === "basic", sort: sort + 1, ...(suggested ? { color: suggested.color } : {}),
  }).select("id").single());
  cats.push({ id: row.id, name, kind, isBasic: role === "basic" });
  return row.id;
}

const Commit = z.object({ answers: AnswersSchema, to: z.enum(["diagnostico", "plan"]) });

/**
 * Último paso: crea de verdad las deudas, las metas y las líneas del plan del año en curso.
 * Nunca borra ni cambia lo que el usuario ya tenía: solo agrega.
 */
export async function commitPlan(input: unknown) {
  return run({ allowInactive: true, revalidate: ["/inicio", "/plan", "/metas", "/deudas", "/diagnostico", "/proyeccion"] }, async (s) => {
    const m = M[s.locale];
    const p = Commit.safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const { ctx } = wizardContext(s);
    const drafts = buildDrafts(p.data.answers, ctx);
    if (!drafts.lines.some((l) => l.kind === "income")) return fail(m.errors.incomeFirst);

    const cats: CatLite[] = (await createDefaultCategories(s, s.profile.country)).map((c) => ({ id: c.id, name: c.name, kind: c.kind, isBasic: c.isBasic }));
    const categoryId = new Map<Role, string>();
    for (const role of new Set(drafts.lines.map((l) => roleOf(l.group)))) categoryId.set(role, await categoryFor(s, cats, role));

    // No hay transacción: si algo falla a mitad de camino, se deshace lo creado en este intento.
    const first = s.profile.onboardingStep !== "done";
    const made = { debts: [] as string[], goals: [] as string[], lines: [] as string[] };
    try {
      for (const d of drafts.debts) {
        made.debts.push(must(await s.supabase.from("debts").insert({
          user_id: s.userId, name: d.name.slice(0, 80), kind: d.kind, payment_cents: d.paymentCents, payment_frequency: d.paymentFrequency,
        }).select("id").single()).id);
      }
      for (const g of drafts.goals) {
        made.goals.push(must(await s.supabase.from("goals").insert({
          user_id: s.userId, name: g.name.slice(0, 80), target_cents: g.targetCents, target_date: g.targetDate,
        }).select("id").single()).id);
      }
      for (const l of drafts.lines) {
        made.lines.push(await createLine(s, {
          year: ctx.year, categoryId: categoryId.get(roleOf(l.group))!, name: l.name, kind: l.kind, frequency: l.frequency, amountCents: l.amountCents,
          firstPayDate: l.firstPayDate, fromMonth: l.fromMonth, toMonth: l.toMonth,
          debtId: l.debtRef === undefined ? null : made.debts[l.debtRef], goalId: l.goalRef === undefined ? null : made.goals[l.goalRef],
        }));
      }
      must(await s.supabase.from("profiles").update({
        onboarding_step: "done", wizard: {}, ...(first && drafts.mainFrequency ? { pay_frequency: drafts.mainFrequency } : {}),
      }).eq("id", s.userId).select("id"));
    } catch (e) {
      if (made.lines.length) await s.supabase.from("plan_lines").delete().in("id", made.lines);
      if (made.debts.length) await s.supabase.from("debts").delete().in("id", made.debts);
      if (made.goals.length) await s.supabase.from("goals").delete().in("id", made.goals);
      throw e;
    }

    // Quien cobra como independiente: se enciende el apartado de impuestos (el % lo pone después, con su contador)
    // salvo que su país tenga apagado ese apartado (countries.tax_reserve_enabled).
    if (drafts.freelance) {
      const ctry = await s.supabase.from("countries").select("tax_reserve_enabled").eq("code", s.profile.country).maybeSingle();
      if (ctry.data?.tax_reserve_enabled !== false) await s.supabase.from("tax_settings").upsert({ user_id: s.userId, enabled: true }, { onConflict: "user_id" });
    }
    await tryBadge(s, "grid"); // la base exige onboarding terminado y al menos una línea: va después
    const points = await firstStep(s, "plan");
    await track(s, "wizard_done");
    await touchWeek(s);
    // Sin activar (se registró y no pagó): al terminar el asistente va a "Activa tu cuenta" (su diagnóstico sí lo puede ver).
    const next = p.data.to === "diagnostico" ? "/diagnostico" : s.plan === "free" ? "/activar" : "/plan";
    return ok({ next, lines: made.lines.length }, { points });
  });
}
