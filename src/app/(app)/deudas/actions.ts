"use server";
import { z } from "zod";
import { addDays, addMonths, bnplSchedule, parseMoney, type Cents, type ISODate } from "@/lib/engine";
import { fail, ok, run } from "@/server/action";
import { loadPlan, must } from "@/server/data";
import { archiveLine, createLine, setCells, setMark, updateLine } from "@/server/plan-write";
import { award, touchWeek, tryBadge } from "@/server/rewards";
import type { Session } from "@/server/session";
import {
  balanceAfter, COMPANY_CLASSES, DEBT_KINDS, nextUnpaid, parsePercent, parseSchedule, payoffOf, paymentAmount, planMonths, scheduleAfter, scheduleJson,
  scheduleMonths, startBalanceFor, type DebtLite, type PayFreq, type SchedItem,
} from "./lib";
import { M } from "./messages";

const PATHS = ["/deudas", "/inicio", "/plan", "/diagnostico", "/perfil", "/academia"];
const Id = z.string().uuid();
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Money = z.string().max(40).default("");
const Freq = z.enum(["monthly", "fortnightly", "weekly"]);

type DebtRow = { id: string; name: string; kind: string; balance_cents: number; start_balance_cents: number; rate_bps: number; payment_cents: number; payment_frequency: string; next_due: string | null; schedule: unknown; closed_at: string | null };
const COLS = "id, name, kind, balance_cents, start_balance_cents, rate_bps, payment_cents, payment_frequency, next_due, schedule, closed_at";
const lite = (r: DebtRow): DebtLite => ({
  id: r.id, kind: r.kind as DebtLite["kind"], balanceCents: r.balance_cents, startBalanceCents: r.start_balance_cents, rateBps: r.rate_bps,
  paymentCents: r.payment_cents, paymentFrequency: r.payment_frequency as PayFreq, schedule: parseSchedule(r.schedule), closed: !!r.closed_at,
});
const optMoney = (v: string): Cents | null => (v.trim() ? parseMoney(v) : 0);

/** Categoría de tipo "deuda" del usuario; si no tiene, se crea. */
async function debtCategory(s: Session): Promise<string> {
  const plan = await loadPlan(s, s.year);
  const found = plan.categories.find((c) => c.kind === "debt");
  if (found) return found.id;
  const sort = Math.max(-1, ...plan.categories.map((c) => c.sort)) + 1;
  return must(await s.supabase.from("categories").insert({ user_id: s.userId, name: M[s.locale].category, kind: "debt", color: "#C46A2A", sort }).select("id").single()).id;
}

/**
 * Crea la línea de la cuota en el año en curso, unida con `debtId`, solo en los meses que dura.
 * Compra ahora, paga después: monto por mes según su calendario.
 */
async function addDebtLine(s: Session, d: DebtRow, count: number | null): Promise<"ok" | "exists" | "noyear" | "nopay"> {
  const existing = must(await s.supabase.from("plan_lines").select("id").eq("debt_id", d.id).eq("year", s.year).is("archived_at", null).limit(1));
  if (existing.length) return "exists";
  const debt = lite(d);
  if (debt.schedule) {
    const months = scheduleMonths(debt.schedule.filter((i) => !i.paid), s.year);
    if (months.every((v) => v === 0)) return "noyear";
    await createLine(s, { year: s.year, categoryId: await debtCategory(s), name: d.name, kind: "expense", frequency: "custom", amountCents: debt.paymentCents, firstPayDate: null, months, debtId: d.id });
    return "ok";
  }
  if (debt.paymentCents <= 0) return "nopay";
  // Desde el primer pago; si no hay fecha (o ya pasó el año), desde hoy.
  const start: ISODate = d.next_due && d.next_due >= `${s.year}-01-01` ? d.next_due : s.today;
  const range = planMonths({ year: s.year, start, count, payoffMonths: payoffOf(debt, start)?.months ?? null, freq: debt.paymentFrequency });
  if (!range) return "noyear";
  await createLine(s, {
    year: s.year, categoryId: await debtCategory(s), name: d.name, kind: "expense", frequency: debt.paymentFrequency, amountCents: debt.paymentCents,
    firstPayDate: d.next_due, ...range, debtId: d.id,
  });
  return "ok";
}

export async function createDebt(input: unknown) {
  return run<{ id: string; inPlan: boolean }>({ feature: "deudas", revalidate: PATHS }, async (s) => {
    const m = M[s.locale];
    const p = z.object({
      kind: z.enum(DEBT_KINDS), name: z.string().trim().min(1).max(80), balance: Money, payment: Money, rate: z.string().max(12).default(""),
      first: z.union([Day, z.literal("")]).default(""), count: z.string().max(4).default(""), addToPlan: z.boolean().default(true),
    }).safeParse(input);
    if (!p.success) return fail(s.t.errors.name);
    const balance = optMoney(p.data.balance), payment = optMoney(p.data.payment);
    if (balance === null || balance < 0 || payment === null || payment < 0) return fail(s.t.errors.amount);
    const rate = p.data.rate.trim() ? parsePercent(p.data.rate) : 0;
    if (rate === null) return fail(m.errRate);
    const count = p.data.count.trim() ? Number(p.data.count.trim()) : null;
    if (count !== null && (!Number.isInteger(count) || count < 1 || count > 120)) return fail(m.errCount);

    let row: Record<string, unknown>;
    if (p.data.kind === "bnpl") {
      if (!balance) return fail(m.errBnpl);
      const first = p.data.first || s.today;
      const sch: SchedItem[] = bnplSchedule(balance, first).map((i) => ({ date: i.date, amountCents: i.amountCents, paid: false }));
      row = { payment_cents: sch[0].amountCents, payment_frequency: "fortnightly", next_due: sch[0].date, schedule: scheduleJson(sch), rate_bps: 0 };
    } else {
      row = { payment_cents: payment, payment_frequency: "monthly", next_due: p.data.first || null, rate_bps: rate };
    }
    const debt = must(await s.supabase.from("debts").insert({
      user_id: s.userId, name: p.data.name, kind: p.data.kind, balance_cents: balance, start_balance_cents: balance, ...row,
    }).select(COLS).single()) as DebtRow;
    // La deuda ya quedó guardada: si la línea del plan falla, se avisa "sin plan" y se puede agregar después desde la tarjeta.
    const line = p.data.addToPlan ? await addDebtLine(s, debt, p.data.kind === "bnpl" ? null : count).catch(() => null) : null;
    return ok({ id: debt.id, inPlan: line === "ok" });
  });
}

export async function addDebtToPlan(input: unknown) {
  return run({ feature: "deudas", revalidate: PATHS }, async (s) => {
    const m = M[s.locale];
    const p = z.object({ id: Id }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const d = must(await s.supabase.from("debts").select(COLS).eq("id", p.data.id).is("closed_at", null).maybeSingle()) as DebtRow | null;
    if (!d) return fail(s.t.errors.notFound);
    const r = await addDebtLine(s, d, null);
    if (r === "exists") return fail(m.errPlanExists);
    if (r === "nopay") return fail(m.errNoPayment);
    if (r === "noyear") return fail(m.errNoYear);
    return ok(undefined);
  });
}

export async function updateDebt(input: unknown) {
  return run({ feature: "deudas", revalidate: PATHS }, async (s) => {
    const m = M[s.locale];
    const p = z.object({
      id: Id, name: z.string().trim().min(1).max(80), balance: Money, payment: Money, frequency: Freq, rate: z.string().max(12).default(""), nextDue: z.union([Day, z.literal("")]).default(""),
    }).safeParse(input);
    if (!p.success) return fail(s.t.errors.name);
    const balance = optMoney(p.data.balance), payment = optMoney(p.data.payment);
    if (balance === null || balance < 0 || payment === null || payment < 0) return fail(s.t.errors.amount);
    const rate = p.data.rate.trim() ? parsePercent(p.data.rate) : 0;
    if (rate === null) return fail(m.errRate);
    const cur = must(await s.supabase.from("debts").select(COLS).eq("id", p.data.id).maybeSingle()) as DebtRow | null;
    if (!cur) return fail(s.t.errors.notFound);
    const start = startBalanceFor(cur.start_balance_cents, balance);
    const sch = parseSchedule(cur.schedule);
    const nextSch = sch ? scheduleAfter(sch, start - balance) : null;
    must(await s.supabase.from("debts").update({
      name: p.data.name, balance_cents: balance, start_balance_cents: start, rate_bps: sch ? 0 : rate,
      ...(sch ? { schedule: scheduleJson(nextSch!), next_due: nextUnpaid(nextSch)?.date ?? null } : { payment_cents: payment, payment_frequency: p.data.frequency, next_due: p.data.nextDue || null }),
    }).eq("id", cur.id).select("id"));
    // La línea del plan sigue a la deuda: nombre siempre; cuota y frecuencia desde este mes (los meses pasados no se tocan).
    const lines = must(await s.supabase.from("plan_lines").select("id, frequency").eq("debt_id", cur.id).eq("year", s.year).is("archived_at", null));
    const quotaChanged = !sch && (payment !== cur.payment_cents || p.data.frequency !== cur.payment_frequency);
    // Después del último pago la cuota queda en 0 (como hace metas al cambiar la fecha).
    const debt = lite({ ...cur, balance_cents: balance, start_balance_cents: start, rate_bps: rate, payment_cents: payment, payment_frequency: p.data.frequency });
    const range = planMonths({ year: s.year, start: s.today, count: null, payoffMonths: payoffOf(debt, s.today)?.months ?? null, freq: p.data.frequency });
    for (const l of lines) {
      if (quotaChanged && l.frequency !== "custom") {
        await updateLine(s, l.id, { name: p.data.name, amountCents: payment, frequency: p.data.frequency }, { fromMonth: s.month });
        if (range && range.toMonth < 12) await setCells(s, l.id, range.toMonth + 1, 12, 0);
      } else if (p.data.name !== cur.name) await updateLine(s, l.id, { name: p.data.name });
    }
    return ok(undefined);
  });
}

/** Elimina la deuda y sus pagos. Su línea del plan se queda (la base la desune): puede ser la hipoteca dentro de "Hogar". */
export async function deleteDebt(input: unknown) {
  return run({ feature: "deudas", revalidate: PATHS }, async (s) => {
    const p = z.object({ id: Id }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const rows = must(await s.supabase.from("debts").delete().eq("id", p.data.id).select("id"));
    if (rows.length === 0) return fail(s.t.errors.notFound);
    return ok(undefined);
  });
}

/** Líneas del plan de una deuda que siguen cobrando después de este mes (año en curso o siguientes). */
async function linesAfterToday(s: Session, debtId: string) {
  const lines = must(await s.supabase.from("plan_lines").select("id, year").eq("debt_id", debtId).gte("year", s.year).is("archived_at", null));
  if (!lines.length) return [];
  const cells = must(await s.supabase.from("plan_cells").select("line_id, month, amount_cents").in("line_id", lines.map((l) => l.id)).gt("amount_cents", 0));
  return lines.filter((l) => l.year > s.year || cells.some((c) => c.line_id === l.id && c.month > s.month));
}

/**
 * Registrar un pago: cuota, abono o total. Baja el saldo (nunca de más), marca el calendario y, si es la cuota,
 * la marca como pagada en el plan del mes. Al llegar a $0: saldada, puntos, insignia y pregunta por la cuota del plan.
 */
export async function payDebt(input: unknown) {
  return run<{ closed: boolean; askRemove: boolean; amountCents: number; name: string }>({ feature: "deudas", revalidate: PATHS }, async (s) => {
    const m = M[s.locale];
    const p = z.object({ id: Id, mode: z.enum(["cuota", "abono", "total"]), amount: Money }).safeParse(input);
    if (!p.success) return fail(s.t.errors.amount);
    const d = must(await s.supabase.from("debts").select(COLS).eq("id", p.data.id).is("closed_at", null).maybeSingle()) as DebtRow | null;
    if (!d) return fail(s.t.errors.notFound);
    if (d.balance_cents <= 0) return fail(m.errBalanceFirst);
    const debt = lite(d);
    const typed = p.data.amount.trim() ? parseMoney(p.data.amount) : p.data.mode === "cuota" ? (nextUnpaid(debt.schedule)?.amountCents ?? debt.paymentCents) : null;
    const amount = paymentAmount(p.data.mode, typed, d.balance_cents);
    if (amount === null) return fail(s.t.errors.amount);
    const after = balanceAfter(d.balance_cents, amount);

    const pay = must(await s.supabase.from("debt_payments").insert({ user_id: s.userId, debt_id: d.id, date: s.today, amount_cents: amount, kind: p.data.mode }).select("id").single());
    const sch = debt.schedule ? scheduleAfter(debt.schedule, d.start_balance_cents - after.balanceCents) : null;
    const step = (from: ISODate) => (debt.paymentFrequency === "monthly" ? addMonths(from, 1) : addDays(from, debt.paymentFrequency === "weekly" ? 7 : 14));
    const nextDue = sch ? (nextUnpaid(sch)?.date ?? null) : p.data.mode === "cuota" && d.next_due ? step(d.next_due) : d.next_due;
    const upd = await s.supabase.from("debts").update({
      balance_cents: after.balanceCents, next_due: after.closed ? null : nextDue, ...(sch ? { schedule: scheduleJson(sch) } : {}),
      ...(after.closed ? { closed_at: new Date().toISOString() } : {}),
    }).eq("id", d.id).select("id");
    if (upd.error || !upd.data?.length) {
      await s.supabase.from("debt_payments").delete().eq("id", pay.id); // sin transacción: se deshace el pago
      throw new Error(`db: ${upd.error?.message ?? "debt not updated"}`);
    }

    // El pago ya quedó: marcar la cuota del mes en el plan es un extra (si falla, no se repite el pago).
    if (p.data.mode === "cuota" && debt.paymentFrequency === "monthly") {
      await (async () => {
        const line = must(await s.supabase.from("plan_lines").select("id").eq("debt_id", d.id).eq("year", s.year).is("archived_at", null).limit(1))[0];
        if (!line) return;
        const cell = must(await s.supabase.from("plan_cells").select("amount_cents").eq("line_id", line.id).eq("month", s.month).maybeSingle());
        if (amount >= (cell?.amount_cents ?? debt.paymentCents)) await setMark(s, line.id, s.month, true);
      })().catch(() => undefined);
    }
    let points = 0, badge: string | undefined;
    if (after.closed) {
      points += await award(s, "debt_paid", d.id); // después de closed_at: la base valida el hecho
      if (await tryBadge(s, "unlock")) badge = "unlock";
    }
    await touchWeek(s);
    const askRemove = after.closed ? (await linesAfterToday(s, d.id)).length > 0 : false;
    return ok({ closed: after.closed, askRemove, amountCents: amount, name: d.name }, { points, badge });
  });
}

/** Deuda saldada: "Sí, quitarla" pone en 0 la cuota de los meses siguientes (y archiva la de años siguientes); "Dejarla" la desune. */
export async function settleDebtLine(input: unknown) {
  return run({ feature: "deudas", revalidate: [...PATHS, "/proyeccion"] }, async (s) => {
    const p = z.object({ id: Id, remove: z.boolean() }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const d = must(await s.supabase.from("debts").select("id").eq("id", p.data.id).not("closed_at", "is", null).maybeSingle());
    if (!d) return fail(s.t.errors.notFound);
    for (const l of await linesAfterToday(s, d.id)) {
      if (!p.data.remove) await updateLine(s, l.id, { debtId: null });
      else if (l.year > s.year) await archiveLine(s, l.id);
      else {
        // Monto en 0 también: así la copia del plan al año siguiente no trae de vuelta la cuota.
        await updateLine(s, l.id, { amountCents: 0 }, { fromMonth: s.month + 1 });
        if (s.month < 12) await setCells(s, l.id, s.month + 1, 12, 0);
      }
    }
    return ok(undefined);
  });
}

// ───────── Impuestos ─────────
export async function setTaxEnabled(input: unknown) {
  return run({ feature: "deudas", revalidate: ["/deudas"] }, async (s) => {
    const p = z.object({ enabled: z.boolean() }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    must(await s.supabase.from("tax_settings").upsert({ user_id: s.userId, enabled: p.data.enabled, updated_at: new Date().toISOString() }, { onConflict: "user_id" }).select("user_id"));
    return ok(undefined);
  });
}

export async function setTaxPercent(input: unknown) {
  return run({ feature: "deudas", revalidate: ["/deudas"] }, async (s) => {
    const p = z.object({ percent: z.string().max(12) }).safeParse(input);
    const bps = p.success ? parsePercent(p.data.percent) : null;
    if (bps === null) return fail(M[s.locale].errPct);
    must(await s.supabase.from("tax_settings").upsert({ user_id: s.userId, enabled: true, percent_bps: bps, updated_at: new Date().toISOString() }, { onConflict: "user_id" }).select("user_id"));
    return ok(undefined);
  });
}

export async function addTaxEntry(input: unknown) {
  return run({ feature: "deudas", revalidate: ["/deudas", "/inicio"] }, async (s) => {
    const p = z.object({ kind: z.enum(["ingreso", "apartado", "pago"]), amount: z.string().max(40), date: z.union([Day, z.literal("")]).default(""), note: z.string().trim().max(120).default("") }).safeParse(input);
    const amount = p.success ? parseMoney(p.data.amount) : null;
    if (!p.success || amount === null || amount <= 0) return fail(s.t.errors.amount);
    must(await s.supabase.from("tax_entries").insert({ user_id: s.userId, kind: p.data.kind, amount_cents: amount, date: p.data.date || s.today, note: p.data.note }).select("id"));
    await touchWeek(s);
    return ok(undefined);
  });
}

export async function deleteTaxEntry(input: unknown) {
  return run({ feature: "deudas", revalidate: ["/deudas"] }, async (s) => {
    const p = z.object({ id: Id }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const rows = must(await s.supabase.from("tax_entries").delete().eq("id", p.data.id).select("id"));
    return rows.length ? ok(undefined) : fail(s.t.errors.notFound);
  });
}

// ───────── Cuenta con la empresa ─────────
const Class = z.enum(["sin_clasificar", ...COMPANY_CLASSES]);

export async function addCompanyEntry(input: unknown) {
  return run({ feature: "deudas", revalidate: ["/deudas", "/inicio"] }, async (s) => {
    const p = z.object({ kind: z.enum(["aporte", "retiro"]), amount: z.string().max(40), date: z.union([Day, z.literal("")]).default(""), cls: Class.default("sin_clasificar"), note: z.string().trim().max(120).default("") }).safeParse(input);
    const amount = p.success ? parseMoney(p.data.amount) : null;
    if (!p.success || amount === null || amount <= 0) return fail(s.t.errors.amount);
    must(await s.supabase.from("company_entries").insert({
      user_id: s.userId, kind: p.data.kind, class: p.data.kind === "retiro" ? p.data.cls : "sin_clasificar", amount_cents: amount, date: p.data.date || s.today, note: p.data.note,
    }).select("id"));
    await touchWeek(s);
    return ok(undefined);
  });
}

export async function classifyCompanyEntry(input: unknown) {
  return run({ feature: "deudas", revalidate: ["/deudas", "/inicio"] }, async (s) => {
    const p = z.object({ id: Id, cls: z.enum(COMPANY_CLASSES) }).safeParse(input);
    if (!p.success) return fail(M[s.locale].pickClass);
    const rows = must(await s.supabase.from("company_entries").update({ class: p.data.cls }).eq("id", p.data.id).eq("kind", "retiro").select("id"));
    return rows.length ? ok(undefined) : fail(s.t.errors.notFound);
  });
}

export async function deleteCompanyEntry(input: unknown) {
  return run({ feature: "deudas", revalidate: ["/deudas", "/inicio"] }, async (s) => {
    const p = z.object({ id: Id }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const rows = must(await s.supabase.from("company_entries").delete().eq("id", p.data.id).select("id"));
    return rows.length ? ok(undefined) : fail(s.t.errors.notFound);
  });
}
