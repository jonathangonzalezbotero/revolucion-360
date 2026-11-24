-- Metas: dónde se guarda la plata de la meta. Cuentas: tipo "otra".
alter table public.goals add column account_id uuid references public.accounts(id) on delete set null;
create trigger same_owner before insert or update on public.goals for each row execute function public.same_owner('account_id','accounts');
alter table public.accounts drop constraint accounts_kind_check;
alter table public.accounts add constraint accounts_kind_check check (kind in ('bank','savings','card','cash','business','other'));
