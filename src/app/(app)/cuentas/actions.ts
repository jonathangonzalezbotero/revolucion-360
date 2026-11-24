"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { parseMoney, type AccountKind } from "@/lib/engine";
import { fail, ok, run } from "@/server/action";
import { must } from "@/server/data";
import { firstStep } from "@/server/rewards";
import { cardBalance, defaultsFor, transferBalances, transferError, transferRows } from "./lib";
import { M } from "./messages";

const PATHS = ["/cuentas", "/inicio", "/proyeccion", "/movimientos", "/diagnostico"];
const Kind = z.enum(["bank", "savings", "card", "cash", "business", "other"]);
const Id = z.string().uuid();

/** Agrega una cuenta con su saldo de hoy. La primera suma los puntos del primer paso "cuenta". */
export async function addAccount(input: unknown) {
  return run<{ id: string; inForecast: boolean }>({ revalidate: PATHS }, async (s) => {
    const p = z.object({ name: z.string().trim().min(1).max(80), institution: z.string().trim().max(80).default(""), kind: Kind, balance: z.string().max(40).default("") }).safeParse(input);
    if (!p.success) return fail(s.t.errors.name);
    const typed = p.data.balance.trim() ? parseMoney(p.data.balance) : 0;
    if (typed === null) return fail(M[s.locale].errBalance);
    const balance = cardBalance(p.data.kind, typed);
    const d = defaultsFor(p.data.kind);
    const last = must(await s.supabase.from("accounts").select("sort").order("sort", { ascending: false }).limit(1))[0]?.sort ?? -1;
    const row = must(await s.supabase.from("accounts").insert({
      user_id: s.userId, name: p.data.name, institution: p.data.institution, kind: p.data.kind, balance_cents: balance, balance_date: s.today,
      in_networth: d.inNetworth, in_forecast: d.inForecast, sort: last + 1,
    }).select("id").single());
    const points = await firstStep(s, "cuenta");
    return ok({ id: row.id, inForecast: d.inForecast }, { points });
  });
}

export async function updateAccount(input: unknown) {
  return run({ revalidate: PATHS }, async (s) => {
    const p = z.object({ id: Id, name: z.string().trim().min(1).max(80), institution: z.string().trim().max(80).default(""), kind: Kind }).safeParse(input);
    if (!p.success) return fail(s.t.errors.name);
    const cur = must(await s.supabase.from("accounts").select("balance_cents").eq("id", p.data.id).maybeSingle());
    if (!cur) return fail(s.t.errors.notFound);
    // si pasa a ser tarjeta, su saldo queda como deuda (negativo)
    must(await s.supabase.from("accounts").update({ name: p.data.name, institution: p.data.institution, kind: p.data.kind, balance_cents: cardBalance(p.data.kind, cur.balance_cents) }).eq("id", p.data.id).select("id"));
    return ok(undefined);
  });
}

/** "Usar en mi proyección", "Contar en mi patrimonio" y "Es mi fondo de emergencia". */
export async function setAccountFlags(input: unknown) {
  return run({ revalidate: PATHS }, async (s) => {
    const p = z.object({ id: Id, inForecast: z.boolean().optional(), inNetworth: z.boolean().optional(), isEmergencyFund: z.boolean().optional() }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const patch: { in_forecast?: boolean; in_networth?: boolean; is_emergency_fund?: boolean } = {};
    if (p.data.inForecast !== undefined) patch.in_forecast = p.data.inForecast;
    if (p.data.inNetworth !== undefined) patch.in_networth = p.data.inNetworth;
    if (p.data.isEmergencyFund !== undefined) patch.is_emergency_fund = p.data.isEmergencyFund;
    if (Object.keys(patch).length === 0) return fail(s.t.errors.generic);
    const rows = must(await s.supabase.from("accounts").update(patch).eq("id", p.data.id).select("id"));
    return rows.length ? ok(undefined) : fail(s.t.errors.notFound);
  });
}

/** Escribir el saldo de hoy: queda con la fecha de hoy (en la zona horaria del usuario). */
export async function setBalance(input: unknown) {
  return run({ revalidate: PATHS }, async (s) => {
    const p = z.object({ id: Id, balance: z.string().max(40) }).safeParse(input);
    const balance = p.success ? parseMoney(p.data.balance) : null;
    if (!p.success || balance === null) return fail(M[s.locale].errBalance);
    const cur = must(await s.supabase.from("accounts").select("kind").eq("id", p.data.id).maybeSingle());
    if (!cur) return fail(s.t.errors.notFound);
    must(await s.supabase.from("accounts").update({ balance_cents: cardBalance(cur.kind as AccountKind, balance), balance_date: s.today }).eq("id", p.data.id).select("id"));
    return ok(undefined);
  });
}

export async function archiveAccount(input: unknown) {
  return run({ revalidate: PATHS }, async (s) => {
    const p = z.object({ id: Id }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const rows = must(await s.supabase.from("accounts").update({ archived_at: new Date().toISOString() }).eq("id", p.data.id).select("id"));
    return rows.length ? ok(undefined) : fail(s.t.errors.notFound);
  });
}

/**
 * Transferencia entre cuentas propias: dos movimientos `transfer` con el mismo par (no es ingreso ni gasto)
 * y los dos saldos escritos se mueven con fecha de hoy. Como el saldo queda con fecha de hoy y el movimiento
 * también, `expectedBalance` (solo suma lo posterior al saldo) no lo cuenta dos veces.
 */
export async function transfer(input: unknown) {
  return run<{ amountCents: number }>({ revalidate: PATHS }, async (s) => {
    const m = M[s.locale];
    const p = z.object({ fromId: Id, toId: Id, amount: z.string().max(40) }).safeParse(input);
    if (!p.success) return fail(m.errSame);
    const amount = parseMoney(p.data.amount);
    const err = transferError(p.data.fromId, p.data.toId, amount);
    if (err === "same") return fail(m.errSame);
    if (err === "amount" || amount === null) return fail(s.t.errors.amount);
    const accounts = must(await s.supabase.from("accounts").select("id, name, balance_cents").in("id", [p.data.fromId, p.data.toId]).is("archived_at", null));
    const from = accounts.find((a) => a.id === p.data.fromId), to = accounts.find((a) => a.id === p.data.toId);
    if (!from || !to) return fail(s.t.errors.notFound);
    must(await s.supabase.from("transactions").insert(transferRows(s.userId, from, to, amount, s.today, randomUUID(), { to: m.tfTo, from: m.tfFrom })).select("id"));
    const next = transferBalances(from.balance_cents, to.balance_cents, amount);
    must(await s.supabase.from("accounts").update({ balance_cents: next.from, balance_date: s.today }).eq("id", from.id).select("id"));
    must(await s.supabase.from("accounts").update({ balance_cents: next.to, balance_date: s.today }).eq("id", to.id).select("id"));
    return ok({ amountCents: Math.abs(amount) });
  });
}
