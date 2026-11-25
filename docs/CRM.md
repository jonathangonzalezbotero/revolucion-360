# CRM: contactos, campañas de correo, automatizaciones y SMS

Decisiones de Jonathan (25 nov 2026, `docs/plan-de-implementacion.md` › CRM): el CRM vive dentro del panel (`/admin`), solo
lo de los mockups `AdminCRM`, `AdminCampanas` y `AdminAuto`; correo con Resend y SMS con Twilio; cada usuario de la app es
también un contacto; el CRM guarda contacto, etiquetas, consentimiento y eventos de uso, **nunca montos** (regla 4);
marketing solo con consentimiento; la cola la procesa una ruta de la app que Supabase llama cada 10 minutos; solo el Dueño
usa el CRM.

```
supabase/migrations/20261125000038_conexiones.sql  conexiones, lo que va llegando, confirmaciones pendientes, campos extra, transaccional
supabase/migrations/20261125000036_crm.sql   tablas crm_* (incl. constancia de consentimiento), funciones, disparadores perfil → contacto y correo confirmado → contacto, contactos de las cuentas confirmadas que ya existen
src/lib/crm/                                 PURO (probado en tests/crm.test.ts): formas (zod), etapas, consentimiento, horas por zona,
                                             teléfono E.164, automatizaciones, correo y SMS, firmas de webhooks, textos
src/server/crm/                              servidor: crmEvent, motor (runCrm), cola, Twilio, conexiones web (connections.ts), funciones para el panel
src/app/api/crm/run                          motor (CRON_SECRET), lo llama pg_cron cada 10 min
src/app/api/crm/conexiones/[slug]            Conexiones web: formularios de las páginas (navegador + Turnstile, o servidor + clave de la conexión)
src/app/api/crm/confirmar                    "Pedir confirmación por correo" de una conexión (GET muestra el botón, POST confirma)
src/app/api/crm/ingest                       RETIRADA (410): la reemplazan las Conexiones web
src/app/admin/conexiones                     pantalla "Conexiones web" (mockup AdminConexiones) + "Importar desde systeme.io"
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
| `crm_suppressions` | Correos y teléfonos a los que nunca se manda marketing: baja, rebote, queja, STOP o a mano. Sobrevive al contacto. Solo un alta explícita de la persona levanta una baja / STOP / a mano (ver "Reglas de consentimiento"); un rebote o una queja **nunca** se levantan ni cambian de motivo. |
| `crm_consent_log` | **Constancia** (solo inserción): cada alta, baja o alta rechazada de marketing. Canal, acción `on`/`off`, `applied`, fuente, fecha, `value_hash` (SHA-256 del correo o teléfono en minúsculas, no el dato en claro), `contact_id` informativo **sin llave foránea** (sobrevive al borrado del contacto y de la cuenta) y `evidence` (texto de la casilla, URL, IP, navegador, formulario, fecha de confirmación; solo lo que llegue, máx. 2 KB). El Dueño solo la lee; nadie la cambia ni la borra (permisos revocados + disparador `append_only`). |
| `crm_connections` (038) | Conexiones web: `slug` (parte final de la dirección; no cambia nunca: lo impone el disparador `crm_connection_slug_fixed`), nombre, etiquetas que pone (`tag_ids`), estado `active` / `paused`, páginas permitidas (`origins`), página de gracias, "Pedir confirmación por correo" (`double_opt_in`, apagado por defecto) y la **clave secreta** (`rk_live_…`; solo el Dueño la lee, a pedido). |
| `crm_connection_log` (038) | "Lo que va llegando": un renglón por envío aceptado (creado, actualizado, sin consentimiento, de baja, pendiente de confirmar, confirmación frenada por el límite (`throttled`), confirmado, prueba) con el id del contacto (sin correos en claro); los rechazos (también `rejected_rate`) se agrupan por hora en un contador. |
| `crm_pending_confirmations` (038) | Envíos que esperan el clic de confirmación: SHA-256 del token, **HMAC-SHA-256 del correo con `CRM_HASH_KEY`** (sin la clave nadie prueba un correo contra la tabla), lo que llegó (`payload`, se vacía al confirmar o a los 7 días), vencimiento. Las filas nunca se borran (regla 0): solo quedan los hashes. |
| `crm_contacts.fields` (038) | Campos extra que llegan de los formularios (p. ej. `partners_name`, `partners_phone`, `ciudad`): texto corto, máx. 20, **nunca montos**. |
| `crm_automations.transactional`, `crm_messages.transactional` (038) | Automatización "De una compra o un acceso (transaccional)" y cada mensaje que salió así. CHECK: transaccional solo con los disparadores `first_month_paid`, `student_code`, `web_connection`, `email_confirmed`, `tag_added`; un mensaje transaccional siempre viene de una automatización (nunca de una campaña). |
| `crm_inbound_sms` | `MessageSid` de los SMS entrantes ya procesados (sin número ni texto): un reintento de Twilio no se procesa dos veces. |

Funciones:

| Función | Quién | Para qué |
|---|---|---|
| `crm_summary()` | Dueño | Tarjetas de Contactos: contactos, +semana, leads sin cuenta, % que acepta marketing, bajas 30 días. |
| `crm_automation_counts()` | Dueño | "N dentro" de cada automatización. |
| `crm_set_consent(contacto, canal, sí/no, fuente, evidencia?) → 'ok' \| 'suppressed'` | Dueño o servidor | Puerta del panel (y de importar CSV). **Nunca** levanta una baja ni una supresión. |
| `crm_set_my_consent(email, sms, teléfono) → { email, sms }` / `crm_my_consent()` | El usuario (su fila) | Perfil › Notificaciones. Correo: levanta su baja; SMS: no levanta un STOP. |
| `crm_audience(público, después_de?, límite?)` / `crm_audience_count(público)` | Dueño o servidor | Público de una campaña sin duplicados (EXISTS por etiqueta) y sin direcciones suprimidas. |
| `crm_link_user(usuario)` | Servidor | Crea o une el contacto de un usuario (por `user_id`, si no por correo). **null si el correo no está confirmado.** |
| `crm_apply_consent(contacto, canal, sí/no, fuente, p_lift = false, evidencia?) → 'ok' \| 'suppressed'`, `crm_claim_messages`, `crm_refresh_campaigns`, `crm_message_event`, `crm_sms_inbound` | Solo clave de servicio | Consentimiento, tomar la cola de forma atómica, conteos, eventos de Resend, STOP/START de Twilio. |
| `crm_connection_stats()` (038) | Dueño | "Contactos" (distintos, sin el de prueba) y "Último" de cada conexión. |
| `crm_connection_reject(conexión, vía, motivo)` (038) | Solo clave de servicio | Suma un rechazo al contador de esa hora. |
| `crm_hash`, `crm_log_consent`, `crm_signup_confirmed` | Solo dentro de otras funciones | Hash de la constancia, escribirla, contacto + casilla del registro de un usuario confirmado. |

**Usuario → contacto solo con el correo confirmado.** Una cuenta sin confirmar podría ser de alguien que escribió un correo
ajeno; por eso `crm_link_user` devuelve null (no crea contacto ni une un lead por correo) mientras
`auth.users.email_confirmed_at` sea null. Todo pasa por esa función (disparadores, `crmEvent`, Perfil, el respaldo del motor),
así que esa es la única puerta.

- Disparador `crm_on_profile` en `profiles`:
  - **al crear el perfil**: si el correo ya viene confirmado (OAuth, cuenta creada por el admin), crea o une el contacto,
    deja "Creó su cuenta" y, si marcó la casilla del registro, el consentimiento de correo (fuente `registro`). Si no está
    confirmado, no hace nada y espera la confirmación.
  - **al cambiar el correo** (`profiles.email` lo copia `sync_auth_user` desde Auth cuando se confirma el cambio): si otro
    contacto ya tiene ese correo, el contacto conserva el anterior (es único) y se le **apaga el consentimiento de correo**
    (ya no es su dirección) con un aviso `crm_on_profile: email_conflict` en el log, sin datos personales; si no hay
    conflicto, toma el correo nuevo y conserva el consentimiento **solo si el cambio vino confirmado** (el correo nuevo es el
    de `auth.users` y está confirmado). Lo que se apaga queda en la constancia (`cambio_correo_conflicto` /
    `cambio_correo_sin_confirmar`).
- Disparador `crm_on_email_confirmed` en `auth.users` (`after update of email_confirmed_at`, solo cuando pasa de null a
  una fecha; mismo patrón que `on_auth_user_created` de la 002 y `on_auth_user_updated` de la 020): crea o une el contacto,
  deja "Creó su cuenta" y aplica la casilla del registro (alta explícita: levanta una baja anterior, nunca un rebote ni una
  queja; constancia con el texto de la casilla y la fecha de confirmación).
- Ninguno de los dos tumba el registro ni la confirmación: `begin … exception when others` → aviso en el log con el
  SQLSTATE. El respaldo del motor (`reconcile`, cuentas de los últimos 3 días sin contacto) solo une a los confirmados.
- La migración también crea, una sola vez, el contacto de cada cuenta que ya existe **con el correo confirmado** (sin
  consentimiento: nunca lo dio).

## Reglas de consentimiento (revisión de seguridad del 25 nov 2026)

Decisiones de Jonathan: los leads de formularios web entran **sin doble confirmación** (la casilla marcada basta) y el
teléfono que llega con el consentimiento se toma como **verificado** (lo verifican sus formularios; no hay código por SMS).
El **clic de confirmación por correo** de una conexión con "Pedir confirmación" sí levanta una baja de correo que **pidió la
propia persona** (decisión del 25 nov 2026: el clic desde su propio correo demuestra que es suya y que lo quiere): solo una
supresión `unsubscribe` (o una baja propia del contacto). **Nunca** una baja `manual` (la puso el Dueño), un rebote, una
queja ni un STOP. Va con la fuente `confirma:<slug>` y `p_lift = true`; `crm_apply_consent` reconoce esa fuente.

**Quién levanta una baja** (`crm_apply_consent(…, p_lift)`): una alta con supresión activa (o con baja propia del contacto)
solo se aplica si `p_lift = true`, y solo pasan `true` las altas explícitas de la persona. Un rebote o una queja **nunca**
se levantan, ni con `p_lift`. Un **STOP** solo lo levanta START / UNSTOP de Twilio (`p_source = 'sms_start'`): ni Perfil ni
preferencias, aunque pasen `p_lift`. Así apagar y volver a prender el SMS en Perfil funciona, pero un STOP no se borra
desde la web (la persona responde START).

| Origen del alta | `p_lift` | Si está dado de baja |
|---|---|---|
| Perfil › correo (`crm_set_my_consent`) | true | Se levanta la baja (no un rebote ni una queja: se le explica) |
| Perfil › SMS | true | Se levanta una baja hecha en Perfil o preferencias; **no un STOP**: "responde START a ese mismo número" |
| Preferencias por token › correo | true | Se levanta la baja |
| Preferencias por token › SMS | true | Igual que Perfil |
| START / UNSTOP de Twilio | true (solo SMS) | Solo si el contacto había dado de baja los SMS (STOP o baja) |
| Registro confirmado (casilla) | true | Se levanta la baja |
| Conexiones web (navegador o servidor) | false | `suppressed`: no marca nada |
| Clic de confirmación de una conexión (`confirma:<slug>`) | true (solo correo) | Se levanta solo una baja que pidió la persona (`unsubscribe`); una baja `manual`, un rebote, una queja o un STOP → `suppressed` |
| Importar desde systeme.io con constancia | false | `suppressed` (y quien estaba de baja allá entra de baja aquí) |
| Importar CSV con constancia | false | `suppressed`: cuenta en "omitidos" (también una dirección suprimida **sin contacto todavía**: la supresión se busca por dirección, no por contacto) |
| Panel (`setContactConsent`) | false | Lanza `suppressed` |

- **Bajas** (`p_on = false`): apagan, dejan la supresión y el evento. El `on conflict` de `crm_suppressions` nunca cambia el
  motivo si ya es `bounce` o `complaint` (tampoco en `crm_message_event` ni en STOP), ni convierte un STOP activo en una
  baja que se pueda levantar desde Perfil.
- **SMS en el ingreso de leads** (`ingestSmsDecision`, probado): solo se marca para el `phone` de la petición y si es el que
  queda en el contacto. Contacto sin número → se le pone ese y sí. Mismo número → sí. **Otro número → no se pisa en
  silencio y no se marca SMS** (`phone_conflict`: podría ser un número ajeno escrito en el formulario); el número lo cambia
  la persona en Perfil (al cambiarlo se apaga el SMS del anterior) o el Dueño a mano.
- **Constancia** (`crm_consent_log`): `crm_apply_consent` la escribe **siempre**, también cuando rechaza un alta
  (`applied = false`). El ingreso acepta `evidence` opcional (`text`, `url`, `ip`, `userAgent`); el registro guarda el texto
  de la casilla; importar CSV, la constancia escrita por el Dueño. Para consultar si alguien aceptó: SQL del Dueño con
  `public.crm_hash('correo@x.com')`. Se menciona en la política de privacidad (Privacidad › 2 y 4).
- **Avisos de cobro:** pago fallido (`sendPaymentFailedNow`) y fin del primer mes (`sendFirstMonthEndingNow`) son correos
  de la cuenta de `src/lib/email` y salen sin importar el consentimiento de marketing. Una automatización del CRM con los
  disparadores `payment_failed` o `charge_upcoming` es **marketing opcional** (exige consentimiento): nunca reemplaza esos
  avisos. La renovación anual no tiene aviso transaccional propio; si hace falta, va en `src/lib/email`, no en el CRM.

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
| `web_form` | Llenó un formulario web (solo automatizaciones viejas; el editor ya no lo ofrece) | `POST /api/crm/ingest` (retirada) |
| `web_connection` | Llegó por una conexión web (con la conexión como parámetro; ref = id de la conexión + fecha) | `POST /api/crm/conexiones/<slug>` y la confirmación |
| `email_confirmed` | Confirmó su correo (con la conexión como parámetro) | `POST /api/crm/confirmar` (clic en el correo de confirmación de una conexión) |
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
6. Envía la cola. **Justo antes de cada envío** revisa consentimiento, baja, supresión y que la campaña no esté
   cancelada ni la automatización inactiva (pausada, en borrador o borrada): esos mensajes quedan `skipped` con
   `campaign_cancelled` / `automation_inactive` y **no se vuelven a encolar solos** (la cola es única por origen y
   contacto: si reactivas la automatización, quien ya pasó ese paso no lo recibe). Al encolar también se relee el estado
   por lote (campañas y automatizaciones). Cada mensaje va en su propio try/catch: si algo falla con uno, queda `failed`
   con `engine_<SQLSTATE>` y la tanda sigue. Correo con Resend
   (`sendEmailDetailed`, misma regla: fuera de producción solo a `@revolucion360.test`), con llave de idempotencia = id del
   mensaje. SMS con Twilio por REST, nunca de noche (9:00–20:00 en su hora) y **nunca si no se sabe su hora** (ni la zona del
   contacto ni la de su país: sin el respaldo de Sydney; `no_timezone`). Reintentos: 3 intentos (10, 20 min); un SMS sin
   respuesta de Twilio no se reintenta solo (Twilio no deduplica). Un correo que quedó `sending` (corrida cortada) se
   rescata solo con menos de 5 intentos y programado hace menos de 20 horas (la llave de idempotencia de Resend dura 24 h);
   si no, queda `failed` con `stuck`. Lotes: 150 correos y 50 SMS por corrida
   (`CRM_EMAIL_BATCH`, `CRM_SMS_BATCH`), presupuesto de 4 minutos.

Si falta configuración, los mensajes **quedan en la cola** con el motivo en `crm_messages.error`:
`missing_resend_api_key`, `legal_incomplete` (faltan razón social, ABN de 11 dígitos o dirección en Contenido por país),
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

## API de ingreso de leads (RETIRADA el 25 nov 2026)

> **Decisión:** todo entra por las **Conexiones web** (abajo). `/api/crm/ingest` y su clave global `CRM_INGEST_KEY` se
> retiraron: la ruta responde **410** (`{"ok":false,"error":"gone"}`) para que un llamador viejo lo note. Nadie la usaba
> todavía (la web seguía con systeme.io). Una clave por conexión es mejor que una global: se cambia una sin tocar las
> demás, cada página tiene su registro y su pausa. Lo que sigue es solo historia de cómo funcionaba.

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
    "consent": { "email": true, "sms": false },
    "evidence": { "text": "Quiero recibir novedades y clases por correo", "url": "https://revoluciondeldinero.com/webinar", "ip": "203.0.113.7", "userAgent": "Mozilla/5.0 …" }
  }'
# → {"ok":true}   ·   401 sin clave · 400 {"ok":false,"error":"invalid","fields":["email"]} · 413 muy grande · 429 demasiadas
```

- `source`: `webinar`, `diagnostico` o `web` (por defecto `web`). Con `diagnostico` además deja "Hizo el diagnóstico".
- `consent.email` / `consent.sms`: **solo `true` si la persona marcó la casilla** (desmarcada por defecto) en ese formulario.
  Sin doble confirmación (decisión de Jonathan). Queda con fecha, fuente `form:<source>` y su constancia. Nunca se retira
  un consentimiento desde aquí, y **nunca levanta una baja**: si la dirección o el número están dados de baja, rebotaron o
  se quejaron, no se marca nada (la respuesta no lo dice).
- `consent.sms` exige `phone` y que sea el número que queda en el contacto (ver "Reglas de consentimiento"): si el
  contacto ya tenía otro número, no se cambia ni se marca SMS.
- `evidence` (opcional): `text` (texto exacto de la casilla), `url`, `ip`, `userAgent`. Se guarda en `crm_consent_log`.
- La respuesta es siempre `{"ok":true}`: no dice si el correo ya existía (no se puede usar para averiguar quién es contacto).
- Límite de frecuencia **en memoria** de cada instancia de Vercel (429): 20 intentos **sin clave válida** por minuto por IP
  (quien intenta adivinarla) y 600 peticiones por minuto en total con la clave (una clave filtrada). El límite por IP solo
  cuenta los fallidos porque el llamador legítimo es un servidor: todos los leads llegan desde la misma IP. No es exacto
  entre instancias ni sobrevive a un reinicio. Si la web manda más de eso, se sube en `src/app/api/crm/ingest/route.ts`.
- `tags`: se buscan por nombre **exacto** (sin importar mayúsculas; `%`, `_` y `*` no son comodines) y se crean si no existen.
- Un correo que ya existe solo se completa (nombre, teléfono, país o zona si faltaban); no cambia su origen.
- `form` (o `sourceDetail`) identifica el formulario para el disparador "Llenó un formulario web".
- Campos desconocidos → 400 (no se aceptan montos ni nada fuera de la lista).

## Webhook de Resend (abiertos, clics, rebotes, quejas)

1. Resend → Domains → el dominio → activar **Open tracking** y **Click tracking** (sin eso no hay "Abrieron" ni "Hicieron clic").
2. Resend → Webhooks → Add endpoint: `https://app.revoluciondeldinero.com/api/crm/resend`, eventos `email.delivered`,
   `email.opened`, `email.clicked`, `email.bounced`, `email.complained`.
3. Copia el **Signing secret** (`whsec_…`) en `RESEND_WEBHOOK_SECRET` (Vercel, producción).
4. Un rebote o una queja suprimen la dirección; una queja además la da de baja. Esa supresión nunca cambia de motivo ni la
   levanta un alta. Los correos que no son del CRM se ignoran. Cuerpo de máximo 64 KB (se corta antes de verificar la firma).

## Twilio (SMS)

1. Compra un número (o un Messaging Service) que pueda enviar SMS a Australia; en Australia conviene registrar un
   **Alphanumeric Sender ID** o usar un número dedicado.
2. Variables: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (número E.164 o el SID `MG…` del Messaging Service).
3. Phone Numbers → el número (o Messaging Service → Integration) → "A message comes in": **Webhook**, `POST`,
   `https://app.revoluciondeldinero.com/api/crm/twilio`. Si la URL pública es otra, ponla igual en `TWILIO_WEBHOOK_URL`
   (la firma se calcula sobre esa URL exacta).
4. Deja activo **Advanced Opt-Out** de Twilio: Twilio contesta STOP/START; la app solo registra la baja o el alta.
   Altas: solo `START` y `UNSTOP` (no `YES` ni `ALTA`), y solo reactivan a quien antes dio de baja los SMS (STOP o baja);
   a nadie más le dan consentimiento. Cada `MessageSid` se guarda (`crm_inbound_sms`) en la misma transacción que el cambio:
   un reintento de Twilio no se procesa dos veces. Cuerpo de máximo 64 KB antes de verificar la firma.
5. Fuera de producción solo salen SMS a los números de `SMS_TEST_NUMBERS`.

## Cómo se cumple la Spam Act 2003 (y la casilla desmarcada)

- **Consentimiento:** todo lo que manda el CRM es marketing y exige consentimiento expreso por canal, **salvo** los correos de
  una automatización marcada "De una compra o un acceso (transaccional)" (ver "Automatizaciones transaccionales", abajo). Casillas desmarcadas en
  el registro ("Quiero recibir novedades y clases por correo") y en los formularios; interruptores en Perfil › Notificaciones
  ("Novedades de Revolución del Dinero" = correo; "Avisos por SMS" pide el teléfono con código de país). Cada consentimiento
  guarda fecha, fuente y su constancia (`crm_consent_log`). Los avisos de la cuenta (pagos, seguridad, acceso) siguen por
  `src/lib/email` y no dependen de esto.
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
| `CRM_INGEST_KEY` | **Obsoleta**: `/api/crm/ingest` se retiró (responde 410) | — |
| `TURNSTILE_SECRET_KEY` | Clave **secreta** de Cloudflare Turnstile (la del sitio se guarda en el panel, `app_config.turnstile`) | Todo envío desde el navegador se rechaza (los de servidor con clave siguen) |
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
`legal_incomplete`, `in_the_past`, `suppressed`) que la acción traduce a un texto. Textos comunes en `@/lib/crm` (`STAGE_LABELS`,
`SOURCE_LABELS`, `TRIGGER_LABELS`, `triggerLabel`, `EVENT_LABELS`, `CRM_FOOTNOTE`, `AUDIENCE_PRESETS`).

**Contactos (AdminCRM)**
```ts
getSummary(db): Promise<{ contacts; newWeek; leadsNoAccount; marketingPct; unsubscribed30d }>
listContacts(db, { q?, stage?: Stage | null, tagId?, limit?, offset? }): Promise<{ rows: ContactListItem[]; total }>  // con tagId, rows[].tagIds trae solo esa etiqueta
getContact(db, id): Promise<{ contact: ContactAdminRow; tagIds; events: { kind; ref; at }[]; enrollments }>   // etapa = contact.stage; SIN token (nunca viaja al navegador)
createContact(db, { email, name?, phone?, country?, timezone?, locale?, tagIds? }): Promise<string>     // "+ Contacto"
importContacts(db, rows[], { tagIds?, consentSource? }): Promise<{ created; updated; invalid; consentSkipped }>  // "Importar CSV" (filas ya leídas); nunca vuelve a suscribir una dirección suprimida o dada de baja (exista o no el contacto)
listTags(db) · createTag(db, name) · addContactTag(db, contactId, tagId) · removeContactTag(db, contactId, tagId)
setContactConsent(db, contactId, "email" | "sms", on)                                                      // un alta con baja activa lanza "suppressed"
enrollContact(db, contactId, automationId): Promise<boolean>                                             // "Agregar a automatización"
sendToContact(db, contactId, { subject, preheader, blocks }): Promise<string>                            // "Enviar un correo"
```
**Campañas (AdminCampanas)**
```ts
listCampaigns(db, limit?): Promise<CampaignListItem[]>               // "Tus campañas" (sin bloques, las más nuevas primero)
getCampaign(db, id): Promise<CampaignRow | null>                     // la campaña abierta en el editor
countAudience(db, audience): Promise<number>                         // "612 personas · solo quienes aceptaron recibir correos" (sin duplicados ni suprimidos)
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

`/admin/crm` (Contactos), `/admin/campanas` (Campañas de correo), `/admin/automatizaciones` y `/admin/conexiones` (Conexiones web) son una sola sección `crm` en
`src/app/admin/actividad/roles.ts` (solo el Dueño; `sectionOf` une las tres rutas). Cada acción pasa por
`adminAction(…, "crm")` y deja su línea en el registro (`crm_*`, solo ids y conteos: nunca asuntos, textos ni correos).
Si la migración 036 no está aplicada, las tres pantallas muestran "El CRM aún no está listo" en vez de fallar.
Importar CSV lee el archivo en el navegador y lo manda en tandas de 100 (máximo 1,000 filas); el consentimiento solo
entra en las filas con "sí" y con la constancia escrita.

## Conexiones web (Admin › Conexiones web, mockup AdminConexiones)

Decisiones de Jonathan (25 nov 2026, `docs/plan-de-implementacion.md` › "Conexiones web y la web revoluciondeldinero.com").
Migración `20261125000038_conexiones.sql` (solo agrega; depende de la 036). Código: `src/lib/crm/connections.ts` (puro,
`tests/conexiones.test.ts`), `src/server/crm/connections.ts`, `src/app/api/crm/conexiones/[slug]`, `src/app/api/crm/confirmar`,
`src/app/admin/conexiones`.

Cada conexión tiene: nombre, **dirección POST propia** (`https://app.revoluciondeldinero.com/api/crm/conexiones/<slug>`; el
slug sale del nombre y no cambia), etiquetas que pone, estado (activa / pausada), páginas permitidas, página de gracias
(opcional), "Pedir confirmación por correo" (opcional, **apagado** por defecto) y una **clave secreta** (`rk_live_…`) para
enviar desde un servidor (en el panel se ve enmascarada; "Mostrar" y "Copiar" la piden al servidor en ese momento y quedan
en el registro sin la clave; "Cambiar clave" la regenera y la anterior deja de servir).

### Dos formas de enviar

| | Desde el navegador (formulario HTML o `fetch`) | Desde un servidor (la web actual) |
|---|---|---|
| Autenticación | Comprobante de **Cloudflare Turnstile** (`cf-turnstile-response`) verificado en el servidor con `TURNSTILE_SECRET_KEY`, y que el dominio donde se resolvió sea de las páginas permitidas | `Authorization: Bearer <clave secreta de la conexión>`. Sin Turnstile. Una clave equivocada es **401** (nunca se cae a la forma del navegador) |
| Origen | `Origin` (o `Referer`) https dentro de las **páginas permitidas** (`revoluciondeldinero.com` = ese dominio y `www.`; `*.revoluciondeldinero.com` = sus subdominios; el comodín **no** se acepta sobre un sufijo público donde cualquiera tiene página: `*.vercel.app`, `*.github.io`, `*.netlify.app`, `*.co.uk`, `*.com.au`…, `PUBLIC_SUFFIXES` en `src/lib/crm/connections.ts`). Si no, 403 | No se revisa |
| Formato | `application/x-www-form-urlencoded` (un `<form>` normal) o JSON. `multipart/form-data` no | JSON |
| Etiquetas | Solo las de la conexión | Las de la conexión + `tags` (por nombre; se crean si no existen) y `removeTags` (se quitan **antes** de poner) |
| Datos del contacto | **Solo llena lo vacío** (cualquiera puede escribir cualquier correo en una página pública) | `mode: "upsert"` (por defecto: reemplaza nombre, país y zona) o `"fill"` (solo vacíos: check-in) |
| Respuesta | 303 a la página de gracias de la conexión (o una página simple "¡Listo!"); JSON `{ "ok": true }` si se mandó JSON o `Accept: application/json` (con CORS para las páginas permitidas, y `OPTIONS`) | JSON `{ "ok": true }` |
| Límite (en memoria, por instancia) | 30 envíos por minuto por IP y 60 por minuto por conexión (todas las IPs; se cuentan después de Turnstile) | 600 por minuto por conexión; 20 intentos con clave equivocada por minuto por IP |

Cuerpo de máximo 8 KB. Errores: 400 `email` / `invalid`, 401 `unauthorized`, 403 `origin` / `antibot` / `paused`, 404, 413,
429 `rate`, 500 `server`. La respuesta **nunca** dice si el correo ya existía ni si estaba de baja.

**Campos que se reconocen** (español del mockup, inglés y los de systeme.io): `correo`/`email` (obligatorio), `nombre`/`name`
o `first_name` + `surname`/`apellido`, `telefono`/`phone`/`phone_number`, `pais`/`country` (código de 2 letras; si llega
"Australia" queda como campo extra `pais`), `zona`/`timezone`, `idioma`/`locale`, `acepta_correos` y `acepta_sms` (`true`,
`on`, `1`, `si`). **`acepta_sms` desde el navegador se ignora** (decisión de Jonathan, 25 nov 2026): cualquiera puede escribir
cualquier número en una página pública y el número no se verifica, así que el SMS solo se acepta **con la clave del
servidor** (`acepta_sms` o `consent.sms`). El correo sí se acepta desde el navegador sin confirmación (la casilla basta).
Cualquier otro campo es un **campo extra** del contacto (`crm_contacts.fields`): clave en minúsculas `a-z0-9_`, texto de
máx. 200, máx. 20. **Nunca montos** (`MONEY_WORDS` / `looksLikeMoney`, probado en `tests/conexiones.test.ts`):
- Se rechaza la clave si **contiene** una palabra de dinero en español o inglés (`amount`, `monto`, `precio`, `price`,
  `total`, `pago`, `pay`, `fee`, `cost`, `saldo`, `valor`, `value`, `usd`, `aud`…), también en camelCase o sin separadores
  (`precioEntrada`, `ticketprice`). Costo aceptado: algunas claves inocentes también caen (`feedback` y `coffee` contienen
  `fee`; `audiencia`, `aud`; `valoracion`, `valor`; `totalmente`, `total`).
- Se rechaza el valor si es un número puro de 3 o más cifras (`150`, `1500.50`), con separadores de miles (`1.500`,
  `1,500,000`, `2 500`) o con símbolo o palabra de moneda (`$10`, `20 AUD`, `10 dólares`). Excepción: en claves de teléfono
  o código postal (`*_phone`, `telefono`, `celular`, `whatsapp`, `postcode`, `zip`…) un número es un número
  (`partners_phone: "0412345678"` se guarda). En cualquier otra clave, un teléfono va con `+` (`+61412345678`).
Solo desde el servidor: `fields` (objeto), `tags`, `removeTags`, `mode`, `consent: { email, sms }` y
`evidence: { text, url, ip, userAgent }`.

### Reglas que aplica siempre

- Une por correo (minúsculas): **no duplica**; si ya existe, agrega las etiquetas nuevas. Si ese correo tiene cuenta en la
  app, es el mismo contacto (su nombre es el de su perfil: una conexión nunca lo reemplaza).
- **Teléfono:** solo se pone si el contacto no tenía (regla del ingreso: un número distinto nunca se pisa en silencio). El
  SMS se marca solo para ese número (`ingestSmsDecision`).
- **Consentimiento:** solo con `acepta_correos: true` (casilla **desmarcada** por defecto en el código para pegar). Pasa por
  `crm_apply_consent` con `p_lift = false` y su constancia (texto de la casilla, URL, IP y navegador; desde el navegador
  los pone el servidor, no el formulario; fuente `conexion:<slug>`). Sin la casilla, el contacto se guarda pero no recibe
  marketing. **Quien se dio de baja sigue de baja** aunque vuelva a llenar un formulario (ni rebote ni queja se levantan
  nunca).
- Deja **"Llegó por una conexión web"** (`web_connection`, con la conexión) y, por cada etiqueta nueva, **"Se le puso una
  etiqueta"**: arrancan las automatizaciones que esperan eso.
- Pausada: todo envío se rechaza (403) y queda en "Lo que va llegando".
- En el panel, si ninguna automatización **activa** arranca con sus etiquetas, "Llegó por una conexión web" o "Confirmó su
  correo" de esa conexión, aparece el aviso "Ninguna automatización usa estas etiquetas todavía" con "Crear una".

### "Pedir confirmación por correo" (opcional por conexión)

Si está prendido, **nada se aplica** (ni contacto, ni etiquetas, ni eventos) hasta el clic: se guarda lo que llegó
(`crm_pending_confirmations`, solo el hash del token) y sale un correo **transaccional** "Confirma tu correo" (remitente y
datos legales, sin baja de marketing) con el enlace `/api/crm/confirmar?t=…`. El GET muestra un botón (los antivirus
abren los enlaces: abrirlo no confirma); el POST del botón aplica todo como un envío más y deja **"Confirmó su correo"**
(`email_confirmed`, con la conexión), que es el disparador para estas conexiones. Contra el abuso: máx. un correo cada 10
minutos y 3 por día por dirección, **máx. 200 correos de confirmación por hora en total** (`CONFIRM_PER_HOUR`, contado en la
base: vale entre instancias de Vercel), nunca a una dirección con rebote o queja, y sin los datos legales completos no sale.
"Lo que va llegando" distingue *pendiente de confirmar* (se guardó; el correo sale si están los datos legales y el remitente), *frenada por el límite* (`throttled`) y *no enviada por rebote
o queja* (`suppressed` sin contacto); en las dos últimas no se guarda nada. La huella del correo para el límite es un
**HMAC-SHA-256 con `CRM_HASH_KEY`** (variable del servidor, `.env.example`; mín. 32 caracteres): **sin esa variable la
confirmación no guarda nada ni sale (falla cerrado, responde 500)**: hay que ponerla en Vercel antes de prender "Pedir
confirmación por correo". El enlace vence en 7 días; el motor vacía lo que llegó de quien nunca confirmó; las filas nunca se borran (regla 0), solo quedan los hashes.
El clic **sí** levanta una baja de correo que pidió la persona (`unsubscribe`), nunca una `manual`, un rebote, una queja
ni un STOP (ver "Quién levanta una baja"). El token del enlace nunca sale en el `Referer` ni en un iframe (la página y la
ruta mandan `Referrer-Policy: no-referrer` y `X-Frame-Options: DENY`).

### "Enviar contacto de prueba"

Crea o actualiza `prueba+<slug>@revolucion360.test` con las etiquetas de la conexión y deja "Llegó por una conexión web"
(así se ve qué automatización lo inscribe). **Nunca recibe nada**: el motor salta ese correo (`test_contact`) aunque la
automatización sea transaccional. No cuenta en "Contactos".

### Cómo conectar una página nueva (desde el navegador)

1. Cloudflare → Turnstile → Add widget (gratis): dominio `revoluciondeldinero.com` (y los que hagan falta), modo
   "Managed". Copia la **clave del sitio** en Admin › Conexiones web › Ajustes anti-bots y la **clave secreta** en Vercel
   (producción) como `TURNSTILE_SECRET_KEY`.
2. Admin › Conexiones web › "+ Nueva conexión": nombre (p. ej. "Webinar enero 2027"), etiquetas, "+ Página" con el
   dominio donde va el formulario y, si quieres, la página de gracias.
3. "Copiar código" y pégalo en la página. Se puede cambiar el diseño y agregar campos; no se quita la línea `cf-turnstile`.
4. "Enviar contacto de prueba", y en Automatizaciones una con "Se le puso una etiqueta" (o "Llegó por una conexión web") y
   esa conexión. Llena el formulario real una vez y mira "Lo que va llegando".

Con `fetch` (JSON) en vez de un `<form>`: manda el token de Turnstile en `cf-turnstile-response` y
`Content-Type: application/json`; la respuesta es `{ "ok": true }`.

### Cómo cambiar la web actual (`website/api/_lib/systeme.js` → Revolución 360)

Hoy cada función de la web llama a systeme.io desde su servidor. El cambio es directo: una llamada a una conexión con su
clave, **desde el servidor** (sin Turnstile: la web ya filtra spam con `antiSpam.js`). Recomendado: una conexión por
formulario (Evento, Bootcamp, Círculo, Check-in) **sin etiquetas propias en la conexión** (la web manda las suyas en
`tags`, como hoy), cada una con su clave en una variable de Vercel de la web. Como el registro y el pago del evento llegan
por la misma conexión, sus automatizaciones deben arrancar con **"Se le puso una etiqueta"** (p. ej.
`evento-septiembre-2026`), no con "Llegó por una conexión web" (que pasa en los dos). Los formularios suman la casilla de
marketing **desmarcada** (`acepta_correos`): sin ella nadie recibe marketing, solo lo transaccional.

```js
// website/api/_lib/crm360.js — reemplaza a systeme.js. Solo en el servidor: la clave nunca va al navegador.
const BASE = 'https://app.revoluciondeldinero.com/api/crm/conexiones';

// Una sola llamada hace lo que hoy son upsertContact + addTagByName + removeTagByName (+ fillEmptyContactFields).
// Nunca lanza: un problema del CRM no frena la inscripción ni el pago (igual que hoy con systeme.io).
async function sendToCrm(slug, keyEnv, payload) {
  const key = process.env[keyEnv];
  if (!key) { console.error('crm360: falta', keyEnv); return false; }
  try {
    const res = await fetch(`${BASE}/${slug}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: 'es', ...payload }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error('crm360', slug, res.status, (await res.text().catch(() => '')).slice(0, 200));
    return res.ok;
  } catch (err) {
    console.error('crm360', slug, err && err.name);
    return false;
  }
}

// Campos extra (nunca montos): los mismos slugs que hoy en systeme.io.
const partnerFields = (amigoNombre, amigoTel) => ({
  ...(amigoNombre ? { partners_name: amigoNombre } : {}),
  ...(amigoTel ? { partners_phone: amigoTel } : {}),
});

// Constancia del consentimiento: solo si la persona marcó la casilla en el formulario.
const consentOf = (req, aceptaCorreos, texto) => aceptaCorreos ? {
  consent: { email: true },
  evidence: { text: texto, url: req.headers.referer || '', ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim(), userAgent: req.headers['user-agent'] || '' },
} : {};

module.exports = { sendToCrm, partnerFields, consentOf };
```

Cómo queda cada caso (mismas etiquetas que hoy):

```js
const { sendToCrm, partnerFields, consentOf } = require('./crm360');
const TEXTO = 'Quiero recibir correos de Revolución del Dinero';

// evento-lead.js (llenó el formulario, aún no paga): upsert + etiqueta "no pago" + acompañante.
await sendToCrm('evento-sept-2026', 'R360_KEY_EVENTO', {
  email, name: nombre, phone, fields: partnerFields(amigoNombre, amigoTel),
  tags: ['evento-sept-2026-no-pago'], ...consentOf(req, aceptaCorreos, TEXTO),
});

// stripe-webhook (pagó el evento): etiqueta del evento + tipo de entrada, y QUITA "no pago" en la misma llamada.
await sendToCrm('evento-sept-2026', 'R360_KEY_EVENTO', {
  email, name, phone, fields: partnerFields(amigoNombre, amigoTel),
  tags: ['evento-septiembre-2026', tierTag], removeTags: ['evento-sept-2026-no-pago'],
});

// bootcamp y círculo: upsert + su etiqueta (la automatización de acceso va marcada como transaccional en 360).
await sendToCrm('bootcamp-nov-2026', 'R360_KEY_BOOTCAMP', { email, name, phone, fields: partnerFields(amigoNombre, amigoTel), tags: ['bootcamp-nov-2026'] });
await sendToCrm('circulo', 'R360_KEY_CIRCULO', { email, name, phone, fields: partnerFields(amigoNombre, amigoTel), tags: ['acceso-comunidad'] });

// checkin.js: SOLO llena vacíos (lo que se escribe en la puerta nunca pisa los datos del registro) + asistencia.
await sendToCrm('checkin-evento', 'R360_KEY_CHECKIN', { email, name, phone, mode: 'fill', tags: ['asistencia-evento'] });
```

Notas: `name` puede ir completo (o `first_name` + `surname`, como hoy); el teléfono va en E.164 (`+61…`) o con `country`
(`"AU"`). Ojo con `circulo-lead.js`: hoy pone `acceso-comunidad` **antes** del pago (plan › "Revisar"); al cambiar a 360 esa
etiqueta debería ir solo en el webhook del pago, porque arranca el acceso.

### Importar desde systeme.io

"Importar desde systeme.io" (Conexiones web): el CSV de systeme.io (Contacts → Export) se lee en el navegador; se adivinan
las columnas (`email`, `first_name`, `surname`, `phone_number`, `tags` separadas por coma, `unsubscribed`, consentimiento y
fecha de alta) y el Dueño las puede cambiar con vista previa. Tandas de 200, hasta 20,000 filas.
- Une por correo; completa nombre y teléfono si faltan; la **fecha de alta** solo en contactos nuevos; origen "Importado ·
  systeme.io".
- Crea las etiquetas que falten y las pone **sin disparar automatizaciones** (el evento queda en el historial ya
  procesado): importar no le manda nada a nadie, ni lo transaccional.
- **Dado de baja allá** (`true`, `1`, `yes` o una fecha) → `crm_set_consent(off)`: entra con supresión "baja" y su
  constancia; nunca recibe marketing. La baja gana sobre cualquier columna de consentimiento.
- **Consentimiento de marketing:** ninguno, salvo que el CSV traiga una columna explícita con "sí" **y** el Dueño escriba la
  constancia (de dónde y cuándo aceptaron); nunca levanta una baja (como Importar en Contactos).

## Automatizaciones transaccionales (criterio legal)

Decisión de Jonathan (25 nov 2026). En el editor de Automatizaciones, el interruptor **"De una compra o un acceso
(transaccional)"** (`crm_automations.transactional`).

**Criterio (Spam Act 2003, Australia):** un mensaje electrónico comercial exige consentimiento; un mensaje cuyo propósito es
completar una transacción que la persona ya pidió (su entrada, su acceso a Skool, la confirmación de su inscripción, el
enlace de confirmar su correo) no es un mensaje comercial, o es un mensaje "designado" de solo información factual (Anexo 1
de la ley): no necesita consentimiento ni enlace de baja, pero **sí** debe identificar al remitente (razón social, ABN,
dirección). Conviene que el abogado lo confirme junto con el borrador legal. Deja de serlo si lleva contenido promocional: por eso
estos correos **no pueden llevar ofertas, descuentos, "compra también…" ni nada que invite a comprar otra cosa** (el editor
lo advierte). En la duda, es marketing.

Cuándo se puede prender (decisión de Jonathan, 25 nov 2026; lo valida `AutomationInput` en el servidor, el editor y un
CHECK en la base):
- **Solo con los disparadores** "Pagó su primer mes" (`first_month_paid`), "Entró con código de alumno" (`student_code`),
  "Llegó por una conexión web" (`web_connection`), "Confirmó su correo" (`email_confirmed`) y "Se le puso una etiqueta"
  (`tag_added`, el que usan el **acceso a Skool** y la **entrada del evento**). Con otro disparador el interruptor no se
  puede prender (el editor lo explica).
- **Solo bloques** título, texto, botón, separador y firma (sin imágenes ni clases de la Academia), también dentro de las
  ramas de una condición. El editor solo ofrece esos bloques mientras está prendido.
- Si una automatización guardada no cumple (p. ej. editada a mano), el motor la trata como marketing.

Cómo lo aplica el motor:
- Al encolar, cada mensaje queda con `transactional = true` si la automatización lo era; al enviar se exige que **siga**
  marcada como transaccional (si Jonathan la desmarca, lo que esté en la cola sale como marketing, con consentimiento).
- **Sale aunque no haya consentimiento de marketing y aunque la persona se haya dado de baja del marketing**; **nunca** si
  la dirección rebotó o se quejó (supresión dura), ni al contacto de prueba de una conexión.
- El correo no lleva "Darte de baja" ni "Elegir qué correos recibo" ni `List-Unsubscribe`; sí el remitente
  (`CRM_EMAIL_FROM`) y la línea legal, y dice "Recibes este correo por una compra, una inscripción o un acceso que pediste.
  No es publicidad." Sin los datos legales completos no sale (`legal_incomplete`), como todo correo del CRM.
- Darse de baja del marketing **no** saca a nadie de una automatización transaccional.
- **SMS:** siguen exigiendo consentimiento aunque la automatización sea transaccional (decisión conservadora: no hay un
  caso de SMS de acceso todavía).
- Todo lo demás (campañas y automatizaciones sin el interruptor) exige consentimiento como siempre.
