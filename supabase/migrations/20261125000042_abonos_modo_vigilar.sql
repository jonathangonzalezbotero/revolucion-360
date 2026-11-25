-- Abonos, "Dar por cerrado", modo Mensual / Día a día y "Vigilar un gasto" (decidido por Jonathan el 25 nov 2026).
-- Solo agrega (CLAUDE.md, regla 0): una tabla nueva, columnas nuevas y un DEFAULT nuevo. No actualiza ni borra filas.
-- Sin aplicar: la revisa una persona antes de `npm run db:migrate`. La app funciona antes y después de aplicarla.

-- (a) "Dar por cerrado con $X" en el Plan anual: una línea de gasto y un mes que se dan por terminados con menos de lo
--     planeado. El monto no se guarda: es la suma viva de sus movimientos unidos (si se quita un abono, baja solo).
--     Reabrir = `closed_at = null` (un UPDATE acotado por línea y mes), nunca se borra la fila.
create table if not exists public.plan_closes (
  line_id uuid not null references public.plan_lines(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  month smallint not null check (month between 1 and 12),
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (line_id, month)
);
create index if not exists plan_closes_user on public.plan_closes(user_id);

alter table public.plan_closes enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'plan_closes' and policyname = 'own_select') then
    create policy own_select on public.plan_closes for select to authenticated using (user_id = auth.uid());
    create policy own_insert on public.plan_closes for insert to authenticated with check (user_id = auth.uid() and public.can_write());
    create policy own_update on public.plan_closes for update to authenticated using (user_id = auth.uid() and public.can_write()) with check (user_id = auth.uid());
    create policy own_delete on public.plan_closes for delete to authenticated using (user_id = auth.uid() and public.can_write());
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'same_owner' and tgrelid = 'public.plan_closes'::regclass) then
    create trigger same_owner before insert or update on public.plan_closes
      for each row execute function public.same_owner('line_id', 'plan_lines');
  end if;
end $$;

-- (b) Etiquetas a mano en los movimientos (#café, #GYG, #helado). Solo sirven para "Vigilar un gasto": el movimiento
--     sigue en su categoría y nada del plan ni del cierre cambia. Se guardan sin "#", hasta 10 por movimiento.
alter table public.transactions add column if not exists tags text[] not null default '{}';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_tags_max') then
    alter table public.transactions add constraint transactions_tags_max check (cardinality(tags) <= 10);
  end if;
end $$;
create index if not exists transactions_tags on public.transactions using gin (tags);

-- (c) "Vigilar un gasto": se reusa `watched_merchants` (la misma lista de Análisis › Comercios). Una vigilancia mira una
--     palabra (`pattern`, como hasta hoy) y/o una etiqueta (`tag`, nueva, sin "#"). Con solo etiqueta, `pattern` queda ''.
alter table public.watched_merchants add column if not exists tag text check (tag is null or char_length(tag) between 1 and 40);

-- (d) Dos maneras de llevar la plata, elegidas en Perfil: "Mensual" (`mov_level = 'plan'`) y "Día a día" (`'detail'`).
--     Solo cambia el valor por defecto para las cuentas NUEVAS (Mensual). Las cuentas que ya existen se quedan como están
--     ('detail' = Día a día, que es como funciona la app hoy): no se actualiza ninguna fila.
alter table public.profiles alter column mov_level set default 'plan';
