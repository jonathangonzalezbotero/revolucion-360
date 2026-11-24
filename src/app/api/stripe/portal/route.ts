import { z } from "zod";
import { appUrl, getStripe } from "@/lib/stripe";
import { getSession } from "@/server/session";
import { M } from "@/app/(app)/suscripcion/messages";

export const dynamic = "force-dynamic";

const Body = z.object({ flow: z.enum(["home", "payment_method_update"]).optional().default("home") });
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

/**
 * POST /api/stripe/portal { flow? } → { url } del Customer Portal de Stripe (cambiar tarjeta, cancelar, facturas, datos de facturación).
 * Exige sesión y que ya exista el cliente de Stripe. Funciona en solo lectura.
 */
export async function POST(request: Request) {
  const s = await getSession();
  if (!s) return json({ error: "Tu sesión terminó. Vuelve a entrar." }, 401);
  const m = M[s.locale].errors;
  const stripe = getStripe();
  if (!stripe) return json({ error: m.notActive }, 503);
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return json({ error: s.t.errors.generic }, 400);
  try {
    const { data: ent, error } = await s.supabase.from("entitlements").select("stripe_customer_id").eq("user_id", s.userId).maybeSingle();
    if (error) throw new Error("lectura");
    if (!ent?.stripe_customer_id) return json({ error: m.noCustomer }, 409);
    const session = await stripe.billingPortal.sessions.create({
      customer: ent.stripe_customer_id,
      return_url: `${appUrl()}/suscripcion`,
      locale: s.locale === "en" ? "en" : "es",
      ...(parsed.data.flow === "payment_method_update" ? { flow_data: { type: "payment_method_update" as const } } : {}),
    });
    return json({ url: session.url });
  } catch (e) {
    console.error("[stripe-portal]", e instanceof Error ? e.message : "error");
    return json({ error: s.t.errors.generic }, 500);
  }
}
