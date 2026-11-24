# Revolución 360

App web (escritorio y móvil con el mismo peso) para planear y registrar las finanzas personales del año.
La ofrece Revolución del Dinero: imán de clientes, suscripción y acceso gratis para alumnos. Español primero, inglés segundo.
Dominio: app.revoluciondeldinero.com. El panel de administración vive en `/admin`, nunca en el menú del usuario.

**Stack:** Next.js 16 (App Router, React 19, TypeScript) en Vercel · Supabase (Postgres + Auth, región Sydney) · Stripe · Resend.
Antes de usar una API de Next, lee su guía en `node_modules/next/dist/docs/` (ver AGENTS.md): el middleware ahora es `src/proxy.ts`, `cookies()` y `params` son asíncronos.

## Documentos que mandan
- `docs/plan-de-implementacion.md` — decisiones tomadas, fases y reglas de negocio. **No se cambia una decisión sin aprobación de Jonathan.**
- `docs/mockup/*.dc.html` — las 60 pantallas aprobadas. **Son el contrato visual: no se rediseña.** Si algo no se puede hacer, se pregunta.
- `docs/ARQUITECTURA.md` — cómo está armado el código y las convenciones para escribir una pantalla.
- `docs/reglas/` — reglas de negocio cerradas, con ejemplos.

## Innegociables
1. **Dinero en centavos enteros** (`bigint` en la base, `Cents` en el código). Nunca decimales sueltos. Se muestra con `formatMoney` / `<Money>`.
2. **Fechas en la zona horaria del usuario** (`s.today`, `s.year`, `s.month`), nunca la del servidor. Semana de lunes a domingo.
3. **Cada usuario solo ve lo suyo y lo impone la base de datos (RLS).** Toda tabla nueva con datos del usuario lleva `user_id` y las 4 políticas `own_*` con `can_write()`.
4. **Admin nunca ve montos, movimientos, cuentas ni deudas.** El panel solo usa las funciones `admin_*` y tablas sin datos financieros. Nunca la clave de servicio para leer finanzas.
5. **Ninguna pantalla habla directo con la base de datos.** Los componentes de cliente llaman acciones del servidor (`"use server"`), que pasan por `run()`.
6. **Qué es Gratis o Pro y qué sección se ve sale de `app_config`** (`s.has("ana")`, `s.config.menu`), nunca queda escrito en el código.
7. **Las claves secretas viven solo en `.env.local`** (ver `.env.example`). Nunca en el repositorio ni en una conversación. Nunca se usan claves ni datos de producción en desarrollo.
8. **Si un cálculo de dinero no tiene prueba, no existe.** Los cálculos viven en `src/lib/engine` (funciones puras) con pruebas en `tests/`.
9. **Si deja de pagar: solo lectura.** Los datos nunca se borran por no pagar y siempre se pueden exportar.
10. **No es asesoría financiera.** Diagnóstico, proyección y consejos llevan el aviso visible (`s.t.disclaimer`). Sin recomendaciones de inversión.
11. Los errores se registran sin montos ni datos personales. Los datos técnicos de soporte nunca llevan montos.

## Diseño (sistema v2)
- Tokens en `src/app/globals.css`. **Ningún color suelto en las pantallas**: usa `var(--tinta)`, `var(--papel)`, `var(--amarillo)`…
- Verde solo para dinero que entra; rojo óxido para lo que falta. **Puntos, niveles y rachas siempre en amarillo, nunca en verde.**
- Newsreader para títulos y cifras protagonistas (`h1`, `.big`); Geist para la interfaz. Máximo dos pesos por tarjeta; no existe el 800.
- Un botón principal, un número protagonista y un bloque oscuro como máximo por pantalla. El bloque oscuro solo va en Inicio, Academia, acceso y muro de Pro.
- Estados siempre con texto, nunca solo color. Lo que se puede tocar para cambiar de estado lleva borde punteado (`.pill-tap`).
- Accesible: `<button>`, `<a>`, `<label>` reales; botones de 44 px en móvil; `aria-label` en botones de solo ícono; el amarillo nunca como texto pequeño.
- Voz: tú, nunca usted. "Plata" o "dinero", nunca "fondos". Frases cortas, números antes que adjetivos. Ej.: "Falta el monto.", "Noviembre, cerrado. +30 puntos."
- Nunca un gráfico vacío: estado vacío que explica qué falta.

## Trabajo
- `npm run dev` · `npm test` · `npm run typecheck` · `npm run lint` · `npm run db:reset` (Supabase local en Docker) · `npm run seed:demo`.
- Cambios de base de datos: un archivo nuevo en `supabase/migrations/` (nunca editar uno ya aplicado en producción). Los revisa una persona.
- No se agregan librerías sin justificar por qué.
- Una decisión nueva se anota en `docs/plan-de-implementacion.md` en el mismo cambio.
