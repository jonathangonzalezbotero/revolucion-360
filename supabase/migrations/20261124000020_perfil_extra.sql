-- Perfil: apellido, teléfono, última vez que cambió la contraseña; categorías recuerdan su nombre original.
alter table public.profiles add column last_name text not null default '';
alter table public.profiles add column phone text not null default '';
alter table public.profiles add column password_changed_at timestamptz;
alter table public.categories add column original_name text;
update public.categories set original_name = name where original_name is null;

-- Al confirmar un correo nuevo o cambiar la contraseña en Auth, se refleja en el perfil.
create or replace function public.sync_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  if new.encrypted_password is distinct from old.encrypted_password then
    update public.profiles set password_changed_at = now() where id = new.id;
  end if;
  return new;
end $$;
create trigger on_auth_user_updated after update on auth.users
  for each row execute function public.sync_auth_user();
revoke execute on function public.sync_auth_user() from public, anon, authenticated;
