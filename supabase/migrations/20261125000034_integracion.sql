-- Integración del 25 nov 2026 (un solo plan, metas amables, inversiones por activo, subroles de admin).
-- SOLO AGREGA (CLAUDE.md, regla 0): una función nueva, `create or replace` de funciones existentes, una política recreada
-- (drop policy + create policy) y un UPDATE acotado de una clave de configuración. No borra tablas, columnas ni filas.
-- Corre DESPUÉS de 028–033 y pisa sus definiciones de `admin_revoke_access` y de la política de `lesson_media`.
-- Lo revisa una persona antes de `npm run db:migrate`.

-- ───────────── ¿Cuenta activa? (igual que `isActive` de src/lib/engine/access.ts) ─────────────
-- Activa = pagando (state 'pro'; el primer mes es stripe_status 'trialing' y también es 'pro'), alumno o fundador con el
-- acceso vigente, o una prueba vieja ('trial') que aún no vence. NO cuentan: sin activar ('free'), solo lectura
-- ('read_only') ni una cuenta suspendida.
create or replace function public.is_active_account() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.entitlements e where e.user_id = auth.uid() and (
           e.state = 'pro'
           or (e.state in ('alumno','fundador') and (e.access_until is null or e.access_until > now()))
           or (e.state = 'trial' and e.trial_ends_at > now())))
     and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.suspended_at is not null);
$$;
revoke execute on function public.is_active_account() from public, anon;
grant execute on function public.is_active_account() to authenticated;

-- ───────────── Videos de la Academia: solo con cuenta activa ─────────────
-- La 029 quitó el requisito de plan: una cuenta sin activar podía leer los enlaces por la API. Misma política de la 029
-- (curso liberado y visible para su grupo) MÁS cuenta activa. El admin, siempre.
drop policy if exists read_allowed on public.lesson_media;
create policy read_allowed on public.lesson_media for select to authenticated using (
  public.is_admin() or (public.is_active_account() and exists (select 1 from public.lessons l
    where l.id = lesson_id and public.course_live(l.course_id) and public.course_visible(l.course_id))));

-- ───────────── Quitar un acceso gratis: queda en solo lectura, no "sin activar" ─────────────
-- Misma definición que 20261125000033_admin_roles.sql (chequeo de subrol Soporte al pie de la letra); solo cambia el
-- estado al que pasa: si tiene una suscripción pagando (mismos estados que PAYING en src/app/(app)/suscripcion/lib.ts)
-- queda 'pro'; si no, 'read_only' (ve y exporta todo, con el botón para reactivar). Nunca 'free'. Nada se borra.
create or replace function public.admin_revoke_access(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_of('soporte') then raise exception 'forbidden'; end if;
  update public.access_grants set revoked_at = now() where user_id = p_user and revoked_at is null;
  update public.entitlements
     set state = case when stripe_status in ('active','trialing','past_due') then 'pro' else 'read_only' end,
         access_until = null, updated_at = now()
   where user_id = p_user and state in ('alumno','fundador');
  perform public.admin_log('quitar_acceso', p_user, '{}'::jsonb);
end $$;

-- ───────────── Insignia "Primera inversión" (sprout): cuenta los activos nuevos ─────────────
-- Igual que 20261124000002_security.sql (su única definición), salvo 'sprout': ahora mira `assets` (Inversiones por
-- activo, migración 032) en vez de la tabla anterior `investments`.
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
  if not ok then return false; end if;
  insert into public.user_badges (user_id, badge) values (uid, p_badge) on conflict do nothing;
  return found;
end $$;

-- ───────────── Puntos por cumplir una meta: 50 (antes 100) ─────────────
-- Aprobado por Jonathan el 25 nov 2026. Solo cambia la clave `goal_done` de `app_config.points`; las demás se conservan.
update public.app_config
   set value = jsonb_set(value, '{goal_done}', '50'::jsonb, true), updated_at = now()
 where key = 'points';
