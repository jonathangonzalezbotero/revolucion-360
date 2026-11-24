"use server";
import { z } from "zod";
import { fail, ok } from "@/server/action";
import { must } from "@/server/data";
import { parseEmails } from "../_shared/lib";
import { adminAction, adminText, audit, findByEmail } from "../_shared/server";
import { M } from "./messages";

const PATHS = ["/admin/grupos", "/admin/usuarios", "/admin/actividad"];
const Id = z.string().uuid();

export async function renameGroup(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const p = z.object({ id: Id, name: z.string().trim().min(1).max(80) }).safeParse(input);
    if (!p.success) return fail(M[s.locale].errName);
    must(await s.supabase.from("groups").update({ name: p.data.name }).eq("id", p.data.id).select("id").single());
    await audit(s, "grupo_renombrar", null, { group: p.data.id, name: p.data.name });
    return ok(undefined);
  });
}

/** Borrar un grupo no quita accesos: los accesos quedan sin grupo (on delete set null). */
export async function deleteGroup(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const p = z.object({ id: Id }).safeParse(input);
    if (!p.success) return fail(adminText(s).errors.generic);
    const row = must(await s.supabase.from("groups").delete().eq("id", p.data.id).select("id, name").single());
    await audit(s, "grupo_borrar", null, { name: row.name });
    return ok(undefined);
  });
}

/** Suma personas por correo exacto. Devuelve los correos que no existen. */
export async function addMembers(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const m = M[s.locale];
    const p = z.object({ groupId: Id, emails: z.string().max(20_000) }).safeParse(input);
    if (!p.success) return fail(adminText(s).errors.generic);
    const { valid, invalid } = parseEmails(p.data.emails);
    if (valid.length === 0) return fail(m.errEmails);
    const notFound = [...invalid];
    let added = 0;
    for (const email of valid) {
      const u = await findByEmail(s, email);
      if (!u) { notFound.push(email); continue; }
      const { error } = await s.supabase.from("group_members").insert({ group_id: p.data.groupId, user_id: u.id });
      if (error && error.code !== "23505") return fail(adminText(s).errors.generic);
      if (!error) { added++; await audit(s, "grupo_agregar", u.id, { group: p.data.groupId }); }
    }
    return ok({ added, notFound });
  });
}

export async function removeMember(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const p = z.object({ groupId: Id, userId: Id }).safeParse(input);
    if (!p.success) return fail(adminText(s).errors.generic);
    must(await s.supabase.from("group_members").delete().eq("group_id", p.data.groupId).eq("user_id", p.data.userId).select("user_id"));
    await audit(s, "grupo_quitar", p.data.userId, { group: p.data.groupId });
    return ok(undefined);
  });
}
