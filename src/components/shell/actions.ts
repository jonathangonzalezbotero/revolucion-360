"use server";
import type { Json } from "@/lib/supabase/database.types";
import { ok, run } from "@/server/action";
import { must } from "@/server/data";
import { tourSeen, withTourSeen } from "./tour-lib";

/**
 * Recorrido general: "ya lo vio" (terminarlo o saltarlo). Se guarda en `profiles.prefs.tour.seen`, conservando
 * las demás preferencias (notificaciones, hábito). Sin `allowInactive`: el recorrido no se muestra sin activar.
 */
export async function markTourSeen() {
  return run({}, async (s) => {
    if (tourSeen(s.profile.prefs)) return ok(undefined);
    const prefs = withTourSeen(s.profile.prefs, new Date().toISOString());
    must(await s.supabase.from("profiles").update({ prefs: prefs as NonNullable<Json> }).eq("id", s.userId).select("id"));
    return ok(undefined);
  });
}
