"use server";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { asLocale } from "@/i18n";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { M } from "./messages";

export type AuthResult = { ok: true; next?: string } | { ok: false; error: string };
const APP = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const msgs = async () => M[asLocale((await cookies()).get("r360_locale")?.value)];
const safeNext = (v: unknown) => (typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v : "/inicio");

/** Misma regla que la pantalla: 8+ caracteres y al menos 3 de 4 señales. */
function strength(pw: string): number {
  let sc = 0;
  if (pw.length >= 8) sc++;
  if (pw.length >= 12) sc++;
  if (/[0-9]/.test(pw) && /[A-Za-z]/.test(pw)) sc++;
  if (/[^A-Za-z0-9]/.test(pw)) sc++;
  return sc;
}

export async function signUp(input: { name: string; email: string; password: string; terms: boolean; invite?: string }): Promise<AuthResult> {
  const m = await msgs();
  const p = z.object({ name: z.string().trim().min(1).max(80), email: z.string().trim().toLowerCase().email(), password: z.string().min(8).max(200), terms: z.boolean(), invite: z.string().trim().max(40).optional() }).safeParse(input);
  if (!input.terms) return { ok: false, error: m.errors.terms };
  if (!input.name?.trim()) return { ok: false, error: m.errors.name };
  if (!p.success || strength(input.password) < 3) return { ok: false, error: m.errors.weak };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: p.data.email, password: p.data.password,
    options: { data: { name: p.data.name, invite: p.data.invite?.toUpperCase() || null, terms_accepted_at: new Date().toISOString() }, emailRedirectTo: `${APP()}/auth/confirm` },
  });
  if (error) return { ok: false, error: error.status === 429 ? m.errors.rate : /registered|exists/i.test(error.message) ? m.errors.exists : m.errors.generic };
  if (data.session) return { ok: true, next: "/bienvenida" }; // confirmación de correo desactivada (solo en local)
  return { ok: true, next: `/verificar?motivo=registro&correo=${encodeURIComponent(p.data.email)}` };
}

export async function signIn(input: { email: string; password: string; next?: string }): Promise<AuthResult> {
  const m = await msgs();
  if (!input.email?.trim() || !input.password) return { ok: false, error: m.errors.both };
  const supabase = await createClient();
  const email = input.email.trim().toLowerCase();
  const { error } = await supabase.auth.signInWithPassword({ email, password: input.password });
  if (error) {
    if (/not confirmed/i.test(error.message)) {
      await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${APP()}/auth/confirm` } });
      return { ok: false, error: m.errors.unconfirmed };
    }
    return { ok: false, error: error.status === 429 ? m.errors.rate : m.errors.invalid };
  }
  const { data: profile } = await supabase.from("profiles").select("suspended_at").maybeSingle();
  if (profile?.suspended_at) { await supabase.auth.signOut(); return { ok: false, error: m.errors.suspended }; }
  const next = safeNext(input.next);
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") return { ok: true, next: `/dos-pasos?ir=${encodeURIComponent(next)}` };
  return { ok: true, next };
}

export async function oauth(provider: "google" | "apple"): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${APP()}/auth/callback` } });
  if (data?.url) redirect(data.url);
}

/** Siempre responde igual, exista o no la cuenta: no revela quién está registrado. */
export async function recover(input: { email: string }): Promise<AuthResult> {
  const m = await msgs();
  const p = z.string().trim().toLowerCase().email().safeParse(input.email);
  if (!p.success) return { ok: false, error: m.errors.emailOnly };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(p.data, { redirectTo: `${APP()}/auth/confirm?next=/nueva-clave` });
  if (error?.status === 429) return { ok: false, error: m.errors.rate };
  return { ok: true, next: `/verificar?motivo=recuperar&correo=${encodeURIComponent(p.data)}` };
}

export async function resend(input: { email: string; reason: "registro" | "recuperar" }): Promise<AuthResult> {
  const m = await msgs();
  const supabase = await createClient();
  const email = input.email.trim().toLowerCase();
  const { error } = input.reason === "registro"
    ? await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${APP()}/auth/confirm` } })
    : await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${APP()}/auth/confirm?next=/nueva-clave` });
  if (error?.status === 429) return { ok: false, error: m.errors.rate };
  return { ok: true };
}

export async function setNewPassword(input: { password: string }): Promise<AuthResult> {
  const m = await msgs();
  if (strength(input.password ?? "") < 3 || input.password.length > 200) return { ok: false, error: m.errors.weak };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { ok: false, error: m.errors.link };
  const { error } = await supabase.auth.updateUser({ password: input.password });
  if (error) return { ok: false, error: /different|same/i.test(error.message) ? m.errors.weak : m.errors.generic };
  await supabase.auth.signOut({ scope: "others" }); // cierra la sesión en los demás dispositivos
  return { ok: true, next: "/inicio" };
}

export async function verifyCode(input: { code: string; next?: string }): Promise<AuthResult> {
  const m = await msgs();
  const code = (input.code ?? "").replace(/\D/g, "");
  if (code.length !== 6) return { ok: false, error: m.errors.code };
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp?.find((f) => f.status === "verified");
  if (!factor) return { ok: true, next: safeNext(input.next) };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) return { ok: false, error: error.status === 429 ? m.errors.rate : m.errors.code };
  return { ok: true, next: safeNext(input.next) };
}

const hashCode = (userId: string, code: string) => createHash("sha256").update(`${userId}:${code.replace(/[^a-z0-9]/gi, "").toUpperCase()}`).digest("hex");

/** Código de respaldo: de un solo uso. Al usarlo se desactivan los 2 pasos para configurarlos de nuevo. */
export async function useBackupCode(input: { code: string; next?: string }): Promise<AuthResult> {
  const m = await msgs();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: m.errors.link };
  const admin = createAdminClient();
  const { data: att } = await admin.from("mfa_attempts").select("failed, locked_until").eq("user_id", userId).maybeSingle();
  if (att?.locked_until && new Date(att.locked_until) > new Date()) return { ok: false, error: m.errors.locked };
  const { data: row } = await admin.from("mfa_backup_codes").select("id").eq("user_id", userId).eq("code_hash", hashCode(userId, input.code ?? "")).is("used_at", null).maybeSingle();
  if (!row) {
    const failed = (att?.failed ?? 0) + 1;
    await admin.from("mfa_attempts").upsert({ user_id: userId, failed: failed >= 5 ? 0 : failed, locked_until: failed >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null });
    return { ok: false, error: m.errors.backup };
  }
  await admin.from("mfa_backup_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);
  await admin.from("mfa_attempts").delete().eq("user_id", userId);
  const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId });
  for (const f of factors?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ userId, id: f.id });
  await admin.from("mfa_backup_codes").delete().eq("user_id", userId);
  await admin.from("notifications").insert({ user_id: userId, kind: "sistema", title: "Entraste con un código de respaldo", body: "La verificación en 2 pasos quedó desactivada. Actívala de nuevo desde Mi perfil.", href: "/perfil#seguridad", dedupe: `backup-${Date.now()}` });
  await supabase.auth.refreshSession();
  return { ok: true, next: "/perfil#seguridad" };
}

// ───────── 2 pasos desde Mi perfil ─────────
export type EnrollStart = { ok: true; factorId: string; qr: string; secret: string } | { ok: false; error: string };
export async function mfaStart(): Promise<EnrollStart> {
  const m = await msgs();
  const supabase = await createClient();
  const { data: list } = await supabase.auth.mfa.listFactors();
  for (const f of list?.all ?? []) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Revolución 360 · ${Date.now()}`, issuer: "Revolución 360" });
  if (error || !data) return { ok: false, error: m.errors.generic };
  return { ok: true, factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Confirma los 2 pasos y entrega, UNA sola vez, los 10 códigos de respaldo. */
export async function mfaConfirm(input: { factorId: string; code: string }): Promise<{ ok: true; backupCodes: string[] } | { ok: false; error: string }> {
  const m = await msgs();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: m.errors.generic };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: input.factorId, code: (input.code ?? "").replace(/\D/g, "") });
  if (error) return { ok: false, error: m.errors.code };
  const codes = Array.from({ length: 10 }, () => { const h = randomBytes(5).toString("hex").toUpperCase(); return `${h.slice(0, 5)}-${h.slice(5)}`; });
  const admin = createAdminClient();
  await admin.from("mfa_backup_codes").delete().eq("user_id", userId);
  await admin.from("mfa_backup_codes").insert(codes.map((c) => ({ user_id: userId, code_hash: hashCode(userId, c) })));
  return { ok: true, backupCodes: codes };
}

/** Desactivar los 2 pasos exige un código vigente de la app. */
export async function mfaDisable(input: { code: string }): Promise<AuthResult> {
  const m = await msgs();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  const { data: list } = await supabase.auth.mfa.listFactors();
  const factor = list?.totp?.find((f) => f.status === "verified");
  if (!userId || !factor) return { ok: false, error: m.errors.generic };
  const { data: profile } = await supabase.from("profiles").select("role").maybeSingle();
  if (profile?.role === "admin") return { ok: false, error: m.errors.generic }; // obligatoria para administradores
  const v = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: (input.code ?? "").replace(/\D/g, "") });
  if (v.error) return { ok: false, error: m.errors.code };
  const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
  if (error) return { ok: false, error: m.errors.generic };
  await createAdminClient().from("mfa_backup_codes").delete().eq("user_id", userId);
  await supabase.auth.refreshSession();
  return { ok: true };
}

export async function mfaStatus(): Promise<{ enabled: boolean; backupLeft: number }> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { enabled: false, backupLeft: 0 };
  const { data: list } = await supabase.auth.mfa.listFactors();
  const enabled = !!list?.totp?.some((f) => f.status === "verified");
  const { count } = await createAdminClient().from("mfa_backup_codes").select("id", { count: "exact", head: true }).eq("user_id", userId).is("used_at", null);
  return { enabled, backupLeft: count ?? 0 };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/entrar");
}
