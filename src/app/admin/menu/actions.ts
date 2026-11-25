"use server";
import { revalidatePath } from "next/cache";
import { fill } from "@/i18n";
import { fail, ok } from "@/server/action";
import { must } from "@/server/data";
import type { Json } from "@/lib/supabase/database.types";
import { adminAction, adminText, audit } from "../_shared/server";
import { z } from "zod";
import { AUDIT_ACTION, CONFIG_KEYS, FormSchema, Schemas, diffConfig, formToValues, type ConfigKey } from "./lib";
import { M } from "./messages";

const PATHS = ["/admin/menu", "/admin/actividad", "/inicio", "/mas", "/suscripcion"];

/**
 * Guarda de una vez lo que el admin tocó en la pantalla (`keys`). Cada clave se valida con su forma exacta,
 * se escribe solo si cambió (conservando subclaves que esta pantalla no conoce) y queda en el registro.
 */
export async function saveMenuConfig(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const m = M[s.locale], t = adminText(s);
    const p = z.object({ form: FormSchema, initial: FormSchema, keys: z.array(z.enum(CONFIG_KEYS)).max(CONFIG_KEYS.length) }).safeParse(input);
    if (!p.success) return fail(t.errors.generic);
    const r = formToValues(p.data.form);
    const before = formToValues(p.data.initial);
    if (!r.ok) return fail(r.error === "points" ? fill(m.errors.points, { name: m.pointItems[r.field as keyof typeof m.pointItems] ?? "" }) : m.errors[r.error]);
    for (const k of CONFIG_KEYS) if (!Schemas[k].safeParse(r.values[k]).success) return fail(t.errors.generic);

    const rows = must(await s.supabase.from("app_config").select("key, value").in("key", [...CONFIG_KEYS]));
    const stored = Object.fromEntries(rows.map((x) => [x.key, x.value])) as Partial<Record<ConfigKey, unknown>>;
    const touched = new Set(p.data.keys);
    // Pedir 2 pasos desde una sesión sin 2 pasos dejaría fuera al propio admin a mitad de la acción.
    const mfaWasOff = stored.admin_mfa_required === false;
    if (touched.has("admin_mfa_required") && r.values.admin_mfa_required && mfaWasOff && s.aal !== "aal2") return fail(m.errors.mfa);

    const changes = diffConfig(stored, r.values, before.ok ? before.values : undefined).filter((c) => touched.has(c.key));
    if (changes.length === 0) return ok({ changed: 0 });
    const now = new Date().toISOString();
    must(await s.supabase.from("app_config").upsert(changes.map((c) => ({ key: c.key, value: c.value as NonNullable<Json>, updated_at: now })), { onConflict: "key" }).select("key"));
    for (const c of changes) {
      // Solo qué subclaves cambiaron (o si quedó encendido); nunca montos.
      await audit(s, AUDIT_ACTION[c.key], null, { keys: c.changed.length ? c.changed : undefined, on: typeof c.value === "boolean" ? c.value : undefined });
    }
    // El menú vive en el layout de la app: se revalida todo lo que cuelga de la raíz.
    revalidatePath("/", "layout");
    return ok({ changed: changes.length });
  });
}
