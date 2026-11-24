import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/server/session";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const Sub = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "https"),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
const Unsub = z.object({ endpoint: z.string().url().max(1000) });

/**
 * POST /api/push/subscribe → guarda la suscripción push de este navegador para el usuario con sesión.
 * DELETE /api/push/subscribe → la quita.
 * La sesión decide de quién es; la escritura usa la clave de servicio porque `endpoint` es único en toda la tabla:
 * si otra cuenta usó antes este mismo navegador, la suscripción pasa a la cuenta actual (RLS no deja tocar la fila ajena).
 */
export async function POST(request: Request) {
  const s = await getSession();
  if (!s) return new Response("No autorizado", { status: 401, headers: NO_STORE });
  const p = Sub.safeParse(await request.json().catch(() => null));
  if (!p.success) return new Response("Datos inválidos", { status: 400, headers: NO_STORE });
  const db = createAdminClient();
  const { error } = await db.from("push_subscriptions")
    .upsert({ user_id: s.userId, endpoint: p.data.endpoint, keys: p.data.keys }, { onConflict: "endpoint" });
  if (error) {
    console.error("[push] No se pudo guardar la suscripción"); // sin datos personales
    return new Response("Error", { status: 500, headers: NO_STORE });
  }
  return Response.json({ ok: true }, { headers: NO_STORE });
}

export async function DELETE(request: Request) {
  const s = await getSession();
  if (!s) return new Response("No autorizado", { status: 401, headers: NO_STORE });
  const p = Unsub.safeParse(await request.json().catch(() => null));
  if (!p.success) return new Response("Datos inválidos", { status: 400, headers: NO_STORE });
  const { error } = await s.supabase.from("push_subscriptions").delete().eq("endpoint", p.data.endpoint).eq("user_id", s.userId);
  if (error) return new Response("Error", { status: 500, headers: NO_STORE });
  return Response.json({ ok: true }, { headers: NO_STORE });
}
