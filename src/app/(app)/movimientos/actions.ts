"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addDays, applyRules, findDuplicate, normalize, parseMoney, type ISODate } from "@/lib/engine";
import { fill } from "@/i18n";
import { fail, ok, run } from "@/server/action";
import { must } from "@/server/data";
import { award, firstStep, touchWeek } from "@/server/rewards";
import type { Session } from "@/server/session";
import { legFor, parseGoalChoice } from "@/lib/engine/metas";
import { cleanTag, MAX_TAGS, mergeTags, tagsChanged } from "@/lib/engine/registro";
import { MAX_WATCHED } from "../analisis/lib";
import { awardGoal, raw, syncGoalLinks, type Crossed } from "../metas/server";
import { anchorDayOf, nextRecurringDate, rulePattern, signed, splitInTwo, type RecFrequency } from "./lib";
import { M } from "./messages";
import { clearMark, insertManualTx, lineForDate, lineOfYear, suggestionFor, txBetween } from "./server";
import { countChallenge } from "../retos/server";

// Rutas que leen movimientos: Inicio, Plan, Detalle del mes, Cuentas, Cierre, Análisis y Metas.
const PATHS = ["/movimientos", "/inicio", "/plan", "/cuentas", "/cierre", "/analisis", "/metas"];
const touchPaths = () => revalidatePath("/(app)/plan/mes/[mes]", "page");

const id = z.guid();
const optId = z.guid().nullable().catch(null);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d);
const text = (max: number) => z.string().trim().max(max).catch("");
const freq = z.enum(["weekly", "fortnightly", "monthly"]);
const repeat = z.union([freq, z.literal("")]).catch("");

// ───────── Recurrentes ─────────
type RecInput = { description: string; amountCents: number; accountId: string | null; categoryId: string | null; lineId: string | null; frequency: RecFrequency; nextDate: ISODate; anchorDay: number | null; goalId?: string | null };

/**
 * `recurring.goal_id` es de la migración 20261125000040 (sin aplicar): solo se nombra cuando hay meta,
 * así un recurrente sin meta funciona antes y después de aplicarla. `as never` puntual hasta regenerar los tipos.
 */
const goalCol = (goalId: string | null | undefined) => (goalId ? ({ goal_id: goalId } as never) : {});

/** Crea el recurrente (con su día ancla si es mensual) y devuelve su id, o null si ya existe uno igual. */
async function createRecurring(s: Session, r: RecInput): Promise<string | null> {
  const same = must(await s.supabase.from("recurring").select("id").eq("description", r.description).eq("amount_cents", r.amountCents).eq("frequency", r.frequency).limit(1));
  if (same.length) return null;
  const row = must(await s.supabase.from("recurring").insert({
    user_id: s.userId, description: r.description, amount_cents: r.amountCents, account_id: r.accountId, category_id: r.categoryId,
    plan_line_id: r.lineId, frequency: r.frequency, next_date: r.nextDate, anchor_day: r.anchorDay, ...goalCol(r.goalId),
  }).select("id").single());
  return row.id;
}

/** La meta de un recurrente: activa (ni archivada ni cumplida), porque cada movimiento nace como aporte. */
async function activeGoal(s: Session, goalId: string): Promise<boolean> {
  return !!must(await s.supabase.from("goals").select("id").eq("id", goalId).is("archived_at", null).is("completed_at", null).maybeSingle());
}

/** Recurrente que nace de un movimiento: empieza en la fecha siguiente y el movimiento queda apuntando a él. */
async function repeatFrom(s: Session, txId: string, r: { description: string; amountCents: number; accountId: string | null; categoryId: string | null; lineId: string | null; frequency: RecFrequency; date: ISODate }): Promise<boolean> {
  const anchorDay = anchorDayOf(r.date, r.frequency);
  const recId = await createRecurring(s, { ...r, nextDate: nextRecurringDate(r.date, r.frequency, anchorDay), anchorDay });
  if (!recId) return false;
  must(await s.supabase.from("transactions").update({ recurring_id: recId }).eq("id", txId).select("id"));
  return true;
}

const RecFields = z.object({
  description: text(120), amount: z.string().max(40), direction: z.enum(["in", "out"]), accountId: optId, categoryId: optId, lineId: optId, frequency: freq, first: date,
  goalId: optId,
});

export async function addRecurring(input: unknown) {
  return run({ feature: "recurrentes", revalidate: PATHS }, async (s) => {
    const m = M[s.locale];
    const p = RecFields.safeParse(input);
    if (!p.success) return fail(p.error.issues.some((i) => i.path[0] === "first") ? s.t.errors.date : s.t.errors.generic);
    const abs = parseMoney(p.data.amount);
    if (!abs) return fail(s.t.errors.amount);
    if (!p.data.description) return fail(m.errors.desc);
    // muy atrás generaría decenas de movimientos de golpe al abrir la pantalla
    if (p.data.first < addDays(s.today, -62)) return fail(m.errors.future);
    if (p.data.lineId && !(await lineOfYear(s, p.data.lineId, p.data.first))) return fail(m.errors.line);
    if (p.data.goalId && !(await activeGoal(s, p.data.goalId))) return fail(s.t.errors.notFound);
    const created = await createRecurring(s, {
      description: p.data.description, amountCents: signed(abs, p.data.direction), accountId: p.data.accountId, categoryId: p.data.categoryId,
      lineId: p.data.lineId, frequency: p.data.frequency, nextDate: p.data.first, anchorDay: anchorDayOf(p.data.first, p.data.frequency), goalId: p.data.goalId,
    });
    if (!created) return fail(m.errors.recExists);
    touchPaths();
    return ok(true);
  });
}

/**
 * Editar un recurrente: cambia lo que generará desde su próxima fecha. Lo ya registrado no se toca.
 * La próxima fecha puede quedar en el pasado cercano (igual que al crearlo): se registra al abrir la pantalla.
 */
export async function updateRecurring(input: unknown) {
  return run({ feature: "recurrentes", revalidate: PATHS }, async (s) => {
    const m = M[s.locale];
    const p = RecFields.extend({ id }).safeParse(input);
    if (!p.success) return fail(p.error.issues.some((i) => i.path[0] === "first") ? s.t.errors.date : s.t.errors.generic);
    const abs = parseMoney(p.data.amount);
    if (!abs) return fail(s.t.errors.amount);
    if (!p.data.description) return fail(m.errors.desc);
    const cur = must(await s.supabase.from("recurring").select("*").eq("id", p.data.id))[0];
    if (!cur) return fail(s.t.errors.notFound);
    if (p.data.first !== cur.next_date && p.data.first < addDays(s.today, -62)) return fail(m.errors.future);
    if (p.data.lineId && !(await lineOfYear(s, p.data.lineId, p.data.first))) return fail(m.errors.line);
    const curGoal = (cur as { goal_id?: string | null }).goal_id ?? null;
    if (p.data.goalId && p.data.goalId !== curGoal && !(await activeGoal(s, p.data.goalId))) return fail(s.t.errors.notFound);
    const amountCents = signed(abs, p.data.direction);
    const same = must(await s.supabase.from("recurring").select("id").eq("description", p.data.description).eq("amount_cents", amountCents).eq("frequency", p.data.frequency).neq("id", cur.id).limit(1));
    if (same.length) return fail(m.errors.recExists);
    // la meta solo se nombra si cambió (antes de la migración 040, quitar una meta que no existe no escribe nada)
    const goal = p.data.goalId === curGoal ? {} : ({ goal_id: p.data.goalId } as never);
    must(await s.supabase.from("recurring").update({
      description: p.data.description, amount_cents: amountCents, account_id: p.data.accountId, category_id: p.data.categoryId, plan_line_id: p.data.lineId,
      frequency: p.data.frequency, next_date: p.data.first, anchor_day: anchorDayOf(p.data.first, p.data.frequency), ...goal,
    }).eq("id", cur.id).select("id"));
    touchPaths();
    return ok(true);
  });
}

export async function setRecurringActive(input: unknown) {
  return run({ feature: "recurrentes", revalidate: ["/movimientos"] }, async (s) => {
    const p = z.object({ id, active: z.boolean() }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const cur = must(await s.supabase.from("recurring").select("id, next_date, frequency, anchor_day").eq("id", p.data.id));
    if (cur.length === 0) return fail(s.t.errors.notFound);
    // al reanudar no se registran de golpe los pagos del tiempo en pausa: sigue desde la próxima fecha
    let next = cur[0].next_date;
    if (p.data.active) for (let i = 0; i < 600 && next < s.today; i++) next = nextRecurringDate(next, cur[0].frequency as RecFrequency, cur[0].anchor_day);
    must(await s.supabase.from("recurring").update({ active: p.data.active, next_date: next }).eq("id", p.data.id).select("id"));
    return ok(p.data.active);
  });
}

export async function deleteRecurring(input: unknown) {
  return run({ feature: "recurrentes", revalidate: ["/movimientos"] }, async (s) => {
    const p = z.object({ id }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const rows = must(await s.supabase.from("recurring").delete().eq("id", p.data.id).select("id"));
    if (rows.length === 0) return fail(s.t.errors.notFound);
    return ok(true);
  });
}

// ───────── Reglas ("Hacer lo mismo con los próximos movimientos que digan…") ─────────
/** Quita una regla. Los movimientos que ya ordenó se quedan como están. */
export async function deleteRule(input: unknown) {
  return run({ feature: "mov", revalidate: ["/movimientos"] }, async (s) => {
    const p = z.object({ id }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const rows = must(await s.supabase.from("category_rules").delete().eq("id", p.data.id).select("id"));
    if (rows.length === 0) return fail(s.t.errors.notFound);
    return ok(true);
  });
}

// ───────── Registrar a mano ─────────
export type AddResult = {
  id: string | null;
  /** Hay uno parecido: se avisa y el usuario decide (no se bloquea ni se borra solo). */
  duplicate: { description: string; date: ISODate; amountCents: number } | null;
  /** Línea del plan sugerida: se muestra y el usuario confirma. */
  suggestion: { lineId: string; name: string; month: number } | null;
  repeated: boolean;
};

export async function addTx(input: unknown) {
  return run<AddResult>({ feature: "mov", revalidate: PATHS }, async (s) => {
    const m = M[s.locale];
    const p = z.object({
      amount: z.string().max(40), date, description: text(160), accountId: optId, toAccountId: optId, categoryId: optId, lineId: optId,
      type: z.enum(["out", "in", "transfer"]), note: text(300), repeat, force: z.boolean().catch(false),
    }).safeParse(input);
    if (!p.success) return fail(p.error.issues.some((i) => i.path[0] === "date") ? s.t.errors.date : s.t.errors.generic);
    const d = p.data;
    const abs = parseMoney(d.amount);
    if (!abs) return fail(s.t.errors.amount);
    const transfer = d.type === "transfer";
    if (transfer && d.toAccountId && d.toAccountId === d.accountId) return fail(m.errors.sameAccount);
    const amountCents = signed(abs, d.type === "in" ? "in" : "out");

    let categoryId = transfer ? null : d.categoryId, lineId = transfer ? null : d.lineId;
    let description = d.description;
    if (!description && categoryId) description = must(await s.supabase.from("categories").select("name").eq("id", categoryId))[0]?.name ?? "";
    if (!description) description = transfer ? s.t.status.transfer : m.untitled;

    // por regla: lo que el usuario ya decidió para los movimientos que dicen lo mismo
    if (!transfer && (!categoryId || !lineId)) {
      const rules = must(await s.supabase.from("category_rules").select("pattern, category_id, plan_line_id").order("created_at", { ascending: false }));
      const rule = applyRules(description, rules);
      if (rule) {
        if (!categoryId) categoryId = rule.category_id;
        if (!lineId && (!d.categoryId || d.categoryId === rule.category_id)) lineId = await lineForDate(s, rule.plan_line_id, d.date);
      }
    }
    if (d.lineId && !(await lineOfYear(s, d.lineId, d.date))) return fail(m.errors.line);

    if (!d.force) {
      const pad = s.config.matching.duplicateDays;
      const near = (await txBetween(s, addDays(d.date, -pad), addDays(d.date, pad))).filter((t) => !t.parentId);
      const dup = findDuplicate({ accountId: d.accountId, date: d.date, amountCents, description }, near, s.config.matching);
      if (dup) return ok({ id: null, duplicate: { description: dup.description, date: dup.date, amountCents: dup.amountCents }, suggestion: null, repeated: false });
    }

    const row = { id: await insertManualTx(s, { accountId: d.accountId, date: d.date, amountCents, description, categoryId, lineId, kind: transfer ? "transfer" : "normal", note: d.note }) };

    if (transfer && d.toAccountId) {
      // la otra punta de la transferencia: entra a la cuenta destino. Ninguna de las dos cuenta como ingreso ni gasto.
      const pair = must(await s.supabase.from("transactions").insert({
        user_id: s.userId, account_id: d.toAccountId, date: d.date, amount_cents: -amountCents, description, kind: "transfer", status: "ok", source: "manual", note: d.note, transfer_pair_id: row.id,
      }).select("id").single());
      must(await s.supabase.from("transactions").update({ transfer_pair_id: pair.id }).eq("id", row.id).select("id"));
    }

    let repeated = false;
    if (d.repeat && !transfer) {
      repeated = await repeatFrom(s, row.id, { description, amountCents, accountId: d.accountId, categoryId, lineId, frequency: d.repeat, date: d.date });
    }

    await touchWeek(s);
    if (!transfer && amountCents < 0) await countChallenge(s, "expense", row.id); // Retos: "registrar un gasto" (nunca lanza)
    const points = await firstStep(s, "gasto");
    const suggestion = !transfer && !lineId ? await suggestionFor(s, { id: row.id, accountId: d.accountId, date: d.date, amountCents, description }) : null;
    if (transfer) await syncGoalLinks(s); // una transferencia a la cuenta de una meta cuenta sola como aporte
    touchPaths();
    return ok({ id: row.id, duplicate: null, suggestion, repeated }, { points: points || undefined });
  });
}

// ───────── Editar ─────────
type Cur = { id: string; date: string; amount_cents: number; description: string; raw_description: string; parent_id: string | null; status: string; plan_line_id: string | null; transfer_pair_id: string | null; recurring_id: string | null };
async function current(s: Session, txId: string): Promise<Cur | null> {
  const rows = must(await s.supabase.from("transactions").select("id, date, amount_cents, description, raw_description, parent_id, status, plan_line_id, transfer_pair_id, recurring_id").eq("id", txId).is("deleted_at", null));
  return rows[0] && !rows[0].parent_id ? rows[0] : null; // las partes de un dividido se editan desde su original
}
const liveParts = async (s: Session, txId: string) =>
  must(await s.supabase.from("transactions").select("id").eq("parent_id", txId).is("deleted_at", null).order("created_at").order("id"));

export async function updateTx(input: unknown) {
  return run<{ ruled: boolean; repeated: boolean }>({ feature: "mov", revalidate: PATHS }, async (s) => {
    const m = M[s.locale];
    const p = z.object({
      id, amount: z.string().max(40), direction: z.enum(["in", "out"]), date, description: text(160), categoryId: optId, accountId: optId, lineId: optId,
      note: text(300), transfer: z.boolean(), rule: z.boolean().catch(false), repeat,
      split: z.object({ categoryId: optId, amount: z.string().max(40) }).nullable().catch(null),
      // Etiquetas a mano (#café): solo para "Vigilar un gasto". undefined = no se tocaron.
      tags: z.array(z.string().max(60)).max(MAX_TAGS * 2).optional(),
    }).safeParse(input);
    if (!p.success) return fail(p.error.issues.some((i) => i.path[0] === "date") ? s.t.errors.date : s.t.errors.generic);
    const d = p.data;
    const cur = await current(s, d.id);
    if (!cur) return fail(s.t.errors.notFound);
    const abs = parseMoney(d.amount);
    if (!abs) return fail(s.t.errors.amount);
    if (!d.description) return fail(m.errors.desc);
    const amountCents = signed(abs, d.direction);
    const categoryId = d.transfer ? null : d.categoryId;
    const lineId = d.transfer ? null : d.lineId;
    if (lineId && !(await lineOfYear(s, lineId, d.date))) return fail(m.errors.line);

    // dividir: las partes deben sumar el total (regla cerrada)
    let split: { cents: [number, number]; categoryId: string } | null = null;
    if (d.split && !d.transfer) {
      if (!d.split.categoryId) return fail(m.errors.splitCat);
      const second = parseMoney(d.split.amount);
      const cents = second === null ? null : splitInTwo(amountCents, second);
      if (!cents) return fail(m.errors.split);
      split = { cents, categoryId: d.split.categoryId };
    }

    // Etiquetas primero: es lo único que puede faltar en la base (migración 20261125000042). Solo se nombran si cambiaron,
    // así editar un movimiento funciona igual antes de aplicarla.
    if (d.tags) {
      const next = mergeTags([], d.tags);
      const before = (must(await raw(s).from("transactions").select("*").eq("id", d.id).is("deleted_at", null)) as { tags?: string[] | null }[])[0]?.tags ?? [];
      if (tagsChanged(before, next)) {
        const r = await raw(s).from("transactions").update({ tags: next }).eq("id", d.id).is("deleted_at", null).select("id");
        if (r.error) return fail(r.error.code === "42703" || r.error.code === "PGRST204" ? m.errors.tagsSoon : s.t.errors.generic);
      }
    }

    const now = new Date().toISOString();
    const updated = must(await s.supabase.from("transactions").update({
      date: d.date, amount_cents: amountCents, description: d.description, category_id: categoryId, account_id: d.accountId, note: d.note,
      // el original dividido no cuenta: su unión al plan vive en la primera parte
      plan_line_id: split ? null : lineId, is_split: !!split, kind: d.transfer ? "transfer" : "normal",
      status: categoryId || lineId || d.transfer || split ? "ok" : cur.status, edited_at: now,
      ...(d.transfer ? {} : { transfer_pair_id: null }),
    }).eq("id", d.id).is("deleted_at", null).select("id"));
    if (updated.length === 0) return fail(s.t.errors.notFound);

    // la otra punta de la transferencia: mismo día y monto opuesto. Si deja de ser transferencia, la pareja se suelta.
    if (cur.transfer_pair_id) {
      must(await s.supabase.from("transactions").update(d.transfer ? { date: d.date, amount_cents: -amountCents, edited_at: now } : { transfer_pair_id: null, edited_at: now })
        .eq("id", cur.transfer_pair_id).is("deleted_at", null).select("id"));
    }

    const kids = await liveParts(s, d.id);
    if (split) {
      const want = [
        { category_id: categoryId, plan_line_id: lineId, amount_cents: split.cents[0] },
        { category_id: split.categoryId, plan_line_id: null, amount_cents: split.cents[1] },
      ];
      const shared = { date: d.date, description: d.description, account_id: d.accountId, edited_at: now };
      if (kids.length === 2) {
        for (let i = 0; i < 2; i++) must(await s.supabase.from("transactions").update({ ...shared, ...want[i] }).eq("id", kids[i].id).select("id"));
      } else {
        if (kids.length) must(await s.supabase.from("transactions").update({ deleted_at: now }).in("id", kids.map((k) => k.id)).select("id"));
        // una por una, para que el orden de creación diga cuál es la primera parte
        for (const w of want) must(await s.supabase.from("transactions").insert({ user_id: s.userId, parent_id: d.id, source: "manual", status: "ok", ...shared, edited_at: null, ...w }).select("id"));
      }
    } else if (kids.length) {
      must(await s.supabase.from("transactions").update({ deleted_at: now }).in("id", kids.map((k) => k.id)).select("id"));
    }

    // (Las partes de un dividido heredan las etiquetas del original al leerlas: `inheritTags`. No se copian.)

    // unido a una línea "Pagada · a mano": el movimiento la reemplaza, la marca de ese mes se quita
    await clearMark(s, lineId, d.date);

    let ruled = false;
    const pattern = rulePattern(cur.raw_description || cur.description);
    if (d.rule && pattern && !d.transfer && (categoryId || lineId)) {
      must(await s.supabase.from("category_rules").delete().eq("pattern", pattern).select("id"));
      must(await s.supabase.from("category_rules").insert({ user_id: s.userId, pattern, category_id: categoryId, plan_line_id: lineId }).select("id"));
      ruled = true;
    }

    let repeated = false;
    if (d.repeat && !d.transfer && !cur.recurring_id) {
      repeated = await repeatFrom(s, d.id, { description: d.description, amountCents, accountId: d.accountId, categoryId, lineId, frequency: d.repeat, date: d.date });
    }
    await syncGoalLinks(s); // el monto o la fecha del aporte (o uso) de la meta siguen al movimiento
    touchPaths();
    return ok({ ruled, repeated });
  });
}

/** Confirma la sugerencia (o une a mano): el movimiento cuenta como pago de esa línea. */
export async function linkLine(input: unknown) {
  return run<{ name: string }>({ feature: "mov", revalidate: PATHS }, async (s) => {
    const m = M[s.locale];
    const p = z.object({ id, lineId: id }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const cur = await current(s, p.data.id);
    if (!cur) return fail(s.t.errors.notFound);
    const line = await lineOfYear(s, p.data.lineId, cur.date);
    if (!line) return fail(m.errors.line);
    const now = new Date().toISOString();
    const kids = await liveParts(s, cur.id);
    // en un dividido, la unión va en la primera parte (el original no cuenta)
    const target = kids.length ? kids[0].id : cur.id;
    const rows = must(await s.supabase.from("transactions").update({ plan_line_id: line.id, category_id: line.categoryId, status: "ok", edited_at: now }).eq("id", target).select("id"));
    if (rows.length === 0) return fail(s.t.errors.notFound);
    if (kids.length) must(await s.supabase.from("transactions").update({ category_id: line.categoryId, status: "ok", edited_at: now }).eq("id", cur.id).select("id"));
    await clearMark(s, line.id, cur.date);
    touchPaths();
    return ok({ name: line.name });
  });
}

/** Sugerencia de línea para un movimiento sin línea. Solo lee. */
export async function suggestFor(input: unknown) {
  return run<{ lineId: string; name: string; month: number } | null>({ write: false, feature: "mov" }, async (s) => {
    const p = z.object({ id }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const rows = must(await s.supabase.from("transactions").select("id, account_id, date, amount_cents, description, raw_description, plan_line_id, kind, is_split, parent_id").eq("id", p.data.id).is("deleted_at", null));
    const t = rows[0];
    if (!t || t.plan_line_id || t.kind !== "normal" || t.is_split || t.parent_id) return ok(null);
    const base = { id: t.id, accountId: t.account_id, date: t.date, amountCents: t.amount_cents };
    return ok((await suggestionFor(s, { ...base, description: t.description })) ?? (t.raw_description ? await suggestionFor(s, { ...base, description: t.raw_description }) : null));
  });
}

/** Borrado suave (deleted_at): el historial lo guarda la base. Las partes de un dividido y la otra punta de una transferencia se van con él. */
export async function deleteTx(input: unknown) {
  return run({ feature: "mov", revalidate: PATHS }, async (s) => {
    const p = z.object({ id }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const cur = await current(s, p.data.id);
    if (!cur) return fail(s.t.errors.notFound);
    const now = new Date().toISOString();
    const rows = must(await s.supabase.from("transactions").update({ deleted_at: now }).or(`id.eq.${cur.id},parent_id.eq.${cur.id}`).is("deleted_at", null).select("id"));
    if (rows.length === 0) return fail(s.t.errors.notFound);
    if (cur.transfer_pair_id) must(await s.supabase.from("transactions").update({ deleted_at: now }).eq("id", cur.transfer_pair_id).is("deleted_at", null).select("id"));
    await syncGoalLinks(s); // si contaba para una meta, deja de contar
    touchPaths();
    return ok(true);
  });
}

// ───────── "¿Tiene que ver con una meta?" ─────────
/**
 * "Aporte a…" o "Pagado con…" una meta, o "Ninguna". Usar la meta para lo que era es un logro: la meta baja ese monto
 * y queda en su historial como logro, no como gasto de más. En una transferencia, el aporte va en la punta que entra
 * y el uso en la que sale (nunca se cuenta dos veces). "Ninguna" también apaga el aporte automático de una transferencia.
 */
export async function setTxGoal(input: unknown) {
  return run<{ role: "in" | "out" | null; name: string; crossed: Crossed[] }>({ feature: "mov", revalidate: [...PATHS, "/metas", "/diagnostico", "/perfil"] }, async (s) => {
    const p = z.object({ id, goal: z.string().max(80) }).safeParse(input);
    const choice = p.success ? parseGoalChoice(p.data.goal) : undefined;
    if (!p.success || choice === undefined) return fail(s.t.errors.generic);
    const db = raw(s);
    type Leg = { id: string; amount_cents: number; kind: string; transfer_pair_id: string | null; parent_id: string | null };
    const tx = (must(await db.from("transactions").select("id, amount_cents, kind, transfer_pair_id, parent_id").eq("id", p.data.id).is("deleted_at", null)) as Leg[])[0];
    if (!tx || tx.parent_id) return fail(s.t.errors.notFound);
    const goal = choice ? must(await s.supabase.from("goals").select("id, name, completed_at").eq("id", choice.goalId).is("archived_at", null).maybeSingle()) : null;
    if (choice && (!goal || (choice.role === "in" && goal.completed_at))) return fail(s.t.errors.notFound);
    const pair = tx.kind === "transfer" && tx.transfer_pair_id
      ? (must(await db.from("transactions").select("id, amount_cents, kind, transfer_pair_id, parent_id").eq("id", tx.transfer_pair_id).is("deleted_at", null)) as Leg[])[0] ?? null : null;
    const legs = [tx.id, ...(pair ? [pair.id] : [])];
    let target: string | null = null;
    if (choice && goal) {
      target = legFor(choice.role, { id: tx.id, amountCents: tx.amount_cents }, pair && { id: pair.id, amountCents: pair.amount_cents });
      for (const leg of legs) must(await db.from("transactions").update(leg === target ? { goal_id: goal.id, goal_role: choice.role } : { goal_id: null, goal_role: null }).eq("id", leg).select("id"));
    } else {
      must(await db.from("transactions").update({ goal_id: null, goal_role: "none" }).in("id", legs).select("id"));
    }

    const crossed = await syncGoalLinks(s);
    let points = crossed.reduce((a, c) => a + c.points, 0);
    if (choice?.role === "in" && target) {
      const entry = (must(await db.from("goal_entries").select("id").eq("transaction_id", target)) as { id: string }[])[0];
      if (entry) points += await award(s, "goal_contrib", entry.id);
      await touchWeek(s);
    } else if (choice?.role === "out" && goal) {
      points += await awardGoal(s, "goal_used", goal.id);
    }
    return ok({ role: choice?.role ?? null, name: goal?.name ?? "", crossed }, { points: points || undefined });
  });
}

// ───────── Vigilar un gasto ─────────
// La misma lista que Análisis › Comercios (`watched_merchants`): una palabra y/o una etiqueta (`tag`, migración 20261125000042).
// Es solo una vista: nada del plan ni del cierre cambia.
const WatchFields = z.object({ name: text(60), pattern: text(60), tag: text(60) });

export async function addWatch(input: unknown) {
  return run<{ id: string }>({ feature: "mov", revalidate: ["/movimientos", "/analisis"] }, async (s) => {
    const m = M[s.locale];
    const p = WatchFields.safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const pattern = normalize(p.data.pattern) ? p.data.pattern : "";
    const tag = cleanTag(p.data.tag);
    if (!pattern && !tag) return fail(m.watch.need);
    const { count, error } = await s.supabase.from("watched_merchants").select("id", { count: "exact", head: true });
    if (error) throw new Error(`db: ${error.message}`);
    if ((count ?? 0) >= MAX_WATCHED) return fail(fill(m.watch.max, { max: MAX_WATCHED }));
    const name = p.data.name || pattern || `#${tag}`;
    // `tag` solo se nombra si hay etiqueta: una vigilancia por palabra funciona antes de aplicar la migración.
    const r = await raw(s).from("watched_merchants").insert({ user_id: s.userId, name, pattern, ...(tag ? { tag } : {}) }).select("id").single();
    if (r.error) return fail(r.error.code === "42703" || r.error.code === "PGRST204" ? m.errors.tagsSoon : s.t.errors.generic);
    return ok({ id: (r.data as { id: string }).id });
  });
}

/** Dejar de vigilar: quita la vigilancia (igual que en Análisis). Los movimientos no cambian. */
export async function removeWatch(input: unknown) {
  return run({ feature: "mov", revalidate: ["/movimientos", "/analisis"] }, async (s) => {
    const p = z.object({ id }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const rows = must(await s.supabase.from("watched_merchants").delete().eq("id", p.data.id).select("id"));
    if (rows.length === 0) return fail(s.t.errors.notFound);
    return ok(true);
  });
}
