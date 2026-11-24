-- Revolución 360 · Mi perfil, Ayuda y Legal
-- Solo contenido inicial: las preguntas frecuentes de Ayuda (las edita el admin después).
-- `faqs` ya tiene RLS (lee todo usuario, escribe admin) en 20261124000002_security.sql. No hay tablas nuevas.
-- No hay clave única en faqs: se inserta solo si la tabla está vacía, para no duplicar.

insert into public.faqs (topic, question, answer, locale, sort, published)
select v.topic, v.question, v.answer, v.locale, v.sort, true
from (values
  ('empezar', '¿Necesito conectar mi banco?', 'No. Escribes tus movimientos o importas el archivo CSV que descargas de tu banco. Nadie entra a tus cuentas.', 'es', 1),
  ('empezar', '¿Qué hago primero?', 'Arma tu plan con el asistente (10 minutos). Con eso ya ves tu año completo. Lo demás lo vas sumando.', 'es', 2),
  ('plan', '¿Cómo agrego un gasto que no es mensual?', 'En el Plan anual toca "+ Agregar línea" y elige la frecuencia: semanal, quincenal o mensual. La app calcula cuánto cae en cada mes.', 'es', 3),
  ('plan', '¿Qué significa el verde en una celda?', 'Que ese monto ya está confirmado en el cierre de mes. Lo que no está en verde es plan.', 'es', 4),
  ('movimientos', 'Importé el CSV y salieron duplicados', 'La app los detecta y los deja fuera. Si se coló alguno, bórralo desde Movimientos con el menú de la fila.', 'es', 5),
  ('movimientos', '¿El pago de la tarjeta cuenta como gasto?', 'No. Es dinero que pasa entre tus cuentas. El gasto ya se contó cuando compraste con la tarjeta.', 'es', 6),
  ('cuenta', '¿Qué pasa si dejo de pagar Pro?', 'No pierdes nada. Tus datos quedan guardados y puedes exportarlos siempre. Solo las funciones Pro quedan en modo lectura.', 'es', 7),
  ('cuenta', '¿Cómo cambio mi moneda o país?', 'En Mi perfil › Región y moneda. Los montos que ya registraste no se convierten.', 'es', 8),
  ('seguridad', 'Perdí mi celular y no puedo entrar', 'Usa uno de tus códigos de respaldo. Si no los tienes, escríbenos y verificamos tu identidad antes de reiniciar los 2 pasos.', 'es', 9),
  ('empezar', 'Do I need to connect my bank?', 'No. You type your transactions or import the CSV file you download from your bank. Nobody logs into your accounts.', 'en', 1),
  ('empezar', 'What do I do first?', 'Build your plan with the assistant (10 minutes). That alone shows your whole year. You add the rest over time.', 'en', 2),
  ('plan', 'How do I add an expense that isn''t monthly?', 'In the Yearly plan tap "+ Add line" and pick the frequency: weekly, fortnightly or monthly. The app works out how much falls in each month.', 'en', 3),
  ('plan', 'What does green in a cell mean?', 'That the amount is already confirmed in the month close. Anything not green is still plan.', 'en', 4),
  ('movimientos', 'I imported the CSV and got duplicates', 'The app detects them and leaves them out. If one slipped through, delete it from Transactions with the row menu.', 'en', 5),
  ('movimientos', 'Does paying my credit card count as an expense?', 'No. It''s money moving between your accounts. The expense was already counted when you bought with the card.', 'en', 6),
  ('cuenta', 'What happens if I stop paying for Pro?', 'You lose nothing. Your data stays saved and you can always export it. Only the Pro features go read-only.', 'en', 7),
  ('cuenta', 'How do I change my currency or country?', 'In My profile › Region and currency. Amounts you already entered are not converted.', 'en', 8),
  ('seguridad', 'I lost my phone and can''t sign in', 'Use one of your backup codes. If you don''t have them, write to us and we''ll verify your identity before resetting 2-step verification.', 'en', 9)
) as v(topic, question, answer, locale, sort)
where not exists (select 1 from public.faqs);
