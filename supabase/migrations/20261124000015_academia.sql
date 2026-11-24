-- Academia: los cursos programados se ven (título, portada, fecha) aunque aún no se liberen; sus clases no.
drop policy read_live on public.courses;
create policy read_live on public.courses for select to authenticated using (public.is_admin() or status in ('published','scheduled'));

-- Marcar clases y calificar respeta la solo lectura.
drop policy own_insert on public.lesson_progress;
drop policy own_update on public.lesson_progress;
create policy own_insert on public.lesson_progress for insert to authenticated with check (user_id = auth.uid() and public.can_write());
create policy own_update on public.lesson_progress for update to authenticated using (user_id = auth.uid() and public.can_write()) with check (user_id = auth.uid());

-- Comentarios de cada clase. Se ven solo en clases liberadas; cada quien borra los suyos; admin modera.
create table public.lesson_comments (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null default '',
  body text not null check (length(body) between 1 and 2000),
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.lesson_comments(lesson_id, created_at);
alter table public.lesson_comments enable row level security;
create policy read_visible on public.lesson_comments for select to authenticated using (
  public.is_admin() or (hidden_at is null and exists (select 1 from public.lessons l where l.id = lesson_id and public.course_live(l.course_id))));
create policy own_insert on public.lesson_comments for insert to authenticated with check (
  user_id = auth.uid() and public.can_write() and hidden_at is null
  and exists (select 1 from public.lessons l where l.id = lesson_id and public.course_live(l.course_id)));
create policy own_delete on public.lesson_comments for delete to authenticated using (user_id = auth.uid() or public.is_admin());
create policy admin_update on public.lesson_comments for update to authenticated using (public.is_admin()) with check (public.is_admin());
