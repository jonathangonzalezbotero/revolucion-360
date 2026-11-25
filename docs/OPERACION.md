# Operación: correos, tareas programadas, app instalable, respaldos y monitoreo

## Variables de entorno
Todas viven en `.env` (local, apunta a la base de producción) y en Vercel → Project → Settings → Environment Variables (producción y previews). Nunca en el repositorio.

| Variable | Para qué | Si falta |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Enlaces y logo de los correos (`https://app.revoluciondeldinero.com`) | Usa ese dominio por defecto |
| `RESEND_API_KEY` | Enviar correos con Resend | No se envía nada; queda un aviso en el registro (sin datos personales) y el correo se reintenta en la siguiente corrida |
| `EMAIL_FROM` | Remitente, ej. `Revolución 360 <hola@revoluciondeldinero.com>` (dominio verificado en Resend) | No se envía nada |
| `CRON_SECRET` | Protege `/api/cron/*` (`Authorization: Bearer …`). Vercel lo manda solo en sus tareas programadas | Las tareas responden 401 a todo |
| `SUPABASE_SERVICE_ROLE_KEY` | Las tareas usan `createAdminClient()` (no tienen sesión) | Fallan |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Notificaciones push. Generar con `npx web-push generate-vapid-keys` | El botón "Activar notificaciones" no aparece y no se manda push |

**Seguridad de los correos:** solo en producción de Vercel (`VERCEL_ENV=production`) salen correos a cualquier dirección.
En local y en previews solo salen a `@revolucion360.test` (los usuarios de demostración); cualquier otra dirección se salta sin registrar el envío.
Ningún correo lleva montos ni datos financieros (lo comprueba `tests/correos.test.ts`).

## Verificar el dominio en Resend
1. Resend → Domains → Add domain → `revoluciondeldinero.com` (región más cercana a Sydney disponible).
2. Copia los registros DNS que muestra (SPF `TXT`, DKIM `CNAME`/`TXT` y, si lo pide, `MX` del subdominio de rebotes) en el DNS del dominio.
3. Agrega DMARC si no existe: `TXT _dmarc  v=DMARC1; p=none; rua=mailto:dmarc@revoluciondeldinero.com` (subir a `quarantine` cuando todo esté estable).
4. Espera el estado **Verified** en Resend. Crea una API key con permiso "Sending access" solo para ese dominio y ponla en `RESEND_API_KEY` en Vercel (producción).
5. Pon `EMAIL_FROM="Revolución 360 <hola@revoluciondeldinero.com>"`.
6. Prueba: con un usuario de prueba real en producción, revisa que el correo de bienvenida llegue a la bandeja principal y que los enlaces apunten a `app.revoluciondeldinero.com`.

## Correos automáticos (`src/lib/email/`)
| Correo | Tarea | Cuándo | Preferencias |
|---|---|---|---|
| Bienvenida | `bienvenida` | Correo confirmado, cuenta de los últimos 14 días, sin `email_log` kind `welcome` | Siempre (más notificación si el canal lo permite) |
| Recordatorio de cierre | `cierre` | `prefs.close_day`: `last` = desde que empiezan los últimos 10 días del mes; `first` = días 1 a 5 del mes siguiente. En la zona horaria del usuario. Mes sin cerrar y la sección Cierre encendida | `prefs.notify.close` y `prefs.channel` |
| Acceso por vencer | `vencimientos` | Alumno con `access_until` a 8–30 días (aviso "30") y a 1–7 días (aviso "7") | `prefs.channel` |
| Pago fallido | `pagos` | `payment_failed_at` de los últimos 7 días, uno por fallo | Siempre: es un correo importante de la cuenta (no se puede desactivar) |
| Acceso gratis | — (lo manda el panel) | Al dar acceso de alumno o fundador con la casilla "Avisarles por correo" marcada. Uno por acceso y día; máximo 50 por acción | Siempre: es un correo de la cuenta |
| 5 · Fin del primer mes | — (lo manda el aviso de Stripe) | Al llegar `customer.subscription.trial_will_end` (3 días antes de que termine el primer mes de $1 y se cobren $8). Uno por suscripción y fin de prueba (`email_log` kind `first_month_ending`) más un aviso en la app | Siempre: avisa un cobro. Se apaga solo con `app_config.billing.notify_first_charge = false` (`/admin/planes`) |

Cada envío se reserva primero en `email_log (user_id, kind, ref)` (único): nunca sale dos veces. Si el envío falla, la reserva se suelta y se reintenta.
Cada aviso en la app usa `notifications.dedupe`. Los textos están en `src/lib/email/messages.ts` (español del mockup e inglés según `profiles.locale`).

## Tareas programadas (`vercel.json`, horarios en UTC)
| Ruta | Horario | Qué hace |
|---|---|---|
| `/api/cron/bienvenida` | `0 23 * * *` (diario, 10:00 en Sydney) | Correo de bienvenida |
| `/api/cron/pagos` | `30 23 * * *` (diario, 10:30 en Sydney) | Correo de pago fallido (la notificación ya la crea el aviso de Stripe) |
| `/api/cron/vencimientos` | `0 20 * * *` (7:00 en Sydney en verano) | Avisos 30/7 días; prueba vieja vencida, alumno o fundador vencido → solo lectura (o a otro acceso gratis vigente); pago vencido sin suscripción activa en Stripe → solo lectura |
| `/api/cron/cierre` | `0 22 * * *` (9:00 en Sydney en verano) | Recordatorio de cierre |
| `/api/cron/borrados` | `0 16 * * *` | Borra las cuentas con solicitud de borrado vencida (`auth.admin.deleteUser`, cascada) y deja constancia en `admin_audit` (`borrado_automatico`) |
| `/api/cron/racha` | `0 21 * * 1` (lunes; martes 8:00 en Sydney, lunes en América) | Notificación "Tu racha se puede salvar" (no gasta el comodín) |
| `/api/cron/habito?run=1` · `?run=2` · `?run=3` | `0 2 * * *`, `0 14 * * *` y `0 22 * * *` (tres tareas diarias) | Avisos del hábito (en la app + push): cierre (último día del mes) → "mañana se paga X" → repaso (domingo) → "hoy puedes gastar". Máximo **uno al día** por persona (`habit_sends`, único por día local) y **nunca de noche** (21:00 a 8:00 en su hora): cada corrida se salta a quien está de noche. 02:00 y 14:00 UTC están a 12 h, así que toda zona horaria cae de día en al menos una; 22:00 es la mañana de Sydney. Cada persona elige cuáles recibe en Perfil (`prefs.habit`) |

Todas procesan de a 500, son idempotentes y devuelven un JSON con conteos. Ninguna lee montos.
**Límite de Resend:** Resend limita los envíos por segundo (2 por segundo en el plan inicial). Si frena un envío, se espera y se reintenta hasta 2 veces; si aun así falla, el correo queda para la siguiente corrida. Con muchos usuarios, pedir a Resend un límite mayor.
**Cuándo sale cada correo:**
- **Bienvenida:** en el momento en que el usuario confirma su correo (`/auth/confirm`) o entra por primera vez con Google/Apple (`/auth/callback`).
- **Pago fallido:** en el momento en que llega el aviso `invoice.payment_failed` de Stripe (`/api/stripe/webhook`).
- **Fin del primer mes (5):** en el momento en que llega `customer.subscription.trial_will_end` (hay que agregar ese evento al webhook en Stripe).
- **Recordatorio de cierre** y **acceso por vencer:** dependen de la fecha, no de una acción; por eso sí son tareas diarias.
- Las tareas `bienvenida` y `pagos` quedan solo como **red de seguridad** diaria: reintentan los correos que no salieron en su momento. `email_log` impide que alguien reciba el mismo correo dos veces.

### Probar cada tarea en local
Con `npm run dev` corriendo y `CRON_SECRET=local-cron-secret` en `.env`:
```bash
curl -s -H "Authorization: Bearer local-cron-secret" http://localhost:3000/api/cron/bienvenida | jq
curl -s -H "Authorization: Bearer local-cron-secret" http://localhost:3000/api/cron/cierre | jq
curl -s -H "Authorization: Bearer local-cron-secret" http://localhost:3000/api/cron/vencimientos | jq
curl -s -H "Authorization: Bearer local-cron-secret" http://localhost:3000/api/cron/pagos | jq
curl -s -H "Authorization: Bearer local-cron-secret" http://localhost:3000/api/cron/racha | jq
curl -s -H "Authorization: Bearer local-cron-secret" "http://localhost:3000/api/cron/habito?run=1" | jq
curl -s -H "Authorization: Bearer local-cron-secret" http://localhost:3000/api/cron/borrados | jq   # ¡borra cuentas de verdad en la base local!
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/cron/cierre                     # sin clave → 401
```
Correr dos veces seguidas debe dar `sent: 0` / `notified: 0` la segunda vez (idempotencia).
Con `RESEND_API_KEY` en `.env` los correos salen de verdad, pero solo a `@revolucion360.test`. Para no enviar nada, deja `RESEND_API_KEY` vacía.
Para forzar casos: en Supabase Studio local (http://127.0.0.1:54323) cambia `entitlements.access_until`, `payment_failed_at`, `profiles.prefs` o `privacy_requests.due_at` del usuario de demostración.

## App instalable (PWA) y push
- `public/manifest.webmanifest`: nombre, colores tinta (`#141612`) y papel (`#F6F5F0`), `display: standalone`, `start_url: /inicio`.
- Íconos en `public/icons/` (192, 512 y 512 *maskable* con margen de color papel) generados con `sips` desde `public/brand/sello.png`:
  ```bash
  sips -z 192 192 public/brand/sello.png --out public/icons/icon-192.png
  sips -z 512 512 public/brand/sello.png --out public/icons/icon-512.png
  sips -z 180 180 public/brand/sello.png --out public/icons/apple-touch-icon.png
  sips -z 380 380 public/brand/sello.png --out /tmp/m.png && sips -p 512 512 --padColor F6F5F0 /tmp/m.png --out public/icons/maskable-512.png
  ```
  **Pendiente:** el ícono cuadrado definitivo lo elige Jonathan. El sello original mide 265 px, así que el de 512 se ve algo borroso. Cuando esté el definitivo (mínimo 1024 px), se regeneran con los mismos comandos.
- `public/sw.js`: guarda solo `/sin-conexion` y su cascarón; red primero para lo demás; nunca guarda `/api/*` ni páginas. Recibe `push` y al tocar la notificación abre su enlace interno.
- `src/components/pwa/Pwa.tsx`: `<PwaRegister />` registra el service worker (solo en producción) y `<PwaPrompts locale>` ofrece "Instalar la app" y "Activar notificaciones" (guarda la suscripción vía `POST /api/push/subscribe`).
- **Push:** el paquete `web-push` no está instalado. Hasta que se instale, las tareas crean la notificación en la app pero no mandan push. Para activarlo: `npm i web-push`, generar las claves VAPID y, en `src/lib/email/push.ts`, cambiar la carga dinámica por `import webpush from "web-push"` (así Vercel lo incluye en el paquete).

## Respaldos de Supabase y prueba de restauración
- **Diarios:** el plan Pro de Supabase hace un respaldo diario automático (se guardan 7 días). Activar además **Point-in-Time Recovery** (complemento) para poder volver a cualquier minuto de los últimos días.
- **Copia propia semanal** (fuera de Supabase), desde una máquina de confianza:
  ```bash
  supabase db dump --db-url "$DATABASE_URL" -f respaldo-$(date +%F).sql            # esquema
  supabase db dump --db-url "$DATABASE_URL" --data-only -f datos-$(date +%F).sql  # datos
  ```
  Guardar cifrado (ej. `gpg -c`) en un almacenamiento con acceso restringido. Contiene datos financieros: nunca en el repositorio ni en el correo.
- **Prueba de restauración (una vez al mes, y siempre antes de abrir al público):**
  1. Crear un proyecto de Supabase temporal (o `supabase start` local).
  2. Restaurar: `psql "$DB_TEMPORAL" -f respaldo-AAAA-MM-DD.sql && psql "$DB_TEMPORAL" -f datos-AAAA-MM-DD.sql` (o, en el panel, "Restore to new project" desde un respaldo diario o PITR).
  3. Comprobar: número de filas de `profiles`, `transactions` y `plan_cells` igual al de producción en esa fecha; entrar con un usuario de prueba y ver su plan.
  4. Anotar fecha, duración y resultado. Borrar el proyecto temporal.

## Monitoreo
- **Tareas programadas:** Vercel → Project → Cron Jobs muestra cada corrida y su código. Cada tarea registra `[cron:<nombre>]` en los Logs si falla (sin datos personales). Revisar a diario la primera semana.
- **Alertas:** Vercel → Observability / Log Drains → alerta si hay respuestas 500 en `/api/cron/*` o en `/api/stripe/webhook`.
- **Correos:** Resend → Emails / Logs (entregados, rebotes, quejas). Si los rebotes pasan del 2% o hay quejas, revisar el dominio y el contenido.
- **Base de datos:** Supabase → Reports (uso de CPU, conexiones) y Logs. Activar alertas de uso del plan.
- **Stripe:** Developers → Webhooks → reintentos fallidos.
- Los errores nunca llevan montos ni datos personales (regla 11 de `CLAUDE.md`).
