-- Códigos de respaldo de la verificación en 2 pasos (10 por usuario, de un solo uso). Solo se guarda su huella.
create table public.mfa_backup_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.mfa_backup_codes(user_id);
create table public.mfa_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  failed int not null default 0,
  locked_until timestamptz
);
-- Sin políticas: solo el servidor (clave de servicio) las lee y escribe.
alter table public.mfa_backup_codes enable row level security;
alter table public.mfa_attempts enable row level security;
