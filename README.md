# Revolución 360

App web (escritorio y móvil) para planear y registrar las finanzas personales del año. Una herramienta de Revolución del Dinero.

**Stack:** Next.js 16 (App Router, React 19, TypeScript) · Supabase (Postgres + Auth) · Stripe · Resend · Vercel.

- Estado del desarrollo y lo que falta: **[docs/ESTADO.md](docs/ESTADO.md)** (empieza aquí)
- Reglas del proyecto (léelas antes de cambiar algo): [CLAUDE.md](CLAUDE.md)
- Cómo está armado el código: [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)
- Plan, decisiones y reglas de negocio: [docs/plan-de-implementacion.md](docs/plan-de-implementacion.md) · [docs/reglas/reglas-cerradas.md](docs/reglas/reglas-cerradas.md)
- Las 60 pantallas aprobadas (contrato visual): `docs/mockup/*.dc.html`
- Stripe: [docs/STRIPE.md](docs/STRIPE.md) · Correos, tareas programadas y operación: [docs/OPERACION.md](docs/OPERACION.md)

## Correr en local

Necesitas **Node 22** (ver `.nvmrc`), **Docker Desktop** abierto y la **CLI de Supabase** (`brew install supabase/tap/supabase`, o usa la que trae el proyecto con `npx supabase`).

```bash
nvm use                      # Node 22
npm install
npx supabase start           # levanta Postgres, Auth y el buzón de correos de prueba en Docker
npx supabase db reset        # aplica TODAS las migraciones de supabase/migrations y supabase/seed.sql
cp .env.example .env.local   # solo si no tienes ya .env.local
```

Llena `.env.local` con lo que imprime `npx supabase status -o env`:
- `NEXT_PUBLIC_SUPABASE_URL` = `API_URL` (http://127.0.0.1:54321)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` = `SERVICE_ROLE_KEY`
- `DEMO_PASSWORD` = una contraseña cualquiera para los usuarios de demostración

```bash
npm run db:types             # regenera src/lib/supabase/database.types.ts desde la base local
npm run seed:demo            # crea demo@revolucion360.test (con el plan 2026 del mockup) y admin@revolucion360.test
npm run dev                  # http://localhost:3000
```

Entra con `demo@revolucion360.test` o `admin@revolucion360.test` y la contraseña de `DEMO_PASSWORD`.

| Servicio local | Dirección |
|---|---|
| App | http://localhost:3000 |
| Supabase Studio (ver la base) | http://127.0.0.1:54323 |
| Correos de prueba (confirmar cuenta, recuperar acceso) | http://127.0.0.1:54324 |

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | App en desarrollo |
| `npm test` | Todas las pruebas (las de permisos se saltan si Supabase local no está corriendo) |
| `npm run typecheck` | Revisa tipos |
| `npm run lint` | Linter |
| `npm run db:reset` | Borra la base local y aplica migraciones + seed (luego corre `seed:demo`) |
| `npm run db:types` | Regenera los tipos de la base |
| `npm run seed:demo` | Usuarios de demostración (solo contra Supabase local) |
| `npx supabase stop` | Apaga Supabase local (los datos se guardan) |

## Claves y entornos

- `.env.local` → desarrollo (Supabase local, Stripe **modo prueba**). `.env.production.local` → valores de producción para copiar a Vercel. Ninguno se sube a git.
- Nunca uses claves `sk_live_` ni la base de producción para desarrollar.
