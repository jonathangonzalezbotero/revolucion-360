

# Revolución 360 — Plan de implementación con Claude Code
2026-11-24 · @Jonathan

## Resumen
La recomendación es construir Revolución 360 en 3 fases: lanzar un MVP para alumnos con plan anual, movimientos, cierre de mes y Academia, y dejar lo demás para después. Claude Code puede escribir casi todo el código, pero solo si el trabajo llega bien definido: reglas de negocio escritas, pantallas de referencia y tareas pequeñas con pruebas.
- Qué es: una app web, usable en celular y computador, para planear y registrar las finanzas personales del año. La ofrece Revolución del Dinero como imán de clientes, suscripción mensual y acceso gratis para alumnos.
- Para quién: latinos en Australia primero, con modo genérico para otros países. Español primero.
- Punto de partida: el mockup de 60 pantallas y el sistema de diseño v2 ya están aprobados. Ese es el contrato visual: no se rediseña durante el desarrollo.
- Lo que este plan no es: no elige librerías ni escribe código. Dice qué hay que decidir, preparar y vigilar para que el desarrollo con Claude Code salga bien a la primera.
Cómo usarlo: lee las secciones 4 y 5 antes de abrir Claude Code. Son las decisiones que, si faltan, Claude Code va a inventar.

## Decisiones tomadas
Estas decisiones ya están cerradas y van tal cual en el CLAUDE.md del proyecto. Cambiar una requiere aprobación de Jonathan.
| 
Área | 
Decisión | 
| 
Nombre | 
Revolución 360 (antes "Mi Revolución"). Endoso: "Una herramienta de Revolución del Dinero". | 
| 
Logo | 
logo-360.png: sello original de RdD + "Revolución" en Newsreader cursiva + "360" amarillo con arco. Versión clara y oscura. Para producción se vectoriza (SVG). | 
| 
Dominio | 
app.revoluciondeldinero.com. El panel de administración va en su propia ruta (/admin), nunca en el menú del usuario. | 
| 
Idioma y tema | 
Español primero, tema claro, escritorio y móvil con el mismo peso. | 
| 
Sistema de diseño | 
v2: tinta #141612, papel #F6F5F0, amarillo RdD #F2CD00. Verde solo para dinero que entra; rojo óxido para lo que falta. Newsreader para títulos y cifras grandes, Geist para la interfaz. Íconos de línea propios. | 
| 
Bloques oscuros | 
Negro a carbón con brillo amarillo, solo en Inicio, Academia, entrar a la app y el aviso de Pro. El resto de resúmenes van tipo libro contable, sin caja. | 
| 
Logros | 
Puntos, niveles y rachas siempre en amarillo, nunca en verde. | 
| 
Modelo de negocio | 
Freemium: Gratis y Pro (mensual y anual). Precios por región configurables. Prueba gratis de Pro configurable (14 días por defecto). | 
| 
Si deja de pagar | 
Sus datos quedan en solo lectura y siempre puede exportarlos. Nunca se borran por no pagar. | 
| 
Alumnos | 
Acceso gratis dado por un admin: de por vida, por meses o hasta una fecha. A usuarios elegidos, a un grupo o con código de invitación. Al vencer pasa a Gratis sin perder datos. | 
| 
Cupones y fundador | 
Cupones con % y duración, creados también en Stripe. Existe el plan "Acceso fundador". | 
| 
Imán de clientes | 
El Diagnóstico es la puerta. Al final, quien no es alumno ve la clase gratuita; el alumno ve el curso de la Academia que ataca su prioridad. Texto, enlace y público se configuran en Admin. | 
| 
Bancos | 
Sin conexión bancaria (se descartó CDR/Basiq). Solo registro manual e importación CSV. La app nunca entra al banco. | 
| 
CSV | 
Asistente en 5 pasos: banco y cuenta, columnas (se adivinan y se guarda el formato por banco), revisión con duplicados y transferencias detectadas, reglas de categoría, resumen con conciliación de saldo. El archivo se borra tras procesarlo. | 
| 
País y moneda | 
Se eligen en el onboarding (Australia y "Otro país" primero). El usuario puede renombrar términos ("super" por "pensión"). Contenido por país se configura en Admin. | 
| 
Menú | 
Todo visible (se rechazó mostrar funciones de a poco). Admin puede poner cada sección en visible, próximamente u oculta, y Gratis o Pro. | 
| 
Plan anual | 
Rejilla de 12 meses editable, centro de la app. Agregar línea con ejemplos y frecuencia semanal, quincenal o mensual (cuenta los viernes de pago reales de cada mes). En móvil: vista por mes, por línea y agregar línea. | 
| 
Movimientos | 
3 niveles: solo mi plan, totales del mes, cada movimiento. A mano y CSV en la misma pantalla, filtros por mes y categoría, recurrentes. | 
| 
Editar movimientos | 
Cada movimiento se edita: monto, fecha, descripción, categoría, cuenta, unión a una línea del plan, regla para los próximos iguales, dividir en dos categorías, nota, eliminar con doble confirmación. | 
| 
Pagado a mano | 
En el detalle del mes, "Pendiente" se toca y pasa a "Pagado · a mano" (mismo dato que el nivel "Solo mi plan"). Si después llega el movimiento, se une a la línea sin contarse dos veces. Lo pagado con un movimiento solo cambia editando el movimiento. | 
| 
Cuentas | 
Bancos, tarjetas, efectivo y empresa con saldo escrito a mano. Aviso si el saldo no cuadra con los movimientos. La cuenta de la empresa no cuenta en el patrimonio. Transferencias entre cuentas no son gasto. | 
| 
Deudas | 
Agregar deuda (incluye Afterpay/Zip y tarjeta revolvente), registrar pago (cuota, abono o total), deuda saldada pregunta si quitar la cuota del plan. | 
| 
Impuestos y empresa | 
Apartado de impuestos para ABN, con aviso de preguntar el % al contador. Cuenta con la empresa (Pty Ltd) como sección avanzada, con aviso de Division 7A. | 
| 
Inversiones | 
Plataformas que define el usuario, nada fijo. Se pueden unir a una línea del plan. Solo seguimiento, sin recomendaciones. | 
| 
Metas | 
Tipo libre, monto y fecha calculan el aporte mensual y semanal. Aportar, usar dinero, historial, marcar cumplida (+50 puntos), agregar al plan. | 
| 
Proyección | 
Se queda en el menú. Usa los datos del usuario y el saldo de sus cuentas, con escenarios "¿qué pasa si…?" y gráfico de línea. El onboarding dice "Metas con fecha" y el inicio de usuario nuevo muestra la tarjeta de Cuentas. | 
| 
Análisis | 
Categorías, mes a mes, ranking de comercios y comercios vigilados (ej. McDonald's, café). | 
| 
Asistente | 
"Arma tu plan" en 7 pasos, con deudas y metas libres y nombres editables. | 
| 
Cierre de mes | 
4 pasos: revisa, compara, ajusta el mes siguiente, saldos. Es el hábito central. | 
| 
Diagnóstico | 
5 indicadores con referencias generales. Siempre con el aviso de que es información general, no asesoría. | 
| 
Academia | 
Solo cursos de uso de la app y de finanzas (no Ruta del Revolucionario por ahora). 9 cursos, portadas 3D negro y amarillo. | 
| 
Puntos y niveles | 
Niveles: Despertar 0, Orden 300, Ahorro 500, Inversión 1,000, Revolucionario 2,000. Puntos: clase +10, curso +50, cierre +30, saldar deuda +50, meta +50 (antes +100; cambio del 25 nov 2026), aporte a meta +5, semana activa +5. Solo premian buen comportamiento financiero. | 
| 
Insignias | 
10 insignias 3D negro y dorado. Bloqueadas en gris con su avance; al ganarla, celebración, color, fecha y notificación. | 
| 
Racha | 
Semanal (lunes a domingo). Cuenta si registra un gasto, marca un pago, ve una clase o cierra el mes. Un comodín al mes. Ícono de llama. | 
| 
Usuario nuevo | 
Lista de 4 primeros pasos con puntos y estados vacíos que explican qué falta. Nunca un gráfico vacío. | 
| 
Notificaciones | 
Centro en la app con filtros. 4 correos: bienvenida, recordatorio de cierre, acceso por vencer (30 y 7 días antes), pago fallido. | 
| 
Ayuda | 
Preguntas frecuentes y casos de soporte. Los datos técnicos adjuntos nunca incluyen montos. | 
| 
Admin | 
Separado del producto. Nunca ve las finanzas de nadie. Usuarios y accesos, gestionar usuario, grupos, menú y funciones, Academia, planes y cupones, países, soporte y privacidad, registro de actividad. | 
| 
Legal | 
Términos y privacidad en lenguaje simple, como borrador para revisar con abogado en Australia. | 
| 
Entorno de desarrollo (25 nov 2026) | 
Sin Docker. La app se prueba en local (`npm run dev`) contra la base de producción (claves en `.env`, fuera de git). Jonathan acepta el riesgo con una condición: la base nunca se resetea ni se borra, ni en pruebas, ni con scripts nuevos, ni en un deploy (CLAUDE.md, regla 0). Barreras: hook `.claude/hooks/proteger-base.sh`, scripts que solo crean, pruebas de permisos solo contra Supabase local, migraciones que solo agregan y se revisan antes de `db:migrate`. Reemplaza la regla anterior "nunca se usan datos de producción en desarrollo". | 
| 
Cupones (25 nov 2026) | 
Cada cupón aplica a mensual, anual o ambos y puede vencer (fin del día elegido, 23:59:59 UTC). El código se escribe solo en la app: la página de pago de Stripe no muestra campo de cupón, porque Stripe no distingue mensual de anual. Los cupones se pausan, nunca se borran. | 
| 
Países (25 nov 2026) | 
Cada país tiene idioma por defecto (se aplica al primer guardado de la bienvenida si el usuario sigue en español) y puede apagar el apartado para impuestos de independientes (se oculta, los datos no se borran). Un país nunca se borra: pasa a borrador. | 
| 
Diagnóstico para alumnos (25 nov 2026) | 
El siguiente paso para alumnos es automático (curso de su prioridad), un curso fijo o nada; se edita en Menú y funciones. La clase gratuita para quien no es alumno se edita en Contenido por país. | 

## Cambios del 25 nov 2026 (plan y diseño actualizados por Jonathan)
Reemplazan lo que digan otras secciones de este documento.
- **Un solo plan, sin plan gratis.** Primer mes $1 USD, después $8 USD al mes; o $80 USD al año pagados de entrada (2 meses gratis). Siempre en USD; Stripe muestra la conversión. Un cambio de precio solo aplica a suscripciones nuevas. Desaparecen los precios por región, la prueba gratis, el muro de Pro y Gratis/Pro por sección o por clase.
- **Cobro técnico:** mensual = suscripción de $8 con 30 días de prueba más un cargo único de $1 en el mismo pago; el aviso "tu primer mes termina en 3 días" sale con el evento `customer.subscription.trial_will_end` de Stripe. La tarjeta se pone dentro de la app (Stripe Embedded Checkout, librerías oficiales `@stripe/stripe-js` y `@stripe/react-stripe-js`).
- **Sin activar:** quien se registra y no paga (estado `free`) puede hacer la bienvenida, el asistente y ver su diagnóstico; para usar el resto de la app ve "Activa tu cuenta". Un código de alumno en esa pantalla da acceso sin tarjeta.
- **Solo lectura:** al cancelar (al final del periodo), si falla el pago y no se arregla, o al vencer un acceso gratis. Ve y exporta todo; no edita. Nada se borra.
- **Academia:** cada curso es visible para todos o solo para un grupo de alumnos.
- **Hábito:** "Hoy puedes gastar $X" en Inicio = lo que queda para gastos no fijos del mes ÷ días que faltan (todo gasto que no es un pago fijo del plan). Repaso semanal el domingo. Notificaciones: máximo una al día, nunca de noche (21:00 a 8:00 hora del usuario), cada persona elige cuáles.
  - **Tipo de gasto por línea** (Jonathan, 25 nov 2026): cada línea de gasto del Plan tiene "Tipo de gasto: Automático / Fijo / Del día a día" (`plan_lines.fixed`: null / true / false, migración 20261125000035). Automático usa la regla de `src/lib/engine/habito.ts` y la pantalla explica cómo la clasifica hoy; lo que elige el usuario gana siempre. Se conserva al copiar el plan al año siguiente.
- **Metas amables:** cada meta unida a una cuenta (las transferencias a esa cuenta cuentan solas como aporte), "Aporte a…" / "Pagado con…" en Movimientos, hitos 25/50/75/100% (+20 puntos), frase de "para qué", retos opcionales, y al cerrar el mes "te sobraron $X, ¿a qué meta va?".
- **Inversiones por activo:** activos con símbolo, tipo y plataforma; operaciones compra, venta y dividendo; cantidad, costo promedio, valor y resultado; precios escritos a mano; compras recurrentes ligadas al plan. Tablas nuevas; las anteriores se conservan.
- **Subroles de admin:** Dueño (todo), Contenido (Academia y países), Soporte (soporte y usuarios). Solo el Dueño invita y asigna rol. 2 pasos obligatorios.
- **CRM** (decisiones del 25 nov 2026): dentro del panel de Revolución 360, solo lo de los mockups `AdminCRM`, `AdminCampanas` y `AdminAuto` (la carpeta vieja `crm-revolucion` está abandonada y no se usa). Una sola app: la de usuarios es exclusiva para ellos; el admin maneja app y CRM. Correo (Resend) y SMS (Twilio). Cada usuario de la app es también un contacto; el CRM guarda contacto, etiquetas, consentimiento y eventos de uso, nunca montos. Marketing solo con consentimiento: casilla desmarcada al registrarse (correo y SMS) y su interruptor en Perfil › Notificaciones; baja en un clic; remitente con razón social y dirección (Spam Act 2003). La cola de envíos la procesa una ruta protegida de la app que Supabase llama cada 10 minutos (pg_cron + pg_net). Solo el Dueño usa el CRM.
  - **Modelo y motor del CRM** (construido el 25 nov 2026, detalle en `docs/CRM.md`, migración 20261125000036 sin aplicar): las 5 etiquetas de sistema salen de la etapa del contacto (`crm_contacts.stage`, calculada del estado de la cuenta; alumno y fundador = Alumno). Todo lo que manda el CRM (campañas y automatizaciones, correo y SMS) es marketing y exige consentimiento por canal; los avisos de la cuenta siguen por `src/lib/email`. Sin razón social, ABN y dirección reales en `app_config.legal` no sale marketing ni se confirma una campaña. El registro no pide teléfono: allí solo va la casilla de correo; la de SMS está en Perfil › Notificaciones y pide el teléfono con código de país. En Perfil, el interruptor existente "Novedades de Revolución del Dinero" pasa a ser el consentimiento de correo del CRM (única fuente de verdad; `prefs.notify.news` deja de usarse). SMS solo de 9:00 a 20:00 en la hora de la persona. Al borrar una cuenta se borra su contacto; su supresión (baja) se conserva. Un lead importado o a mano no tiene consentimiento salvo que se marque con su constancia.
  - **Revisión de seguridad del CRM** (25 nov 2026, antes de aplicar la 036; detalle en `docs/CRM.md` › "Reglas de consentimiento"). Decisiones de Jonathan: (a) los leads de formularios web entran **sin doble confirmación**: la casilla marcada del formulario basta; (b) el teléfono que llega con el consentimiento se toma como **verificado** (lo verifican sus formularios de registro; no hay código por SMS). Reglas que salen de la revisión: un usuario es contacto (y su casilla del registro cuenta) solo cuando **confirma su correo**; una alta solo levanta una baja si la hace la persona (Perfil y preferencias por token para el correo, START para el SMS, registro confirmado) y **nunca** levanta un rebote o una queja; ingreso de leads, importar CSV y el panel nunca levantan una baja; un STOP solo lo levanta START (Perfil y preferencias sí pueden volver a prender un SMS que se apagó desde la web); en el ingreso, el SMS solo se marca para el número que llegó y queda en el contacto, y si el contacto ya tenía **otro** número no se pisa ni se marca SMS (lo cambia la persona en Perfil o el Dueño a mano); cada alta o baja deja una **constancia** solo-inserción (`crm_consent_log`, con el hash del correo o teléfono, que sobrevive al borrado de la cuenta); sin la zona horaria de la persona (ni la suya ni la de su país) no sale un SMS. Los avisos de cobro que la persona debe recibir (pago fallido, fin del primer mes) son correos de la cuenta (`src/lib/email`); una automatización del CRM con esos disparadores es marketing opcional.
- **Integración (25 nov 2026):** cumplir una meta da **+50 puntos** (antes +100; aprobado por Jonathan). Quitar un acceso gratis desde el panel deja la cuenta en **solo lectura** (no sin activar), salvo que tenga una suscripción pagando. Los videos de la Academia exigen **cuenta activa** (solo lectura no los ve; sí ve su avance). Una cuenta sin activar puede abrir también **Mi perfil** (exportar, borrar, idioma, 2 pasos, cerrar sesión) y el servidor rechaza cualquier otra acción suya. Los **cupones** aplican solo al plan ($8 / $80), nunca al $1 del primer mes. El Cierre de mes anota el precio o saldo de hoy de cada activo de Inversiones (tablas nuevas).

## Cambios del 25 nov 2026 (tarde), después de que Jonathan usara la app
- Movimientos: un solo botón grande "+ Gasto" arriba, al lado "Importar CSV" y "Transferencia"; reglas, recurrentes, dividir y unir en "Más opciones" y dentro de cada movimiento. Se quita el selector de tres formas. Se conservan análisis por comercio y transferencias.
- Plan anual: los fijos se marcan pagados aquí, con color. "+ Agregar línea" al final de cada categoría. Una línea cambia entre ingreso y gasto si no tiene movimientos unidos. Metas/Deudas/Inversiones: unir a una existente o crear. Marca "5 pagos" en el mes con un pago extra. Llenar meses pasados es opcional y se explica (el año siempre completo).
  - Hecho (25 nov 2026): "+ Gasto" abre el registro rápido con Sale / Entra; "Importar CSV", "Transferencia" y "Más opciones ▾" (reglas, recurrentes, análisis por comercio) al lado. Filtros: mes, categoría y buscar a la vista; cuenta, estado y año en "Más filtros". `month_totals` y `profiles.mov_level` se conservan sin cambios: nadie escribe ya totales; Cierre los sigue leyendo solo para quien tenía el nivel "totales" (ver `cierre/server.ts`).
- Metas: monto y frecuencia del aporte al crearla (semanal, cada 2 semanas, mensual, una vez) → su línea del plan. Recurrentes pueden unirse a una meta.
  - Hecho (25 nov 2026): el aporte crea o actualiza la línea de la meta del año en curso (nunca duplica) y el ritmo de la meta sale de ahí (manda sobre el ritmo de los aportes pasados; "una vez" no es ritmo). En la línea de una meta, el aporte del formulario manda desde el mes en curso hasta diciembre (como antes el cálculo automático); los meses pasados no se tocan. Sin aporte escrito, la línea solo se renombra (ya no se recalcula sola al cambiar monto o fecha). Recurrente con meta: cada movimiento que genera nace como aporte (`recurring.goal_id`, migración 20261125000040, sin aplicar).
- Asistente: arranca con los datos del plan existente y actualiza sin duplicar.
- Super: fuera del plan y del asistente; solo en Inversiones.
- Categoría "Vehículo" → "Transporte" (categorías sugeridas para cuentas nuevas).
  - Cómo quedó (Plan anual y asistente): una línea de "Ahorro e inversión" se une a un activo con `assets.plan_line_id` (como en Inversiones; `plan_lines.investment_id` apunta a la tabla anterior y no se usa); unirla suma la compra de cada mes en Inversiones desde hoy, y los activos de jubilación no se ofrecen. El asistente guarda en cada respuesta la línea de la que salió (`lineId` dentro de `profiles.wizard`, sin columna nueva) y al guardar actualiza esa línea desde el mes en curso, solo en lo que cambió; nunca borra ni crea deudas o metas por líneas que ya existían. "Vehículo" → "Transporte": migración `…039_transporte.sql`, solo `countries.categories`.
- Recorrido general la primera vez, señalando la pantalla real (Inicio, Plan anual, Movimientos, Deudas y metas, Cierre), con Siguiente/Saltar y para volver a verlo desde Ayuda. La ruta por objetivo se define después.
  - Hecho (`src/components/shell/Tour.tsx`, montado en `AppShell`): resalta el enlace del menú lateral (escritorio) o de la barra inferior / "Más" (móvil); no cambia de pantalla. Cierre en escritorio resalta el aviso "Cierra {mes}" y, si no está, la burbuja va centrada. Salta las paradas de secciones apagadas en `app_config.menu`. Solo cuentas activas que pueden escribir. "Visto" (terminar o saltar) en `profiles.prefs.tour.seen`, sin migración; las cuentas que ya existían también lo ven una vez.

## Conexiones web y la web revoluciondeldinero.com (25 nov 2026)
- Hoy la web (`website/api/*.js` en Vercel) recibe cada formulario en su propio servidor y llama a la API de systeme.io (`api/_lib/systeme.js`): evento (`evento-sept-2026-no-pago` al llenar; `evento-septiembre-2026` + tipo de entrada y quitar `no-pago` al pagar), bootcamp (`bootcamp-nov-2026`), círculo (`acceso-comunidad`, que manda el acceso a Skool) y check-in (`asistencia-evento`, llena solo campos vacíos). Mentoría no usa CRM.
- En Revolución 360 una conexión acepta dos formas: desde el servidor de la página con su clave secreta (lo que usan las páginas actuales, sin Turnstile porque ya filtran spam) o desde el navegador con Turnstile y páginas permitidas. Operaciones: crear/actualizar contacto, poner y quitar etiquetas, campos extra (acompañante) y "solo llenar vacíos".
- Automatizaciones transaccionales: las de una compra o un acceso (entrada, acceso a Skool, confirmación del Bootcamp) salen sin consentimiento de marketing y nunca llevan promociones. Todo lo demás exige consentimiento. Los formularios de la web suman la casilla de marketing desmarcada.
- Cambio directo: cuando 360 esté publicado y sus automatizaciones listas, `api/_lib/systeme.js` se reemplaza por una llamada a 360 con las mismas etiquetas, y la web deja de usar systeme.io. Antes se importan los contactos de systeme.io con etiquetas y bajas.
- Revisar: `circulo-lead.js` pone `acceso-comunidad` antes del pago.
- Revisión de seguridad (25 nov 2026, decisiones de Jonathan): una automatización solo puede ser transaccional con los disparadores "Pagó su primer mes", "Entró con código de alumno", "Llegó por una conexión web", "Confirmó su correo" y "Se le puso una etiqueta" (este es el que usan el acceso a Skool y la entrada del evento), y sus correos solo llevan título, texto, botón, separador y firma. Desde el navegador el consentimiento de correo se acepta sin confirmación, pero `acepta_sms` se ignora: el SMS solo con la clave del servidor. El clic de confirmación por correo levanta solo una baja que pidió la persona (nunca una baja puesta a mano por el Dueño, un rebote, una queja ni un STOP). Detalle en `docs/CRM.md`.
- Retos, revisión de seguridad (25 nov 2026; migración `20261125000037_retos.sql`): el premio y la insignia solo con el intento terminado; un cierre de mes cuenta solo si ese mes ya terminó (cerrar un mes antes de que acabe no cuenta, ni después); el "hoy" de cada persona se acota a ±1 día de la fecha UTC y nunca se marca un día anterior al último marcado; máximo 2 clases al día por reto; el punto del día, máximo 5; "aparecer en la tabla del grupo" se puede apagar siempre (también en solo lectura); las reglas de un reto con gente adentro no cambian; el usuario no lee la tabla completa de retos (creador, código, grupo, automatizaciones).
- Importación desde systeme.io (decisión del 25 nov 2026; el cambio es hoy): el export trae Email, First name, Last name, Country, Phone number (sin `+`), partner's phone, partners name, partner's email, Tag (separadas por coma) y Date Registered `(UTC+10)`; no trae bajas ni consentimiento. Teléfonos a E.164 (+61), país por el prefijo, fecha de registro conservada. Acompañante = campos extra del contacto que lo inscribió (nunca un contacto nuevo ni marketing para él). Etiqueta `newsletter` = consentimiento de correo con constancia "suscrito al newsletter en systeme.io" y su fecha. `Entrada General $10 AUD` → `entrada-general`, `Entrada VIP $20 AUD` → `entrada-vip`. Los demás, sin consentimiento de marketing. Las bajas de systeme.io, si existen, se exportan aparte e importan como bajas.
- Ajustes tras probar la app (aprobados por Jonathan el 25 nov 2026; migración `20261125000041_ajustes.sql`, sin aplicar): en el Plan anual el "+" de agregar línea va en el título de cada categoría (ya no hay fila "+ Agregar línea"). Toda línea de gasto se puede marcar pagada desde su celda del mes (el ✓ aparece al pasar el mouse o enfocar la celda; en el teléfono, al tocarla). La línea "Súper" del asistente se llama "Comida (supermercado)" (el asistente reconoce los dos nombres). Lo que se elige en la bienvenida ya no crea metas: queda en `profiles.prefs.objectives` y Metas lo ofrece como sugerencia hasta crearla o descartarla; el asistente ya no llena "Tus metas" con esos objetivos. Las metas que antes creó "Empezar en blanco" con la clave del objetivo como tipo y sin aportes se archivan. Metas: primero las que tienen ahorro (de mayor a menor), con borde verde; el tipo siempre legible. "Estás dentro" en Metas abre el reto en `/retos?reto=<id>`; salir de un reto solo desde Retos.

## Alcance por fases
Se construye todo lo diseñado, pero en 4 fases: cada una termina con algo usable por personas reales y con un criterio claro para pasar a la siguiente.
Fase 0 · Preparación (sin código de producto)
- CLAUDE.md del proyecto con las decisiones tomadas, el sistema de diseño y las reglas de trabajo (sección 6).
- Reglas de negocio escritas y aprobadas (sección 4), con ejemplos numéricos de tu propio Excel.
- Una ficha por pantalla: qué muestra, qué se puede hacer, de dónde salen los datos y qué pasa cuando está vacía. Se sacan del mockup.
- Cuentas creadas a tu nombre: base de datos en región Sydney, Stripe, dominio, correo transaccional, repositorio.
- Borrador legal enviado al abogado.
- Sale cuando: Claude Code puede leer el repositorio y entender qué construir sin preguntarte nada básico.
Fase 1 · MVP para alumnos (sin cobros)
- Entrar a la app: registro, entrar, recuperar contraseña, verificar correo, 2 pasos.
- Onboarding con país y moneda, asistente "Arma tu plan", estados vacíos y primeros pasos.
- Plan anual (escritorio y móvil), detalle del mes con "Pagado · a mano".
- Movimientos en sus 3 niveles, registro a mano y edición de cada movimiento.
- Cuentas, Metas, Cierre de mes, Inicio y Diagnóstico.
- Academia con el curso "Empieza aquí" y el reproductor de clases.
- Perfil: datos, región y moneda, nombres, seguridad, privacidad (exportar y borrar).
- Admin mínimo: usuarios y accesos gratis, grupos, menú y funciones.
- Correos de bienvenida y recordatorio de cierre.
- Sale cuando: 10 a 20 alumnos usan la app un mes completo, al menos la mitad hace su primer cierre, y no hay ningún incidente de datos.
Fase 2 · Abierta al público y con cobros
- Stripe: Pro mensual y anual, prueba gratis, cupones, acceso fundador, pago fallido, muro de Pro y solo lectura al dejar de pagar.
- Importar CSV completo con reglas y duplicados.
- Deudas completas, apartado de impuestos ABN y cuenta con la empresa.
- Inversiones, Análisis con comercios, Proyección con escenarios.
- Puntos, niveles, insignias, racha con comodín y notificaciones completas.
- Ayuda y soporte; admin restante: Academia, planes y precios, soporte y privacidad, registro de actividad.
- Resto de cursos de la Academia.
- Sale cuando: los pagos cuadran con Stripe durante 2 cierres de mes seguidos y el soporte responde en menos de 24 horas.
Fase 3 · Crecer
- Contenido por país y otros países además de Australia.
- App instalable en el celular y notificaciones push.
- Inglés.
- Decidir si la Ruta del Revolucionario entra a la Academia.

## Arquitectura en bloques
La app y el panel de administración son dos puertas distintas a la misma lógica de negocio; ninguna pantalla habla directo con la base de datos, y el panel nunca ve montos.
- Una sola app web para escritorio y móvil, instalable en el celular más adelante (fase 3). No hay apps nativas en las tiendas por ahora.
- El panel de administración vive en su propia ruta y con su propio control de acceso.
- La lógica de negocio concentra todos los cálculos. Es lo primero que se construye y lo más probado.
- Servicios externos: autenticación con 2 pasos, base de datos en Sydney, Stripe para cobros, un servicio de correo para los 4 correos automáticos y almacenamiento para imágenes. El CSV se procesa y se borra.
- La herramienta exacta de cada bloque es una de las decisiones pendientes de la fase 0.

## Reglas de negocio que hay que escribir antes de programar
Si una regla no está escrita, Claude Code la inventa, y en una app de plata eso significa números que no cuadran. Cada regla de esta lista necesita un documento corto con su definición y 3 ejemplos con números reales (de tu Excel 2026), que luego se vuelven pruebas automáticas.
Dinero, fechas y moneda
- Los montos se guardan en centavos, nunca con decimales sueltos. Se define cómo se redondea y cómo se muestra cada moneda.
- Cada usuario tiene una zona horaria. El mes y la semana (lunes a domingo) se calculan en su hora, no en la del servidor.
- Una sola moneda por usuario en la fase 1. Multimoneda queda para la fase 3.
Plan anual
- Una línea = nombre, grupo, tipo (ingreso o gasto) y un monto por mes.
- Frecuencias: mensual, quincenal y semanal. Quincenal y semanal cuentan los días de pago reales que caen en cada mes, desde una fecha de primer pago que elige el usuario (en el mockup se usó el viernes 2 de enero de 2026 como ejemplo).
- Qué pasa al editar una celda suelta frente a cambiar la frecuencia de toda la línea: hay que decidir cuál gana.
- Estado de cada línea en cada mes: pendiente, pagado con movimiento o pagado a mano. Pago parcial y pago de más también necesitan regla.
Movimientos
- Signo: entra positivo, sale negativo. Las transferencias entre cuentas propias no cuentan ni como ingreso ni como gasto.
- Cómo un movimiento se une a una línea del plan: a mano, por regla, o sugerido por monto y fecha cercanos. Un movimiento unido a una línea pagada a mano la reemplaza sin duplicar.
- Duplicados: misma cuenta, mismo monto, fechas a 2 días o menos y descripción parecida. Se avisa, no se borra solo.
- Dividir un movimiento: las partes deben sumar el total.
- Recurrentes: cuándo se crean solos y cómo se evita duplicarlos si después llegan por CSV.
- Toda edición y eliminación queda en un historial interno, para soporte y para recalcular.
Cuentas y conciliación
- Saldo escrito por el usuario con su fecha. Saldo esperado = último saldo escrito + movimientos posteriores. La diferencia se muestra como "te faltan $X por registrar".
- Tarjetas de crédito en negativo. La cuenta de la empresa queda fuera del patrimonio por defecto.
Cierre de mes
- Qué cierra: el mes queda marcado, sus montos reales quedan como confirmados (el verde del Excel original) y suma 30 puntos una sola vez.
- Si se puede reabrir un mes cerrado, quién y cómo. Recomendado: sí, con aviso, sin devolver puntos.
Metas, deudas, impuestos e inversiones
- Meta: ahorrado = aportes − usos. Aporte necesario = (monto − ahorrado) / meses que faltan; semanal = mensual × 12 / 52.
- Deuda: saldo, tasa y cuota calculan la fecha en que terminas. Afterpay y Zip con su calendario de 4 pagos. Al saldarla: preguntar si quitar la cuota del plan.
- Impuestos ABN: el usuario pone el % que le indica su contador; la app solo calcula cuánto apartar.
- Inversiones: aportado frente a valor actual, escrito a mano. Sin precios en vivo.
Diagnóstico (5 indicadores)
- Te sobra = (ingresos − gastos) / ingresos.
- Ahorro e inversión = aportes a ahorro e inversión / ingresos.
- Cuotas de deudas = cuotas del mes / ingresos.
- Fondo de emergencia = saldo del fondo / gastos básicos del mes. Hay que definir qué categorías son "básicas".
- Dependencia = ingreso más grande / ingresos totales.
- Referencias por país, editables en Admin. Siempre con el aviso de información general.
Proyección
- Saldo inicial = suma de cuentas marcadas "usar en mi proyección". Cada mes futuro suma el neto del plan. Los escenarios apagan líneas sin tocar el plan.
Puntos, racha e insignias
- Una tabla de eventos que dan puntos, cada uno con su límite (por ejemplo, un cierre por mes). Los puntos nunca se ganan dos veces por la misma acción, ni borrando y volviendo a crear.
- Racha: una semana cuenta con al menos una acción válida. El comodín (1 por mes calendario) se usa solo cuando una semana falla. Hay que decidir si se avisa antes de gastarlo.
- Cada insignia con su condición exacta y cómo se mide su avance.
Planes y accesos
- Estados: Gratis, prueba de Pro, Pro, acceso gratis de alumno (con vencimiento), fundador y solo lectura. Para cada uno: qué ve, qué puede editar y a qué estado pasa al vencer.
- Qué función es Gratis y cuál es Pro se lee de la configuración de Admin, nunca queda escrito en el código.
Países
- Por país: moneda, frecuencia de pago sugerida, términos locales (super, ABN, ATO, Afterpay), categorías sugeridas y referencias del diagnóstico. "Otro país" es el modo genérico.

## Seguridad, privacidad y cumplimiento
Pediste que la app sea 100% segura para ofrecerla al público; en la práctica eso significa que la seguridad va en las reglas desde el primer día, no al final. Estas son innegociables y van en el CLAUDE.md.
Datos y acceso
- Cada usuario solo puede leer y escribir sus propios datos, y eso lo impone la base de datos, no solo la pantalla. Hay que probarlo con un usuario intentando leer datos de otro.
- El panel de administración no tiene acceso a montos, movimientos, cuentas ni deudas de nadie. Solo ve nombre, correo, plan, acceso, país y actividad (clases vistas, cierres hechos, puntos).
- Datos guardados en servidores en Sydney, cifrados en tránsito y en reposo.
- Verificación en 2 pasos disponible para todos y obligatoria para administradores. Reiniciarla requiere verificar la identidad.
- Las contraseñas nunca pasan por el código de la app: las maneja el servicio de autenticación.
- Las claves secretas (Stripe, base de datos, correo) nunca van al repositorio ni a una conversación con Claude Code.
Pagos
- Los datos de la tarjeta los maneja Stripe. La app nunca ve ni guarda el número.
- El estado del plan se actualiza con los avisos que manda Stripe, verificados, no con lo que diga el navegador.
Privacidad (Australia)
- Privacy Act 1988 y los Australian Privacy Principles. Para usuarios en Europa, también el RGPD.
- Notifiable Data Breaches: si hay una filtración que afecte a usuarios, se avisa a ellos y a la OAIC. Hay que tener el procedimiento escrito antes de lanzar.
- El usuario puede exportar todos sus datos y borrar su cuenta desde Mi perfil. El borrado se completa en 30 días y solo se guardan las facturas que la ley exige.
- El CSV importado se procesa y se borra; solo quedan los movimientos que el usuario confirma.
- Los datos técnicos que se adjuntan a soporte nunca llevan montos ni movimientos.
- Las notas internas de admin no pueden contener datos financieros ni de salud.
Lo que la app no es
- No es asesoría financiera personal. El diagnóstico, la proyección y los consejos son información general, con el aviso visible, para no entrar en lo que exige una licencia AFSL.
- No es un banco ni mueve dinero.
- Los términos, la privacidad y el texto del aviso los revisa un abogado en Australia antes de abrir al público. No soy abogado.
Registro de actividad
- Toda acción de un administrador queda registrada con quién, qué y cuándo: dar o quitar acceso, reiniciar 2 pasos, suspender, exportar, borrar.

## Cómo trabajar con Claude Code
Claude Code rinde cuando cada tarea es pequeña, tiene una referencia visual y termina con pruebas que pasan. El trabajo tuyo es preparar el terreno y revisar, no escribir código.
Lo que va en el repositorio antes de la primera tarea
- CLAUDE.md en la raíz: qué es la app, para quién, la tabla de decisiones tomadas, las reglas de seguridad de la sección 5 y las reglas de trabajo de esta sección. Corto: Claude Code lo lee en cada sesión.
- Carpeta docs/ con:
- las reglas de negocio de la sección 4, un archivo por tema, con sus ejemplos numéricos;
- una ficha por pantalla (qué muestra, acciones, datos, estado vacío, versión móvil);
- los textos de la app en un solo lugar, en español, para que nadie los invente.
- Carpeta docs/mockup/ con los 60 HTML del lienzo como referencia visual. Te los puedo exportar.
- Los tokens del sistema de diseño (colores, letras, espacios, radios, sombras) en un solo archivo, sacados de la lámina "Sistema de diseño v2". Ningún color suelto en las pantallas.
- Logo en SVG, insignias, portadas de cursos y los íconos como archivos del proyecto.
- Datos de prueba: tu plan 2026 del Excel, con las reclasificaciones que aprobaste (Inner Circle es una deuda; "Family" pasó a la meta Viaje a Colombia, parcialmente gastada; Easy Aussie es una cuenta en ambos sentidos: aportes $8,405, retiros $11,050, neto +$2,645), para probar cada cálculo con números reales.
Cómo se pide cada tarea
- Una tarea = una pantalla o un flujo de punta a punta (datos, lógica, pantalla escritorio y móvil, pruebas). Nunca "haz todo el módulo de deudas" de una vez.
- Empieza siempre en modo plan: Claude Code propone cómo lo hará, tú lo apruebas, y solo después escribe código. Esto respeta tu regla de no actuar sin aprobación.
- Plantilla de pedido: qué pantalla (enlace a su ficha y a su HTML de referencia), qué reglas aplica (enlace a docs), qué queda fuera, y cómo sé que está lista.
- Una rama y un pull request por tarea. Nada entra a la rama principal sin revisión.
- Una conversación por tarea: al terminar se limpia el contexto para que no arrastre decisiones viejas.
Revisión
- Primero las pruebas automáticas, después un agente de revisión de código (puedes usar tu subagente de revisión), y al final tú en el navegador comparando con el mockup.
- Cambios en la base de datos (tablas, permisos) los revisa siempre una persona antes de aplicarlos.
- Cualquier cosa que toque dinero, permisos o pagos lleva pruebas que lo demuestren; sin pruebas no se aprueba.
Límites para Claude Code
- Nunca usa claves de producción ni se conecta a la base de datos de producción. Trabaja en local y en un entorno de pruebas.
- No agrega librerías nuevas sin justificar por qué.
- No cambia el diseño: si algo del mockup no se puede hacer, lo pregunta.
- No cambia una decisión de la tabla. Si cree que hay que cambiarla, lo dice y espera.
Cuando algo cambie
- Si durante el desarrollo se decide algo nuevo, se agrega en el mismo pull request a la tabla de decisiones, a la ficha de la pantalla y, si es visual, a la lámina del sistema de diseño.

## Calidad: pruebas, accesibilidad y rendimiento
La regla es simple: si un cálculo de dinero no tiene prueba, no existe. Las pruebas son también lo que impide que Claude Code rompa algo viejo al hacer algo nuevo.
Pruebas de cálculos (las más importantes)
- Cada regla de la sección 4 tiene pruebas con los ejemplos de su documento: frecuencias semanal y quincenal, conciliación, metas, fecha de fin de una deuda, los 5 indicadores, proyección, puntos y racha.
- Una prueba con tu año 2026 completo: los totales deben dar lo que ya validamos (ingresos $95,346; gastos $85,637; te sobra $9,709 en el año).
- Casos límite: meses con 5 semanas de pago, año bisiesto, cambio de horario de verano, montos negativos, centavos, una meta sin fecha.
Pruebas de permisos
- Un usuario no puede ver ni cambiar datos de otro.
- Admin no puede ver montos.
- Un usuario en solo lectura no puede editar; uno con acceso vencido pasa a Gratis sin perder nada.
Pruebas de flujos completos (en el navegador)
- Registrarse, armar el plan con el asistente, registrar un gasto, editarlo, marcar una línea como pagada, hacer el cierre de mes.
- Importar un CSV real de Ubank y de NAB, con duplicados.
- Pagar Pro, que falle un pago, cancelar y quedar en solo lectura.
- Exportar los datos y borrar la cuenta.
Accesibilidad
- Todo se puede usar con teclado; los botones tienen nombre para lectores de pantalla (el mockup ya los trae).
- Contraste suficiente: cuidado con el amarillo sobre blanco, que solo se usa como fondo o borde, nunca como texto pequeño.
- Botones de al menos 44 px de alto en móvil.
- Las animaciones se apagan si el teléfono tiene "reducir movimiento".
Rendimiento
- El Inicio debe cargar en menos de 2 segundos en un celular con 4G.
- La rejilla del Plan anual (12 meses por unas 40 líneas) debe sentirse instantánea al editar.
- Las imágenes (portadas, insignias) se sirven en el tamaño justo.
Revisión visual
- Cada pantalla terminada se compara con su HTML del mockup, en escritorio y móvil, antes de aprobar el pull request.

## Operación y lanzamiento
Antes de que entre el primer alumno tiene que existir todo lo que te avisa cuando algo falla y lo que te permite recuperar datos. Sin eso, no se abre.
Entornos
- Local (donde trabaja Claude Code), pruebas (igual a producción, con datos falsos) y producción.
- Cada pull request aprobado se despliega solo a pruebas; a producción solo cuando tú lo apruebas.
- Stripe en modo prueba hasta la fase 2.
Respaldo y recuperación
- Copias automáticas diarias de la base de datos, guardadas al menos 30 días.
- Probar una restauración completa antes de lanzar, no después del primer problema.
Monitoreo
- Aviso inmediato si la app se cae, si sube la tasa de errores o si falla un pago.
- Los errores se registran sin montos ni datos personales.
Medición del producto
- El camino del usuario del panel de Admin: se registró → terminó el asistente → volvió la semana siguiente → primer cierre de mes → pasó a Pro.
- Se mide si el sistema de puntos ayuda o molesta: cierres hechos y rachas de quienes ganan insignias frente a quienes no.
- Se mide si la gente usa Proyección, para cerrar esa duda con datos.
Beta con alumnos (fase 1)
- 10 a 20 alumnos de un mismo grupo, con acceso gratis por 3 meses.
- Un canal directo para que te reporten cosas (puede ser el mismo soporte de la app).
- Una llamada corta con 5 de ellos después de su primer cierre de mes.
Soporte
- Respuesta en menos de 24 horas hábiles, en español.
- Respuestas guardadas para las preguntas frecuentes, que alimentan la página de Ayuda.
Contenido que tú debes producir
- Video de bienvenida de 60 segundos y foto tuya para la pantalla de entrar y el inicio de usuario nuevo.
- Tu frase para la pantalla de entrar.
- Las clases de los cursos 01 a 09 (el curso "Empieza aquí" es el único necesario para la fase 1).
- Revisar los textos de la app para que suenen a ti.
- La clase gratuita y su enlace para el bloque del Diagnóstico.

## Riesgos y decisiones pendientes
Hay 13 decisiones abiertas; las primeras 7 bloquean la fase 1 y se deben cerrar en la fase 0.
| 
Decisión pendiente | 
Por qué importa | 
Se necesita para | 
| 
Herramientas técnicas finales (propuesta anterior: Next.js, Supabase en Sydney, Stripe) | 
Todo lo demás se apoya en esto | 
Fase 0 | 
| 
Qué categorías son "gastos básicos" | 
Define el indicador de fondo de emergencia y la insignia "Colchón de 1 mes" | 
Fase 0 | 
| 
Si gana la celda editada o la frecuencia de la línea en el Plan anual | 
Evita que se borren ediciones del usuario | 
Fase 0 | 
| 
Si un mes cerrado se puede reabrir | 
Afecta el cierre, los puntos y la conciliación | 
Fase 0 | 
| 
Cómo se sugiere unir un movimiento a una línea del plan (margen de monto y de días) | 
Define cuándo una línea pasa a "Pagado" sola | 
Fase 0 | 
| 
Razón social y ABN que ofrecen la app | 
Va en términos, privacidad, facturas y Stripe | 
Fase 0 | 
| 
Ícono cuadrado de la app (favicon y celular) | 
Hoy solo está el logo horizontal | 
Fase 0 | 
| 
Si se avisa antes de gastar el comodín de racha | 
Cambia cómo se siente la racha | 
Fase 2 | 
| 
Precio de Pro por región y descuento para alumnos | 
Hoy dice [PRECIO] y [X]% en la app y los correos | 
Fase 2 | 
| 
Registrar "Revolución 360" como marca en IP Australia | 
Proteger el nombre antes de invertir en él | 
Antes de abrir al público | 
| 
Logo en vector con la fuente real | 
La imagen de Higgsfield imita la letra; para impresión y tiendas se necesita exacto | 
Antes de abrir al público | 
| 
Si la Proyección se queda tal cual, se simplifica o se reparte | 
Decidir con los datos de uso de la beta | 
Fase 2 | 
| 
Si la Ruta del Revolucionario entra a la Academia | 
Cambia el alcance de la Academia | 
Fase 3 | 
Riesgos principales
- Números que no cuadran. Es lo que más rápido mata la confianza en una app de plata. Mitigación: reglas escritas con ejemplos y pruebas con tu año real (secciones 4 y 7).
- Una filtración de datos. Mitigación: permisos en la base de datos, pruebas de permisos, 2 pasos, admin sin acceso a montos (sección 5).
- Que se lea como asesoría financiera. Mitigación: aviso visible, textos revisados por abogado, nada de recomendaciones de inversión.
- Claude Code inventando o cambiando decisiones. Mitigación: CLAUDE.md, fichas por pantalla, modo plan y revisión de cada pull request.
- El alcance. Son 60 pantallas. Mitigación: las fases y no empezar la siguiente sin cumplir el criterio de salida.
- Los bancos cambian el formato del CSV. Mitigación: formatos guardados por banco y una alerta cuando una importación no reconoce las columnas.
- Los puntos se sienten infantiles para alguien con deudas. Mitigación: medirlo en la beta y poder apagarlos desde Admin.
- El contenido no está listo. Las clases, el video y la foto dependen de ti. Mitigación: la fase 1 solo necesita el curso "Empieza aquí".
- Todo pasa por tu revisión. Si tú eres el único que aprueba, tú eres el cuello de botella. Mitigación: reservar bloques fijos a la semana para revisar pull requests.

## Hoja de ruta y checklist para empezar
El primer paso es la fase 0 completa; el primer código que se escribe son los cálculos del Plan anual con sus pruebas, no una pantalla.
Checklist de la fase 0
- Cerrar las 7 decisiones que bloquean la fase 1 (sección de riesgos).
- Escribir las reglas de negocio con 3 ejemplos cada una, usando tu Excel 2026.
- Escribir la ficha de cada pantalla de la fase 1.
- Exportar del lienzo los 60 HTML, los tokens de diseño, el logo, las insignias y las portadas.
- Crear el repositorio con CLAUDE.md, docs/ y docs/mockup/.
- Crear las cuentas: base de datos en Sydney, Stripe (modo prueba), dominio, correo transaccional, monitoreo.
- Preparar los datos de prueba con tu plan 2026.
- Mandar términos y privacidad al abogado.
- Grabar el video de bienvenida y tomarte la foto.
Orden de construcción de la fase 1 (cada paso depende de los anteriores)
- Base del proyecto: estructura, tokens de diseño, menú lateral y barra móvil, entornos local y de pruebas.
- Entrar a la app: registro, entrar, recuperar, verificar correo, 2 pasos. Pruebas de permisos desde aquí.
- Motor de cálculo del plan: líneas, frecuencias, totales por mes. Solo lógica y pruebas, contra tu año 2026.
- Onboarding y asistente "Arma tu plan".
- Plan anual en escritorio y móvil, con agregar línea.
- Cuentas y movimientos a mano (3 niveles), con edición.
- Detalle del mes con "Pagado · a mano" y la unión movimiento ↔ línea.
- Metas.
- Cierre de mes.
- Inicio, con su gráfico del año, y Diagnóstico.
- Usuario nuevo: primeros pasos y estados vacíos.
- Academia: curso "Empieza aquí" y reproductor de clases.
- Perfil: datos, región y moneda, nombres, seguridad, exportar y borrar.
- Admin mínimo: usuarios, accesos gratis, grupos, menú y funciones, registro de actividad.
- Correos de bienvenida y recordatorio de cierre.
- Respaldos, monitoreo, prueba de restauración y revisión de seguridad.
- Beta con 10 a 20 alumnos.
Después
- La fase 2 sigue el mismo método, empezando por Stripe y el muro de Pro, porque de eso depende abrir al público.