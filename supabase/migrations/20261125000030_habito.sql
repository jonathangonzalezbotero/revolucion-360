-- Hábito de uso (25 nov 2026): registro de los avisos del hábito enviados.
-- Solo agrega una tabla. No toca datos existentes.
--
-- Para qué: máximo UN aviso del hábito al día por persona (en su día local) y nunca el mismo aviso dos veces
-- (ej. el hito del 75% de una meta). No se usa `notifications.dedupe` porque "Quitar" en Notificaciones borra la fila
-- y el tope del día se perdería.
-- La escriben solo el servidor (tarea /api/cron/habito y `notifyHabit`) con la clave de servicio. Sin montos.

create table if not exists public.habit_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,                   -- día local del usuario en que salió
  kind text not null check (kind in ('daily','weekly','goal','due','close')),
  ref text not null,                   -- qué aviso: fecha, semana, meta + hito, línea + fecha, mes
  pushed int not null default 0,       -- a cuántos dispositivos llegó el push
  created_at timestamptz not null default now(),
  unique (user_id, day),               -- el tope: uno al día
  unique (user_id, kind, ref)          -- nunca el mismo aviso dos veces
);
create index if not exists habit_sends_user_created on public.habit_sends(user_id, created_at desc);

-- El usuario solo ve lo suyo y no escribe (como activity_weeks): lo escribe el servidor.
alter table public.habit_sends enable row level security;
create policy own_select on public.habit_sends for select to authenticated using (user_id = auth.uid());
