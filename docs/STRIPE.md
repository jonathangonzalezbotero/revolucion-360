# Stripe en Revolución 360

Desde el 25 nov 2026 hay **un solo plan, todo incluido, en USD** (CLAUDE.md regla 6): primer mes $1, después $8 al mes; o $80 al año pagados de entrada (2 meses gratis). Stripe muestra la conversión a la moneda de la tarjeta. Los montos viven en `app_config.billing` (los edita el Dueño en `/admin/planes`); un cambio de monto solo aplica a suscripciones nuevas.

La app nunca ve la tarjeta: se pone dentro de la app con **Stripe Embedded Checkout** (`/activar`, librerías oficiales `@stripe/stripe-js` y `@stripe/react-stripe-js`) y la gestión (tarjeta, facturas, cambiar mensual/anual, cancelar) va por el **Customer Portal**.
**El estado del plan solo cambia con los avisos firmados de Stripe** (`POST /api/stripe/webhook`), nunca con lo que diga el navegador.

Sin claves la app funciona igual: `/activar` y `/suscripcion` avisan que los pagos aún no están activos. En desarrollo solo se aceptan claves `sk_test_`.

## Cómo se cobra
| Caso | Lo que se le pide a Stripe | Paga hoy |
|---|---|---|
| Mensual, primera vez (cuenta sin activar que nunca tuvo suscripción) | Suscripción de $8 con **30 días de prueba** + cargo único de $1 (producto aparte "Revolución 360 · Primer mes") en el mismo pago | $1 |
| Mensual, vuelve (solo lectura, acceso gratis vencido o ya pagó antes) | Suscripción de $8, sin prueba | $8 |
| Anual | Suscripción de $80, sin prueba | $80 |

- El primer mes es `stripe_status = 'trialing'` y cuenta como pagando (`state = 'pro'`).
- **`customer.subscription.trial_will_end`**: Stripe lo manda 3 días antes de que termine la prueba → correo 5 "Fin del primer mes" y aviso en la app (una sola vez por suscripción; se apaga con `app_config.billing.notify_first_charge = false`).
- Antes de abrir el pago se comprueba que los precios de Stripe digan lo mismo que `app_config.billing` (monto, USD, frecuencia, activos). Si no, no se cobra y se registra "correr scripts/stripe-setup.ts".
- **Cupones:** se escriben en `/activar` (no en la página de Stripe). Se revisa su frecuencia y vencimiento en la tabla `coupons` (`coupon_rule`) y se aplican con su código de promoción. **Un cupón aplica solo al producto del plan ($8 / $80), nunca al $1 del primer mes** (`applies_to.products`). El pago rechaza un cupón de Stripe sin esa restricción.

## Piezas
| Pieza | Qué hace |
|---|---|
| `src/lib/stripe.ts` | Cliente (solo servidor), `ensureCustomer`, `loadBilling`, `loadStripePrices`, `pricesInSync`, `planProductId` y `couponOnlyForPlan`. |
| `POST /api/stripe/checkout` | `{ interval: "month" \| "year", coupon? }` → `clientSecret` de Embedded Checkout (`ui_mode: "embedded_page"`). Vuelve a `/activar?pago={CHECKOUT_SESSION_ID}`. |
| `POST /api/stripe/portal` | `{ flow?: "home" \| "payment_method_update" }` → URL del Customer Portal. |
| `POST /api/stripe/webhook` | Verifica la firma y actualiza `entitlements` con la clave de servicio. Eventos: `checkout.session.completed`, `customer.subscription.created/updated/deleted/trial_will_end`, `invoice.paid`, `invoice.payment_failed`. |
| `src/app/(auth)/activar/` | "Activa tu cuenta": mensual o anual (`?plan=anual`), tarjeta embebida, cupón y "¿Eres alumno? Tengo un código". |
| `src/app/(app)/suscripcion/` | Estado del plan, facturas, cancelar al final del periodo; `lib.ts` con la lógica pura (probada en `tests/suscripcion.test.ts`). |
| `/admin/planes` | Montos en USD y días de aviso (`app_config.billing`), cupones (crea cupón restringido al plan + código de promoción en Stripe). |
| `scripts/stripe-setup.ts` | Productos, precios en USD, ids en `price_regions` (fila `DEFAULT`) y cupones. Ver abajo. |

## Reglas que aplica el aviso
- `active`, `trialing`, `past_due` → `pro`. `past_due` pasa a solo lectura cuando Stripe termina sus reintentos, **si** en Settings → Billing → Subscriptions la opción al agotar reintentos es cancelar la suscripción o marcarla `unpaid`.
- `canceled`, `unpaid`, `incomplete_expired`, `paused` (solo si venía de `pro`) → vuelve al acceso gratis vigente (fundador antes que alumno) o, si no tiene, a `read_only`. Nunca se borran datos.
- `incomplete`, o una suscripción que termina sin haber llegado a pagar → no cambia el estado (nadie queda en solo lectura sin haber pagado).
- `invoice.payment_failed` → `payment_failed_at` + notificación + correo de pago fallido. `invoice.paid` lo limpia.
- Idempotente: cada aviso vuelve a leer la suscripción en Stripe y escribe el estado completo. Un aviso tardío de una suscripción vieja no pisa la nueva.

## Configurar (modo prueba) — pasos para Jonathan
1. En el panel de Stripe, **modo prueba**: copia la clave secreta `sk_test_…` y la publicable `pk_test_…`.
2. En `.env` (nunca en el repositorio):
   ```
   STRIPE_SECRET_KEY=sk_test_...
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...   # la necesita la tarjeta embebida de /activar
   STRIPE_WEBHOOK_SECRET=whsec_...
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```
3. Aplica las migraciones (la `…028_cobro.sql` crea `app_config.billing` y la columna `price_regions.stripe_price_first`).
4. Corre el script (se niega a correr sin `sk_test_`; se puede repetir sin duplicar nada):
   ```
   npx tsx scripts/stripe-setup.ts
   ```
   1. Crea o reutiliza el producto "Revolución 360" (el plan) y "Revolución 360 · Primer mes" (el $1).
   2. Crea o reutiliza los precios USD (`lookup_key` `r360_plan_usd_month | _year | _first`). Si cambió un monto, crea el nuevo y desactiva el viejo.
   3. Guarda los ids en la fila `DEFAULT` de `price_regions`.
   4. Crea en Stripe los cupones de `coupons` que faltan, **restringidos al producto del plan**.
   5. Rehace los cupones ya creados sin esa restricción: cupón nuevo restringido, pausa el código viejo y crea uno con el mismo código. Hasta correrlo, el pago rechaza esos códigos.
5. Webhook: agrega el evento **`customer.subscription.trial_will_end`** al endpoint (o usa `stripe listen`, que reenvía todos).
6. Customer Portal (Settings → Billing → Customer portal): cambiar tarjeta, ver facturas, datos de facturación, cancelar **al final del periodo**, y **cambiar de plan entre mensual ($8) y anual ($80)** (agrega los dos precios del producto "Revolución 360").

## Probar el aviso en local
1. `stripe login` y deja abierta: `stripe listen --forward-to localhost:3000/api/stripe/webhook`. Copia el `whsec_…` en `STRIPE_WEBHOOK_SECRET`.
2. Con una cuenta nueva (sin activar), en `/activar` paga el mensual con `4242 4242 4242 4242`: hoy se cobra $1, la cuenta pasa a `pro` con `stripe_status = 'trialing'`.
3. Fin del primer mes: `stripe trigger customer.subscription.trial_will_end` (o adelanta el reloj con un Test Clock) → correo 5 y aviso en la app.
4. Otros casos: pago fallido con `4000 0000 0000 0341`; cancelar desde `/suscripcion` o el Portal (al terminar el periodo queda en solo lectura); reenviar un aviso (`stripe events resend <evt_id>`) no duplica nada; un cupón no descuenta el $1.

## Producción
Crear un endpoint en Stripe (Developers → Webhooks) apuntando a `https://app.revoluciondeldinero.com/api/stripe/webhook` con los eventos de arriba (incluido `trial_will_end`) **y la misma versión de API que fija el SDK instalado** (`2026-11-18.endive` con stripe 23.2.0), y poner sus claves en Vercel. El script no corre con claves de producción: los productos, precios y cupones de producción se crean a mano o con un script revisado aparte.
