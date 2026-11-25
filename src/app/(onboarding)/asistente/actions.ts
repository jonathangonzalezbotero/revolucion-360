"use server";
import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { fail, ok, run } from "@/server/action";
import { must, type CategoryKind } from "@/server/data";
import type { Frequency } from "@/lib/engine";
import { createDefaultCategories, createLine, setAutoCells, updateLine, type LinePatch } from "@/server/plan-write";
import { firstStep, touchWeek, track, tryBadge } from "@/server/rewards";
import { crmEvent } from "@/server/crm";
import type { Session } from "@/server/session";
import { wizardContext } from "./context";
import {
  AnswersSchema, buildDrafts, draftMonths, draftPatch, goalChanged, isEmptyPatch, pickCategory, roleOf,
  type CatLite, type ExistingLine, type GoalLite, type Role,
} from "./lib";
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
 * Si el asistente arrancó con tu plan, las respuestas que vienen de una línea (`lineId`) ACTUALIZAN esa línea
 * (y su deuda o meta) desde este mes, solo en lo que cambiaste; lo demás se crea. Nunca borra nada que ya tenías:
 * una fila que quitaste o dejaste en blanco deja su línea tal cual.
 */
export async function commitPlan(input: unknown) {
  return run({ allowInactive: true, revalidate: ["/inicio", "/plan", "/metas", "/deudas", "/diagnostico", "/proyeccion"] }, async (s) => {
    const m = M[s.locale];
    const p = Commit.safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const { ctx } = wizardContext(s);
    const drafts = buildDrafts(p.data.answers, ctx);
    if (!drafts.lines.some((l) => l.kind === "income")) {
      // Un ingreso del plan que el asistente no sabe leer (mes a mes, anual, único) también cuenta: no hay que escribir otro.
      const inc = await s.supabase.from("plan_lines").select("id", { count: "exact", head: true }).eq("year", ctx.year).eq("kind", "income").is("archived_at", null);
      if (inc.error) throw new Error(`db: ${inc.error.message}`);
      if (!inc.count) return fail(m.errors.incomeFirst);
    }

    // Las líneas que se van a actualizar: tuyas (RLS), del año del asistente y no quitadas. Si no, se crea una nueva.
    const ids = [...new Set([...drafts.lines, ...drafts.debts, ...drafts.goals].map((x) => x.lineId).filter((x): x is string => !!x))];
    const rows = ids.length
      ? must(await s.supabase.from("plan_lines").select("id, name, kind, frequency, amount_cents, first_pay_date, debt_id, goal_id").in("id", ids).eq("year", ctx.year).is("archived_at", null))
      : [];
    const existing = new Map<string, ExistingLine>(rows.map((r) => [r.id, {
      id: r.id, name: r.name, kind: r.kind as "income" | "expense", frequency: r.frequency, amountCents: r.amount_cents, firstPayDate: r.first_pay_date, debtId: r.debt_id, goalId: r.goal_id,
    }]));
    const goalIds = [...new Set(rows.map((r) => r.goal_id).filter((x): x is string => !!x))];
    const debtIds = [...new Set(rows.map((r) => r.debt_id).filter((x): x is string => !!x))];
    const [goalRows, debtRows] = await Promise.all([
      goalIds.length ? s.supabase.from("goals").select("id, name, target_cents, target_date").in("id", goalIds).is("archived_at", null).then(must) : [],
      debtIds.length ? s.supabase.from("debts").select("id").in("id", debtIds).then(must) : [],
    ]);
    const goalsById = new Map<string, GoalLite>(goalRows.map((g) => [g.id, { id: g.id, name: g.name, targetCents: g.target_cents, targetDate: g.target_date }]));
    const debtExists = new Set(debtRows.map((d) => d.id));
    const lineOf = (lineId: string | undefined) => (lineId ? existing.get(lineId) : undefined);

    const cats: CatLite[] = (await createDefaultCategories(s, s.profile.country)).map((c) => ({ id: c.id, name: c.name, kind: c.kind, isBasic: c.isBasic }));
    const categoryId = new Map<Role, string>();
    for (const role of new Set(drafts.lines.filter((l) => !lineOf(l.lineId)).map((l) => roleOf(l.group)))) categoryId.set(role, await categoryFor(s, cats, role));

    // No hay transacción: si algo falla a mitad de camino, se deshace SOLO lo creado en este intento (nunca lo que ya tenías).
    const first = s.profile.onboardingStep !== "done";
    const made = { debts: [] as string[], goals: [] as string[], lines: [] as string[] };
    // Id de la deuda / meta de cada posición de `drafts.debts` / `drafts.goals` (existente o creada ahora)
    const debtId: string[] = [], goalId: string[] = [], goalMoved: boolean[] = [];
    let updated = 0;
    try {
      for (const [i, d] of drafts.debts.entries()) {
        // Una línea que ya tenías conserva su deuda (o su falta de deuda): el asistente no crea deudas por líneas existentes.
        const cur = lineOf(d.lineId);
        if (cur) { if (cur.debtId && debtExists.has(cur.debtId)) debtId[i] = cur.debtId; continue; }
        const id = must(await s.supabase.from("debts").insert({
          user_id: s.userId, name: d.name.slice(0, 80), kind: d.kind, payment_cents: d.paymentCents, payment_frequency: d.paymentFrequency,
        }).select("id").single()).id;
        made.debts.push(id);
        debtId[i] = id;
      }
      for (const [i, g] of drafts.goals.entries()) {
        const line = lineOf(g.lineId), cur = line?.goalId ? goalsById.get(line.goalId) : undefined;
        if (line && !cur) { goalMoved[i] = false; continue; } // su meta ya no está: la línea queda como estaba
        if (cur) {
          goalId[i] = cur.id;
          goalMoved[i] = goalChanged(g, cur);
          if (goalMoved[i]) must(await s.supabase.from("goals").update({ name: g.name.slice(0, 80), target_cents: g.targetCents, target_date: g.targetDate }).eq("id", cur.id).select("id"));
          continue;
        }
        const id = must(await s.supabase.from("goals").insert({
          user_id: s.userId, name: g.name.slice(0, 80), target_cents: g.targetCents, target_date: g.targetDate,
        }).select("id").single()).id;
        made.goals.push(id);
        goalId[i] = id;
        goalMoved[i] = true;
      }
      for (const l of drafts.lines) {
        const cur = lineOf(l.lineId);
        if (cur) {
          // El aporte a una meta que no cambiaste no se recalcula (con el paso del tiempo cambiaría solo).
          if (l.goalRef !== undefined && cur.goalId && !goalMoved[l.goalRef]) continue;
          const patch = draftPatch(l, cur, ctx);
          if (!patch) continue;
          const full: LinePatch = { ...patch, frequency: patch.frequency as Frequency | undefined };
          if (l.debtRef !== undefined && !cur.debtId && debtId[l.debtRef]) full.debtId = debtId[l.debtRef];
          if (l.goalRef !== undefined && !cur.goalId && goalId[l.goalRef]) full.goalId = goalId[l.goalRef];
          const ranged = l.fromMonth !== undefined || l.toMonth !== undefined;
          if (isEmptyPatch(patch) && full.debtId === undefined && full.goalId === undefined && !ranged) continue;
          // Desde este mes: los meses que ya pasaron quedan como estaban.
          await updateLine(s, cur.id, full, { fromMonth: ctx.month });
          if (ranged) await setAutoCells(s, cur.id, draftMonths(l, ctx.year), ctx.month);
          // La cuota de la deuda sigue a su línea
          if (patch.amountCents !== undefined && l.debtRef !== undefined && cur.debtId && debtExists.has(cur.debtId)) {
            must(await s.supabase.from("debts").update({ payment_cents: l.amountCents, payment_frequency: l.frequency }).eq("id", cur.debtId).select("id"));
          }
          updated++;
          continue;
        }
        made.lines.push(await createLine(s, {
          year: ctx.year, categoryId: categoryId.get(roleOf(l.group))!, name: l.name, kind: l.kind, frequency: l.frequency, amountCents: l.amountCents,
          firstPayDate: l.firstPayDate, fromMonth: l.fromMonth, toMonth: l.toMonth,
          debtId: l.debtRef === undefined ? null : debtId[l.debtRef], goalId: l.goalRef === undefined ? null : goalId[l.goalRef],
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
    if (first) await crmEvent({ userId: s.userId }, "wizard_done", ""); // CRM: nunca lanza
    await touchWeek(s);
    // Sin activar (se registró y no pagó): al terminar el asistente va a "Activa tu cuenta" (su diagnóstico sí lo puede ver).
    const next = p.data.to === "diagnostico" ? "/diagnostico" : s.plan === "free" ? "/activar" : "/plan";
    return ok({ next, lines: made.lines.length, updated }, { points });
  });
}
