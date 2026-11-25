"use server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail, ok, type Result } from "@/server/action";
import { must } from "@/server/data";
import type { Session } from "@/server/session";
import { checkNote, endOfDay, expiryDay, expiryFrom } from "../../_shared/lib";
import { adminAction, adminText, appUrl, audit, loadUser, mailGrant } from "../../_shared/server";
import { M } from "./messages";

const paths = (id: string) => [`/admin/usuarios/${id}`, "/admin/usuarios", "/admin", "/admin/actividad"];
const Id = z.string().uuid();

/** Acción sobre un usuario concreto: valida el id y que exista. */
function onUser<T>(input: unknown, extra: z.ZodRawShape, fn: (s: Session, data: Record<string, unknown> & { userId: string }) => Promise<Result<T>>) {
  const raw = (input ?? {}) as { userId?: unknown };
  const userId = Id.safeParse(raw.userId);
  return adminAction(userId.success ? paths(userId.data) : [], async (s) => {
    const p = z.object({ userId: Id, ...extra }).safeParse(input);
    if (!p.success) return fail(adminText(s).errors.generic);
    return fn(s, p.data as Record<string, unknown> & { userId: string });
  });
}
const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Da o extiende el acceso gratis. Extender suma desde el vencimiento actual si aún no venció. */
export async function grantOne(input: unknown) {
  return onUser(input, { kind: z.enum(["alumno", "fundador"]), mode: z.enum(["vida", "meses", "fecha"]), months: z.string().max(4).default(""), until: z.string().max(10).default(""), notify: z.boolean().default(false) }, async (s, d) => {
    const t = adminText(s);
    const u = await loadUser(s, d.userId);
    if (!u) return fail(t.errors.notFound);
    const current = (u.state === "alumno" || u.state === "fundador") && u.access_until ? expiryDay(u.access_until) : s.today;
    const e = expiryFrom(d.mode as "vida" | "meses" | "fecha", { months: d.months as string, until: d.until as string }, s.today, current);
    if (!e.ok) return fail(t.errors[e.error]);
    must(await s.supabase.rpc("admin_grant_access", { p_user: d.userId, p_kind: d.kind as string, p_expires: endOfDay(e.until) as string }));
    // "Avisarle por correo": el aviso en la app ya lo crea admin_grant_access.
    const mail = d.notify ? await mailGrant(s, [d.userId], d.kind as "alumno" | "fundador", e.until) : null;
    return ok({ until: e.until, mailed: mail ? mail.sent > 0 : null });
  });
}

export async function revokeAccess(input: unknown) {
  return onUser(input, {}, async (s, d) => {
    must(await s.supabase.rpc("admin_revoke_access", { p_user: d.userId }));
    return ok(undefined);
  });
}

/**
 * "Pasar a plan pagado": quita su acceso gratis (misma función que "Quitar acceso gratis"; con la migración 034 su cuenta
 * queda en solo lectura: ve y exporta todo y reactiva con su tarjeta). No cobra nada ni le escribe: lo decide al poner la tarjeta.
 * Queda en el registro como un paso a plan pagado, además del "quitó el acceso" que anota la base.
 */
export async function moveToPaid(input: unknown) {
  return onUser(input, {}, async (s, d) => {
    const u = await loadUser(s, d.userId);
    if (!u) return fail(adminText(s).errors.notFound);
    if (u.state !== "alumno" && u.state !== "fundador") return fail(M[s.locale].errNotFree);
    must(await s.supabase.rpc("admin_revoke_access", { p_user: d.userId }));
    await audit(s, "quitar_acceso_pagado", d.userId, { kind: u.state });
    return ok(undefined);
  });
}

export async function setSuspended(input: unknown) {
  return onUser(input, { on: z.boolean() }, async (s, d) => {
    if (d.userId === s.userId) return fail(adminText(s).errors.self);
    must(await s.supabase.rpc("admin_set_suspended", { p_user: d.userId, p_on: d.on as boolean }));
    return ok(undefined);
  });
}

/** Cambiar el rol exige escribir el correo del usuario. Nadie se quita el rol a sí mismo. */
export async function setRole(input: unknown) {
  return onUser(input, { role: z.enum(["user", "admin"]), email: z.string().max(200) }, async (s, d) => {
    const t = adminText(s);
    if (d.userId === s.userId) return fail(t.errors.self);
    const u = await loadUser(s, d.userId);
    if (!u) return fail(t.errors.notFound);
    if (!sameEmail(u.email, d.email as string)) return fail(t.errors.email);
    must(await s.supabase.rpc("admin_set_role", { p_user: d.userId, p_role: d.role as string }));
    return ok(undefined);
  });
}

/**
 * Reinicia los 2 pasos: borra sus factores (API de administración de Auth) y sus códigos de respaldo.
 * Es una de las dos únicas operaciones del panel que usan la clave de servicio, y nunca toca finanzas.
 */
export async function resetMfa(input: unknown) {
  return onUser(input, { email: z.string().max(200) }, async (s, d) => {
    const t = adminText(s);
    const u = await loadUser(s, d.userId);
    if (!u) return fail(t.errors.notFound);
    if (!sameEmail(u.email, d.email as string)) return fail(t.errors.email);
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: d.userId });
    if (error) return fail(t.errors.generic);
    for (const f of data.factors) {
      const r = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: d.userId });
      if (r.error) return fail(t.errors.generic);
    }
    must(await admin.from("mfa_backup_codes").delete().eq("user_id", d.userId).select("id"));
    await audit(s, "reiniciar_2pasos", d.userId, { factors: data.factors.length });
    return ok(data.factors.length);
  });
}

/** Correo para cambiar la contraseña, con el cliente normal (el mismo flujo de "Olvidé mi contraseña"). */
export async function sendPasswordReset(input: unknown) {
  return onUser(input, {}, async (s, d) => {
    const t = adminText(s);
    const u = await loadUser(s, d.userId);
    if (!u) return fail(t.errors.notFound);
    const { error } = await s.supabase.auth.resetPasswordForEmail(u.email, { redirectTo: `${appUrl()}/auth/confirm?next=/nueva-clave` });
    if (error) return fail(error.status === 429 ? M[s.locale].errRate : t.errors.generic);
    await audit(s, "restablecer_clave", d.userId);
    return ok(undefined);
  });
}

/** Nota interna: sin montos ni datos de salud. El texto no va al registro. */
export async function addNote(input: unknown) {
  return onUser(input, { body: z.string().max(2000) }, async (s, d) => {
    const m = M[s.locale];
    const c = checkNote(d.body as string);
    if (!c.ok) return fail(c.error === "money" ? m.errMoney : c.error === "long" ? m.errLong : m.errEmpty);
    must(await s.supabase.from("admin_notes").insert({ user_id: d.userId, admin_id: s.userId, body: c.body }).select("id").single());
    await audit(s, "nota_agregar", d.userId);
    return ok(undefined);
  });
}

export async function deleteNote(input: unknown) {
  return onUser(input, { noteId: Id }, async (s, d) => {
    must(await s.supabase.from("admin_notes").delete().eq("id", d.noteId as string).eq("user_id", d.userId).select("id").single());
    await audit(s, "nota_borrar", d.userId);
    return ok(undefined);
  });
}

export async function addToGroup(input: unknown) {
  return onUser(input, { groupId: Id }, async (s, d) => {
    const { error } = await s.supabase.from("group_members").insert({ group_id: d.groupId as string, user_id: d.userId });
    if (error && error.code !== "23505") return fail(adminText(s).errors.generic);
    await audit(s, "grupo_agregar", d.userId, { group: d.groupId as string });
    return ok(undefined);
  });
}

export async function removeFromGroup(input: unknown) {
  return onUser(input, { groupId: Id }, async (s, d) => {
    must(await s.supabase.from("group_members").delete().eq("group_id", d.groupId as string).eq("user_id", d.userId).select("user_id"));
    await audit(s, "grupo_quitar", d.userId, { group: d.groupId as string });
    return ok(undefined);
  });
}
