import { asLocale, fill } from "@/i18n";
import { daysLeft, formatDate, type PlanState } from "@/lib/engine";
import { appUrl, BATCH, byIds, FIRST_UUID, PROFILE_COLS, runCron, type Admin, type ProfileLite } from "@/lib/email/cron";
import { allowsApp, allowsEmail, expiryBucket, expiryRef, expiryTransition, readPrefs, safeToday } from "@/lib/email/lib";
import { M } from "@/lib/email/messages";
import { deliverOnce, notifyOnce } from "@/lib/email/send";
import { accessEmail } from "@/lib/email/templates";
import { loadBilling } from "@/lib/stripe";
import { usdShort, type Grant } from "@/app/(app)/suscripcion/lib";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ent = { user_id: string; state: string; trial_ends_at: string | null; pro_until: string | null; access_until: string | null; stripe_status: string | null };
const ENT_COLS = "user_id, state, trial_ends_at, pro_until, access_until, stripe_status";

/**
 * GET /api/cron/vencimientos (diario).
 * (a) Accesos de alumno que vencen en 30 y 7 días → correo y notificación (según el canal elegido), con el precio del plan
 *     de app_config.billing ("son $8 USD al mes o $80 USD al año").
 * (b) Estados vencidos → solo lectura (desde el 25 nov 2026; antes pasaban a Gratis, que ahora significa "sin activar"):
 *     prueba vieja, alumno o fundador con fecha (o al otro acceso gratis vigente), y Pro con pro_until vencido y sin
 *     suscripción activa en Stripe. Nunca se borra ni se toca ningún dato del usuario.
 * Cada cambio es condicional al estado anterior: dos corridas a la vez no pisan nada.
 */
export async function GET(request: Request) {
  return runCron("vencimientos", request, async (db) => {
    const now = new Date();
    const notices = await expiringNotices(db, now);
    const changes = await expireStates(db, now);
    return { ...notices, ...changes };
  });
}

async function expiringNotices(db: Admin, now: Date) {
  let expiring = 0, emailed = 0, notified = 0, failed = 0;
  const horizon = new Date(now.getTime() + 31 * 86_400_000).toISOString();
  const billing = await loadBilling(db);
  const monthly = usdShort(billing.monthlyCents), yearly = usdShort(billing.yearlyCents);
  let after = FIRST_UUID;
  for (;;) {
    const { data, error } = await db.from("entitlements").select(ENT_COLS).eq("state", "alumno")
      .gt("access_until", now.toISOString()).lte("access_until", horizon).gt("user_id", after).order("user_id").limit(BATCH);
    if (error) throw new Error(`db: ${error.message}`);
    const ents = data as Ent[];
    const due = ents.filter((e) => expiryBucket(e.access_until, now) !== null);
    const profiles = await byIds<ProfileLite>(due.map((e) => e.user_id), (ids) => db.from("profiles").select(PROFILE_COLS).in("id", ids).is("suspended_at", null).order("id")) as ProfileLite[];
    const pBy = new Map(profiles.map((p) => [p.id, p]));
    for (const e of due) {
      const p = pBy.get(e.user_id);
      if (!p || !e.access_until) continue;
      expiring++;
      const bucket = expiryBucket(e.access_until, now)!;
      const ref = expiryRef(e.access_until, bucket);
      const prefs = readPrefs(p.prefs);
      const locale = asLocale(p.locale);
      const until = safeToday(p.timezone, new Date(e.access_until));
      const left = Math.max(1, daysLeft(e.access_until, now) ?? 1);
      if (allowsEmail(prefs)) {
        const res = await deliverOnce(db, {
          userId: p.id, kind: "access_expiring", ref, to: p.email,
          render: () => accessEmail({ locale, appUrl: appUrl(), until, daysLeft: left, monthly, yearly }),
        });
        if (res === "sent") emailed++; else if (res === "failed") failed++;
      }
      if (allowsApp(prefs)) {
        const t = M[locale].notif;
        const date = formatDate(until, locale, "day");
        if (await notifyOnce(db, { userId: p.id, kind: "acceso", title: fill(t.accessTitle, { date }), body: t.accessBody, href: "/suscripcion", dedupe: `acceso-${ref}` })) notified++;
      }
    }
    if (ents.length < BATCH) break;
    after = ents[ents.length - 1].user_id;
  }
  return { expiring, emailed, notified, failed };
}

async function expireStates(db: Admin, now: Date) {
  const counts = { toReadOnly: 0, toGrant: 0, toPro: 0, stillPaying: 0 };
  const nowIso = now.toISOString();
  // Solo filas que ya vencieron: prueba vieja, alumno, fundador con fecha o Pro con su fecha pasada (una pasada por estado).
  const passes = [["trial", "trial_ends_at"], ["alumno", "access_until"], ["fundador", "access_until"], ["pro", "pro_until"]] as const;
  for (const [fromState, column] of passes) {
    let after = FIRST_UUID;
    for (;;) {
      const { data, error } = await db.from("entitlements").select(ENT_COLS).eq("state", fromState).lte(column, nowIso).gt("user_id", after)
        .order("user_id").limit(BATCH);
      if (error) throw new Error(`db: ${error.message}`);
      const ents = data as Ent[];
      const grants = (await byIds<{ user_id: string; kind: string; expires_at: string | null; revoked_at: string | null }>(ents.map((e) => e.user_id), (ids) =>
        db.from("access_grants").select("user_id, kind, expires_at, revoked_at").in("user_id", ids).order("id")))
        .map((g) => ({ ...g, kind: (g.kind === "fundador" ? "fundador" : "alumno") as Grant["kind"] }));
      for (const e of ents) {
        const state = e.state as PlanState;
        const next = expiryTransition({ state, trialEndsAt: e.trial_ends_at, proUntil: e.pro_until, accessUntil: e.access_until, stripeStatus: e.stripe_status },
          grants.filter((g) => g.user_id === e.user_id), now);
        if (!next) { if (state === "pro") counts.stillPaying++; continue; }
        const patch: { state: PlanState; updated_at: string; access_until?: string | null } = { state: next.state, updated_at: nowIso };
        if (next.accessUntil !== undefined) patch.access_until = next.accessUntil;
        const { data: upd, error: uerr } = await db.from("entitlements").update(patch).eq("user_id", e.user_id).eq("state", state).select("user_id");
        if (uerr) throw new Error(`db: ${uerr.message}`);
        if (!upd.length) continue;
        if (next.state === "read_only") counts.toReadOnly++;
        else if (next.state === "pro") counts.toPro++;
        else counts.toGrant++;
      }
      if (ents.length < BATCH) break;
      after = ents[ents.length - 1].user_id;
    }
  }
  return counts;
}
