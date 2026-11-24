"use server";
import { z } from "zod";
import { fail, ok, run } from "@/server/action";
import { must } from "@/server/data";
import { track } from "@/server/rewards";
import { ConfigSchema } from "./lib";
import { M } from "./messages";

const PATHS = ["/proyeccion"];
const Id = z.string().uuid();
const Name = z.string().trim().min(1).max(60);

/** Guarda un escenario nuevo (sin id) o reemplaza la configuración de uno existente. Nunca toca el plan. */
export async function saveScenario(input: unknown) {
  return run({ feature: "escenarios", revalidate: PATHS }, async (s) => {
    const p = z.object({ id: Id.optional(), name: Name, config: ConfigSchema }).safeParse(input);
    if (!p.success) return fail(p.error.issues.some((i) => i.path[0] === "name") ? s.t.errors.name : M[s.locale].errors.config);
    const config = { year: s.year, off: p.data.config.off, extra: p.data.config.extra };
    if (p.data.id) {
      const rows = must(await s.supabase.from("forecast_scenarios").update({ name: p.data.name, config }).eq("id", p.data.id).select("id"));
      if (rows.length === 0) return fail(s.t.errors.notFound);
      return ok(p.data.id);
    }
    const row = must(await s.supabase.from("forecast_scenarios").insert({ user_id: s.userId, name: p.data.name, config }).select("id").single());
    return ok(row.id);
  });
}

export async function renameScenario(input: unknown) {
  return run({ feature: "escenarios", revalidate: PATHS }, async (s) => {
    const p = z.object({ id: Id, name: Name }).safeParse(input);
    if (!p.success) return fail(s.t.errors.name);
    const rows = must(await s.supabase.from("forecast_scenarios").update({ name: p.data.name }).eq("id", p.data.id).select("id"));
    if (rows.length === 0) return fail(s.t.errors.notFound);
    return ok(undefined);
  });
}

export async function deleteScenario(input: unknown) {
  return run({ feature: "escenarios", revalidate: PATHS }, async (s) => {
    const p = Id.safeParse(input);
    if (!p.success) return fail(s.t.errors.notFound);
    const rows = must(await s.supabase.from("forecast_scenarios").delete().eq("id", p.data).select("id"));
    if (rows.length === 0) return fail(s.t.errors.notFound);
    return ok(undefined);
  });
}

/** Evento del embudo: una vez por visita (lo dispara la pantalla al abrirse, no cada vez que se vuelve a pintar). */
export async function trackForecastView() {
  return run({ write: false }, async (s) => {
    await track(s, "forecast_view");
    return ok(undefined);
  });
}
