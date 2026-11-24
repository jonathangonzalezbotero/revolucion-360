import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con la clave de servicio: SALTA los permisos de la base de datos.
 * Solo para: avisos de Stripe, tareas programadas, y operaciones de cuenta (borrar usuario, reiniciar 2 pasos).
 * Nunca se usa para leer datos financieros desde el panel de administración.
 */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
