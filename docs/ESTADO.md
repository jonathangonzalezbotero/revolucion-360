# Estado del desarrollo

Actualizado: 24 de noviembre de 2026. Todo el código está en `main` en GitHub.

## Resumen
- Construido: la app completa del usuario (31 rutas), Stripe, importar CSV y el panel de administración parte 1. Los correos, tareas programadas y app instalable están en esta misma entrega (ver abajo su estado exacto).
- **Verificado de verdad:** el motor de cálculo y las reglas de negocio (pruebas), los permisos de la base (pruebas contra Supabase local), y en el navegador: registro con confirmación por correo, entrar, Inicio (escritorio y móvil), Plan anual y Detalle del mes.
- **Sin ver en el navegador todavía:** todo lo demás. Cada pantalla pasa tipos, linter y sus pruebas de cálculo, pero sus formularios y acciones no se han ejecutado en pantalla. **Lo siguiente es recorrer la app (lista abajo) y arreglar lo que aparezca.**
- Los datos de prueba (usuario demo) reproducen el plan 2026 del mockup: Inicio debe mostrar en noviembre "te sobra $95", entra $6,418, sale $6,323, falta por pagar $2,040.

## Pantallas

| Ruta | Mockup | Estado |
|---|---|---|
| `/registro`, `/entrar`, `/recuperar`, `/verificar`, `/nueva-clave`, `/dos-pasos` | Acceso | ✅ probado en navegador (registro, confirmar, entrar) |
| `/bienvenida`, `/asistente` | Onboarding, PlanGuiado | Construido, sin probar en pantalla |
| `/inicio` | Main, Inicio-movil, Vacio | ✅ probado (escritorio y móvil) |
| `/plan`, `/plan/mes/[mes]` | Plan, Presupuesto | ✅ se ven bien; falta probar editar celdas y agregar línea |
| `/movimientos`, `/movimientos/importar` | Movimientos, Importar | Construido, sin probar |
| `/cuentas`, `/metas` | Cuentas, Metas | Construido, sin probar |
| `/proyeccion`, `/analisis` | Forecast, Analisis, Bloqueo | Construido, sin probar |
| `/deudas`, `/inversiones` | Deudas, Inversiones | Construido, sin probar |
| `/cierre`, `/diagnostico` | Cierre, Diagnostico | Construido, sin probar |
| `/academia`, `/academia/[curso]`, `/academia/[curso]/[clase]` | Academia, Leccion | Construido, sin probar |
| `/suscripcion` + `/api/stripe/*` | Suscripcion | Construido; sin claves de prueba de Stripe no cobra (lo explica en pantalla) |
| `/perfil`, `/notificaciones`, `/ayuda`, `/mas` | Perfil, Notificaciones, Ayuda, Mas-movil | Construido; las 5 pantallas cargan con el usuario demo |
| `/legal/terminos`, `/legal/privacidad` | Legal | Construido (borrador para abogado) |
| `/admin`, `/admin/usuarios`, `/admin/usuarios/[id]`, `/admin/grupos`, `/admin/soporte`, `/admin/actividad` | Admin, AdminUsuarios, AdminUsuario, AdminSoporte, AdminActividad | Construido (parte 1), sin probar; mejoras en 3b |
| `/admin/menu`, `/admin/academia`, `/admin/planes`, `/admin/paises` | AdminMenu, AdminAcademia, AdminPlanes, AdminPaises | **❌ Falta construir** (parte 2; ver brief abajo) |
| Correos, `/api/cron/*`, PWA, push | Correos | Ver sección "Correos y app instalable" |

## Lo que falta, en orden

### 1. Poner al día la base local (con Docker encendido)
```bash
npx supabase start
npx supabase migration up     # aplica las migraciones nuevas sin borrar datos
npm run db:types
npm run typecheck && npm test # incluye las pruebas de permisos
```
Si `migration up` se queja de que una migración va "antes de la última", renómbrala con un número mayor al último aplicado (el orden importa) o usa `npx supabase db reset` y luego `npm run seed:demo` (borra los datos locales).
Migraciones que pueden estar sin aplicar en tu base local: las que traigan los módulos de admin (`…023_admin.sql`) y correos (`…024_correos.sql`), si existen.

### 2. Recorrer la app en el navegador (escritorio 1440 y móvil 390, comparando con `docs/mockup`)
Con `demo@revolucion360.test`:
1. Plan anual: editar una celda, agregar una línea semanal, editar frecuencia (aviso de celdas manuales), quitar línea.
2. Detalle del mes: "Pendiente" → "Pagado · a mano" y deshacer.
3. Movimientos: los 3 niveles, registrar a mano, editar, dividir, unir a una línea, regla, recurrente, eliminar.
4. Importar CSV: un extracto real de Ubank y de NAB (con duplicados).
5. Cuentas (saldo y aviso de diferencia, transferencia), Metas (crear, aportar, cumplir, agregar al plan).
6. Cierre de noviembre completo (4 pasos) → debe dar +30 puntos una sola vez; reabrir y volver a cerrar → 0 puntos.
7. Diagnóstico, Proyección (escenarios), Análisis (vigilados), Deudas (pagar hasta $0), Inversiones.
8. Academia: ver una clase, marcarla, comentar. Perfil: cambiar idioma a inglés y revisar varias pantallas; activar 2 pasos; exportar datos.
9. Con un usuario nuevo (registrarse): bienvenida → asistente → plan → Inicio de usuario nuevo (estados vacíos).
10. Con `admin@revolucion360.test`: `/admin` y cada sección; dar acceso de alumno al demo; confirmar que el panel no muestra montos.
11. Solo lectura: en Studio pon `entitlements.state = 'read_only'` al demo y comprueba que se ve todo y no se puede editar.

### 3. Panel de administración, parte 2 (falta construir)
Rutas `src/app/admin/menu/`, `academia/`, `planes/`, `paises/`, reutilizando el layout y `src/app/admin/_shared/` de la parte 1. Mockups `AdminMenu`, `AdminAcademia`, `AdminPlanes`, `AdminPaises`. Todo con `requireAdmin()`, registrar cada cambio con `admin_log`, nunca ver montos.
- **Menú y funciones:** `app_config.menu` (cada sección visible / próximamente / oculta), `app_config.features` (Gratis o Pro), `app_config.flags` (CSV, comercios, remesas, multimoneda), `limits.free_goals`, `gamification_enabled`, `admin_mfa_required`, puntos (`points`) y niveles (`levels`).
- **Academia:** cursos (`courses`: crear, editar, portada, etapa, tier, prioridad del diagnóstico, borrador / programado con `publish_at` / publicado), módulos, clases (`lessons`: título, descripción, duración, puntos, `cta_screen`, tier, obligatoria, orden) y su video en `lesson_media.video_url`; moderar `lesson_comments` (`hidden_at`). Portadas: hoy son URLs (las de `public/cursos/`); subir archivos necesitaría Supabase Storage.
- **Planes y precios:** `price_regions` (montos por región, descuento de alumno), prueba gratis (`app_config.trial`), cupones (`coupons`; crearlos también en Stripe con `src/lib/stripe.ts`, y el script `scripts/stripe-setup.ts` sincroniza precios), acceso fundador.
- **Contenido por país:** `countries` (moneda, zona horaria, frecuencia de pago sugerida, términos locales, categorías sugeridas, referencias del diagnóstico `benchmarks`, habilitar), y `app_config.diag_cta` (texto y enlace de la clase gratuita del Diagnóstico) y `app_config.legal` (razón social, ABN, contacto).
Para construirlo con Claude Code: pídele que lea `docs/BRIEF-AGENTES.md` y estos cuatro mockups.

### 3b. Mejoras pendientes del panel (parte 1)
- Función de base `admin_emails(uuid[])` para traer correos en lote (hoy se piden de a uno con `admin_user`; pesado con miles de usuarios).
- `admin_users`: filtro por rol y por país, búsqueda exacta por correo, y opción de 7 días en el filtro "vencen pronto" (el resumen cuenta 7 días y el filtro 30).
- Función para "dónde más abandonan" en la Academia (hoy dice "Sin datos aún").
- Del mockup quedaron fuera (sin función detrás): "Cambiar a Pro pagado", "Cerrar sesiones", "Enviarle sus datos", "Avisarles por correo" al dar acceso, subroles de admin y dispositivo del último acceso.
- Borrar una cuenta desde el panel es inmediato (el mockup decía 30 días; el borrado programado de 30 días es el que pide el usuario desde su perfil).
- Probar en vivo: reiniciar 2 pasos, borrar cuenta, responder soporte (notificación) y el filtro del registro de actividad.

### Correos, tareas programadas y app instalable
- Construido y sin ejecutar: 4 correos (`src/lib/email/`), crons en `src/app/api/cron/*` (horarios en `vercel.json`), PWA (`public/manifest.webmanifest`, `public/sw.js`, `public/icons/`) y push (`/api/push/subscribe`).
- Probar en local con Supabase y `npm run dev`: `curl -H "Authorization: Bearer local-cron-secret" http://localhost:3000/api/cron/bienvenida` (y `cierre`, `vencimientos`, `pagos`, `borrados`, `racha`). Fuera de producción solo se envían correos a `@revolucion360.test`.
- Push: generar claves con `npx web-push generate-vapid-keys` y ponerlas en `NEXT_PUBLIC_VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`.
- El borrado automático cancela la suscripción de Stripe antes de borrar la cuenta.
- Detalles en `docs/OPERACION.md`.

### 4. Inglés
Todos los textos tienen versión `en` en los `messages.ts` de cada pantalla. Falta probar el cambio de idioma de punta a punta (Perfil → idioma; las pantallas de acceso leen la cookie `r360_locale`) y revisar el tono de las traducciones.

### 5. Publicar
1. Cambiar las claves que se compartieron en el chat (Stripe, Resend, webhook, contraseña de la base).
2. Stripe en **modo prueba** en `.env.local` (`sk_test_`, `pk_test_`), correr `scripts/stripe-setup.ts` y probar un pago (ver `docs/STRIPE.md`).
3. Supabase producción: pegar `anon` y `service_role` en `.env.production.local`; `npx supabase link --project-ref rzfaseleufqbfxyrcgyz` y `npx supabase db push`. Pegar las plantillas de `supabase/templates/` en Authentication → Emails; activar MFA (TOTP); poner la URL del sitio y las de redirección; contraseña mínima 8.
4. En producción NO correr `seed.sql` (desactiva los 2 pasos de admin) ni `seed:demo`. Crear tu usuario y darle `role = 'admin'` desde el SQL Editor.
5. Resend: verificar el dominio `revoluciondeldinero.com`.
6. Vercel: importar el repo, región Sydney (`syd1`), copiar las variables de `.env.production.local`, `CRON_SECRET`, dominio `app.revoluciondeldinero.com`. El webhook de Stripe apunta a `https://app.revoluciondeldinero.com/api/stripe/webhook`.
7. Respaldos diarios y prueba de restauración (ver `docs/OPERACION.md`).

### 6. Contenido tuyo
Videos de las clases (mínimo el curso "Empieza aquí"), tu foto y tu frase para la pantalla de entrar (`src/app/(auth)/messages.ts`), precios por región, razón social y ABN, revisión legal, ícono cuadrado de la app (hoy se usa el sello).

## Cosas conocidas (no son errores, pero hay que decidir)
- La foto de perfil, sesiones activas, adjuntar capturas en soporte y el resumen semanal no existen (no hay almacenamiento ni esa función).
- Los videos de YouTube deben ser "no listados" (los privados no se pueden insertar). Mux solo con playback público.
- Cancelar Pro o dejar de pagar deja la cuenta en **solo lectura** (regla del plan); la prueba gratis y el acceso de alumno vencidos pasan a Gratis.
- La transferencia entre cuentas hace 3 escrituras seguidas (no es atómica).
- El export de datos arma todo en memoria; con mucho historial podría pasar el límite de respuesta de Vercel.
- Varias pantallas no traen mockup móvil propio (Importar CSV, curso de la Academia): el diseño móvil se hizo siguiendo el sistema.

## Cómo seguir con Claude Code
- `CLAUDE.md` tiene las reglas innegociables; `docs/ARQUITECTURA.md` la forma de cada pantalla; `docs/BRIEF-AGENTES.md` las instrucciones para construir una pantalla.
- Pantallas de referencia bien hechas para copiar: `src/app/(app)/inicio/` y `src/app/(auth)/`.
- Cambios de base: un archivo nuevo en `supabase/migrations/` con número mayor al último, con RLS (ver `…002_security.sql`), luego `migration up` y `db:types`.
