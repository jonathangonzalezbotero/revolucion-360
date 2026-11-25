# Arquitectura y convenciones

## Mapa
```
src/app/(auth)/…            entrar, registro, recuperar, nueva-clave, verificar, dos-pasos, activar (bloque oscuro permitido)
src/app/(onboarding)/…      bienvenida (onboarding), asistente ("Arma tu plan")
src/app/(app)/…             la app con menú: inicio, plan, movimientos, cuentas, metas, proyeccion, analisis, deudas,
                            inversiones, cierre, diagnostico, academia, suscripcion, perfil, notificaciones, ayuda, mas
src/app/admin/…             panel de administración (requireAdmin)
src/app/legal/…             términos y privacidad (públicas)
src/app/api/…               stripe/webhook, cron/*, export
src/lib/engine/             CÁLCULOS: funciones puras con pruebas (dinero, fechas, plan, finanzas, diagnóstico, proyección, logros, CSV, accesos)
src/lib/supabase/           server.ts (sesión del usuario, con RLS) · admin.ts (clave de servicio, uso mínimo)
src/server/                 session.ts · config.ts · action.ts (run) · data.ts (cargadores, must, fetchAll) · plan-write.ts (createLine, setCell, setCells, updateLine, archiveLine, setMark, createDefaultCategories) · rewards.ts · closure.ts · terms.ts
src/components/ui/          Icon · basics (PageHeader, Money, Ledger, Bar, Pill, Empty, ListLink, Ring, Disclaimer) · client (Modal, useToast, Switch, Segmented, SubmitButton, ConfirmButton)
src/components/shell/       AppShell (menú lateral + barra móvil + aviso de solo lectura)
src/i18n/                   index.ts (Locale, Messages, fill) · common.ts (textos compartidos: s.t)
supabase/migrations/        esquema, permisos y configuración inicial
tests/                      engine.test.ts · permissions.test.ts
docs/mockup/                las 60 pantallas (contrato visual)
```

## Cómo se escribe una pantalla
Cada sección vive en su carpeta `src/app/(app)/<seccion>/` con:
- `page.tsx` — Server Component. Empieza con `const s = await requireUser()`; carga datos con `src/server/data.ts` o consultas propias con `s.supabase`; calcula con `@/lib/engine`; pinta.
- `messages.ts` — textos de esa pantalla: `export const M = { es: {...}, en: {...} } satisfies Messages<unknown>`; se usan con `const m = M[s.locale]`. **Todo texto visible sale de aquí o de `s.t`** (textos compartidos). El español se copia del mockup, tal cual.
- `actions.ts` — `"use server"`. Cada acción valida con zod y pasa por `run({ write, allowInactive, revalidate }, async (s) => …)`; devuelve `ok(data, { points })` o `fail(mensaje)`.
  - `run` rechaza toda acción de una cuenta **sin activar** (`s.plan === "free"`) salvo las que llevan `allowInactive: true` (solo bienvenida, asistente, `/activar` y en Perfil idioma, cerrar sesión y borrar la cuenta; el panel de admin también). No la agregues a una acción nueva sin aprobación.
  - `write: false` = la acción funciona también en solo lectura (perfil, privacidad, canje de código).
- `*.tsx` de cliente (`"use client"`) solo donde hay interacción. Reciben datos ya calculados y textos por props; llaman acciones; muestran `useToast()` al terminar.

```tsx
// page.tsx
export default async function Page() {
  const s = await requireUser();
  const m = M[s.locale];
  if (s.config.menu.analisis !== "on") return <main className="page"><PageHeader title={m.title} /><Empty icon="pie" title={m.soonTitle} text={m.soonText} /></main>;
  const view = await loadMonthView(s, s.year, s.month);
  return <main className="page">…</main>;
}
// actions.ts
"use server";
export async function addThing(input: unknown) {
  return run({ revalidate: ["/metas", "/inicio"] }, async (s) => {
    const p = Schema.safeParse(input);
    if (!p.success) return fail(s.t.errors.name);
    const { data, error } = await s.supabase.from("goals").insert({ user_id: s.userId, … }).select("id").single();
    if (error) return fail(s.t.errors.generic);
    await touchWeek(s);
    return ok(data.id);
  });
}
```

### Reglas de la pantalla
- `<main className="page">` es el contenedor (anima la entrada y da los márgenes en escritorio y móvil). Encabezado con `<PageHeader>`.
- **Una sola página responsive** por pantalla: el mockup trae `X.dc.html` (escritorio, 1440) y `X-movil.dc.html` (móvil, 390). El corte es 900 px (`.only-desktop`, `.only-mobile`, o `@media (max-width: 899px)` en un CSS module). La barra inferior y el menú ya los pone `AppShell`: no los repitas.
- Estilos: clases de `globals.css` + estilos en línea con tokens (`var(--…)`) copiando medidas del mockup. Para media queries usa un `*.module.css` junto a la página. No Tailwind, no librerías de UI ni de gráficos: los gráficos del mockup son SVG/HTML a mano.
- Los valores `[N]`, `[MONTO]`, `[FECHA]` del mockup son marcadores: en la app salen de datos reales. Los datos de ejemplo del mockup (Jonathan, $95, Woolworths) NO se escriben en el código.
- Montos: `<Money cents fmt={s.fmt} />` o `formatMoney(cents, s.fmt)`. Entrada de montos: `parseMoney(texto)` en el servidor.
- Vacío: `<Empty>` con qué falta y el botón para resolverlo.
- Solo lectura: `s.canEdit === false` → oculta o desactiva lo que escribe (el servidor y la base de datos lo bloquean igual).
- Términos por país: `term(s, "retirement")` (super / jubilación), nunca "super" o "ABN" fijos en el texto.

## Sesión (`src/server/session.ts`)
`requireUser()` → `s`: `userId`, `profile`, `entitlement`, `plan` (estado efectivo: `free` sin activar, `pro`, `alumno`, `fundador`, `read_only`), `active`, `canEdit`, `isAdmin`, `config` (incluye `menu`, `points` y `billing`), `locale`, `t`, `fmt`, `today`, `year`, `month`, `supabase`.
Un solo plan, todo incluido (CLAUDE.md regla 6). `requireUser()` manda a `/activar` a una cuenta sin activar salvo en bienvenida, asistente, diagnóstico y perfil (`INACTIVE_ROUTES` en `src/lib/engine/access.ts`). Qué sección se ve sale de `s.config.menu`.

## Logros (`src/server/rewards.ts`)
`award(s, kind, ref)` (la base valida el hecho y nunca da puntos dos veces) · `tryBadge(s, badge)` · `touchWeek(s)` (toda acción válida de la semana: registrar un gasto, marcar un pago, ver una clase, cerrar el mes) · `firstStep(s, paso)` · `notify(s, …)` · `track(s, evento)`.

## Base de datos
Tablas y permisos en `supabase/migrations/`. Resumen:
- Finanzas del usuario (RLS `own_*` + `can_write()`): categories, accounts, plan_lines, plan_cells, plan_marks, transactions (+transaction_history por disparador), category_rules, month_totals, recurring, csv_imports, csv_formats, goals, goal_entries, goal_leftovers, user_challenges, debts, debt_payments, assets, asset_operations, month_closures, forecast_scenarios, watched_merchants, tax_settings, tax_entries, company_entries. (`investments` e `investment_entries` son las tablas anteriores de Inversiones: se conservan, pero la app ya escribe en `assets` / `asset_operations`.)
- Hábito: habit_sends (solo lectura para el usuario; la escribe el servidor).
- Cuenta: profiles (el usuario edita lo suyo; rol y suspensión protegidos), entitlements (solo lectura para el usuario; lo escriben Stripe, cron y admin).
- Logros: point_events, user_badges, activity_weeks (solo lectura; se escriben con `award_points`, `award_badge`, `touch_week`, `use_wildcard`).
- Contenido y configuración (lee todo usuario, escribe admin): app_config, countries, price_regions, faqs, courses, course_modules, lessons.
- Admin: groups, group_members, access_grants, invite_codes, coupons, admin_audit, admin_notes; funciones `admin_users_v3`, `admin_user`, `admin_summary`, `admin_plan_summary`, `admin_grant_access`, `admin_revoke_access` (deja la cuenta en solo lectura), `admin_set_suspended`, `admin_set_role`, `admin_invite`, `admin_log`. Subroles Dueño / Contenido / Soporte (`my_admin_role`, `is_admin_of`).
- Otros: notifications, email_log, push_subscriptions, support_tickets, ticket_messages, privacy_requests, product_events, lesson_progress.

Signo de los movimientos: entra positivo, sale negativo. Las transferencias (`kind = 'transfer'`) y los padres divididos (`is_split`) no cuentan como ingreso ni gasto (`counts(t)` en `data.ts`).

## Consultas
- Los clientes de Supabase están tipados (`src/lib/supabase/database.types.ts`, se regenera con `npm run db:types`). Una columna mal escrita no compila.
- **Nunca `data ?? []` a ciegas**: una consulta que falla se pinta como "sin datos" o "$0". Usa `must(await s.supabase.from(…)…)` (lanza el error).
- **La API devuelve máximo 1,000 filas.** Todo lo que pueda pasar de ahí (movimientos, celdas, historial) se trae con `fetchAll((a, b) => consulta.range(a, b))`.
- Cambio de año: `loadPlan(s, año)` copia el plan del año anterior la primera vez que se pide el año en curso o el siguiente (`ensurePlanYear`). Usa siempre `s.year`/`s.month`, nunca un año fijo.
- Videos de la Academia: `lesson_media.video_url` (la base solo lo entrega con cuenta activa —`is_active_account()`— y si el curso está liberado y es visible para su grupo).
- 2 pasos: las acciones `mfaStart`, `mfaConfirm`, `mfaDisable`, `mfaStatus` y `signOut` están en `src/app/(auth)/actions.ts`.

## Entorno local
- Node 22: `export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.
- Sin Docker: la app corre en local contra la base de producción (`.env`). **La base nunca se resetea ni se borra** (CLAUDE.md, regla 0). Migraciones con `npm run db:migrate`; usuario de demostración con `npm run seed:demo` (solo crea; correo y contraseña en `.env`).
- Pantallas de referencia ya terminadas: `src/app/(auth)/*` y `src/app/(app)/inicio/*`.
