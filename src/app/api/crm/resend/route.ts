import { verifySvix } from "@/lib/crm/sign";
import { crmDb } from "@/server/crm";

export const dynamic = "force-dynamic";

const KINDS: Record<string, string> = {
  "email.delivered": "delivered", "email.opened": "opened", "email.clicked": "clicked", "email.bounced": "bounced", "email.complained": "complained",
};

/**
 * POST /api/crm/resend — webhook de Resend (entregado, abierto, clic, rebote, queja) para los correos del CRM.
 * Verifica la firma Svix con RESEND_WEBHOOK_SECRET (node:crypto, sin librerías). Marca el mensaje, deja el evento del
 * contacto y, en rebote o queja, la supresión (crm_message_event). Los correos que no son del CRM se ignoran.
 */
export async function POST(request: Request) {
  const secret = (process.env.RESEND_WEBHOOK_SECRET ?? "").trim();
  if (!secret) return new Response("No configurado", { status: 503 });
  const body = await request.text();
  const ok = verifySvix({ id: request.headers.get("svix-id"), timestamp: request.headers.get("svix-timestamp"), signature: request.headers.get("svix-signature"), body, secret });
  if (!ok) return new Response("Firma inválida", { status: 400 });
  let event: { type?: string; created_at?: string; data?: { email_id?: string; created_at?: string } };
  try { event = JSON.parse(body); } catch { return new Response("JSON inválido", { status: 400 }); }
  const kind = KINDS[event.type ?? ""];
  const id = event.data?.email_id;
  if (!kind || !id) return Response.json({ received: true, ignored: true });
  const at = new Date(event.created_at ?? event.data?.created_at ?? Date.now());
  try {
    const r = await crmDb().rpc("crm_message_event", { p_provider_id: id, p_kind: kind, p_at: Number.isNaN(at.getTime()) ? new Date().toISOString() : at.toISOString() });
    if (r.error) throw new Error(r.error.message);
    return Response.json({ received: true });
  } catch (e) {
    console.error("[crm-resend]", event.type, e instanceof Error ? e.message.slice(0, 80) : "error"); // sin datos personales
    return new Response("Error", { status: 500 }); // Resend reintenta
  }
}
