"use server";
import type Stripe from "stripe";
import { z } from "zod";
import { fill } from "@/i18n";
import { getStripe } from "@/lib/stripe";
import type { Json } from "@/lib/supabase/database.types";
import { fail, ok } from "@/server/action";
import { must } from "@/server/data";
import type { Session } from "@/server/session";
import { studentCouponId } from "@/app/(app)/suscripcion/lib";
import { adminAction, adminText, audit } from "../_shared/server";
import { PLAN_FEATURES, changedFeatures, checkCoupon, checkTrial, regionPatch, tierOf, type CouponData } from "./lib";
import { M } from "./messages";

const PATHS = ["/admin/planes", "/admin/actividad", "/admin", "/suscripcion"];
// Igual que scripts/stripe-setup.ts: así el script reconoce lo que crea esta pantalla.
const PRODUCT_TAG = "revolucion360_pro";

const SaveBody = z.object({
  regions: z.array(z.object({ region: z.string().min(1).max(20), monthly: z.string().max(30), yearly: z.string().max(30), student: z.string().max(5) })).max(50),
  trial: z.object({ enabled: z.boolean(), days: z.string().max(4) }),
  features: z.partialRecord(z.enum(PLAN_FEATURES), z.enum(["free", "pro"])),
});

type StripeStatus = "ok" | "pending" | "off";
const regionName = (s: Session, code: string) => M[s.locale].prices.names[code.toUpperCase()] ?? code;

/** Cupón de alumno `alumno-<pct>` en Stripe (el checkout lo usa por id). Mismos datos que el script. */
async function ensureStudentCoupon(stripe: Stripe, pct: number) {
  const id = studentCouponId(pct);
  try {
    await stripe.coupons.retrieve(id);
  } catch {
    await stripe.coupons.create({ id, percent_off: pct, duration: "forever", name: `Alumno ${pct}%`, metadata: { app: PRODUCT_TAG } });
  }
}

/**
 * Guarda precios por región, prueba gratis y qué es Gratis o Pro. Escribe solo lo que cambió.
 * Los precios de Stripe NO se tocan aquí: los sincroniza scripts/stripe-setup.ts (docs/STRIPE.md).
 */
export async function savePlans(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const m = M[s.locale], t = adminText(s);
    const p = SaveBody.safeParse(input);
    if (!p.success) return fail(t.errors.generic);

    // 1. Validar todo antes de escribir nada.
    const rows = must(await s.supabase.from("price_regions").select("region, monthly_cents, yearly_cents, student_discount_pct"));
    const byRegion = new Map(rows.map((r) => [r.region, r]));
    const patches: { region: string; patch: ReturnType<typeof regionPatch> & { ok: true } }[] = [];
    for (const r of p.data.regions) {
      const row = byRegion.get(r.region);
      if (!row) return fail(m.errors.region);
      const c = regionPatch(row, r);
      if (!c.ok) return fail(fill(m.errors[c.error], { region: regionName(s, r.region) }));
      if (Object.keys(c.patch).length) patches.push({ region: r.region, patch: c });
    }
    const trial = checkTrial(p.data.trial.enabled, p.data.trial.days);
    if (!trial.ok) return fail(m.errors.trial);

    const cfg = must(await s.supabase.from("app_config").select("key, value").in("key", ["trial", "features"]));
    const cfgOf = (k: string) => cfg.find((x) => x.key === k)?.value;
    const curTrial = (cfgOf("trial") ?? {}) as { enabled?: boolean; days?: number };
    const curFeatures = (cfgOf("features") ?? {}) as Record<string, "free" | "pro">;
    const featDiff = changedFeatures(curFeatures, { ...curFeatures, ...p.data.features });
    const trialChanged = curTrial.enabled !== trial.trial.enabled || curTrial.days !== trial.trial.days;
    if (!patches.length && !trialChanged && !Object.keys(featDiff).length) return ok({ changed: 0, warning: null as string | null });

    // 2. Escribir.
    let warning: string | null = null;
    const newStudentPcts = new Set<number>();
    for (const { region, patch } of patches) {
      // Sin monto, sin precio de Stripe: el checkout vende por ese id y el script no toca regiones sin monto.
      const upd = {
        ...patch.patch,
        ...(patch.patch.monthly_cents === null ? { stripe_price_monthly: null } : {}),
        ...(patch.patch.yearly_cents === null ? { stripe_price_yearly: null } : {}),
      };
      must(await s.supabase.from("price_regions").update(upd).eq("region", region).select("region").single());
      await audit(s, "precio_region", null, { name: regionName(s, region), fields: Object.keys(patch.patch).join(",") });
      if (patch.patch.student_discount_pct) newStudentPcts.add(patch.patch.student_discount_pct);
    }
    if (newStudentPcts.size) {
      const stripe = getStripe();
      if (stripe) {
        try { for (const pct of newStudentPcts) await ensureStudentCoupon(stripe, pct); } catch { warning = m.errors.studentStripe; }
      }
    }
    if (trialChanged) {
      must(await s.supabase.from("app_config").upsert({ key: "trial", value: trial.trial, updated_at: new Date().toISOString() }).select("key").single());
      await audit(s, "plan_prueba", null, { enabled: trial.trial.enabled, days: trial.trial.days });
    }
    if (Object.keys(featDiff).length) {
      // Se vuelve a partir de lo guardado: Menú y funciones edita las mismas claves y otras que aquí no se ven.
      const merged: Record<string, Json> = { ...curFeatures, ...featDiff };
      must(await s.supabase.from("app_config").upsert({ key: "features", value: merged, updated_at: new Date().toISOString() }).select("key").single());
      await audit(s, "plan_funciones", null, { fields: Object.entries(featDiff).map(([k, v]) => `${k}:${tierOf({ [k]: v }, k)}`).join(",") });
    }
    return ok({ changed: patches.length + (trialChanged ? 1 : 0) + Object.keys(featDiff).length, warning });
  });
}

type CouponRow = CouponData & { id: string; active: boolean; stripe_coupon_id: string | null; stripe_promo_id: string | null };

/** Crea el cupón y su código de promoción en Stripe, guardando cada id apenas existe (igual que el script). */
async function pushToStripe(s: Session, stripe: Stripe, c: CouponRow): Promise<void> {
  const couponId = c.stripe_coupon_id ?? (await stripe.coupons.create({
    percent_off: c.percent_off, name: c.code,
    ...(c.duration_months ? { duration: "repeating" as const, duration_in_months: c.duration_months } : { duration: "forever" as const }),
    ...(c.max_redemptions ? { max_redemptions: c.max_redemptions } : {}),
    metadata: { app: PRODUCT_TAG, coupon_row: c.id },
  })).id;
  if (!c.stripe_coupon_id) must(await s.supabase.from("coupons").update({ stripe_coupon_id: couponId }).eq("id", c.id).select("id").single());
  const promo = await stripe.promotionCodes.create({ promotion: { type: "coupon", coupon: couponId }, code: c.code, active: c.active, metadata: { app: PRODUCT_TAG } });
  must(await s.supabase.from("coupons").update({ stripe_promo_id: promo.id }).eq("id", c.id).select("id").single());
}

/** Crea un cupón. Primero en la base; luego en Stripe si está conectado (si falla, queda para el script). */
export async function createCoupon(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const m = M[s.locale], t = adminText(s);
    const p = z.object({ code: z.string().max(60), pct: z.string().max(5), months: z.string().max(5), max: z.string().max(8) }).safeParse(input);
    if (!p.success) return fail(t.errors.generic);
    const c = checkCoupon(p.data);
    if (!c.ok) return fail(m.errors[c.error]);
    const { data: row, error } = await s.supabase.from("coupons").insert(c.coupon).select("id, code, percent_off, duration_months, max_redemptions, active, stripe_coupon_id, stripe_promo_id").single();
    if (error?.code === "23505") return fail(m.errors.taken);
    if (error || !row) throw new Error(error?.message ?? "cupón");
    await audit(s, "cupon_crear", null, { code: row.code, pct: row.percent_off, months: row.duration_months ?? undefined });
    const stripe = getStripe();
    if (!stripe) return ok<{ stripe: StripeStatus }>({ stripe: "off" });
    try {
      await pushToStripe(s, stripe, row);
      return ok<{ stripe: StripeStatus }>({ stripe: "ok" });
    } catch (e) {
      console.error("[admin-cupon]", e instanceof Error ? e.message : "error"); // sin montos ni datos personales
      return ok<{ stripe: StripeStatus }>({ stripe: "pending" });
    }
  });
}

/** Crea en Stripe un cupón que quedó pendiente (sin código de promoción). */
export async function pushCoupon(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const m = M[s.locale], t = adminText(s);
    const p = z.object({ id: z.string().uuid() }).safeParse(input);
    if (!p.success) return fail(t.errors.generic);
    const row = must(await s.supabase.from("coupons").select("id, code, percent_off, duration_months, max_redemptions, stripe_coupon_id, stripe_promo_id, active").eq("id", p.data.id).single());
    if (row.stripe_promo_id) return ok(undefined);
    const stripe = getStripe();
    if (!stripe) return fail(m.errors.stripeOff);
    try {
      await pushToStripe(s, stripe, row); // un cupón pausado nace pausado en Stripe
    } catch (e) {
      console.error("[admin-cupon]", e instanceof Error ? e.message : "error");
      return fail(m.errors.stripe);
    }
    await audit(s, "cupon_stripe", null, { code: row.code });
    return ok(undefined);
  });
}

/** Pausa o activa un cupón. Nunca se borra. El checkout valida el código en Stripe, así que se cambia allá primero. */
export async function setCouponActive(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const m = M[s.locale], t = adminText(s);
    const p = z.object({ id: z.string().uuid(), active: z.boolean() }).safeParse(input);
    if (!p.success) return fail(t.errors.generic);
    const row = must(await s.supabase.from("coupons").select("id, code, stripe_promo_id").eq("id", p.data.id).single());
    if (row.stripe_promo_id) {
      const stripe = getStripe();
      if (!stripe) return fail(m.errors.stripeOff);
      try {
        await stripe.promotionCodes.update(row.stripe_promo_id, { active: p.data.active });
      } catch (e) {
        console.error("[admin-cupon]", e instanceof Error ? e.message : "error");
        return fail(m.errors.stripe);
      }
    }
    must(await s.supabase.from("coupons").update({ active: p.data.active }).eq("id", row.id).select("id").single());
    await audit(s, p.data.active ? "cupon_activar" : "cupon_pausar", null, { code: row.code });
    return ok(undefined);
  });
}
