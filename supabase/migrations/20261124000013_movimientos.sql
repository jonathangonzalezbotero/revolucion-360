-- Recurrentes mensuales: día ancla (un pago del 31 vuelve al 31 después de febrero).
alter table public.recurring add column anchor_day smallint check (anchor_day between 1 and 31);
update public.recurring set anchor_day = extract(day from next_date)::int where anchor_day is null;
