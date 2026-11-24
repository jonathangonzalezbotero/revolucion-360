import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { FeatureConfig } from "@/lib/engine";
import { createAdminClient } from "@/lib/supabase/admin";

export type Admin = ReturnType<typeof createAdminClient>;
export const BATCH = 500;
export const FIRST_UUID = "00000000-0000-0000-0000-000000000000";

/** Las tareas programadas solo responden con `Authorization: Bearer ${CRON_SECRET}`. Sin CRON_SECRET configurado, nadie entra. */
export function authorized(request: Request): boolean {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (!secret) return false;
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Envoltura común: autoriza, corre y devuelve un JSON con conteos. Los errores se registran sin datos personales ni montos. */
export async function runCron(name: string, request: Request, job: (db: Admin) => Promise<object>): Promise<Response> {
  if (!authorized(request)) return new Response("No autorizado", { status: 401, headers: { "Cache-Control": "no-store" } });
  const started = Date.now();
  try {
    const counts = await job(createAdminClient());
    return Response.json({ ok: true, cron: name, ms: Date.now() - started, ...counts }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(`[cron:${name}]`, e instanceof Error ? e.message : "error");
    return Response.json({ ok: false, cron: name }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.revoluciondeldinero.com").trim().replace(/\/+$/, "");

/** Configuración de Admin leída con la clave de servicio (las tareas no tienen sesión; `getConfig()` usa la del usuario). */
export type CronConfig = { features: FeatureConfig; menuCierre: string | undefined; gamification: boolean; closurePoints: number };
export async function loadCronConfig(db: Admin): Promise<CronConfig> {
  const { data, error } = await db.from("app_config").select("key, value").in("key", ["features", "menu", "points", "gamification_enabled"]);
  if (error) throw new Error(`db: ${error.message}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v: Record<string, any> = Object.fromEntries(data.map((r) => [r.key, r.value]));
  const points = Number(v.points?.closure);
  return {
    features: { ...(v.features ?? {}) },
    menuCierre: typeof v.menu?.cierre === "string" ? v.menu.cierre : undefined,
    gamification: v.gamification_enabled !== false,
    closurePoints: Number.isFinite(points) && points > 0 ? points : 30,
  };
}

export type ProfileLite = { id: string; email: string; name: string; locale: string; timezone: string; country: string; prefs: unknown; suspended_at: string | null; created_at: string };
export const PROFILE_COLS = "id, email, name, locale, timezone, country, prefs, suspended_at, created_at";

/** Recorre perfiles de a 500 por llave (no por página): seguro aunque otras filas cambien mientras corre. */
export async function* profileBatches(db: Admin, opts: { createdSince?: string } = {}): AsyncGenerator<ProfileLite[]> {
  let after = FIRST_UUID;
  for (;;) {
    let q = db.from("profiles").select(PROFILE_COLS).gt("id", after).is("suspended_at", null);
    if (opts.createdSince) q = q.gte("created_at", opts.createdSince);
    const { data, error } = await q.order("id").limit(BATCH);
    if (error) throw new Error(`db: ${error.message}`);
    const rows = data as unknown as ProfileLite[];
    if (rows.length) yield rows;
    if (rows.length < BATCH) return;
    after = rows[rows.length - 1].id;
  }
}

/**
 * Trae TODAS las filas de una consulta por lotes de 100 ids (URLs cortas), paginando de a 1,000
 * (la API nunca devuelve más de 1,000 filas por consulta). La consulta debe llevar un orden estable.
 */
export async function byIds<T>(ids: string[], q: (chunk: string[]) => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> }): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await q(chunk).range(from, from + PAGE - 1);
      if (error) throw new Error(`db: ${error.message}`);
      out.push(...(data ?? []));
      if ((data ?? []).length < PAGE) break;
    }
  }
  return out;
}
