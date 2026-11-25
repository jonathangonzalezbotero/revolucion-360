"use server";
import { z } from "zod";
import { fill } from "@/i18n";
import { parseMoney, type Cents, type Frequency } from "@/lib/engine";
import { fail, ok, run, type Result } from "@/server/action";
import { loadCategories, must, type Category, type CategoryKind } from "@/server/data";
import { archiveLine, createLine, setCell, setLineFixed, setMark, updateLine, type LinePatch } from "@/server/plan-write";
import { firstStep, touchWeek } from "@/server/rewards";
import type { Session } from "@/server/session";
import { lineShape, linkTarget, parseCell, sideOf, type LinkTarget, type SavedLine } from "./lib";
import { M } from "./messages";

// /repaso también: "Hoy puedes gastar" y el día a día salen del plan.
const PLAN = ["/plan", "/inicio", "/repaso"];
// "Unir a" cambia también Metas, Deudas e Inversiones.
const LINKED = [...PLAN, "/metas", "/deudas", "/inversiones"];
const MONTH = ["/plan", "/inicio", "/movimientos", "/cierre"];
const Id = z.string().uuid();
const Month = z.number().int().min(1).max(12);
const DateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !Number.isNaN(Date.parse(d))).nullable();

/** La línea tal como quedó guardada, con sus 12 meses. RLS solo deja ver las del usuario. */
async function readLine(s: Session, lineId: string): Promise<SavedLine | null> {
  // select("*") para traer `fixed` (migración 20261125000035) sin nombrarlo: antes de aplicarla la columna no llega y queda en automático.
  const { data: l, error } = await s.supabase.from("plan_lines").select("*").eq("id", lineId).is("archived_at", null).maybeSingle();
  if (error) throw new Error(`db: ${error.message}`);
  if (!l) return null;
  const cells = must(await s.supabase.from("plan_cells").select("month, amount_cents, manual").eq("line_id", lineId));
  const a = Array<number>(12).fill(0), m = Array<boolean>(12).fill(false);
  for (const c of cells) { a[c.month - 1] = c.amount_cents; m[c.month - 1] = c.manual; }
  return {
    line: { id: l.id, name: l.name, kind: l.kind as "income" | "expense", categoryId: l.category_id, year: l.year, frequency: l.frequency as Frequency, amountCents: l.amount_cents, firstPayDate: l.first_pay_date,
      debtId: l.debt_id, goalId: l.goal_id, fixed: (l as { fixed?: boolean | null }).fixed ?? null },
    row: { a, m },
  };
}
async function ownsLine(s: Session, lineId: string): Promise<boolean> {
  const { data, error } = await s.supabase.from("plan_lines").select("id").eq("id", lineId).is("archived_at", null).maybeSingle();
  if (error) throw new Error(`db: ${error.message}`);
  return !!data;
}

/** Movimientos vivos unidos a la línea (de cualquier fecha). Con alguno, la línea no cambia entre ingreso y gasto. */
async function linkedCount(s: Session, lineId: string): Promise<number> {
  const { count, error } = await s.supabase.from("transactions").select("id", { count: "exact", head: true }).eq("plan_line_id", lineId).is("deleted_at", null);
  if (error) throw new Error(`db: ${error.message}`);
  return count ?? 0;
}

// ───────── "Unir a": meta, deuda o activo ─────────
// "" = sin unir · "new" = crear una nueva con el nombre de la línea · uuid = una existente del usuario (RLS).
const Link = z.union([z.literal(""), z.literal("new"), Id]).optional();
type LinkInfo = { name: string; amountCents: Cents; frequency: Frequency };
const debtFrequency = (f: Frequency): "weekly" | "fortnightly" | "monthly" => (f === "weekly" || f === "fortnightly" ? f : "monthly");

/** Meta o deuda a la que apunta la línea (`plan_lines.goal_id` / `debt_id`). null = sin unir. undefined = no existe o no es del usuario. */
async function resolveGoalOrDebt(s: Session, target: "goal" | "debt", link: string, info: LinkInfo): Promise<string | null | undefined> {
  if (link === "") return null;
  if (target === "goal") {
    if (link === "new") return must(await s.supabase.from("goals").insert({ user_id: s.userId, name: info.name.slice(0, 80) }).select("id").single()).id;
    return must(await s.supabase.from("goals").select("id").eq("id", link).is("archived_at", null).maybeSingle())?.id;
  }
  if (link === "new") return must(await s.supabase.from("debts").insert({
    user_id: s.userId, name: info.name.slice(0, 80), kind: "other", payment_cents: info.amountCents, payment_frequency: debtFrequency(info.frequency),
  }).select("id").single()).id;
  return must(await s.supabase.from("debts").select("id").eq("id", link).is("closed_at", null).maybeSingle())?.id;
}

/**
 * Activo de Inversiones: la unión vive en `assets.plan_line_id` (como en Inversiones), no en `plan_lines.investment_id`,
 * que apunta a la tabla anterior `investments`. Una línea alimenta un solo activo y un activo una sola línea.
 * Unirla hace que Inversiones sume sola la compra de cada mes desde hoy (`recurring_from`), como "Compra recurrente".
 * El super / la jubilación no se une al plan: vive solo en Inversiones. Devuelve false si el activo no existe.
 */
async function linkAsset(s: Session, lineId: string, link: string, name: string): Promise<boolean> {
  const current = must(await s.supabase.from("assets").select("id").eq("plan_line_id", lineId).is("archived_at", null)).map((a) => a.id);
  if (link === "" || link === "new") {
    if (current.length) must(await s.supabase.from("assets").update({ plan_line_id: null, recurring_from: null }).in("id", current).select("id"));
    if (link === "new") must(await s.supabase.from("assets").insert({ user_id: s.userId, name: name.slice(0, 80), kind: "other", by_units: false, plan_line_id: lineId, recurring_from: s.today }).select("id"));
    return true;
  }
  if (current.length === 1 && current[0] === link) return true;
  if (!(await assetUsable(s, link))) return false;
  const others = current.filter((id) => id !== link);
  if (others.length) must(await s.supabase.from("assets").update({ plan_line_id: null, recurring_from: null }).in("id", others).select("id"));
  must(await s.supabase.from("assets").update({ plan_line_id: lineId, recurring_from: s.today }).eq("id", link).select("id"));
  return true;
}
async function assetUsable(s: Session, id: string): Promise<boolean> {
  const a = must(await s.supabase.from("assets").select("kind").eq("id", id).is("archived_at", null).maybeSingle());
  return !!a && a.kind !== "retirement";
}
const detachAssets = (s: Session, lineId: string) => linkAsset(s, lineId, "", "");

/** Una celda de la rejilla: queda editada a mano y gana sobre la frecuencia de la línea. */
export async function saveCell(input: { lineId: string; month: number; amount: string }): Promise<Result> {
  return run({ revalidate: PLAN }, async (s) => {
    const p = z.object({ lineId: Id, month: Month, amount: z.string().max(30) }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const cents = parseCell(p.data.amount, parseMoney);
    if (cents === null) return fail(s.t.errors.amount);
    if (!(await ownsLine(s, p.data.lineId))) return fail(s.t.errors.notFound);
    await setCell(s, p.data.lineId, p.data.month, cents);
    return ok(undefined);
  });
}

const NewLine = z.object({
  year: z.number().int(), categoryId: Id, name: z.string().trim().max(80),
  mode: z.enum(["once", "range", "all"]), from: Month, to: Month,
  frequency: z.enum(["monthly", "fortnightly", "weekly"]), amount: z.string().max(30), firstPayDate: DateText, link: Link,
});
export async function addLine(input: z.input<typeof NewLine>): Promise<Result<SavedLine>> {
  return run({ revalidate: LINKED }, async (s) => {
    const m = M[s.locale];
    const p = NewLine.safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const d = p.data;
    if (!d.name) return fail(s.t.errors.name);
    const amountCents = parseMoney(d.amount);
    if (amountCents === null || amountCents <= 0) return fail(s.t.errors.amount);
    if (Math.abs(d.year - s.year) > 1) return fail(m.errors.year);
    if (d.frequency !== "monthly" && !d.firstPayDate) return fail(s.t.errors.date);
    const category = (await loadCategories(s)).find((c) => c.id === d.categoryId);
    if (!category) return fail(s.t.errors.notFound);
    const shape = lineShape({ mode: d.mode, from: d.from, to: d.to, frequency: d.frequency, amountCents, firstPayDate: d.firstPayDate }, d.year);
    const target = linkTarget(category.kind), info = { name: d.name, amountCents, frequency: d.frequency };
    let goalId: string | null = null, debtId: string | null = null;
    if (d.link && (target === "goal" || target === "debt")) {
      const ref = await resolveGoalOrDebt(s, target, d.link, info);
      if (ref === undefined) return fail(m.errors.link);
      if (target === "goal") goalId = ref; else debtId = ref;
    }
    if (d.link && d.link !== "new" && target === "asset" && !(await assetUsable(s, d.link))) return fail(m.errors.link);
    const id = await createLine(s, {
      year: d.year, categoryId: category.id, name: d.name, kind: sideOf(category.kind),
      frequency: shape.frequency, amountCents, firstPayDate: shape.firstPayDate, months: shape.custom ? shape.months : undefined, goalId, debtId,
    });
    if (d.link && target === "asset" && !(await linkAsset(s, id, d.link, d.name))) return fail(m.errors.link);
    const points = await firstStep(s, "plan");
    const saved = await readLine(s, id);
    if (!saved) return fail(s.t.errors.generic);
    return ok(saved, points ? { points } : {});
  });
}

const EditLine = z.object({
  lineId: Id, name: z.string().trim().max(80), categoryId: Id,
  frequency: z.enum(["monthly", "fortnightly", "weekly", "yearly", "once", "custom"]), amount: z.string().max(30), firstPayDate: DateText,
  overwriteManual: z.boolean(), fromMonth: Month, link: Link,
});
/**
 * Cambia la línea en UNA sola llamada: `updateLine` solo recalcula cuando cambia frecuencia, monto o fecha,
 * así que "aplicar a todos los meses" tiene que ir junto con el cambio (una segunda llamada ya no pisaría nada).
 */
export async function editLine(input: z.input<typeof EditLine>): Promise<Result<SavedLine & { keptManual: number }>> {
  return run({ revalidate: LINKED }, async (s) => {
    const m = M[s.locale];
    const p = EditLine.safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const d = p.data;
    if (!d.name) return fail(s.t.errors.name);
    const cur = await readLine(s, d.lineId);
    if (!cur) return fail(s.t.errors.notFound);
    const category = (await loadCategories(s)).find((c) => c.id === d.categoryId);
    if (!category) return fail(s.t.errors.notFound);
    if (d.frequency === "custom" && cur.line.frequency !== "custom") return fail(m.errors.frequency);
    // Ingreso ↔ gasto: solo si ningún movimiento está unido a la línea (si no, esos movimientos quedarían del lado equivocado).
    const side = sideOf(category.kind), switching = side !== cur.line.kind;
    if (switching) {
      const n = await linkedCount(s, d.lineId);
      if (n > 0) return fail(fill(n === 1 ? m.errors.sideLinkedOne : m.errors.sideLinked, { n }));
    }
    // Todo lo que puede rechazar el cambio va ANTES de escribir: un guardado rechazado no deja metas, deudas ni activos a medias.
    const amountCents = d.frequency === "custom" ? null : parseMoney(d.amount);
    if (d.frequency !== "custom") {
      if (amountCents === null || amountCents < 0) return fail(s.t.errors.amount);
      if (d.frequency !== cur.line.frequency && (d.frequency === "once" || d.frequency === "weekly" || d.frequency === "fortnightly") && !d.firstPayDate) return fail(s.t.errors.date);
    }
    const target: LinkTarget | null = linkTarget(category.kind);
    if (d.link && d.link !== "new" && target === "asset" && !(await assetUsable(s, d.link))) return fail(m.errors.link);

    const patch: LinePatch = {};
    if (d.name !== cur.line.name) patch.name = d.name;
    if (category.id !== cur.line.categoryId) patch.categoryId = category.id;
    if (switching) {
      patch.kind = side;
      // Un ingreso no paga deudas ni aporta a metas o activos, y no tiene "Tipo de gasto".
      if (side === "income") {
        patch.debtId = null;
        patch.goalId = null;
        await detachAssets(s, d.lineId);
        if (typeof cur.line.fixed === "boolean") await setLineFixed(s, d.lineId, null);
      }
    }
    const currentRef = target === "goal" ? cur.line.goalId ?? "" : target === "debt" ? cur.line.debtId ?? "" : null;
    if (d.link !== undefined && (target === "goal" || target === "debt") && d.link !== currentRef) {
      const ref = await resolveGoalOrDebt(s, target, d.link, { name: d.name, amountCents: amountCents ?? cur.line.amountCents, frequency: d.frequency });
      if (ref === undefined) return fail(m.errors.link);
      if (target === "goal" && ref !== (cur.line.goalId ?? null)) patch.goalId = ref;
      if (target === "debt" && ref !== (cur.line.debtId ?? null)) patch.debtId = ref;
    }
    if (d.link !== undefined && target === "asset" && !(await linkAsset(s, d.lineId, d.link, d.name))) return fail(m.errors.link);
    if (d.frequency !== cur.line.frequency) patch.frequency = d.frequency;
    if (d.frequency !== "custom" && amountCents !== null) {
      if (amountCents !== cur.line.amountCents) patch.amountCents = amountCents;
      if (d.firstPayDate !== cur.line.firstPayDate) patch.firstPayDate = d.firstPayDate;
    }
    const { keptManual } = await updateLine(s, d.lineId, patch, { overwriteManual: d.overwriteManual, fromMonth: d.fromMonth });
    const saved = await readLine(s, d.lineId);
    if (!saved) return fail(s.t.errors.generic);
    return ok({ ...saved, keptManual });
  });
}

/**
 * "Tipo de gasto" de una línea de gasto: Automático (null, lo decide la regla del hábito), Fijo (true) o Del día a día (false).
 * Cambia "Hoy puedes gastar" en Inicio y el Repaso. Los ingresos no tienen tipo.
 */
export async function setLineType(input: { lineId: string; fixed: boolean | null }): Promise<Result> {
  return run({ revalidate: PLAN }, async (s) => {
    const p = z.object({ lineId: Id, fixed: z.boolean().nullable() }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const { data, error } = await s.supabase.from("plan_lines").select("id, kind").eq("id", p.data.lineId).is("archived_at", null).maybeSingle();
    if (error) throw new Error(`db: ${error.message}`);
    if (!data) return fail(s.t.errors.notFound);
    if (data.kind !== "expense") return fail(M[s.locale].type.income);
    await setLineFixed(s, p.data.lineId, p.data.fixed);
    return ok(undefined);
  });
}

/** Quita la línea del plan sin borrar su historia. */
export async function removeLine(input: { lineId: string }): Promise<Result> {
  return run({ revalidate: MONTH }, async (s) => {
    const p = Id.safeParse(input?.lineId);
    if (!p.success) return fail(s.t.errors.generic);
    if (!(await ownsLine(s, p.data))) return fail(s.t.errors.notFound);
    await archiveLine(s, p.data);
    return ok(undefined);
  });
}

export async function addCategory(input: { name: string; kind: CategoryKind }): Promise<Result<Category>> {
  return run({ revalidate: PLAN }, async (s) => {
    const p = z.object({ name: z.string().trim().min(1).max(40), kind: z.enum(["income", "expense", "debt", "saving", "goal"]) }).safeParse(input);
    if (!p.success) return fail(s.t.errors.name);
    const sort = (await loadCategories(s)).reduce((a, c) => Math.max(a, c.sort), -1) + 1;
    const c = must(await s.supabase.from("categories").insert({ user_id: s.userId, name: p.data.name, kind: p.data.kind, sort }).select("id, name, kind, color, is_basic, sort").single());
    return ok({ id: c.id, name: c.name, kind: c.kind as CategoryKind, color: c.color, isBasic: c.is_basic, sort: c.sort });
  });
}

/** "Pendiente" ↔ "Pagado · a mano" en el Detalle del mes. Marcar cuenta para la racha de la semana; deshacer no. */
export async function toggleMark(input: { lineId: string; month: number; paid: boolean }): Promise<Result> {
  return run({ revalidate: MONTH }, async (s) => {
    const p = z.object({ lineId: Id, month: Month, paid: z.boolean() }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    if (!(await ownsLine(s, p.data.lineId))) return fail(s.t.errors.notFound);
    await setMark(s, p.data.lineId, p.data.month, p.data.paid);
    if (p.data.paid) await touchWeek(s);
    return ok(undefined);
  });
}
