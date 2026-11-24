"use server";
import { z } from "zod";
import { fill } from "@/i18n";
import { formatDate, todayIn } from "@/lib/engine";
import { createAdminClient } from "@/lib/supabase/admin";
import { customerId, ensureCustomer, getStripe, toSubLike } from "@/lib/stripe";
import { fail, ok, run } from "@/server/action";
import { notify, track } from "@/server/rewards";
import type { Session } from "@/server/session";
import { CANCEL_REASONS, canStartTrial, isPaying, trialEnd } from "./lib";
import { M } from "./messages";

const PAGES = ["/suscripcion", "/inicio", "/mas", "/perfil"];

/**
 * Probar Pro gratis: sin tarjeta, una sola vez por usuario.
 * El usuario no puede escribir entitlements: esta única escritura usa la clave de servicio,
 * con condición (sigue en Gratis y nunca usó la prueba) para que dos clics no den dos pruebas.
 */
export async function startTrial() {
  return run({ revalidate: PAGES }, async (s) => {
    const m = M[s.locale];
    if (!canStartTrial(s.config.trial, s.entitlement)) return fail(m.errors.trial);
    const days = s.config.trial.days;
    const { data, error } = await createAdminClient().from("entitlements")
      .update({ state: "trial", trial_ends_at: trialEnd(days), trial_used: true, updated_at: new Date().toISOString() })
      .eq("user_id", s.userId).eq("state", "free").eq("trial_used", false).select("user_id");
    if (error) return fail(s.t.errors.generic);
    if (!data?.length) return fail(m.errors.trial);
    await notify(s, "acceso", fill(m.plans.trialDone, { days }), "", "/suscripcion", "trial-start");
    await track(s, "trial_started");
    return ok(days);
  });
}

/** Lee la suscripción guardada y comprueba en Stripe que sea de este usuario. */
async function mySubscription(s: Session) {
  const stripe = getStripe();
  if (!stripe) return { error: M[s.locale].errors.notActive } as const;
  const { data: ent, error } = await s.supabase.from("entitlements").select("stripe_customer_id, stripe_subscription_id, stripe_status").eq("user_id", s.userId).maybeSingle();
  if (error) throw new Error("lectura");
  if (!ent?.stripe_subscription_id || !ent.stripe_customer_id || !isPaying(ent.stripe_status)) return { error: M[s.locale].errors.noSub } as const;
  const sub = await stripe.subscriptions.retrieve(ent.stripe_subscription_id);
  if (customerId(sub.customer) !== ent.stripe_customer_id) return { error: M[s.locale].errors.noSub } as const;
  return { stripe, sub } as const;
}

const endDate = (s: Session, sec: number | null) => (sec ? formatDate(todayIn(s.profile.timezone || "Australia/Sydney", new Date(sec * 1000)), s.locale) : null);

const CancelSchema = z.object({ reason: z.enum(["caro", "no_uso", "falta"]).nullable().optional() });

/**
 * Cancelar al final del periodo pagado (nunca se borra nada). Solo le pide el cambio a Stripe:
 * el estado de la app lo actualiza el aviso firmado (customer.subscription.updated).
 * write:false → también se puede gestionar desde solo lectura.
 */
export async function cancelSubscription(input: unknown) {
  return run({ write: false, revalidate: ["/suscripcion"] }, async (s) => {
    const m = M[s.locale];
    const p = CancelSchema.safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const r = await mySubscription(s);
    if ("error" in r) return fail(r.error!);
    const reason = p.data.reason ?? null;
    const updated = await r.stripe.subscriptions.update(r.sub.id, {
      cancel_at_period_end: true,
      ...(reason ? { cancellation_details: { feedback: CANCEL_REASONS[reason] } } : {}),
    });
    await track(s, "cancel_requested");
    const date = endDate(s, toSubLike(updated).current_period_end);
    return ok(date ? fill(m.cancel.done, { date }) : m.cancel.doneNoDate);
  });
}

/** Deshacer la cancelación antes de que termine el periodo. */
export async function resumeSubscription() {
  return run({ write: false, revalidate: ["/suscripcion"] }, async (s) => {
    const r = await mySubscription(s);
    if ("error" in r) return fail(r.error!);
    await r.stripe.subscriptions.update(r.sub.id, { cancel_at_period_end: false });
    return ok(M[s.locale].cancel.resumed);
  });
}

const BillingSchema = z.object({ name: z.string().trim().min(1).max(120), taxId: z.string().trim().max(60), taxLabel: z.string().trim().max(40) });

/** Datos de facturación: viven en el cliente de Stripe (nombre y un campo de factura con la identificación fiscal). */
export async function saveBilling(input: unknown) {
  return run({ write: false, revalidate: ["/suscripcion"] }, async (s) => {
    const m = M[s.locale];
    const p = BillingSchema.safeParse(input);
    if (!p.success) return fail(m.errors.name);
    const stripe = getStripe();
    if (!stripe) return fail(m.errors.notActive);
    const { data: ent, error } = await s.supabase.from("entitlements").select("stripe_customer_id").eq("user_id", s.userId).maybeSingle();
    if (error) return fail(s.t.errors.generic);
    const id = await ensureCustomer(stripe, { id: s.userId, email: s.profile.email, name: p.data.name }, ent?.stripe_customer_id ?? null);
    const label = p.data.taxLabel || m.billing.taxField;
    await stripe.customers.update(id, {
      name: p.data.name,
      invoice_settings: { custom_fields: p.data.taxId ? [{ name: label, value: p.data.taxId }] : "" },
      metadata: { tax_id: p.data.taxId },
    });
    return ok(m.billing.saved);
  });
}
