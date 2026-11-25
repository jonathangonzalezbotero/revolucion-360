-- Hábito (25 nov 2026): interruptor "Tipo de gasto" en cada línea del Plan.
-- Solo agrega una columna. No toca datos existentes: todas las líneas quedan en NULL (= regla automática, como hoy).
--
-- Para qué: "Hoy puedes gastar" separa los pagos fijos del gasto del día a día con una regla automática
-- (src/lib/engine/habito.ts, `fixedReasons`). Un arriendo recién creado y nunca pagado cae en "del día a día" e infla la cifra.
-- Con esto el usuario lo decide por línea:
--   null  = automático (lo decide la regla)
--   true  = fijo
--   false = del día a día
-- Solo tiene sentido en líneas de gasto; en ingresos se ignora.
--
-- Permisos: las políticas own_* de plan_lines (20261124000002_security.sql) son por fila y no hay permisos por columna,
-- así que ya cubren esta columna. La exportación lee plan_lines con select("*"): sale sola.

alter table public.plan_lines add column if not exists fixed boolean;

comment on column public.plan_lines.fixed is 'Tipo de gasto elegido por el usuario: null = automático (regla del hábito), true = fijo, false = del día a día.';
