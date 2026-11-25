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

> **La base de datos nunca se resetea ni se borra** (CLAUDE.md, regla 0). Desarrollamos en local contra la base de producción, sin Docker.

Necesitas **Node 22** (ver `.nvmrc`) y la **CLI de Supabase** (`npx supabase`). Las claves están en `.env` (no se sube a git).

```bash
nvm use                                                # Node 22
npm install
npx supabase link --project-ref rzfaseleufqbfxyrcgyz   # una sola vez (pide la contraseña de la base)
npm run db:migrate                                     # aplica SOLO las migraciones nuevas (nunca borra)
npm run db:types                                       # regenera src/lib/supabase/database.types.ts
npm run seed:demo                                      # solo crea demo@ y admin@revolucion360.test; si ya existen no toca nada
npm run dev                                            # http://localhost:3000
```

Entra con `demo@revolucion360.test` o `admin@revolucion360.test` y la contraseña de `DEMO_PASSWORD`.

Para desarrollar, `.env.development.local` pone `NEXT_PUBLIC_APP_URL=http://localhost:3000`: así los enlaces de los correos vuelven a tu máquina y no al dominio de producción.

¿Olvidaste la clave y Supabase dice "rate limit"? `npx tsx scripts/recovery-link.ts tu@correo.com` imprime un enlace para poner una clave nueva sin mandar correo (no lo compartas).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | App en desarrollo |
| `npm test` | Todas las pruebas (las de permisos solo corren contra un Supabase local; con la base remota se saltan) |
| `npm run typecheck` | Revisa tipos |
| `npm run lint` | Linter |
| `npm run db:migrate` | Aplica las migraciones nuevas (solo agregan; revisarlas antes) |
| `npm run db:types` | Regenera los tipos de la base |
| `npm run seed:demo` | Crea los usuarios de demostración (nunca borra) |

## Claves y entornos

- `.env` → la base de producción, usada también para desarrollar en local (decisión del 25 nov 2026). No se sube a git. Sus valores se copian a Vercel.
- Stripe en desarrollo siempre con claves de prueba (`sk_test_`). La base nunca se resetea ni se borra.
