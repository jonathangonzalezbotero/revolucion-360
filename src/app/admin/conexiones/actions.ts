"use server";
import { z } from "zod";
import { fail, ok } from "@/server/action";
import {
  createTag, importSysteme, regenerateConnectionSecret, systemeLookup, revealConnectionSecret, saveConnection, saveTurnstileSiteKey, sendConnectionTest, setConnectionStatus,
} from "@/server/crm";
import { adminAction, audit } from "../_shared/server";
import { crmTry } from "../crm/server";
import { M } from "./messages";

// Conexiones web (AdminConexiones). Solo el Dueño (sección "crm"). El registro guarda ids y conteos: nunca correos,
// claves, dominios ni textos.
const PATHS = ["/admin/conexiones", "/admin/actividad"];
const Id = z.string().uuid();

/** "+ Nueva conexión" y cada cambio de la conexión abierta (nombre, etiquetas, páginas, confirmación, página de gracias). */
export async function saveConn(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const r = await crmTry(s, (db) => saveConnection(db, input), M[s.locale].errors);
    if (r.ok) await audit(s, "crm_conexion_guardar", null, { connection: r.data });
    return r;
  }, "crm");
}

/** "+ Etiqueta" con un nombre nuevo: la crea (o devuelve la que ya existe con ese nombre). */
export async function newTag(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const p = z.object({ name: z.string().trim().min(1).max(40) }).safeParse(input);
    if (!p.success) return fail(M[s.locale].errors.invalid);
    return crmTry(s, (db) => createTag(db, p.data.name), M[s.locale].errors);
  }, "crm");
}

/** "Pausar" / "Activar". */
export async function setConnStatus(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const p = z.object({ id: Id, status: z.enum(["active", "paused"]) }).safeParse(input);
    if (!p.success) return fail(M[s.locale].errors.invalid);
    const r = await crmTry(s, (db) => setConnectionStatus(db, p.data.id, p.data.status), M[s.locale].errors);
    if (r.ok) await audit(s, p.data.status === "active" ? "crm_conexion_activar" : "crm_conexion_pausar", null, { connection: p.data.id });
    return r.ok ? ok(true) : r;
  }, "crm");
}

/** "Mostrar" / "Copiar" la clave secreta: se pide al servidor solo en ese momento (queda en el registro, sin la clave). */
export async function revealKey(input: unknown) {
  return adminAction([], async (s) => {
    const p = z.object({ id: Id }).safeParse(input);
    if (!p.success) return fail(M[s.locale].errors.invalid);
    const r = await crmTry(s, (db) => revealConnectionSecret(db, p.data.id), M[s.locale].errors);
    if (r.ok) await audit(s, "crm_conexion_ver_clave", null, { connection: p.data.id });
    return r;
  }, "crm");
}

/** "Cambiar clave": la anterior deja de servir. */
export async function regenerateKey(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const p = z.object({ id: Id }).safeParse(input);
    if (!p.success) return fail(M[s.locale].errors.invalid);
    const r = await crmTry(s, (db) => regenerateConnectionSecret(db, p.data.id), M[s.locale].errors);
    if (r.ok) await audit(s, "crm_conexion_nueva_clave", null, { connection: p.data.id });
    return r;
  }, "crm");
}

/** "Enviar contacto de prueba" (prueba+<conexión>@revolucion360.test: nunca recibe correos). */
export async function sendTest(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const p = z.object({ id: Id }).safeParse(input);
    if (!p.success) return fail(M[s.locale].errors.invalid);
    const r = await crmTry(s, (db) => sendConnectionTest(db, p.data.id), M[s.locale].errors);
    if (r.ok) await audit(s, "crm_conexion_prueba", null, { connection: p.data.id });
    return r;
  }, "crm");
}

/** "Ajustes anti-bots": la clave del SITIO (pública). La secreta vive solo en TURNSTILE_SECRET_KEY. */
export async function saveSiteKey(input: unknown) {
  return adminAction(PATHS, async (s) => {
    const p = z.object({ siteKey: z.string().max(200) }).safeParse(input);
    if (!p.success) return fail(M[s.locale].errors.site_key);
    const r = await crmTry(s, (db) => saveTurnstileSiteKey(db, p.data.siteKey), M[s.locale].errors);
    if (r.ok) await audit(s, "crm_antibots", null, {});
    return r.ok ? ok(true) : r;
  }, "crm");
}

/** Una tanda (máx. 100 filas) del CSV de systeme.io, ya mapeada en el navegador. La constancia solo cuenta si se escribió. */
export async function importSystemeBatch(input: unknown) {
  return adminAction(["/admin/conexiones", "/admin/crm", "/admin/actividad"], async (s) => {
    const p = z.object({ rows: z.array(z.unknown()).max(100), proof: z.string().trim().max(500).default("") }).safeParse(input);
    if (!p.success) return fail(M[s.locale].errors.invalid);
    const r = await crmTry(s, (db) => importSysteme(db, p.data.rows, { consentSource: p.data.proof || undefined }), M[s.locale].errors);
    if (r.ok) await audit(s, "crm_importar_systeme", null, { created: r.data.created, updated: r.data.updated, unsubscribed: r.data.unsubscribed, consented: r.data.consented });
    return r;
  }, "crm");
}

/** Vista previa de systeme.io: qué correos ya existen (nuevos vs. actualizados) y qué etiquetas ya existen. Solo lee. */
export async function previewSysteme(input: unknown) {
  return adminAction([], async (s) => {
    const p = z.object({ emails: z.array(z.string().max(254)).max(2000), tags: z.array(z.string().max(60)).max(500).default([]) }).safeParse(input);
    if (!p.success) return fail(M[s.locale].errors.invalid);
    return crmTry(s, (db) => systemeLookup(db, p.data.emails, p.data.tags), M[s.locale].errors);
  }, "crm");
}
