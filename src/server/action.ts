import "server-only";
import { revalidatePath } from "next/cache";
import { getSession, type Session } from "./session";
import type { FeatureKey } from "@/lib/engine";

export type Result<T = undefined> = { ok: true; data: T; points?: number; badge?: string } | { ok: false; error: string };
export const ok = <T>(data: T, extra: { points?: number; badge?: string } = {}): Result<T> => ({ ok: true, data, ...extra });
export const fail = (error: string): Result<never> => ({ ok: false, error });

type Opts = { write?: boolean; feature?: FeatureKey; revalidate?: string[] };

/**
 * Envoltura de toda acción del servidor: exige sesión, bloquea escritura en solo lectura,
 * respeta lo que es Pro y nunca deja escapar un error técnico a la pantalla.
 */
export async function run<T>(opts: Opts, fn: (s: Session) => Promise<Result<T>>): Promise<Result<T>> {
  const s = await getSession();
  if (!s) return fail("Tu sesión terminó. Vuelve a entrar.");
  if (opts.write !== false && !s.canEdit) return fail(s.t.errors.readOnly);
  if (opts.feature && !s.has(opts.feature)) return fail(s.t.errors.pro);
  try {
    const r = await fn(s);
    if (r.ok) (opts.revalidate ?? []).forEach((p) => revalidatePath(p));
    return r;
  } catch (e) {
    console.error("[action]", e instanceof Error ? e.message : "error"); // sin montos ni datos personales
    return fail(s.t.errors.generic);
  }
}
