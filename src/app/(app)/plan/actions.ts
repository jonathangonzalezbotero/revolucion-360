"use server";
import { z } from "zod";
import { parseMoney, type Frequency } from "@/lib/engine";
import { fail, ok, run, type Result } from "@/server/action";
import { loadCategories, must, type Category, type CategoryKind } from "@/server/data";
import { archiveLine, createLine, setCell, setMark, updateLine, type LinePatch } from "@/server/plan-write";
import { firstStep, touchWeek } from "@/server/rewards";
import type { Session } from "@/server/session";
import { lineShape, parseCell, type SavedLine } from "./lib";
import { M } from "./messages";

const PLAN = ["/plan", "/inicio"];
const MONTH = ["/plan", "/inicio", "/movimientos", "/cierre"];
const Id = z.string().uuid();
const Month = z.number().int().min(1).max(12);
const DateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !Number.isNaN(Date.parse(d))).nullable();

/** La línea tal como quedó guardada, con sus 12 meses. RLS solo deja ver las del usuario. */
async function readLine(s: Session, lineId: string): Promise<SavedLine | null> {
  const { data: l, error } = await s.supabase.from("plan_lines").select("id, name, kind, category_id, year, frequency, amount_cents, first_pay_date").eq("id", lineId).is("archived_at", null).maybeSingle();
  if (error) throw new Error(`db: ${error.message}`);
  if (!l) return null;
  const cells = must(await s.supabase.from("plan_cells").select("month, amount_cents, manual").eq("line_id", lineId));
  const a = Array<number>(12).fill(0), m = Array<boolean>(12).fill(false);
  for (const c of cells) { a[c.month - 1] = c.amount_cents; m[c.month - 1] = c.manual; }
  return {
    line: { id: l.id, name: l.name, kind: l.kind as "income" | "expense", categoryId: l.category_id, year: l.year, frequency: l.frequency as Frequency, amountCents: l.amount_cents, firstPayDate: l.first_pay_date },
    row: { a, m },
  };
}
async function ownsLine(s: Session, lineId: string): Promise<boolean> {
  const { data, error } = await s.supabase.from("plan_lines").select("id").eq("id", lineId).is("archived_at", null).maybeSingle();
  if (error) throw new Error(`db: ${error.message}`);
  return !!data;
}

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
  frequency: z.enum(["monthly", "fortnightly", "weekly"]), amount: z.string().max(30), firstPayDate: DateText,
});
export async function addLine(input: z.input<typeof NewLine>): Promise<Result<SavedLine>> {
  return run({ revalidate: PLAN }, async (s) => {
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
    const id = await createLine(s, {
      year: d.year, categoryId: category.id, name: d.name, kind: category.kind === "income" ? "income" : "expense",
      frequency: shape.frequency, amountCents, firstPayDate: shape.firstPayDate, months: shape.custom ? shape.months : undefined,
    });
    const points = await firstStep(s, "plan");
    const saved = await readLine(s, id);
    if (!saved) return fail(s.t.errors.generic);
    return ok(saved, points ? { points } : {});
  });
}

const EditLine = z.object({
  lineId: Id, name: z.string().trim().max(80), categoryId: Id,
  frequency: z.enum(["monthly", "fortnightly", "weekly", "yearly", "once", "custom"]), amount: z.string().max(30), firstPayDate: DateText,
  overwriteManual: z.boolean(), fromMonth: Month,
});
/**
 * Cambia la línea en UNA sola llamada: `updateLine` solo recalcula cuando cambia frecuencia, monto o fecha,
 * así que "aplicar a todos los meses" tiene que ir junto con el cambio (una segunda llamada ya no pisaría nada).
 */
export async function editLine(input: z.input<typeof EditLine>): Promise<Result<SavedLine & { keptManual: number }>> {
  return run({ revalidate: PLAN }, async (s) => {
    const m = M[s.locale];
    const p = EditLine.safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const d = p.data;
    if (!d.name) return fail(s.t.errors.name);
    const cur = await readLine(s, d.lineId);
    if (!cur) return fail(s.t.errors.notFound);
    const category = (await loadCategories(s)).find((c) => c.id === d.categoryId);
    if (!category) return fail(s.t.errors.notFound);
    if ((category.kind === "income") !== (cur.line.kind === "income")) return fail(m.errors.side);
    if (d.frequency === "custom" && cur.line.frequency !== "custom") return fail(m.errors.frequency);

    const patch: LinePatch = {};
    if (d.name !== cur.line.name) patch.name = d.name;
    if (category.id !== cur.line.categoryId) patch.categoryId = category.id;
    if (d.frequency !== cur.line.frequency) patch.frequency = d.frequency;
    if (d.frequency !== "custom") {
      const amountCents = parseMoney(d.amount);
      if (amountCents === null || amountCents < 0) return fail(s.t.errors.amount);
      if (d.frequency !== cur.line.frequency && (d.frequency === "once" || d.frequency === "weekly" || d.frequency === "fortnightly") && !d.firstPayDate) return fail(s.t.errors.date);
      if (amountCents !== cur.line.amountCents) patch.amountCents = amountCents;
      if (d.firstPayDate !== cur.line.firstPayDate) patch.firstPayDate = d.firstPayDate;
    }
    const { keptManual } = await updateLine(s, d.lineId, patch, { overwriteManual: d.overwriteManual, fromMonth: d.fromMonth });
    const saved = await readLine(s, d.lineId);
    if (!saved) return fail(s.t.errors.generic);
    return ok({ ...saved, keptManual });
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
