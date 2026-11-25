-- Retos (25 nov 2026, decisiones de Jonathan): pequeños desafíos opcionales y sin castigo, que crea el Dueño en el panel.
-- SOLO AGREGA (CLAUDE.md, regla 0): tablas nuevas, funciones nuevas, `create or replace` de `award_points` (última
-- definición: 20261125000031_metas.sql) y de `award_badge` (última: 20261125000034_integracion.sql) conservando todo, una
-- clave nueva en `app_config.points` y la copia, una sola vez, de los retos fijos que estaban activos (`user_challenges`,
-- que se conserva tal cual). No borra tablas, columnas ni filas. Depende de 20261125000036_crm.sql (crm_automations).
-- Lo revisa una persona antes de `npm run db:migrate`.
--
-- Reglas:
-- · Dos formas de medir: 'app' (una acción en la app que se cuenta sola: registrar un gasto, cierre de mes, aporte a una
--   meta, terminar una clase, abrir la app) o 'checkin' (la persona marca cada día "Sí, lo hice" / "Hoy no").
--   Nunca por montos gastados: aquí no hay un solo monto.
-- · Meta del reto (`target`): días (o clases) − comodines; en "cierre de mes", cierres = ⌈días / 30⌉ − comodines.
-- · Premio al terminar: los de check-in, máximo 50 puntos (los marca la persona: no se pueden comprobar); los que mide la
--   app, máximo 200. Además 1 punto por día cumplido (`app_config.points.challenge_day`, uno al día como máximo).
-- · Salir no borra lo logrado (las marcas y los puntos quedan). Si la persona cambia de grupo, pierde el código o se le
--   vence el acceso, conserva lo logrado pero no puede seguir (`challenge_can_go`).
-- · El avance NO lo escribe el usuario a mano: por la API solo lee lo suyo y sale de un intento. Las marcas de la app solo
--   las pone `challenge_count` (comprueba el hecho en la base); las de check-in, `challenge_checkin`, solo para HOY en su
--   zona horaria (acotada a ±1 día de la fecha UTC y nunca antes del último día marcado). El premio y la insignia solo
--   con el intento terminado (`status = 'done'`, lo pone `challenge_try_finish`) y se recuentan en `award_points`.
-- · La tabla `challenges` completa solo la lee el Dueño; el usuario ve sus columnas públicas con `challenge_list()`.
-- · El admin (solo el Dueño) ve SOLO totales (se unieron, terminaron, salieron). La tabla del grupo solo muestra nombre
--   corto y días cumplidos de quien la activó, y solo a quien está en ese reto.

-- ───────────── Retos (los escribe el Dueño) ─────────────
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 240),
  image text not null default 'meta-emergencia' check (image ~ '^[a-z0-9-]{1,40}$'),   -- public/ilustraciones/<image>.webp
  measure text not null check (measure in ('checkin','app')),
  action text check (action in ('expense','closure','goal_contrib','lesson','open_app')),
  wildcards int not null default 0 check (wildcards between 0 and 30),                   -- comodines: días (o cierres) que puede fallar
  days int not null check (days between 1 and 120),
  starts_on date,                                                                        -- null = empieza cuando cada persona se une
  audience text not null default 'all' check (audience in ('all','group','code')),
  group_id uuid references public.groups(id) on delete set null,                         -- sin grupo (borrado) = nadie lo ve
  invite_code text check (invite_code is null or char_length(invite_code) between 1 and 40),
  points int not null default 0 check (points >= 0),
  badge_name text check (badge_name is null or char_length(badge_name) between 1 and 40),
  show_board boolean not null default false,
  status text not null default 'draft' check (status in ('draft','published')),
  legacy_key text unique,                                                                -- los 3 retos fijos de 031 (delivery, cafe, redondeo)
  created_by uuid references auth.users(id) on delete set null,
  reminder_automation_id uuid references public.crm_automations(id) on delete set null,  -- "Reto: recordatorio"
  done_automation_id uuid references public.crm_automations(id) on delete set null,      -- "Reto: ¡lo lograste!"
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  target int generated always as (greatest(1, (case when action = 'closure' then (days + 29) / 30 else days end) - wildcards)) stored,
  constraint challenges_action check ((measure = 'app') = (action is not null)),
  constraint challenges_code check (audience <> 'code' or invite_code is not null),
  constraint challenges_wildcards check (wildcards < (case when action = 'closure' then (days + 29) / 30 else days end)),
  -- Premios grandes solo en lo que mide la app: lo que marca la persona no se puede comprobar.
  constraint challenges_points check ((measure = 'checkin' and points <= 50) or (measure = 'app' and points <= 200))
);

-- ───────────── Inscripciones (una por intento; salir, o que se acaben los días, y volver a entrar abre un intento nuevo) ─────────────
create table if not exists public.challenge_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  start_on date not null,                          -- su primer día (en su zona horaria) o la fecha fija del reto
  status text not null default 'active' check (status in ('active','done','left','ended')),  -- ended: se le acabaron los días sin llegar
  show_on_board boolean not null default false,    -- aparecer en la tabla del grupo (solo si la persona lo activa)
  joined_at timestamptz not null default now(),
  done_at timestamptz,
  left_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index if not exists challenge_members_one_active on public.challenge_members(user_id, challenge_id) where status = 'active';
create unique index if not exists challenge_members_one_done on public.challenge_members(user_id, challenge_id) where status = 'done';
create index if not exists challenge_members_challenge on public.challenge_members(challenge_id, status);

-- ───────────── Avance: un día cumplido (o una clase, o un cierre) por fila ─────────────
create table if not exists public.challenge_marks (
  member_id uuid not null references public.challenge_members(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9:_-]{1,80}$'),   -- 'YYYY-MM-DD' · 'lesson:<id>' · 'closure:YYYY-MM'
  day date not null,                                       -- día local en que se marcó
  state text not null check (state in ('yes','no','auto')), -- yes/no: check-in · auto: lo contó la app
  created_at timestamptz not null default now(),
  primary key (member_id, key)
);
create index if not exists challenge_marks_user on public.challenge_marks(user_id, day);

-- ───────────── Funciones de apoyo ─────────────
-- Hoy en una zona horaria (una zona inválida cae a Sydney, como en la app). Acotado a [fecha UTC − 1, fecha UTC + 1]:
-- ninguna zona real se sale de ahí, así que cambiar la zona del perfil no deja marcar días de más (ni adelantar ni
-- volver atrás más de un día). Sin consultas: sirve para recorrer muchas filas (challenge_info) sin N+1.
create or replace function public.challenge_local_today(p_tz text) returns date
language plpgsql stable set search_path = public as $$
declare utc date := (now() at time zone 'utc')::date; d date;
begin
  begin
    d := (now() at time zone coalesce(nullif(p_tz, ''), 'Australia/Sydney'))::date;
  exception when others then
    d := (now() at time zone 'Australia/Sydney')::date;
  end;
  return least(greatest(d, utc - 1), utc + 1);
end $$;

-- Hoy en la zona horaria de una persona. Solo para otras funciones.
create or replace function public.challenge_today_of(p_user uuid) returns date
language sql stable security definer set search_path = public as $$
  select public.challenge_local_today((select timezone from public.profiles where id = p_user));
$$;

-- Hoy para quien llama (lo usan las políticas).
create or replace function public.challenge_today() returns date
language sql stable security definer set search_path = public as $$
  select public.challenge_today_of(auth.uid());
$$;

-- ¿Cuenta activa? Igual que `is_active_account()` (034) pero para cualquier persona (tareas del servidor).
create or replace function public.challenge_account_ok(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.entitlements e where e.user_id = p_user and (
           e.state = 'pro'
           or (e.state in ('alumno','fundador') and (e.access_until is null or e.access_until > now()))
           or (e.state = 'trial' and e.trial_ends_at > now())))
     and not exists (select 1 from public.profiles p where p.id = p_user and p.suspended_at is not null);
$$;

-- ¿El reto está publicado y es para esta persona? (todos · su grupo · un código de acceso vigente que canjeó)
create or replace function public.challenge_visible(p_challenge uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.challenges c where c.id = p_challenge and c.status = 'published' and (
      c.audience = 'all'
      or (c.audience = 'group' and exists (select 1 from public.group_members gm where gm.group_id = c.group_id and gm.user_id = p_user))
      or (c.audience = 'code' and exists (select 1 from public.access_grants g
            where g.user_id = p_user and g.revoked_at is null and (g.expires_at is null or g.expires_at > now())
              and upper(g.invite_code) = upper(c.invite_code)))));
$$;

-- ¿Puede seguir en el reto? (decisión de Jonathan: si cambia de grupo o se le vence el acceso, conserva lo logrado pero no sigue)
create or replace function public.challenge_can_go(p_challenge uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.challenge_visible(p_challenge, p_user) and public.challenge_account_ok(p_user);
$$;

-- Lo mismo para quien llama (lo usan las políticas: así nadie consulta por otra persona).
create or replace function public.challenge_for_me(p_challenge uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.challenge_visible(p_challenge, auth.uid());
$$;
create or replace function public.challenge_can_go_me(p_challenge uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.challenge_can_go(p_challenge, auth.uid());
$$;

-- Días (o clases, o cierres) cumplidos de un intento.
create or replace function public.challenge_progress(p_member uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.challenge_marks where member_id = p_member and state in ('yes','auto');
$$;

-- Último día marcado en un intento (null si no tiene marcas). Una marca nueva nunca va antes de este día: así, cambiar
-- la zona horaria del perfil para "volver" a un día ya pasado no deja marcar dos veces el mismo día.
create or replace function public.challenge_last_mark(p_member uuid) returns date
language sql stable security definer set search_path = public as $$
  select max(day) from public.challenge_marks where member_id = p_member;
$$;

-- Si llegó a la meta, el intento queda terminado. Devuelve true solo la vez que lo termina.
create or replace function public.challenge_try_finish(p_member uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.challenge_members m set status = 'done', done_at = now(), updated_at = now()
   where m.id = p_member and m.status = 'active'
     and public.challenge_progress(m.id) >= (select c.target from public.challenges c where c.id = m.challenge_id);
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- ───────────── Quien escribe directo (PostgREST con el rol `authenticated`) no cambia lo que no le toca ─────────────
-- Dentro de las funciones `security definer` el rol es el dueño de la función, así que ellas sí pueden terminar un reto.
-- SECURITY INVOKER a propósito: `current_user` es 'authenticated' cuando escribe el usuario por la API y el dueño de la
-- función cuando escribe una función `security definer` (unirse, check-in, contar, terminar).
create or replace function public.protect_challenge_member() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  -- Nadie entra a un reto escribiendo directo (no hay política de inserción): solo con `challenge_join`.
  if tg_op = 'INSERT' then raise exception 'forbidden'; end if;
  -- UPDATE: solo "aparecer en la tabla" y salir (activo → salió). Lo demás queda como estaba.
  new.id := old.id;
  new.user_id := old.user_id;
  new.challenge_id := old.challenge_id;
  new.start_on := old.start_on;
  new.joined_at := old.joined_at;
  new.done_at := old.done_at;
  if new.status = 'left' and old.status = 'active' then
    new.left_at := now();
  else
    new.status := old.status;
    new.left_at := old.left_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists protect_challenge_member on public.challenge_members;
create trigger protect_challenge_member before insert or update on public.challenge_members
  for each row execute function public.protect_challenge_member();

-- Las reglas de un reto (cómo se mide, qué cuenta, días, comodines, para quién) no cambian si ya tiene gente adentro: la
-- meta y el premio de quien ya entró se calcularon con ellas. El panel ya las conserva al editar uno publicado; esto lo
-- impone también para cualquier otra escritura.
create or replace function public.protect_challenge_rules() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.measure, new.action, new.days, new.wildcards, new.audience) is distinct from (old.measure, old.action, old.days, old.wildcards, old.audience)
     and exists (select 1 from public.challenge_members m where m.challenge_id = old.id) then
    raise exception 'locked';
  end if;
  return new;
end $$;
drop trigger if exists protect_challenge_rules on public.challenges;
create trigger protect_challenge_rules before update on public.challenges
  for each row execute function public.protect_challenge_rules();

-- ───────────── Permisos ─────────────
-- Toda escritura del usuario va por las funciones `security definer` de abajo (unirse, check-in, contar, tabla del grupo).
-- Por la API (rol `authenticated`) el usuario solo LEE lo suyo y puede salir de un intento (`own_update` de members,
-- limitado por `protect_challenge_member`). Nunca inserta ni borra intentos ni marcas.
alter table public.challenges enable row level security;
-- La tabla completa (creador, código de acceso, grupo, automatizaciones, legacy_key) solo la lee el Dueño. El usuario ve
-- las columnas públicas de los retos que son para él (o en los que estuvo) con `challenge_list()`.
drop policy if exists read_live on public.challenges;
drop policy if exists owner_read on public.challenges;
create policy owner_read on public.challenges for select to authenticated using ((select public.is_admin_owner()));
drop policy if exists owner_insert on public.challenges;
create policy owner_insert on public.challenges for insert to authenticated with check ((select public.is_admin_owner()));
drop policy if exists owner_update on public.challenges;
create policy owner_update on public.challenges for update to authenticated using ((select public.is_admin_owner())) with check ((select public.is_admin_owner()));
-- (Sin política de borrado: un reto con gente adentro nunca se borra desde la app.)

alter table public.challenge_members enable row level security;
drop policy if exists own_select on public.challenge_members;
create policy own_select on public.challenge_members for select to authenticated using (user_id = auth.uid());
-- Salir (activo → salió). "Aparecer en la tabla" va por `challenge_set_board` (apagarlo funciona también en solo lectura).
drop policy if exists own_update on public.challenge_members;
create policy own_update on public.challenge_members for update to authenticated
  using (user_id = auth.uid() and public.can_write()) with check (user_id = auth.uid());
-- Sin own_insert (se entra con `challenge_join`) ni own_delete (borrar un intento terminado y volver a entrar pagaría el
-- premio otra vez).
drop policy if exists own_insert on public.challenge_members;
drop policy if exists own_delete on public.challenge_members;

alter table public.challenge_marks enable row level security;
drop policy if exists own_select on public.challenge_marks;
create policy own_select on public.challenge_marks for select to authenticated using (user_id = auth.uid());
-- Sin políticas de escritura: las marcas las ponen solo `challenge_checkin` (hoy, en su zona) y `challenge_count`.
drop policy if exists own_insert on public.challenge_marks;
drop policy if exists own_update on public.challenge_marks;
drop policy if exists own_delete on public.challenge_marks;

-- ───────────── Unirse ─────────────
-- Devuelve el id del intento (el activo si ya estaba). Errores: forbidden, not_available, ended, already_done.
create or replace function public.challenge_join(p_challenge uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c record; v_id uuid; today date;
begin
  if uid is null or not public.can_write() then raise exception 'forbidden'; end if;
  select * into c from public.challenges where id = p_challenge;
  if not found or not public.challenge_can_go(p_challenge, uid) then raise exception 'not_available'; end if;
  today := public.challenge_today_of(uid);
  if c.starts_on is not null and today > c.starts_on + c.days - 1 then raise exception 'ended'; end if;
  if exists (select 1 from public.challenge_members where user_id = uid and challenge_id = p_challenge and status = 'done') then
    raise exception 'already_done';
  end if;
  -- Un intento anterior al que se le acabaron los días queda 'ended' (conserva lo logrado) y se abre uno nuevo.
  update public.challenge_members x set status = 'ended', updated_at = now()
   where x.user_id = uid and x.challenge_id = p_challenge and x.status = 'active' and today > x.start_on + c.days - 1;
  select id into v_id from public.challenge_members where user_id = uid and challenge_id = p_challenge and status = 'active';
  if v_id is not null then return v_id; end if;
  insert into public.challenge_members (user_id, challenge_id, start_on)
  values (uid, p_challenge, coalesce(c.starts_on, today))
  on conflict (user_id, challenge_id) where status = 'active' do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.challenge_members where user_id = uid and challenge_id = p_challenge and status = 'active';
  end if;
  return v_id;
end $$;

-- ───────────── Check-in de hoy: "Sí, lo hice" / "Hoy no" ─────────────
-- Una marca por día; la segunda vez no cambia nada (inserted = false). Devuelve el avance y si lo terminó.
create or replace function public.challenge_checkin(p_member uuid, p_done boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); m record; c record; today date; n int; cnt int; yes_before int; missed int; left_before int;
        finished boolean := false; cur text;
begin
  if uid is null or not public.can_write() then raise exception 'forbidden'; end if;
  select * into m from public.challenge_members where id = p_member and user_id = uid for update;
  if not found then raise exception 'not_found'; end if;
  select * into c from public.challenges where id = m.challenge_id;
  if m.status <> 'active' or c.measure <> 'checkin' then raise exception 'not_active'; end if;
  if not public.challenge_can_go(c.id, uid) then raise exception 'not_eligible'; end if;
  today := public.challenge_today_of(uid);
  if today < m.start_on then raise exception 'not_started'; end if;
  if today > m.start_on + c.days - 1 then raise exception 'ended'; end if;
  -- Nunca un día anterior al último marcado (cambiar la zona horaria no deja volver a un día ya pasado).
  if today < coalesce(public.challenge_last_mark(p_member), today) then raise exception 'day_passed'; end if;

  select count(*) into yes_before from public.challenge_marks
   where member_id = p_member and state = 'yes' and day < today;
  missed := greatest(0, (today - m.start_on) - yes_before);
  left_before := greatest(0, c.wildcards - missed);

  insert into public.challenge_marks (member_id, user_id, key, day, state)
  values (p_member, uid, today::text, today, case when p_done then 'yes' else 'no' end)
  on conflict (member_id, key) do nothing;
  get diagnostics n = row_count;
  select state into cur from public.challenge_marks where member_id = p_member and key = today::text;
  if n > 0 and cur = 'yes' then finished := public.challenge_try_finish(p_member); end if;
  cnt := public.challenge_progress(p_member);
  return jsonb_build_object(
    'inserted', n > 0, 'state', cur, 'key', today::text, 'count', cnt, 'target', c.target, 'days', c.days, 'day', today - m.start_on + 1,
    'finished', finished, 'challengeId', c.id, 'title', c.title, 'points', c.points, 'badge', c.badge_name,
    'usedWildcard', (n > 0 and cur = 'no' and left_before > 0),
    'wildcardsLeft', case when cur = 'no' then greatest(0, left_before - 1) else left_before end);
end $$;

-- ───────────── La app cuenta sola: registrar un gasto, cierre, aporte a una meta, clase, abrir la app ─────────────
-- La base comprueba el hecho (nunca un monto: solo que existe) y marca cada intento activo que lo mide. Devuelve una fila
-- por intento que contó algo nuevo (para dar el punto del día y, si lo terminó, el premio).
create or replace function public.challenge_count(p_action text, p_ref text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); today date; r record; v_key text; fact boolean; n int; v_out jsonb := '[]'::jsonb; finished boolean;
begin
  if uid is null or not public.can_write() then return v_out; end if;
  if p_action not in ('expense','closure','goal_contrib','lesson','open_app') then return v_out; end if;
  today := public.challenge_today_of(uid);
  for r in
    select m.id, m.challenge_id, m.joined_at, m.start_on, c.title, c.target, c.points, c.badge_name
      from public.challenge_members m join public.challenges c on c.id = m.challenge_id
     where m.user_id = uid and m.status = 'active' and c.measure = 'app' and c.action = p_action
       and today between m.start_on and m.start_on + c.days - 1
  loop
    if not public.challenge_can_go(r.challenge_id, uid) then continue; end if;
    fact := case p_action
      when 'expense' then exists (select 1 from public.transactions t where t.user_id = uid and t.id::text = p_ref
                            and t.amount_cents < 0 and t.kind = 'normal' and t.deleted_at is null and t.created_at >= r.joined_at)
      when 'goal_contrib' then exists (select 1 from public.goal_entries e where e.user_id = uid and e.id::text = p_ref
                            and e.amount_cents > 0 and e.created_at >= r.joined_at)
      when 'lesson' then exists (select 1 from public.lesson_progress lp where lp.user_id = uid and lp.lesson_id::text = p_ref
                            and lp.completed_at >= r.joined_at)
      when 'closure' then exists (select 1 from public.month_closures mc where mc.user_id = uid and mc.reopened_at is null
                            and (mc.year::text || '-' || lpad(mc.month::text, 2, '0')) = p_ref and mc.closed_at >= r.joined_at
                            -- solo el mes anterior al inicio en adelante: cerrar meses viejos de una sentada no termina el reto
                            and make_date(mc.year, mc.month, 1) >= (date_trunc('month', r.start_on) - interval '1 month')::date
                            -- y solo meses ya terminados (en su zona): cerrar por adelantado los meses que vienen no cuenta
                            and make_date(mc.year, mc.month, 1) < date_trunc('month', today)::date)
      else true end;                                             -- open_app: basta con abrirla (una vez al día)
    if not fact then continue; end if;
    perform 1 from public.challenge_members where id = r.id for update;   -- dos llamadas a la vez no se saltan los topes
    -- Nunca un día anterior al último marcado en este intento (cambiar la zona horaria no deja volver a un día pasado).
    if today < coalesce(public.challenge_last_mark(r.id), today) then continue; end if;
    -- Clases: máximo 2 por día en cada intento (terminar 10 de una sentada no termina un reto de 10 días).
    if p_action = 'lesson' and (select count(*) from public.challenge_marks k
                                 where k.member_id = r.id and k.key like 'lesson:%' and k.day = today) >= 2 then
      continue;
    end if;
    v_key := case p_action when 'lesson' then 'lesson:' || p_ref when 'closure' then 'closure:' || p_ref else today::text end;
    insert into public.challenge_marks (member_id, user_id, key, day, state) values (r.id, uid, v_key, today, 'auto')
    on conflict (member_id, key) do nothing;
    get diagnostics n = row_count;
    if n = 0 then continue; end if;
    finished := public.challenge_try_finish(r.id);
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'memberId', r.id, 'key', v_key, 'challengeId', r.challenge_id, 'title', r.title, 'count', public.challenge_progress(r.id),
      'target', r.target, 'finished', finished, 'points', r.points, 'badge', r.badge_name));
  end loop;
  return v_out;
end $$;

-- ───────────── Lo que el usuario ve de los retos (solo columnas públicas) ─────────────
-- Los retos publicados que son para quien llama y aquellos en los que estuvo (aunque ya no sean para él: Terminados).
-- Nunca quién lo creó (id), el código de acceso, el grupo (id), las automatizaciones ni legacy_key.
create or replace function public.challenge_list() returns table (
  id uuid, title text, description text, image text, measure text, action text, wildcards int, days int, starts_on date,
  audience text, points int, badge_name text, show_board boolean, status text, target int, published_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.title, c.description, c.image, c.measure, c.action, c.wildcards, c.days, c.starts_on,
         c.audience, c.points, c.badge_name, c.show_board, c.status, c.target, c.published_at
    from public.challenges c
   where auth.uid() is not null and c.status = 'published'
     and (public.challenge_visible(c.id, auth.uid())
          or exists (select 1 from public.challenge_members m where m.challenge_id = c.id and m.user_id = auth.uid()))
   order by c.published_at desc nulls last;
$$;

-- ───────────── Lo que el usuario ve de los demás (sin montos, sin ids de personas) ─────────────
-- Para cada reto visible (o en el que estuvo): nombre del grupo, quién lo creó (nombre de pila), cuántos siguen adentro y
-- si quien pregunta puede seguir en él (`for_me`: grupo, código y acceso vigentes). `people` solo para quien aún puede
-- seguir en el reto (si ya no es para él, 0). La zona horaria de cada persona sale de un solo join (sin una consulta por
-- persona) y se acota como en `challenge_local_today`.
create or replace function public.challenge_info() returns table (challenge_id uuid, group_name text, creator text, people int, for_me boolean)
language sql stable security definer set search_path = public as $$
  with mine as (
    select c.id, c.group_id, c.created_by, c.days, public.challenge_can_go(c.id, auth.uid()) as go
      from public.challenges c
     where auth.uid() is not null and c.status = 'published'
       and (public.challenge_visible(c.id, auth.uid())
            or exists (select 1 from public.challenge_members m where m.challenge_id = c.id and m.user_id = auth.uid()))
  ), live as (
    select m.challenge_id, count(distinct m.user_id)::int as n
      from public.challenge_members m
      join mine x on x.id = m.challenge_id and x.go
      left join public.profiles p on p.id = m.user_id
     where m.status = 'active'
       and public.challenge_local_today(p.timezone) between m.start_on and m.start_on + x.days - 1
     group by m.challenge_id
  )
  select x.id,
         (select g.name from public.groups g where g.id = x.group_id),
         (select split_part(trim(p.name), ' ', 1) from public.profiles p where p.id = x.created_by),
         case when x.go then coalesce(l.n, 0) else 0 end,
         x.go
    from mine x left join live l on l.challenge_id = x.id;
$$;

-- Tabla del grupo: solo si el reto la tiene encendida y quien pregunta está en ese reto (activo o terminado, y aún es para
-- él: grupo, código y acceso vigentes). Solo aparece quien
-- la activó en su intento; se muestra "Nombre I." y los días cumplidos. Nunca montos ni ids.
create or replace function public.challenge_board(p_challenge uuid) returns table (name text, days int, me boolean)
language sql stable security definer set search_path = public as $$
  select case when position(' ' in trim(p.name)) > 0
              then split_part(trim(p.name), ' ', 1) || ' ' || upper(left(split_part(trim(p.name), ' ', 2), 1)) || '.'
              else trim(coalesce(p.name, '')) end,
         public.challenge_progress(m.id),
         m.user_id = auth.uid()
    from public.challenge_members m
    join public.challenges c on c.id = m.challenge_id
    left join public.profiles p on p.id = m.user_id
   where m.challenge_id = p_challenge and c.show_board and m.show_on_board and m.status in ('active','done')
     and exists (select 1 from public.challenge_members x where x.challenge_id = p_challenge and x.user_id = auth.uid() and x.status in ('active','done'))
     and public.challenge_can_go(p_challenge, auth.uid())
     -- Solo quien aún es del reto (grupo, código y acceso vigentes): quien cambió de grupo no sigue apareciendo.
     and public.challenge_can_go(p_challenge, m.user_id)
   order by 2 desc, 1
   limit 20;
$$;

-- "Aparecer en la tabla del grupo": solo la fila propia y solo esa columna. Apagarlo funciona siempre (también en solo
-- lectura o con el acceso vencido: es retirar sus datos de la vista de otros); prenderlo exige poder escribir.
create or replace function public.challenge_set_board(p_member uuid, p_on boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null or p_on is null then raise exception 'forbidden'; end if;
  if p_on and not public.can_write() then raise exception 'forbidden'; end if;
  update public.challenge_members set show_on_board = p_on, updated_at = now()
   where id = p_member and user_id = uid;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not_found'; end if;
  return p_on;
end $$;

-- ───────────── Panel (solo el Dueño): SOLO totales por reto ─────────────
-- Se unieron = personas distintas · terminaron = con un intento terminado · salieron = su último intento fue "salir".
create or replace function public.admin_challenge_totals() returns table (challenge_id uuid, joined int, done int, left_count int)
language sql stable security definer set search_path = public as $$
  with last as (
    select distinct on (m.challenge_id, m.user_id) m.challenge_id, m.user_id, m.status
      from public.challenge_members m order by m.challenge_id, m.user_id, m.joined_at desc
  )
  select c.id,
         (select count(distinct m.user_id)::int from public.challenge_members m where m.challenge_id = c.id),
         (select count(distinct m.user_id)::int from public.challenge_members m where m.challenge_id = c.id and m.status = 'done'),
         (select count(*)::int from last l where l.challenge_id = c.id and l.status = 'left')
    from public.challenges c
   where public.is_admin_owner();
$$;

-- ───────────── Servidor (clave de servicio): avisos y CRM ─────────────
-- "Reto: día N de M · ¿Lo cumpliste hoy?": el primer check-in activo y vigente que esta persona no marcó hoy.
create or replace function public.challenge_notice(p_user uuid) returns table (member_id uuid, title text, day_n int, days int)
language sql stable security definer set search_path = public as $$
  select m.id, c.title, (public.challenge_today_of(p_user) - m.start_on + 1)::int, c.days
    from public.challenge_members m join public.challenges c on c.id = m.challenge_id
   where m.user_id = p_user and m.status = 'active' and c.measure = 'checkin'
     and public.challenge_today_of(p_user) between m.start_on and m.start_on + c.days - 1
     and not exists (select 1 from public.challenge_marks k where k.member_id = m.id and k.key = public.challenge_today_of(p_user)::text)
     and public.challenge_can_go(c.id, p_user)
   order by m.start_on, m.joined_at
   limit 1;
$$;

-- "Reto: recordatorio": intentos activos y vigentes sin marcar (check-in) o sin un día que contó (app) en `p_days` días o
-- más (o desde que empezaron).
-- `last_day` va en el ref del evento: el mismo bache avisa una sola vez.
create or replace function public.challenge_idle_members(p_days int)
returns table (user_id uuid, challenge_id uuid, member_id uuid, last_day date)
language sql stable security definer set search_path = public as $$
  select x.user_id, x.challenge_id, x.id, x.last_day from (
    select m.user_id, m.challenge_id, m.id, m.start_on, c.days,
           -- check-in: cualquier marca ("Hoy no" también es marcar); lo que mide la app: un día que contó
           coalesce((select max(k.day) from public.challenge_marks k where k.member_id = m.id and (c.measure = 'checkin' or k.state in ('yes','auto'))), m.start_on - 1) as last_day,
           public.challenge_today_of(m.user_id) as today
      from public.challenge_members m join public.challenges c on c.id = m.challenge_id
     where m.status = 'active' and c.status = 'published'
  ) x
  where x.today between x.start_on and x.start_on + x.days - 1
    and x.today - x.last_day >= greatest(p_days, 1)
    and public.challenge_can_go(x.challenge_id, x.user_id);
$$;

-- ───────────── Puntos: 1 por día cumplido (editable en Admin). Los valores que ya existan ganan. ─────────────
update public.app_config
   set value = '{"challenge_day":1}'::jsonb || value
 where key = 'points';

-- ───────────── award_points: igual que en 031_metas (su última definición), más los tipos de retos ─────────────
create or replace function public.award_points(p_kind text, p_ref text) returns int
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cfg jsonb := coalesce((select value from public.app_config where key = 'points'), '{}'::jsonb);
  pts int := coalesce((cfg ->> p_kind)::int, 0);
  ok boolean := false;
  month_cap int;
  g_id text;
  g_pct int;
begin
  -- Retos: el premio de terminar lo pone el reto (no la configuración).
  if p_kind = 'challenge_done' then
    pts := coalesce((select c.points from public.challenge_members m join public.challenges c on c.id = m.challenge_id
                      where m.user_id = uid and m.id::text = p_ref and m.status = 'done'), 0);
  elsif p_kind = 'challenge_day' then
    pts := least(pts, 5);                 -- tope aunque alguien suba el valor en la configuración
  end if;
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
  elsif p_kind = 'goal_milestone' then    -- ref = '<id de la meta>:<25|50|75|100>'; lo ahorrado llegó a ese % del monto
    g_id := split_part(p_ref, ':', 1);
    g_pct := case split_part(p_ref, ':', 2) when '25' then 25 when '50' then 50 when '75' then 75 when '100' then 100 else null end;
    ok := g_pct is not null and p_ref = g_id || ':' || g_pct::text and exists (
      select 1 from public.goals g
       where g.user_id = uid and g.id::text = g_id and g.archived_at is null and g.target_cents > 0
         and coalesce((select sum(e.amount_cents) from public.goal_entries e where e.goal_id = g.id), 0) * 100 >= g.target_cents * g_pct);
    month_cap := 8;
  elsif p_kind = 'goal_used' then         -- ref = id de la meta; usó la plata para lo que era (una vez por meta)
    ok := exists (select 1 from public.goal_entries e join public.goals g on g.id = e.goal_id
                   where e.user_id = uid and g.id::text = p_ref and g.archived_at is null and e.amount_cents < 0);
    month_cap := 2;
  elsif p_kind = 'goal_leftover' then     -- ref = 'YYYY-MM'; mandó lo que le sobró de ese mes a una meta
    ok := exists (select 1 from public.goal_leftovers where user_id = uid and goal_id is not null and amount_cents > 0
                   and (year::text || '-' || lpad(month::text, 2, '0')) = p_ref);
    month_cap := 1;
  elsif p_kind = 'challenge_day' then     -- ref = '<id del intento>:<clave>'; un día (clase, cierre) cumplido de un reto; uno al día
    ok := exists (select 1 from public.challenge_marks k where k.user_id = uid and k.state in ('yes','auto')
                   and k.member_id::text || ':' || k.key = p_ref)
          and not exists (select 1 from public.point_events where user_id = uid and kind = 'challenge_day' and at::date = now()::date);
  elsif p_kind = 'challenge_done' then    -- ref = id del intento; lo terminó (estado 'done', que solo pone challenge_try_finish) y se recuenta
    ok := exists (select 1 from public.challenge_members m join public.challenges c on c.id = m.challenge_id
                   where m.user_id = uid and m.id::text = p_ref and m.status = 'done' and public.challenge_progress(m.id) >= c.target);
    month_cap := 6;
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

-- ───────────── award_badge: igual que en 034_integracion (su última definición), más la insignia de un reto ─────────────
-- 'reto:<id del reto>': la persona terminó ese reto y el reto tiene insignia. Perfil y Academia solo pintan las 10 fijas
-- (una clave desconocida se ignora); la insignia del reto se muestra en Retos › Terminados.
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
    when 'sprout' then exists (select 1 from public.assets where user_id = uid)
    when 'star' then (select count(*) from public.month_closures where user_id = uid) >= 12
    else false end;
  if not ok and p_badge like 'reto:%' then
    ok := exists (select 1 from public.challenge_members m join public.challenges c on c.id = m.challenge_id
                   where m.user_id = uid and 'reto:' || c.id::text = p_badge and c.badge_name is not null
                     and m.status = 'done' and public.challenge_progress(m.id) >= c.target);
  end if;
  if not ok then return false; end if;
  insert into public.user_badges (user_id, badge) values (uid, p_badge) on conflict do nothing;
  return found;
end $$;

-- ───────────── Los 3 retos fijos de Metas (031) pasan al modelo nuevo; los que estaban activos siguen activos ─────────────
-- Se publican para todos, de check-in (sin montos: la persona marca si lo hizo). `user_challenges` queda intacta.
insert into public.challenges (title, description, image, measure, wildcards, days, audience, points, status, legacy_key, published_at)
values
  ('Una semana sin delivery', 'Cada día marcas si comiste sin pedir a domicilio.', 'vacio-movimientos', 'checkin', 1, 7, 'all', 20, 'published', 'delivery', now()),
  ('Café en casa por 2 semanas', 'Cada día marcas si tomaste el café en casa.', 'meta-comprar', 'checkin', 2, 14, 'all', 30, 'published', 'cafe', now()),
  ('Redondea cada gasto', 'Cada día marcas si redondeaste tus gastos y apartaste la diferencia.', 'onb-metas', 'checkin', 3, 30, 'all', 40, 'published', 'redondeo', now())
on conflict (legacy_key) do nothing;

-- Empiezan hoy (en la zona de cada persona): el modelo anterior no guardaba avance.
insert into public.challenge_members (user_id, challenge_id, start_on, joined_at)
select uc.user_id, c.id, public.challenge_today_of(uc.user_id), uc.joined_at
  from public.user_challenges uc join public.challenges c on c.legacy_key = uc.challenge
 where uc.active
   and not exists (select 1 from public.challenge_members m where m.user_id = uc.user_id and m.challenge_id = c.id);

-- ───────────── Quién puede llamar qué ─────────────
revoke execute on function public.challenge_today_of(uuid) from public, anon, authenticated;
revoke execute on function public.challenge_account_ok(uuid) from public, anon, authenticated;
revoke execute on function public.challenge_try_finish(uuid) from public, anon, authenticated;
revoke execute on function public.challenge_notice(uuid) from public, anon, authenticated;
revoke execute on function public.challenge_idle_members(int) from public, anon, authenticated;
revoke execute on function public.challenge_visible(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.challenge_can_go(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.challenge_progress(uuid) from public, anon, authenticated;
revoke execute on function public.challenge_last_mark(uuid) from public, anon, authenticated;
revoke execute on function public.protect_challenge_rules() from public, anon, authenticated;   -- solo el disparador
revoke execute on function public.challenge_local_today(text) from public, anon;
grant execute on function public.challenge_local_today(text) to authenticated, service_role;
grant execute on function public.challenge_today_of(uuid) to service_role;
grant execute on function public.challenge_account_ok(uuid) to service_role;
grant execute on function public.challenge_notice(uuid) to service_role;
grant execute on function public.challenge_idle_members(int) to service_role;

-- Las que usan las políticas y la app: todas miran auth.uid() (nadie pregunta por otra persona).
revoke execute on function public.challenge_today() from public, anon;
revoke execute on function public.challenge_for_me(uuid) from public, anon;
revoke execute on function public.challenge_can_go_me(uuid) from public, anon;
revoke execute on function public.challenge_set_board(uuid, boolean) from public, anon;
revoke execute on function public.challenge_list() from public, anon;
revoke execute on function public.challenge_join(uuid) from public, anon;
revoke execute on function public.challenge_checkin(uuid, boolean) from public, anon;
revoke execute on function public.challenge_count(text, text) from public, anon;
revoke execute on function public.challenge_info() from public, anon;
revoke execute on function public.challenge_board(uuid) from public, anon;
revoke execute on function public.admin_challenge_totals() from public, anon;
grant execute on function public.challenge_today() to authenticated;
grant execute on function public.challenge_for_me(uuid) to authenticated;
grant execute on function public.challenge_can_go_me(uuid) to authenticated;
grant execute on function public.challenge_set_board(uuid, boolean) to authenticated;
grant execute on function public.challenge_list() to authenticated;
grant execute on function public.challenge_join(uuid) to authenticated;
grant execute on function public.challenge_checkin(uuid, boolean) to authenticated;
grant execute on function public.challenge_count(text, text) to authenticated;
grant execute on function public.challenge_info() to authenticated;
grant execute on function public.challenge_board(uuid) to authenticated;
grant execute on function public.admin_challenge_totals() to authenticated;
