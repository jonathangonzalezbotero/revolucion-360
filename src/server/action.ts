import "server-only";
import { revalidatePath } from "next/cache";
import { getSession, type Session } from "./session";
import type { FeatureKey } from "@/lib/engine";

export type Result<T = undefined> = { ok: true; data: T; points?: number; badge?: string } | { ok: false; error: string };
export const ok = <T>(data: T, extra: { points?: number; badge?: string } = {}): Result<T> => ({ ok: true, data, ...extra });
export const fail = (error: string): Result<never> => ({ ok: false, error });

/**
 * - `write: false`: la acción funciona también en solo lectura (perfil, privacidad, canje de código).
 * - `allowInactive: true`: la acción funciona también en una cuenta SIN ACTIVAR (`free`: se registró y no pagó).
 *   Solo la llevan bienvenida, asistente, `/activar` (canje de código), Perfil › privacidad e idioma (región e idioma,
 *   cerrar sesión en todos lados, pedir o cancelar el borrado; exportar y 2 pasos no pasan por `run`) y el panel de
 *   admin (el plan del admin no importa). Todo lo demás se rechaza (CLAUDE.md regla 6).
 */
type Opts = { write?: boolean; allowInactive?: boolean; feature?: FeatureKey; revalidate?: string[] };

/**
 * Envoltura de toda acción del servidor: exige sesión, frena a una cuenta sin activar (salvo `allowInactive`),
 * bloquea escritura en solo lectura y nunca deja escapar un error técnico a la pantalla.
 */
export async function run<T>(opts: Opts, fn: (s: Session) => Promise<Result<T>>): Promise<Result<T>> {
  const s = await getSession();
  if (!s) return fail("Tu sesión terminó. Vuelve a entrar.");
  // Sin activar: la página ya lo manda a /activar; esto frena también una llamada directa a la acción.
  if (!opts.allowInactive && s.plan === "free") return fail(s.t.errors.inactive);
  if (opts.write !== false && !s.canEdit) return fail(s.t.errors.readOnly);
  if (opts.feature && !s.has(opts.feature)) return fail(s.t.errors.inactive);
  try {
    const r = await fn(s);
    if (r.ok) (opts.revalidate ?? []).forEach((p) => revalidatePath(p));
    return r;
  } catch (e) {
    console.error("[action]", e instanceof Error ? e.message : "error"); // sin montos ni datos personales
    return fail(s.t.errors.generic);
  }
}
