import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendWelcomeNow } from "@/lib/email/events";

// Regreso de Google o Apple.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    // Con Google o Apple el correo ya viene confirmado: la bienvenida sale al primer ingreso (una sola vez).
    if (!error && data.user) await sendWelcomeNow(data.user.id);
    if (!error) return NextResponse.redirect(new URL("/inicio", url.origin));
  }
  return NextResponse.redirect(new URL("/entrar?error=enlace", url.origin));
}
