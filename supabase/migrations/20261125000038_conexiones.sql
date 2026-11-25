-- Conexiones web del CRM (mockup AdminConexiones, decisiones de Jonathan del 25 nov 2026; detalle en docs/CRM.md ›
-- "Conexiones web"). Depende de 20261125000036_crm.sql (tablas crm_*, is_admin_owner()).
--
-- Una conexión recibe los formularios de una página web (desde el navegador con Cloudflare Turnstile, o desde el servidor
-- de la página con su clave secreta) y crea o actualiza el contacto, le pone y quita etiquetas y guarda campos extra.
-- También: "Pedir confirmación por correo" (opcional por conexión), registro de lo que va llegando y automatizaciones
-- transaccionales (de una compra o un acceso).
--
-- SOLO AGREGA (CLAUDE.md regla 0): tablas nuevas, columnas nuevas con valor por defecto, funciones y políticas. No borra,
-- no vacía, no renombra. Ninguna función de esta migración borra filas.
--
-- Permisos: SOLO el Dueño (is_admin_owner()) lee y escribe estas tablas. La dirección pública de cada conexión
-- (/api/crm/conexiones/<slug>) usa la clave de servicio en el servidor de la app; nada de esto es visible para anon.

-- ───────────────────────── Conexiones ─────────────────────────
create table if not exists public.crm_connections (
  id uuid primary key default gen_random_uuid(),
  -- Parte final de la dirección POST. Nunca cambia (cambiarla rompería los formularios ya pegados en las páginas).
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 60),
  name text not null check (length(trim(name)) between 1 and 80),
  -- Etiquetas propias que pone siempre (ids de crm_tags; una etiqueta borrada se ignora al recibir).
  tag_ids uuid[] not null default '{}' check (cardinality(tag_ids) <= 10),
  status text not null default 'active' check (status in ('active', 'paused')),
  -- Páginas que pueden enviar desde el navegador (nombres de dominio: "revoluciondeldinero.com", "*.revoluciondeldinero.com").
  origins text[] not null default '{}' check (cardinality(origins) <= 20),
  -- Adónde vuelve un formulario normal (no JSON) después de enviar. https y de una de las páginas permitidas.
  thanks_url text check (thanks_url is null or (thanks_url ~ '^https://' and length(thanks_url) <= 500)),
  -- "Pedir confirmación por correo" (por defecto apagado): nada se aplica hasta que la persona hace clic.
  double_opt_in boolean not null default false,
  -- Clave secreta para enviar desde un servidor (Authorization: Bearer …). Solo la lee el Dueño (Mostrar / Copiar).
  secret text not null unique default ('rk_live_' || replace(gen_random_uuid()::text, '-', '')) check (secret ~ '^rk_live_[0-9a-f]{32}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────────────────── Lo que va llegando ─────────────────────────
-- Un renglón por envío aceptado (creado, actualizado, sin consentimiento, de baja, pendiente de confirmar, confirmación
-- frenada por el límite de frecuencia, confirmado, prueba).
-- Los rechazos (bot, sin correo, origen no permitido, pausada…) se agrupan por hora en un contador (`bucket` =
-- 'YYYY-MM-DDTHH'): una ráfaga de bots no llena la tabla. Sin correos en claro: el contacto se lee por su id (y si se
-- borra el contacto, queda null).
create table if not exists public.crm_connection_log (
  id bigint generated always as identity primary key,
  connection_id uuid not null references public.crm_connections(id) on delete cascade,
  at timestamptz not null default now(),
  via text not null check (via in ('browser', 'server', 'test', 'confirm')),
  result text not null check (result in (
    'created', 'updated', 'no_consent', 'suppressed', 'pending', 'throttled', 'confirmed', 'test',
    'rejected_turnstile', 'rejected_origin', 'rejected_email', 'rejected_paused', 'rejected_invalid', 'rejected_key', 'rejected_rate'
  )),
  contact_id uuid references public.crm_contacts(id) on delete set null,
  count int not null default 1 check (count >= 1),
  bucket text check (bucket is null or bucket ~ '^\d{4}-\d{2}-\d{2}T\d{2}$'),
  unique (connection_id, result, bucket)
);
create index if not exists crm_connection_log_recent on public.crm_connection_log(connection_id, at desc);
create index if not exists crm_connection_log_contact on public.crm_connection_log(contact_id) where contact_id is not null;

-- ───────────────────────── Confirmación por correo (pendientes) ─────────────────────────
-- Envíos de conexiones con "Pedir confirmación por correo": guardan lo que llegó (`payload`) hasta que la persona hace
-- clic en el correo de confirmación (transaccional). Se guarda el SHA-256 del token, nunca el token, y el HMAC-SHA-256 del
-- correo con la clave del servidor CRM_HASH_KEY (sin la clave no se puede probar un correo contra la tabla). Al confirmar
-- o vencer (7 días), el motor vacía `payload` (no quedan datos personales de quien nunca confirmó), y a los 30 días borra
-- la fila (desde la app: src/server/crm/connections.ts › clearExpiredConfirmations; esta migración no borra nada).
create table if not exists public.crm_pending_confirmations (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.crm_connections(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object' and length(payload::text) <= 8000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  confirmed_at timestamptz
);
create index if not exists crm_pending_confirmations_email on public.crm_pending_confirmations(email_hash, created_at desc);
create index if not exists crm_pending_confirmations_open on public.crm_pending_confirmations(expires_at) where payload <> '{}'::jsonb;

-- ───────────────────────── Columnas nuevas ─────────────────────────
-- Campos extra del contacto que llegan de los formularios (p. ej. partners_name, partners_phone, ciudad). Texto corto,
-- nunca montos (la app rechaza claves de dinero: src/lib/crm/connections.ts › cleanFields).
alter table public.crm_contacts add column if not exists fields jsonb not null default '{}'::jsonb
  check (jsonb_typeof(fields) = 'object' and length(fields::text) <= 4000);
-- Automatización "De una compra o un acceso (transaccional)": sus correos salen sin consentimiento de marketing (nunca
-- con rebote o queja), sin enlace de baja de marketing y sin contenido promocional (docs/CRM.md › criterio legal).
alter table public.crm_automations add column if not exists transactional boolean not null default false;
-- Cada mensaje queda registrado como transaccional o de marketing (se fija al encolar).
alter table public.crm_messages add column if not exists transactional boolean not null default false;

-- Transaccional solo con disparadores de una compra, un acceso o una confirmación que pidió la persona (decisión de
-- Jonathan, 25 nov 2026; `tag_added` es el que usan el acceso a Skool y la entrada del evento). Lo valida también el
-- panel (src/server/crm/admin.ts › AutomationInput). Un mensaje transaccional siempre sale de una automatización.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_automations_transactional_trigger') then
    alter table public.crm_automations add constraint crm_automations_transactional_trigger
      check (not transactional or trigger->>'kind' in ('first_month_paid', 'student_code', 'web_connection', 'email_confirmed', 'tag_added'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crm_messages_transactional_source') then
    alter table public.crm_messages add constraint crm_messages_transactional_source
      check (not transactional or (automation_id is not null and campaign_id is null));
  end if;
end $$;

-- La parte final de la dirección de una conexión nunca cambia (rompería los formularios ya pegados en las páginas).
create or replace function public.crm_connection_slug_fixed() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.slug is distinct from old.slug then raise exception 'slug_fixed'; end if;
  return new;
end $$;
drop trigger if exists crm_connection_slug_fixed on public.crm_connections;
create trigger crm_connection_slug_fixed before update on public.crm_connections
  for each row execute function public.crm_connection_slug_fixed();

-- ───────────────────────── Permisos: solo el Dueño ─────────────────────────
alter table public.crm_connections enable row level security;
alter table public.crm_connection_log enable row level security;
alter table public.crm_pending_confirmations enable row level security;

drop policy if exists owner_all on public.crm_connections;
create policy owner_all on public.crm_connections for all to authenticated using ((select public.is_admin_owner())) with check ((select public.is_admin_owner()));
drop policy if exists owner_all on public.crm_connection_log;
create policy owner_all on public.crm_connection_log for all to authenticated using ((select public.is_admin_owner())) with check ((select public.is_admin_owner()));
drop policy if exists owner_read on public.crm_pending_confirmations;
create policy owner_read on public.crm_pending_confirmations for select to authenticated using ((select public.is_admin_owner()));

revoke all on table public.crm_connections, public.crm_connection_log, public.crm_pending_confirmations from anon;
-- Pendientes: el Dueño solo los lee (cuenta "pendiente de confirmar"); los escribe el servidor con la clave de servicio.
revoke insert, update, delete on table public.crm_pending_confirmations from authenticated;

-- ───────────────────────── Funciones ─────────────────────────
-- Rechazo agrupado por hora (bot sin comprobante, origen no permitido, sin correo…). Solo la clave de servicio.
create or replace function public.crm_connection_reject(p_connection uuid, p_via text, p_result text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_result not like 'rejected\_%' then raise exception 'result'; end if;
  insert into public.crm_connection_log as l (connection_id, via, result, bucket)
  values (p_connection, p_via, p_result, to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24'))
  on conflict (connection_id, result, bucket) do update set count = l.count + 1, at = now();
end $$;

-- "Contactos" y "Último" de cada conexión en la lista: contactos distintos que llegaron por ella y el último envío.
-- security invoker: la RLS (solo el Dueño) decide qué se ve.
create or replace function public.crm_connection_stats()
returns table (connection_id uuid, contacts bigint, last_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select c.id,
         (select count(distinct l.contact_id) from public.crm_connection_log l
           where l.connection_id = c.id and l.contact_id is not null and l.via <> 'test'),
         (select max(l.at) from public.crm_connection_log l where l.connection_id = c.id)
    from public.crm_connections c;
$$;

revoke execute on function public.crm_connection_reject(uuid, text, text) from public, anon, authenticated;
grant execute on function public.crm_connection_reject(uuid, text, text) to service_role;
revoke execute on function public.crm_connection_slug_fixed() from public, anon, authenticated;   -- solo el disparador
revoke execute on function public.crm_connection_stats() from public, anon;
grant execute on function public.crm_connection_stats() to authenticated, service_role;
