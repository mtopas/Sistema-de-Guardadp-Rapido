# MIGRANDO DE ClaudeDesign A project

# BÓVEDA

[✅] Lo primero que vamos a actualizar dentro de project es el gráfico de ClaudeDesign. Mantengamos su formato y diseño en su totalidad
pero conectemoslo a nuestra base de datos, nuestras categorías y demas.

[✅] Ahora quiero que copiemos la barra superior. Formatos de texto, tipografías, botones. El botón de notificaciones por ahora que no funcione. El boón de actualizar, bórralo. Move el botón de capturar, el logo del usuario, el nombre homelab-local y la config.

[✅] Quiero que migremos el cuadro de atajo pero que sea CNTRL+M. Lo de densidad lo borramos. Lo de tono base me gusta para que lo implementemos. Agreguemoslo. En vez de "Acento" usamos nuestros "Temas".

## Temas

Te paso las 6 paletas. Cada una respeta la misma estructura de variables que ya tenemos en el sistema: --bg, --surface, --sidebar, --panel-bg, --accent, --accent-light, --accent-deep, --text, --text-2, --subtext, --mute, --border. Pensé cada tema con un concepto, un par tipográfico sugerido y un uso para gráficos.

1. Disco 90s — neón sobre violeta profundo
Concepto: club nocturno, vinilo iridiscente, electric grids. Oscuro pero saturado, con dos acentos vibrantes.

Fondo / superficie

--bg #0d0420 (violeta noche)
--sidebar #0a031a
--surface #1a0a35
--panel-bg #160830 con backdrop-blur
--border rgba(236, 72, 153, 0.18) (rosa fantasma)
Acentos

--accent #ec4899 (magenta hot pink)
--accent-light #f9a8d4
--accent-deep #be185d
Secundario sugerido: #22d3ee (cyan) — para gráficos secundarios y el gradiente de marca: linear-gradient(130deg, #ec4899, #22d3ee)
Texto

Títulos / --text: #fbeaff (lavanda muy clara, casi blanca)
Body / --text-2: #dcc6f0
--subtext: #9b7fb8
--mute: #6b4d8a
Tipografía sugerida: Playfair Display Italic (titulares — ya está), body en Space Grotesk (más geométrico que Sora, va con el tono).

2. Arcoíris — gris neutro + acento que rota por módulo
Concepto: base sobria, color como signal. Cada módulo "trae" su color. Buen balance entre minimalismo y juego.

Fondo / superficie

--bg #f7f6f4 (off-white cálido)
--sidebar #ffffff
--surface #efedea
--panel-bg #ffffff
--border rgba(20, 20, 20, 0.08)
Acento — el acento cambia por módulo (lo que hace al tema "arcoíris"):

Bóveda → --accent: #7c3aed (violeta)
Hábitos → --accent: #059669 (verde)
Agenda → --accent: #2563eb (azul)
Finanzas → --accent: #d97706 (ámbar)
--accent-light y --accent-deep se derivan: −10% / +12% de luminancia
Gradiente neutro de marca: linear-gradient(130deg, #7c3aed, #ec4899, #f59e0b) solo en el logo "SGR"
Texto

Títulos / --text: #1a1714
Body / --text-2: #3f3a36
--subtext: #7a736c
--mute: #a8a29a
Tipografía sugerida: mantener Playfair + Sora.

3. Colores tierra — terracota sobre arcilla
Concepto: cerámica, café tostado, papel reciclado. Oscuro cálido y orgánico.

Fondo / superficie

--bg #1c1410 (café muy oscuro, casi negro)
--sidebar #15100c
--surface #2a1f18
--panel-bg #241a14
--border rgba(193, 134, 89, 0.14)
Acentos

--accent #c87f3e (terracota)
--accent-light #e0a878
--accent-deep #9c5e26
Secundario sugerido: #7c8b5e (verde oliva apagado) para gráficos
Texto

Títulos / --text: #f5ead8 (pergamino)
Body / --text-2: #d9c5a8
--subtext: #9a8770
--mute: #6b5d4d
Tipografía sugerida: Playfair Display para títulos (queda hermoso), IBM Plex Sans o Fraunces en body si querés llevarlo más editorial.

4. Colores pasteles — light mode lavanda
Concepto: papel, post-it, sticker book. Suave, alta legibilidad, contraste sutil.

Fondo / superficie

--bg #fbf7ff (lavanda muy clara)
--sidebar #f4edff
--surface #eee5ff
--panel-bg #ffffff
--border rgba(91, 70, 145, 0.12)
Acentos

--accent #a78bfa (lavanda)
--accent-light #c4b5fd
--accent-deep #7c3aed
Branch colors pastel para gráficos: #fbcfe8, #bae6fd, #bbf7d0, #fde68a, #fecaca, #ddd6fe, #fed7aa, #a7f3d0, #f5d0fe, #fecdd3
Texto

Títulos / --text: #2a1f4a (índigo oscuro — no negro, para que case con el tono)
Body / --text-2: #4a3e6e
--subtext: #7c7194
--mute: #a59cba
Tipografía sugerida: Playfair + Sora — y considerá bajar el font-weight general (300/400) porque los pasteles necesitan trazos más delicados.

5. Lima y gris — minimalismo high-contrast
Concepto: hoja de cálculo de diseñador, Linear-style, signal sobre grayscale puro. Mi favorita para uso diario denso.

Fondo / superficie

--bg #0e0f10 (carbón puro, frío)
--sidebar #08090a
--surface #17191c
--panel-bg #141518
--border rgba(255, 255, 255, 0.07)
Acentos

--accent #bef264 (lima)
--accent-light #d9f99d
--accent-deep #84cc16
Sin secundario — la fuerza del tema está en mantener todo gris excepto los CTAs/datos críticos en lima. Los gráficos usan escala de grises + lima para el valor "vivo" (mes actual, hábito de hoy).
Texto

Títulos / --text: #f4f5f7
Body / --text-2: #c9cbd0
--subtext: #7a7d84
--mute: #4d5057
Tipografía sugerida: Sora en todo — Playfair se ve raro acá. Cambiá la marca "SGR" a Sora 700 o Geist Mono para reforzar el tono técnico.

6. Arena y negro — desértico, alto contraste cálido
Concepto: papel kraft sobre negro tinta. Editorial pero más rústico que "negro y oro" — menos lujo, más textura.

Fondo / superficie

--bg #0c0a08 (negro tinta)
--sidebar #070605
--surface #1c1814
--panel-bg #171410
--border rgba(232, 211, 178, 0.12)
Acentos

--accent #e8d3b2 (arena)
--accent-light #f5e9d2
--accent-deep #c2a87d
Para datos críticos (rojo/verde de finanzas), usar versiones desaturadas: #a85a3a (terracota) y #7d8a5c (musgo) — no rojo/verde estándar, romperían el tono.
Texto

Títulos / --text: #e8d3b2 (la arena es a la vez acento Y color de títulos — es la marca del tema)
Body / --text-2: #c4b394
--subtext: #8a7d65
--mute: #5a5142
Tipografía sugerida: Fraunces o Playfair Italic para titulares + Sora para body. Este tema pide más serif que los demás.

Notas generales:

Para los temas claros (Arcoíris, Pasteles) vas a tener que invertir lógica de box-shadow: usar sombras más opacas en negro en vez de glows de acento, porque sobre fondo claro los glows desaparecen.
En Disco 90s y Negro y oro podés permitirte gradientes más fuertes en CTAs y headers de cards — los otros temas piden moderación.
Lima y gris y Arena y negro funcionan mejor con tipografía monoespaciada en datos numéricos. Ya usás JetBrains Mono — perfecto.
Si querés validar contraste WCAG: todas las combinaciones --text sobre --bg están por encima de 9:1 (AAA). --subtext sobre --bg queda en 4.5:1 (AA normal). Las únicas dudosas son los acentos sobre fondo claro en Pasteles — para CTAs sobre lavanda usá --accent-deep (#7c3aed) en vez de --accent.

## Seguimos

[✅] Dentro de ClaudeDesign cuando apretas "+ Captura" se abre un cuadro flotante. Me gusta más que una ventana nueva. Me gustaría que repliquemos eso. Me gustaría que arriba del título, haya en fila 4 botones Bóveda/Finanzas/Agenda/Hábitos. Por ahora solo funciona la de bóveda. El título me gusta. El cuadro me gusta. Me gusta que autodetecte y marque si es texto, link o foto y que se pueda seleccionar manual por si no detecta algo bien. Me gusta la seccion de categoria con su desplegable. Me gusta lo de recordar pero por ahora que no se pueda usar. Que aparezca pero que no se pueda usar. Me gusta que se pueda guardar con "CNTRL + ENTER".

## Tipografías

1. Sobrio
Títulos / impacto: Playfair Display Italic (serif transicional, alto contraste, terminales agudas)
Body: Sora (geométrica humanista, sutiles curvas redondeadas)

2. Cuaderno
Títulos / marca: Caveat (handwritten cursivo, Google Fonts)
Body: Comic Sans MS (humanist sans, redondeada, sistema)

3. Terminal
Títulos / marca: JetBrains Mono Bold (monospace, tracking ajustado en bold)
Body: IBM Plex Sans (humanist sans con quirks — la 'g' de dos pisos, las terminales rectas)

4. Cálido
Títulos / marca: DM Serif Display (serif transicional moderno, grandes curvas, peso fijo regular)
Body: Manrope (geo sans humanista, redondeada, hecha por Mikhail Sharanda)

5. Neo-grotesque
Títulos / marca: Space Grotesk (neo-grotesque con personalidad — 'g' redonda inusual, números con flair)
Body: DM Sans (neo-grotesque calma, casi neutral)

6. Playful
Títulos / marca: Bricolage Grotesque (display variable de Mathieu Triay — anchos opticos, juega con grade)
Body: Outfit (geo sans limpia, casi cuadrada)


# Finanzas

Analiza la sección finanzas de ClaudeDesign y project\README.md.

Vamos a migrar el front de Finanzas. Front e implementar el back. 
En la barra superior solo cambia el título y el botón de "+Capturar".
Por ahora, no lo conectamos al bot. Usamos el botón de "+ Movimiento".
Se tiene que tener de cada movimiento: Fecha y hora / Monto / Gasto o Ingreso / Descripción / Método de Pago (Uala/Brubank/Efectivo) / Cuotas (opcional) / Categoría / Pesos o dólares
Si se te ocurre algo más que pueda ser importante, decime.

En Claude Design se ven las tabs de Dashboard / Movimiento / Patrimonio / Proyección FIRE .
Yo quiero que tengamos Dashboard / Anual / FIRE / Ahorro / Datos . 

### Dashboard

Es la vista que más usaría. Es la vista del mes actual.
Me gustaria mantener las 3 secciones.
A la izquierda me gusta mucho el panel que está en ClaudeDesign. Saldo disponible, la equivalencia en dolares (que no sea con API, cargo manual el precio actual del dólar oficial), ingresos y gastos, tasa de ahorro (el objetivo se extrae del plan FIRE), Billeteras, Bancos, En Mano.

Abajo de todo quiero un botón de configuración desde donde se cargan nuevos bancos y billeteras, desde donde actualizo el precio del dólar oficial, y otras cosas que iremos viendo.

En el panel del medio, quiero dós gráficos de torta, que muestre los ignresos y los gastos partidos por categorías.
Abajo, dos tarjetas como se ven en ClaudeDesign, pero una tarjeta tiene los movimientos de ingresos y otra los movimientos de gastos. Cada una con su botón de ver todos. El botón de ver todos, abre un cuadro flotante con cada movimiento (gasto o ingreso depende donde se apreto) con toda la infomración de cada movimiento. Me gustaría que si tocas en una columna, se ordene ascendentemente por esa columna, si apretas una segunda ves, se ordena descendentemente, y una tercera vez se desactiva y vuelve a estar ordenado por fecha (default - desde el ultimo para abajo al primero). Me gustaría que se pueda filtrar por la columna categoría.

Abajo de esas dos tarjetas, quiero que haya una sección de notas, para anotarme cosas.

En el panel derecho, quiero ver primero una tabla de cuotas. Cosas que haya pagado con cuotas. Descripción o título / cuando fue la primera cuota, cuando es la útlima cuota y el monto. Cuando se termine, se borra automaticamente.
Abajo de esto, quiero una tabla de gasto total por categoría.

Despues vemos que hacemos con el resto de las tabs.

### Datos

**Rutas (contexto — no re-explorar el repo):**

| Qué | Ruta |
|-----|------|
| Pantalla Finanzas | `project/frontend/src/screens/FinanzasScreen.jsx` |
| Tabs | `project/frontend/src/components/finanzas/DashboardTabs.jsx` |
| Modal alta de movimiento | `project/frontend/src/components/finanzas/MovementModal.jsx` |
| Tabla “ver todos” del dashboard (solo lectura) | `project/frontend/src/components/finanzas/MovimientosTableModal.jsx` |
| Panel derecho del dashboard | `project/frontend/src/components/finanzas/FinanzasRightPanel.jsx` |
| Estado Finanzas | `project/frontend/src/store/useStore.js` |
| Datos mock / reglas de negocio | `project/frontend/src/data/finanzas.js` |
| Textos UI | `project/frontend/src/utils/i18n.js` |
| Backend Finanzas | `project/app/main.py`, `project/app/db/crud.py`, `project/app/db/database.py` |
| Diseño referencia | `ClaudeDesign/finanzas.jsx`, `ClaudeDesign/modals.jsx` |
| Spec general Finanzas | sección `## Finanzas` arriba; `project/README.md` |

**Qué debe hacer la tab**

- Mostrar el **histórico completo** de movimientos. El selector de mes/año de las tabs **no** filtra esta vista.
- **Una tabla** con ingresos y gastos juntos y una columna que indique **gasto o ingreso**.
- **No mostrar transferencias** entre cuentas (misma regla que el resto de Finanzas).
- Puede haber **miles** de filas.
- **Panel central:** tabla a ancho completo.
- **Orden fijo** por fecha: la más antigua arriba, la más reciente abajo. Sin ordenar por otras columnas ni filtros.
- **Edición inline** de cada celda; al salir del campo (**blur**) se guarda el cambio.
- **Columnas editables:** las mismas que el formulario de **+ Movimiento** (fecha y hora, monto, gasto/ingreso, descripción, método de pago, cuotas opcional, categoría, pesos o dólares, nota opcional, audit). Cuenta y categoría: **texto libre**. El icono no se edita a mano.
- Al final de cada fila, botón para **eliminar** el movimiento (**sin** diálogo de confirmación).
- **Crear** movimientos solo desde **+ Movimiento** del header; no hace falta botón extra en esta tab.

**Panel derecho (solo en tab Datos)**

KPIs y detalles calculados sobre el histórico (sin transferencias), por ejemplo:

- Fecha del primer movimiento
- Días desde ese primer movimiento
- Promedio de movimientos por mes
- Otros indicadores útiles en la misma línea visual que el resto de Finanzas

**Restricciones**

- Finanzas es **offline**; edición y borrado deben funcionar igual que el resto del módulo cuando no hay red.
- Lo **online** del sistema es solo lo del bot de Telegram.


---
Podemos cambiar el órden de las columnas?
Fecha - Tipo - Monto - Moneda- Método - Categoría - Descripción - Cuotas - Tacho de basura.
Borramos la lógica de notas.
Cambiemos el formato de la fecha a DD-MM-AAAA . 
Podemos lograr que las barras desplazadoras de todo Finanzas cambien de color como pasa en Bóveda?

### Ahorro

Quiero implementar la pestaña **Ahorro** dentro de **Finanzas** en el proyecto (`project/`). Es la vista donde veo cuánto tengo ahorrado en total, cómo está distribuido entre mis instrumentos (acciones, plazos fijos, FCI, ONs, etc.) y mis objetivos de ahorro — que se actualizan solos cuando registro movimientos con categoría `Ahorro`. Leé la spec de abajo y las rutas; no re-explores el repo desde cero.

**Rutas (contexto — re-explorar lo que sea necesario):**

| Qué | Ruta |
|-----|------|
| Pantalla Finanzas + tab Ahorro | `project/frontend/src/screens/FinanzasScreen.jsx` |
| Tabs | `project/frontend/src/components/finanzas/DashboardTabs.jsx` |
| Movimientos (origen del total ahorrado) | `project/frontend/src/components/finanzas/MovementModal.jsx`, tab **Datos** en este archivo |
| Panel derecho dashboard (objetivos FIRE / emergencia hoy) | `project/frontend/src/components/finanzas/FinanzasRightPanel.jsx` |
| Tab FIRE | `project/frontend/src/components/finanzas/FireProjectionCard.jsx` |
| Estado Finanzas | `project/frontend/src/store/useStore.js` |
| Categorías / reglas | `project/frontend/src/data/finanzas.js`, `project/app/db/database.py` |
| Backend Finanzas | `project/app/main.py`, `project/app/db/crud.py` |
| Diseño referencia | `ClaudeDesign/finanzas.jsx` |
| Spec general | sección `## Finanzas` arriba |

**Qué es “ahorro total” (número principal)**

- **Suma** de todos los **gastos** con categoría exacta **`Ahorro`** (dinero que guardaste).
- **Menos** la **suma** de todos los **ingresos** con categoría exacta **`Ahorro`** (dinero que retiraste desde tus ahorros hacia el día a día).
- Ese total es el que **repartís** entre instrumentos (acciones, plazos fijos, FCI, ONs, etc.).
- **No** se mezcla con el **saldo disponible** del panel izquierdo: un gasto categoría Ahorro es plata que dejás de tener para gastar; un ingreso categoría Ahorro es plata que vuelve al disponible y **sale** del ahorro total.
- Las **transferencias** entre cuentas no afectan este cálculo (misma regla que en Datos).
- Si editás un movimiento en **Datos**, los totales y objetivos **se recalculan**.

**A debatir:** cómo mostrar y sumar **monedas** (ARS vs USD) en el total y en cada instrumento.

**Tab Ahorro — una sola pantalla (sin sub-pestañas)**

- **Panel central:** patrimonio de ahorro/inversión.
  - **Total ahorrado** (regla de arriba).
  - **Desglose por tipo de instrumento** — lista **fija y amplia** (mejor que sobren tipos que falten): p. ej. acciones, cedears, plazo fijo, FCI, ONs, bonos, crypto, otros que encajen. Cada tipo muestra la **información propia** de ese instrumento (no todos iguales).
  - Donde aplique (**acciones, cedears**, etc.): **una fila por ticker**; ir cargando **compras y ventas** con todos los campos que hagan falta (que sobre antes que falte); ir **sumando nominales** y el **precio promedio** de la posición.
  - En **otro lugar** (misma fila o sección del activo): poder **actualizar a mano el valor actual** del mercado y ver **rendimiento** (ganancias y pérdidas) calculado a partir de eso.
  - Instrumentos donde **no** aplique ledger de compra/venta (plazo fijo, FCI, etc.): la info que corresponda a ese producto, sin forzar el mismo modelo que acciones.
- **Quitar** de esta tab lo que hoy sea suscripciones u otros widgets que no correspondan.

**Objetivos de ahorro**

- Crear objetivos con **monto meta** y **fecha límite opcional**.
- Cada objetivo puede tener **cuánto ahorrar por mes**: si hay fecha límite, se **calcula**; si no, se **carga a mano**. Mostrar **cuánto llevás**, **cuánto falta**, progreso, etc.
- **Vinculación automática con movimientos:**
  - Un **gasto**, categoría **`Ahorro`**, descripción **idéntica** al nombre del objetivo → suma ese monto **solo a ese objetivo** y al total de ahorro.
  - Un **ingreso**, categoría **`Ahorro`**, descripción idéntica → **resta** del objetivo y del total (retiro desde ese ahorro).
  - Un movimiento solo afecta **un** objetivo. Si la descripción no coincide con ningún objetivo existente → **mostrar error** (no asignar a ningún lado).
- Al retirar, los objetivos **bajan**; no solo suben.
- Objetivo al **100%**: sigue **visible** hasta que lo **elimines** manualmente.
- El **fondo de emergencia** pasa a ser **un objetivo más** (no un sistema aparte con categoría Emergencia como hoy).

**Panel derecho (solo en tab Ahorro)**

- Lista de **objetivos** con **porcentaje** de avance y **cuánto falta** (y lo que ayude a leer el estado de cada meta).

**Relación con tab FIRE**

- FIRE y Ahorro se cruzan solo en **cuánto te toca ahorrar este mes** (meta mensual que sale del plan FIRE).
- Tab **FIRE:** tabla **editable** mes a mes con cuánto **ahorraste**; el resto de columnas/valores se **derivan** según reglas del plan (p. ej. % de incremento mensual de ahorro configurado en el **panel derecho de FIRE**).
- En **Ahorro** no duplicar toda la proyección FIRE; usar la meta mensual donde corresponda (p. ej. comparar con lo ahorrado vía categoría Ahorro en el mes).

**Alcance futuro (incluir en el producto; orden de implementación lo define la IA en su momento)**

- Ventas parciales, splits, dividendos, amortizaciones y casos similares en posiciones con compra/venta.
- Prioridad de entregas y exclusiones de v1: **sin definir** en este prompt.

**Restricciones**

- **Offline**, como el resto de Finanzas.
- Categoría: nombre exacto **`Ahorro`** (no variantes ni contains).

### FIRE (complemento — tab propia)

- Tabla del plan **editable** (meses, lo ahorrado, metas derivadas).
- **Panel derecho:** configuración del **% en que aumentás el ahorro cada mes**; con eso y lo cargado se recalculan los demás valores del plan.
- Vinculación con Ahorro: ver sección **Relación con tab FIRE** arriba.

#### PREGUNTAS A AGREGAR AL PROMPT

**1. Vinculación movimiento → objetivo: ¿qué pasa con los huérfanos?**

> Un movimiento categoría `Ahorro` con descripción que no coincide con ningún objetivo existente: ¿el error bloquea el guardado, o el movimiento se guarda igual y aparece marcado como "sin asignar"? Si no bloquea, ¿ese monto suma al total ahorrado o queda fuera?
Me gusta que quede cómo "sin asignar". Ese monto suma al total ahorrado.

**2. Monedas (el punto marcado explícitamente como "a debatir")**

> El total ahorrado, ¿se muestra en ARS, en USD, o en ambos (con conversión manual igual que el Dashboard)?
Tiene que haber dos totales, en ARS y en USD. Se usa el DOLAR OFICIAL (se carga manualmente) para convertir de uno a otro.
> Para los instrumentos, ¿el precio promedio de posiciones en acciones/CEDEARs se carga en ARS, USD, o permite los dos?
Tengo entendido que lo mejor es manjerase con USD en lo que respecta al portafolio, acciones, cedears, ONs, etc. Creo que voy a cargar siempre en dólares. Si compro 1500 pesos y el dólar está 1500 pesos, cargo como que compré un dólar de esa acción. Que pensas de esto?
> Si un plazo fijo está en pesos y una ON está en USD, ¿cómo se suma el total del portafolio?
Total en pesos: intrumensots en pesos + instrumentos en dólar * dólar oficial.
Total en dólares: intrumentos en dólares + instrumentos en pesos / dólar oficial.
Que pensas de esto?


**3. Instrumentos vs. movimientos: ¿son mundos separados o el mismo dato?**

> Cuando compro 10 acciones de AAPL, ¿registro ese gasto como un movimiento categoría `Ahorro` descripción `AAPL` + cargo la compra en el ledger del instrumento? ¿O son cosas independientes? (Si son las dos cosas a la vez, ¿cómo evitar que el total se duplique?)
Podemos charlarlo. Que pensas que es mejor?
Creo que una opción podría ser que yo categorice todo lo que vaya a ahorro como "Ahorro" y después dentro de la pestaña ahorro yo particiono el ahorro en distintas cosas.
La otra opción es usar la categoría + descripción para asignar.

**4. Fondo de emergencia: migración**

> Hoy existe `fondo_emergencia_meta` en `fin_config` y la categoría especial `Emergencia` en la BD. ¿Se migra eso a "un objetivo más" llamado `Fondo de Emergencia` con categoría `Ahorro` descripción exacta `Fondo de Emergencia`? ¿Y los movimientos históricos con categoría `Emergencia` cómo se tratan — se re-categorizan manualmente o se borran?

Sí, se migra eso a "un objetivo más" llamado `Fondo de Emergencia` con categoría `Ahorro` descripción exacta `Fondo de Emergencia`. Los recategorizo yo manualmente.

**5. Layout del panel central**

> ¿El total ahorrado es un número grande en la parte superior del panel (estilo "Saldo disponible" del Dashboard), o va dentro de un card/sección? ¿Hay algún gráfico (por ejemplo torta/pie) que muestre la distribución del portafolio por tipo de instrumento, o solo una lista?
Tenes que analizar bien cómo podemos usar los 3 paneles.
Quiero que me ayudes y me des ideas con esto.

**6. Los instrumentos: ¿acordeón colapsable o lista plana?**

> ¿Cada tipo de instrumento (Acciones, Plazos Fijos, FCI, etc.) tiene su propia sección expandible/colapsable? ¿O todos se muestran en una lista corrida? ¿Los tipos sin posiciones se ocultan o se muestran vacíos con un botón "+"?
Cada tipo de instrumento tiene su propia sección expandible/colapsable.

**7. Precio promedio ponderado (PPP) en acciones/CEDEARs**

> Al cargar varias compras del mismo ticker, ¿el precio promedio se calcula como promedio ponderado por cantidad (PPP)? ¿Las ventas parciales reducen la posición usando FIFO, LIFO o precio promedio?
Lo dejo a tu criterio.

**8. Valor actual de mercado: ¿dónde y cómo se actualiza?**

> ¿El precio actual del mercado para calcular P&L se carga por ticker (un solo campo editable por ticker) o por compra individual? ¿Se guarda en la BD o es un campo volátil que hay que re-ingresar cada sesión?
Tiene que haber una sección donde yo ignrese manualmente el precio del ticker actual. Los totales, ganancia/perdida, todo se debe actualizar segun ese numero.

**9. Plazo fijo / FCI: ¿qué información propia tienen?**

> Para un plazo fijo: ¿qué campos quierés ver? (sugerencia: entidad, capital inicial, TNA o TEA, fecha inicio, fecha vencimiento, capital + intereses proyectados). ¿Los intereses se calculan automáticamente o se ingresan al vencimiento?
> Para un FCI: ¿cuotapartes + precio de cuotaparte actual, o solo monto invertido + rendimiento %?
Los campos que vos sugeriste. Los intereses se calculan automaticamente.
Para FCI cuotapartes + precio de cuotaparte actual.

**10. Crear objetivos: ¿desde dónde?**

> ¿Los objetivos se crean desde un botón en el panel derecho, desde un modal flotante, o desde un formulario inline en el panel central? ¿Se pueden editar después de creados (cambiar nombre, monto meta, fecha)?
Los objetivos se crean desde un modal flotante. Se deben poder editar después de creados.

**11. Objetivo al 100%: ¿qué pasa visualmente?**

> ¿El objetivo completado se ve igual que los demás pero con la barra llena y un checkmark, o tiene algún tratamiento visual especial (color, badge "Completado")? ¿Aparece al principio o al final de la lista?
El objetivo completado se ve igual que los demás. Se deben poder borrar y esa plata se va como "sin asignar". Solo disminuye el ahorro cuando hago un movimiento del tipo Ingreso + Ahorro + Descripicón (Emergencia/Objetivo:Viaje/etc).

**12. Meta mensual FIRE en la tab Ahorro**

> ¿Cómo querés ver la meta mensual FIRE en Ahorro? ¿Como un número comparativo ("ahorrado este mes: $X vs meta: $Y") o como una barra de progreso? ¿En el panel central o en el panel derecho?
Me gustaría ver la barra y también "ahorrado este mes: $X vs meta: $Y".

**13. Selector de mes/año en la tab Ahorro**

> ¿La tab Ahorro usa el selector de mes/año del header de tabs (igual que Dashboard) o el selector queda oculto porque muestra el histórico completo (igual que Datos)?
Muestra histórico completo. No usa el selector de mes/año.

**14. v1: ¿qué queda para después?**

> El prompt menciona "ventas parciales, splits, dividendos, amortizaciones" como alcance futuro. ¿En v1 entramos solo objetivos + el cálculo del total, y los instrumentos vienen en una segunda entrega? ¿O la IA arranca todo junto?
Lo dejo a tu criterio.

**15. Tablas en backend**

> ¿Preferís que la IA diseñe las tablas nuevas que necesite (ej: `fin_objetivos`, `fin_instrumentos`, `fin_posiciones`) sin restricción, o hay algún patrón que tenés que ya quieras mantener (por ejemplo, todos los instrumentos en una sola tabla polimórfica vs. tablas separadas por tipo)?
Analicemos bien todo lo que hay para agregar y después vemos bien la distribución. Hay que terminar de definir que va en el panel derecho, central e izquierdo.

¿Cómo manejo FIRE actualmente?

Aumento Aporte Mensual: 1,20%
Rentabilidad Anual en Mercado: 6,00%

A los … años		Cobraría Mensual USD		Cobraría Mensual ARS	
25		 USD $24,05		ARS $33.788,60	
30		 USD $141,28		ARS $198.502,26	
35		 USD $413,23		ARS $580.583,48	
40		 USD $1.012,86		ARS $1.423.067,47	
45		 USD $2.297,94		ARS $3.228.611,34	
50		 USD $5.005,61		ARS $7.032.883,15	
60		 USD $22.342,55		ARS $31.391.281,10	
70		 USD $96.035,60		ARS $134.930.014,84	

Edad	Mes	Aporte Mensual	Inicial	Interés	Saldo Final	Ahorrado	Falta	Año	Mes
23,2	1/2/2026	USD $126,28	USD $1.022,55	USD $5,74	USD $1.154,57	ARS $0,00	USD $0,00	2026	2
23,3	1/3/2026	USD $127,80	USD $1.154,57	USD $6,41	USD $1.288,78	ARS $0,00	USD $0,00	2026	3

La columna "Edad" es simplemente mi edad actual en esa fecha. El primer día del mes que cumplo años (noviembre) ya sumo 1 a mi edad.
La columa "Mes" indica lo que hay que ahorrar y lo que debería tener cada mes.
La columna "Aporte Mensual" es lo que ahorré o tengo que ahorrar. La primera vez en la tabla hice el cálculo manual. Desde ahí para adelante se calcular cómo: (lo que debería haber ahorrado el mes anterior)*(1 + Aumento Aporte Mensual) + (lo que faltó ahorrar del mes anterior)
La columna "Inicial" es la plata con la que arranco ese mes. La primera vez lo cargué a mano, luego lo até al "Salfo Final" del mes anterior.
La columna de "Interés" es un supuesto aproximado de lo que debería ganar. Se calcula como "[(Aporte Mensual)+(Inigial)]*[(Rentabilidad Anual en Mercado)/12]".
La columna "Saldo Final" es la suma de (Aporte Mensual)+(Saldo Inicial)+(Interes).
La columna "Ahorrado" indica lo que realmente ahorré ese mes.
La columna "Falta" se calcula como (Aporte Mensual)-(Ahorrado) . 
La columna "Año" y "Mes" son simplemente descomposición de la columna "Mes".




**Lo que vale la pena revisar:**

1. **¿Qué pasa si ahorrás de más?** Si `Ahorrado > Aporte`, `Falta` queda negativo. Con tu fórmula actual eso *reduce* el próximo aporte requerido. ¿Eso es lo que querés? Podría ser que prefieras que el superávit reduzca el `Inicial` del siguiente mes directamente (ya está en el `Saldo Final`), y que el aporte siguiente solo ajuste por el déficit histórico, no por el superávit. Vale confirmarlo.


2. **`Ahorrado` vs. `Ahorro` del sistema**: Hoy lo cargás a mano. En el sistema, este número puede venir automáticamente de la suma de movimientos categoría `Ahorro` del mes. La pregunta es: ¿siempre debe venir de ahí, o a veces querés poder editarlo a mano (ej: si registraste algo fuera del sistema)?


3. **La tabla superior** (25 años → cobrarías X) está calculada sobre el total acumulado proyectado del plan. Eso funciona mientras sigas el plan, pero si en un mes fallás mucho, esa tabla no se actualiza. Podría ser útil que esa tabla se recalcule siempre desde el `Saldo Final` del último mes real (no el proyectado).
Tenes razón. Hagamos lo que decís.

### Anual

Vista de retrospectiva y planificación para el año seleccionado. Dos ejes: entender lo que pasó y saber qué ajustar de acá en adelante.

**Selector de período**

Solo muestra el selector de **año** (no mes + año). El mes no aplica en esta vista.

**Panel central**

1. **Fila de resumen anual** — 4 números grandes al estilo Dashboard:
   - Total ingresos del año · Total gastos del año · Total ahorrado · Tasa de ahorro promedio anual · Inflación acumulada del año (calculada desde los valores cargados mes a mes)

2. **Gráfico de barras mensual** — corazón de la vista
   - 12 columnas (una por mes); cada columna tiene 3 barras: ingresos (verde), gastos (rojo), ahorro neto (acento).
   - Toggle **Nominal / Real**: cuando está en Real, los valores se ajustan por inflación acumulada desde enero del año seleccionado. Permite ver si los gastos realmente subieron o solo siguieron la inflación.

3. **Tabla resumen mes a mes** (12 filas, compacta)
   - Columnas: Mes | Ingresos | Gastos | Ahorrado | Tasa% | Inflación% | Vs mes anterior ↑↓
   - Ordenada enero → diciembre. Meses con déficit (gastos > ingresos) resaltados sutilmente.

4. **Categorías anuales**
   - Gastos del año entero partidos por categoría (donut o tabla). Diferente al Dashboard que muestra solo el mes actual; acá se ve el peso real de cada categoría en el año completo.

**Panel derecho**

- **Highlights del año**: mejor mes de ahorro (mes + monto), peor mes (mes + déficit), cantidad de meses en positivo vs. negativo (ej: 8/12).
- **Comparación con año anterior**: ingresos +X%, gastos +X%, ahorrado +X% vs. el año anterior.
- **Proyección de cierre del año**: si estamos a mitad del año, calcula "a este ritmo, cerrarías el año con $X ahorrados. Meta FIRE anual: $Y."
- **Inflación mensual** (tabla editable inline): Mes | Inflación%. Se carga manualmente mes a mes. Con estos datos se calcula la inflación acumulada del año y se habilita el toggle Nominal/Real en el gráfico.

**Lo que NO va en esta tab**

- Detalle de movimientos individuales → eso es Datos.
- Cuotas ni notas → eso es Dashboard.
- Proyección FIRE completa → eso es la tab FIRE.

**Por qué la inflación importa**

Sin ajuste por inflación, los números nominales engañan: si en enero ganabas $300k y en diciembre $500k parece que mejoró, pero con 60% de inflación en el año perdiste poder adquisitivo. La inflación mensual habilita:
- Ver si el salario real creció o cayó.
- Saber si los gastos realmente subieron o solo acompañaron la inflación.
- Entender cuánto valen en términos reales los pesos ahorrados.

### Agenda

Módulo de gestión de tiempo y tareas. Cuatro tabs; **HOY** es el default al entrar a `/agenda`.

Rutas: `/agenda/*`. Entidades principales: calendarios, eventos, listas de tareas, tareas, horario facultad.

**BD:**
- `agenda_calendarios` — id, nombre, color, activo
- `agenda_eventos` — id, titulo, descripcion, fecha_inicio, fecha_fin, todo_el_dia, se_repite, regla_repeticion, calendario_id
- `agenda_listas` — id, nombre, color
- `agenda_tareas` — id, titulo, descripcion, fecha_opcional, hora_opcional, hora_bloque, duracion_estimada, completada, lista_id
- `agenda_horario_facultad` — id, dia_semana, hora_inicio, hora_fin, materia, descripcion

**Distinción visual en el calendario:**
- Eventos → chip sólido con color del calendario; con hora si la tiene
- Tareas con fecha → chip con borde punteado del color de la lista + mini ☐
- Facultad → capa de fondo opacada; solo visible en vistas horarias (HOY, Semana, Día)

---

#### HOY (default)

Foco del día: qué tenés hoy, qué está por venir, time blocking.

**Panel izquierdo**
- Lista de tareas pendientes de los **próximos 15 días** (ordenadas por fecha)
- Checkbox inline para marcar completa desde acá
- Cada tarea muestra su lista de origen (color de lista)
- Botón ⊕ "Agendar" por task → mini timepicker de hora → el bloque aparece en la grilla del panel central
- Si la hora del bloque pasa sin completar la tarea: el bloque desaparece automáticamente, la tarea vuelve a pendientes

**Panel central**
- Grilla horaria del día actual (hora × hora, 6h–23h)
- Capas visibles: eventos del calendario + bloques de tareas asignadas + horario facultad (fondo, opacado)
- Indicador de hora actual (línea con dot en acento)
- Click en slot vacío: crear evento rápido

**Panel derecho**
- Cards de eventos y tareas del día (estilo "Tu día" del ClaudeDesign)
- Detalle/edición al seleccionar un bloque de la grilla

---

#### Mes

Vista calendario mensual (+ Semana como vista secundaria).

**Panel izquierdo**
- Mini calendario navegable
- Lista de calendarios: toggle on/off, color, botón `+ Nuevo`

**Panel central**
- Header: `[◀] Mayo 2026 [▶]` + `[Hoy]` + switcher `Mes / Semana`
- Grid 6×7 (Mes) o grilla horaria por columna de día (Semana)
- Click en día vacío: `EventoModal` con fecha pre-cargada
- Click en evento/tarea: abre panel derecho con detalle

**Panel derecho (xl)**
- Detalle y edición del evento o tarea seleccionado
- Default (sin selección): próximos 5 eventos

---

#### Tareas

Gestión pura de listas y checklists, sin el calendario de fondo.

**Panel izquierdo**
- Mini calendario (contexto de fechas)
- Listas de tareas: crear (nombre + color picker), renombrar inline, eliminar

**Panel central**
- Lista seleccionada → tareas con checkbox, título, descripción, fecha/hora opcional
- Filtro: Pendientes / Completadas / Todas
- Ordenar por fecha o por creación

**Panel derecho (xl)**
- Detalle de la tarea seleccionada: todos los campos editables
- Botón eliminar tarea

---

#### Revisión

Retrospectiva semanal. Equivalente al "Anual" de Finanzas pero para productividad.

**Panel izquierdo**
- Selector de semana (← →); label de rango de fechas

**Panel central**
- Tareas completadas esa semana (con lista de origen)
- Tareas sin completar esa semana
- Tareas pendientes hace +7 días (alertas en rojo)
- % tiempo planificado vs. no planificado (calculado desde eventos de la semana)

**Panel derecho (xl)**
- Desglose de tiempo por calendario (Personal, Trabajo, etc.)
- Facultad como segmento propio con su % de la semana

#### Horario Facultad

No es un calendario normal — es una **capa de fondo** de horarios recurrentes semanales.
- **No aparece** en la vista Mes (demasiado ruido visual)
- **Sí aparece** en HOY: opacado, diferenciado del resto con icono 🎓
- Gestión desde botón "Facultad" en la barra de tabs → `HorarioFacultadModal`
- Campos: materia, día de semana, hora inicio/fin, descripción/aula

# Hábitos

Módulo de seguimiento de hábitos. Tres tabs; **HOY** es el default al entrar a `/habitos`.

Rutas: `/habitos`. Entidades principales: hábitos, registros de completación.

**BD:**
- `habitos` — id, nombre, descripcion, color, categoria, frecuencia_tipo ('diario' | 'semanal'), dias_semana (JSON array, null si diario), hora (nullable), activo, creado_en
- `habitos_registros` — id, habito_id, fecha, valor (0.5 = parcial · 1.0 = total), nota (nullable), creado_en

**API:** prefijo `/habitos/*` — hábitos CRUD, registros GET/POST/DELETE.

---

## Layout

Tres paneles igual que Finanzas y Agenda:

- **Panel izquierdo:** lista de hábitos + streak + resumen del día + botón “+ Nuevo hábito” → `NuevoHabitoModal`
- **Panel central:** cambia según tab activa
- **Panel derecho (xl):** detalle del hábito seleccionado — descripción, estadísticas, rachas, registros recientes

---

## Modelo de frecuencia

- **Diario:** todos los días de la semana
- **Días específicos:** array de días (ej: martes y jueves)
- **Hora opcional:** si se asigna, el hábito aparece en ese slot de la grilla de Agenda HOY

---

## Completar un hábito

Click en la celda de la grilla → mini popup:
- **Total** (verde, valor 1.0): completado al 100%
- **Parcial** (amarillo, valor 0.5): completado parcialmente
- Campo de nota corta (opcional; si pierde foco sin texto, queda vacío)
- Micro-animación al confirmar

**Racha:** días consecutivos con valor > 0 (parcial también mantiene la racha).
**Porcentaje:** `suma(valores) / días_programados * 100`.

---

## Tabs

### HOY (default)

**Panel izquierdo**
- Lista de todos los hábitos activos
- Chip por hábito: nombre, color, streak si ≥ 3 días, estado de hoy (hecho · pendiente · no toca hoy)
- Resumen rápido: X de Y completados hoy + barra de progreso
- Botón “+ Nuevo hábito” → `NuevoHabitoModal`

**Panel central**
- Grilla mensual del mes actual:
  - **Un solo scroll container** horizontal (fix al problema del ClaudeDesign)
  - Columna nombre: `position: sticky left`
  - Columna % del mes: `position: sticky right`
  - Días futuros: celdas grises sin interacción
  - Día actual: highlight con accent
  - Celda completada total: verde · parcial: amarillo · pendiente: borde punteado · sin programar: guión
- Header: mes anterior / mes actual / mes siguiente + botón “Hoy”

**Panel derecho (xl)**
- Detalle del hábito seleccionado en la grilla
- Descripción/propósito del hábito (campo `descripcion`)
- Racha actual, racha máxima, % del mes
- Registros recientes con nota si tienen
- Botón editar → `NuevoHabitoModal` en modo edición
- Botón eliminar hábito

---

### Progreso

**Panel central**
- **Resumen global:** % cumplimiento esta semana · este mes · vs mes anterior
- **Heatmap** de los últimos 3 meses (estilo GitHub): cada celda = un día, coloreada por % de hábitos completados ese día
- **Mensaje de momentum** basado en tendencia reciente:
  - “Venís excelente esta semana — mejor racha del mes”
  - “Ojo, estás cayendo — 3 días sin completar tus hábitos”
  - “Buen recovery — retomaste después de fallar ayer” (concepto “nunca perder dos veces”: no castiga, foco en recuperar)
- **Afirmaciones de identidad** (stats presentadas como logros):
  - “Meditaste X de los últimos 14 días”
  - “Llevas Y semanas siendo consistente con [hábito]”
- **Sparkline** últimos 6 meses de % general
- Filtro por categoría

**Panel derecho (xl)**
- Tabla de todos los hábitos: racha actual · racha máxima · % mes actual · % mes anterior · tendencia ↑↓
- Mejor hábito del mes (más consistente)
- Hábito con más fallas

---

### Historial

**Panel izquierdo**
- Selector de período (mes · trimestre · año)
- Filtro por hábito o categoría

**Panel central**
- Vista de días pasados: para cada día, qué se completó (total/parcial) y qué no
- Rachas rotas marcadas visualmente (“rompí la cadena acá”)
- Nota del registro visible en hover sobre cada celda

---

## Integración con Agenda

- **Con hora:** el hábito aparece en la grilla horaria de Agenda HOY en ese slot, como evento del calendario especial “Hábitos” (no editable desde Agenda)
- **Sin hora:** aparece en la sección “Hábitos de hoy” del panel izquierdo de Agenda HOY, con checkbox inline
- Completación **unidireccional**: se gestiona desde Hábitos; Agenda HOY es solo lectura
- El calendario “Hábitos” en Agenda es auto-generado y **no aparece en la vista Mes** (mismo patrón que Facultad)
- Accent Arcoíris en `/habitos`: verde `#059669` (ya definido en el spec de temas)

---

## Modal: Nuevo / Editar Hábito (`NuevoHabitoModal`)

Campos:
- Nombre
- Descripción / propósito (se muestra en hover en la grilla y en el panel derecho)
- Color
- Categoría (libre, texto)
- Frecuencia: **Diario** | **Días específicos** (selector de días de la semana)
- Hora (opcional)
