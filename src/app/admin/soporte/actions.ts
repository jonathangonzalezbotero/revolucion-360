"use server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail, ok } from "@/server/action";
import { must } from "@/server/data";
import { adminAction, adminText, audit, loadUser } from "../_shared/server";
import { M } from "./messages";

const SUPPORT = ["/admin/soporte", "/admin", "/admin/actividad"];
const Id = z.string().uuid();

/** Responde un caso: mensaje del admin, estado "respondido" y aviso al usuario. */
export async function replyTicket(input: unknown) {
  return adminAction(SUPPORT, async (s) => {
    const m = M[s.locale];
    const p = z.object({ ticketId: Id, body: z.string().trim().min(1).max(5000) }).safeParse(input);
    if (!p.success) return fail(m.errReply);
    const ticket = must(await s.supabase.from("support_tickets").select("id, user_id, subject").eq("id", p.data.ticketId).single());
    must(await s.supabase.from("ticket_messages").insert({ ticket_id: ticket.id, author_id: s.userId, from_admin: true, body: p.data.body }).select("id").single());
    must(await s.supabase.from("support_tickets").update({ status: "answered", updated_at: new Date().toISOString() }).eq("id", ticket.id).select("id").single());
    // El admin no puede escribir avisos de otros (RLS): la clave de servicio SOLO inserta esta notificación.
    const n = M.es.notify;
    const { error } = await createAdminClient().from("notifications").insert({
      user_id: ticket.user_id, kind: "sistema", title: n.title, body: n.body, href: "/ayuda", dedupe: `ticket-${ticket.id}-${Date.now()}`,
    });
    if (error) console.error("[admin] aviso de soporte no enviado");
    await audit(s, "soporte_responder", ticket.user_id, { ticket: ticket.id });
    return ok(undefined);
  });
}

export async function setTicketStatus(input: unknown) {
  return adminAction(SUPPORT, async (s) => {
    const p = z.object({ ticketId: Id, status: z.enum(["open", "answered", "closed"]) }).safeParse(input);
    if (!p.success) return fail(adminText(s).errors.generic);
    const row = must(await s.supabase.from("support_tickets").update({ status: p.data.status, updated_at: new Date().toISOString() }).eq("id", p.data.ticketId).select("id, user_id").single());
    await audit(s, "soporte_estado", row.user_id, { ticket: row.id, status: p.data.status });
    return ok(undefined);
  });
}

/** Marca hecha una solicitud de exportar (el usuario descarga sus datos desde Perfil). */
export async function markExportDone(input: unknown) {
  return adminAction(["/admin/soporte", "/admin", "/admin/actividad", "/admin/usuarios"], async (s) => {
    const p = z.object({ requestId: Id }).safeParse(input);
    if (!p.success) return fail(adminText(s).errors.generic);
    const row = must(await s.supabase.from("privacy_requests").update({ status: "done", done_at: new Date().toISOString() })
      .eq("id", p.data.requestId).eq("kind", "export").eq("status", "pending").select("id, user_id").single());
    await audit(s, "privacidad_exportar", row.user_id, { request: row.id });
    return ok(undefined);
  });
}

/**
 * Completa el borrado de una cuenta: exige escribir su correo, queda en el registro ANTES de borrar
 * (el correo va en el detalle porque la cuenta deja de existir) y llama `auth.admin.deleteUser`.
 * Todo lo demás se borra en cascada. Nunca la propia cuenta ni la de otro administrador.
 */
export async function deleteAccount(input: unknown) {
  return adminAction(["/admin/soporte", "/admin", "/admin/actividad", "/admin/usuarios"], async (s) => {
    const t = adminText(s), m = M[s.locale];
    const p = z.object({ userId: Id, email: z.string().max(200) }).safeParse(input);
    if (!p.success) return fail(t.errors.generic);
    if (p.data.userId === s.userId) return fail(t.errors.self);
    const u = await loadUser(s, p.data.userId);
    if (!u) return fail(t.errors.notFound);
    if (u.email.trim().toLowerCase() !== p.data.email.trim().toLowerCase()) return fail(t.errors.email);
    if (u.role === "admin") return fail(m.errAdmin);
    const pending = u.privacy.find((r) => r.kind === "delete" && r.status === "pending");
    await audit(s, "borrar_cuenta", p.data.userId, { email: u.email, request: pending?.id });
    const { error } = await createAdminClient().auth.admin.deleteUser(p.data.userId);
    if (error) return fail(t.errors.generic);
    return ok(undefined);
  });
}

// ───────── Preguntas frecuentes ─────────
const Faq = z.object({
  topic: z.string().trim().min(1).max(40), question: z.string().trim().min(3).max(300), answer: z.string().trim().min(3).max(4000), locale: z.enum(["es", "en"]),
});
const FAQ_PATHS = ["/admin/soporte", "/ayuda", "/admin/actividad"];

export async function saveFaq(input: unknown) {
  return adminAction(FAQ_PATHS, async (s) => {
    const m = M[s.locale];
    const p = Faq.extend({ id: Id.nullable().default(null) }).safeParse(input);
    if (!p.success) return fail(m.errFaq);
    const { id, ...row } = p.data;
    if (id) {
      must(await s.supabase.from("faqs").update(row).eq("id", id).select("id").single());
      await audit(s, "faq_editar", null, { faq: id });
      return ok(id);
    }
    const last = must(await s.supabase.from("faqs").select("sort").eq("locale", row.locale).order("sort", { ascending: false }).limit(1));
    const created = must(await s.supabase.from("faqs").insert({ ...row, sort: (last[0]?.sort ?? 0) + 1, published: false }).select("id").single());
    await audit(s, "faq_crear", null, { faq: created.id });
    return ok(created.id);
  });
}

export async function setFaqPublished(input: unknown) {
  return adminAction(FAQ_PATHS, async (s) => {
    const p = z.object({ id: Id, published: z.boolean() }).safeParse(input);
    if (!p.success) return fail(adminText(s).errors.generic);
    must(await s.supabase.from("faqs").update({ published: p.data.published }).eq("id", p.data.id).select("id").single());
    await audit(s, p.data.published ? "faq_publicar" : "faq_ocultar", null, { faq: p.data.id });
    return ok(undefined);
  });
}

/** Sube o baja una pregunta dentro de su idioma (intercambia el orden con la vecina). */
export async function moveFaq(input: unknown) {
  return adminAction(FAQ_PATHS, async (s) => {
    const p = z.object({ id: Id, dir: z.enum(["up", "down"]) }).safeParse(input);
    if (!p.success) return fail(adminText(s).errors.generic);
    const me = must(await s.supabase.from("faqs").select("id, locale").eq("id", p.data.id).single());
    const list = must(await s.supabase.from("faqs").select("id, sort").eq("locale", me.locale).order("sort").order("question"));
    const i = list.findIndex((f) => f.id === me.id), j = p.data.dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= list.length) return ok(undefined);
    const order = list.map((f) => f.id);
    [order[i], order[j]] = [order[j], order[i]];
    // Se renumera todo el idioma: así dos preguntas con el mismo orden nunca quedan trabadas.
    for (let k = 0; k < order.length; k++) {
      if (list.find((f) => f.id === order[k])?.sort !== k + 1) must(await s.supabase.from("faqs").update({ sort: k + 1 }).eq("id", order[k]).select("id"));
    }
    await audit(s, "faq_ordenar", null, { faq: me.id, dir: p.data.dir });
    return ok(undefined);
  });
}

export async function deleteFaq(input: unknown) {
  return adminAction(FAQ_PATHS, async (s) => {
    const p = z.object({ id: Id }).safeParse(input);
    if (!p.success) return fail(adminText(s).errors.generic);
    must(await s.supabase.from("faqs").delete().eq("id", p.data.id).select("id").single());
    await audit(s, "faq_borrar", null, { faq: p.data.id });
    return ok(undefined);
  });
}
