-- Mejoras del panel de administración (parte 1, ESTADO.md 3b): correos en lote, filtros de usuarios y
-- "dónde más abandonan" en la Academia.
-- SOLO AGREGA funciones nuevas (CLAUDE.md, regla 0): no toca tablas ni datos, y no cambia `admin_users`
-- (la nueva `admin_users_v2` vive a su lado; la vieja sigue funcionando).
-- Como todas las funciones `admin_*`: verifican `is_admin()` y NUNCA devuelven montos.

-- ───────────── Correos en lote ─────────────
-- El admin no puede leer `profiles` ajenos (RLS). Esto reemplaza pedir `admin_user` de a uno.
-- `locale` sirve para escribir los correos en el idioma de cada usuario.
create or replace function public.admin_emails(p_ids uuid[])
returns table (id uuid, email text, name text, locale text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if coalesce(array_length(p_ids, 1), 0) > 1000 then raise exception 'too_many'; end if;
  return query
  select p.id, p.email, p.name, p.locale
    from public.profiles p
   where p.id = any(coalesce(p_ids, '{}'::uuid[]));
end $$;

-- ───────────── Lista de usuarios con más filtros ─────────────
-- Igual que `admin_users` (mismas columnas) más:
--   p_filter 'expiring7' → acceso gratis que vence en 7 días (el mismo criterio que cuenta `admin_summary`).
--   p_role   ''|'user'|'admin'.
--   p_country '' (todos) | código de país | 'otro' (país que no está en `countries`).
--   p_email  correo exacto (sin importar mayúsculas); vacío = sin filtro.
create or replace function public.admin_users_v2(
  p_search text default '', p_filter text default 'all', p_role text default '', p_country text default '', p_email text default '',
  p_limit int default 50, p_offset int default 0)
returns table (id uuid, email text, name text, country text, role text, state text, access_until timestamptz, pro_until timestamptz,
               payment_failed_at timestamptz, suspended_at timestamptz, created_at timestamptz, last_active_at timestamptz,
               groups text[], total bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
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

-- ───────────── Academia: dónde más abandonan ─────────────
-- Definición: alumnos que EMPEZARON un curso (su primera clase vista del curso) desde `p_since` y no lo terminaron.
-- Para cada uno se toma la clase más avanzada que vio de ese curso (en el orden de la app: módulo, con las clases
-- sin módulo al final; luego `sort`; luego id). Como no vio la siguiente, "se quedó" en esa clase.
-- Devuelve la clase donde más alumnos se quedaron (sin filas si nadie). Solo cursos publicados (o programados ya visibles).
-- No lee nada financiero: solo clases, cursos y avance.
create or replace function public.admin_academy_dropoff(p_since timestamptz default null)
returns table (lesson_id uuid, lesson_title text, course_title text, stuck bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
  with ordered as (
    select l.id as lid, l.title as ltitle, c.id as cid, c.title as ctitle,
           row_number() over (partition by l.course_id order by coalesce(m.sort, 2147483647), l.sort, l.id) as pos,
           count(*) over (partition by l.course_id) as n
      from public.lessons l
      join public.courses c on c.id = l.course_id
      left join public.course_modules m on m.id = l.module_id
     where c.status = 'published' or (c.status = 'scheduled' and c.publish_at <= now())
  ),
  started as (
    select lp.user_id as uid, o.cid as cid, max(o.pos) as last_pos
      from public.lesson_progress lp
      join ordered o on o.lid = lp.lesson_id
     group by lp.user_id, o.cid
    having min(lp.completed_at) >= coalesce(p_since, '-infinity'::timestamptz)
  )
  select o.lid, o.ltitle, o.ctitle, count(*)::bigint
    from started st
    join ordered o on o.cid = st.cid and o.pos = st.last_pos
   where st.last_pos < o.n
   group by o.lid, o.ltitle, o.ctitle
   order by count(*) desc, o.ctitle, o.ltitle
   limit 1;
end $$;

-- ───────────── Reglas de un cupón para el pago ─────────────
-- `coupons` solo la lee un admin (RLS). El pago necesita saber a qué plan aplica un código y si venció:
-- esta función devuelve SOLO esas dos columnas de un código, a cualquier usuario con sesión (no lista cupones).
create or replace function public.coupon_rule(p_code text)
returns table (applies_to text, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.applies_to, c.expires_at from public.coupons c where c.code = upper(trim(p_code)) limit 1;
$$;

-- ───────────── Permisos: solo usuarios con sesión (y adentro, solo admin) ─────────────
revoke execute on function public.admin_emails(uuid[]) from public, anon;
revoke execute on function public.admin_users_v2(text, text, text, text, text, int, int) from public, anon;
revoke execute on function public.admin_academy_dropoff(timestamptz) from public, anon;
grant execute on function public.admin_emails(uuid[]) to authenticated;
grant execute on function public.admin_users_v2(text, text, text, text, text, int, int) to authenticated;
grant execute on function public.admin_academy_dropoff(timestamptz) to authenticated;
revoke execute on function public.coupon_rule(text) from public, anon;
grant execute on function public.coupon_rule(text) to authenticated;
