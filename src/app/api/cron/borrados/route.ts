import { BATCH, runCron } from "@/lib/email/cron";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/borrados (diario). Cumple las solicitudes de borrado de cuenta cuyo plazo venció:
 * privacy_requests kind delete, status pending, due_at <= ahora → auth.admin.deleteUser (todo lo demás se borra en cascada).
 * Antes de borrar deja constancia en admin_audit (admin_id null, acción borrado_automatico, sin datos personales en detail),
 * porque la fila de la solicitud desaparece con el usuario.
 */
export async function GET(request: Request) {
  return runCron("borrados", request, async (db) => {
    let due = 0, deleted = 0, failed = 0;
    const { data, error } = await db.from("privacy_requests").select("id, user_id, requested_at")
      .eq("kind", "delete").eq("status", "pending").lte("due_at", new Date().toISOString()).order("due_at").limit(BATCH);
    if (error) throw new Error(`db: ${error.message}`);
    for (const r of data) {
      due++;
      // Nunca se borra automáticamente una cuenta de administrador: eso lo decide el Dueño a mano.
      const { data: prof } = await db.from("profiles").select("role").eq("id", r.user_id).maybeSingle();
      if (prof?.role === "admin") { console.error("[cron:borrados] Solicitud de borrado de un administrador: se omite"); failed++; continue; }
      // Una cuenta borrada no puede seguir pagando: se cancela la suscripción de Stripe antes de borrar.
      const { data: ent } = await db.from("entitlements").select("stripe_subscription_id").eq("user_id", r.user_id).maybeSingle();
      if (ent?.stripe_subscription_id) {
        const stripe = getStripe();
        if (!stripe) { failed++; continue; } // sin Stripe configurado no se borra a alguien con suscripción
        try {
          await stripe.subscriptions.cancel(ent.stripe_subscription_id);
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (code !== "resource_missing") { console.error("[cron:borrados] No se pudo cancelar una suscripción", code ?? "sin código"); failed++; continue; }
        }
      }
      const audit = await db.from("admin_audit").insert({ admin_id: null, action: "borrado_automatico", target_user: r.user_id, detail: { request_id: r.id, requested_at: r.requested_at } }).select("id").single();
      if (audit.error) { failed++; continue; } // sin constancia no se borra
      const del = await db.auth.admin.deleteUser(r.user_id);
      if (del.error && del.error.status !== 404) {
        console.error("[cron:borrados] No se pudo borrar una cuenta", del.error.status ?? "sin código"); // sin datos personales
        await db.from("admin_audit").delete().eq("id", audit.data.id); // no quedó borrado: no se deja constancia falsa
        failed++;
        continue;
      }
      // Si la cascada ya borró la solicitud, esto no toca nada; si no (usuario inexistente), queda marcada como hecha.
      await db.from("privacy_requests").update({ status: "done", done_at: new Date().toISOString() }).eq("id", r.id);
      deleted++;
    }
    return { due, deleted, failed, more: data.length === BATCH };
  });
}
