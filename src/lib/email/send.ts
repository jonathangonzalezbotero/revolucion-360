import "server-only";
import { Resend } from "resend";
import type { createAdminClient } from "@/lib/supabase/admin";
import { mayEmail, type EmailKind } from "./lib";
import { sendPush } from "./push";
import type { Rendered } from "./templates";

type Admin = ReturnType<typeof createAdminClient>;
export type SendResult = "sent" | "skipped" | "duplicate" | "failed";

/** Solo en producción de Vercel salen correos a cualquier dirección. En local y en previews, solo a @revolucion360.test. */
export const isProduction = () => process.env.VERCEL_ENV === "production";

let warned = false;
let client: Resend | null = null;
function resend(): Resend | null {
  const key = (process.env.RESEND_API_KEY ?? "").trim();
  if (!key) {
    if (!warned) console.warn("[email] Falta RESEND_API_KEY: no se envían correos."); // sin datos personales
    warned = true;
    return null;
  }
  client ??= new Resend(key);
  return client;
}

/** Envía un correo con Resend. Nunca lanza: devuelve el resultado. Los errores se registran sin la dirección ni el contenido. */
export async function sendEmail(to: string, r: Rendered, kind: EmailKind): Promise<"sent" | "skipped" | "failed"> {
  if (!mayEmail(to, isProduction())) return "skipped";
  const api = resend();
  const from = (process.env.EMAIL_FROM ?? "").trim();
  if (!api) return "skipped";
  if (!from) {
    console.warn("[email] Falta EMAIL_FROM: no se envían correos.");
    return "skipped";
  }
  try {
    const payload = { from, to, subject: r.subject, html: r.html, text: r.text, headers: { "X-Entity-Ref-ID": kind } };
    let { error } = await api.emails.send(payload);
    // Resend limita los envíos por segundo: si nos frena, esperamos un poco y reintentamos (hasta 2 veces).
    for (let i = 0; error && error.name === "rate_limit_exceeded" && i < 2; i++) {
      await new Promise((ok) => setTimeout(ok, 1100 * (i + 1)));
      ({ error } = await api.emails.send(payload));
    }
    if (error) {
      console.error("[email] Resend rechazó el envío", kind, error.name);
      return "failed";
    }
    return "sent";
  } catch (e) {
    console.error("[email] Error al enviar", kind, e instanceof Error ? e.name : "error");
    return "failed";
  }
}

/**
 * Envía UNA sola vez por (usuario, tipo, ref): primero reserva la fila en email_log (unique) y solo si la reservó, envía.
 * Si no se pudo enviar (sin clave, dirección no permitida o error), suelta la reserva para que la próxima corrida lo intente.
 */
export async function deliverOnce(db: Admin, a: { userId: string; kind: EmailKind; ref: string; to: string; render: () => Rendered }): Promise<SendResult> {
  if (!mayEmail(a.to, isProduction()) || !resend() || !(process.env.EMAIL_FROM ?? "").trim()) return "skipped";
  const claim = await db.from("email_log").upsert({ user_id: a.userId, kind: a.kind, ref: a.ref }, { onConflict: "user_id,kind,ref", ignoreDuplicates: true }).select("id");
  if (claim.error) throw new Error(`db: ${claim.error.message}`);
  if (!claim.data?.length) return "duplicate";
  const res = await sendEmail(a.to, a.render(), a.kind);
  if (res !== "sent") {
    await db.from("email_log").delete().eq("id", claim.data[0].id);
    return res;
  }
  return "sent";
}

/** ¿Ya se mandó? (para no armar el correo de más). */
export async function alreadySent(db: Admin, kind: EmailKind, refsByUser: { userId: string; ref: string }[]): Promise<Set<string>> {
  const out = new Set<string>();
  const ids = [...new Set(refsByUser.map((r) => r.userId))];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db.from("email_log").select("user_id, ref").eq("kind", kind).in("user_id", ids.slice(i, i + 100));
    if (error) throw new Error(`db: ${error.message}`);
    for (const r of data) out.add(`${r.user_id}|${r.ref}`);
  }
  return out;
}

/**
 * Notificación en la app (una sola vez gracias a `dedupe`). Si se creó y el usuario tiene push, también la manda al teléfono.
 * Devuelve true si la creó ahora.
 */
export async function notifyOnce(db: Admin, n: { userId: string; kind: string; title: string; body: string; href: string; dedupe: string }): Promise<boolean> {
  const { data, error } = await db.from("notifications")
    .upsert({ user_id: n.userId, kind: n.kind, title: n.title.slice(0, 140), body: n.body.slice(0, 400), href: n.href, dedupe: n.dedupe }, { onConflict: "user_id,dedupe", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(`db: ${error.message}`);
  if (!data?.length) return false;
  await sendPush(db, n.userId, { title: n.title, body: n.body, href: n.href, tag: n.dedupe });
  return true;
}
