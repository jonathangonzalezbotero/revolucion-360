# Pregunta de Ayuda: cobro en USD y comisión del banco

Las preguntas de Ayuda viven en la base (`public.faqs`), no en el código. Este texto queda listo para que Jonathan
(o un admin de Soporte) lo cargue desde **Panel › Soporte y privacidad › Preguntas frecuentes**. Nadie lo escribió en la base.

Es una **fila nueva**, según la semilla de `20261124000016_perfil.sql` (no trae "¿Cuánto cuesta?"). No se consultó la tabla en vivo: si alguien ya la agregó desde el panel, solo reemplaza la respuesta. Copiada del mockup
`docs/mockup/Ayuda.dc.html` (lista `F`, tema "Cuenta y pagos").

| Campo | Español (`es`) | Inglés (`en`) |
|---|---|---|
| topic | `cuenta` (se muestra "Cuenta y pagos") | `cuenta` ("Account and billing") |
| sort | 7 (empata con "¿Qué pasa si dejo de pagar…?", que también es 7; el empate se ordena por pregunta y "¿Cuánto…" queda antes) | 7 |
| published | sí | sí |
| question | ¿Cuánto cuesta? | How much does it cost? |
| answer | Tu primer mes cuesta $1 USD. Después son $8 USD al mes, o $80 USD al año (2 meses gratis). Cobramos siempre en dólares americanos y tu banco hace la conversión; algunos bancos cobran una pequeña comisión por moneda extranjera. Te avisamos 3 días antes del primer cobro de $8. | Your first month costs $1 USD. After that it's $8 USD a month, or $80 USD a year (2 months free). We always charge in US dollars and your bank does the conversion; some banks charge a small foreign currency fee. We'll let you know 3 days before the first $8 charge. |

Antes de publicarla: confirma que $1 / $8 / $80 y los "3 días" coinciden con lo que hoy tiene **Planes y precios**
(`app_config.billing`). La respuesta es texto fijo: si cambian los precios, hay que editarla a mano.

Aparte (no se tocó): en la base sigue "¿Qué pasa si dejo de pagar Pro?", que habla de "Pro" (ya no existe, CLAUDE.md
regla 6). El mockup la tiene como "¿Qué pasa si dejo de pagar?" con: "No pierdes nada. Tu cuenta queda en solo lectura:
ves todo y puedes exportarlo siempre. Para volver a registrar, reactivas tu suscripción."
