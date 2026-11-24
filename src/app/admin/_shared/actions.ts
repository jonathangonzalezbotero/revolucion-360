"use server";
import { z } from "zod";
import { fail, ok } from "@/server/action";
import { fetchAll, must } from "@/server/data";
import { endOfDay, expiryFrom, parseEmails } from "./lib";
import { adminAction, adminText, audit, findByEmail } from "./server";

const Grant = z.object({
  kind: z.enum(["alumno", "fundador"]),
  mode: z.enum(["vida", "meses", "fecha"]),
  months: z.string().max(4).default(""),
  until: z.string().max(10).default(""),
});
const REVALIDATE = ["/admin", "/admin/usuarios", "/admin/grupos", "/admin/actividad"];

/** Da acceso gratis (alumno o fundador) a usuarios elegidos y/o a correos pegados. */
export async function grantUsers(input: unknown) {
  return adminAction(REVALIDATE, async (s) => {
    const t = adminText(s);
    const p = Grant.extend({ ids: z.array(z.string().uuid()).max(500).default([]), emails: z.string().max(20_000).default("") }).safeParse(input);
    if (!p.success) return fail(t.errors.generic);
    const e = expiryFrom(p.data.mode, p.data, s.today);
    if (!e.ok) return fail(t.errors[e.error]);
    const ids = new Set(p.data.ids);
    const { valid, invalid } = parseEmails(p.data.emails);
    const notFound = [...invalid];
    for (const email of valid) {
      const u = await findByEmail(s, email);
      if (u) ids.add(u.id); else notFound.push(email);
    }
    if (ids.size === 0) return fail(notFound.length ? `${t.errors.notFound} ${notFound.join(", ")}` : t.errors.generic);
    for (const id of ids) {
      must(await s.supabase.rpc("admin_grant_access", { p_user: id, p_kind: p.data.kind, p_expires: endOfDay(e.until) as string }));
    }
    return ok({ granted: ids.size, notFound });
  });
}

/** Da acceso a todos los miembros de un grupo (cada acceso queda ligado al grupo). */
export async function grantGroup(input: unknown) {
  return adminAction(REVALIDATE, async (s) => {
    const t = adminText(s);
    const p = Grant.extend({ groupId: z.string().uuid() }).safeParse(input);
    if (!p.success) return fail(t.errors.generic);
    const e = expiryFrom(p.data.mode, p.data, s.today);
    if (!e.ok) return fail(t.errors[e.error]);
    const members = await fetchAll((a, b) => s.supabase.from("group_members").select("user_id").eq("group_id", p.data.groupId).order("user_id").range(a, b));
    for (const m of members) {
      must(await s.supabase.rpc("admin_grant_access", { p_user: m.user_id, p_kind: p.data.kind, p_expires: endOfDay(e.until) as string, p_group: p.data.groupId }));
    }
    return ok({ granted: members.length, notFound: [] as string[] });
  });
}

/** Crea un grupo (también desde el formulario de dar acceso). */
export async function createGroup(input: unknown) {
  return adminAction(REVALIDATE, async (s) => {
    const t = adminText(s);
    const p = z.object({ name: z.string().trim().min(1).max(80), note: z.string().trim().max(300).default("") }).safeParse(input);
    if (!p.success) return fail(t.errors.generic);
    const row = must(await s.supabase.from("groups").insert({ name: p.data.name, note: p.data.note }).select("id, name").single());
    await audit(s, "grupo_crear", null, { group: row.id, name: row.name });
    return ok(row);
  });
}
