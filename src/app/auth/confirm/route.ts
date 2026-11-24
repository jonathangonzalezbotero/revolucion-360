import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Llega desde los correos de confirmar cuenta, recuperar acceso y cambiar correo.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const nextRaw = url.searchParams.get("next") ?? "/inicio";
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/inicio";
  const to = (path: string) => NextResponse.redirect(new URL(path, url.origin));
  if (!token_hash || !type) return to("/entrar?error=enlace");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash, type });
  if (error) return to("/entrar?error=enlace");
  // Código de invitación escrito al registrarse → acceso de alumno
  const invite = data.user?.user_metadata?.invite;
  if (type === "email" && typeof invite === "string" && invite) await supabase.rpc("redeem_invite", { p_code: invite });
  return to(next);
}
