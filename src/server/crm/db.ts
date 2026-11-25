import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { mergeLegal } from "@/app/legal/lib";
import type { Legal } from "@/lib/crm";

/**
 * Las tablas crm_* (migración 20261125000036) aún no están en database.types.ts: hasta regenerar los tipos
 * (`npm run db:types`) se consultan con un cliente sin tipos y las filas se describen aquí.
 */
export type Db = SupabaseClient;
export const untypedDb = (db: unknown) => db as Db;
/** Clave de servicio (motor, webhooks, crmEvent). Nunca lee finanzas: solo crm_*, profiles y entitlements sin montos. */
export const crmDb = () => untypedDb(createAdminClient());

export function must<T>(r: { data: T; error: { message: string; code?: string } | null }): NonNullable<T> {
  if (r.error) throw new Error(`db: ${r.error.code ?? ""} ${r.error.message}`.trim());
  return r.data as NonNullable<T>;
}

export type ContactRow = {
  id: string; email: string; name: string; phone: string | null; country: string | null; timezone: string | null; locale: "es" | "en";
  user_id: string | null; source: string; source_detail: string; stage: string;
  email_consent: boolean; email_consent_at: string | null; email_consent_source: string | null; email_unsubscribed_at: string | null;
  sms_consent: boolean; sms_consent_at: string | null; sms_consent_source: string | null; sms_unsubscribed_at: string | null;
  token: string; last_activity_at: string | null; created_at: string; updated_at: string;
};
export const CONTACT_COLS = "id, email, name, phone, country, timezone, locale, user_id, source, source_detail, stage, email_consent, email_consent_at, email_consent_source, email_unsubscribed_at, sms_consent, sms_consent_at, sms_consent_source, sms_unsubscribed_at, token, last_activity_at, created_at, updated_at";

export type MessageRow = {
  id: string; contact_id: string; channel: "email" | "sms"; source_key: string; campaign_id: string | null; automation_id: string | null;
  enrollment_id: string | null; step_id: string | null; scheduled_for: string; status: string; attempts: number; locked_at: string | null;
  provider_id: string | null; error: string | null;
};
export type CampaignRow = {
  id: string; name: string; subject: string; preheader: string; audience: unknown; blocks: unknown; status: string; send_mode: "now" | "local";
  scheduled_local: string | null; scheduled_at: string | null; enqueue_cursor: string | null; enqueued_at: string | null; sent_at: string | null;
  recipients_count: number; sent_count: number; opened_count: number; clicked_count: number; bounced_count: number; created_at: string; updated_at: string;
};
export type AutomationRow = { id: string; name: string; trigger: unknown; steps: unknown; exit_rules: unknown; status: "draft" | "active" | "paused"; created_at: string; updated_at: string };
export type EnrollmentRow = {
  id: string; automation_id: string; contact_id: string; trigger_ref: string; trigger_event_id: number | null; status: string;
  current_step_id: string | null; next_at: string | null; enrolled_at: string; finished_at: string | null; exit_reason: string | null;
};

/** Datos legales del pie (app_config.legal). Con la sesión del Dueño o con la clave de servicio. */
export async function loadLegal(db: Db): Promise<Legal> {
  const r = await db.from("app_config").select("value").eq("key", "legal").maybeSingle();
  const l = mergeLegal(r.data?.value);
  return { company: l.company, abn: l.abn, address: l.address };
}

export const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.revoluciondeldinero.com").trim().replace(/\/+$/, "");
/** Remitente de marketing: CRM_EMAIL_FROM ("Jonathan · Revolución 360 <hola@…>") o EMAIL_FROM. */
export const crmFrom = () => (process.env.CRM_EMAIL_FROM ?? "").trim() || (process.env.EMAIL_FROM ?? "").trim();
export const crmReplyTo = () => (process.env.CRM_REPLY_TO ?? "").trim() || undefined;
/** Etiqueta del remitente para la vista previa ("Jonathan · Revolución 360"). */
export const fromLabel = () => crmFrom().replace(/\s*<[^>]*>\s*$/, "").replace(/^"|"$/g, "") || "Revolución 360";
