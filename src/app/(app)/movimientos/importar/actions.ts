"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addDays, parts, type ISODate } from "@/lib/engine";
import { fail, ok, run } from "@/server/action";
import { fetchAll, loadMonthView, must } from "@/server/data";
import { setMark } from "@/server/plan-write";
import { firstStep, touchWeek } from "@/server/rewards";
import type { Session } from "@/server/session";
import { BATCH, cardBalance, cleanDescription, patternOf, type Existing, type LineCand } from "./lib";
import { M } from "./messages";

// Rutas que leen movimientos, marcas o saldos.
const PATHS = ["/movimientos", "/inicio", "/plan", "/cuentas", "/cierre", "/analisis", "/movimientos/importar"];

const id = z.guid();
const optId = z.guid().nullable().catch(null);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d);
const bank = z.string().trim().min(1).max(60);
const cents = z.number().int().refine((n) => Math.abs(n) < 1e13);

/** El CSV es una función que el admin puede apagar. */
const csvOff = (s: Session) => (!s.config.flags.csv ? fail(M[s.locale].errors.off) : null);

async function ownAccount(s: Session, accountId: string) {
  return must(await s.supabase.from("accounts").select("id, name, kind, balance_cents, balance_date").eq("id", accountId).is("archived_at", null).limit(1))[0] ?? null;
}

// ───────── Formato del banco ─────────
const Mapping = z.object({
  hasHeader: z.boolean(), date: z.number().int().min(0).max(200), description: z.number().int().min(0).max(200),
  amount: z.number().int().min(0).max(200).nullable(), debit: z.number().int().min(0).max(200).nullable(), credit: z.number().int().min(0).max(200).nullable(),
  balance: z.number().int().min(0).max(200).nullable(), dateFormat: z.enum(["DMY", "MDY", "YMD"]), invert: z.boolean().catch(false),
  headers: z.array(z.string().max(120)).max(200).catch([]), columns: z.number().int().min(0).max(200).catch(0),
});

/** Guarda (o actualiza) el formato de columnas de ese banco: la próxima vez se salta el paso. */
export async function saveFormat(input: unknown) {
  return run({ feature: "csv", revalidate: ["/movimientos/importar"] }, async (s) => {
    const off = csvOff(s); if (off) return off;
    const p = z.object({ bank, mapping: Mapping }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    must(await s.supabase.from("csv_formats").upsert(
      { user_id: s.userId, bank: p.data.bank, mapping: p.data.mapping, updated_at: new Date().toISOString() },
      { onConflict: "user_id,bank" },
    ).select("id"));
    return ok(undefined);
  });
}

// ───────── Lo que hace falta para revisar: movimientos existentes, reglas, líneas y saldo ─────────
export type ImportContext = {
  account: { id: string; name: string; kind: string; balanceCents: number; balanceDate: ISODate };
  existing: Existing[];
  /** Movimientos de la cuenta entre el saldo escrito y el último día del archivo (para la conciliación). */
  accountTx: { date: ISODate; amountCents: number }[];
  rules: { id: string; pattern: string; categoryId: string | null; lineId: string | null }[];
  ruleLines: Record<string, { name: string; categoryId: string; year: number }>;
  lines: LineCand[];
};

type TxRow = { id: string; account_id: string | null; date: string; amount_cents: number; description: string; raw_description: string; transfer_pair_id: string | null };
type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
const MAX_MONTHS = 24;

export async function loadContext(input: unknown) {
  return run<ImportContext>({ write: false, feature: "csv" }, async (s) => {
    const off = csvOff(s); if (off) return off;
    const p = z.object({ accountId: id, from: date, to: date }).safeParse(input);
    if (!p.success || p.data.from > p.data.to) return fail(s.t.errors.generic);
    const { accountId, from, to } = p.data;
    const acc = await ownAccount(s, accountId);
    if (!acc) return fail(s.t.errors.notFound);
    const pad = s.config.matching.duplicateDays;

    // Para duplicados y transferencias: todas las cuentas, en el rango del archivo con margen. Las partes de un dividido no (cuenta el original).
    const near = await fetchAll<TxRow>((a, b) => s.supabase.from("transactions").select("id, account_id, date, amount_cents, description, raw_description, transfer_pair_id")
      .is("deleted_at", null).is("parent_id", null).gte("date", addDays(from, -pad)).lte("date", addDays(to, pad)).order("date").order("id").range(a, b) as unknown as Page<TxRow>);

    // Para la conciliación: lo de la cuenta entre su saldo escrito y el final del archivo (en cualquier dirección). El padre dividido no suma: suman sus partes.
    const lo = acc.balance_date < to ? acc.balance_date : to, hi = acc.balance_date < to ? to : acc.balance_date;
    const accountTx = await fetchAll<{ date: string; amount_cents: number }>((a, b) => s.supabase.from("transactions").select("date, amount_cents")
      .eq("account_id", accountId).is("deleted_at", null).eq("is_split", false).gt("date", lo).lte("date", hi).order("date").order("id").range(a, b) as unknown as Page<{ date: string; amount_cents: number }>);

    const rules = must(await s.supabase.from("category_rules").select("id, pattern, category_id, plan_line_id").order("created_at", { ascending: false }));
    const ruleLineIds = [...new Set(rules.map((r) => r.plan_line_id).filter((x): x is string => !!x))];
    const ruleLineRows = ruleLineIds.length ? must(await s.supabase.from("plan_lines").select("id, name, category_id, year").in("id", ruleLineIds)) : [];

    // Líneas del plan de cada mes del archivo (los 24 más recientes como máximo) para sugerir la unión.
    const months: { y: number; m: number }[] = [];
    const first = parts(from).y * 12 + parts(from).m - 1;
    for (let k = parts(to).y * 12 + parts(to).m - 1; k >= first && months.length < MAX_MONTHS; k--) months.push({ y: Math.floor(k / 12), m: (k % 12) + 1 });
    const views = await Promise.all(months.map(({ y, m }) => loadMonthView(s, y, m)));
    const lines: LineCand[] = views.flatMap((v) => v.groups.flatMap((g) => g.lines).map((l) => ({
      id: l.line.id, name: l.line.name, kind: l.line.kind, plannedCents: l.plannedCents, categoryId: l.line.categoryId, year: v.year, month: v.month,
      alreadyPaid: l.txIds.length > 0 && (l.status === "paid" || l.status === "over"),
    })));

    return ok({
      account: { id: acc.id, name: acc.name, kind: acc.kind, balanceCents: acc.balance_cents, balanceDate: acc.balance_date },
      existing: near.map((t) => ({ id: t.id, accountId: t.account_id, date: t.date, amountCents: t.amount_cents, description: t.raw_description || t.description, paired: !!t.transfer_pair_id })),
      accountTx: accountTx.map((t) => ({ date: t.date, amountCents: t.amount_cents })),
      rules: rules.map((r) => ({ id: r.id, pattern: r.pattern, categoryId: r.category_id, lineId: r.plan_line_id })),
      ruleLines: Object.fromEntries(ruleLineRows.map((l) => [l.id, { name: l.name, categoryId: l.category_id, year: l.year }])),
      lines,
    });
  });
}

// ───────── Importar: inicio, lotes de 500 y cierre ─────────
export async function startImport(input: unknown) {
  return run<string>({ feature: "csv" }, async (s) => {
    const off = csvOff(s); if (off) return off;
    const n = z.number().int().min(0).max(1_000_000);
    const p = z.object({ accountId: id, bank, total: n, duplicates: n, transfers: n, balanceDiff: cents.nullable() }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    if (!(await ownAccount(s, p.data.accountId))) return fail(s.t.errors.notFound);
    const row = must(await s.supabase.from("csv_imports").insert({
      user_id: s.userId, account_id: p.data.accountId, bank: p.data.bank, rows_total: p.data.total, rows_imported: 0,
      rows_duplicate: p.data.duplicates, rows_transfer: p.data.transfers, balance_diff_cents: p.data.balanceDiff,
    }).select("id").single());
    return ok(row.id);
  });
}

const Row = z.object({
  date, amountCents: cents.refine((n) => n !== 0), raw: z.string().trim().max(300),
  categoryId: optId, lineId: optId, pairId: optId,
});

/** Un lote (máximo 500 filas). Todo lo que llega del navegador se vuelve a comprobar: cuenta, categorías, líneas y parejas. */
export async function importBatch(input: unknown) {
  return run<{ inserted: number; transfers: number }>({ feature: "csv" }, async (s) => {
    const off = csvOff(s); if (off) return off;
    const p = z.object({ importId: id, accountId: id, rows: z.array(Row).min(1).max(BATCH) }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const { importId, accountId, rows } = p.data;
    const imp = must(await s.supabase.from("csv_imports").select("id, account_id").eq("id", importId).limit(1))[0];
    if (!imp || imp.account_id !== accountId || !(await ownAccount(s, accountId))) return fail(s.t.errors.notFound);

    const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];
    const catIds = uniq(rows.map((r) => r.categoryId)), lineIds = uniq(rows.map((r) => r.lineId)), pairIds = uniq(rows.map((r) => r.pairId));
    const cats = new Set(catIds.length ? must(await s.supabase.from("categories").select("id").in("id", catIds)).map((c) => c.id) : []);
    const lines = new Map(lineIds.length ? must(await s.supabase.from("plan_lines").select("id, year, category_id").in("id", lineIds).is("archived_at", null)).map((l) => [l.id, l]) : []);
    const pairs = new Map(pairIds.length
      ? must(await s.supabase.from("transactions").select("id, account_id, amount_cents").in("id", pairIds).is("deleted_at", null).is("transfer_pair_id", null).is("parent_id", null)).map((t) => [t.id, t])
      : []);

    const used = new Set<string>();
    const links: { pairId: string; newId: string }[] = [];
    const marks = new Set<string>();
    const payload = rows.map((r) => {
      const newId = randomUUID();
      const pair = r.pairId ? pairs.get(r.pairId) : undefined;
      const isTransfer = !!pair && !used.has(pair.id) && pair.account_id !== null && pair.account_id !== accountId && pair.amount_cents === -r.amountCents;
      if (isTransfer) { used.add(pair!.id); links.push({ pairId: pair!.id, newId }); }
      const line = !isTransfer && r.lineId ? lines.get(r.lineId) : undefined;
      const lineId = line && line.year === parts(r.date).y ? line.id : null;
      const categoryId = isTransfer ? null : r.categoryId && cats.has(r.categoryId) ? r.categoryId : lineId ? line!.category_id : null;
      if (lineId) marks.add(`${lineId}:${parts(r.date).m}`);
      return {
        id: newId, user_id: s.userId, account_id: accountId, date: r.date, amount_cents: r.amountCents,
        description: r.raw ? cleanDescription(r.raw) : M[s.locale].untitled, raw_description: r.raw, category_id: categoryId, plan_line_id: lineId,
        kind: isTransfer ? "transfer" : "normal", transfer_pair_id: isTransfer ? pair!.id : null,
        status: isTransfer || categoryId || lineId ? "ok" : "review", source: "csv", import_id: importId,
      };
    });

    const inserted = must(await s.supabase.from("transactions").insert(payload).select("id"));
    // la otra punta, que ya existía en otra cuenta: también pasa a ser transferencia (no es ingreso ni gasto) y apunta a la nueva
    for (const l of links) {
      must(await s.supabase.from("transactions").update({ kind: "transfer", transfer_pair_id: l.newId, plan_line_id: null, status: "ok" }).eq("id", l.pairId).is("transfer_pair_id", null).select("id"));
    }
    // unido a una línea "Pagada · a mano": el movimiento la reemplaza
    for (const k of marks) { const [lineId, month] = k.split(":"); await setMark(s, lineId, Number(month), false); }
    return ok({ inserted: inserted.length, transfers: links.length });
  });
}

/** Cierra la importación: conteo real, reglas nuevas, racha y primer paso. */
export async function finishImport(input: unknown) {
  return run<{ imported: number; rules: number }>({ feature: "csv", revalidate: PATHS }, async (s) => {
    const off = csvOff(s); if (off) return off;
    const p = z.object({
      importId: id,
      rules: z.array(z.object({ pattern: z.string().max(120), categoryId: optId, lineId: optId })).max(100),
    }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const imp = must(await s.supabase.from("csv_imports").select("id").eq("id", p.data.importId).limit(1))[0];
    if (!imp) return fail(s.t.errors.notFound);

    const { count, error } = await s.supabase.from("transactions").select("id", { count: "exact", head: true }).eq("import_id", imp.id).is("deleted_at", null);
    if (error) throw new Error(`db: ${error.message}`);
    const imported = count ?? 0;
    const transfers = await s.supabase.from("transactions").select("id", { count: "exact", head: true }).eq("import_id", imp.id).eq("kind", "transfer").is("deleted_at", null);
    if (transfers.error) throw new Error(`db: ${transfers.error.message}`);
    must(await s.supabase.from("csv_imports").update({ rows_imported: imported, rows_transfer: transfers.count ?? 0 }).eq("id", imp.id).select("id"));

    // reglas nuevas (las mismas que crea Movimientos): patrón normalizado; la nueva reemplaza a la del mismo patrón
    const catIds = [...new Set(p.data.rules.map((r) => r.categoryId).filter((x): x is string => !!x))];
    const lineIds = [...new Set(p.data.rules.map((r) => r.lineId).filter((x): x is string => !!x))];
    const cats = new Set(catIds.length ? must(await s.supabase.from("categories").select("id").in("id", catIds)).map((c) => c.id) : []);
    const lines = new Set(lineIds.length ? must(await s.supabase.from("plan_lines").select("id").in("id", lineIds)).map((l) => l.id) : []);
    const seen = new Set<string>();
    let ruleCount = 0;
    for (const r of p.data.rules) {
      const pattern = patternOf(r.pattern);
      const categoryId = r.categoryId && cats.has(r.categoryId) ? r.categoryId : null;
      const lineId = r.lineId && lines.has(r.lineId) ? r.lineId : null;
      if (!pattern || seen.has(pattern) || (!categoryId && !lineId)) continue;
      seen.add(pattern);
      must(await s.supabase.from("category_rules").delete().eq("pattern", pattern).select("id"));
      must(await s.supabase.from("category_rules").insert({ user_id: s.userId, pattern, category_id: categoryId, plan_line_id: lineId }).select("id"));
      ruleCount++;
    }

    let points = 0;
    if (imported > 0) {
      await touchWeek(s);
      points = await firstStep(s, "gasto");
    }
    revalidatePath("/(app)/plan/mes/[mes]", "page");
    return ok({ imported, rules: ruleCount }, { points: points || undefined });
  });
}

/** Conciliación: usar el saldo final del archivo como saldo escrito de la cuenta, con la fecha del último día del archivo. */
export async function setBalanceFromFile(input: unknown) {
  return run({ revalidate: ["/cuentas", "/inicio", "/cierre", "/movimientos/importar"] }, async (s) => {
    const off = csvOff(s); if (off) return off;
    const p = z.object({ accountId: id, balanceCents: cents, date }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const acc = await ownAccount(s, p.data.accountId);
    if (!acc) return fail(s.t.errors.notFound);
    if (p.data.date > s.today) return fail(s.t.errors.date);
    // nunca se pisa un saldo escrito más reciente que el archivo
    if (acc.balance_date > p.data.date) return fail(M[s.locale].errors.newerBalance);
    must(await s.supabase.from("accounts").update({ balance_cents: cardBalance(acc.kind, p.data.balanceCents), balance_date: p.data.date }).eq("id", acc.id).select("id"));
    return ok(undefined);
  });
}
