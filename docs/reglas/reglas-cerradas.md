# Reglas de negocio cerradas (24 nov 2026)

Cada regla tiene su prueba en `tests/engine.test.ts`.

| Regla | Decisión | Ejemplo |
|---|---|---|
| Celda editada vs. frecuencia | **La celda editada a mano gana.** Al cambiar frecuencia o monto de la línea solo se recalculan las celdas no manuales; la pantalla avisa y ofrece "aplicar a todos los meses". | Sueldo mensual $5,418; febrero editado a $10,200; al pasar a semanal, febrero sigue en $10,200. |
| Frecuencia semanal y quincenal | Cuenta los días de pago reales de cada mes desde la fecha del primer pago. | Primer pago viernes 2 ene 2026: enero tiene 5 viernes, febrero 4; el año suma 52 (26 quincenal). |
| Reabrir un mes cerrado | **Sí, con aviso y sin devolver puntos.** Los 30 puntos del cierre se dan una sola vez por mes. | Reabres octubre, lo corriges y lo cierras de nuevo: 0 puntos nuevos. |
| Unir un movimiento a una línea | Se **sugiere** si va en el mismo sentido, el monto difiere 5% o menos del plan del mes (o el nombre coincide) y la fecha cae en el mes o a 5 días. **El usuario confirma.** | "RENT PAYMENT" −$1,330 el 3 nov → sugiere "Home" ($1,330). |
| Pagado a mano + movimiento | El movimiento unido reemplaza la marca a mano: nunca se cuenta dos veces. | Marcas Felix Mobile ($40) y luego llega el movimiento de $40: pagado $40, no $80. |
| Pago parcial y de más | Parcial si lo pagado es menor al plan (tolerancia 0.5% o $1); de más si lo supera. | Home $1,330, pagado $670 → "Pago parcial", faltan $660. |
| Duplicados | Misma cuenta, mismo monto, fechas a 2 días o menos y descripción parecida. Se avisa, no se borra solo. | |
| Gastos básicos | Las categorías marcadas `is_basic`. Por defecto solo **Hogar y básicos**; el usuario puede marcar otras. | Fondo $1,200 / básicos $2,023 = 0.59 meses. |
| Saldo esperado | Último saldo escrito + movimientos posteriores a esa fecha. | $5,000 el 1 nov −$1,330 +$5,418 = $9,088. |
| Meta | Ahorrado = aportes − usos. Mensual = lo que falta / meses que faltan (mínimo 1). Semanal = mensual × 12 / 52. | |
| Estados del plan | prueba vencida → Gratis · alumno vencido → Gratis (sin perder datos) · Pro sin pagar → solo lectura. | |
| Puntos | clase +10, curso +50, cierre +30, saldar deuda +50, meta cumplida +100, aporte a meta +5 (1 por día), semana activa +5. Los valores se editan en Admin. | El plan decía "+50" para la meta en un lugar y "+100" en otro: quedó +100, editable. |
| Comodín de racha | 1 por mes calendario. **Se avisa antes de gastarlo**: el usuario decide usarlo cuando una semana falló. | |
