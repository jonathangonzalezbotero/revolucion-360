"use server";
import { z } from "zod";
import { fill } from "@/i18n";
import { normalize, parseMoney } from "@/lib/engine";
import { fail, ok, run } from "@/server/action";
import { must } from "@/server/data";
import type { Session } from "@/server/session";
import { MAX_WATCHED } from "./lib";
import { M } from "./messages";

const PATHS = ["/analisis"];
const Id = z.string().uuid();
const Fields = z.object({ name: z.string().trim().max(60).default(""), pattern: z.string().trim().max(60), limit: z.string().trim().max(20).optional() });

/** Revisa nombre y patrón; si falta el nombre se usa el patrón. Devuelve el error o los valores limpios. */
function clean(s: Session, input: unknown): { error: string } | { name: string; pattern: string; limitCents: number | null | undefined } {
  const m = M[s.locale];
  if (!s.config.flags.comercios) return { error: m.errors.off };
  const p = Fields.safeParse(input);
  if (!p.success || !normalize(p.data.pattern)) return { error: m.errors.pattern };
  // Límite opcional: vacío = sin límite; si viene, un monto mayor que cero. `undefined` = no se tocó.
  let limitCents: number | null | undefined;
  if (p.data.limit !== undefined) {
    if (p.data.limit === "") limitCents = null;
    else {
      const c = parseMoney(p.data.limit);
      if (c === null || c <= 0) return { error: m.errors.limit };
      limitCents = c;
    }
  }
  return { name: p.data.name || p.data.pattern, pattern: p.data.pattern, limitCents };
}

export async function addWatched(input: unknown) {
  return run({ feature: "ana", revalidate: PATHS }, async (s) => {
    const c = clean(s, input);
    if ("error" in c) return fail(c.error);
    const { count, error } = await s.supabase.from("watched_merchants").select("id", { count: "exact", head: true });
    if (error) throw new Error(`db: ${error.message}`);
    if ((count ?? 0) >= MAX_WATCHED) return fail(fill(M[s.locale].errors.max, { max: MAX_WATCHED }));
    const row = must(await s.supabase.from("watched_merchants").insert({ user_id: s.userId, name: c.name, pattern: c.pattern, limit_cents: c.limitCents ?? null }).select("id").single());
    return ok(row.id);
  });
}

export async function updateWatched(input: unknown) {
  return run({ feature: "ana", revalidate: PATHS }, async (s) => {
    const id = Id.safeParse((input as { id?: unknown } | null)?.id);
    if (!id.success) return fail(s.t.errors.notFound);
    const c = clean(s, input);
    if ("error" in c) return fail(c.error);
    const rows = must(await s.supabase.from("watched_merchants").update({ name: c.name, pattern: c.pattern, ...(c.limitCents !== undefined ? { limit_cents: c.limitCents } : {}) }).eq("id", id.data).select("id"));
    if (rows.length === 0) return fail(s.t.errors.notFound);
    return ok(undefined);
  });
}

export async function deleteWatched(input: unknown) {
  return run({ feature: "ana", revalidate: PATHS }, async (s) => {
    const id = Id.safeParse(input);
    if (!id.success) return fail(s.t.errors.notFound);
    const rows = must(await s.supabase.from("watched_merchants").delete().eq("id", id.data).select("id"));
    if (rows.length === 0) return fail(s.t.errors.notFound);
    return ok(undefined);
  });
}
