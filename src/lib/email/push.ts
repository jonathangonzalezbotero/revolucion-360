import "server-only";
import * as webpush from "web-push";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;
export type PushPayload = { title: string; body: string; href: string; tag?: string };

type WebPush = typeof webpush;

/** Envía push solo si hay claves VAPID (`npx web-push generate-vapid-keys`). */
let cached: WebPush | null | undefined;
function loadWebPush(): WebPush | null {
  if (cached !== undefined) return cached;
  const pub = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();
  const priv = (process.env.VAPID_PRIVATE_KEY ?? "").trim();
  if (!pub || !priv) return (cached = null);
  try {
    const lib = webpush;
    const contact = (process.env.EMAIL_FROM ?? "").match(/<([^>]+)>/)?.[1] ?? "hola@revoluciondeldinero.com";
    lib.setVapidDetails(`mailto:${contact}`, pub, priv);
    cached = lib;
  } catch {
    cached = null;
  }
  return cached;
}
export const pushAvailable = () => loadWebPush() !== null;

/** Manda la notificación a todos los dispositivos del usuario. Borra las suscripciones que ya no existen (404/410). Nunca lanza. */
export async function sendPush(db: Admin, userId: string, p: PushPayload): Promise<number> {
  const wp = loadWebPush();
  if (!wp) return 0;
  const { data, error } = await db.from("push_subscriptions").select("id, endpoint, keys").eq("user_id", userId);
  if (error || !data?.length) return 0;
  const payload = JSON.stringify({ title: p.title, body: p.body, href: p.href.startsWith("/") ? p.href : "/notificaciones", tag: p.tag });
  let sent = 0;
  for (const s of data) {
    const keys = s.keys as { p256dh?: string; auth?: string } | null;
    if (!keys?.p256dh || !keys?.auth) continue;
    try {
      await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }, payload, { TTL: 60 * 60 * 24 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
      else console.error("[push] Error al enviar", code ?? "sin código"); // sin datos personales
    }
  }
  return sent;
}
