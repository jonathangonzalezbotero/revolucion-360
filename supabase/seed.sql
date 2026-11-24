-- Solo para el entorno LOCAL (se ejecuta con `supabase db reset`). Nunca corre en producción.
-- En local no exigimos 2 pasos al admin para poder probar el panel.
update public.app_config set value = 'false' where key = 'admin_mfa_required';
