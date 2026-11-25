"use server";
import { z } from "zod";
import { fail, ok, run } from "@/server/action";
import { track } from "@/server/rewards";
import { M } from "./messages";

const Code = z.object({ code: z.string().trim().min(1).max(40) });
const REASONS = ["invalid", "used_up", "expired", "already"] as const;

/**
 * "¿Eres alumno? Tengo un código": canjea un código de `invite_codes` con la función existente `redeem_invite`
 * (crea el acceso gratis y pasa la cuenta a alumno o fundador, sin tarjeta). write:false → también desde solo lectura.
 */
export async function redeemCode(input: unknown) {
  return run({ write: false, revalidate: ["/inicio", "/suscripcion", "/activar"] }, async (s) => {
    const m = M[s.locale];
    const p = Code.safeParse(input);
    if (!p.success) return fail(m.redeem.empty);
    if (s.plan === "fundador") return fail(m.redeem.fundador);
    const { data, error } = await s.supabase.rpc("redeem_invite", { p_code: p.data.code });
    if (error) return fail(s.t.errors.generic);
    if (data !== "ok") return fail(REASONS.includes(data as (typeof REASONS)[number]) ? m.redeem[data as (typeof REASONS)[number]] : s.t.errors.generic);
    await track(s, "invite_redeemed");
    return ok(m.studentOk);
  });
}
