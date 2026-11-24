"use server";
import { z } from "zod";
import { fail, ok, run } from "@/server/action";

// Las notificaciones se leen y se quitan también en solo lectura (su RLS no exige can_write).
const PATHS = ["/notificaciones", "/mas", "/inicio"];
const Id = z.string().uuid();

export async function markRead(input: unknown) {
  return run({ write: false, revalidate: PATHS }, async (s) => {
    const p = Id.safeParse(input);
    if (!p.success) return fail(s.t.errors.notFound);
    const { error } = await s.supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", p.data).is("read_at", null);
    if (error) return fail(s.t.errors.generic);
    return ok(undefined);
  });
}

export async function markAllRead() {
  return run({ write: false, revalidate: PATHS }, async (s) => {
    const { error } = await s.supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", s.userId).is("read_at", null);
    if (error) return fail(s.t.errors.generic);
    return ok(undefined);
  });
}

export async function removeNotif(input: unknown) {
  return run({ write: false, revalidate: PATHS }, async (s) => {
    const p = Id.safeParse(input);
    if (!p.success) return fail(s.t.errors.notFound);
    const { error } = await s.supabase.from("notifications").delete().eq("id", p.data);
    if (error) return fail(s.t.errors.generic);
    return ok(undefined);
  });
}
