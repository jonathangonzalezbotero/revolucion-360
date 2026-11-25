"use server";
import { z } from "zod";
import { fail, ok } from "@/server/action";
import { saveAutomation, setAutomationStatus } from "@/server/crm";
import { adminAction, audit } from "../_shared/server";
import { crmTry } from "../crm/server";
import { M } from "./messages";

// Automatizaciones (AdminAuto). Solo el Dueño (sección "crm"). El registro nunca guarda textos de correos ni SMS.
const PATHS = ["/admin/automatizaciones", "/admin/actividad"];

/** "Guardar": valida con las formas del motor (disparador, pasos, salida). Los ids de pasos que ya existen se conservan. */
export async function saveAuto(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const p = z.object({ id: z.string().uuid().nullable(), name: z.string().max(120), trigger: z.unknown(), steps: z.array(z.unknown()).max(40), exitRules: z.unknown(), transactional: z.boolean().default(false) }).safeParse(input);
    if (!p.success) return fail(M[s.locale].errors.invalid);
    const { id, ...rest } = p.data;
    const r = await crmTry(s, (db) => saveAutomation(db, { ...(id ? { id } : {}), ...rest }), M[s.locale].errors);
    if (r.ok) await audit(s, "crm_auto_guardar", null, { automation: r.data, transactional: p.data.transactional });
    return r;
  }, "crm");
}

/** "Pausar" / "Activar". Activar exige un disparador y al menos un paso válidos (ya guardados). */
export async function setAutoStatus(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const p = z.object({ id: z.string().uuid(), status: z.enum(["active", "paused"]) }).safeParse(input);
    if (!p.success) return fail(M[s.locale].errors.invalid);
    const r = await crmTry(s, (db) => setAutomationStatus(db, p.data.id, p.data.status), M[s.locale].errors);
    if (r.ok) await audit(s, p.data.status === "active" ? "crm_auto_activar" : "crm_auto_pausar", null, { automation: p.data.id });
    return r.ok ? ok(true) : r;
  }, "crm");
}
