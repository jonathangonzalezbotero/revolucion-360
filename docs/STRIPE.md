# Stripe en Revolución 360

Stripe cobra Pro (mensual y anual). La app nunca ve la tarjeta: el pago va por **Stripe Checkout** y la gestión (tarjeta, facturas, cancelar) por el **Customer Portal**, ambos alojados por Stripe.
**El estado del plan solo cambia con los avisos firmados de Stripe** (`POST /api/stripe/webhook`), nunca con lo que diga el navegador.

Sin claves la app funciona igual: `/suscripcion` muestra los planes y avisa que los pagos aún no están activos; los botones de pagar quedan desactivados. En desarrollo solo se aceptan claves `sk_test_`.

## Piezas
| Pieza | Qué hace |
|---|---|
| `src/lib/stripe.ts` | Cliente de Stripe (solo servidor, se crea al primer uso), `ensureCustomer` (crea el cliente con `metadata.user_id` y guarda `stripe_customer_id`). |
| `POST /api/stripe/checkout` | `{ interval: "month" \| "year", coupon? }` → URL de Checkout en modo suscripción con el precio de la región, `client_reference_id = user_id`, cupón o descuento de alumno, idioma es/en. Vuelve a `/suscripcion?estado=ok\|cancelado`. |
| `POST /api/stripe/portal` | `{ flow?: "home" \| "payment_method_update" }` → URL del Customer Portal. |
| `POST /api/stripe/webhook` | Verifica la firma y actualiza `entitlements` con la clave de servicio. Maneja `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`. |
| `src/app/(app)/suscripcion/` | Pantalla, acciones (probar Pro, cancelar al final del periodo, deshacer, datos de facturación) y `lib.ts` con la lógica pura (probada en `tests/suscripcion.test.ts`). |
| `scripts/stripe-setup.ts` | Crea en modo prueba el producto, los precios por región, los cupones de alumno y los cupones de la tabla `coupons`. |

## Reglas que aplica el aviso
- `active`, `trialing`, `past_due` → `pro`. `past_due` pasa a solo lectura cuando Stripe termina sus reintentos, **si** en Settings → Billing → Subscriptions la opción al agotar reintentos es cancelar la suscripción o marcarla `unpaid` (`pro_until` = fin del periodo, `billing_interval`, `stripe_subscription_id`, `stripe_status`, `cancel_at_period_end`).
- `canceled`, `unpaid`, `incomplete_expired`, `paused` (solo si venía de `pro`) → vuelve al acceso gratis vigente (fundador antes que alumno, según `access_grants`) o, si no tiene, a `read_only`. Nunca se borran datos.
- `incomplete`, o una suscripción que termina sin haber llegado a Pro (primer pago no completado) → no cambia el estado.
- `invoice.payment_failed` → `payment_failed_at` + notificación (`dedupe = pago-fallido-<factura>`). El correo lo manda otro módulo. `invoice.paid` limpia `payment_failed_at`.
- Idempotente: cada aviso vuelve a leer la suscripción en Stripe y escribe el estado completo; `upgraded` se anota en `product_events` solo al pasar de no-Pro a Pro; las notificaciones llevan `dedupe`. Un aviso tardío de una suscripción vieja no pisa la nueva.

## Configurar (modo prueba)
1. En el panel de Stripe, **modo prueba**: copia la clave secreta `sk_test_…` y la publicable `pk_test_…`.
2. En `.env` (nunca en el repositorio):
   ```
   STRIPE_SECRET_KEY=sk_test_...
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...   # lo imprime `stripe listen` (ver "Probar el aviso en local")
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```
3. En Administración (o directo en la tabla `price_regions`) escribe los montos en centavos: `monthly_cents`, `yearly_cents` y, si aplica, `student_discount_pct`.
4. Corre el script (se niega a correr si la clave no empieza con `sk_test_`; se puede repetir sin duplicar nada):
   ```
   npx tsx scripts/stripe-setup.ts
   ```
   Guarda `stripe_price_monthly` y `stripe_price_yearly` en cada región con monto, crea los cupones de alumno `alumno-<pct>` y los códigos de promoción de la tabla `coupons`. Si cambias un monto, vuelve a correrlo: crea el precio nuevo y desactiva el viejo (las suscripciones existentes siguen con su precio).
5. Activa el Customer Portal en Stripe (Settings → Billing → Customer portal): permitir cambiar tarjeta, ver facturas, actualizar datos de facturación y cancelar **al final del periodo**.

## Probar el aviso en local
1. Instala la CLI de Stripe y entra: `stripe login`.
2. Reenvía los avisos a la app (deja esta terminal abierta):
   ```
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
   Copia el `whsec_…` que imprime en `STRIPE_WEBHOOK_SECRET` y reinicia `next dev`.
3. En `/suscripcion`, "Pasar a Pro" y paga con la tarjeta de prueba `4242 4242 4242 4242` (cualquier fecha futura y CVC). Al volver verás "lo estamos confirmando" hasta que llegue el aviso y el plan pase a Pro.
4. Otros casos:
   - Pago fallido: tarjeta `4000 0000 0000 0341` (se agrega bien y falla al cobrar) o `stripe trigger invoice.payment_failed`.
   - Cancelar: desde la pantalla ("Cancelar suscripción") o el Portal. Para que termine ya: `stripe subscriptions cancel <sub_id>` → el plan pasa a solo lectura (o vuelve a alumno/fundador si tiene acceso vigente).
   - Reenviar un aviso para comprobar que no duplica nada: `stripe events resend <evt_id>`.

## Producción (fase 2)
Crear un endpoint en Stripe (Developers → Webhooks) apuntando a `https://app.revoluciondeldinero.com/api/stripe/webhook` con los 6 eventos de arriba **y la misma versión de API que fija el SDK instalado** (`2026-11-18.endive` con stripe 23.2.0), y poner sus claves en las variables de entorno de Vercel. El script de configuración no corre con claves de producción: los productos y precios de producción se crean a mano o con un script revisado aparte.
