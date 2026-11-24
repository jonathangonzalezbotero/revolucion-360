"use server";
import { z } from "zod";
import { fail, ok, run } from "@/server/action";
import { appVersion, buildTech, subjectOf, TOPICS } from "./lib";
import { M } from "./messages";

// Soporte funciona también en solo lectura (su RLS no exige can_write): quien no paga igual puede pedir ayuda.
const PATHS = ["/ayuda"];

const NewTicket = z.object({
  topic: z.enum(TOPICS),
  message: z.string().trim().min(1).max(5000),
  withTech: z.boolean(),
  tech: z.record(z.string(), z.unknown()).default({}),
});

export async function createTicket(input: unknown) {
  return run({ write: false, revalidate: PATHS }, async (s) => {
    const m = M[s.locale];
    const p = NewTicket.safeParse(input);
    if (!p.success) return fail(m.missing);
    // Lo del navegador llega del cliente; plan, país, idioma y versión los pone el servidor. Todo pasa por la lista blanca.
    const tech = p.data.withTech
      ? buildTech({ ...p.data.tech, appLanguage: s.locale, plan: s.entitlement.state, country: s.profile.country, version: appVersion(process.env.VERCEL_GIT_COMMIT_SHA) })
      : {};
    const { data, error } = await s.supabase.from("support_tickets")
      .insert({ user_id: s.userId, topic: p.data.topic, subject: subjectOf(p.data.message), tech, status: "open" })
      .select("id").single();
    if (error || !data) return fail(s.t.errors.generic);
    const msg = await s.supabase.from("ticket_messages").insert({ ticket_id: data.id, author_id: s.userId, from_admin: false, body: p.data.message });
    if (msg.error) return fail(s.t.errors.generic);
    return ok(data.id);
  });
}

const Reply = z.object({ ticketId: z.string().uuid(), message: z.string().trim().min(1).max(5000) });

/** Responder un caso: vuelve a quedar "abierto" para que soporte lo vea. */
export async function replyTicket(input: unknown) {
  return run({ write: false, revalidate: PATHS }, async (s) => {
    const m = M[s.locale];
    const p = Reply.safeParse(input);
    if (!p.success) return fail(m.missing);
    const msg = await s.supabase.from("ticket_messages").insert({ ticket_id: p.data.ticketId, author_id: s.userId, from_admin: false, body: p.data.message });
    if (msg.error) return fail(s.t.errors.generic);
    const { error } = await s.supabase.from("support_tickets").update({ status: "open", updated_at: new Date().toISOString() }).eq("id", p.data.ticketId).eq("user_id", s.userId);
    if (error) return fail(s.t.errors.generic);
    return ok(undefined);
  });
}
