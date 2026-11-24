-- Revolución 360 · configuración inicial (todo editable desde /admin)

insert into public.app_config (key, value) values
  ('admin_mfa_required', 'true'),
  ('gamification_enabled', 'true'),
  -- Secciones del menú: on (visible) | soon (próximamente) | off (oculta)
  ('menu', '{"plan":"on","movimientos":"on","cuentas":"on","metas":"on","proyeccion":"on","analisis":"on","deudas":"on","inversiones":"on","academia":"on","cierre":"on"}'),
  -- Qué función es Gratis y cuál es Pro. Nunca se escribe en el código.
  ('features', '{"plan":"free","diag":"free","metas":"free","proy":"free","mov":"pro","ana":"pro","inv":"pro","cierre":"pro","acad":"free","deudas":"free","csv":"pro","escenarios":"pro","recurrentes":"pro"}'),
  ('flags', '{"csv":true,"comercios":true,"remesas":true,"multimoneda":false}'),
  ('limits', '{"free_goals":2}'),
  ('points', '{"lesson":10,"course":50,"closure":30,"debt_paid":50,"goal_done":100,"goal_contrib":5,"week_active":5,"first_step":10}'),
  ('levels', '[{"name":"Despertar","min":0},{"name":"Orden","min":300},{"name":"Ahorro","min":500},{"name":"Inversión","min":1000},{"name":"Revolucionario","min":2000}]'),
  ('trial', '{"enabled":true,"days":14}'),
  ('matching', '{"amount_pct":5,"days":5,"duplicate_days":2}'),
  ('diag_cta', '{"lead":{"title":"Mira la clase gratuita","text":"En una hora te muestro el método para ordenar tu plata y salir de deudas.","url":"https://revoluciondeldinero.com/clase","button":"Ver la clase gratuita"},"student":{"title":"Tu siguiente curso","text":"El curso de la Academia que ataca tu prioridad.","button":"Ir al curso"}}'),
  ('legal', '{"company":"[RAZÓN SOCIAL]","abn":"[ABN]","contact":"[CORREO DE CONTACTO]","updated":"[FECHA]"}')
on conflict (key) do nothing;

insert into public.countries (code, name, currency, locale_number, timezone, pay_frequency, terms, categories, benchmarks, enabled, sort) values
  ('AU', 'Australia', 'AUD', 'en-AU', 'Australia/Sydney', 'weekly',
   '{"retirement":"Super","freelance":"ABN","bnpl":"Afterpay / Zip","tax_office":"ATO","company":"Pty Ltd"}',
   '[{"name":"Ingresos","kind":"income","color":"#141612"},{"name":"Hogar y básicos","kind":"expense","color":"#141612","is_basic":true},{"name":"Vehículo","kind":"expense","color":"#6FA898"},{"name":"Comida y ocio","kind":"expense","color":"#A8D3C3"},{"name":"Familia y remesas","kind":"expense","color":"#8E7CB8"},{"name":"Estilo de vida","kind":"expense","color":"#3E8C7A"},{"name":"Deudas","kind":"debt","color":"#C46A2A"},{"name":"Ahorro e inversión","kind":"saving","color":"#4C7FB5"},{"name":"Metas","kind":"goal","color":"#E3B800"}]',
   '{"surplus":{"good":0.10,"warn":0.0},"saving":{"good":0.15,"warn":0.05},"debt":{"good":0.15,"warn":0.30},"emergency":{"good":3,"warn":1},"dependency":{"good":0.70,"warn":0.90}}',
   true, 0),
  ('OTHER', 'Otro país', 'USD', 'en-US', 'UTC', 'monthly',
   '{"retirement":"Jubilación","freelance":"Trabajo independiente","bnpl":"Compra ahora, paga después","tax_office":"Oficina de impuestos","company":"Empresa"}',
   '[{"name":"Ingresos","kind":"income","color":"#141612"},{"name":"Hogar y básicos","kind":"expense","color":"#141612","is_basic":true},{"name":"Vehículo","kind":"expense","color":"#6FA898"},{"name":"Comida y ocio","kind":"expense","color":"#A8D3C3"},{"name":"Familia y remesas","kind":"expense","color":"#8E7CB8"},{"name":"Estilo de vida","kind":"expense","color":"#3E8C7A"},{"name":"Deudas","kind":"debt","color":"#C46A2A"},{"name":"Ahorro e inversión","kind":"saving","color":"#4C7FB5"},{"name":"Metas","kind":"goal","color":"#E3B800"}]',
   '{"surplus":{"good":0.10,"warn":0.0},"saving":{"good":0.15,"warn":0.05},"debt":{"good":0.15,"warn":0.30},"emergency":{"good":3,"warn":1},"dependency":{"good":0.70,"warn":0.90}}',
   true, 99)
on conflict (code) do nothing;

insert into public.price_regions (region, currency) values
  ('AU', 'AUD'), ('DEFAULT', 'USD'), ('CO', 'COP'), ('MX', 'MXN'), ('EU', 'EUR')
on conflict (region) do nothing;

-- Academia: 9 cursos. Solo "Empieza aquí" nace publicado.
insert into public.courses (slug, stage, number, title, description, cover_url, status, tier, priority, sort) values
  ('empieza-aqui', 'Domina la app', 1, 'Empieza aquí', 'Lo mínimo para tener tu plan andando en una tarde.', '/cursos/curso-01.jpg', 'published', 'free', null, 1),
  ('plan-anual-a-fondo', 'Domina la app', 2, 'Tu Plan anual a fondo', '', '/cursos/curso-02.jpg', 'draft', 'free', null, 2),
  ('movimientos-y-cierre', 'Domina la app', 3, 'Movimientos y cierre de mes', '', '/cursos/curso-03.jpg', 'draft', 'free', null, 3),
  ('deudas-impuestos-inversiones', 'Domina la app', 4, 'Deudas, impuestos e inversiones', '', '/cursos/curso-04.jpg', 'draft', 'free', null, 4),
  ('proyeccion-y-analisis', 'Domina la app', 5, 'Proyección y análisis', '', '/cursos/curso-05.jpg', 'draft', 'free', null, 5),
  ('planea-tu-ano', 'Tu dinero', 6, 'Planea tu año financiero', '', '/cursos/curso-06.jpg', 'draft', 'pro', 'surplus', 6),
  ('sal-de-deudas', 'Tu dinero', 7, 'Sal de deudas con método', '', '/cursos/curso-07.jpg', 'draft', 'pro', 'debt', 7),
  ('ahorro-y-fondo', 'Tu dinero', 8, 'Ahorro y fondo de emergencia', '', '/cursos/curso-08.jpg', 'draft', 'pro', 'emergency', 8),
  ('primeras-inversiones', 'Tu dinero', 9, 'Tus primeras inversiones', '', '/cursos/curso-09.jpg', 'draft', 'pro', 'saving', 9)
on conflict (slug) do nothing;

with c as (select id from public.courses where slug = 'empieza-aqui'),
     m as (insert into public.course_modules (course_id, title, sort) select id, 'Arranca', 1 from c returning id, course_id)
insert into public.lessons (course_id, module_id, title, description, points, cta_screen, required, sort)
select m.course_id, m.id, l.title, l.description, 10, l.cta, l.sort <= 4, l.sort from m,
  (values
    ('Bienvenida a Revolución 360', 'Qué es la app y cómo sacarle provecho desde el primer día.', null, 1),
    ('Arma tu plan con el asistente', 'En 7 pasos dejas listo tu año: ingresos, básicos, deudas y metas.', '/asistente', 2),
    ('Entiende tu Plan anual', 'Cómo leer la rejilla de 12 meses y cambiar un monto.', '/plan', 3),
    ('Haz tu primer cierre de mes', 'En 5 minutos al mes revisas qué pasó, ajustas el mes siguiente y anotas tus saldos.', '/cierre', 4),
    ('Registra tus gastos a tu manera', 'Solo tu plan, totales del mes o cada movimiento: elige tu nivel.', '/movimientos', 5),
    ('Lee tu Proyección', 'Cómo se ve tu plata en los próximos meses si sigues tu plan.', '/proyeccion', 6)
  ) as l(title, description, cta, sort);
