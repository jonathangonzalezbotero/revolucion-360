-- Lo que faltaba del diseño del panel de administración (mockups AdminPlanes y AdminPaises).
-- SOLO AGREGA columnas con valor por defecto: no cambia ni borra datos (CLAUDE.md, regla 0).
-- Los permisos ya existen: estas tablas las lee todo usuario y las escribe solo el admin.

-- Cupones: a qué intervalo aplica y hasta cuándo se puede usar.
alter table public.coupons add column if not exists applies_to text not null default 'both'
  check (applies_to in ('month', 'year', 'both'));
alter table public.coupons add column if not exists expires_at timestamptz;

-- Países: idioma con el que empieza un usuario nuevo de ese país y el apartado para impuestos
-- de trabajadores independientes (Deudas e impuestos), con el aviso que ven los usuarios.
alter table public.countries add column if not exists default_locale text not null default 'es'
  check (default_locale in ('es', 'en'));
alter table public.countries add column if not exists tax_reserve_enabled boolean not null default true;
alter table public.countries add column if not exists tax_reserve_note text not null default '';
