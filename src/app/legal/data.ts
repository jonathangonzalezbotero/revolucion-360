import "server-only";
import { cookies } from "next/headers";
import { asLocale, type Locale } from "@/i18n";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/server/session";
import { BILLING_DEFAULTS, readBilling, usdShort, type BillingConfig } from "@/app/(app)/suscripcion/lib";
import { mergeLegal, PLACEHOLDERS, type LegalInfo } from "./lib";

/** Precios del plan para "3. Planes y pagos" ("$1", "$8", "$80"), de app_config.billing. */
export type LegalPrices = { first: string; monthly: string; yearly: string };
const pricesOf = (b: BillingConfig): LegalPrices => ({ first: usdShort(b.firstMonthCents), monthly: usdShort(b.monthlyCents), yearly: usdShort(b.yearlyCents) });

/**
 * Páginas públicas: sin sesión, RLS no deja leer app_config (solo `authenticated`).
 * En ese caso se usa la clave de servicio SOLO para leer las filas `legal` y `billing` (sin datos de usuarios).
 */
export async function loadLegal(): Promise<{ legal: LegalInfo; prices: LegalPrices; locale: Locale; signedIn: boolean }> {
  const s = await getSession();
  const pick = (rows: { key: string; value: unknown }[] | null) => {
    const by = new Map((rows ?? []).map((r) => [r.key, r.value]));
    return { legal: mergeLegal(by.get("legal")), prices: pricesOf(readBilling(by.get("billing"))) };
  };
  if (s) {
    const { data } = await s.supabase.from("app_config").select("key, value").in("key", ["legal", "billing"]);
    return { ...pick(data), locale: s.locale, signedIn: true };
  }
  const locale = asLocale((await cookies()).get("r360_locale")?.value);
  try {
    const { data } = await createAdminClient().from("app_config").select("key, value").in("key", ["legal", "billing"]);
    return { ...pick(data), locale, signedIn: false };
  } catch {
    return { legal: PLACEHOLDERS, prices: pricesOf(BILLING_DEFAULTS), locale, signedIn: false };
  }
}
