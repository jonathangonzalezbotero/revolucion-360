-- Un solo plan (decisión del 25 nov 2026, CLAUDE.md regla 6): sin Gratis ni Pro.
-- SOLO AGREGA (CLAUDE.md, regla 0): una columna nueva con null, funciones nuevas y políticas recreadas.
-- No borra tablas, columnas ni filas. Como todas las funciones `admin_*`: verifican `is_admin()` y NUNCA devuelven montos.

-- ───────────── Academia: cada curso es para todos o solo para un grupo de alumnos ─────────────
-- null = lo ven todos. Sin `on delete set null` a propósito: borrar un grupo no debe publicar su curso para todos.
alter table public.courses add column if not exists visible_group_id uuid null references public.groups(id);
create index if not exists courses_visible_group_id_idx on public.courses(visible_group_id);

-- ¿El usuario actual puede ver este curso? Admin siempre; si el curso es de un grupo, solo sus miembros.
-- `security definer`: `group_members` solo la lee el admin (RLS), así que la consulta no puede correr como el usuario.
create or replace function public.course_visible(p_course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.courses c
     where c.id = p_course
       and (c.visible_group_id is null
            or exists (select 1 from public.group_members gm where gm.group_id = c.visible_group_id and gm.user_id = auth.uid())));
$$;
revoke execute on function public.course_visible(uuid) from public, anon;
grant execute on function public.course_visible(uuid) to authenticated;

-- Cursos: publicados o programados, y visibles para el usuario.
drop policy if exists read_live on public.courses;
create policy read_live on public.courses for select to authenticated using (
  public.is_admin() or (status in ('published','scheduled') and public.course_visible(id)));

-- Módulos y clases: del curso liberado y visible.
drop policy if exists read_live on public.course_modules;
create policy read_live on public.course_modules for select to authenticated using (
  public.is_admin() or (public.course_live(course_id) and public.course_visible(course_id)));

drop policy if exists read_live on public.lessons;
create policy read_live on public.lessons for select to authenticated using (
  public.is_admin() or (public.course_live(course_id) and public.course_visible(course_id)));

-- Video de la clase: ya no depende de Gratis/Pro (la columna `tier` se conserva, pero no se usa).
drop policy if exists read_allowed on public.lesson_media;
create policy read_allowed on public.lesson_media for select to authenticated using (
  public.is_admin() or exists (select 1 from public.lessons l
    where l.id = lesson_id and public.course_live(l.course_id) and public.course_visible(l.course_id)));

-- Comentarios: solo en clases que el usuario puede ver.
drop policy if exists read_visible on public.lesson_comments;
create policy read_visible on public.lesson_comments for select to authenticated using (
  public.is_admin() or (hidden_at is null and exists (select 1 from public.lessons l
    where l.id = lesson_id and public.course_live(l.course_id) and public.course_visible(l.course_id))));
drop policy if exists own_insert on public.lesson_comments;
create policy own_insert on public.lesson_comments for insert to authenticated with check (
  user_id = auth.uid() and public.can_write() and hidden_at is null
  and exists (select 1 from public.lessons l
    where l.id = lesson_id and public.course_live(l.course_id) and public.course_visible(l.course_id)));

-- Marcar una clase como vista: solo en clases que el usuario puede ver (y respetando la solo lectura, como en 015).
-- El admin puede marcar también las de un borrador que esté revisando en la app.
drop policy if exists own_insert on public.lesson_progress;
create policy own_insert on public.lesson_progress for insert to authenticated with check (
  user_id = auth.uid() and public.can_write()
  and (public.is_admin() or exists (select 1 from public.lessons l
    where l.id = lesson_id and public.course_live(l.course_id) and public.course_visible(l.course_id))));

-- ───────────── Resumen del panel: quién paga y el camino del primer mes ─────────────
-- Solo conteos (el ingreso lo calcula la pantalla: conteo × precio de `app_config.billing`). Nunca montos de usuarios.
-- Estados (igual que el pago con Stripe: `trialing` cuenta como pagando):
--   primer mes = state 'pro' con stripe_status 'trialing' (pagó $1 y está en sus primeros 30 días)
--   mensual    = state 'pro', billing_interval 'month', ya fuera del primer mes
--   anual      = state 'pro', billing_interval 'year', fuera del primer mes
-- Camino: personas que se registraron en el periodo y pusieron su tarjeta (tienen suscripción en Stripe).
--   De ellas: terminaron el asistente, volvieron la semana siguiente, hicieron su primer cierre y siguieron pagando
--   (state 'pro' y ya no 'trialing').
create or replace function public.admin_plan_summary(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 3650)));
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return (
    with paid as (
      select p.id
        from public.profiles p join public.entitlements e on e.user_id = p.id
       where p.created_at >= since and e.stripe_subscription_id is not null
    )
    select jsonb_build_object(
      'first_month', (select count(*) from public.entitlements where state = 'pro' and stripe_status = 'trialing'),
      'monthly', (select count(*) from public.entitlements where state = 'pro' and billing_interval = 'month' and coalesce(stripe_status, '') <> 'trialing'),
      'yearly', (select count(*) from public.entitlements where state = 'pro' and billing_interval = 'year' and coalesce(stripe_status, '') <> 'trialing'),
      'funnel', jsonb_build_object(
        'paid_first', (select count(*) from paid),
        'wizard', (select count(*) from paid where exists (select 1 from public.product_events pe where pe.user_id = paid.id and pe.name = 'wizard_done')),
        'returned', (select count(*) from paid where exists (select 1 from public.product_events pe where pe.user_id = paid.id and pe.name = 'returned_week')),
        'closure', (select count(*) from paid where exists (select 1 from public.product_events pe where pe.user_id = paid.id and pe.name = 'first_closure')),
        'kept', (select count(*) from paid join public.entitlements e on e.user_id = paid.id
                  where e.state = 'pro' and coalesce(e.stripe_status, '') <> 'trialing'))
    )
  );
end $$;
revoke execute on function public.admin_plan_summary(int) from public, anon;
grant execute on function public.admin_plan_summary(int) to authenticated;

-- ───────────── Usuarios: filtros del plan único ─────────────
-- Igual que `admin_users_v2` (mismas columnas y filtros) más `trial_ends_at`, `billing_interval`, `stripe_status` y:
--   p_filter 'first_month' | 'monthly' | 'yearly' (ver arriba) · 'free_access' (alumno o fundador) · 'inactive' (sin activar, state 'free').
create or replace function public.admin_users_v3(
  p_search text default '', p_filter text default 'all', p_role text default '', p_country text default '', p_email text default '',
  p_limit int default 50, p_offset int default 0)
returns table (id uuid, email text, name text, country text, role text, state text, access_until timestamptz, pro_until timestamptz,
               trial_ends_at timestamptz, billing_interval text, stripe_status text,
               payment_failed_at timestamptz, suspended_at timestamptz, created_at timestamptz, last_active_at timestamptz,
               groups text[], total bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
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
revoke execute on function public.admin_users_v3(text, text, text, text, text, int, int) from public, anon;
grant execute on function public.admin_users_v3(text, text, text, text, text, int, int) to authenticated;
