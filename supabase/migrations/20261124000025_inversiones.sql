-- Inversiones: tipo (acciones y ETF, cripto, jubilación, propiedad, otro).
alter table public.investments add column kind text not null default 'other'
  check (kind in ('etf','stocks','crypto','retirement','property','term_deposit','other'));
