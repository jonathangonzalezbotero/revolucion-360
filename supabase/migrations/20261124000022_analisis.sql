-- Comercios vigilados: límite opcional de gasto al mes.
alter table public.watched_merchants add column limit_cents bigint check (limit_cents is null or limit_cents > 0);
