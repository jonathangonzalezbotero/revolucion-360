-- Categoría sugerida "Vehículo" → "Transporte" (decisión de Jonathan, 25 nov 2026).
-- Solo cambia la lista de categorías SUGERIDAS de cada país (`countries.categories`), que se copia a una cuenta nueva
-- en el onboarding (`createDefaultCategories`). NO toca las categorías ya creadas de los usuarios (`public.categories`).
-- Conserva todo lo demás de cada elemento (tipo, color, is_basic) y el orden (la posición en la lista es el `sort`).
-- Correrla dos veces no cambia nada: la segunda vez ya no hay "Vehículo".
update public.countries c
set categories = (
  select jsonb_agg(
           case when e.item ->> 'name' = 'Vehículo' then jsonb_set(e.item, '{name}', '"Transporte"') else e.item end
           order by e.ord
         )
  from jsonb_array_elements(c.categories) with ordinality as e(item, ord)
)
where c.code in ('AU', 'OTHER')
  and jsonb_typeof(c.categories) = 'array'
  and c.categories @> '[{"name": "Vehículo"}]'::jsonb;
