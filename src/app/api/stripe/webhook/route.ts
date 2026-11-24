import type Stripe from "stripe";
import { asLocale } from "@/i18n";
import type { PlanState } from "@/lib/engine";
import { createAdminClient } from "@/lib/supabase/admin";
import { customerId, getStripe, toSubLike } from "@/lib/stripe";
import { isStaleEvent, mapSubscription, type Grant } from "@/app/(app)/suscripcion/lib";
import { M } from "./messages";

export const dynamic = "force-dynamic";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * POST /api/stripe/webhook — avisos de Stripe. ÚNICA fuente del estado del plan (nunca lo que diga el navegador).
 * Verifica la firma con el cuerpo crudo. Idempotente: siempre vuelve a leer la suscripción en Stripe y escribe el estado completo;
 * las notificaciones llevan `dedupe` y el evento `upgraded` solo se anota al pasar de no-Pro a Pro.
 * Usa la clave de servicio (createAdminClient) porque el usuario no puede escribir entitlements.
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = (process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();
  if (!stripe || !secret) return new Response("Pagos no configurados", { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Falta la firma", { status: 400 });
  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch {
    return new Response("Firma inválida", { status: 400 });
  }
  try {
    await handle(stripe, createAdminClient(), event);
    return Response.json({ received: true });
  } catch (e) {
    console.error("[stripe-webhook]", event.type, e instanceof Error ? e.message : "error"); // sin montos ni datos personales
    return new Response("Error", { status: 500 }); // Stripe reintenta
  }
}

async function handle(stripe: Stripe, db: Admin, event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const cs = event.data.object as Stripe.Checkout.Session;
      if (cs.mode !== "subscription") return;
      const userId = cs.client_reference_id || cs.metadata?.user_id || null;
      const cust = customerId(cs.customer);
      if (userId && cust) await saveCustomer(db, userId, cust);
      const subId = typeof cs.subscription === "string" ? cs.subscription : cs.subscription?.id;
      if (subId) await syncSubscription(stripe, db, subId, userId, cust);
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await syncSubscription(stripe, db, sub.id, sub.metadata?.user_id || null, customerId(sub.customer));
      return;
    }
    case "invoice.paid": {
      const inv = event.data.object as Stripe.Invoice;
      const userId = await userFor(db, invoiceUserHint(inv), customerId(inv.customer));
      if (!userId) return;
      must(await db.from("entitlements").update({ payment_failed_at: null, updated_at: new Date().toISOString() }).eq("user_id", userId));
      const subId = invoiceSubId(inv) ?? invoiceSubId(await stripe.invoices.retrieve(inv.id!));
      if (subId) await syncSubscription(stripe, db, subId, userId, customerId(inv.customer));
      return;
    }
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      const userId = await userFor(db, invoiceUserHint(inv), customerId(inv.customer));
      if (!userId) return;
      // Si el aviso llega tarde y la factura ya se pagó, no se marca nada.
      const fresh = await stripe.invoices.retrieve(inv.id!);
      if (fresh.status === "paid") return;
      const subId = invoiceSubId(fresh);
      if (subId) await syncSubscription(stripe, db, subId, userId, customerId(inv.customer));
      // Solo se marca a quien tiene Pro (un primer pago que nunca se completó no es un "pago fallido" de Pro).
      const ent = must(await db.from("entitlements").select("state").eq("user_id", userId).maybeSingle());
      if (ent?.state !== "pro") return;
      must(await db.from("entitlements").update({ payment_failed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("user_id", userId).is("payment_failed_at", null));
      const t = M[await localeOf(db, userId)];
      await notify(db, userId, "pago", t.failedTitle, t.failedBody, `pago-fallido-${inv.id}`);
      return;
    }
    default:
      return;
  }
}

/** Lee la suscripción fresca en Stripe y escribe el estado completo (sirve aunque los avisos lleguen desordenados o repetidos). */
async function syncSubscription(stripe: Stripe, db: Admin, subId: string, userHint: string | null, cust: string | null) {
  const sub = await stripe.subscriptions.retrieve(subId);
  const userId = await userFor(db, sub.metadata?.user_id || userHint, cust ?? customerId(sub.customer));
  if (!userId) return; // no es de esta app
  const ent = must(await db.from("entitlements").select("state, stripe_subscription_id, stripe_status, stripe_customer_id").eq("user_id", userId).maybeSingle());
  if (!ent) return;
  const like = toSubLike(sub);
  if (isStaleEvent(ent.stripe_subscription_id, ent.stripe_status, like)) return;
  const grants = must(await db.from("access_grants").select("kind, expires_at, revoked_at").eq("user_id", userId)) as Grant[];
  const patch = mapSubscription(like, grants, ent.state as PlanState);
  const row = { ...patch, updated_at: new Date().toISOString(), ...(ent.stripe_customer_id ? {} : { stripe_customer_id: customerId(sub.customer) }) };
  const t = M[await localeOf(db, userId)];

  if (patch.state === "pro") {
    // Solo cuenta como "upgraded" el paso de no-Pro a Pro: repetir el aviso no duplica el evento.
    const changed = must(await db.from("entitlements").update(row).eq("user_id", userId).neq("state", "pro").select("user_id"));
    if (changed?.length) {
      must(await db.from("product_events").insert({ user_id: userId, name: "upgraded" }));
      await notify(db, userId, "pago", t.upgradedTitle, t.upgradedBody, `pro-${sub.id}`);
    } else {
      must(await db.from("entitlements").update(row).eq("user_id", userId));
    }
    return;
  }
  must(await db.from("entitlements").update(row).eq("user_id", userId));
  if (patch.state === "read_only" && ent.state !== "read_only") await notify(db, userId, "pago", t.endedTitle, t.endedBody, `fin-${sub.id}`);
  if ((patch.state === "alumno" || patch.state === "fundador") && ent.state === "pro") await notify(db, userId, "acceso", t.backTitle, t.backBody, `fin-${sub.id}`);
}

const invoiceSubId = (inv: Stripe.Invoice): string | null => {
  const s = inv.parent?.subscription_details?.subscription;
  return typeof s === "string" ? s : s?.id ?? null;
};
const invoiceUserHint = (inv: Stripe.Invoice): string | null => inv.parent?.subscription_details?.metadata?.user_id || null;

/** Usuario dueño del aviso: por metadata.user_id (comprobado en la base) o por el cliente de Stripe guardado. */
async function userFor(db: Admin, hint: string | null, cust: string | null): Promise<string | null> {
  if (hint) {
    const r = must(await db.from("entitlements").select("user_id").eq("user_id", hint).maybeSingle());
    if (r) return r.user_id;
  }
  if (cust) {
    const r = must(await db.from("entitlements").select("user_id").eq("stripe_customer_id", cust).maybeSingle());
    if (r) return r.user_id;
  }
  return null;
}

async function saveCustomer(db: Admin, userId: string, cust: string) {
  must(await db.from("entitlements").update({ stripe_customer_id: cust, updated_at: new Date().toISOString() }).eq("user_id", userId).is("stripe_customer_id", null));
}

async function localeOf(db: Admin, userId: string) {
  const r = must(await db.from("profiles").select("locale").eq("id", userId).maybeSingle());
  return asLocale(r?.locale);
}

async function notify(db: Admin, userId: string, kind: string, title: string, body: string, dedupe: string) {
  must(await db.from("notifications").upsert({ user_id: userId, kind, title, body, href: "/suscripcion", dedupe }, { onConflict: "user_id,dedupe", ignoreDuplicates: true }));
}

/** Como must() de data.ts, pero sin importar el módulo de sesión (aquí no hay usuario conectado). */
function must<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
