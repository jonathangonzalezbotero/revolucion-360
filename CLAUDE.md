# Revolución 360

App web (escritorio y móvil con el mismo peso) para planear y registrar las finanzas personales del año.
La ofrece Revolución del Dinero: imán de clientes, suscripción y acceso gratis para alumnos. Español primero, inglés segundo.
Dominio: app.revoluciondeldinero.com. El panel de administración vive en `/admin`, nunca en el menú del usuario.

**Stack:** Next.js 16 (App Router, React 19, TypeScript) en Vercel · Supabase (Postgres + Auth, región Sydney) · Stripe · Resend.
Antes de usar una API de Next, lee su guía en `node_modules/next/dist/docs/` (ver AGENTS.md): el middleware ahora es `src/proxy.ts`, `cookies()` y `params` son asíncronos.

## Herramientas por bloque
Verificado en `package.json` y en el código (25 nov 2026).
- **App y hosting:** Next.js 16 (App Router, React 19, TypeScript) en Vercel.
- **Base, usuarios y permisos:** Supabase: Postgres + Auth (2 pasos) + RLS, región Sydney (`@supabase/ssr`, `@supabase/supabase-js`).
- **Cobros:** Stripe Embedded Checkout dentro de `/activar` (`stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js`); webhook en `src/app/api/stripe/webhook`.
- **Correo:** Resend (`resend`, `src/lib/email/send.ts`; webhook en `src/app/api/crm/resend`).
- **SMS:** Twilio por su API REST con `fetch` (sin librería; `src/server/crm/sms.ts`, webhook en `src/app/api/crm/twilio`).
- **Avisos al celular:** web-push (`web-push`, `src/lib/email/push.ts`).
- **Tareas programadas:** Vercel Cron (`vercel.json`: correos, cierre, racha, hábito…).
- **Motor del CRM:** pg_cron + pg_net de Supabase llaman `/api/crm/run` cada 10 minutos (paso manual, `docs/CRM.md`; no está en las migraciones).
- **Anti-bots en conexiones web:** Cloudflare Turnstile, verificado en el servidor (`src/server/crm/connections.ts`; Conexiones web, en construcción).
- **Imágenes:** sharp, solo en `scripts/optimize-images.ts` (dependencia transitiva de Next; no está en `package.json`).
- **Validación:** zod en las acciones del servidor y en las entradas de las rutas `api/`.
- **Pruebas:** vitest (`tests/`).

## Documentos que mandan
- `docs/plan-de-implementacion.md` — decisiones tomadas, fases y reglas de negocio. **No se cambia una decisión sin aprobación de Jonathan.**
- `docs/mockup/*.dc.html` — las 60 pantallas aprobadas. **Son el contrato visual: no se rediseña.** Si algo no se puede hacer, se pregunta.
- `docs/ARQUITECTURA.md` — cómo está armado el código y las convenciones para escribir una pantalla.
- `docs/reglas/` — reglas de negocio cerradas, con ejemplos.

## Innegociables
0. **La base de datos nunca se resetea ni se borra. Por ningún motivo: ni en desarrollo, ni al correr pruebas, ni en un deploy.** Desarrollamos contra la base de producción (`.env`), así que todo cambio cae sobre datos reales.
   - Prohibido: `supabase db reset`, `supabase start/stop`, correr `supabase/seed.sql`, `DROP` / `TRUNCATE`, `DELETE` o `UPDATE` sin `WHERE`, borrar el proyecto. El hook `.claude/hooks/proteger-base.sh` los bloquea; no se desactiva ni se esquiva.
   - Las migraciones solo agregan (tablas, columnas, funciones, políticas). `npm run db:migrate` corre antes `scripts/check-migrations.ts`, que se niega si una migración nueva borra tablas, columnas o filas, o renombra algo. Quitar o renombrar algo con datos lo decide Jonathan y lo aplica a mano, con respaldo previo.
   - Scripts nuevos (`scripts/`): solo crean o leen. Ninguno llama `.delete()`, `deleteUser` ni actualiza sin filtro; si un script necesita borrar algo, se consulta antes. Esto es regla escrita: ningún bloqueo automático lo revisa.
   - El hook se carga al abrir una sesión nueva de Claude Code en esta carpeta (comprobar con `/hooks`).
   - Las pruebas no escriben en la base: las de `tests/permissions.test.ts` solo corren contra un Supabase local y con la base remota se saltan. Una prueba nueva que necesite la base se consulta antes.
   - Datos de prueba: solo crear (usuarios `@revolucion360.test`), nunca borrar usuarios ni filas existentes. `seed:demo` se detiene si los usuarios ya existen.
   - Un deploy (Vercel) nunca toca la base; las migraciones se aplican aparte con `npm run db:migrate` y solo después de revisarlas.
1. **Dinero en centavos enteros** (`bigint` en la base, `Cents` en el código). Nunca decimales sueltos. Se muestra con `formatMoney` / `<Money>`.
2. **Fechas en la zona horaria del usuario** (`s.today`, `s.year`, `s.month`), nunca la del servidor. Semana de lunes a domingo.
3. **Cada usuario solo ve lo suyo y lo impone la base de datos (RLS).** Toda tabla nueva con datos del usuario lleva `user_id` y las 4 políticas `own_*` con `can_write()`.
4. **Admin nunca ve montos, movimientos, cuentas ni deudas.** El panel solo usa las funciones `admin_*` y tablas sin datos financieros. Nunca la clave de servicio para leer finanzas.
5. **Ninguna pantalla habla directo con la base de datos.** Los componentes de cliente llaman acciones del servidor (`"use server"`), que pasan por `run()`.
6. **Un solo plan, todo incluido (desde el 25 nov 2026).** No hay Gratis ni Pro: o la cuenta está activa (pagando, primer mes, alumno o fundador) o está sin activar (`free` = se registró y no ha pagado: solo bienvenida, asistente, diagnóstico y Perfil, para exportar o borrar sus datos) o en solo lectura. Qué sección se ve sale de `app_config.menu` (`s.config.menu`), nunca escrito en el código.
7. **Las claves secretas viven solo en `.env`** (ver `.env.example`; `.env*` está en `.gitignore`). Nunca en el repositorio, en un commit ni en una conversación: no se imprime ni se lee su contenido. `.env` apunta a la base de producción (decisión del 25 nov 2026, ver regla 0). Stripe en desarrollo, siempre con claves de prueba (`sk_test_`).
8. **Si un cálculo de dinero no tiene prueba, no existe.** Los cálculos viven en `src/lib/engine` (funciones puras) con pruebas en `tests/`.
9. **Si deja de pagar: solo lectura.** Los datos nunca se borran por no pagar y siempre se pueden exportar.
10. **No es asesoría financiera.** Diagnóstico, proyección y consejos llevan el aviso visible (`s.t.disclaimer`). Sin recomendaciones de inversión.
11. Los errores se registran sin montos ni datos personales. Los datos técnicos de soporte nunca llevan montos.

## Diseño (sistema v2)
- Tokens en `src/app/globals.css`. **Ningún color suelto en las pantallas**: usa `var(--tinta)`, `var(--papel)`, `var(--amarillo)`…
- Verde solo para dinero que entra; rojo óxido para lo que falta. **Puntos, niveles y rachas siempre en amarillo, nunca en verde.**
- Newsreader para títulos y cifras protagonistas (`h1`, `.big`); Geist para la interfaz. Máximo dos pesos por tarjeta; no existe el 800.
- Un botón principal, un número protagonista y un bloque oscuro como máximo por pantalla. El bloque oscuro solo va en Inicio, Academia, acceso y la pantalla de pago.
- Estados siempre con texto, nunca solo color. Lo que se puede tocar para cambiar de estado lleva borde punteado (`.pill-tap`).
- Accesible: `<button>`, `<a>`, `<label>` reales; botones de 44 px en móvil; `aria-label` en botones de solo ícono; el amarillo nunca como texto pequeño.
- Voz: tú, nunca usted. "Plata" o "dinero", nunca "fondos". Frases cortas, números antes que adjetivos. Ej.: "Falta el monto.", "Noviembre, cerrado. +30 puntos."
- Nunca un gráfico vacío: estado vacío que explica qué falta.

## Trabajo
- `npm run dev` · `npm test` · `npm run typecheck` · `npm run lint` · `npm run db:status` · `npm run db:migrate:check` · `npm run db:migrate` (aplica migraciones nuevas a la base) · `npm run db:types` · `npm run seed:demo` (solo crea). Sin Docker.
- Cambios de base de datos: un archivo nuevo en `supabase/migrations/` (nunca editar uno ya aplicado), solo cambios que agregan (regla 0). Los revisa una persona antes de `db:migrate`.
- No se agregan librerías sin justificar por qué.
- Una decisión nueva se anota en `docs/plan-de-implementacion.md` en el mismo cambio.
