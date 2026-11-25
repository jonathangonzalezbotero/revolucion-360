"use server";
import { ok, run } from "@/server/action";
import { touchWeek } from "@/server/rewards";

/**
 * Abrir el repaso cuenta para la racha de la semana. Se llama desde el navegador al montar la pantalla
 * (no al pintarla en el servidor), así un prefetch del enlace en Inicio no cuenta como visita.
 * En solo lectura no suma (la base no deja escribir), pero tampoco falla.
 */
export async function visitRepaso() {
  return run({ write: false, revalidate: ["/inicio", "/perfil"] }, async (s) => {
    if (s.canEdit) await touchWeek(s);
    return ok(undefined);
  });
}
