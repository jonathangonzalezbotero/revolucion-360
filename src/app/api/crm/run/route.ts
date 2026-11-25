import { runCron } from "@/lib/email/cron";
import { runCrm, untypedDb } from "@/server/crm";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * /api/crm/run — motor del CRM. Lo llama Supabase cada 10 minutos (pg_cron + pg_net, docs/CRM.md) con
 * `Authorization: Bearer ${CRON_SECRET}` (como las tareas de /api/cron). Etapas al día, detecciones por tiempo,
 * automatizaciones, campañas en la hora de cada persona y la cola de correo y SMS. Idempotente; devuelve conteos.
 */
const handler = (request: Request) => runCron("crm", request, (db) => runCrm(untypedDb(db)));
export const GET = handler;
export const POST = handler;
