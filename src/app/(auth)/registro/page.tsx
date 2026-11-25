import type { Metadata } from "next";
import { cookies } from "next/headers";
import { asLocale, fill } from "@/i18n";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBilling } from "@/lib/stripe";
import { BILLING_DEFAULTS, usdShort } from "@/app/(app)/suscripcion/lib";
import { RegisterForm } from "../AuthForms";
import { M } from "../messages";

export const metadata: Metadata = { title: "Crea tu cuenta" };
type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Precio del primer mes para "Tu primer mes cuesta $1 USD". Página pública: la fila `billing` se lee con la clave de servicio (sin datos de usuarios). */
async function firstMonth(): Promise<string> {
  try { return usdShort((await loadBilling(createAdminClient())).firstMonthCents); } catch { return usdShort(BILLING_DEFAULTS.firstMonthCents); }
}

export default async function Page({ searchParams }: { searchParams: Search }) {
  const q = await searchParams;
  const base = M[asLocale((await cookies()).get("r360_locale")?.value)];
  const m = { ...base, reg: { ...base.reg, sub: fill(base.reg.sub, { first: await firstMonth() }) } };
  return <RegisterForm m={m} invite={one(q.codigo)} />;
}
