-- Recurrentes unidos a una meta (decisión de Jonathan, 25 nov 2026, tarde).
-- Cada movimiento que genera un recurrente con meta queda unido a ella como aporte (transactions.goal_id + goal_role = 'in';
-- la app lo pasa a goal_entries con syncGoalLinks). Solo agrega: una columna, un índice y un disparador.
-- RLS: la tabla recurring ya tiene sus 4 políticas own_* con can_write(); una columna nueva queda cubierta.

alter table public.recurring add column if not exists goal_id uuid references public.goals(id) on delete set null;
create index if not exists recurring_goal_idx on public.recurring(goal_id) where goal_id is not null;

-- La meta debe ser del mismo usuario (igual que transactions.goal_id en 20261125000031_metas.sql).
-- Disparador aparte: el same_owner existente de recurring no se toca.
drop trigger if exists same_owner_goal on public.recurring;
create trigger same_owner_goal before insert or update of goal_id on public.recurring
  for each row when (new.goal_id is not null) execute function public.same_owner('goal_id','goals');
