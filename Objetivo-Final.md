# Objetivo final del producto

Documento vivo: acá se baja la idea a tierra, se fija qué se espera de cada sección y qué falta decidir. Cuando haya consenso, las respuestas se anotan (o se mueven a un `Roadmap.md` / issues concretos).

**Visión en una línea:** un mismo ecosistema (web + bot Telegram) con **cuatro áreas**: **Bóveda**, **Hábitos**, **Agenda** y **Finanzas**, pensado para uso personal (al menos en una primera etapa), con el **bot como atajo rápido** y la **PC/navegador como lugar de configuración y vistas densas**.

IMPORTANTE: se viaja de una sección a otra, con un botón arriba a la derecha. Cada vez que lo apretas, el título cambia de Bóveda a Hábitos y así con los 4. 

---

## 1. Cómo encajan las cuatro piezas

| Módulo    | Rol principal                         | Bot (v1 ideal)                                      | Web / PC (v1 ideal)                                      |
|-----------|----------------------------------------|-----------------------------------------------------|----------------------------------------------------------|
| Bóveda    | Captura de conocimiento                | Texto, links, fotos rápidas                         | Grafo, categorías, apuntes largos, revisión              |
| Hábitos   | Cumplimiento recurrente                | Marcar hecho, recordatorios                         | Grilla mensual, comparativas, alta/edición de hábitos   |
| Agenda    | Tiempo y repeticiones                  | Crear evento simple, “qué tengo hoy”                | Vistas día/semana/mes, calendarios, reglas de repetición |
| Finanzas  | Flujo + patrimonio + proyección        | Carga ultrarrápida de movimiento (si aplica)        | Dashboards, auditoría, import desde Sheet               |

**Aclaración importante:** “todo manejado desde el mismo bot” puede significar (a) *navegación por menú* del bot a los cuatro mundos, (b) *CRUD completo* solo por bot, o (c) *notificaciones y acciones rápidas* por bot y *el resto* en web. Conviene fijar cuál de las tres es la meta de la v1 para no bloquear el diseño.

---

## 2. Bóveda

### Qué es (en firme)

Es lo ya construido: **categorías jerárquicas** + **hojas** (texto / link / foto), apuntes enriquecidos, preview de links, subida de imágenes, vista exploración con grafo en escritorio.

### Qué se espera de esta sección a medio plazo

- Pulir UX (mobile vs desktop), rendimiento del grafo con muchas hojas, búsqueda y filtros.
- Definir si la Bóveda comparte **usuario** y **auth** con los otros tres módulos (hoy es single-user implícito).

### Lo que suele faltar pensar

- Límites de tamaño, backup/export de datos, adjuntos fuera de fotos.
- Relación futura con otros módulos: ¿una “hoja” puede enlazar a un evento o a un gasto, o son islas?

### Preguntas para cerrar

1. ¿La Bóveda sigue siendo **solo vos** o algún día compartís categorías con otra persona?
2. ¿Querés **tags** transversales además del árbol de categorías?
3. ¿El bot debe poder **editar** hojas existentes o solo **crear**?
4. ¿Necesitás **recordatorios** ligados a hojas (distintos de Agenda) o alcanza con `fecha_recordatorio` actual?

---

## 3. Hábitos

### Qué pediste (resumen)

- Alta desde PC: nombre, **frecuencia** (diaria o días personalizados), **horario** opcional (único o por hábito), **color**.
- Vista tipo **grilla**: filas = hábitos, columnas = días del mes; **solo checkbox** en días en los que el hábito “toca”; si no toca, **sin** casilla.
- **Marcar hecho** en web o por bot.
- **Recordatorios**: resumen diario (ej. ~16 h de lo que falta); si el hábito tiene hora, **ping** en esa hora.
- Vista por defecto = **mes actual**; acceso a **meses anteriores**; en la principal, **comparación** con mes(es) pasados.
- Visual de **progreso diario** (¿barra del día?) y **por hábito** a nivel mensual (cumplimiento).

### Bajarlo a reglas de negocio (borrador)

- **Día “activo”:** según regla del hábito (L/M/X… o “todos los días”).
- **Día “hecho”:** el usuario marca explícitamente; no se asume automático por “pasar el día”.
- **Día sin marcar:** puede quedar como “pendiente”, “omitido” o “falló” — **hay que elegir** cómo afecta al % del mes (un día no programado no cuenta; un día programado sin marca sí cuenta como hueco).
- **Zona horaria:** todos los cálculos “qué es hoy” y las notificaciones dependen de ella (ej. `America/Argentina/Buenos_Aires`).

### Lo que suele faltar pensar

- **Arrastre:** si me olvidé de marcar ayer, ¿puedo marcar atrasado? ¿hasta cuántos días?
- **Rachas (streaks):** ¿las querés explícitas en UI?
- **Pausar hábito** (vacaciones, lesión) sin romper estadísticas.
- **Límite de hábitos** y de mensajes del bot para no spamearte.
- **Duplicar mes** como plantilla vs hábitos persistentes (un solo modelo de verdad).

### Preguntas para cerrar

1. Un hábito “3 veces por semana” sin días fijos: ¿entra en v1 o solo **días fijos** / **diario**?
2. ¿Un “hecho” puede desmarcarse? ¿con historial de quién/cuándo o basta sobrescribir?
3. ¿Los recordatorios de las 16 h son **fijos** o configurables? ¿**Silenciar fines de semana**?
4. ¿Comparación mes a mes: **mismo número de días programados** o comparás % sobre lo efectivamente esperado cada mes?
5. ¿Necesitás **notas por día** (“hice 20 min en bici” vs solo tick)?
6. ¿Varias personas o un solo usuario?

---

## 4. Agenda

### Qué pediste (resumen)

- Eventos con **título**, **fecha**, **hora opcional**.
- **Repetición:** cada día; un día de la semana; mismo día numérico cada mes; anual (cumpleaños).
- Varios **calendarios** (como Google), cada uno con **color**; poder **activar/desactivar** visibilidad.
- Vistas: **día**, **semana**, **mes**.

### Bajarlo a tierra

- Hay que modelar **excepciones** a series (ej. “este martes sí, el otro no”) y **fin de repetición** (infinito vs hasta fecha N).
- **Todo el día** vs con hora: dos tipos de evento.
- **Zona horaria** y cambio de hora (DST) para no duplicar o saltar instancias.

### Lo que suele faltar pensar

- **Invitados / compartir** calendario: ¿fuera de alcance?
- **Sincronización bidireccional con Google Calendar**: es otro producto; si la querés, definir **solo lectura**, **solo export**, o **sync completo** (complejidad alta).
- Recordatorios: ¿X minutos antes, solo Telegram, también email?
- **Búsqueda** y **anclar** eventos favoritos.

### Preguntas para cerrar

1. ¿La Agenda reemplaza **totalmente** Google Calendar o conviven (MVP = solo app interna)?
2. ¿Los calendarios son solo **etiquetas visuales** o también **permisos** (ej. ocultar Finanzas)?
3. ¿Eventos con **ubicación** y **enlace** (Meet) en v1?
4. ¿**Recordatorio por defecto** para todos los eventos con hora**?
5. Cumpleaños: ¿solo anual sin hora + edad opcional, o también alertas configurables?

---

## 5. Finanzas

*(Corrección de nombre: Finanzas, no “Finanznas”.)*

### Qué pediste (vía análisis del Sheet)

Tres grandes motores más visualización:

1. **Flujos:** ingresos/gastos/deudas; método de pago; categorías; buffer de auditoría antes de “cerrar” impacto en balances.
2. **Patrimonio:** dónde está el dinero (liquidez, reservas, inversiones), deudas comprometidas.
3. **Proyección:** interés compuesto, regla del 4 %, brecha hacia objetivo FIRE.
4. **Dashboards:** mensual, anual/histórico, KPIs, conversión a moneda base.

### Bajarlo a tierra (MVP sugerido para ordenar prioridades)

- **Fase A — Registro fiel:** movimientos + categorías + métodos + moneda; import CSV desde Sheet o copia manual.
- **Fase B — Cierre y saldos:** conciliación simple por “cuenta”/método; deudas como pasivos que restan disponible.
- **Fase C — Análisis:** dashboards y alertas por umbrales.
- **Fase D — Proyección:** curvas largas, supuestos explícitos (tasa, aporte, inflación).

### Lo que suele faltar pensar

- **Multi-moneda:** tipo de cambio diario (oficial vs MEP vs blue) — definir **cuál** manda para “patrimonio en USD”.
- **Tarjetas de crédito:** cierre, resumen, cuotas; si no entran en v1, decirlo explícito.
- **Gastos compartidos** (“Caro”): ¿porcentaje, mitad/mitad, o etiqueta que no divide pero filtra?
- **Privacidad:** datos muy sensibles; backup encriptado, sin analytics de terceros.
- **Legal / impuestos:** la app **no** es asesoramiento; textos de descargo.

### Preguntas para cerrar

1. ¿El **buffer de auditoría** es obligatorio para **todo** movimiento o solo para import masivo?
2. ¿Las **categorías** son árbol, lista plana, o plana con **grupo** (Fijos / Variables)?
3. ¿**Ingresos** se cargan con la misma UI que gastos o pantalla separada?
4. ¿Objetivo FIRE: **un solo número** (capital objetivo) o escenarios (pesimista / base / optimista)?
5. ¿Migración: **paridad 1:1 con el Sheet** en v1 o “empezar de cero” con import parcial?
6. ¿El bot aporta **solo** “último gasto rápido” o también consultas (“cuánto gasté en X este mes”)?

---

## 6. Tema bot: alcance y límites

### Preguntas transversales del bot

1. ¿Un **menú principal** fijo (`Bóveda | Hábitos | Agenda | Finanzas`) con submenús?
2. ¿Conversaciones **largas** (FSM) vs **comandos** (`/habito hecho 3`)?
3. ¿**Un solo chat** (vos) o multiusuario con token por persona?
4. ¿Dónde corre el **scheduler** de recordatorios (mismo proceso del bot, worker aparte, o backend FastAPI con cron)?
5. ¿Qué pasa si Telegram falla: **cola** de notificaciones o “se perdió”?

---

## 7. Datos, identidad y arquitectura (decisiones que desbloquean todo)

### 7.1 Persistencia: SQLite (en firme)

Todo el sistema se apoya en **SQLite**: portable, sin servidor aparte, ideal para HomeLab y backup copiando archivos. Cada módulo tendrá su **esquema relacional** (tablas, índices, migraciones versionadas al estilo del proyecto actual).

### 7.2 Una base por sección (preferencia)

Además de la Bóveda (hoy `database/app.db` o equivalente), tendría sentido **un archivo `.db` por dominio**, por ejemplo:

| Archivo (ejemplo)   | Módulo   | Notas breves                                      |
|---------------------|----------|---------------------------------------------------|
| `boveda.db`         | Bóveda   | Categorías, hojas, metadatos de captura          |
| `habitos.db`        | Hábitos  | Definiciones de hábitos, ticks por día, settings |
| `agenda.db`         | Agenda   | Calendarios, eventos, reglas de repetición       |
| `finanzas.db`       | Finanzas | Movimientos, cuentas, categorías, proyecciones   |

**Ventajas:** backups y restores por módulo; menos riesgo de que un bug en un área toque tablas de otra; migraciones más chicas y claras; podés mover solo Finanzas a otro volumen si querés cifrado distinto.

**Costos:** no hay **FKs reales** entre módulos (ej. “hoja enlazada a evento” sería por `id` + convención o una mini tabla “enlaces” en un quinto archivo o en Bóveda); transacciones que crucen módulos requieren coordinación en código o un **meta-esquema** mínimo en un solo proceso.

**Alternativa** si más adelante molesta el cruce de datos: **un solo `app.db`** con prefijos de tabla (`habito_*`, `agenda_*`, …). Se puede migrar sin cambiar la UI.

### 7.3 Convenciones sugeridas

- Rutas configurables por variable de entorno (ej. `DB_BOVEDA`, `DB_HABITOS`, …) con default `./database/<nombre>.db`.
- Mismo patrón que hoy: `init_db()` / migraciones al arrancar el backend (o un comando único que inicialice las cuatro).
- Backup: script o documentación que copie los cuatro archivos (o carpeta `database/` entera).

### 7.4 Preguntas que siguen abiertas

1. ¿**Autenticación** web (login) en algún momento o siempre local/red privada?
2. ¿**PWA offline** para algún módulo (ej. Hábitos) o solo online?
3. ¿**Docker** fijo para deploy en HomeLab con variables `.env` documentadas?

---

## 8. Riesgos y dependencias

- **Finanzas + tipos de cambio:** dependencia de API externa y de política de redondeo.
- **Agenda + repeticiones:** bugs sutiles; conviene librería probada (reglas RRULE o similar) o alcance acotado al inicio.
- **Hábitos + notificaciones:** precisión horaria y consumo de CPU si todo es polling.
- **“Todo en el bot”:** riesgo de UX pobre; definir qué es **obligatorio** en web.

---

## 9. Próximo paso (de idea a plan de acción)

1. Responder (aunque sea con “v1 no / después”) el bloque **§6** y las preguntas abiertas **§7.4**.
2. Por cada módulo, elegir **MVP de 3–5 entregables** medibles (ej. Hábitos: “grilla mes + tick + 1 recordatorio diario”).
3. Volcar el orden de construcción en `Roadmap.md` con **hitos** y **criterios de hecho**.

---

## 10. Anexo — Lista larga de preguntas (mil y una, compactas)

**Producto**

- ¿Quién es el usuario: solo vos, familia, amigos?
- ¿Idioma único español o i18n desde el principio?
- ¿Modo oscuro único o ya cubierto por temas actuales?

**Bóveda**

- ¿Export PDF/Markdown?
- ¿Adjuntos audio o video algún día?

**Hábitos**

- ¿Límite de hábitos activos?
- ¿Plantillas (“rutina mañana”)?
- ¿Widgets / acceso rápido desde móvil fuera de Telegram?

**Agenda**

- ¿Duración de eventos (30 min vs 2 h)?
- ¿Solapes visualizados?
- ¿Recordatorios múltiples por evento?

**Finanzas**

- ¿Presupuestos por categoría con alerta?
- ¿Suscripciones como entidad separada?
- ¿Adjuntar comprobante/foto al movimiento?
- ¿Etiquetas libres además de categoría?

**Datos**

- ¿Cifrado en reposo para `finanzas.db` o basta filesystem del NAS?
- ¿Rotación de backups (diario / semanal) y retención cuántos días?

**Bot**

- ¿Confirmación con botón inline vs texto?
- ¿Logs de auditoría de acciones del bot?

**Legal / operación**

- ¿Backups automáticos a dónde (NAS, carpeta local)?
- ¿Actualizaciones sin downtime aceptable?

---

*Texto original conservado debajo como referencia literal de la primera versión de la idea.*

---

Vamos a subirlo bastante de nivel. Quiero que debatamos un rato hasta lograr definir todo y anotarlo en @Objetivo-Final.md .

Quiero que el programa esté dividido en 4. Todo manejado desde el mismo bot.
Bóveda , Hábitos , Agenda y  Finanzas .

# Bóveda
Vendría a ser lo que trabajamos hasta ahora. Si bien falta pulir mucho, la idea está.

# Hábitos
Un tracker de hábitos. Sencillo.

Se cargan desde la pc. Se carga el hábito, que día se hacen (diario o personalizado), horario opcional (todos igual o personalizado), podemos darle al usuario para que le elija un color que represente al hábito.

Me imagino una grilla con checkboxs . En cada fila un hábito, cada columna es un día. Me gustaría ver alguna visual piola de cómo se va avanzando. Si un hábito no se hace un día, ese día no tiene checkbox. Quiero poder ver como si fuerza una barra que se va completando tanto para el diario como por hábito al final. Tal vez no necesariamente de esta forma lo que digo es que quiero una visual para el progreso diario, y una visual por hábito para el cumplimiento mensual.

Se pueden marcar como "hechos" manual o vía el bot. Me gustaría que envíe recordatorios todos los días de los hábitos que tocan ese día. Tal vez dos por día, recordando los que faltan aprox a las 16hs. Si un hábito tiene hora, en esa hora recuerda ese hábito.

Quiero que la sección default sea el mes actual, tambien quiero una seccion como para ver meses anteriores. Me gustaria que en la sección principal en algún lado haya comparaciones contra mes o meses anteriores.

# Agenda
Se cargan eventos, cumpleaños, etc. Se elije Título, día y hora (opcional). Se elije si se repite cada día, un día a la semana (ej. todos los martes). Cada mes (ej. todos los 10) o en esa fecha todos los años.
Además quiero que se elija a que "Calendario" se lo agrega. Como google calendar que tenes varios calendarios y podes ir activando o desactivandolos. Cada calendario tiene un color.

Quiero que se pueda ver por día, por semana y por mes.

# Finanzas

Yo ya tengo un google sheet que hace esto. Le pedí a una IA que me lo analize y te cuente bien como es:

Para llevar tu sistema actual de una planilla de cálculo a una aplicación dedicada, necesitas estructurar la lógica en dos grandes motores: uno de **Gestión Operativa** (el día a día) y otro de **Patrimonio Estratégico** (el futuro).

Aquí tienes una hoja de ruta detallada de lo que esta aplicación debe contemplar para replicar y potenciar lo que ya has construido:

---

### 1. Módulo de Flujos: Gastos vs. Ingresos

Este es el motor transaccional. Su objetivo es capturar la realidad financiera con la menor fricción posible.

* **Interfaz de Carga Rápida:** Un sistema de entrada (similar a tu formulario actual) que clasifique cada movimiento por `Monto`, `Método` (Ualá, Brubank, Efectivo, etc.), `Tipo` (Gasto, Ingreso, Deuda) y `Categoría`.
* **Categorización Inteligente:** El sistema debe agrupar los gastos en rubros específicos como:
* **Fijos/Obligatorios:** Educación (UCA), servicios de IA (GPT, Claude, Cursor), transporte.
* **Variables/Estilo de Vida:** Salidas, fútbol, comidas, y gastos compartidos (como los etiquetados bajo "Caro").


* **Capa de Auditoría (El "Buffer" de Corrección):** Una funcionalidad que permita revisar transacciones antes de que impacten en los balances finales. Esto permite corregir errores de dedo, cambiar categorías o anular duplicados sin perder el historial original.

### 2. Módulo de Patrimonio: Ahorros e Inversiones

Aquí es donde la aplicación se diferencia de un simple anotador de gastos y se convierte en una herramienta de gestión de activos.

* **Mapa de Ubicación de Fondos:** La aplicación debe mostrar en tiempo real dónde está cada peso o dólar.
* **Liquidez:** Saldos en billeteras virtuales y bancos (Galicia, Mercado Pago).
* **Reservas:** Dinero destinado a objetivos específicos (ej. fondos para viajes o ahorros de emergencia).


* **Portfolio de Inversiones:** Un apartado para activos que generan rendimiento. Debe permitir:
* Seguimiento de saldos en dólares (MEP/Oficial).
* Cálculo de rentabilidad mensual (la diferencia entre el saldo bruto y el rendimiento neto).


* **Gestor de Deudas:** Un tablero para visualizar compromisos pendientes, permitiendo que el flujo de caja considere el dinero que "ya está comprometido" antes de mostrar el saldo disponible.

### 3. Módulo de Proyección: Plan FIRE e Independencia

Este es el cerebro analítico de la aplicación, que utiliza tus datos históricos para predecir el futuro.

* **Calculadora de Interés Compuesto:** Basándose en un aporte mensual promedio y una tasa de rentabilidad estimada (ej. 6% anual), la app debe proyectar el crecimiento del capital a lo largo de las décadas (de los 23 a los 70 años).
* **Regla de Retiro del 4%:** Una función que calcule automáticamente cuánto podrías cobrar mensualmente si decidieras vivir de tus rentas en diferentes hitos de edad, basándote en el capital acumulado proyectado.
* **Análisis de Brecha (Gap Analysis):** Mostrar visualmente cuánto falta para alcanzar el objetivo de "Libertad Financiera" según el ritmo de ahorro actual.

### 4. Visualización y KPIs (Dashboards)

La aplicación debe transformar las filas de datos en decisiones:

* **Dashboard Mensual:** Comparativa de Ingresos vs. Gastos, evolución de saldos por entidad y seguimiento de suscripciones.
* **Dashboard Anual/Histórico:** Identificación de estacionalidad (en qué meses gastas más en ocio o educación) y tendencias de ahorro a largo plazo.
* **Conversión de Moneda Automática:** Un sistema que normalice todo a una moneda base (ej. Dólares) para tener una visión real del patrimonio sin la distorsión de la inflación local.

---

### Consideraciones Técnicas para el Desarrollo

Para que esto sea superior al Excel, la aplicación debería incluir:

1. **Base de Datos Relacional:** Para que una "Categoría" o un "Método de Pago" sean entidades que puedas editar una sola vez y se actualicen en todo el sistema.
2. **API de Divisas:** Para obtener el tipo de cambio del día automáticamente.
3. **Sistema de Notificaciones:** Recordatorios de vencimientos de cuotas o alertas cuando un gasto en una categoría específica (ej. "Bolucompras") supera el promedio mensual.
