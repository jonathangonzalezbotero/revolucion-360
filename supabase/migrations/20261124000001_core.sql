-- Revolución 360 · esquema base
-- Reglas: montos en centavos (bigint), una moneda por usuario, todo dato financiero lleva user_id.

create extension if not exists pgcrypto;

-- ───────────────────────── Perfil y acceso ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  country text not null default 'AU',
  currency text not null default 'AUD',
  timezone text not null default 'Australia/Sydney',
  locale text not null default 'es',
  role text not null default 'user' check (role in ('user','admin')),
  terms jsonb not null default '{}'::jsonb,           -- nombres que el usuario renombra (super → pensión)
  prefs jsonb not null default '{}'::jsonb,           -- notificaciones, etc.
  mov_level text not null default 'detail' check (mov_level in ('plan','totals','detail')),
  pay_frequency text not null default 'weekly' check (pay_frequency in ('weekly','fortnightly','monthly')),
  onboarding_step text not null default 'welcome',    -- welcome | wizard | done
  wizard jsonb not null default '{}'::jsonb,          -- respuestas del asistente "Arma tu plan"
  first_steps jsonb not null default '{}'::jsonb,
  suspended_at timestamptz,
  last_active_at timestamptz,
  created_at timestamptz not null default now()
);

-- Estado del plan. Solo lo escribe el servidor (Stripe, admin, cron). El usuario solo lo lee.
create table public.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state text not null default 'free' check (state in ('free','trial','pro','alumno','fundador','read_only')),
  trial_ends_at timestamptz,
  trial_used boolean not null default false,
  pro_until timestamptz,
  access_until timestamptz,           -- vencimiento del acceso gratis de alumno (null = de por vida)
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_status text,
  billing_interval text check (billing_interval in ('month','year')),
  cancel_at_period_end boolean not null default false,
  payment_failed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);
create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (group_id, user_id)
);
create table public.access_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'alumno' check (kind in ('alumno','fundador')),
  expires_at timestamptz,             -- null = de por vida
  group_id uuid references public.groups(id) on delete set null,
  invite_code text,
  granted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.access_grants(user_id);
create table public.invite_codes (
  code text primary key,
  kind text not null default 'alumno' check (kind in ('alumno','fundador')),
  months int,                         -- duración en meses
  until timestamptz,                  -- o hasta una fecha; ambos null = de por vida
  group_id uuid references public.groups(id) on delete set null,
  max_uses int,
  uses int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Configuración (Admin) ─────────────────────────
create table public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
create table public.countries (
  code text primary key,
  name text not null,
  currency text not null,
  locale_number text not null default 'en-AU',
  timezone text not null,
  pay_frequency text not null default 'monthly',
  terms jsonb not null default '{}'::jsonb,
  categories jsonb not null default '[]'::jsonb,
  benchmarks jsonb not null default '{}'::jsonb,
  examples jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  sort int not null default 0
);
create table public.price_regions (
  region text primary key,            -- código de país o 'DEFAULT'
  currency text not null,
  monthly_cents bigint,
  yearly_cents bigint,
  stripe_price_monthly text,
  stripe_price_yearly text,
  student_discount_pct int not null default 0
);
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  percent_off int not null check (percent_off between 1 and 100),
  duration_months int,                -- null = para siempre
  max_redemptions int,
  redemptions int not null default 0,
  stripe_coupon_id text,
  stripe_promo_id text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Plan anual ─────────────────────────
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('income','expense','debt','saving','goal')),
  color text not null default '#141612',
  is_basic boolean not null default false,   -- cuenta para el fondo de emergencia
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.categories(user_id);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('bank','savings','card','cash','business')),
  institution text not null default '',
  balance_cents bigint not null default 0,   -- saldo escrito a mano (tarjetas en negativo)
  balance_date date not null default current_date,
  in_forecast boolean not null default true,
  in_networth boolean not null default true, -- la cuenta de empresa nace en false
  is_emergency_fund boolean not null default false,
  archived_at timestamptz,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.accounts(user_id);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default '',
  target_cents bigint not null default 0,
  target_date date,
  is_emergency_fund boolean not null default false,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.goals(user_id);
create table public.goal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  date date not null,
  amount_cents bigint not null,       -- + aporte, − uso
  note text not null default '',
  created_at timestamptz not null default now()
);
create index on public.goal_entries(goal_id);

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('loan','card','bnpl','personal','other')),
  start_balance_cents bigint not null default 0,
  balance_cents bigint not null default 0,
  rate_bps int not null default 0,    -- tasa anual en puntos básicos
  payment_cents bigint not null default 0,
  payment_frequency text not null default 'monthly' check (payment_frequency in ('weekly','fortnightly','monthly')),
  next_due date,
  schedule jsonb,                     -- Afterpay/Zip: 4 pagos [{date, amount_cents, paid}]
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.debts(user_id);
create table public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  debt_id uuid not null references public.debts(id) on delete cascade,
  date date not null,
  amount_cents bigint not null check (amount_cents > 0),
  kind text not null default 'cuota' check (kind in ('cuota','abono','total')),
  created_at timestamptz not null default now()
);
create index on public.debt_payments(debt_id);

create table public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  name text not null default '',
  contributed_cents bigint not null default 0,
  value_cents bigint not null default 0,
  value_date date not null default current_date,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.investments(user_id);
create table public.investment_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  investment_id uuid not null references public.investments(id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('aporte','retiro','valor')),
  amount_cents bigint not null,
  created_at timestamptz not null default now()
);
create index on public.investment_entries(investment_id);

create table public.plan_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  year int not null,
  category_id uuid not null references public.categories(id) on delete restrict,
  name text not null,
  kind text not null check (kind in ('income','expense')),
  frequency text not null default 'monthly' check (frequency in ('monthly','fortnightly','weekly','yearly','once','custom')),
  amount_cents bigint not null default 0,    -- monto por pago
  first_pay_date date,
  debt_id uuid references public.debts(id) on delete set null,
  goal_id uuid references public.goals(id) on delete set null,
  investment_id uuid references public.investments(id) on delete set null,
  sort int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.plan_lines(user_id, year);
create table public.plan_cells (
  line_id uuid not null references public.plan_lines(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  month smallint not null check (month between 1 and 12),
  amount_cents bigint not null default 0,
  manual boolean not null default false,     -- la celda editada a mano gana sobre la frecuencia
  primary key (line_id, month)
);
create index on public.plan_cells(user_id);
create table public.plan_marks (             -- "Pagado · a mano"
  line_id uuid not null references public.plan_lines(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  month smallint not null check (month between 1 and 12),
  marked_at timestamptz not null default now(),
  primary key (line_id, month)
);

-- ───────────────────────── Movimientos ─────────────────────────
create table public.csv_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  bank text not null default '',
  rows_total int not null default 0,
  rows_imported int not null default 0,
  rows_duplicate int not null default 0,
  rows_transfer int not null default 0,
  balance_diff_cents bigint,
  created_at timestamptz not null default now()
);
create table public.csv_formats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bank text not null,
  mapping jsonb not null,             -- {date, description, amount | debit/credit, balance, dateFormat, header}
  updated_at timestamptz not null default now(),
  unique (user_id, bank)
);
create table public.recurring (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  amount_cents bigint not null,
  account_id uuid references public.accounts(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  plan_line_id uuid references public.plan_lines(id) on delete set null,
  frequency text not null check (frequency in ('weekly','fortnightly','monthly')),
  next_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  date date not null,
  amount_cents bigint not null,       -- entra positivo, sale negativo
  description text not null default '',
  raw_description text not null default '',
  category_id uuid references public.categories(id) on delete set null,
  plan_line_id uuid references public.plan_lines(id) on delete set null,
  kind text not null default 'normal' check (kind in ('normal','transfer')),
  transfer_pair_id uuid,
  status text not null default 'ok' check (status in ('ok','review')),
  source text not null default 'manual' check (source in ('manual','csv','recurring')),
  import_id uuid references public.csv_imports(id) on delete set null,
  recurring_id uuid references public.recurring(id) on delete set null,
  parent_id uuid references public.transactions(id) on delete cascade,  -- partes de un movimiento dividido
  is_split boolean not null default false,  -- el padre dividido no cuenta; cuentan sus partes
  note text not null default '',
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.transactions(user_id, date);
create index on public.transactions(plan_line_id);
create table public.transaction_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid not null,
  action text not null check (action in ('create','update','delete','split','link')),
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index on public.transaction_history(user_id, transaction_id);
create table public.category_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pattern text not null,              -- texto que contiene la descripción (minúsculas)
  category_id uuid references public.categories(id) on delete cascade,
  plan_line_id uuid references public.plan_lines(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.month_totals (           -- nivel "Totales del mes"
  user_id uuid not null references auth.users(id) on delete cascade,
  year int not null,
  month smallint not null check (month between 1 and 12),
  category_id uuid not null references public.categories(id) on delete cascade,
  amount_cents bigint not null default 0,
  primary key (user_id, year, month, category_id)
);
create table public.watched_merchants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  pattern text not null,
  created_at timestamptz not null default now()
);
create table public.month_closures (
  user_id uuid not null references auth.users(id) on delete cascade,
  year int not null,
  month smallint not null check (month between 1 and 12),
  closed_at timestamptz not null default now(),
  reopened_at timestamptz,
  snapshot jsonb not null default '{}'::jsonb,
  primary key (user_id, year, month)
);
create table public.forecast_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  config jsonb not null default '{}'::jsonb,  -- {off: [lineId], extra: [{name, amount_cents, from, to}]}
  created_at timestamptz not null default now()
);

-- Impuestos (ABN) y cuenta con la empresa
create table public.tax_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  percent_bps int not null default 0,
  account_id uuid references public.accounts(id) on delete set null,
  company_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.tax_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('ingreso','apartado','pago')),
  amount_cents bigint not null,
  note text not null default '',
  created_at timestamptz not null default now()
);
create table public.company_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('aporte','retiro')),
  class text not null default 'sin_clasificar' check (class in ('sin_clasificar','sueldo','dividendo','devolucion','prestamo')),
  amount_cents bigint not null check (amount_cents > 0),
  note text not null default '',
  created_at timestamptz not null default now()
);

-- ───────────────────────── Academia ─────────────────────────
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  stage text not null,                -- "Domina la app" | "Tu dinero"
  number int not null,
  title text not null,
  description text not null default '',
  cover_url text not null default '',
  status text not null default 'draft' check (status in ('draft','scheduled','published')),
  publish_at timestamptz,
  tier text not null default 'free' check (tier in ('free','pro')),
  priority text,                      -- indicador del diagnóstico que ataca
  sort int not null default 0
);
create table public.course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  sort int not null default 0
);
create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  module_id uuid references public.course_modules(id) on delete set null,
  title text not null,
  description text not null default '',
  video_url text not null default '',
  duration_sec int not null default 0,
  points int not null default 10,
  cta_screen text,                    -- pantalla de "Hazlo ahora en la app"
  tier text not null default 'free' check (tier in ('free','pro')),
  required boolean not null default false,
  sort int not null default 0
);
create table public.lesson_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  rating smallint check (rating between 1 and 5),
  primary key (user_id, lesson_id)
);

-- ───────────────────────── Puntos, insignias y racha ─────────────────────────
create table public.point_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  ref text not null,
  points int not null,
  at timestamptz not null default now(),
  unique (user_id, kind, ref)
);
create table public.user_badges (
  user_id uuid not null references auth.users(id) on delete cascade,
  badge text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge)
);
create table public.activity_weeks (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,           -- lunes, en la zona horaria del usuario
  wildcard boolean not null default false,
  primary key (user_id, week_start)
);

-- ───────────────────────── Notificaciones, soporte, privacidad ─────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,                 -- cierre | logro | acceso | pago | academia | sistema
  title text not null,
  body text not null default '',
  href text,
  dedupe text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe)
);
create index on public.notifications(user_id, created_at desc);
create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  ref text not null,
  sent_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);
create table public.faqs (
  id uuid primary key default gen_random_uuid(),
  topic text not null default 'general',
  question text not null,
  answer text not null,
  locale text not null default 'es',
  sort int not null default 0,
  published boolean not null default true
);
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null default 'general',
  subject text not null,
  status text not null default 'open' check (status in ('open','answered','closed')),
  tech jsonb not null default '{}'::jsonb,   -- nunca montos ni movimientos
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  from_admin boolean not null default false,
  body text not null,
  created_at timestamptz not null default now()
);
create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('export','delete')),
  status text not null default 'pending' check (status in ('pending','done','cancelled')),
  requested_at timestamptz not null default now(),
  due_at timestamptz not null default now() + interval '30 days',
  done_at timestamptz
);
create table public.admin_audit (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_user uuid,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index on public.admin_audit(at desc);
create table public.admin_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  admin_id uuid references auth.users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create table public.product_events (         -- embudo del producto, sin montos
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  at timestamptz not null default now()
);
create index on public.product_events(name, at);
create index on public.product_events(user_id);
