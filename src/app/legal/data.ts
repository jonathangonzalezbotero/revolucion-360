import "server-only";
import { cookies } from "next/headers";
import { asLocale, type Locale } from "@/i18n";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/server/session";
import { mergeLegal, PLACEHOLDERS, type LegalInfo } from "./lib";

/**
 * Páginas públicas: sin sesión, RLS no deja leer app_config (solo `authenticated`).
 * En ese caso se usa la clave de servicio SOLO para leer la fila `legal` (sin datos de usuarios).
 */
export async function loadLegal(): Promise<{ legal: LegalInfo; locale: Locale; signedIn: boolean }> {
  const s = await getSession();
  if (s) {
    const { data } = await s.supabase.from("app_config").select("value").eq("key", "legal").maybeSingle();
    return { legal: mergeLegal(data?.value), locale: s.locale, signedIn: true };
  }
  const locale = asLocale((await cookies()).get("r360_locale")?.value);
  try {
    const { data } = await createAdminClient().from("app_config").select("value").eq("key", "legal").maybeSingle();
    return { legal: mergeLegal(data?.value), locale, signedIn: false };
  } catch {
    return { legal: PLACEHOLDERS, locale, signedIn: false };
  }
}
