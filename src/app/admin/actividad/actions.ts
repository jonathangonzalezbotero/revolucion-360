"use server";
import { fill } from "@/i18n";
import { z } from "zod";
import { fail, ok } from "@/server/action";
import { adminAction, adminText } from "../_shared/server";
import { M } from "./messages";
import { ADMIN_ROLES } from "./roles";

// Invitar administradores y cambiar su rol: SOLO el Dueño (sección "administradores"). La base lo vuelve a exigir
// (`admin_invite` y `admin_set_admin_role` verifican `is_admin_owner()`) y deja cada cambio en el registro.
const PATHS = ["/admin/actividad", "/admin/usuarios"];
type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };
const NOT_READY = "PGRST202"; // migración 20261125000033 sin aplicar

/** "+ Invitar administrador": correo de una cuenta que ya existe y su rol. */
export async function inviteAdmin(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const m = M[s.locale], roles = adminText(s).adminRoles;
    const p = z.object({ email: z.string().trim().toLowerCase().email().max(200), role: z.enum(ADMIN_ROLES) }).safeParse(input);
    if (!p.success) return fail(m.errEmail);
    const r = (await s.supabase.rpc("admin_invite" as never, { p_email: p.data.email, p_role: p.data.role } as never)) as unknown as RpcResult;
    if (r.error) return fail(r.error.code === NOT_READY ? m.errNotReady : adminText(s).errors.generic);
    switch (r.data) {
      case "ok": return ok(fill(m.invited, { email: p.data.email, role: roles[p.data.role] }));
      case "not_found": return fail(m.errNotFound);
      case "suspended": return fail(m.errSuspended);
      case "self": return fail(m.errSelf);
      case "same": return fail(m.errSame);
      default: return fail(adminText(s).errors.generic);
    }
  }, "administradores");
}

/** Cambia el rol de un administrador, o lo saca del panel (`none`). Nunca el propio. */
export async function setAdminRole(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const t = adminText(s);
    const p = z.object({ userId: z.string().uuid(), role: z.enum([...ADMIN_ROLES, "none"]) }).safeParse(input);
    if (!p.success) return fail(t.errors.generic);
    if (p.data.userId === s.userId) return fail(t.errors.self);
    const r = (await s.supabase.rpc("admin_set_admin_role" as never, { p_user: p.data.userId, p_role: p.data.role } as never)) as unknown as RpcResult;
    if (r.error) return fail(r.error.code === NOT_READY ? M[s.locale].errNotReady : t.errors.generic);
    return ok(p.data.role);
  }, "administradores");
}
