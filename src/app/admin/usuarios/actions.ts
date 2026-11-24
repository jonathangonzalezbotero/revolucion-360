"use server";
import { z } from "zod";
import { fail, ok } from "@/server/action";
import { must } from "@/server/data";
import { checkCode, checkMaxUses, codeDuration, csvCell, parseFilter, parseSearch } from "../_shared/lib";
import { adminAction, adminText, audit } from "../_shared/server";
import { M } from "./messages";

const REVALIDATE = ["/admin/usuarios", "/admin/actividad"];

/** Crea un código de invitación. Se canjea al registrarse (`redeem_invite` en /auth/confirm). */
export async function createInvite(input: unknown) {
  return adminAction(REVALIDATE, async (s) => {
    const t = adminText(s), m = M[s.locale];
    const p = z.object({
      code: z.string().max(60), kind: z.enum(["alumno", "fundador"]), mode: z.enum(["vida", "meses", "fecha"]),
      months: z.string().max(4).default(""), until: z.string().max(10).default(""), maxUses: z.string().max(8).default(""), groupId: z.string().uuid().nullable().default(null),
    }).safeParse(input);
    if (!p.success) return fail(t.errors.generic);
    const c = checkCode(p.data.code);
    if (!c.ok) return fail(m.errCode);
    const u = checkMaxUses(p.data.maxUses);
    if (!u.ok) return fail(m.errUses);
    const d = codeDuration(p.data.mode, p.data, s.today);
    if (!d.ok) return fail(t.errors[d.error]);
    const { error } = await s.supabase.from("invite_codes").insert({
      code: c.code, kind: p.data.kind, months: d.months, until: d.until ? `${d.until}T23:59:59Z` : null, group_id: p.data.groupId, max_uses: u.max,
    });
    if (error) return fail(error.code === "23505" ? m.errDup : t.errors.generic);
    await audit(s, "codigo_crear", null, { code: c.code, kind: p.data.kind, months: d.months, until: d.until, group: p.data.groupId, max_uses: u.max });
    return ok(c.code);
  });
}

export async function setInviteActive(input: unknown) {
  return adminAction(REVALIDATE, async (s) => {
    const t = adminText(s);
    const p = z.object({ code: z.string().min(1).max(40), active: z.boolean() }).safeParse(input);
    if (!p.success) return fail(t.errors.generic);
    must(await s.supabase.from("invite_codes").update({ active: p.data.active }).eq("code", p.data.code).select("code").single());
    await audit(s, p.data.active ? "codigo_activar" : "codigo_desactivar", null, { code: p.data.code });
    return ok(undefined);
  });
}

/** Lista de usuarios en CSV (sin datos financieros: correo, nombre, país, plan, fechas). Queda en el registro. */
export async function exportUsers(input: unknown) {
  return adminAction(["/admin/actividad"], async (s) => {
    const p = z.object({ q: z.string().max(200).default(""), filtro: z.string().max(20).default("all") }).safeParse(input);
    if (!p.success) return fail(adminText(s).errors.generic);
    const q = parseSearch(p.data.q), filter = parseFilter(p.data.filtro);
    const head = ["email", "name", "country", "role", "plan", "access_until", "pro_until", "payment_failed", "suspended", "created_at", "last_active_at", "groups"];
    const lines = [head.join(",")];
    for (let offset = 0; offset < 100_000; offset += 1000) {
      const rows = must(await s.supabase.rpc("admin_users", { p_search: q, p_filter: filter, p_limit: 1000, p_offset: offset }));
      for (const r of rows) {
        lines.push([r.email, r.name, r.country, r.role, r.state, r.access_until, r.pro_until, r.payment_failed_at ? "yes" : "", r.suspended_at ? "yes" : "", r.created_at, r.last_active_at, (r.groups ?? []).join(" | ")].map(csvCell).join(","));
      }
      if (rows.length < 1000) break;
    }
    await audit(s, "exportar_lista", null, { filter, search: q || undefined, rows: lines.length - 1 });
    return ok(lines.join("\n"));
  });
}
