# Instrucciones para quien construye una pantalla

Vas a construir una parte de Revolución 360 dentro de un proyecto que ya tiene su base hecha y probada.
Varias personas trabajan a la vez en otras pantallas del mismo repositorio. Respeta estas reglas al pie de la letra.

## Antes de escribir
1. Lee `CLAUDE.md`, `docs/ARQUITECTURA.md` y `docs/reglas/reglas-cerradas.md` completos.
2. Lee las pantallas de referencia ya terminadas y copia su forma: `src/app/(app)/inicio/` (page.tsx, messages.ts, YearChart.tsx) y `src/app/(auth)/` (actions.ts, AuthForms.tsx).
3. Lee completos los mockups que te asignaron en `docs/mockup/` (el HTML dentro de `<x-dc>` y el `<script>` con los datos y la lógica). **Son el contrato visual y funcional.** Copia estructura, medidas, textos en español y comportamiento. El bloque `<helmet>` ya está en `globals.css`: ignóralo.
4. Lee lo que vas a usar de `src/server/` y `src/lib/engine/` (firmas reales, no supongas).
5. Entorno: `export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"` en cada comando.

## Qué puedes tocar
- **Solo** las carpetas y archivos que te asignaron. Crea ahí lo que necesites (page.tsx, messages.ts, actions.ts, componentes, `*.module.css`, `lib.ts` para cálculos propios).
- Pruebas propias en `tests/<tu-modulo>.test.ts` (cálculos puros de tu `lib.ts`).
- **Congelado (no editar):** `src/app/globals.css`, `src/i18n/*`, `src/lib/**`, `src/server/**`, `src/components/**`, `src/proxy.ts`, `src/app/layout.tsx`, `src/app/(app)/layout.tsx`, `supabase/**`, `package.json`, `tests/engine.test.ts`, `tests/permissions.test.ts`, y las carpetas de otras pantallas.
  Si te falta algo ahí (un ícono, un token, una columna, una función del motor), **no lo edites**: resuélvelo dentro de tu carpeta y repórtalo al final en "Necesito de la base".
- Si de verdad necesitas un cambio de base de datos, escribe el SQL en el archivo de migración que te asignaron (solo ese) con RLS como en `20261124000002_security.sql`, **no lo apliques**, y usa `as never` puntual en esas consultas hasta que se regeneren los tipos.
- **Prohibido:** `supabase db reset`, `supabase stop/start`, `npm install` (no agregues librerías), arrancar o matar servidores (`next dev` ya corre en :3000 y no es tuyo), usar el navegador, `git commit`, `git stash`, `git checkout`.

## Cómo debe quedar
- Todo lo que el mockup muestra debe **funcionar de verdad** contra la base de datos: nada de datos de ejemplo escritos en el código, nada de botones sin acción, nada de "TODO". Los `[N]`, `[MONTO]`, `[FECHA]` del mockup salen de datos reales.
- Una sola página responsive por pantalla (corte en 900 px) que respeta el mockup de escritorio y el de móvil. El menú lateral y la barra inferior ya existen (`AppShell`).
- Textos: todos en `messages.ts` (`es` copiado del mockup, `en` traducido con el mismo tono). Nada de texto visible escrito en los componentes.
- Colores: solo tokens `var(--…)` de `globals.css`. Si el mockup usa un color que no tiene token, usa el más cercano y repórtalo.
- Escribir: acciones del servidor con `run()` + zod. Montos de formularios llegan como texto → `parseMoney`. Después de escribir, `revalidate` de las rutas afectadas (incluye `/inicio`).
- Leer: `must(...)` y `fetchAll(...)`. Nunca `data ?? []` a ciegas.
- Respeta `s.canEdit` (solo lectura), `s.has(feature)` (Gratis o Pro, con `<ProWall>`), `s.config.menu` y `s.config.flags`.
- Estados vacíos con `<Empty>`: qué falta y el botón para resolverlo. Nunca un gráfico vacío.
- Accesibilidad: `<button>`/`<a>`/`<label>` reales, `aria-label` en botones de solo ícono, foco visible, 44 px en móvil.
- Logros donde aplique: `touchWeek(s)` en toda acción válida de la semana (registrar un gasto, marcar un pago, ver una clase, cerrar el mes), `award`, `tryBadge`, `firstStep`, y el aviso con `useToast()(texto, puntos)`.
- Términos por país con `term(s, …)`; fechas con `s.today/s.year/s.month`; dinero con `<Money>`/`formatMoney(…, s.fmt)`.

## Antes de terminar
1. `npx tsc --noEmit` sin errores **en tus archivos** (si ves errores en carpetas de otros, ignóralos: están trabajando).
2. `npx eslint <tus carpetas>` sin errores.
3. `npx vitest run tests/<tu-modulo>.test.ts` si escribiste pruebas.
4. Relee tu trabajo contra el mockup, sección por sección, escritorio y móvil.

## Tu informe final (corto, sin relleno)
- **Hecho:** rutas y qué hace cada una (una línea por ruta).
- **No hecho o hecho a medias:** con el porqué. Sé honesto: se va a verificar en el navegador.
- **Necesito de la base:** tokens, íconos, columnas, funciones o textos comunes que faltaron, y qué hiciste mientras tanto.
- **Decisiones que tomé** donde el mockup o las reglas no decían qué hacer.
- **Enlaces** que apuntan a rutas de otros módulos (para comprobar que existan).
