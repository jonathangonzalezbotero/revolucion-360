-- Revolución 360 · permisos
-- 1) Cada usuario solo lee y escribe lo suyo (lo impone la base de datos).
-- 2) Admin NO tiene ninguna política sobre tablas financieras: solo funciones admin_* que devuelven datos sin montos.
-- 3) En solo lectura (dejó de pagar) o suspendido, el usuario lee pero no escribe.

-- ───────────── Funciones de apoyo ─────────────
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.suspended_at is null)
     and (coalesce((select (value)::text from public.app_config where key = 'admin_mfa_required'), 'true') = 'false'
          or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2');
$$;

create or replace function public.can_write() returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.entitlements e where e.user_id = auth.uid() and e.state = 'read_only')
     and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.suspended_at is not null);
$$;

-- Perfil y plan al registrarse
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do nothing;
  insert into public.entitlements (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.product_events (user_id, name) values (new.id, 'signup');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- El usuario no puede cambiarse el rol ni la suspensión
create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' and not public.is_admin() then
    new.role := old.role;
    new.suspended_at := old.suspended_at;
    new.email := old.email;
  end if;
  return new;
end $$;
create trigger protect_profile before update on public.profiles
  for each row execute function public.protect_profile();

-- Historial interno de cada edición o eliminación de un movimiento
create or replace function public.log_transaction() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.transaction_history (user_id, transaction_id, action, after) values (new.user_id, new.id, 'create', to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.transaction_history (user_id, transaction_id, action, before, after)
    values (new.user_id, new.id, case when new.deleted_at is not null and old.deleted_at is null then 'delete' else 'update' end, to_jsonb(old), to_jsonb(new));
    return new;
  else
    -- si la cuenta entera se está borrando, no hay historial que guardar
    if exists (select 1 from auth.users where id = old.user_id) then
      insert into public.transaction_history (user_id, transaction_id, action, before) values (old.user_id, old.id, 'delete', to_jsonb(old));
    end if;
    return old;
  end if;
end $$;
create trigger log_transaction after insert or update or delete on public.transactions
  for each row execute function public.log_transaction();

-- ───────────── RLS: datos del usuario ─────────────
do $$
declare t text;
begin
  foreach t in array array[
    'categories','accounts','goals','goal_entries','debts','debt_payments','investments','investment_entries',
    'plan_lines','plan_cells','plan_marks','plan_years','csv_imports','csv_formats','recurring','transactions','category_rules',
    'month_totals','watched_merchants','month_closures','forecast_scenarios','tax_settings','tax_entries','company_entries'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy own_select on public.%I for select to authenticated using (user_id = auth.uid())', t);
    execute format('create policy own_insert on public.%I for insert to authenticated with check (user_id = auth.uid() and public.can_write())', t);
    execute format('create policy own_update on public.%I for update to authenticated using (user_id = auth.uid() and public.can_write()) with check (user_id = auth.uid())', t);
    execute format('create policy own_delete on public.%I for delete to authenticated using (user_id = auth.uid() and public.can_write())', t);
  end loop;
end $$;

-- Historial: el usuario lo lee; lo escribe el disparador
alter table public.transaction_history enable row level security;
create policy own_select on public.transaction_history for select to authenticated using (user_id = auth.uid());

-- Perfil
alter table public.profiles enable row level security;
create policy own_select on public.profiles for select to authenticated using (id = auth.uid());
create policy own_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Plan: solo lectura para el usuario; escribe el servidor
alter table public.entitlements enable row level security;
create policy own_select on public.entitlements for select to authenticated using (user_id = auth.uid());

alter table public.access_grants enable row level security;
create policy own_select on public.access_grants for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy admin_write on public.access_grants for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Logros: lectura propia; se otorgan con award_points()
alter table public.point_events enable row level security;
create policy own_select on public.point_events for select to authenticated using (user_id = auth.uid());
alter table public.user_badges enable row level security;
create policy own_select on public.user_badges for select to authenticated using (user_id = auth.uid());
alter table public.activity_weeks enable row level security;
create policy own_select on public.activity_weeks for select to authenticated using (user_id = auth.uid());

alter table public.lesson_progress enable row level security;
create policy own_select on public.lesson_progress for select to authenticated using (user_id = auth.uid());
create policy own_insert on public.lesson_progress for insert to authenticated with check (user_id = auth.uid());
create policy own_update on public.lesson_progress for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.notifications enable row level security;
create policy own_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy own_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

alter table public.email_log enable row level security;
alter table public.product_events enable row level security;
create policy own_insert on public.product_events for insert to authenticated with check (user_id = auth.uid());

alter table public.push_subscriptions enable row level security;
create policy own_all on public.push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Soporte: sin montos. El admin sí los ve para responder.
alter table public.support_tickets enable row level security;
create policy own_select on public.support_tickets for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy own_insert on public.support_tickets for insert to authenticated with check (user_id = auth.uid());
create policy admin_update on public.support_tickets for update to authenticated using (public.is_admin() or user_id = auth.uid()) with check (public.is_admin() or user_id = auth.uid());
alter table public.ticket_messages enable row level security;
create policy read_msgs on public.ticket_messages for select to authenticated
  using (public.is_admin() or exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid()));
create policy write_msgs on public.ticket_messages for insert to authenticated
  with check ((public.is_admin() and from_admin) or (not from_admin and author_id = auth.uid()
    and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())));

alter table public.privacy_requests enable row level security;
create policy own_select on public.privacy_requests for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy own_insert on public.privacy_requests for insert to authenticated with check (user_id = auth.uid());
create policy own_cancel on public.privacy_requests for update to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

-- ───────────── RLS: contenido y configuración (lee todo usuario, escribe admin) ─────────────
do $$
declare t text;
begin
  foreach t in array array['app_config','countries','price_regions','faqs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy read_all on public.%I for select to authenticated using (true)', t);
    execute format('create policy admin_write on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
  foreach t in array array['groups','group_members','invite_codes','coupons','admin_audit','admin_notes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;
-- Academia: el usuario solo lee lo publicado; el video de una clase Pro exige tener Pro
create or replace function public.my_tier() returns text
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from public.entitlements e where e.user_id = auth.uid() and (
      e.state in ('pro','fundador','read_only')
      or (e.state = 'trial' and e.trial_ends_at > now())
      or (e.state = 'alumno' and (e.access_until is null or e.access_until > now())))) then 'pro' else 'free' end;
$$;
create or replace function public.course_live(p_course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.courses c where c.id = p_course and (c.status = 'published' or (c.status = 'scheduled' and c.publish_at <= now())));
$$;
alter table public.courses enable row level security;
create policy read_live on public.courses for select to authenticated using (public.is_admin() or status = 'published' or (status = 'scheduled' and publish_at <= now()));
create policy admin_write on public.courses for all to authenticated using (public.is_admin()) with check (public.is_admin());
alter table public.course_modules enable row level security;
create policy read_live on public.course_modules for select to authenticated using (public.is_admin() or public.course_live(course_id));
create policy admin_write on public.course_modules for all to authenticated using (public.is_admin()) with check (public.is_admin());
alter table public.lessons enable row level security;
create policy read_live on public.lessons for select to authenticated using (public.is_admin() or public.course_live(course_id));
create policy admin_write on public.lessons for all to authenticated using (public.is_admin()) with check (public.is_admin());
alter table public.lesson_media enable row level security;
create policy read_allowed on public.lesson_media for select to authenticated using (
  public.is_admin() or exists (select 1 from public.lessons l join public.courses c on c.id = l.course_id
    where l.id = lesson_id and public.course_live(c.id) and ((l.tier = 'free' and c.tier = 'free') or public.my_tier() = 'pro')));
create policy admin_write on public.lesson_media for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Un dato del usuario solo puede apuntar a otro dato del MISMO usuario (las llaves foráneas no pasan por RLS)
create or replace function public.same_owner() returns trigger
language plpgsql security definer set search_path = public as $$
declare i int := 0; ref uuid; owner uuid;
begin
  while i < tg_nargs loop
    execute format('select ($1).%I', tg_argv[i]) into ref using new;
    if ref is not null then
      execute format('select user_id from public.%I where id = $1', tg_argv[i + 1]) into owner using ref;
      if owner is distinct from new.user_id then raise exception 'referencia ajena en %', tg_argv[i] using errcode = '42501'; end if;
    end if;
    i := i + 2;
  end loop;
  return new;
end $$;
create trigger same_owner before insert or update on public.plan_lines for each row execute function public.same_owner('category_id','categories','debt_id','debts','goal_id','goals','investment_id','investments');
create trigger same_owner before insert or update on public.plan_cells for each row execute function public.same_owner('line_id','plan_lines');
create trigger same_owner before insert or update on public.plan_marks for each row execute function public.same_owner('line_id','plan_lines');
create trigger same_owner before insert or update on public.transactions for each row execute function public.same_owner('account_id','accounts','category_id','categories','plan_line_id','plan_lines','parent_id','transactions','import_id','csv_imports','recurring_id','recurring');
create trigger same_owner before insert or update on public.goal_entries for each row execute function public.same_owner('goal_id','goals');
create trigger same_owner before insert or update on public.debt_payments for each row execute function public.same_owner('debt_id','debts');
create trigger same_owner before insert or update on public.investment_entries for each row execute function public.same_owner('investment_id','investments');
create trigger same_owner before insert or update on public.recurring for each row execute function public.same_owner('account_id','accounts','category_id','categories','plan_line_id','plan_lines');
create trigger same_owner before insert or update on public.category_rules for each row execute function public.same_owner('category_id','categories','plan_line_id','plan_lines');
create trigger same_owner before insert or update on public.month_totals for each row execute function public.same_owner('category_id','categories');
create trigger same_owner before insert or update on public.csv_imports for each row execute function public.same_owner('account_id','accounts');
create trigger same_owner before insert or update on public.tax_settings for each row execute function public.same_owner('account_id','accounts');

-- Países y precios también se leen antes de entrar (registro y onboarding)
create policy read_anon on public.countries for select to anon using (enabled);
create policy read_anon on public.price_regions for select to anon using (true);

-- ───────────── Puntos: se otorgan validando el hecho real ─────────────
create or replace function public.award_points(p_kind text, p_ref text) returns int
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cfg jsonb := coalesce((select value from public.app_config where key = 'points'), '{}'::jsonb);
  pts int := coalesce((cfg ->> p_kind)::int, 0);
  ok boolean := false;
  month_cap int;
begin
  if uid is null or pts <= 0 then return 0; end if;
  if coalesce((select (value)::text from public.app_config where key = 'gamification_enabled'), 'true') = 'false' then return 0; end if;

  if p_kind = 'lesson' then
    ok := exists (select 1 from public.lesson_progress where user_id = uid and lesson_id::text = p_ref);
    pts := coalesce((select points from public.lessons where id::text = p_ref), pts);
  elsif p_kind = 'course' then
    ok := not exists (select 1 from public.lessons l where l.course_id::text = p_ref
            and not exists (select 1 from public.lesson_progress lp where lp.user_id = uid and lp.lesson_id = l.id))
          and exists (select 1 from public.lessons l where l.course_id::text = p_ref);
  elsif p_kind = 'closure' then           -- ref = 'YYYY-MM'
    ok := exists (select 1 from public.month_closures where user_id = uid and (year::text || '-' || lpad(month::text, 2, '0')) = p_ref);
  elsif p_kind = 'debt_paid' then
    ok := exists (select 1 from public.debts where user_id = uid and id::text = p_ref and closed_at is not null and start_balance_cents > 0);
    month_cap := 2;
  elsif p_kind = 'goal_done' then
    ok := exists (select 1 from public.goals where user_id = uid and id::text = p_ref and completed_at is not null);
    month_cap := 2;
  elsif p_kind = 'goal_contrib' then      -- ref = id del aporte; máximo uno por día
    ok := exists (select 1 from public.goal_entries where user_id = uid and id::text = p_ref and amount_cents > 0)
          and not exists (select 1 from public.point_events where user_id = uid and kind = 'goal_contrib' and at::date = now()::date);
  elsif p_kind = 'week_active' then       -- ref = lunes de la semana
    ok := exists (select 1 from public.activity_weeks where user_id = uid and week_start::text = p_ref and not wildcard);
  elsif p_kind = 'first_step' then        -- ref = clave del primer paso
    ok := p_ref in ('plan','cuenta','gasto','clase');
  end if;
  if not ok then return 0; end if;
  if month_cap is not null and (select count(*) from public.point_events
       where user_id = uid and kind = p_kind and at >= date_trunc('month', now())) >= month_cap then
    return 0;
  end if;

  insert into public.point_events (user_id, kind, ref, points) values (uid, p_kind, p_ref, pts)
  on conflict (user_id, kind, ref) do nothing;
  if not found then return 0; end if;
  return pts;
end $$;

create or replace function public.award_badge(p_badge text) returns boolean
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); ok boolean := false;
begin
  if uid is null then return false; end if;
  ok := case p_badge
    when 'play' then exists (select 1 from public.lesson_progress where user_id = uid)
    when 'grid' then exists (select 1 from public.profiles where id = uid and onboarding_step = 'done') and exists (select 1 from public.plan_lines where user_id = uid)
    when 'check' then exists (select 1 from public.month_closures where user_id = uid)
    when 'flame' then (select count(*) from public.month_closures where user_id = uid) >= 3
    when 'unlock' then exists (select 1 from public.debts where user_id = uid and closed_at is not null)
    when 'shield' then (
      select greatest(
        coalesce((select sum(ge.amount_cents) from public.goal_entries ge join public.goals g on g.id = ge.goal_id where g.user_id = uid and g.is_emergency_fund and g.archived_at is null), 0),
        coalesce((select sum(a.balance_cents) from public.accounts a where a.user_id = uid and a.is_emergency_fund and a.archived_at is null), 0))
      >= nullif((select coalesce(sum(pc.amount_cents), 0) from public.plan_cells pc join public.plan_lines pl on pl.id = pc.line_id join public.categories c on c.id = pl.category_id
                  where pl.user_id = uid and c.is_basic and pl.archived_at is null and pl.year = extract(year from now())::int and pc.month = extract(month from now())::int), 0))
    when 'flag' then exists (select 1 from public.goals where user_id = uid and completed_at is not null)
    when 'cap' then exists (select 1 from public.point_events where user_id = uid and kind = 'course')
    when 'sprout' then exists (select 1 from public.investments where user_id = uid)
    when 'star' then (select count(*) from public.month_closures where user_id = uid) >= 12
    else false end;
  if not ok then return false; end if;
  insert into public.user_badges (user_id, badge) values (uid, p_badge) on conflict do nothing;
  return found;
end $$;

-- Semana activa (racha). El servidor calcula el lunes en la zona horaria del usuario.
create or replace function public.touch_week(p_week_start date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if extract(isodow from p_week_start) <> 1 or p_week_start > (now() + interval '1 day')::date or p_week_start < (now() - interval '8 days')::date then return; end if;
  insert into public.activity_weeks (user_id, week_start) values (auth.uid(), p_week_start)
  on conflict (user_id, week_start) do update set wildcard = false;
  update public.profiles set last_active_at = now() where id = auth.uid();
end $$;

create or replace function public.use_wildcard(p_week_start date) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or extract(isodow from p_week_start) <> 1 then return false; end if;
  if exists (select 1 from public.activity_weeks where user_id = auth.uid() and wildcard
             and date_trunc('month', week_start) = date_trunc('month', p_week_start)) then return false; end if;
  insert into public.activity_weeks (user_id, week_start, wildcard) values (auth.uid(), p_week_start, true)
  on conflict do nothing;
  return found;
end $$;

create or replace function public.notify_me(p_kind text, p_title text, p_body text, p_href text, p_dedupe text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.notifications (user_id, kind, title, body, href, dedupe)
  values (auth.uid(), p_kind, left(p_title, 140), left(p_body, 400), p_href, p_dedupe)
  on conflict (user_id, dedupe) do nothing;
end $$;

-- Código de invitación → acceso gratis de alumno
create or replace function public.redeem_invite(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare c public.invite_codes; exp timestamptz; uid uuid := auth.uid();
begin
  if uid is null then return 'no_auth'; end if;
  select * into c from public.invite_codes where code = upper(trim(p_code)) and active for update;
  if not found then return 'invalid'; end if;
  if c.max_uses is not null and c.uses >= c.max_uses then return 'used_up'; end if;
  if exists (select 1 from public.access_grants where user_id = uid and invite_code = c.code) then return 'already'; end if;
  exp := coalesce(c.until, case when c.months is not null then now() + make_interval(months => c.months) end);
  if exp is not null and exp < now() then return 'expired'; end if;
  insert into public.access_grants (user_id, kind, expires_at, group_id, invite_code) values (uid, c.kind, exp, c.group_id, c.code);
  if c.group_id is not null then insert into public.group_members (group_id, user_id) values (c.group_id, uid) on conflict do nothing; end if;
  update public.invite_codes set uses = uses + 1 where code = c.code;
  update public.entitlements set state = c.kind, access_until = exp, updated_at = now()
   where user_id = uid and state in ('free','trial','read_only','alumno');
  return 'ok';
end $$;

-- ───────────── Funciones de Admin: NUNCA devuelven montos ─────────────
create or replace function public.admin_log(p_action text, p_target uuid, p_detail jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  insert into public.admin_audit (admin_id, action, target_user, detail) values (auth.uid(), p_action, p_target, coalesce(p_detail, '{}'::jsonb));
end $$;

create or replace function public.admin_users(p_search text default '', p_filter text default 'all', p_limit int default 50, p_offset int default 0)
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
   where (p_search = '' or p.email ilike '%' || p_search || '%' or p.name ilike '%' || p_search || '%')
     and (p_filter = 'all' or e.state = p_filter
          or (p_filter = 'failed' and e.payment_failed_at is not null)
          or (p_filter = 'expiring' and e.access_until between now() and now() + interval '30 days')
          or (p_filter = 'suspended' and p.suspended_at is not null))
   order by p.created_at desc limit p_limit offset p_offset;
end $$;

create or replace function public.admin_user(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
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

create or replace function public.admin_grant_access(p_user uuid, p_kind text, p_expires timestamptz, p_group uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
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
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.access_grants set revoked_at = now() where user_id = p_user and revoked_at is null;
  update public.entitlements set state = 'free', access_until = null, updated_at = now()
   where user_id = p_user and state in ('alumno','fundador');
  perform public.admin_log('quitar_acceso', p_user, '{}'::jsonb);
end $$;

create or replace function public.admin_set_suspended(p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.profiles set suspended_at = case when p_on then now() else null end where id = p_user;
  perform public.admin_log(case when p_on then 'suspender' else 'reactivar' end, p_user, '{}'::jsonb);
end $$;

create or replace function public.admin_set_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() or p_role not in ('user','admin') then raise exception 'forbidden'; end if;
  update public.profiles set role = p_role where id = p_user;
  perform public.admin_log('cambiar_rol', p_user, jsonb_build_object('role', p_role));
end $$;

create or replace function public.admin_summary(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => p_days); total bigint;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select count(*) into total from public.profiles;
  return jsonb_build_object(
    'users', total,
    'new_users', (select count(*) from public.profiles where created_at >= since),
    'active', (select count(*) from public.profiles where last_active_at >= since),
    'pro', (select count(*) from public.entitlements where state = 'pro'),
    'trial', (select count(*) from public.entitlements where state = 'trial'),
    'free_access', (select count(*) from public.entitlements where state in ('alumno','fundador')),
    'read_only', (select count(*) from public.entitlements where state = 'read_only'),
    'failed_payments', (select count(*) from public.entitlements where payment_failed_at is not null),
    'expiring', (select count(*) from public.entitlements where access_until between now() and now() + interval '7 days'),
    'privacy_pending', (select count(*) from public.privacy_requests where status = 'pending'),
    'tickets_open', (select count(*) from public.support_tickets where status = 'open'),
    'funnel', jsonb_build_object(
      'signup', (select count(distinct user_id) from public.product_events where name = 'signup' and at >= since),
      'wizard', (select count(distinct user_id) from public.product_events where name = 'wizard_done' and at >= since),
      'returned', (select count(distinct user_id) from public.product_events where name = 'returned_week' and at >= since),
      'closure', (select count(distinct user_id) from public.product_events where name = 'first_closure' and at >= since),
      'pro', (select count(distinct user_id) from public.product_events where name = 'upgraded' and at >= since),
      'forecast_used', (select count(distinct user_id) from public.product_events where name = 'forecast_view' and at >= since)),
    'academy', jsonb_build_object(
      'lessons_seen', (select count(*) from public.lesson_progress where completed_at >= since),
      'top_lesson', (select l.title from public.lesson_progress lp join public.lessons l on l.id = lp.lesson_id where lp.completed_at >= since group by l.title order by count(*) desc limit 1),
      'avg_rating', (select round(avg(rating)::numeric, 1) from public.lesson_progress where rating is not null))
  );
end $$;

revoke execute on function public.handle_new_user(), public.protect_profile(), public.log_transaction(), public.same_owner() from public, anon, authenticated;
