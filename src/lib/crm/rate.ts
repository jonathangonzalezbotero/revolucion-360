// Límite de frecuencia simple, en memoria (ventana fija). PURO: el reloj se inyecta (tests/crm.test.ts).
// Vive en la memoria de cada instancia de Vercel: no es exacto entre instancias ni sobrevive a un reinicio, pero frena
// una ráfaga desde una misma IP o con una clave filtrada. Documentado en docs/CRM.md.

export type RateStore = Map<string, { count: number; resetAt: number }>;

/** true = se permite. Cuenta la petición. Limpia entradas vencidas cuando el mapa crece. */
export function rateLimit(store: RateStore, key: string, now: number, limit: number, windowMs: number): boolean {
  if (store.size > 5000) for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
  const cur = store.get(key);
  if (!cur || cur.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  cur.count++;
  return cur.count <= limit;
}

/** ¿Esta clave ya pasó el límite en la ventana actual? (solo mira, no cuenta). */
export function isLimited(store: RateStore, key: string, now: number, limit: number): boolean {
  const cur = store.get(key);
  return !!cur && cur.resetAt > now && cur.count >= limit;
}

/** IP del cliente detrás de Vercel (primera de x-forwarded-for) o "unknown". */
export const clientIp = (h: { get(name: string): string | null }) =>
  (h.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 64) || (h.get("x-real-ip") ?? "").trim().slice(0, 64) || "unknown";

/** Tope del cuerpo de los webhooks (Resend, Twilio) antes de verificar la firma. */
export const WEBHOOK_MAX_BYTES = 64 * 1024;

/**
 * Lee el cuerpo como texto sin pasar de `max` bytes (aunque no venga content-length o mienta). null = muy grande.
 */
export async function readBodyLimited(request: Request, max: number): Promise<string | null> {
  if (Number(request.headers.get("content-length") ?? 0) > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel().catch(() => {}); return null; }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let off = 0;
  for (const p of parts) { all.set(p, off); off += p.byteLength; }
  return new TextDecoder().decode(all);
}
