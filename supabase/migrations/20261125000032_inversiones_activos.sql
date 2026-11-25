-- Inversiones por activo (cambios del 25 nov 2026).
-- Solo agrega: dos tablas nuevas con RLS y una copia idempotente de las inversiones anteriores.
-- Las tablas `investments` e `investment_entries` se conservan intactas (las siguen leyendo Cierre, Perfil y Academia).
--
-- Dinero en centavos enteros (bigint). Cantidades y precios por unidad pueden tener decimales (0.012 BTC,
-- USD 0.0004 por token): numeric(38,10), exacto, nunca float. La app los lee como texto (`quantity::text`).

-- ───────────── Activos ─────────────
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),           -- símbolo o nombre: VOO, BTC, AustralianSuper
  kind text not null default 'other' check (kind in ('etf','stocks','crypto','fund','retirement','property','other')),
  platform text check (platform is null or char_length(platform) <= 80),  -- opcional: Stake, CommSec, Binance
  by_units boolean not null default false,       -- true: cantidad × precio por unidad · false: se sigue por saldo
  unit_price_cents numeric(38,10) check (unit_price_cents is null or unit_price_cents >= 0), -- precio de hoy por unidad, a mano
  balance_cents bigint check (balance_cents is null or balance_cents >= 0),                  -- saldo de hoy, a mano
  price_date date,                               -- "Actualizado: …" (fecha del usuario)
  price_at timestamptz,                          -- desempata operaciones del mismo día
  plan_line_id uuid references public.plan_lines(id) on delete set null, -- compra recurrente ligada a una línea del plan
  recurring_from date,                           -- desde cuándo se suman solas
  legacy_investment_id uuid unique references public.investments(id) on delete set null, -- copiada de la versión anterior
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists assets_user_id_idx on public.assets(user_id);

-- ───────────── Operaciones: compra, venta y dividendo ─────────────
create table if not exists public.asset_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('buy','sell','dividend')),
  quantity numeric(38,10) check (quantity is null or quantity > 0),        -- unidades (solo activos por unidades)
  unit_price_cents numeric(38,10) check (unit_price_cents is null or unit_price_cents >= 0),
  amount_cents bigint not null check (amount_cents > 0),                   -- lo que costó, lo que te dieron o el dividendo
  source text not null default 'manual' check (source in ('manual','recurring','migrated')),
  recurring_month text check (recurring_month is null or recurring_month ~ '^\d{4}-\d{2}$'),
  deleted_at timestamptz,                        -- se oculta, no se borra (y una recurrente borrada no vuelve a crearse)
  created_at timestamptz not null default now(),
  constraint asset_operations_recurring_once unique (asset_id, recurring_month) -- una compra recurrente por mes, nunca dos
);
create index if not exists asset_operations_asset_id_idx on public.asset_operations(asset_id);
create index if not exists asset_operations_user_id_idx on public.asset_operations(user_id);

-- ───────────── Permisos (como 20261124000002_security.sql) ─────────────
do $$
declare t text;
begin
  foreach t in array array['assets','asset_operations'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'own_select') then
      execute format('create policy own_select on public.%I for select to authenticated using (user_id = auth.uid())', t);
      execute format('create policy own_insert on public.%I for insert to authenticated with check (user_id = auth.uid() and public.can_write())', t);
      execute format('create policy own_update on public.%I for update to authenticated using (user_id = auth.uid() and public.can_write()) with check (user_id = auth.uid())', t);
      execute format('create policy own_delete on public.%I for delete to authenticated using (user_id = auth.uid() and public.can_write())', t);
    end if;
  end loop;
end $$;

-- Un dato del usuario solo apunta a otro dato del MISMO usuario (las llaves foráneas no pasan por RLS)
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'same_owner' and tgrelid = 'public.assets'::regclass) then
    create trigger same_owner before insert or update on public.assets
      for each row execute function public.same_owner('plan_line_id','plan_lines','legacy_investment_id','investments');
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'same_owner' and tgrelid = 'public.asset_operations'::regclass) then
    create trigger same_owner before insert or update on public.asset_operations
      for each row execute function public.same_owner('asset_id','assets');
  end if;
end $$;

-- ───────────── Copia de las inversiones anteriores (solo agrega; correrla dos veces no duplica) ─────────────
-- La pantalla anterior guardaba el TIPO como texto en `investments.name` ("Acciones y ETF", "Cripto", el nombre local
-- de la jubilación…) y el nombre en `platform`. Si `name` no es un tipo conocido, es el nombre del producto.
-- Todas quedan "por saldo" (no se sabe cuántas unidades había), con lo aportado como una compra y su valor como saldo de hoy.
with retirement_labels as (
  select lower(trim(terms ->> 'retirement')) as label from public.countries where coalesce(terms ->> 'retirement', '') <> ''
  union select unnest(array['super','jubilación','jubilacion','retirement'])
),
src as (
  select i.*,
    case
      when lower(trim(i.name)) in ('acciones y etf','shares & etfs') then 'etf'
      when lower(trim(i.name)) in ('fondos','funds') then 'fund'
      when lower(trim(i.name)) in ('cripto','crypto') then 'crypto'
      when lower(trim(i.name)) in ('propiedad','property') then 'property'
      when lower(trim(i.name)) in ('ahorro con interés','interest savings','otro','other') then 'other'
      when lower(trim(i.name)) in (select label from retirement_labels)
        or lower(trim(i.name)) = lower(trim(coalesce(p.terms ->> 'retirement', ''))) and trim(i.name) <> '' then 'retirement'
      else null
    end as label_kind
  from public.investments i
  left join public.profiles p on p.id = i.user_id
)
insert into public.assets (user_id, name, kind, platform, by_units, balance_cents, price_date, price_at, legacy_investment_id, archived_at, created_at)
select
  s.user_id,
  left(case when s.label_kind is not null or trim(s.name) = '' then coalesce(nullif(trim(s.platform), ''), 'Inversión')
            else trim(s.name) end, 80),
  coalesce(s.label_kind, case s.kind when 'etf' then 'etf' when 'stocks' then 'stocks' when 'crypto' then 'crypto'
                                      when 'retirement' then 'retirement' when 'property' then 'property' else 'other' end),
  case when s.label_kind is not null or trim(s.name) = '' then null else left(nullif(trim(s.platform), ''), 80) end,
  false,
  greatest(s.value_cents, 0),
  s.value_date,
  s.created_at,
  s.id,
  s.archived_at,
  s.created_at
from src s
on conflict (legacy_investment_id) do nothing;

-- Lo aportado como una compra (fecha: cuando se creó, sin pasar del valor escrito, para que no se sume dos veces al saldo).
-- Si ya tiene cualquier operación copiada (aunque la persona la haya ocultado), no se vuelve a crear.
insert into public.asset_operations (user_id, asset_id, date, kind, amount_cents, source, created_at)
select a.user_id, a.id, least(i.created_at::date, i.value_date), 'buy', i.contributed_cents, 'migrated', i.created_at
from public.assets a
join public.investments i on i.id = a.legacy_investment_id
where i.contributed_cents > 0
  and not exists (select 1 from public.asset_operations o where o.asset_id = a.id and o.source = 'migrated');
