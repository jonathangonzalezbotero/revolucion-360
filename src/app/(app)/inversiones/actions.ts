"use server";
import { z } from "zod";
import { parseMoney, type Cents } from "@/lib/engine";
import {
  ASSET_KINDS, computeHolding, decToDb, mulToCents, parseDecimal, parseUnitPrice, tracksUnits, type AssetOp, type Dec,
} from "@/lib/engine/inversiones";
import { fail, ok, run } from "@/server/action";
import { loadPlan, must } from "@/server/data";
import { createLine } from "@/server/plan-write";
import { touchWeek, tryBadge } from "@/server/rewards";
import type { Session } from "@/server/session";
import { ASSET_COLS, OP_COLS, toOp, toState, untyped, type AssetRow, type OpRow } from "./lib";
import { M } from "./messages";

const PATHS = ["/inversiones", "/inicio"];
const Id = z.string().uuid();
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Text = (max: number) => z.string().trim().max(max);
const db = (s: Session) => untyped(s.supabase);

async function loadAsset(s: Session, id: string): Promise<AssetRow | null> {
  return must(await db(s).from("assets").select(ASSET_COLS).eq("id", id).is("archived_at", null).maybeSingle()) as AssetRow | null;
}

export async function createAsset(input: unknown) {
  return run<string>({ revalidate: PATHS }, async (s) => {
    const p = z.object({ name: Text(80).min(1), kind: z.enum(ASSET_KINDS), platform: Text(80).default("") }).safeParse(input);
    if (!p.success) return fail(M[s.locale].errName);
    const row = must(await db(s).from("assets").insert({
      user_id: s.userId, name: p.data.name, kind: p.data.kind, platform: p.data.platform || null, by_units: tracksUnits(p.data.kind),
    }).select("id").single()) as { id: string };
    await tryBadge(s, "sprout");
    await touchWeek(s);
    return ok(row.id);
  });
}

/**
 * Nombre, tipo, plataforma y la línea del plan de su compra recurrente.
 * El modo (por unidades o por saldo) se fija al crearlo: cambiar el tipo no cambia cómo se calculan sus operaciones.
 */
export async function updateAsset(input: unknown) {
  return run({ revalidate: [...PATHS, "/plan"] }, async (s) => {
    const m = M[s.locale];
    const p = z.object({
      id: Id, name: Text(80).min(1), kind: z.enum(ASSET_KINDS), platform: Text(80).default(""),
      link: z.union([Id, z.literal(""), z.literal("new")]).default(""), monthly: z.string().max(40).default(""),
    }).safeParse(input);
    if (!p.success) return fail(m.errName);
    const asset = await loadAsset(s, p.data.id);
    if (!asset) return fail(s.t.errors.notFound);
    let lineId: string | null = asset.plan_line_id;
    if (p.data.link === "new") {
      const monthly = p.data.monthly.trim() ? parseMoney(p.data.monthly) : null;
      if (monthly === null || monthly <= 0) return fail(m.errMonthly);
      const plan = await loadPlan(s, s.year);
      let categoryId = plan.categories.find((c) => c.kind === "saving")?.id;
      if (!categoryId) {
        const sort = Math.max(-1, ...plan.categories.map((c) => c.sort)) + 1;
        categoryId = must(await s.supabase.from("categories").insert({ user_id: s.userId, name: m.category, kind: "saving", color: "#4C7FB5", sort }).select("id").single()).id;
      }
      lineId = await createLine(s, { year: s.year, categoryId, name: p.data.name, kind: "expense", frequency: "monthly", amountCents: monthly, firstPayDate: null, fromMonth: s.month, toMonth: 12 });
    } else if (p.data.link) {
      const line = must(await s.supabase.from("plan_lines").select("id").eq("id", p.data.link).is("archived_at", null).maybeSingle());
      if (!line) return fail(m.errLine);
      // Una línea alimenta un solo activo: si no, la misma plata se sumaría dos veces.
      const taken = must(await db(s).from("assets").select("id").eq("plan_line_id", line.id).neq("id", asset.id).is("archived_at", null).limit(1)) as unknown[];
      if (taken.length) return fail(m.errLineTaken);
      lineId = line.id;
    } else lineId = null;
    const changed = lineId !== asset.plan_line_id;
    const rows = must(await db(s).from("assets").update({
      name: p.data.name, kind: p.data.kind, platform: p.data.platform || null, plan_line_id: lineId,
      // Se suma sola desde hoy: lo de antes ya lo registraste tú (nunca dos veces).
      ...(changed ? { recurring_from: lineId ? s.today : null } : {}),
    }).eq("id", asset.id).select("id")) as unknown[];
    return rows.length ? ok(undefined) : fail(s.t.errors.notFound);
  });
}

export async function setAssetArchived(input: unknown) {
  return run({ revalidate: PATHS }, async (s) => {
    const p = z.object({ id: Id, archived: z.boolean() }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const rows = must(await db(s).from("assets").update({ archived_at: p.data.archived ? new Date().toISOString() : null }).eq("id", p.data.id).select("id")) as unknown[];
    return rows.length ? ok(undefined) : fail(s.t.errors.notFound);
  });
}

/** Precio de hoy por unidad, o saldo de hoy: lo escribe la persona, sin conectar su cuenta. */
export async function setAssetPrice(input: unknown) {
  return run({ revalidate: PATHS }, async (s) => {
    const p = z.object({ id: Id, price: z.string().max(40) }).safeParse(input);
    if (!p.success) return fail(s.t.errors.amount);
    const asset = await loadAsset(s, p.data.id);
    if (!asset) return fail(s.t.errors.notFound);
    let patch: Record<string, unknown>;
    if (asset.by_units) {
      const price = parseUnitPrice(p.data.price, s.fmt.numberLocale);
      if (price === null) return fail(s.t.errors.amount);
      patch = { unit_price_cents: decToDb(price) };
    } else {
      const cents = parseMoney(p.data.price);
      if (cents === null || cents < 0) return fail(s.t.errors.amount);
      patch = { balance_cents: cents };
    }
    must(await db(s).from("assets").update({ ...patch, price_date: s.today, price_at: new Date().toISOString() }).eq("id", asset.id).select("id"));
    await touchWeek(s);
    return ok(undefined);
  });
}

/**
 * Compra, venta o dividendo. Por unidades: cantidad × precio por unidad (el monto se redondea a centavos una sola vez).
 * Por saldo, y en todo dividendo: el monto. Una venta no puede dejar menos de 0 unidades en ninguna fecha.
 */
export async function addOperation(input: unknown) {
  return run<{ kind: string }>({ revalidate: PATHS }, async (s) => {
    const m = M[s.locale];
    const p = z.object({ id: Id, kind: z.enum(["buy", "sell", "dividend"]), date: z.union([Day, z.literal("")]).default(""), qty: z.string().max(40).default(""), price: z.string().max(40).default("") }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const date = p.data.date || s.today;
    if (date > s.today) return fail(m.errDate);
    const asset = await loadAsset(s, p.data.id);
    if (!asset) return fail(s.t.errors.notFound);
    const byUnits = asset.by_units && p.data.kind !== "dividend";
    let qty: Dec | null = null, unitPrice: Dec | null = null, amount: Cents | null;
    if (byUnits) {
      qty = parseDecimal(p.data.qty, s.fmt.numberLocale);
      if (qty === null || qty <= BigInt(0)) return fail(m.errQty);
      unitPrice = parseUnitPrice(p.data.price, s.fmt.numberLocale);
      if (unitPrice === null || unitPrice <= BigInt(0)) return fail(m.errPrice);
      amount = mulToCents(qty, unitPrice);
    } else amount = parseMoney(p.data.price);
    if (amount === null || amount <= 0) return fail(m.errAmount);

    if (p.data.kind === "sell") {
      const ops = (must(await db(s).from("asset_operations").select(OP_COLS).eq("asset_id", asset.id).is("deleted_at", null)) as OpRow[]);
      const next: AssetOp = { id: "￿", date, kind: "sell", qty, amountCents: amount, createdAt: new Date().toISOString() };
      if (asset.by_units) {
        if (computeHolding({ ...toState(asset, ops), ops: [...ops.map(toOp), next] }).oversold) return fail(m.errOversold);
      } else if (amount > computeHolding(toState(asset, ops)).valueCents) return fail(m.errOverdraw);
    }

    must(await db(s).from("asset_operations").insert({
      user_id: s.userId, asset_id: asset.id, date, kind: p.data.kind, amount_cents: amount, source: "manual",
      quantity: qty === null ? null : decToDb(qty), unit_price_cents: unitPrice === null ? null : decToDb(unitPrice),
    }).select("id"));
    await touchWeek(s);
    return ok({ kind: p.data.kind });
  });
}

/** Quitar una operación: se oculta (deleted_at), no se borra. Una compra recurrente quitada no vuelve a crearse. */
export async function removeOperation(input: unknown) {
  return run({ revalidate: PATHS }, async (s) => {
    const p = z.object({ id: Id }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const op = must(await db(s).from("asset_operations").select(OP_COLS).eq("id", p.data.id).is("deleted_at", null).maybeSingle()) as OpRow | null;
    if (!op) return fail(s.t.errors.notFound);
    // Quitar una compra no puede dejar una venta posterior vendiendo lo que ya no tenías.
    if (op.kind === "buy") {
      const asset = must(await db(s).from("assets").select(ASSET_COLS).eq("id", op.asset_id).maybeSingle()) as AssetRow | null;
      if (asset?.by_units) {
        const rest = (must(await db(s).from("asset_operations").select(OP_COLS).eq("asset_id", op.asset_id).is("deleted_at", null)) as OpRow[]).filter((o) => o.id !== op.id);
        if (computeHolding(toState(asset, rest)).oversold) return fail(M[s.locale].errOversold);
      }
    }
    const rows = must(await db(s).from("asset_operations").update({ deleted_at: new Date().toISOString() }).eq("id", op.id).is("deleted_at", null).select("id")) as unknown[];
    return rows.length ? ok(undefined) : fail(s.t.errors.notFound);
  });
}
