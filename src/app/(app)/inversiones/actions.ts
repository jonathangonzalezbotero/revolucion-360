"use server";
import { z } from "zod";
import { fill } from "@/i18n";
import { parseMoney, type Cents } from "@/lib/engine";
import { fail, ok, run } from "@/server/action";
import { loadPlan, must } from "@/server/data";
import { createLine, updateLine } from "@/server/plan-write";
import { touchWeek, tryBadge } from "@/server/rewards";
import type { Session } from "@/server/session";
import { term } from "@/server/terms";
import { applyEntry, INV_TYPES, type InvType } from "./lib";
import { M } from "./messages";

const PATHS = ["/inversiones", "/inicio", "/plan", "/diagnostico", "/perfil", "/academia", "/cierre"];
const Id = z.string().uuid();
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Link = z.union([Id, z.literal(""), z.literal("new")]).default("");

/** El tipo se guarda como texto en `investments.name` (la tabla no tiene columna de tipo); se reconoce con `typeOf`. */
const typeLabel = (s: Session, t: InvType) => fill(M[s.locale].types[t], { retirement: term(s, "retirement") });
const optMoney = (v: string): Cents | null => (v.trim() ? parseMoney(v) : 0);

/** Une la inversión a una línea del plan: una existente (updateLine) o una nueva en la categoría de ahorro (createLine). */
async function linkLine(s: Session, investmentId: string, platform: string, link: string, monthlyCents: Cents): Promise<string | null> {
  const m = M[s.locale];
  // Una línea por inversión: la que tenía se desune si cambia.
  const prev = must(await s.supabase.from("plan_lines").select("id").eq("investment_id", investmentId).eq("year", s.year).is("archived_at", null));
  for (const l of prev) if (l.id !== link) await updateLine(s, l.id, { investmentId: null });
  if (!link) return null;
  if (link === "new") {
    if (monthlyCents <= 0) return m.errMonthly;
    const plan = await loadPlan(s, s.year);
    let categoryId = plan.categories.find((c) => c.kind === "saving")?.id;
    if (!categoryId) {
      const sort = Math.max(-1, ...plan.categories.map((c) => c.sort)) + 1;
      categoryId = must(await s.supabase.from("categories").insert({ user_id: s.userId, name: m.category, kind: "saving", color: "#4C7FB5", sort }).select("id").single()).id;
    }
    await createLine(s, { year: s.year, categoryId, name: platform, kind: "expense", frequency: "monthly", amountCents: monthlyCents, firstPayDate: null, fromMonth: s.month, toMonth: 12, investmentId });
    return null;
  }
  if (prev.some((l) => l.id === link)) return null;
  const line = must(await s.supabase.from("plan_lines").select("id").eq("id", link).eq("year", s.year).is("archived_at", null).maybeSingle());
  if (!line) return m.errLine;
  await updateLine(s, line.id, { investmentId });
  return null;
}

export async function createInvestment(input: unknown) {
  return run<{ id: string; linkError: string | null }>({ feature: "inv", revalidate: PATHS }, async (s) => {
    const m = M[s.locale];
    const p = z.object({ platform: z.string().trim().min(1).max(80), type: z.enum(INV_TYPES), contributed: z.string().max(40).default(""), value: z.string().max(40).default(""), link: Link, monthly: z.string().max(40).default("") }).safeParse(input);
    if (!p.success) return fail(m.errName);
    const contributed = optMoney(p.data.contributed), monthly = optMoney(p.data.monthly);
    // Sin "vale hoy", vale lo que se puso (como un aporte): nunca un −100 % falso.
    const value = p.data.value.trim() ? parseMoney(p.data.value) : contributed;
    if (contributed === null || contributed < 0 || value === null || value < 0 || monthly === null || monthly < 0) return fail(s.t.errors.amount);
    if (p.data.link === "new" && !monthly) return fail(m.errMonthly);
    const row = must(await s.supabase.from("investments").insert({
      user_id: s.userId, platform: p.data.platform, name: typeLabel(s, p.data.type), contributed_cents: contributed, value_cents: value, value_date: s.today,
    }).select("id").single());
    // Primer punto del historial: lo puesto y lo que vale hoy.
    const first = [
      ...(contributed > 0 ? [{ kind: "aporte", amount_cents: contributed }] : []),
      ...(p.data.value.trim() || value > 0 ? [{ kind: "valor", amount_cents: value }] : []),
    ].map((e) => ({ ...e, user_id: s.userId, investment_id: row.id, date: s.today }));
    if (first.length) must(await s.supabase.from("investment_entries").insert(first).select("id"));
    // La inversión ya quedó guardada: si la línea falla, se avisa y se puede unir después desde Editar.
    const linkError = await linkLine(s, row.id, p.data.platform, p.data.link, monthly).catch(() => s.t.errors.generic);
    await tryBadge(s, "sprout");
    await touchWeek(s);
    return ok({ id: row.id, linkError });
  });
}

export async function updateInvestment(input: unknown) {
  return run({ feature: "inv", revalidate: PATHS }, async (s) => {
    const m = M[s.locale];
    const p = z.object({ id: Id, platform: z.string().trim().min(1).max(80), type: z.enum(INV_TYPES), link: Link, monthly: z.string().max(40).default("") }).safeParse(input);
    if (!p.success) return fail(m.errName);
    const monthly = optMoney(p.data.monthly);
    if (monthly === null || monthly < 0) return fail(s.t.errors.amount);
    const rows = must(await s.supabase.from("investments").update({ platform: p.data.platform, name: typeLabel(s, p.data.type) }).eq("id", p.data.id).select("id"));
    if (!rows.length) return fail(s.t.errors.notFound);
    const err = await linkLine(s, p.data.id, p.data.platform, p.data.link, monthly);
    return err ? fail(err) : ok(undefined);
  });
}

export async function setArchived(input: unknown) {
  return run({ feature: "inv", revalidate: PATHS }, async (s) => {
    const p = z.object({ id: Id, archived: z.boolean() }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const rows = must(await s.supabase.from("investments").update({ archived_at: p.data.archived ? new Date().toISOString() : null }).eq("id", p.data.id).select("id"));
    return rows.length ? ok(undefined) : fail(s.t.errors.notFound);
  });
}

/** Aporte, retiro o "valor de hoy": queda en el historial y actualiza lo puesto y lo que vale. */
export async function addInvestmentEntry(input: unknown) {
  return run({ feature: "inv", revalidate: PATHS }, async (s) => {
    const p = z.object({ id: Id, kind: z.enum(["aporte", "retiro", "valor"]), amount: z.string().max(40), date: z.union([Day, z.literal("")]).default("") }).safeParse(input);
    const amount = p.success ? parseMoney(p.data.amount) : null;
    if (!p.success || amount === null || amount < 0 || (amount === 0 && p.data.kind !== "valor")) return fail(s.t.errors.amount);
    const inv = must(await s.supabase.from("investments").select("id, contributed_cents, value_cents, value_date").eq("id", p.data.id).is("archived_at", null).maybeSingle());
    if (!inv) return fail(s.t.errors.notFound);
    if (p.data.kind === "retiro" && amount > inv.value_cents) return fail(M[s.locale].errRetiro);
    const date = p.data.date || s.today;
    const old = p.data.kind === "valor" && date < inv.value_date; // un valor de antes solo va al historial: no pisa el de hoy
    const next = old ? { contributedCents: inv.contributed_cents, valueCents: inv.value_cents } : applyEntry({ contributedCents: inv.contributed_cents, valueCents: inv.value_cents }, p.data.kind, amount);
    const entry = must(await s.supabase.from("investment_entries").insert({ user_id: s.userId, investment_id: inv.id, date, kind: p.data.kind, amount_cents: amount }).select("id").single());
    const upd = await s.supabase.from("investments").update({
      contributed_cents: next.contributedCents, value_cents: next.valueCents,
      ...(p.data.kind === "valor" && date >= inv.value_date ? { value_date: date } : {}),
    }).eq("id", inv.id).select("id");
    if (upd.error || !upd.data?.length) {
      await s.supabase.from("investment_entries").delete().eq("id", entry.id); // sin transacción: se deshace el registro
      throw new Error(`db: ${upd.error?.message ?? "investment not updated"}`);
    }
    await touchWeek(s);
    return ok(undefined);
  });
}
