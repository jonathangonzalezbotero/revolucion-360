-- Metas amables (25 nov 2026). Solo agrega: columnas con default o null, tablas nuevas con RLS y funciones reemplazadas.
-- Nada se borra ni se renombra (CLAUDE.md, regla 0).

-- ───────────── Metas: "para qué" y desde cuándo está unida a su cuenta ─────────────
alter table public.goals add column if not exists why text not null default '' check (char_length(why) <= 160);
-- Las transferencias a la cuenta de la meta cuentan solas como aporte, pero solo las de esta fecha en adelante
-- (nunca se suman de golpe transferencias viejas).
alter table public.goals add column if not exists account_linked_on date;
update public.goals set account_linked_on = current_date where account_id is not null and account_linked_on is null;

-- ───────────── Aportes y usos que vienen de un movimiento ─────────────
-- kind: manual (a mano, + aporte o − uso) · auto (transferencia a la cuenta de la meta) · tx_in ("Aporte a…" en Movimientos)
--       · used ("Pagado con…" en Movimientos: un logro, no un gasto de más) · leftover (lo que sobró al cerrar el mes)
alter table public.goal_entries add column if not exists kind text not null default 'manual' check (kind in ('manual','auto','tx_in','used','leftover'));
alter table public.goal_entries add column if not exists transaction_id uuid references public.transactions(id) on delete set null;
create unique index if not exists goal_entries_transaction_uidx on public.goal_entries(transaction_id) where transaction_id is not null;
create trigger same_owner_tx before insert or update on public.goal_entries for each row execute function public.same_owner('transaction_id','transactions');

-- La elección del usuario en Movimientos: aporte a una meta, pagado con una meta, o "ninguna" (para que una transferencia no cuente sola).
alter table public.transactions add column if not exists goal_id uuid references public.goals(id) on delete set null;
alter table public.transactions add column if not exists goal_role text check (goal_role in ('in','out','none'));
create index if not exists transactions_goal_role_idx on public.transactions(user_id) where goal_role is not null;
create trigger same_owner_goal before insert or update on public.transactions for each row execute function public.same_owner('goal_id','goals');

-- ───────────── Lo que sobró al cerrar el mes: una sola decisión por mes ─────────────
-- goal_id null = "Ahora no". La llave primaria impide sumar dos veces el mismo mes (aunque se reabra y se cierre de nuevo).
create table if not exists public.goal_leftovers (
  user_id uuid not null references auth.users(id) on delete cascade,
  year int not null check (year between 2020 and 2100),
  month smallint not null check (month between 1 and 12),
  goal_id uuid references public.goals(id) on delete set null,
  amount_cents bigint not null default 0 check (amount_cents >= 0),
  entry_id uuid references public.goal_entries(id) on delete set null,
  decided_at timestamptz not null default now(),
  primary key (user_id, year, month)
);
-- Dos disparadores separados: el SET NULL de una llave (al borrar una meta o un aporte) no revalida la otra,
-- así borrar una cuenta o una meta nunca falla por "referencia ajena" (revisión del 25 nov).
create trigger same_owner_goal before insert or update of goal_id on public.goal_leftovers
  for each row when (new.goal_id is not null) execute function public.same_owner('goal_id','goals');
create trigger same_owner_entry before insert or update of entry_id on public.goal_leftovers
  for each row when (new.entry_id is not null) execute function public.same_owner('entry_id','goal_entries');

-- ───────────── Retos opcionales: estado por usuario (nadie más lo ve; admin no tiene política) ─────────────
create table if not exists public.user_challenges (
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge text not null check (char_length(challenge) between 1 and 40),
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, challenge)
);

do $$
declare t text;
begin
  foreach t in array array['goal_leftovers','user_challenges'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy own_select on public.%I for select to authenticated using (user_id = auth.uid())', t);
    execute format('create policy own_insert on public.%I for insert to authenticated with check (user_id = auth.uid() and public.can_write())', t);
    execute format('create policy own_update on public.%I for update to authenticated using (user_id = auth.uid() and public.can_write()) with check (user_id = auth.uid())', t);
    execute format('create policy own_delete on public.%I for delete to authenticated using (user_id = auth.uid() and public.can_write())', t);
  end loop;
end $$;

-- ───────────── Puntos nuevos (editables en Admin). Los valores que ya existan ganan. ─────────────
update public.app_config
   set value = '{"goal_milestone":20,"goal_used":10,"goal_leftover":10}'::jsonb || value
 where key = 'points';

-- ───────────── award_points: igual que en 002_security, más los tipos de metas amables ─────────────
create or replace function public.award_points(p_kind text, p_ref text) returns int
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cfg jsonb := coalesce((select value from public.app_config where key = 'points'), '{}'::jsonb);
  pts int := coalesce((cfg ->> p_kind)::int, 0);
  ok boolean := false;
  month_cap int;
  g_id text;
  g_pct int;
begin
  if uid is null or pts <= 0 then return 0; end if;
  if coalesce((select (value)::text from public.app_config where key = 'gamification_enabled'), 'true') = 'false' then return 0; end if;

  if p_kind = 'lesson' then
    ok := exists (select 1 from public.lesson_progress where user_id = uid and lesson_id::text = p_ref);
    pts := coalesce((select points from public.lessons where id::text = p_ref), pts);
  elsif p_kind = 'course' then
    ok := not exists (select 1 from public.lessons l where l.course_id::text = p_ref
            and not exists (select 1 from public.lesson_progress lp where lp.user_id = uid and lp.lesson_id = l.id))
          and exists (select 1 from public.lessons l where l.course_id::text = p_ref);
  elsif p_kind = 'closure' then           -- ref = 'YYYY-MM'
    ok := exists (select 1 from public.month_closures where user_id = uid and (year::text || '-' || lpad(month::text, 2, '0')) = p_ref);
  elsif p_kind = 'debt_paid' then
    ok := exists (select 1 from public.debts where user_id = uid and id::text = p_ref and closed_at is not null and start_balance_cents > 0);
    month_cap := 2;
  elsif p_kind = 'goal_done' then
    ok := exists (select 1 from public.goals where user_id = uid and id::text = p_ref and completed_at is not null);
    month_cap := 2;
  elsif p_kind = 'goal_contrib' then      -- ref = id del aporte; máximo uno por día
    ok := exists (select 1 from public.goal_entries where user_id = uid and id::text = p_ref and amount_cents > 0)
          and not exists (select 1 from public.point_events where user_id = uid and kind = 'goal_contrib' and at::date = now()::date);
  elsif p_kind = 'week_active' then       -- ref = lunes de la semana
    ok := exists (select 1 from public.activity_weeks where user_id = uid and week_start::text = p_ref and not wildcard);
  elsif p_kind = 'first_step' then        -- ref = clave del primer paso
    ok := p_ref in ('plan','cuenta','gasto','clase');
  elsif p_kind = 'goal_milestone' then    -- ref = '<id de la meta>:<25|50|75|100>'; lo ahorrado llegó a ese % del monto
    g_id := split_part(p_ref, ':', 1);
    g_pct := case split_part(p_ref, ':', 2) when '25' then 25 when '50' then 50 when '75' then 75 when '100' then 100 else null end;
    ok := g_pct is not null and p_ref = g_id || ':' || g_pct::text and exists (
      select 1 from public.goals g
       where g.user_id = uid and g.id::text = g_id and g.archived_at is null and g.target_cents > 0
         and coalesce((select sum(e.amount_cents) from public.goal_entries e where e.goal_id = g.id), 0) * 100 >= g.target_cents * g_pct);
    month_cap := 8;
  elsif p_kind = 'goal_used' then         -- ref = id de la meta; usó la plata para lo que era (una vez por meta)
    ok := exists (select 1 from public.goal_entries e join public.goals g on g.id = e.goal_id
                   where e.user_id = uid and g.id::text = p_ref and g.archived_at is null and e.amount_cents < 0);
    month_cap := 2;
  elsif p_kind = 'goal_leftover' then     -- ref = 'YYYY-MM'; mandó lo que le sobró de ese mes a una meta
    ok := exists (select 1 from public.goal_leftovers where user_id = uid and goal_id is not null and amount_cents > 0
                   and (year::text || '-' || lpad(month::text, 2, '0')) = p_ref);
    month_cap := 1;
  end if;
  if not ok then return 0; end if;
  if month_cap is not null and (select count(*) from public.point_events
       where user_id = uid and kind = p_kind and at >= date_trunc('month', now())) >= month_cap then
    return 0;
  end if;

  insert into public.point_events (user_id, kind, ref, points) values (uid, p_kind, p_ref, pts)
  on conflict (user_id, kind, ref) do nothing;
  if not found then return 0; end if;
  return pts;
end $$;
