import "server-only";
import { must } from "@/server/data";
import type { Session } from "@/server/session";
import { listUsers, type AdminUserRow } from "../_shared/server";
import { V2_FILTER, type PlanFilter } from "./lib";

export type PlanUserRow = AdminUserRow & { trial_ends_at: string | null; billing_interval: string | null; stripe_status: string | null };
export type PlanListQuery = { p_search: string; p_email: string; p_filter: PlanFilter; p_role: string; p_country: string };
type RpcResult<T> = { data: T | null; error: { message: string; code?: string } | null };

/**
 * Lista de usuarios con los filtros del plan único (`admin_users_v3`). Si la migración no está aplicada
 * (PostgREST responde PGRST202), cae a la lista anterior: sin intervalo ni estado de Stripe (el plan se ve como "Pagando").
 */
export async function listPlanUsers(s: Session, q: PlanListQuery, limit: number, offset: number): Promise<PlanUserRow[]> {
  const r = (await s.supabase.rpc("admin_users_v3" as never, { ...q, p_limit: limit, p_offset: offset } as never)) as unknown as RpcResult<PlanUserRow[]>;
  if (r.error?.code !== "PGRST202") return must(r);
  const rows = await listUsers(s, { ...q, p_filter: V2_FILTER[q.p_filter] }, limit, offset);
  return rows.map((u) => ({ ...u, trial_ends_at: null, billing_interval: null, stripe_status: null }));
}
