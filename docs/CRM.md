# CRM: contactos, campañas de correo, automatizaciones y SMS

Decisiones de Jonathan (25 nov 2026, `docs/plan-de-implementacion.md` › CRM): el CRM vive dentro del panel (`/admin`), solo
lo de los mockups `AdminCRM`, `AdminCampanas` y `AdminAuto`; correo con Resend y SMS con Twilio; cada usuario de la app es
también un contacto; el CRM guarda contacto, etiquetas, consentimiento y eventos de uso, **nunca montos** (regla 4);
marketing solo con consentimiento; la cola la procesa una ruta de la app que Supabase llama cada 10 minutos; solo el Dueño
usa el CRM.

```
supabase/migrations/20261125000036_crm.sql   tablas crm_*, funciones, disparador perfil → contacto, contactos de las cuentas que ya existen
src/lib/crm/                                 PURO (probado en tests/crm.test.ts): formas (zod), etapas, consentimiento, horas por zona,
                                             teléfono E.164, automatizaciones, correo y SMS, firmas de webhooks, textos
src/server/crm/                              servidor: crmEvent, motor (runCrm), cola, Twilio, ingreso de leads, funciones para el panel
src/app/api/crm/run                          motor (CRON_SECRET), lo llama pg_cron cada 10 min
src/app/api/crm/ingest                       leads de las landing pages (CRM_INGEST_KEY)
src/app/api/crm/unsubscribe                  baja en un clic por token (GET confirma, POST da de baja)
src/app/api/crm/resend                       webhook de Resend: entregado, abierto, clic, rebote, queja (firma Svix)
src/app/api/crm/twilio                       SMS entrantes: STOP / START (firma de Twilio)
src/app/correo/preferencias                  "Elegir qué correos recibo" por token (pública, sin sesión)
```

## Modelo de datos (solo el Dueño lee y escribe; RLS con `is_admin_owner()`)

| Tabla | Qué guarda |
|---|---|
| `crm_contacts` | Correo (único, minúsculas), nombre, teléfono E.164, país, zona horaria, idioma, `user_id` (único; usuario de la app; al borrar la cuenta se borra el contacto), origen (`webinar`, `diagnostico`, `web`, `app`, `importado`, `manual`) y detalle, **etapa** (= etiqueta de sistema), consentimiento de correo y de SMS con fecha y fuente, baja de correo y de SMS con fecha, `token` de baja/preferencias, última actividad, creado. Sin montos. |
| `crm_tags` | Etiquetas. Las 5 de sistema (Lead, Primer mes, Pagando, Alumno, Solo lectura) tienen `system_key`. |
| `crm_contact_tags` | Etiquetas propias de cada contacto (las de sistema no se ponen aquí: un disparador lo impide). |
| `crm_events` | Actividad: tipo + fecha + ref (ids, fechas, %; nunca nombres ni montos). Único por (contacto, tipo, ref). `processed_at` null = el motor aún no lo revisó para inscribir o sacar de automatizaciones. |
| `crm_campaigns` | Asunto, vista previa, público (`{stages, tagIds, noAccount}`), bloques del editor (JSON validado con zod), estado `draft` / `scheduled` / `sending` / `sent` / `cancelled`, "Enviar ahora" o "Programar" a una hora local (`scheduled_local`, hora de cada persona), conteos de destinatarios, enviados, abiertos, clics y rebotes. |
| `crm_automations` | Disparador (`{kind, days?, firstOnly?, tagId?, form?, pct?}`), pasos (esperar, correo, SMS, condición con ramas sí/no, etiquetar, salir), reglas de salida (`onUnsubscribe`, `onCancel`, `goal`), estado `draft` / `active` / `paused`. |
| `crm_enrollments` | Inscripción de un contacto: paso actual (`current_step_id` = el próximo a ejecutar), próximo momento (`next_at`), estado `active` / `done` / `exited` y motivo. Una activa por persona y automatización; un mismo hecho nunca inscribe dos veces. |
| `crm_messages` | Cola (outbox): contacto, canal (`email` / `sms`), origen (campaña o automatización + paso + inscripción), programado para, estado (`queued`, `sending`, `sent`, `skipped`, `failed`), intentos, id del proveedor, entregado / abierto / clic / rebote / queja con fecha, error técnico sin datos personales. **Único por (origen, contacto).** |
| `crm_suppressions` | Correos y teléfonos a los que nunca se manda marketing: baja, rebote, queja, STOP o a mano. Sobrevive al contacto. Volver a aceptar explícitamente levanta una baja / STOP / queja (nunca un rebote). |

Funciones:

| Función | Quién | Para qué |
|---|---|---|
| `crm_summary()` | Dueño | Tarjetas de Contactos: contactos, +semana, leads sin cuenta, % que acepta marketing, bajas 30 días. |
| `crm_automation_counts()` | Dueño | "N dentro" de cada automatización. |
| `crm_set_consent(contacto, canal, sí/no, fuente)` | Dueño o servidor | Única puerta del panel para el consentimiento (deja evento y supresión). |
| `crm_set_my_consent(email, sms, teléfono)` / `crm_my_consent()` | El usuario (su fila) | Perfil › Notificaciones. |
| `crm_link_user(usuario)` | Servidor | Crea o une el contacto de un usuario (por `user_id`, si no por correo). |
| `crm_apply_consent`, `crm_claim_messages`, `crm_refresh_campaigns`, `crm_message_event` | Solo clave de servicio | Consentimiento, tomar la cola de forma atómica, conteos, eventos de Resend. |

Disparador `crm_on_profile` (al crear un perfil o cambiarle el correo): crea o une el contacto, deja "Creó su cuenta" y, si
marcó la casilla del registro, el consentimiento de correo (fuente `registro`). Nunca tumba el registro: cualquier error
queda como aviso en el log y el motor lo vuelve a intentar. La migración también crea, una sola vez, el contacto de cada
cuenta que ya existe (sin consentimiento: nunca lo dio).

## Etapas (etiquetas de sistema)

`src/lib/crm/rules.ts` › `stageFor`: sin cuenta o sin activar = **Lead**; pagando en el primer mes (Stripe `trialing`) =
**Primer mes**; pagando después = **Pagando**; alumno o fundador = **Alumno**; solo lectura = **Solo lectura**. Se ajusta en
el momento (eventos de pago y código de alumno) y en cada corrida del motor (las tareas diarias y el panel cambian estados
sin avisar al CRM). Cada cambio deja "Cambió de etapa" y "Se le puso una etiqueta" (puede iniciar una automatización).

## Eventos y dónde salen

| Evento (`kind`) | Disparador del mockup | Dónde |
|---|---|---|
| `signup` | (historial; objetivo "creó su cuenta") | Disparador `crm_on_profile` |
| `first_month_paid` / `paying` | Pagó su primer mes / pasó a pagar | `src/app/api/stripe/webhook` › `syncSubscription` (primer paso a Pro; y trialing → active) |
| `payment_failed` | Pago fallido | webhook › `invoice.payment_failed` (una vez por fallo) |
| `subscription_ended` | Suscripción terminó | webhook › paso a solo lectura |
| `student_code` | Entró con código de alumno | `src/app/auth/confirm/route.ts` y `src/app/(auth)/activar/actions.ts` |
| `wizard_done` | Terminó el asistente | `src/app/(onboarding)/asistente/actions.ts` (la primera vez) |
| `first_closure` | Hizo su primer cierre | `src/app/(app)/cierre/actions.ts` |
| `goal_milestone` | Llegó a un hito de meta | `src/app/(app)/metas/server.ts` › `celebrate` (ref = id de la meta + %) |
| `diagnostic_done` | Hizo el diagnóstico | `src/app/(app)/diagnostico/page.tsx` (una vez, después de responder) y el ingreso con origen `diagnostico` |
| `web_form` | Llenó un formulario web | `POST /api/crm/ingest` |
| `tag_added` | Se le puso una etiqueta | Panel, automatizaciones, ingreso y cambio de etapa |
| `inactive_days` | No abre la app en X días | Motor: `profiles.last_active_at` (lo marca `touch_week`, es decir, la última acción válida de la semana), ventana de 3 días |
| `charge_upcoming` | Faltan X días para un cobro | Motor: `entitlements.pro_until` de suscripciones que siguen (`firstOnly` = solo el fin del primer mes) |

`crmEvent(target, kind, ref?)` (`src/server/crm/events.ts`) nunca lanza: si el CRM falla (o la migración no está aplicada)
la acción del usuario sigue igual y queda un aviso sin datos personales. Las inscripciones y los envíos los hace el motor.

## Motor (`/api/crm/run`, cada 10 minutos)

1. Etapas, zona horaria, idioma y país de los contactos con cuenta al día (y red de seguridad del disparador).
2. Detecta "no abre la app en X días" y "faltan X días para un cobro" (solo los X de automatizaciones activas).
3. Eventos pendientes → saca de automatizaciones (baja, cancelación, objetivo) e inscribe donde coincide el disparador.
4. Avanza las inscripciones cuyo momento llegó: encola correos y SMS, pone o quita etiquetas, evalúa condiciones.
5. Campañas: "Enviar ahora" se encola ya; "Programar" empieza cuando la primera zona del mundo (UTC+14) llega a la hora y
   a cada persona le sale a esa hora en **su** zona (la del contacto, si no la de su país, si no Sydney).
6. Envía la cola. **Justo antes de cada envío** revisa consentimiento, baja y supresión. Correo con Resend
   (`sendEmailDetailed`, misma regla: fuera de producción solo a `@revolucion360.test`), con llave de idempotencia = id del
   mensaje. SMS con Twilio por REST, nunca de noche (9:00–20:00 en su hora). Reintentos: 3 intentos (10, 20 min); un SMS sin
   respuesta de Twilio no se reintenta solo (Twilio no deduplica). Lotes: 150 correos y 50 SMS por corrida
   (`CRM_EMAIL_BATCH`, `CRM_SMS_BATCH`), presupuesto de 4 minutos.

Si falta configuración, los mensajes **quedan en la cola** con el motivo en `crm_messages.error`:
`missing_resend_api_key`, `legal_incomplete` (faltan razón social, ABN o dirección en Contenido por país),
`missing_twilio_config`. Salen solos cuando se completa.

Cada etapa del motor va aislada: si una falla (se registra `error_<etapa>` en la respuesta), las demás y el envío siguen.

Correr el motor en local **escribe en la base de producción** (`.env`): ajusta etapas, inscribe y encola igual que la corrida
real. Solo envía a `@revolucion360.test` y a `SMS_TEST_NUMBERS`; cualquier otro mensaje que tome lo devuelve a la cola
intacto (nunca lo marca "omitido") para que lo envíe la corrida de producción. Úsalo solo con datos de prueba y sabiendo eso:
```bash
curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/crm/run | jq
```

## Paso manual de Jonathan: el job de pg_cron

La migración no crea el job ni guarda URLs o secretos. En Supabase → SQL Editor (una sola vez, después de aplicar la 036 y
de desplegar):

```sql
-- 1) Extensiones (si ya están activas en Database → Extensions, no hace nada).
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- 2) URL y secreto en Vault (reemplaza el valor de CRON_SECRET; nunca lo pegues en el repositorio).
select vault.create_secret('https://app.revoluciondeldinero.com/api/crm/run', 'crm_run_url');
select vault.create_secret('PEGA_AQUI_EL_CRON_SECRET', 'crm_cron_secret');

-- 3) Cada 10 minutos.
select cron.schedule('crm-run', '*/10 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'crm_run_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'crm_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
$$);
```

Revisar: `select * from cron.job_run_details order by start_time desc limit 10;` y
`select status_code, created from net._http_response order by created desc limit 10;` (200 = bien, 401 = secreto distinto).
Pausar: `select cron.unschedule('crm-run');`. Cambiar el secreto: `select vault.update_secret((select id from vault.secrets where name = 'crm_cron_secret'), 'NUEVO');`.

## API de ingreso de leads (landing pages)

`POST https://app.revoluciondeldinero.com/api/crm/ingest` con `Authorization: Bearer <CRM_INGEST_KEY>`, JSON de máximo 8 KB.
**Se llama desde un servidor** (backend de la web, la herramienta de formularios o Zapier), nunca desde el navegador: la
clave no puede quedar en el HTML de la página.

```bash
curl -X POST https://app.revoluciondeldinero.com/api/crm/ingest \
  -H "Authorization: Bearer $CRM_INGEST_KEY" -H "Content-Type: application/json" \
  -d '{
    "email": "ana@correo.com",
    "name": "Ana Morales",
    "phone": "+61 412 345 678",
    "country": "AU",
    "timezone": "Australia/Sydney",
    "locale": "es",
    "source": "webinar",
    "sourceDetail": "Ordena tu plata en 2027",
    "form": "webinar-enero",
    "tags": ["Webinar"],
    "consent": { "email": true, "sms": false }
  }'
# → {"ok":true,"created":true}   ·   401 sin clave · 400 {"ok":false,"error":"invalid","fields":["email"]} · 413 muy grande
```

- `source`: `webinar`, `diagnostico` o `web` (por defecto `web`). Con `diagnostico` además deja "Hizo el diagnóstico".
- `consent.email` / `consent.sms`: **solo `true` si la persona marcó la casilla** (desmarcada por defecto) en ese formulario.
  Queda con fecha y fuente `form:<source>`. El SMS exige `phone`. Nunca se retira un consentimiento desde aquí.
- Un correo que ya existe solo se completa (nombre, teléfono, país o zona si faltaban); no cambia su origen.
- `form` (o `sourceDetail`) identifica el formulario para el disparador "Llenó un formulario web".
- Campos desconocidos → 400 (no se aceptan montos ni nada fuera de la lista).

## Webhook de Resend (abiertos, clics, rebotes, quejas)

1. Resend → Domains → el dominio → activar **Open tracking** y **Click tracking** (sin eso no hay "Abrieron" ni "Hicieron clic").
2. Resend → Webhooks → Add endpoint: `https://app.revoluciondeldinero.com/api/crm/resend`, eventos `email.delivered`,
   `email.opened`, `email.clicked`, `email.bounced`, `email.complained`.
3. Copia el **Signing secret** (`whsec_…`) en `RESEND_WEBHOOK_SECRET` (Vercel, producción).
4. Un rebote o una queja suprimen la dirección; una queja además la da de baja. Los correos que no son del CRM se ignoran.

## Twilio (SMS)

1. Compra un número (o un Messaging Service) que pueda enviar SMS a Australia; en Australia conviene registrar un
   **Alphanumeric Sender ID** o usar un número dedicado.
2. Variables: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (número E.164 o el SID `MG…` del Messaging Service).
3. Phone Numbers → el número (o Messaging Service → Integration) → "A message comes in": **Webhook**, `POST`,
   `https://app.revoluciondeldinero.com/api/crm/twilio`. Si la URL pública es otra, ponla igual en `TWILIO_WEBHOOK_URL`
   (la firma se calcula sobre esa URL exacta).
4. Deja activo **Advanced Opt-Out** de Twilio: Twilio contesta STOP/START; la app solo registra la baja o el alta.
5. Fuera de producción solo salen SMS a los números de `SMS_TEST_NUMBERS`.

## Cómo se cumple la Spam Act 2003 (y la casilla desmarcada)

- **Consentimiento:** todo lo que manda el CRM es marketing y exige consentimiento expreso por canal. Casillas desmarcadas en
  el registro ("Quiero recibir novedades y clases por correo") y en los formularios; interruptores en Perfil › Notificaciones
  ("Novedades de Revolución del Dinero" = correo; "Avisos por SMS" pide el teléfono con código de país). Cada consentimiento
  guarda fecha y fuente. Los avisos de la cuenta (pagos, seguridad, acceso) siguen por `src/lib/email` y no dependen de esto.
- **Identificación del remitente:** remitente claro (`CRM_EMAIL_FROM`, p. ej. `Jonathan · Revolución 360 <hola@…>`) y en el
  pie: Revolución del Dinero · razón social, ABN · dirección (`app_config.legal`, Admin › Contenido por país). Sin esos datos
  reales no sale ningún correo de marketing (`legal_incomplete`) y no se puede confirmar una campaña.
- **Baja funcional:** cada correo lleva "Darte de baja" (un clic, sin entrar) y `List-Unsubscribe` + `List-Unsubscribe-Post`
  (Gmail y Apple Mail muestran "Darse de baja"), más "Elegir qué correos recibo". La baja es inmediata (se revisa justo antes
  de cada envío; la ley da 5 días hábiles). Cada SMS empieza con "Revolución 360:" y termina con "Responde STOP para no
  recibir más."
- **Sin datos financieros:** el CRM nunca guarda ni muestra montos, movimientos, cuentas ni deudas.

## Variables nuevas (`.env.example`)

| Variable | Para qué | Si falta |
|---|---|---|
| `CRM_EMAIL_FROM` | Remitente del marketing (`Jonathan · Revolución 360 <hola@revoluciondeldinero.com>`) | Usa `EMAIL_FROM` |
| `CRM_REPLY_TO` | Responder a (opcional) | Sin Reply-To |
| `CRM_INGEST_KEY` | Clave de `POST /api/crm/ingest` (larga, al azar: `openssl rand -hex 32`) | La API responde 503 |
| `RESEND_WEBHOOK_SECRET` | Firma del webhook de Resend (`whsec_…`) | El webhook responde 503: sin abiertos ni clics |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM` | SMS | Los SMS quedan en la cola con `missing_twilio_config` |
| `TWILIO_WEBHOOK_URL` | URL pública del webhook de Twilio si no es `NEXT_PUBLIC_APP_URL/api/crm/twilio` | Usa esa |
| `SMS_TEST_NUMBERS` | Números E.164 (separados por coma) que sí reciben SMS fuera de producción | Fuera de producción no sale ningún SMS |
| `CRM_EMAIL_BATCH` / `CRM_SMS_BATCH` | Correos / SMS por corrida (150 / 50) | Esos valores |

`CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM` y `SUPABASE_SERVICE_ROLE_KEY` ya existían.

## Funciones de servidor para las pantallas del panel (`@/server/crm`)

Componentes de cliente: importa textos y formas desde `@/lib/crm/schema` y `@/lib/crm/labels` (el barril `@/lib/crm`
también sirve, pero `@/lib/crm/sign` usa `node:crypto` y es solo de servidor).

Todas reciben el cliente de la **sesión del Dueño**: `const db = untypedDb(s.supabase)` (la base impone que solo el Dueño lea
y escriba `crm_*`). Lanzan `Error` con un código corto (`invalid`, `not_found`, `exists`, `phone`, `not_editable`,
`legal_incomplete`, `in_the_past`) que la acción traduce a un texto. Textos comunes en `@/lib/crm` (`STAGE_LABELS`,
`SOURCE_LABELS`, `TRIGGER_LABELS`, `triggerLabel`, `EVENT_LABELS`, `CRM_FOOTNOTE`, `AUDIENCE_PRESETS`).

**Contactos (AdminCRM)**
```ts
getSummary(db): Promise<{ contacts; newWeek; leadsNoAccount; marketingPct; unsubscribed30d }>
listContacts(db, { q?, stage?: Stage | null, tagId?, limit?, offset? }): Promise<{ rows: ContactListItem[]; total }>  // con tagId, rows[].tagIds trae solo esa etiqueta
getContact(db, id): Promise<{ contact: ContactRow; tagIds; events: { kind; ref; at }[]; enrollments }>   // etapa = contact.stage
createContact(db, { email, name?, phone?, country?, timezone?, locale?, tagIds? }): Promise<string>     // "+ Contacto"
importContacts(db, rows[], { tagIds?, consentSource? }): Promise<{ created; updated; invalid; consentSkipped }>  // "Importar CSV" (filas ya leídas); nunca vuelve a suscribir a quien se dio de baja
listTags(db) · createTag(db, name) · addContactTag(db, contactId, tagId) · removeContactTag(db, contactId, tagId)
setContactConsent(db, contactId, "email" | "sms", on)
enrollContact(db, contactId, automationId): Promise<boolean>                                             // "Agregar a automatización"
sendToContact(db, contactId, { subject, preheader, blocks }): Promise<string>                            // "Enviar un correo"
```
**Campañas (AdminCampanas)**
```ts
listCampaigns(db, limit?): Promise<CampaignListItem[]>               // "Tus campañas" (sin bloques, las más nuevas primero)
getCampaign(db, id): Promise<CampaignRow | null>                     // la campaña abierta en el editor
countAudience(db, audience): Promise<number>                         // "612 personas · solo quienes aceptaron recibir correos"
saveCampaign(db, { id?, name?, subject, preheader, audience, blocks, sendMode: "now" | "local", scheduledLocal: "2026-12-01T07:00" | null }): Promise<string>
confirmCampaign(db, id)                                              // "Confirmar envío"
cancelCampaign(db, id)
previewEmail(db, { subject, preheader, blocks, locale?, name? }): Promise<{ from; subject; preheader; html; legalReady }>  // iframe srcDoc
sendTestEmail(db, { subject, preheader, blocks, locale?, name? }, to): Promise<"sent" | "skipped" | "failed">            // "Enviar prueba"
campaignRates(campaign): { opened; clicked } | null                  // "Abrieron" / "Hicieron clic"
```
**Automatizaciones (AdminAuto)**
```ts
listAutomations(db): Promise<(AutomationRow & { activeCount })[]>    // "412 dentro"
saveAutomation(db, { id?, name, trigger, steps, exitRules }): Promise<string>  // "invalid_tag" si un paso usa una etiqueta de sistema o inexistente
setAutomationStatus(db, id, "active" | "paused" | "draft")           // "Pausar" / activar
```
Formas en `@/lib/crm`: `AudienceSchema`, `BlocksSchema` (heading, text, image, button, lesson, divider, signature),
`TriggerSchema`, `StepsSchema` (wait, email, sms, condition {check, yes, no}, tag, exit), `ExitRulesSchema`.

## Pantallas del panel

`/admin/crm` (Contactos), `/admin/campanas` (Campañas de correo) y `/admin/automatizaciones` son una sola sección `crm` en
`src/app/admin/actividad/roles.ts` (solo el Dueño; `sectionOf` une las tres rutas). Cada acción pasa por
`adminAction(…, "crm")` y deja su línea en el registro (`crm_*`, solo ids y conteos: nunca asuntos, textos ni correos).
Si la migración 036 no está aplicada, las tres pantallas muestran "El CRM aún no está listo" en vez de fallar.
Importar CSV lee el archivo en el navegador y lo manda en tandas de 100 (máximo 1,000 filas); el consentimiento solo
entra en las filas con "sí" y con la constancia escrita.
