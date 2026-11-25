"use server";
import { cookies } from "next/headers";
import { z } from "zod";
import { fill } from "@/i18n";
import { addDays, weekStart } from "@/lib/engine";
import { fail, ok, run } from "@/server/action";
import type { Json } from "@/lib/supabase/database.types";
import { must } from "@/server/data";
import { HABIT_PREF_KEYS, mergeHabitPrefs, type HabitPrefKey } from "@/lib/engine/habito";
import { movLevelFor } from "@/lib/engine/registro";
import { toE164 } from "@/lib/crm/phone";
import { isPhone, CHANNELS, CLOSE_DAYS, confirmsWord, CURRENCIES, isValidTimezone, mergeNotifyPrefs, mergeTerms, NOTIFY_KEYS, PAY_FREQUENCIES, TERM_KEYS } from "./lib";
import { M } from "./messages";

const APP = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
// El perfil y las preferencias se editan también en solo lectura (RLS de profiles no exige can_write).
const PATHS = ["/perfil", "/inicio", "/mas"];

/** Mismo medidor que el registro: 8+ caracteres y al menos 3 de 4 señales. */
function strength(pw: string): number {
  let sc = 0;
  if (pw.length >= 8) sc++;
  if (pw.length >= 12) sc++;
  if (/[0-9]/.test(pw) && /[A-Za-z]/.test(pw)) sc++;
  if (/[^A-Za-z0-9]/.test(pw)) sc++;
  return sc;
}

// ───────── Datos personales ─────────
const Personal = z.object({ name: z.string().trim().max(80), lastName: z.string().trim().max(80).default(""), phone: z.string().trim().max(30).default(""), email: z.string().trim().toLowerCase().max(200) });

/** Nombre en profiles; el correo se cambia en Auth (manda confirmación). profiles.email lo protege la base. */
export async function savePersonal(input: unknown) {
  return run<{ emailSent: string | null }>({ write: false, revalidate: PATHS }, async (s) => {
    const m = M[s.locale];
    const p = Personal.safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    if (!p.data.name) return fail(m.nameMissing);
    if (p.data.phone && !isPhone(p.data.phone)) return fail(m.phoneBad);
    must(await s.supabase.from("profiles").update({ name: p.data.name, last_name: p.data.lastName, phone: p.data.phone }).eq("id", s.userId).select("id"));
    let emailSent: string | null = null;
    const { data: auth } = await s.supabase.auth.getUser();
    const currentEmail = s.profile.email.toLowerCase(); // profiles.email se sincroniza al confirmar el correo nuevo
    if (p.data.email && p.data.email !== currentEmail && p.data.email !== auth.user?.new_email?.toLowerCase()) {
      if (!z.string().email().safeParse(p.data.email).success) return fail(m.emailBad);
      const { error } = await s.supabase.auth.updateUser({ email: p.data.email }, { emailRedirectTo: `${APP()}/auth/confirm?next=/perfil` });
      if (error) return fail(error.status === 429 ? s.t.errors.generic : /registered|exists|already/i.test(error.message) ? m.emailTaken : m.emailBad);
      emailSent = p.data.email;
    }
    return ok({ emailSent });
  });
}

// ───────── Región, moneda, idioma y frecuencia de pago ─────────
const Region = z.object({
  country: z.string().trim().min(2).max(8), currency: z.enum(CURRENCIES), timezone: z.string().max(64),
  locale: z.enum(["es", "en"]), payFrequency: z.enum(PAY_FREQUENCIES),
});

export async function saveRegion(input: unknown) {
  return run({ write: false, allowInactive: true, revalidate: PATHS }, async (s) => {
    const m = M[s.locale];
    const p = Region.safeParse(input);
    if (!p.success || !isValidTimezone(p.data.timezone)) return fail(m.regionBad);
    const { data: country } = await s.supabase.from("countries").select("code").eq("code", p.data.country).eq("enabled", true).maybeSingle();
    if (!country) return fail(m.regionBad);
    must(await s.supabase.from("profiles").update({
      country: p.data.country, currency: p.data.currency, timezone: p.data.timezone, locale: p.data.locale, pay_frequency: p.data.payFrequency,
    }).eq("id", s.userId).select("id"));
    // Las pantallas de acceso (sin sesión) leen el idioma de esta cookie.
    (await cookies()).set("r360_locale", p.data.locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    return ok(undefined);
  });
}

// ───────── Nombres: términos del país y categorías ─────────
const Terms = z.object(Object.fromEntries(TERM_KEYS.map((k) => [k, z.string().max(80).optional()])) as Record<(typeof TERM_KEYS)[number], z.ZodOptional<z.ZodString>>);

export async function saveTerms(input: unknown) {
  return run({ allowInactive: true, write: false, revalidate: [...PATHS, "/plan", "/deudas", "/proyeccion"] }, async (s) => {
    const p = Terms.safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    must(await s.supabase.from("profiles").update({ terms: mergeTerms(s.profile.terms, p.data) }).eq("id", s.userId).select("id"));
    return ok(undefined);
  });
}

const Cats = z.array(z.object({ id: z.string().uuid(), name: z.string().trim().max(60), isBasic: z.boolean() })).max(200);
// "Restaurar" en el cliente pone el nombre original (categories.original_name); aquí se guarda como cualquier nombre.

/** Renombrar categorías y marcar las básicas: son datos financieros, así que exige poder editar. */
export async function saveCategories(input: unknown) {
  return run({ revalidate: [...PATHS, "/plan", "/diagnostico", "/movimientos", "/analisis", "/cierre"] }, async (s) => {
    const m = M[s.locale];
    const p = Cats.safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    if (p.data.some((c) => !c.name)) return fail(m.categoryMissing);
    const current = must(await s.supabase.from("categories").select("id, name, is_basic"));
    const byId = new Map(current.map((c) => [c.id, c]));
    for (const c of p.data) {
      const old = byId.get(c.id);
      if (!old || (old.name === c.name && old.is_basic === c.isBasic)) continue;
      must(await s.supabase.from("categories").update({ name: c.name, is_basic: c.isBasic }).eq("id", c.id).select("id"));
    }
    return ok(undefined);
  });
}

// ───────── Preferencias de notificaciones ─────────
const Prefs = z.object({
  notify: z.object(Object.fromEntries(NOTIFY_KEYS.map((k) => [k, z.boolean().optional()])) as Record<(typeof NOTIFY_KEYS)[number], z.ZodOptional<z.ZodBoolean>>).optional(),
  closeDay: z.enum(CLOSE_DAYS).optional(), channel: z.enum(CHANNELS).optional(),
});

export async function savePrefs(input: unknown) {
  return run({ allowInactive: true, write: false, revalidate: ["/perfil"] }, async (s) => {
    const p = Prefs.safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const notify = p.data.notify ? Object.fromEntries(Object.entries(p.data.notify).filter(([, v]) => typeof v === "boolean")) as Record<(typeof NOTIFY_KEYS)[number], boolean> : undefined;
    const prefs = mergeNotifyPrefs(s.profile.prefs, { notify, closeDay: p.data.closeDay, channel: p.data.channel });
    must(await s.supabase.from("profiles").update({ prefs: prefs as NonNullable<Json> }).eq("id", s.userId).select("id"));
    return ok(undefined);
  });
}

// ───────── Avisos del hábito (profiles.prefs.habit) ─────────
const HabitPrefsInput = z.object(Object.fromEntries(HABIT_PREF_KEYS.map((k) => [k, z.boolean().optional()])) as Record<HabitPrefKey, z.ZodOptional<z.ZodBoolean>>);

export async function saveHabitPrefs(input: unknown) {
  return run({ allowInactive: true, write: false, revalidate: ["/perfil", "/repaso"] }, async (s) => {
    const p = HabitPrefsInput.safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const prefs = mergeHabitPrefs(s.profile.prefs, p.data);
    must(await s.supabase.from("profiles").update({ prefs: prefs as NonNullable<Json> }).eq("id", s.userId).select("id"));
    return ok(undefined);
  });
}

// ───────── Novedades por correo y avisos por SMS (consentimiento de marketing, CRM) ─────────
const Marketing = z.object({ email: z.boolean().optional(), sms: z.boolean().optional(), phone: z.string().trim().max(30).optional() });

/**
 * Cambia el consentimiento de marketing de la persona (lo guarda el CRM con fecha y fuente "perfil", vía la función
 * `crm_set_my_consent`: el usuario no tiene acceso directo a crm_*). `allowInactive` y `write: false`: también sin activar
 * o en solo lectura, porque darse de baja siempre debe poder hacerse. El SMS exige un teléfono con código de país.
 * Volver a activar un canal levanta una baja anterior hecha aquí o en preferencias (no un rebote ni una queja); un STOP
 * solo se levanta respondiendo START al número. En esos casos la base devuelve 'suppressed' y se le explica.
 */
export async function saveMarketing(input: unknown) {
  return run({ allowInactive: true, write: false, revalidate: ["/perfil"] }, async (s) => {
    const m = M[s.locale];
    const p = Marketing.safeParse(input);
    if (!p.success || (p.data.email === undefined && p.data.sms === undefined)) return fail(s.t.errors.generic);
    let phone: string | null = null;
    if (p.data.phone) {
      phone = toE164(p.data.phone, s.profile.country);
      if (!phone) return fail(m.marketing.phoneBad);
    }
    const { data, error } = await s.supabase.rpc("crm_set_my_consent" as never, { p_email: p.data.email ?? null, p_sms: p.data.sms ?? null, p_phone: phone } as never);
    if (error) return fail(/phone/.test(error.message) ? m.marketing.phoneBad : s.t.errors.generic);
    const res = (data ?? {}) as { email?: string | null; sms?: string | null };
    if (res.sms === "suppressed") return fail(m.marketing.smsStopped);
    if (res.email === "suppressed") return fail(m.marketing.emailBlocked);
    return ok(undefined);
  });
}

// ───────── Seguridad ─────────
export async function changePassword(input: unknown) {
  return run({ allowInactive: true, write: false }, async (s) => {
    const m = M[s.locale];
    const p = z.object({ password: z.string().min(8).max(200) }).safeParse(input);
    if (!p.success || strength(p.data.password) < 3) return fail(m.pwWeak);
    const { error } = await s.supabase.auth.updateUser({ password: p.data.password });
    if (error) return fail(/reauth|recent/i.test(error.message) ? m.pwReauth : /different|same|weak/i.test(error.message) ? m.pwWeak : s.t.errors.generic);
    return ok(undefined);
  });
}

/** Cierra la sesión en todos los dispositivos (incluido este). El cliente lleva a /entrar. */
export async function signOutEverywhere() {
  return run({ write: false, allowInactive: true }, async (s) => {
    const { error } = await s.supabase.auth.signOut({ scope: "global" });
    if (error) return fail(s.t.errors.generic);
    return ok(undefined);
  });
}

// ───────── Logros: comodín de racha ─────────
export async function spendWildcard(input: unknown) {
  return run({ write: false, revalidate: ["/perfil", "/inicio"] }, async (s) => {
    const m = M[s.locale];
    const p = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(input);
    // Solo se salva la semana pasada (la base solo revisa que sea lunes y 1 por mes).
    if (!p.success || !s.config.gamification || p.data !== addDays(weekStart(s.today), -7)) return fail(s.t.errors.generic);
    const { data, error } = await s.supabase.rpc("use_wildcard", { p_week_start: p.data });
    if (error) return fail(s.t.errors.generic);
    if (data !== true) return fail(m.streak.failed); // la base cuenta 1 por mes según el mes de la semana salvada
    return ok(undefined);
  });
}

// ───────── Privacidad: borrar la cuenta ─────────
/**
 * Pide borrar la cuenta: queda una solicitud "pending" que vence en 30 días (`due_at`) y se cierra la sesión.
 * El borrado real lo hace una tarea programada. Funciona también en solo lectura.
 */
export async function requestDeletion(input: unknown) {
  return run({ write: false, allowInactive: true, revalidate: ["/perfil"] }, async (s) => {
    const m = M[s.locale];
    const p = z.object({ word: z.string().max(40) }).safeParse(input);
    if (!p.success || !confirmsWord(p.data.word, m.delWord)) return fail(fill(m.delWrong, { word: m.delWord }));
    const pending = must(await s.supabase.from("privacy_requests").select("id").eq("user_id", s.userId).eq("kind", "delete").eq("status", "pending"));
    if (pending.length === 0) must(await s.supabase.from("privacy_requests").insert({ user_id: s.userId, kind: "delete" }).select("id"));
    await s.supabase.auth.signOut();
    return ok(undefined);
  });
}

export async function cancelDeletion(input: unknown) {
  return run({ write: false, allowInactive: true, revalidate: ["/perfil"] }, async (s) => {
    const p = z.string().uuid().safeParse(input);
    if (!p.success) return fail(s.t.errors.notFound);
    must(await s.supabase.from("privacy_requests").update({ status: "cancelled" }).eq("id", p.data).eq("user_id", s.userId).eq("kind", "delete").eq("status", "pending").select("id"));
    return ok(undefined);
  });
}

// ───────── Cómo llevas tu plata: Mensual o Día a día (profiles.mov_level) ─────────
/**
 * Mensual = 'plan', Día a día = 'detail' ('totals', de antes, cuenta como Mensual y no se reescribe). Solo se escribe si
 * de verdad cambia. Cambiar de modo no borra ni mueve nada: solo cambia cómo el cierre lee el mes.
 */
export async function saveMovMode(input: unknown) {
  return run({ write: false, revalidate: [...PATHS, "/cierre", "/cuentas", "/movimientos"] }, async (s) => {
    const p = z.object({ mode: z.enum(["mensual", "diario"]) }).safeParse(input);
    if (!p.success) return fail(s.t.errors.generic);
    const level = movLevelFor(p.data.mode, s.profile.movLevel);
    if (level) must(await s.supabase.from("profiles").update({ mov_level: level }).eq("id", s.userId).select("id"));
    return ok(undefined);
  });
}
