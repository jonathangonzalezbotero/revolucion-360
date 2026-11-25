-- CRM dentro del panel (decisiones del 25 nov 2026, docs/plan-de-implementacion.md › "CRM"; detalle en docs/CRM.md).
-- Contactos, etiquetas, eventos de uso, campañas de correo, automatizaciones, cola de envíos (correo y SMS),
-- supresiones y tokens de baja. NUNCA montos ni datos financieros (CLAUDE.md regla 4).
--
-- Permisos: SOLO el Dueño (`is_admin_owner()`, migración 033) lee y escribe las tablas crm_*. Ningún usuario normal
-- tiene políticas: su consentimiento lo cambia solo con `crm_set_my_consent` / lo lee con `crm_my_consent`
-- (security definer, sobre su propia fila). El motor (/api/crm/run) y los webhooks usan la clave de servicio.
--
-- SOLO AGREGA (CLAUDE.md regla 0): tablas nuevas, funciones nuevas, disparadores nuevos y un INSERT…SELECT idempotente
-- (`on conflict do nothing`) para las cuentas que ya existen. No borra, no vacía, no renombra. Ninguna función
-- de esta migración borra filas: quitar una etiqueta a mano lo hace la app (src/server/crm).
--
-- pg_cron / pg_net: esta migración NO los usa ni los crea. El job que llama al motor cada 10 minutos es un paso
-- manual de Jonathan (docs/CRM.md), con la URL y el secreto en Vault, fuera del repositorio.

-- ───────────────────────── Contactos ─────────────────────────
create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and email like '%_@_%' and length(email) <= 254),
  name text not null default '' check (length(name) <= 120),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),          -- E.164
  country text check (country is null or length(country) <= 8),
  timezone text check (timezone is null or length(timezone) <= 64),          -- "hora de cada persona"; null = la del país o Sydney
  locale text not null default 'es' check (locale in ('es', 'en')),
  user_id uuid unique references auth.users(id) on delete cascade,         -- usuario de la app; al borrar la cuenta se borra el contacto
  source text not null default 'manual' check (source in ('webinar', 'diagnostico', 'web', 'app', 'importado', 'manual')),
  source_detail text not null default '' check (length(source_detail) <= 80), -- ej. nombre del webinar o del formulario
  -- Etapa = etiqueta de sistema (Lead, Primer mes, Pagando, Alumno, Solo lectura). La pone y la quita SOLO el motor
  -- según el estado de la cuenta (src/lib/crm/stage.ts); nunca se escribe a mano.
  stage text not null default 'lead' check (stage in ('lead', 'primer_mes', 'pagando', 'alumno', 'solo_lectura')),
  email_consent boolean not null default false,
  email_consent_at timestamptz,
  email_consent_source text check (email_consent_source is null or length(email_consent_source) <= 60),
  email_unsubscribed_at timestamptz,
  sms_consent boolean not null default false,
  sms_consent_at timestamptz,
  sms_consent_source text check (sms_consent_source is null or length(sms_consent_source) <= 60),
  sms_unsubscribed_at timestamptz,
  -- Token de baja y preferencias (enlaces de los correos). 64 caracteres hexadecimales al azar.
  token text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not sms_consent or phone is not null)
);
create index if not exists crm_contacts_stage on public.crm_contacts(stage);
create index if not exists crm_contacts_created on public.crm_contacts(created_at desc);
create index if not exists crm_contacts_activity on public.crm_contacts(last_activity_at desc nulls last);

-- ───────────────────────── Etiquetas ─────────────────────────
create table if not exists public.crm_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 40),
  -- Etiquetas de sistema: una por etapa. Su pertenencia sale de crm_contacts.stage (no van en crm_contact_tags).
  system_key text unique check (system_key is null or system_key in ('lead', 'primer_mes', 'pagando', 'alumno', 'solo_lectura')),
  created_at timestamptz not null default now()
);
create unique index if not exists crm_tags_name on public.crm_tags(lower(name));

insert into public.crm_tags (name, system_key) values
  ('Lead', 'lead'), ('Primer mes', 'primer_mes'), ('Pagando', 'pagando'), ('Alumno', 'alumno'), ('Solo lectura', 'solo_lectura')
on conflict do nothing;

create table if not exists public.crm_contact_tags (
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  tag_id uuid not null references public.crm_tags(id) on delete cascade,
  added_by text not null default 'admin' check (added_by in ('admin', 'automation', 'ingest', 'import')),
  added_at timestamptz not null default now(),
  primary key (contact_id, tag_id)
);
create index if not exists crm_contact_tags_tag on public.crm_contact_tags(tag_id);

-- Las etiquetas de sistema no se ponen a mano: salen de la etapa.
create or replace function public.crm_no_system_tag() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.crm_tags t where t.id = new.tag_id and t.system_key is not null) then
    raise exception 'system_tag';
  end if;
  return new;
end $$;
drop trigger if exists crm_no_system_tag on public.crm_contact_tags;
create trigger crm_no_system_tag before insert or update on public.crm_contact_tags
  for each row execute function public.crm_no_system_tag();

-- ───────────────────────── Eventos de actividad ─────────────────────────
-- Tipo + fecha + referencia (ids, fechas, porcentajes; nunca montos, nombres de metas ni datos personales).
-- Únicos por (contacto, tipo, ref): un aviso repetido de Stripe o un clic doble no duplican nada.
-- `processed_at` null = el motor aún no lo revisó para inscribir o sacar de automatizaciones.
create table if not exists public.crm_events (
  id bigint generated always as identity primary key,
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_]{2,40}$'),
  ref text not null default '' check (length(ref) <= 120),
  at timestamptz not null default now(),
  processed_at timestamptz,
  unique (contact_id, kind, ref)
);
create index if not exists crm_events_contact on public.crm_events(contact_id, at desc);
create index if not exists crm_events_pending on public.crm_events(id) where processed_at is null;

-- ───────────────────────── Campañas de correo ─────────────────────────
create table if not exists public.crm_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null default '' check (length(name) <= 120),
  subject text not null default '' check (length(subject) <= 200),
  preheader text not null default '' check (length(preheader) <= 200),
  -- Público: { "stages": [...], "tagIds": [...], "noAccount": bool } (src/lib/crm/schema.ts). Siempre + consentimiento.
  audience jsonb not null default '{"stages":[],"tagIds":[],"noAccount":false}'::jsonb check (jsonb_typeof(audience) = 'object'),
  -- Bloques del editor (título, texto, imagen, botón, clase de la Academia, separador, firma), validados con zod.
  blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks) = 'array'),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  send_mode text not null default 'now' check (send_mode in ('now', 'local')),
  scheduled_local text check (scheduled_local is null or scheduled_local ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'), -- hora de cada persona
  scheduled_at timestamptz,                    -- cuándo se confirmó (envío ahora) o primera zona que llega a la hora
  enqueue_cursor uuid,                         -- avance del encolado por lotes
  enqueued_at timestamptz,                     -- terminó de encolar
  sent_at timestamptz,                         -- salió el último correo
  recipients_count int not null default 0,
  sent_count int not null default 0,
  opened_count int not null default 0,
  clicked_count int not null default 0,
  bounced_count int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_campaigns_status on public.crm_campaigns(status);

-- ───────────────────────── Automatizaciones ─────────────────────────
create table if not exists public.crm_automations (
  id uuid primary key default gen_random_uuid(),
  name text not null default '' check (length(name) <= 120),
  -- Disparador: { "kind": "first_month_paid" | … , "days"?: n, "tagId"?: uuid, "form"?: text, "firstOnly"?: bool }
  trigger jsonb not null default '{}'::jsonb check (jsonb_typeof(trigger) = 'object'),
  -- Pasos: esperar, enviar correo, enviar SMS, condición (con ramas sí/no), etiquetar, salir. Cada paso lleva su id.
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array'),
  -- Salida: { "onUnsubscribe": true, "onCancel": true, "goal": { "kind": "signup" } | null }
  exit_rules jsonb not null default '{"onUnsubscribe":true,"onCancel":true,"goal":null}'::jsonb check (jsonb_typeof(exit_rules) = 'object'),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_enrollments (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.crm_automations(id) on delete cascade,
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  trigger_ref text not null default '' check (length(trigger_ref) <= 160),   -- evento que lo inscribió (tipo:ref)
  trigger_event_id bigint,
  status text not null default 'active' check (status in ('active', 'done', 'exited')),
  current_step_id text check (current_step_id is null or length(current_step_id) <= 40),
  next_at timestamptz,                         -- próximo momento en que el motor lo mira
  enrolled_at timestamptz not null default now(),
  finished_at timestamptz,
  exit_reason text check (exit_reason is null or exit_reason in ('unsubscribed', 'cancelled', 'goal', 'edited', 'paused', 'manual', 'deleted_step')),
  unique (automation_id, contact_id, trigger_ref)
);
-- Una sola inscripción ACTIVA por persona en cada automatización.
create unique index if not exists crm_enrollments_one_active on public.crm_enrollments(automation_id, contact_id) where status = 'active';
create index if not exists crm_enrollments_due on public.crm_enrollments(next_at) where status = 'active';
create index if not exists crm_enrollments_contact on public.crm_enrollments(contact_id);

-- ───────────────────────── Cola de envíos (outbox) ─────────────────────────
-- Única por (origen, contacto): nunca sale dos veces el mismo correo de una campaña o el mismo paso de una inscripción.
create table if not exists public.crm_messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  source_key text not null check (length(source_key) <= 200),   -- 'campaign:<id>' | 'auto:<automation>:<step>:<enrollment>'
  campaign_id uuid references public.crm_campaigns(id) on delete cascade,
  automation_id uuid references public.crm_automations(id) on delete cascade,
  enrollment_id uuid references public.crm_enrollments(id) on delete cascade,
  step_id text check (step_id is null or length(step_id) <= 40),
  scheduled_for timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'skipped', 'failed', 'held')),
  attempts int not null default 0,
  locked_at timestamptz,
  provider_id text,                              -- id de Resend o SID de Twilio
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  error text check (error is null or length(error) <= 200),   -- motivo técnico, sin direcciones ni contenido
  created_at timestamptz not null default now(),
  unique (source_key, contact_id)
);
create index if not exists crm_messages_due on public.crm_messages(channel, scheduled_for) where status in ('queued', 'sending');
create index if not exists crm_messages_campaign on public.crm_messages(campaign_id) where campaign_id is not null;
create index if not exists crm_messages_provider on public.crm_messages(provider_id) where provider_id is not null;
create index if not exists crm_messages_contact on public.crm_messages(contact_id, created_at desc);

-- ───────────────────────── Supresiones ─────────────────────────
-- Direcciones o teléfonos a los que nunca se envía marketing: baja, rebote, queja, STOP o a mano.
-- Sobreviven al contacto (si alguien borra su cuenta y se le vuelve a importar, sigue dada de baja).
-- `lifted_at`: la persona volvió a aceptar explícitamente (Perfil o preferencias). Un rebote no se levanta solo.
create table if not exists public.crm_suppressions (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email', 'sms')),
  value text not null check (length(value) between 3 and 254),     -- correo en minúsculas o teléfono E.164
  reason text not null check (reason in ('unsubscribe', 'bounce', 'complaint', 'stop', 'manual')),
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  unique (channel, value)
);

-- ───────────────────────── Permisos: solo el Dueño ─────────────────────────
alter table public.crm_contacts enable row level security;
alter table public.crm_tags enable row level security;
alter table public.crm_contact_tags enable row level security;
alter table public.crm_events enable row level security;
alter table public.crm_campaigns enable row level security;
alter table public.crm_automations enable row level security;
alter table public.crm_enrollments enable row level security;
alter table public.crm_messages enable row level security;
alter table public.crm_suppressions enable row level security;

drop policy if exists owner_all on public.crm_contacts;
create policy owner_all on public.crm_contacts for all to authenticated using ((select public.is_admin_owner())) with check ((select public.is_admin_owner()));
drop policy if exists owner_all on public.crm_tags;
create policy owner_all on public.crm_tags for all to authenticated using ((select public.is_admin_owner())) with check ((select public.is_admin_owner()));
drop policy if exists owner_all on public.crm_contact_tags;
create policy owner_all on public.crm_contact_tags for all to authenticated using ((select public.is_admin_owner())) with check ((select public.is_admin_owner()));
drop policy if exists owner_all on public.crm_events;
create policy owner_all on public.crm_events for all to authenticated using ((select public.is_admin_owner())) with check ((select public.is_admin_owner()));
drop policy if exists owner_all on public.crm_campaigns;
create policy owner_all on public.crm_campaigns for all to authenticated using ((select public.is_admin_owner())) with check ((select public.is_admin_owner()));
drop policy if exists owner_all on public.crm_automations;
create policy owner_all on public.crm_automations for all to authenticated using ((select public.is_admin_owner())) with check ((select public.is_admin_owner()));
drop policy if exists owner_all on public.crm_enrollments;
create policy owner_all on public.crm_enrollments for all to authenticated using ((select public.is_admin_owner())) with check ((select public.is_admin_owner()));
drop policy if exists owner_all on public.crm_messages;
create policy owner_all on public.crm_messages for all to authenticated using ((select public.is_admin_owner())) with check ((select public.is_admin_owner()));
drop policy if exists owner_all on public.crm_suppressions;
create policy owner_all on public.crm_suppressions for all to authenticated using ((select public.is_admin_owner())) with check ((select public.is_admin_owner()));

-- ───────────────────────── Usuario de la app → contacto ─────────────────────────
-- Crea o une el contacto de un usuario: primero por user_id; si no, por correo (un lead que creó su cuenta);
-- si no existe, lo crea con origen 'app'. Devuelve el id del contacto (o null si no hay correo).
create or replace function public.crm_link_user(p_user uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  p record;
  v_id uuid;
  v_email text;
begin
  select id, email, name, country, timezone, locale into p from public.profiles where id = p_user;
  if not found then return null; end if;
  v_email := lower(trim(coalesce(p.email, '')));
  select id into v_id from public.crm_contacts where user_id = p_user;
  if v_id is not null then return v_id; end if;
  if v_email = '' or v_email not like '%_@_%' then return null; end if;
  select id into v_id from public.crm_contacts where email = v_email and user_id is null;
  if v_id is not null then
    update public.crm_contacts
       set user_id = p_user,
           name = case when name = '' then left(coalesce(p.name, ''), 120) else name end,
           country = coalesce(country, left(p.country, 8)),
           timezone = coalesce(p.timezone, timezone),
           locale = case when p.locale in ('es', 'en') then p.locale else locale end,
           updated_at = now()
     where id = v_id;
    return v_id;
  end if;
  insert into public.crm_contacts (email, name, country, timezone, locale, user_id, source)
  values (v_email, left(coalesce(p.name, ''), 120), left(p.country, 8), p.timezone,
          case when p.locale in ('es', 'en') then p.locale else 'es' end, p_user, 'app')
  on conflict (email) do nothing
  returning id into v_id;
  return v_id;
end $$;

-- Disparador al crear o cambiar el correo de un perfil. NUNCA tumba el registro: cualquier error queda como aviso
-- en el log de Postgres (sin datos personales) y la cuenta se crea igual; el motor lo vuelve a intentar.
-- Consentimiento del registro: la casilla "Quiero recibir novedades y clases por correo" llega en
-- auth.users.raw_user_meta_data.marketing_email (true solo si la marcó). Desmarcada no retira un consentimiento previo.
create or replace function public.crm_on_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_meta jsonb;
  v_email text;
begin
  begin
    if tg_op = 'UPDATE' then
      v_email := lower(trim(coalesce(new.email, '')));
      if new.email is distinct from old.email and v_email like '%_@_%' then
        update public.crm_contacts set email = v_email, updated_at = now()
         where user_id = new.id
           and not exists (select 1 from public.crm_contacts c2 where c2.email = v_email and c2.user_id is distinct from new.id);
      end if;
      return new;
    end if;
    v_id := public.crm_link_user(new.id);
    if v_id is null then return new; end if;
    insert into public.crm_events (contact_id, kind, ref) values (v_id, 'signup', '') on conflict do nothing;
    update public.crm_contacts set last_activity_at = now() where id = v_id;
    select raw_user_meta_data into v_meta from auth.users where id = new.id;
    if coalesce(v_meta ->> 'marketing_email', '') = 'true' then
      perform public.crm_apply_consent(v_id, 'email', true, 'registro');
    end if;
  exception when others then
    raise warning 'crm_on_profile: %', sqlstate;
  end;
  return new;
end $$;

-- ───────────────────────── Consentimiento ─────────────────────────
-- Única puerta para cambiar un consentimiento (Perfil, preferencias por token, STOP/START de Twilio, ingreso de leads,
-- panel). Deja el evento en el historial y, al dar de baja, la supresión. Volver a aceptar levanta una baja o STOP
-- (no un rebote). p_source: 'registro' | 'perfil' | 'preferencias' | 'baja_un_clic' | 'sms_stop' | 'form:<origen>' | 'admin'…
create or replace function public.crm_apply_consent(p_contact uuid, p_channel text, p_on boolean, p_source text) returns void
language plpgsql security definer set search_path = public as $$
declare
  c record;
  v_value text;
begin
  if p_channel not in ('email', 'sms') then raise exception 'channel'; end if;
  select id, email, phone, email_consent, sms_consent into c from public.crm_contacts where id = p_contact for update;
  if not found then raise exception 'not_found'; end if;
  v_value := case when p_channel = 'email' then c.email else c.phone end;
  if p_on then
    if p_channel = 'sms' and c.phone is null then raise exception 'phone'; end if;
    if p_channel = 'email' then
      update public.crm_contacts set email_consent = true, email_consent_at = now(), email_consent_source = left(p_source, 60),
             email_unsubscribed_at = null, updated_at = now() where id = p_contact;
    else
      update public.crm_contacts set sms_consent = true, sms_consent_at = now(), sms_consent_source = left(p_source, 60),
             sms_unsubscribed_at = null, updated_at = now() where id = p_contact;
    end if;
    update public.crm_suppressions set lifted_at = now()
     where channel = p_channel and value = v_value and lifted_at is null and reason in ('unsubscribe', 'stop', 'complaint');
    if (p_channel = 'email' and not c.email_consent) or (p_channel = 'sms' and not c.sms_consent) then
      insert into public.crm_events (contact_id, kind, ref) values (p_contact, 'subscribed', p_channel || ':' || to_char(now(), 'YYYYMMDDHH24MISSMS'))
      on conflict do nothing;
    end if;
  else
    if p_channel = 'email' then
      update public.crm_contacts set email_consent = false,
             email_unsubscribed_at = case when email_consent or email_unsubscribed_at is null then now() else email_unsubscribed_at end,
             updated_at = now() where id = p_contact;
    else
      update public.crm_contacts set sms_consent = false,
             sms_unsubscribed_at = case when sms_consent or sms_unsubscribed_at is null then now() else sms_unsubscribed_at end,
             updated_at = now() where id = p_contact;
    end if;
    if v_value is not null then
      insert into public.crm_suppressions (channel, value, reason)
      values (p_channel, v_value, case when p_source = 'sms_stop' then 'stop' when p_source = 'admin' then 'manual' else 'unsubscribe' end)
      on conflict (channel, value) do update set reason = excluded.reason, created_at = now(), lifted_at = null;
    end if;
    insert into public.crm_events (contact_id, kind, ref) values (p_contact, 'unsubscribed', p_channel || ':' || to_char(now(), 'YYYYMMDDHH24MISSMS'))
    on conflict do nothing;
  end if;
end $$;

-- Puerta del panel y del servidor: el Dueño (sesión) o la clave de servicio.
create or replace function public.crm_set_consent(p_contact uuid, p_channel text, p_on boolean, p_source text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin_owner() then raise exception 'forbidden'; end if;
  perform public.crm_apply_consent(p_contact, p_channel, p_on, p_source);
end $$;

-- Perfil › Notificaciones: el usuario cambia SU consentimiento. null = no tocar ese canal.
-- p_phone: teléfono ya normalizado a E.164 por la app (src/lib/crm/phone.ts) o null para no cambiarlo.
create or replace function public.crm_set_my_consent(p_email boolean, p_sms boolean, p_phone text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  v_id := public.crm_link_user(auth.uid());
  if v_id is null then raise exception 'not_found'; end if;
  if p_phone is not null then
    if p_phone !~ '^\+[1-9][0-9]{6,14}$' then raise exception 'phone'; end if;
    update public.crm_contacts set phone = p_phone, updated_at = now() where id = v_id and phone is distinct from p_phone;
    -- Cambió el número: el consentimiento de SMS era para el anterior.
    if found then
      update public.crm_contacts set sms_consent = false, updated_at = now() where id = v_id and sms_consent;
    end if;
  end if;
  if p_email is not null then perform public.crm_apply_consent(v_id, 'email', p_email, 'perfil'); end if;
  if p_sms is not null then perform public.crm_apply_consent(v_id, 'sms', p_sms, 'perfil'); end if;
end $$;

-- Lo que ve Perfil: { email, sms, phone }. Sin contacto aún: todo apagado.
create or replace function public.crm_my_consent() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('email', c.email_consent, 'sms', c.sms_consent, 'phone', c.phone)
                     from public.crm_contacts c where c.user_id = auth.uid()),
                  jsonb_build_object('email', false, 'sms', false, 'phone', null));
$$;

-- ───────────────────────── Resumen de Contactos (panel) ─────────────────────────
create or replace function public.crm_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_total bigint;
  v_consent bigint;
begin
  if not public.is_admin_owner() then raise exception 'forbidden'; end if;
  select count(*), count(*) filter (where email_consent and email_unsubscribed_at is null) into v_total, v_consent from public.crm_contacts;
  return jsonb_build_object(
    'contacts', v_total,
    'new_week', (select count(*) from public.crm_contacts where created_at >= now() - interval '7 days'),
    'leads_no_account', (select count(*) from public.crm_contacts where user_id is null),
    'marketing_pct', case when v_total = 0 then 0 else round(100.0 * v_consent / v_total) end,
    'unsubscribed_30d', (select count(*) from public.crm_contacts
                          where email_unsubscribed_at >= now() - interval '30 days' or sms_unsubscribed_at >= now() - interval '30 days')
  );
end $$;

-- Personas dentro de cada automatización ("412 dentro").
create or replace function public.crm_automation_counts() returns table (automation_id uuid, active bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_owner() then raise exception 'forbidden'; end if;
  return query select e.automation_id, count(*) from public.crm_enrollments e where e.status = 'active' group by e.automation_id;
end $$;

-- ───────────────────────── Motor: cola y conteos (solo clave de servicio) ─────────────────────────
-- Toma un lote de la cola de forma atómica (dos corridas a la vez nunca toman el mismo mensaje).
-- Un correo que quedó "sending" más de 15 minutos se puede volver a tomar (Resend lo deduplica con la llave de
-- idempotencia = id del mensaje). Un SMS no: Twilio no deduplica, así que el motor lo marca fallido.
create or replace function public.crm_claim_messages(p_channel text, p_limit int) returns setof public.crm_messages
language sql security definer set search_path = public as $$
  update public.crm_messages m
     set status = 'sending', locked_at = now(), attempts = m.attempts + 1
   where m.id in (
     select q.id from public.crm_messages q
      where q.channel = p_channel
        and ((q.status = 'queued' and q.scheduled_for <= now())
             or (p_channel = 'email' and q.status = 'sending' and q.locked_at < now() - interval '15 minutes'))
      order by q.scheduled_for
      limit greatest(1, least(p_limit, 500))
      for update skip locked)
  returning m.*;
$$;

-- Recalcula los conteos de campañas desde la cola y marca "enviada" la que ya no tiene nada pendiente.
create or replace function public.crm_refresh_campaigns(p_ids uuid[]) returns void
language sql security definer set search_path = public as $$
  update public.crm_campaigns c set
    sent_count = s.sent, opened_count = s.opened, clicked_count = s.clicked, bounced_count = s.bounced,
    status = case when c.status = 'sending' and c.enqueued_at is not null and s.pending = 0 then 'sent' else c.status end,
    sent_at = case when c.status = 'sending' and c.enqueued_at is not null and s.pending = 0 then now() else c.sent_at end,
    updated_at = now()
  from (
    select x.id,
      (select count(*) from public.crm_messages m where m.campaign_id = x.id and m.status = 'sent') as sent,
      (select count(*) from public.crm_messages m where m.campaign_id = x.id and m.opened_at is not null) as opened,
      (select count(*) from public.crm_messages m where m.campaign_id = x.id and m.clicked_at is not null) as clicked,
      (select count(*) from public.crm_messages m where m.campaign_id = x.id and m.bounced_at is not null) as bounced,
      (select count(*) from public.crm_messages m where m.campaign_id = x.id and m.status in ('queued', 'sending')) as pending
    from unnest(p_ids) as x(id)
  ) s
  where c.id = s.id;
$$;

-- Webhook de Resend: entregado, abierto, clic, rebote o queja. Marca el mensaje (la primera vez), deja el evento del
-- contacto y, en rebote o queja, la supresión. Devuelve la campaña para recalcular sus conteos (o null).
create or replace function public.crm_message_event(p_provider_id text, p_kind text, p_at timestamptz) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  m record;
  v_email text;
begin
  select id, contact_id, campaign_id, opened_at, clicked_at, bounced_at, complained_at into m
    from public.crm_messages where provider_id = p_provider_id and channel = 'email' limit 1;
  if not found then return null; end if;
  if p_kind = 'delivered' then
    update public.crm_messages set delivered_at = coalesce(delivered_at, p_at) where id = m.id;
  elsif p_kind = 'opened' then
    update public.crm_messages set opened_at = coalesce(opened_at, p_at) where id = m.id;
    if m.opened_at is null then
      insert into public.crm_events (contact_id, kind, ref, at) values (m.contact_id, 'email_opened', m.id::text, p_at) on conflict do nothing;
    end if;
  elsif p_kind = 'clicked' then
    update public.crm_messages set clicked_at = coalesce(clicked_at, p_at), opened_at = coalesce(opened_at, p_at) where id = m.id;
    if m.clicked_at is null then
      insert into public.crm_events (contact_id, kind, ref, at) values (m.contact_id, 'email_clicked', m.id::text, p_at) on conflict do nothing;
    end if;
  elsif p_kind in ('bounced', 'complained') then
    if p_kind = 'bounced' then
      update public.crm_messages set bounced_at = coalesce(bounced_at, p_at) where id = m.id;
    else
      update public.crm_messages set complained_at = coalesce(complained_at, p_at) where id = m.id;
    end if;
    -- Queja: además se retira el consentimiento (antes de la supresión, para que quede con su motivo real).
    if p_kind = 'complained' then
      perform public.crm_apply_consent(m.contact_id, 'email', false, 'queja');
    end if;
    select email into v_email from public.crm_contacts where id = m.contact_id;
    if v_email is not null then
      insert into public.crm_suppressions (channel, value, reason) values ('email', v_email, case when p_kind = 'bounced' then 'bounce' else 'complaint' end)
      on conflict (channel, value) do update set reason = excluded.reason, created_at = now(), lifted_at = null;
    end if;
    insert into public.crm_events (contact_id, kind, ref, at) values (m.contact_id, 'email_' || p_kind, m.id::text, p_at) on conflict do nothing;
  else
    return null;
  end if;
  return m.campaign_id;
end $$;

-- ───────────────────────── Disparador: perfil → contacto ─────────────────────────
drop trigger if exists crm_on_profile on public.profiles;
create trigger crm_on_profile after insert or update of email on public.profiles
  for each row execute function public.crm_on_profile();

-- ───────────────────────── Permisos de las funciones ─────────────────────────
revoke execute on function public.crm_no_system_tag() from public, anon, authenticated;
revoke execute on function public.crm_on_profile() from public, anon, authenticated;
revoke execute on function public.crm_link_user(uuid) from public, anon, authenticated;
revoke execute on function public.crm_apply_consent(uuid, text, boolean, text) from public, anon, authenticated;
revoke execute on function public.crm_claim_messages(text, int) from public, anon, authenticated;
revoke execute on function public.crm_refresh_campaigns(uuid[]) from public, anon, authenticated;
revoke execute on function public.crm_message_event(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.crm_link_user(uuid), public.crm_apply_consent(uuid, text, boolean, text),
  public.crm_claim_messages(text, int), public.crm_refresh_campaigns(uuid[]), public.crm_message_event(text, text, timestamptz) to service_role;

revoke execute on function public.crm_set_consent(uuid, text, boolean, text) from public, anon;
revoke execute on function public.crm_set_my_consent(boolean, boolean, text) from public, anon;
revoke execute on function public.crm_my_consent() from public, anon;
revoke execute on function public.crm_summary() from public, anon;
revoke execute on function public.crm_automation_counts() from public, anon;
grant execute on function public.crm_set_consent(uuid, text, boolean, text), public.crm_set_my_consent(boolean, boolean, text),
  public.crm_my_consent(), public.crm_summary(), public.crm_automation_counts() to authenticated, service_role;

-- ───────────────────────── Cuentas que ya existen (idempotente) ─────────────────────────
-- Cada usuario actual queda como contacto (origen 'app', sin consentimiento de marketing: nunca lo dio).
-- Su evento "se registró" queda con su fecha real y ya procesado (no dispara automatizaciones con efecto retroactivo).
insert into public.crm_contacts (email, name, country, timezone, locale, user_id, source, created_at, last_activity_at)
select lower(trim(p.email)), left(coalesce(p.name, ''), 120), left(p.country, 8), p.timezone,
       case when p.locale in ('es', 'en') then p.locale else 'es' end, p.id, 'app', p.created_at, p.last_active_at
  from public.profiles p
 where lower(trim(coalesce(p.email, ''))) like '%_@_%'
on conflict do nothing;

insert into public.crm_events (contact_id, kind, ref, at, processed_at)
select c.id, 'signup', '', p.created_at, now()
  from public.crm_contacts c join public.profiles p on p.id = c.user_id
on conflict do nothing;
