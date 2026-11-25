-- Subroles de administrador (decisión del 25 nov 2026): Dueño, Contenido y Soporte.
--   Dueño    (owner):   todo. Es el ÚNICO que invita administradores, asigna o quita subroles y cambia
--                       Menú y funciones, Planes y precios (app_config, price_regions, coupons).
--   Contenido (content): Academia (courses, course_modules, lessons, lesson_media, lesson_comments)
--                       y Contenido por país (countries; en app_config solo las claves 'points', 'diag_cta' y 'legal').
--   Soporte  (support): Soporte y privacidad (support_tickets, ticket_messages, privacy_requests, faqs) y
--                       Usuarios y accesos (access_grants, groups, group_members, invite_codes, admin_notes y las
--                       funciones admin_users, admin_users_v2, admin_users_v3, admin_user, admin_emails,
--                       admin_grant_access, admin_revoke_access, admin_set_suspended).
-- Las funciones existentes se redefinen con el MISMO cuerpo y solo cambia la línea de permiso (002, 027 y 029).
--   Todos: Resumen (admin_summary, admin_plan_summary, admin_academy_dropoff), su propia actividad y la lista de
--   administradores. 2 pasos obligatorios para todos: todo sigue pasando por `is_admin()`, que no cambia.
--
-- Compatibilidad SIN UPDATE: `profiles.admin_role` es null para todas las filas actuales y null en un admin = Dueño.
-- Así la cuenta admin que existe hoy queda como Dueño sin intervención. Ningún camino de la app crea un admin con
-- null: `admin_invite` y `admin_set_role` siempre escriben un subrol explícito. Solo un cambio a mano en la base
-- (role = 'admin' sin subrol) da un Dueño, igual que hoy.
--
-- SOLO AGREGA (CLAUDE.md, regla 0): una columna con null, funciones nuevas o `create or replace`, y políticas
-- cambiadas en sitio (`alter policy`) o recreadas. No borra tablas, columnas ni filas. Nunca debilita lo existente:
-- cada permiso nuevo es un subconjunto de lo que ya exigía `is_admin()`. Admin sigue sin ver montos (regla 4).

-- ───────────── Columna ─────────────
alter table public.profiles add column if not exists admin_role text
  check (admin_role is null or admin_role in ('owner', 'content', 'support'));

-- ───────────── Funciones de apoyo ─────────────
-- Subrol de quien llama: 'owner' | 'content' | 'support', o null si no es admin (o no tiene los 2 pasos).
create or replace function public.my_admin_role() returns text
language sql stable security definer set search_path = public as $$
  select case when public.is_admin()
    then (select coalesce(p.admin_role, 'owner') from public.profiles p where p.id = auth.uid()) end;
$$;

create or replace function public.is_admin_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_admin_role() = 'owner', false);
$$;

-- p_section: 'contenido' | 'soporte'. El Dueño puede todo.
create or replace function public.is_admin_of(p_section text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(case public.my_admin_role()
    when 'owner' then true
    when 'content' then p_section = 'contenido'
    when 'support' then p_section = 'soporte'
    else false end, false);
$$;

-- ───────────── El perfil: nadie se sube el rol ni el subrol ─────────────
-- Antes, un admin podía editar su propia fila sin restricción (política own_update). Ahora rol y subrol solo los
-- cambia el Dueño, y sobre OTRA cuenta: nadie, ni el Dueño, cambia los suyos (así nunca quedan cero dueños). Suspensión y correo
-- siguen como estaban (los protege `is_admin()`).
create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' then
    if not public.is_admin() then
      new.role := old.role;
      new.suspended_at := old.suspended_at;
      new.email := old.email;
    end if;
    if not public.is_admin_owner() or old.id = auth.uid() then
      new.role := old.role;
      new.admin_role := old.admin_role;
    end if;
  end if;
  return new;
end $$;

-- ───────────── Políticas: Usuarios y accesos (Soporte) ─────────────
alter policy own_select on public.access_grants using (user_id = auth.uid() or (select public.is_admin_of('soporte')));
alter policy admin_write on public.access_grants using ((select public.is_admin_of('soporte'))) with check ((select public.is_admin_of('soporte')));

alter policy admin_all on public.invite_codes using ((select public.is_admin_of('soporte'))) with check ((select public.is_admin_of('soporte')));
alter policy admin_all on public.admin_notes using ((select public.is_admin_of('soporte'))) with check ((select public.is_admin_of('soporte')));

-- Grupos: los escribe Soporte; los lee todo admin (Contenido elige el grupo que ve un curso).
alter policy admin_all on public.groups using ((select public.is_admin_of('soporte'))) with check ((select public.is_admin_of('soporte')));
alter policy admin_all on public.group_members using ((select public.is_admin_of('soporte'))) with check ((select public.is_admin_of('soporte')));
drop policy if exists admin_read on public.groups;
create policy admin_read on public.groups for select to authenticated using ((select public.is_admin()));
drop policy if exists admin_read on public.group_members;
create policy admin_read on public.group_members for select to authenticated using ((select public.is_admin()));

-- ───────────── Políticas: Soporte y privacidad (Soporte) ─────────────
alter policy own_select on public.support_tickets using (user_id = auth.uid() or (select public.is_admin_of('soporte')));
alter policy admin_update on public.support_tickets
  using ((select public.is_admin_of('soporte')) or user_id = auth.uid()) with check ((select public.is_admin_of('soporte')) or user_id = auth.uid());
alter policy read_msgs on public.ticket_messages
  using ((select public.is_admin_of('soporte')) or exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid()));
alter policy write_msgs on public.ticket_messages
  with check (((select public.is_admin_of('soporte')) and from_admin) or (not from_admin and author_id = auth.uid()
    and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())));
alter policy own_select on public.privacy_requests using (user_id = auth.uid() or (select public.is_admin_of('soporte')));
alter policy own_cancel on public.privacy_requests
  using (user_id = auth.uid() or (select public.is_admin_of('soporte'))) with check (user_id = auth.uid() or (select public.is_admin_of('soporte')));
alter policy admin_write on public.faqs using ((select public.is_admin_of('soporte'))) with check ((select public.is_admin_of('soporte')));

-- ───────────── Políticas: Academia y Contenido por país (Contenido) ─────────────
alter policy admin_write on public.courses using ((select public.is_admin_of('contenido'))) with check ((select public.is_admin_of('contenido')));
alter policy admin_write on public.course_modules using ((select public.is_admin_of('contenido'))) with check ((select public.is_admin_of('contenido')));
alter policy admin_write on public.lessons using ((select public.is_admin_of('contenido'))) with check ((select public.is_admin_of('contenido')));
alter policy admin_write on public.lesson_media using ((select public.is_admin_of('contenido'))) with check ((select public.is_admin_of('contenido')));
alter policy own_delete on public.lesson_comments using (user_id = auth.uid() or (select public.is_admin_of('contenido')));
alter policy admin_update on public.lesson_comments using ((select public.is_admin_of('contenido'))) with check ((select public.is_admin_of('contenido')));
alter policy admin_write on public.countries using ((select public.is_admin_of('contenido'))) with check ((select public.is_admin_of('contenido')));

-- ───────────── Políticas: configuración y cobro (Dueño) ─────────────
-- app_config guarda, entre otras, `admin_mfa_required` (2 pasos del panel), `menu`, `features` y el cobro:
-- solo el Dueño. Contenido escribe únicamente las tres claves de sus pantallas (puntos de la Academia, siguiente
-- paso del Diagnóstico y datos legales de Contenido por país), y nunca borra.
alter policy admin_write on public.app_config using ((select public.is_admin_owner())) with check ((select public.is_admin_owner()));
drop policy if exists content_insert on public.app_config;
create policy content_insert on public.app_config for insert to authenticated
  with check ((select public.is_admin_of('contenido')) and key in ('points', 'diag_cta', 'legal'));
drop policy if exists content_update on public.app_config;
create policy content_update on public.app_config for update to authenticated
  using ((select public.is_admin_of('contenido')) and key in ('points', 'diag_cta', 'legal'))
  with check ((select public.is_admin_of('contenido')) and key in ('points', 'diag_cta', 'legal'));
alter policy admin_write on public.price_regions using ((select public.is_admin_owner())) with check ((select public.is_admin_owner()));
alter policy admin_all on public.coupons using ((select public.is_admin_owner())) with check ((select public.is_admin_owner()));

-- ───────────── Registro de actividad ─────────────
-- El Dueño ve todo; los demás, solo lo que hicieron ellos. Nadie lo edita ni lo borra: se escribe solo con
-- `admin_log` (security definer), así que la política "para todo" se reemplaza por una de solo lectura.
drop policy if exists admin_all on public.admin_audit;
drop policy if exists admin_read on public.admin_audit;
create policy admin_read on public.admin_audit for select to authenticated
  using ((select public.is_admin_owner()) or ((select public.is_admin()) and admin_id = auth.uid()));

-- ───────────── Funciones de usuarios (Soporte): mismo cuerpo, con el permiso del subrol ─────────────
create or replace function public.admin_users(p_search text default '', p_filter text default 'all', p_limit int default 50, p_offset int default 0)
returns table (id uuid, email text, name text, country text, role text, state text, access_until timestamptz, pro_until timestamptz,
               payment_failed_at timestamptz, suspended_at timestamptz, created_at timestamptz, last_active_at timestamptz,
               groups text[], total bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_of('soporte') then raise exception 'forbidden'; end if;
  return query
  select p.id, p.email, p.name, p.country, p.role, e.state, e.access_until, e.pro_until, e.payment_failed_at, p.suspended_at,
         p.created_at, p.last_active_at,
         coalesce((select array_agg(g.name order by g.name) from public.group_members gm join public.groups g on g.id = gm.group_id where gm.user_id = p.id), '{}'),
         count(*) over ()
    from public.profiles p join public.entitlements e on e.user_id = p.id
   where (p_search = '' or p.email ilike '%' || p_search || '%' or p.name ilike '%' || p_search || '%')
     and (p_filter = 'all' or e.state = p_filter
          or (p_filter = 'failed' and e.payment_failed_at is not null)
          or (p_filter = 'expiring' and e.access_until between now() and now() + interval '30 days')
          or (p_filter = 'suspended' and p.suspended_at is not null))
   order by p.created_at desc limit p_limit offset p_offset;
end $$;

create or replace function public.admin_users_v2(
  p_search text default '', p_filter text default 'all', p_role text default '', p_country text default '', p_email text default '',
  p_limit int default 50, p_offset int default 0)
returns table (id uuid, email text, name text, country text, role text, state text, access_until timestamptz, pro_until timestamptz,
               payment_failed_at timestamptz, suspended_at timestamptz, created_at timestamptz, last_active_at timestamptz,
               groups text[], total bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_of('soporte') then raise exception 'forbidden'; end if;
  return query
  select p.id, p.email, p.name, p.country, p.role, e.state, e.access_until, e.pro_until, e.payment_failed_at, p.suspended_at,
         p.created_at, p.last_active_at,
         coalesce((select array_agg(g.name order by g.name) from public.group_members gm join public.groups g on g.id = gm.group_id where gm.user_id = p.id), '{}'),
         count(*) over ()
    from public.profiles p join public.entitlements e on e.user_id = p.id
   where (coalesce(p_search, '') = '' or p.email ilike '%' || p_search || '%' or p.name ilike '%' || p_search || '%')
     and (coalesce(p_email, '') = '' or lower(p.email) = lower(trim(p_email)))
     and (coalesce(p_role, '') = '' or p.role = p_role)
     and (coalesce(p_country, '') = ''
          or (p_country = 'otro' and not exists (select 1 from public.countries c where c.code = p.country))
          or p.country = p_country)
     and (coalesce(p_filter, 'all') = 'all' or e.state = p_filter
          or (p_filter = 'failed' and e.payment_failed_at is not null)
          or (p_filter = 'expiring' and e.access_until between now() and now() + interval '30 days')
          or (p_filter = 'expiring7' and e.access_until between now() and now() + interval '7 days')
          or (p_filter = 'suspended' and p.suspended_at is not null))
   order by p.created_at desc
   limit greatest(0, least(coalesce(p_limit, 50), 1000)) offset greatest(0, coalesce(p_offset, 0));
end $$;

-- Copia de `admin_users_v3` de 20261125000029_un_plan.sql, solo con el permiso de Soporte. PUNTO DE SINCRONÍA:
-- si la 29 cambia el cuerpo antes de aplicarse, esta copia debe cambiar igual (esta migración corre después y la pisa).
create or replace function public.admin_users_v3(
  p_search text default '', p_filter text default 'all', p_role text default '', p_country text default '', p_email text default '',
  p_limit int default 50, p_offset int default 0)
returns table (id uuid, email text, name text, country text, role text, state text, access_until timestamptz, pro_until timestamptz,
               trial_ends_at timestamptz, billing_interval text, stripe_status text,
               payment_failed_at timestamptz, suspended_at timestamptz, created_at timestamptz, last_active_at timestamptz,
               groups text[], total bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_of('soporte') then raise exception 'forbidden'; end if;
  return query
  select p.id, p.email, p.name, p.country, p.role, e.state, e.access_until, e.pro_until,
         e.trial_ends_at, e.billing_interval, e.stripe_status,
         e.payment_failed_at, p.suspended_at, p.created_at, p.last_active_at,
         coalesce((select array_agg(g.name order by g.name) from public.group_members gm join public.groups g on g.id = gm.group_id where gm.user_id = p.id), '{}'),
         count(*) over ()
    from public.profiles p join public.entitlements e on e.user_id = p.id
   where (coalesce(p_search, '') = '' or p.email ilike '%' || p_search || '%' or p.name ilike '%' || p_search || '%')
     and (coalesce(p_email, '') = '' or lower(p.email) = lower(trim(p_email)))
     and (coalesce(p_role, '') = '' or p.role = p_role)
     and (coalesce(p_country, '') = ''
          or (p_country = 'otro' and not exists (select 1 from public.countries c where c.code = p.country))
          or p.country = p_country)
     and (coalesce(p_filter, 'all') = 'all'
          or (p_filter in ('free','trial','pro','alumno','fundador','read_only') and e.state = p_filter)
          or (p_filter = 'inactive' and e.state = 'free')
          or (p_filter = 'first_month' and e.state = 'pro' and e.stripe_status = 'trialing')
          or (p_filter = 'monthly' and e.state = 'pro' and e.billing_interval = 'month' and coalesce(e.stripe_status, '') <> 'trialing')
          or (p_filter = 'yearly' and e.state = 'pro' and e.billing_interval = 'year' and coalesce(e.stripe_status, '') <> 'trialing')
          or (p_filter = 'free_access' and e.state in ('alumno','fundador'))
          or (p_filter = 'failed' and e.payment_failed_at is not null)
          or (p_filter = 'expiring' and e.access_until between now() and now() + interval '30 days')
          or (p_filter = 'expiring7' and e.access_until between now() and now() + interval '7 days')
          or (p_filter = 'suspended' and p.suspended_at is not null))
   order by p.created_at desc
   limit greatest(0, least(coalesce(p_limit, 50), 1000)) offset greatest(0, coalesce(p_offset, 0));
end $$;

-- Ficha de un usuario. Soporte no gestiona administradores: la ficha de OTRO admin solo la ve el Dueño
-- (así Soporte tampoco puede reiniciar sus 2 pasos ni borrarlo, que pasan por esta función).
create or replace function public.admin_user(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin_of('soporte') then raise exception 'forbidden'; end if;
  if p_user <> auth.uid() and not public.is_admin_owner()
     and exists (select 1 from public.profiles x where x.id = p_user and x.role = 'admin') then
    return null;
  end if;
  select jsonb_build_object(
    'id', p.id, 'email', p.email, 'name', p.name, 'country', p.country, 'role', p.role, 'created_at', p.created_at,
    'last_active_at', p.last_active_at, 'suspended_at', p.suspended_at, 'onboarding_step', p.onboarding_step,
    'state', e.state, 'access_until', e.access_until, 'pro_until', e.pro_until, 'trial_ends_at', e.trial_ends_at,
    'billing_interval', e.billing_interval, 'payment_failed_at', e.payment_failed_at, 'cancel_at_period_end', e.cancel_at_period_end,
    'lessons_done', (select count(*) from public.lesson_progress where user_id = p.id),
    'closures', (select count(*) from public.month_closures where user_id = p.id),
    'points', (select coalesce(sum(points), 0) from public.point_events where user_id = p.id),
    'badges', (select count(*) from public.user_badges where user_id = p.id),
    'weeks_active', (select count(*) from public.activity_weeks where user_id = p.id and not wildcard),
    'grants', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'kind', g.kind, 'expires_at', g.expires_at, 'revoked_at', g.revoked_at, 'created_at', g.created_at, 'invite_code', g.invite_code) order by g.created_at desc), '[]') from public.access_grants g where g.user_id = p.id),
    'groups', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name)), '[]') from public.group_members gm join public.groups g on g.id = gm.group_id where gm.user_id = p.id),
    'notes', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'created_at', n.created_at) order by n.created_at desc), '[]') from public.admin_notes n where n.user_id = p.id),
    'privacy', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'status', r.status, 'requested_at', r.requested_at, 'due_at', r.due_at)), '[]') from public.privacy_requests r where r.user_id = p.id)
  ) into r
  from public.profiles p join public.entitlements e on e.user_id = p.id where p.id = p_user;
  return r;
end $$;

create or replace function public.admin_emails(p_ids uuid[])
returns table (id uuid, email text, name text, locale text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_of('soporte') then raise exception 'forbidden'; end if;
  if coalesce(array_length(p_ids, 1), 0) > 1000 then raise exception 'too_many'; end if;
  return query
  select p.id, p.email, p.name, p.locale
    from public.profiles p
   where p.id = any(coalesce(p_ids, '{}'::uuid[]));
end $$;

create or replace function public.admin_grant_access(p_user uuid, p_kind text, p_expires timestamptz, p_group uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_of('soporte') then raise exception 'forbidden'; end if;
  insert into public.access_grants (user_id, kind, expires_at, group_id, granted_by) values (p_user, p_kind, p_expires, p_group, auth.uid());
  update public.entitlements set state = p_kind, access_until = p_expires, updated_at = now()
   where user_id = p_user and state <> 'pro';
  insert into public.notifications (user_id, kind, title, body, href, dedupe)
  values (p_user, 'acceso', 'Tienes acceso completo', 'Revolución del Dinero te dio acceso gratis a todo.', '/suscripcion', 'grant-' || now()::date)
  on conflict do nothing;
  perform public.admin_log('dar_acceso', p_user, jsonb_build_object('kind', p_kind, 'expires_at', p_expires, 'group', p_group));
end $$;

create or replace function public.admin_revoke_access(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_of('soporte') then raise exception 'forbidden'; end if;
  update public.access_grants set revoked_at = now() where user_id = p_user and revoked_at is null;
  update public.entitlements set state = 'free', access_until = null, updated_at = now()
   where user_id = p_user and state in ('alumno','fundador');
  perform public.admin_log('quitar_acceso', p_user, '{}'::jsonb);
end $$;

-- Soporte no suspende a otro administrador (solo el Dueño puede).
create or replace function public.admin_set_suspended(p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_of('soporte') then raise exception 'forbidden'; end if;
  if not public.is_admin_owner() and exists (select 1 from public.profiles x where x.id = p_user and x.role = 'admin') then
    raise exception 'forbidden';
  end if;
  update public.profiles set suspended_at = case when p_on then now() else null end where id = p_user;
  perform public.admin_log(case when p_on then 'suspender' else 'reactivar' end, p_user, '{}'::jsonb);
end $$;

-- ───────────── Roles (solo el Dueño) ─────────────
-- Cambiar el rol desde la ficha de un usuario: solo el Dueño y nunca sobre sí mismo (siempre queda al menos un Dueño:
-- el que actúa). Hacer admin a alguien le da el subrol de MENOR permiso, Soporte, salvo que ya tenga uno; el Dueño
-- lo cambia después en Registro de actividad › Administradores. Quitar el rol borra el subrol.
create or replace function public.admin_set_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare cur text;
begin
  if not public.is_admin_owner() or p_role not in ('user','admin') or p_user = auth.uid() then raise exception 'forbidden'; end if;
  -- null si aún no es admin; un admin sin subrol es Dueño (cuenta heredada) y lo sigue siendo.
  select coalesce(x.admin_role, 'owner') into cur from public.profiles x where x.id = p_user and x.role = 'admin';
  update public.profiles
     set role = p_role,
         admin_role = case when p_role = 'admin' then coalesce(cur, 'support') else null end
   where id = p_user;
  perform public.admin_log('cambiar_rol', p_user, jsonb_build_object('role', p_role,
    'admin_role', case when p_role = 'admin' then coalesce(cur, 'support') end));
end $$;

-- "+ Invitar administrador": el Dueño escribe el correo de una cuenta que YA existe y elige el subrol.
-- Devuelve 'ok' | 'not_found' (no hay cuenta: que se registre primero) | 'suspended' | 'self' | 'same' (ya tiene ese subrol).
create or replace function public.admin_invite(p_email text, p_role text) returns text
language plpgsql security definer set search_path = public as $$
declare target public.profiles%rowtype;
begin
  if not public.is_admin_owner() or p_role not in ('owner','content','support') then raise exception 'forbidden'; end if;
  select * into target from public.profiles p where lower(p.email) = lower(trim(coalesce(p_email, ''))) limit 1;
  if not found then return 'not_found'; end if;
  if target.id = auth.uid() then return 'self'; end if;
  if target.suspended_at is not null then return 'suspended'; end if;
  if target.role = 'admin' and coalesce(target.admin_role, 'owner') = p_role then return 'same'; end if;
  update public.profiles set role = 'admin', admin_role = p_role where id = target.id;
  perform public.admin_log(case when target.role = 'admin' then 'cambiar_rol_admin' else 'cambiar_rol_invitar' end,
    target.id, jsonb_build_object('admin_role', p_role));
  return 'ok';
end $$;

-- Cambia el subrol de un administrador, o lo saca del panel ('none' = vuelve a ser usuario). Nunca sobre sí mismo.
create or replace function public.admin_set_admin_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_owner() or p_role not in ('owner','content','support','none') or p_user = auth.uid() then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.profiles x where x.id = p_user and x.role = 'admin') then raise exception 'not_admin'; end if;
  if p_role = 'none' then
    update public.profiles set role = 'user', admin_role = null where id = p_user;
    perform public.admin_log('cambiar_rol_quitar', p_user, jsonb_build_object('role', 'user'));
  else
    update public.profiles set admin_role = p_role where id = p_user;
    perform public.admin_log('cambiar_rol_admin', p_user, jsonb_build_object('admin_role', p_role));
  end if;
end $$;

-- Tabla "Administradores": nombre, subrol y si tiene los 2 pasos activos (factor verificado en Auth).
-- Solo para un admin; no expone nada de Auth más allá de ese sí/no.
create or replace function public.admin_admins()
returns table (id uuid, email text, name text, admin_role text, mfa boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
  select p.id, p.email, p.name, coalesce(p.admin_role, 'owner'),
         exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified')
    from public.profiles p
   where p.role = 'admin' and p.suspended_at is null
   order by case coalesce(p.admin_role, 'owner') when 'owner' then 0 when 'content' then 1 else 2 end, p.created_at;
end $$;

-- ───────────── Permisos: solo usuarios con sesión (y adentro, solo admin) ─────────────
revoke execute on function public.my_admin_role() from public, anon;
revoke execute on function public.is_admin_owner() from public, anon;
revoke execute on function public.is_admin_of(text) from public, anon;
revoke execute on function public.admin_invite(text, text) from public, anon;
revoke execute on function public.admin_set_admin_role(uuid, text) from public, anon;
revoke execute on function public.admin_admins() from public, anon;
grant execute on function public.my_admin_role() to authenticated;
grant execute on function public.is_admin_owner() to authenticated;
grant execute on function public.is_admin_of(text) to authenticated;
grant execute on function public.admin_invite(text, text) to authenticated;
grant execute on function public.admin_set_admin_role(uuid, text) to authenticated;
grant execute on function public.admin_admins() to authenticated;
