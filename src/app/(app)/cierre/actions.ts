"use server";
import { z } from "zod";
import { fill } from "@/i18n";
import { cellMap, cellOf, parseMoney } from "@/lib/engine";
import { fail, ok, run, type Result } from "@/server/action";
import { loadMonthView, loadPlan, must } from "@/server/data";
import { setCell, setMark } from "@/server/plan-write";
import { award, touchWeek, track, tryBadge } from "@/server/rewards";
import { isMonthClosed } from "@/server/closure";
import type { Session } from "@/server/session";
import type { Json } from "@/lib/supabase/database.types";
import { buildSnapshot, cardSigned, closureStreak, nextPeriod, parsePeriod, pendingWrites, periodOfDate, reminderDate, ymRef, type Period } from "./lib";
import { assetName, assetValue, closeAssets, closeData } from "./server";
import { pricePatch, untyped, type AssetRow } from "../inversiones/lib";
import { leftoverFor } from "../metas/server";
import { M } from "./messages";

const PATHS = ["/cierre", "/inicio", "/plan", "/movimientos", "/diagnostico"];
const Id = z.string().uuid();
const Year = z.number().int().min(2000).max(2100);
const Month = z.number().int().min(1).max(12);

/** El mes pedido debe existir y no estar en el futuro. */
const periodOf = (s: Session, year: number, month: number): Period | null => parsePeriod(year, month, { year: s.year, month: s.month }, periodOfDate(s.profile.createdAt));

/** La línea del mes siguiente: la misma si sigue en el año; en enero, la del año nuevo con el mismo nombre y categoría. */
async function nextLineOf(s: Session, p: Period, line: { id: string; name: string; categoryId: string }): Promise<{ id: string; cents: number; month: number; year: number } | null> {
  const n = nextPeriod(p);
  const plan = await loadPlan(s, n.year);
  const target = n.year === p.year ? plan.lines.find((l) => l.id === line.id) : plan.lines.find((l) => l.name === line.name && l.categoryId === line.categoryId);
  if (!target) return null;
  return { id: target.id, cents: cellOf(cellMap(plan.cells), target.id, n.month), month: n.month, year: n.year };
}

/** Celda tal como estaba antes de tocarla (para poder deshacer): monto y si estaba editada a mano. */
export type CellBefore = { lineId: string; month: number; cents: number; manual: boolean; existed: boolean };
async function cellBefore(s: Session, lineId: string, month: number): Promise<CellBefore> {
  const row = must(await s.supabase.from("plan_cells").select("amount_cents, manual").eq("line_id", lineId).eq("month", month).maybeSingle());
  return { lineId, month, cents: row?.amount_cents ?? 0, manual: row?.manual ?? false, existed: !!row };
}
export type Undo = { kind: "mark"; lineId: string; month: number } | { kind: "cells"; cells: CellBefore[] };

/** Paso 1: "Ya la pagué" · "Pasar al mes siguiente" · "No aplica". Devuelve cómo deshacerlo. */
export async function resolvePending(input: unknown): Promise<Result<Undo>> {
  return run<Undo>({ feature: "cierre", revalidate: PATHS }, async (s) => {
    const p = z.object({ year: Year, month: Month, lineId: Id, opt: z.enum(["paid", "move", "skip"]) }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const period = periodOf(s, p.data.year, p.data.month);
    if (!period || (await isMonthClosed(s, period.year, period.month))) return fail(s.t.errors.generic);
    const view = await loadMonthView(s, period.year, period.month);
    const ml = view.groups.flatMap((g) => g.lines).find((l) => l.line.id === p.data.lineId);
    if (!ml) return fail(s.t.errors.notFound);
    if (p.data.opt === "paid") {
      if (ml.txIds.length > 0) return fail(s.t.errors.generic); // con movimientos unidos la marca a mano no cuenta
      await setMark(s, ml.line.id, period.month, true);
      await touchWeek(s); // como en el Detalle del mes: marcar un pago cuenta para la semana
      return ok({ kind: "mark", lineId: ml.line.id, month: period.month });
    }
    const next = p.data.opt === "move" ? await nextLineOf(s, period, { id: ml.line.id, name: ml.line.name, categoryId: ml.line.categoryId }) : null;
    if (p.data.opt === "move" && !next) return fail(s.t.errors.notFound);
    const before = [await cellBefore(s, ml.line.id, period.month), ...(next ? [await cellBefore(s, next.id, next.month)] : [])];
    const w = pendingWrites(p.data.opt, ml.realCents, ml.missingCents, next?.cents ?? 0);
    await setCell(s, ml.line.id, period.month, w.thisMonth);
    if (next && w.nextMonth !== null) await setCell(s, next.id, next.month, w.nextMonth);
    return ok({ kind: "cells", cells: before });
  });
}

/** Deshacer una decisión del paso 1 mientras el mes no se cierre: deja las celdas (o la marca) exactamente como estaban. */
export async function undoPending(input: unknown): Promise<Result> {
  return run({ feature: "cierre", revalidate: PATHS }, async (s) => {
    const Cell = z.object({ lineId: Id, month: Month, cents: z.number().int().min(0), manual: z.boolean(), existed: z.boolean() });
    const p = z.object({
      year: Year, month: Month,
      undo: z.discriminatedUnion("kind", [z.object({ kind: z.literal("mark"), lineId: Id, month: Month }), z.object({ kind: z.literal("cells"), cells: z.array(Cell).min(1).max(2) })]),
    }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const period = periodOf(s, p.data.year, p.data.month);
    if (!period || (await isMonthClosed(s, period.year, period.month))) return fail(s.t.errors.generic);
    const u = p.data.undo;
    const ids = u.kind === "mark" ? [u.lineId] : [...new Set(u.cells.map((c) => c.lineId))];
    const owned = must(await s.supabase.from("plan_lines").select("id").in("id", ids).is("archived_at", null));
    if (owned.length !== ids.length) return fail(s.t.errors.notFound);
    if (u.kind === "mark") {
      await setMark(s, u.lineId, u.month, false);
      return ok(undefined);
    }
    for (const c of u.cells) {
      if (c.existed) must(await s.supabase.from("plan_cells").upsert({ line_id: c.lineId, user_id: s.userId, month: c.month, amount_cents: c.cents, manual: c.manual }, { onConflict: "line_id,month" }).select("month"));
      else must(await s.supabase.from("plan_cells").delete().eq("line_id", c.lineId).eq("month", c.month).select("month"));
    }
    return ok(undefined);
  });
}

/** Paso 3: guarda solo las líneas del mes siguiente que cambiaron (quedan editadas a mano). */
export async function saveNext(input: unknown): Promise<Result> {
  return run({ feature: "cierre", revalidate: PATHS }, async (s) => {
    const m = M[s.locale];
    const p = z.object({ year: Year, month: Month, cells: z.array(z.object({ lineId: Id, amount: z.string().max(40) })).max(300) }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    // el mes siguiente puede ser el mes que viene (un mes después del actual como máximo)
    const closing = parsePeriod(p.data.month === 1 ? p.data.year - 1 : p.data.year, p.data.month === 1 ? 12 : p.data.month - 1, { year: s.year, month: s.month });
    if (!closing) return fail(s.t.errors.generic);
    const plan = await loadPlan(s, p.data.year);
    const lines = new Map(plan.lines.map((l) => [l.id, l]));
    const writes: { lineId: string; cents: number }[] = [];
    for (const c of p.data.cells) {
      const line = lines.get(c.lineId);
      if (!line) return fail(s.t.errors.notFound);
      const cents = parseMoney(c.amount);
      if (cents === null || cents < 0) return fail(fill(m.badAmount, { name: line.name }));
      writes.push({ lineId: c.lineId, cents });
    }
    for (const w of writes) await setCell(s, w.lineId, p.data.month, w.cents);
    return ok(undefined);
  });
}

/** leftoverCents: lo que sobró de verdad en el mes (para "¿a qué meta va?"); 0 si faltó o si el mes ya estaba cerrado. */
export type CloseResult = { year: number; month: number; points: number; streak: number; reminder: string | null; already: boolean; leftoverCents: number };

/** Paso 4 y cierre: escribe los saldos de hoy, guarda el resumen del mes y suma los puntos (una sola vez por mes). */
export async function closeMonth(input: unknown): Promise<Result<CloseResult>> {
  return run<CloseResult>({ feature: "cierre", revalidate: [...PATHS, "/cuentas", "/proyeccion", "/inversiones"] }, async (s) => {
    const m = M[s.locale];
    const p = z.object({ year: Year, month: Month, balances: z.array(z.object({ id: Id, amount: z.string().max(40) })).max(100), investments: z.array(z.object({ id: Id, amount: z.string().max(40) })).max(100).default([]) }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const period = periodOf(s, p.data.year, p.data.month);
    if (!period) return fail(s.t.errors.generic);

    const existing = must(await s.supabase.from("month_closures").select("year, month, reopened_at"));
    const row = existing.find((r) => r.year === period.year && r.month === period.month);
    const streakOf = (rows: typeof existing) => closureStreak(rows.map((r) => ({ year: r.year, month: r.month, reopened: !!r.reopened_at })), period);
    if (row && !row.reopened_at) return ok({ ...period, points: 0, streak: streakOf(existing), reminder: reminderDate(period, s.today), already: true, leftoverCents: 0 });

    // 1. Saldos de hoy (un campo vacío deja la cuenta como está)
    const accounts = must(await s.supabase.from("accounts").select("id, name, kind, balance_cents").is("archived_at", null).order("sort").order("created_at"));
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const updates: { id: string; cents: number }[] = [];
    for (const b of p.data.balances) {
      if (!b.amount.trim()) continue;
      const acc = byId.get(b.id);
      if (!acc) return fail(s.t.errors.notFound);
      const cents = parseMoney(b.amount);
      if (cents === null) return fail(fill(m.badBalance, { name: acc.name }));
      updates.push({ id: b.id, cents: cardSigned(acc.kind, cents) });
    }
    for (const u of updates) {
      must(await s.supabase.from("accounts").update({ balance_cents: u.cents, balance_date: s.today }).eq("id", u.id).select("id"));
      const acc = byId.get(u.id);
      if (acc) acc.balance_cents = u.cents;
    }

    // 1b. Precio o saldo de hoy de cada activo de Inversiones (vacío = sin cambio). Mismo dato que "Actualizar" en Inversiones.
    const { assets, ops } = await closeAssets(s);
    const assetById = new Map(assets.map((a) => [a.id, a]));
    const assetUpdates: { asset: AssetRow; patch: NonNullable<ReturnType<typeof pricePatch>> }[] = [];
    for (const v of assets.length ? p.data.investments : []) {
      if (!v.amount.trim()) continue;
      const asset = assetById.get(v.id);
      if (!asset) return fail(s.t.errors.notFound);
      const patch = pricePatch(asset.by_units, v.amount, s.fmt.numberLocale);
      if (!patch) return fail(fill(m.badBalance, { name: assetName(asset) }));
      assetUpdates.push({ asset, patch });
    }
    for (const u of assetUpdates) {
      const at = new Date().toISOString();
      must(await untyped(s.supabase).from("assets").update({ ...u.patch, price_date: s.today, price_at: at }).eq("id", u.asset.id).select("id"));
      Object.assign(u.asset, u.patch, { price_date: s.today, price_at: at });
    }

    // 2. Resumen del mes
    const data = await closeData(s, period);
    const snapshot = buildSnapshot({ today: s.today, plan: data.plan, cats: data.cats, unplanned: data.unplanned, accounts: accounts.map((a) => ({ id: a.id, name: a.name, kind: a.kind, balanceCents: a.balance_cents })),
      investments: assets.map((a) => ({ id: a.id, name: assetName(a), valueCents: assetValue(a, ops) })) });
    must(await s.supabase.from("month_closures").upsert(
      { user_id: s.userId, year: period.year, month: period.month, closed_at: new Date().toISOString(), reopened_at: null, snapshot: snapshot as unknown as NonNullable<Json> },
      { onConflict: "user_id,year,month" },
    ).select("year"));

    // 3. Logros (la base nunca da los puntos del mismo mes dos veces)
    const points = await award(s, "closure", ymRef(period));
    await touchWeek(s);
    await tryBadge(s, "check");
    await tryBadge(s, "flame");
    await tryBadge(s, "star");
    if (existing.length === 0) await track(s, "first_closure");

    const after = [...existing.filter((r) => !(r.year === period.year && r.month === period.month)), { year: period.year, month: period.month, reopened_at: null }];
    return ok({ ...period, points, streak: streakOf(after), reminder: reminderDate(period, s.today), already: false, leftoverCents: await leftoverFor(s, period, snapshot) }, { points });
  });
}

/** Reabrir: queda abierto para corregirlo. Los puntos no se devuelven ni se vuelven a dar. */
export async function reopenMonth(input: unknown): Promise<Result> {
  return run({ feature: "cierre", revalidate: PATHS }, async (s) => {
    const p = z.object({ year: Year, month: Month }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const rows = must(await s.supabase.from("month_closures").update({ reopened_at: new Date().toISOString() }).eq("year", p.data.year).eq("month", p.data.month).is("reopened_at", null).select("year"));
    if (rows.length === 0) return fail(s.t.errors.notFound);
    return ok(undefined);
  });
}
