-- Ajustes del 25 nov 2026 (aprobados por Jonathan el 25 nov 2026, después de probar la app).
-- Solo actualiza filas con un WHERE acotado: no borra nada (CLAUDE.md, regla 0). Sin aplicar: la revisa una persona antes de `npm run db:migrate`.

-- (a) "Lo básico" del asistente: la línea "Súper" pasa a llamarse "Comida (supermercado)".
--     El asistente solo escribió ese nombre en español ("Súper", con tilde; en inglés siempre fue "Groceries").
--     El asistente sigue reconociendo el nombre anterior (LEGACY_BASIC_NAMES en src/app/(onboarding)/asistente/lib.ts).
update public.plan_lines
   set name = 'Comida (supermercado)'
 where name = 'Súper';

-- (b) Los objetivos de la bienvenida ya no se vuelven metas (quedan en profiles.prefs.objectives y Metas los ofrece como sugerencia).
--     Antes, "Empezar en blanco" (startBlank, src/app/(onboarding)/bienvenida/actions.ts) los creaba como metas con
--     kind = la clave del objetivo, exacta y en minúsculas: 'debts','trip','emergency','clarity','invest','business'.
--     Se archivan (nunca se borran) solo esas, y solo si siguen sin aportes. La comparación es exacta a propósito:
--     'Trip' (con mayúscula) es la etiqueta en inglés de una meta creada a mano y no se toca.
update public.goals g
   set archived_at = now()
 where g.archived_at is null
   and g.kind in ('debts', 'trip', 'emergency', 'clarity', 'invest', 'business')
   and not exists (select 1 from public.goal_entries e where e.goal_id = g.id);
