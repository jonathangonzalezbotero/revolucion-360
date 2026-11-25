# Estado del desarrollo

Actualizado: 25 de noviembre de 2026. Todo el código está en `main` en GitHub.

## Hoy, 25 nov 2026: un solo plan, hábito, metas amables, inversiones por activo y subroles (SIN PROBAR EN PANTALLA)
**Nada de esto se ha probado en el navegador.** Pasa tipos (`tsc`), linter y pruebas (`vitest`), y nada más.
- **Cobro:** un solo plan en USD: primer mes $1 + $8 al mes, o $80 al año. "Activa tu cuenta" (`/activar`) con la tarjeta dentro de la app (Stripe Embedded Checkout), cupones (solo al plan, nunca al $1) y código de alumno. Correo 5 "Fin del primer mes" con `customer.subscription.trial_will_end`. Detalle en `docs/STRIPE.md`.
- **Sin activar:** quien se registra y no paga solo abre bienvenida, asistente, diagnóstico y Mi perfil; el servidor (`run`) rechaza cualquier otra acción suya.
- **Solo lectura:** aviso arriba en toda la app con "Reactivar por $8 USD al mes", "O $80 USD al año · 2 meses gratis" (montos de `app_config.billing`) y "Exportar mis datos". Quitar un acceso gratis desde el panel deja la cuenta en solo lectura.
- **Sin Gratis/Pro** en la app y el panel; Planes en USD; Academia visible por grupo; los videos exigen cuenta activa.
- **Hábito:** "Hoy puedes gastar" en Inicio, repaso semanal (`/repaso`), avisos (uno al día, nunca de noche) con `/api/cron/habito` tres veces al día.
- **Metas amables:** cuenta unida, aportes automáticos, hitos (+20), "para qué", retos, sobrante del mes al cerrar. Cumplir una meta da +50 (antes +100).
- **Inversiones por activo:** compras, ventas y dividendos (`assets`, `asset_operations`). El Cierre de mes ya anota el precio o saldo de hoy de cada activo.
- **Subroles de admin:** Dueño, Contenido, Soporte, impuestos en la base.

### Migraciones 028 a 034: pendientes de aprobar y aplicar
`20261125000028_cobro` · `029_un_plan` · `030_habito` · `031_metas` · `032_inversiones_activos` · `033_admin_roles` · `034_integracion`.
**Ninguna está aplicada.** Las revisa una persona; después `npm run db:migrate` y `npm run db:types` (para quitar los `as never` / clientes sin tipos). Mientras no estén aplicadas, lo que usa tablas o columnas nuevas (Inversiones, partes de Metas, Repaso, avisos del hábito, cobro del primer mes) puede fallar contra la base; Cierre, Perfil, Academia y el export toleran que falten `assets` y las tablas nuevas de metas y hábito.

### Stripe: pasos para Jonathan (modo prueba)
1. Aplicar las migraciones (la 028 crea `app_config.billing` y `price_regions.stripe_price_first`).
2. Correr `npx tsx scripts/stripe-setup.ts`: crea el producto del plan y el del primer mes, los precios USD $1 / $8 / $80, los guarda en `price_regions` y crea o **rehace** los cupones para que apliquen solo al plan.
3. Agregar el evento **`customer.subscription.trial_will_end`** al webhook de Stripe.
4. Poner `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…` en `.env` (y en Vercel).
5. Customer Portal: permitir **cambiar entre mensual ($8) y anual ($80)**, además de tarjeta, facturas y cancelar al final del periodo.

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
| `/admin/menu`, `/admin/academia`, `/admin/planes`, `/admin/paises` | AdminMenu, AdminAcademia, AdminPlanes, AdminPaises | Construido (parte 2, 25 nov), sin probar en pantalla |
| Correos, `/api/cron/*`, PWA, push | Correos | Ver sección "Correos y app instalable" |

## Lo que falta, en orden

### 1. Poner al día la base (sin Docker, contra la base de producción)
Desde el 25 nov 2026 no se usa Docker: la app corre en local contra la base de producción (`.env`). **La base nunca se resetea ni se borra** (CLAUDE.md, regla 0).
```bash
npx supabase link --project-ref rzfaseleufqbfxyrcgyz   # una vez
npm run db:status            # qué migraciones faltan en la base
npm run db:migrate:check     # muestra qué aplicaría, sin aplicar nada
npm run db:migrate            # aplica solo las nuevas (revisarlas antes)
npm run db:types
npm run typecheck && npm test # las pruebas de permisos se saltan: solo corren contra un Supabase local
```
Si una migración va "antes de la última" aplicada, renómbrala con un número mayor (el orden importa).

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

### 3. Panel de administración, parte 2 — construido el 25 nov, sin probar en pantalla
`/admin/menu`, `/admin/academia`, `/admin/planes` y `/admin/paises`. Pasan tipos, linter, build y sus pruebas (`tests/admin-*.test.ts`). Nada se borra: cursos, cupones y países se pasan a borrador o se pausan. Las escrituras en `app_config` mezclan con lo guardado (dos pantallas editan `features` y `points` sin pisarse).
**Decisiones pendientes de Jonathan:**
- **Precios en Stripe producción:** cambiar un monto en `/admin/planes` actualiza la app, pero Stripe cobra el precio viejo hasta correr `scripts/stripe-setup.ts`, que solo acepta `sk_test_`. Falta decidir cómo se sincroniza en producción.
- `coupons.redemptions` no lo escribe nadie; los usos salen de Stripe.
- **Academia:** una clase o un módulo sueltos no se pueden ocultar (no hay columna de estado en `lessons`); "dónde abandonan" necesita una función de base.
- **Países:** si un país pasa a borrador, sus usuarios no pueden guardar su región en Perfil; una moneda fuera de las 11 conocidas no se puede elegir en Perfil. La bandera `remesas` depende del nombre exacto de la categoría "Familia y remesas".
- **Menú:** `flags.multimoneda` y el plan de "Plan anual" (`features.plan`) se guardan pero ninguna pantalla los usa.

### 3b. Panel parte 1: lo que faltaba del mockup (25 nov)
- Hecho en código, sin probar en pantalla: "Avisarles por correo" al dar acceso, filtros por rol, país, correo exacto y "vencen en 7 días", correos en lote y "dónde más abandonan" en el resumen. Usan funciones de la migración `…027_admin_parte1.sql` (mientras no esté aplicada, el panel usa el camino anterior).
- Sin construir, por decisión: "Cerrar sesiones" (habría que borrar filas de sesiones; choca con la regla 0, Jonathan decide), "Enviarle sus datos" (la regla 4), "Cambiar a Pro pagado" y subroles de admin (falta definir qué son), dispositivo del último acceso.
- Borrar una cuenta desde el panel es inmediato (el mockup decía 30 días; el borrado programado de 30 días es el que pide el usuario desde su perfil).
- Probar en vivo: reiniciar 2 pasos, borrar cuenta, responder soporte (notificación) y el filtro del registro de actividad.

### 3c. Diseño de la parte 2 completado (25 nov)
- Cupones con "Aplica a" y "Vence" (migración `…026`, aplicada); el pago rechaza un cupón de otro plan o vencido (función `coupon_rule` de `…027`). La página de Stripe ya no tiene campo de cupón: se escribe en la app.
- Países con idioma por defecto (se aplica al guardar la bienvenida si el idioma sigue en español) y apartado para impuestos con su aviso (Deudas lo oculta si el país lo apaga; el asistente no lo enciende).
- Diagnóstico: siguiente paso para alumnos (automático / curso fijo / nada) en `/admin/menu`.

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
2. Stripe en **modo prueba** (`sk_test_` en `.env`). ✅ Precios de AU (AUD) y DEFAULT (USD) creados con `scripts/stripe-setup.ts`; **pago de prueba anual verificado el 25 nov**: el webhook pasó la cuenta a Pro (`stripe_status = active`), anotó `upgraded` y la notificación "Ya tienes Pro". Faltan precios de CO, MX y EU. Falta probar: cancelar desde el Portal (debe quedar en solo lectura al vencer), pago fallido (tarjeta `4000 0000 0000 0341`) y un cupón.
3. Supabase producción: las claves ya están en `.env`; las migraciones se aplican con `npm run db:migrate`. Pegar las plantillas de `supabase/templates/` en Authentication → Emails; activar MFA (TOTP); poner la URL del sitio y las de redirección; contraseña mínima 8.
4. NUNCA correr `seed.sql` (desactiva los 2 pasos de admin). Antes de lanzar, Jonathan decide si quita a mano los usuarios de demostración `@revolucion360.test`. Crear tu usuario y darle `role = 'admin'` desde el SQL Editor.
5. Resend: verificar el dominio `revoluciondeldinero.com`.
6. Vercel: importar el repo, región Sydney (`syd1`), copiar las variables de `.env`, `CRON_SECRET`, dominio `app.revoluciondeldinero.com`. El webhook de Stripe apunta a `https://app.revoluciondeldinero.com/api/stripe/webhook`.
7. Respaldos diarios y prueba de restauración (ver `docs/OPERACION.md`).

### 6. Contenido tuyo
Videos de las clases (mínimo el curso "Empieza aquí"), tu foto y tu frase para la pantalla de entrar (`src/app/(auth)/messages.ts`), precios por región, razón social y ABN, revisión legal, ícono cuadrado de la app (hoy se usa el sello).

## Cosas conocidas (no son errores, pero hay que decidir)
- La foto de perfil, sesiones activas, adjuntar capturas en soporte y el resumen semanal no existen (no hay almacenamiento ni esa función).
- Los videos de YouTube deben ser "no listados" (los privados no se pueden insertar). Mux solo con playback público.
- Cancelar o dejar de pagar deja la cuenta en **solo lectura** (regla del plan); el acceso de alumno o fundador vencido, también. Nunca se borra nada.
- La transferencia entre cuentas hace 3 escrituras seguidas (no es atómica).
- El export de datos arma todo en memoria; con mucho historial podría pasar el límite de respuesta de Vercel.
- Varias pantallas no traen mockup móvil propio (Importar CSV, curso de la Academia): el diseño móvil se hizo siguiendo el sistema.

## Cómo seguir con Claude Code
- `CLAUDE.md` tiene las reglas innegociables; `docs/ARQUITECTURA.md` la forma de cada pantalla; `docs/BRIEF-AGENTES.md` las instrucciones para construir una pantalla.
- Pantallas de referencia bien hechas para copiar: `src/app/(app)/inicio/` y `src/app/(auth)/`.
- Cambios de base: un archivo nuevo en `supabase/migrations/` con número mayor al último, con RLS (ver `…002_security.sql`), luego `migration up` y `db:types`.
