-- Revolución 360 · nuevo modelo de cobro (25 nov 2026): un solo plan, sin plan gratis, en USD.
-- SOLO AGREGA (CLAUDE.md regla 0): una columna con valor nulo por defecto y una clave nueva de configuración.
-- No cambia ninguna fila existente. Lo revisa una persona antes de `npm run db:migrate`.

-- 1) Precio único de $1 (primer mes) en Stripe. Vive junto a los de $8 y $80 en la fila 'DEFAULT' (USD) de price_regions,
--    que escribe scripts/stripe-setup.ts. Las demás regiones se conservan pero ya no se usan para cobrar.
alter table public.price_regions add column if not exists stripe_price_first text;

-- 2) Montos del plan, editables por el admin (centavos de USD). Cambiar un monto solo afecta suscripciones NUEVAS:
--    después hay que correr scripts/stripe-setup.ts (crea el precio nuevo en Stripe y desactiva el viejo).
--    notify_before_days: días antes del primer cobro completo que promete la app (Stripe manda trial_will_end 3 días antes).
--    notify_first_charge: false = no mandar el correo "Tu primer mes termina en 3 días".
insert into public.app_config (key, value) values
  ('billing', '{"first_month_cents":100,"monthly_cents":800,"yearly_cents":8000,"notify_before_days":3,"notify_first_charge":true}')
on conflict (key) do nothing;
