# Plan de implementación — Rediseño visual de Jarvis frontend

Plan de principio a fin para aplicar el sistema visual de `Jarvis.dc.html` (mockup de
Claude Design, esta misma carpeta) al frontend real de Jarvis en `project/frontend/src/`.
Ordenado en fases secuenciales, cada una entregable y sin romper funcionalidad — Jarvis es
de uso real diario (bot de Telegram + frontend), así que ninguna fase puede dejar el módulo
en un estado peor que el anterior, solo visualmente incompleto.

## Documentos de referencia (no duplicar contenido, solo linkear)

| Documento | Qué tiene |
|---|---|
| `Cerebro/jarvis-design-system.md` | Tokens exactos: colores, tipografía, keyframes, mecánica del canvas, layout. **Fuente de verdad visual.** |
| `Cerebro/decisiones-implementacion.md` | Entrada "Plan de implementación: rediseño visual de Jarvis frontend" (2026-08-26) — decisiones de integración ya tomadas (paleta fija, TopBar global se mantiene, composer separado, Debug placeholder). |
| `Cerebro/estado-actual.md` | Estado real construido — se actualiza al cierre de cada fase de este plan. |
| `PLAN-IMPLEMENTACION-BACKEND.md` | Plan de backend (misma carpeta) — cierra los huecos de datos que varias fases de este plan dejan pendientes (counts por tipo, proyectos, entidades enriquecidas, budget por modelo). Cada fase de acá indica si depende de una fase de ese plan. |

## Decisiones ya cerradas (no reabrir sin motivo)

1. **Composer separado** — `JarvisChat` (consulta) y `JarvisCaptureModal` (captura) siguen
   siendo dos flujos distintos. No se unifican en este plan.
2. **Panel Debug es placeholder** — sin backend nuevo. Solo stat cards con datos ya
   disponibles (budget, inbox); sin log stream en vivo.
3. **Paleta de Jarvis es fija**, no reactiva a los 6 temas de `themes.js` (`utils/jarvisPalette.js` nuevo, JS puro, no CSS vars de tema).
4. **El `TopBar` global de SGR se mantiene** — navegación entre módulos, búsqueda, CTA. Se
   agrega una `JarvisSubBar.jsx` propia debajo, mismo patrón que `DashboardTabs` en Finanzas.
5. **El fondo oscuro + canvas se scopean al área de contenido, no a toda la ventana** — el
   mock usa `position:fixed; inset:0` sobre toda la página porque es una demo standalone. En
   SGR eso pintaría por debajo del `TopBar` global, que sigue el tema activo (puede ser un
   tema claro) y quedaría inconsistente. El wrapper oscuro+canvas va **dentro** del área de
   contenido de `JarvisScreen.jsx` (debajo del `<TopBar/>`), no en el `<body>` ni en `Layout.jsx`.

## Principio transversal: no hardcodear (aplica a todas las fases)

Ningún valor con significado —color, tamaño, duración de animación, densidad del canvas,
intervalo de polling, cantidad de barras, umbral de breakpoint— se escribe suelto inline en un
componente. Todo va a uno de estos archivos centrales, según qué es:

| Qué | Dónde vive | Ejemplos |
|---|---|---|
| Colores (5 tipos de memoria, 4 estados de inbox, 3 niveles de budget) | `utils/jarvisPalette.js` | ya planeado en Fase 0 |
| Layout (anchos de columna, alto de topbar, cantidad de barras del budget) | `utils/jarvisPalette.js` (o separarlo a `utils/jarvisLayout.js` si crece demasiado — decisión de implementación, no de diseño) | `246px`/`322px`/`66px`, `12` barras |
| Duraciones/timings de animación | `styles/jarvis.css` (los `@keyframes` ya centralizados en Fase 0) + constantes JS para los `animation-duration` que hoy varían por contexto (`jv-blink` 0.7s/1s/1.2s/1.4s/1.5s, `jv-breathe` 2.6s, `jv-spin` 9s, `jv-sweep` 14s, `jv-rise` .35s) | nombrar cada duración, no repetir el número crudo en cada componente que la usa |
| Parámetros del canvas | props de `JarvisNeuralBackground.jsx` con default importado de `jarvisPalette.js`, no un número inline en el JSX que lo monta | `density=76`, `pulseSpeed=1` |
| Intervalos de polling | ya existe `15000` hardcodeado en el store (`fetchJarvisInbox`/`fetchJarvisBudget`) — pasa a una constante exportada (`utils/jarvisPalette.js` o `store/useStore.js` mismo, con nombre) en vez de un literal repetido en cada `setInterval` | `JARVIS_POLL_MS` |
| Breakpoints responsive (Fase 7) | Tailwind config existente (`md:`/`xl:`/`lg:`) — **no** inventar breakpoints nuevos con `window.innerWidth` hardcodeado en JS | — |

**Regla dura**: si un número aparece más de una vez en el código de una fase, o si cambiar "qué
tan rápido late el dot" o "qué tan ancho es el panel derecho" requeriría tocar más de un
archivo, la fase no está terminada — falta centralizar.

**No aplica** a valores que son inherentemente de una sola instancia y no configurables por
diseño (ej. el `viewBox` de un ícono SVG puntual) — el criterio es "¿alguien querría cambiar
esto sin leer el componente entero?", no "todo número es una constante".

## Regla de cada fase

Cada fase termina solo cuando:
1. El código compila (`npm run build` sin errores) y `npm run dev` levanta sin warnings nuevos en consola.
2. Se probó visualmente en navegador (`/jarvis`, con el worker/backend corriendo si aplica) — capturas o confirmación explícita, no solo "el código parece correcto".
3. Ninguna funcionalidad previa se rompió (chat sigue consultando, captura sigue guardando, inbox sigue mostrando datos reales).
4. Ningún valor mágico nuevo quedó sin centralizar — ver "Principio transversal" arriba. Si la
   fase agregó un color, tamaño, duración o umbral nuevo y no está en `jarvisPalette.js`/
   `styles/jarvis.css`, la fase no está cerrada.
5. Se actualiza `Cerebro/estado-actual.md` con una entrada fechada describiendo qué quedó construido y qué no.
6. Si durante la implementación surgió una divergencia real respecto a lo documentado en `jarvis-design-system.md` o a las decisiones ya cerradas arriba, se agrega una entrada nueva en `Cerebro/decisiones-implementacion.md` explicando qué cambió y por qué (no editar retroactivamente la entrada del 2026-08-26 — esa queda como registro histórico de lo planeado).

---

## Fase 0 — Fundaciones visuales

**Objetivo**: que existan los tokens y el canvas neuronal, visibles en pantalla, sin tocar
ningún componente funcional todavía.

**Archivos nuevos**:
- `project/frontend/src/utils/jarvisPalette.js` — constantes JS: los 5 hex de tipo de
  memoria, los 4 de estado de inbox, los 3 niveles de budget (mapeados desde
  `ACTIVE`/`LOW`/`EXHAUSTED`), un helper `rgba(hex, alpha)` (mismo que usa el mock), **y**
  las constantes de layout/timing que el resto de las fases van a necesitar (ver "Principio
  transversal" más abajo): anchos de columna (`246`/`322`/`66` px), cantidad de barras del
  budget widget (`12`), duraciones de `jv-blink` por contexto, defaults del canvas
  (`density=76`, `pulseSpeed=1`), intervalo de polling (`JARVIS_POLL_MS`, hoy `15000` suelto
  en `useStore.js` — se centraliza acá y el store lo importa). Todo en un solo archivo desde
  el arranque, para no tener que salir a buscar constantes sueltas en fases posteriores.
- `project/frontend/src/styles/jarvis.css` — los 5 `@keyframes` (`jv-breathe`, `jv-rise`,
  `jv-sweep`, `jv-spin`, `jv-blink`), scoped por nombre de clase (no globales genéricos tipo
  `.fade-in` que puedan chocar con otros módulos).
- `project/frontend/src/components/jarvis/JarvisNeuralBackground.jsx` — canvas standalone,
  props `density` (default 76) y `pulseSpeed` (default 1), mecánica documentada en
  `jarvis-design-system.md` (nodos/edges/pulsos/parallax con el mouse). `useRef` + `useEffect`
  con cleanup en unmount — sin el watchdog `ensureAlive()` del mock (es un parche del entorno
  de Claude Design, no aplica a React real).

**Archivo tocado (mínimo)**:
- `JarvisScreen.jsx` — se agrega el wrapper oscuro (`background: radial-gradient(...)` de
  `jarvis-design-system.md`) + `<JarvisNeuralBackground/>` absoluto detrás del contenido
  existente, **dentro** del `<div>` de contenido debajo de `<TopBar/>` (no reemplaza nada
  todavía; el chat e inbox actuales se siguen viendo encima, sin restyle).

**Verificación**: `/jarvis` muestra el fondo neuronal animado detrás del chat/inbox actuales
(que se ven "flotando" sin estilo propio todavía — esperado en esta fase). El resto de la app
(Bóveda/Finanzas/Agenda/Hábitos) no se ve afectado — verificar navegando a esas rutas también.

**Riesgo conocido**: performance del canvas en la laptop del usuario con `density=76` — si hay
lag notable, bajar el default antes de pasar a Fase 1 (no hace falta pedir permiso, es un
ajuste de parámetro dentro del rango ya documentado 24–150).

**Cierre de fase**: entrada en `Cerebro/estado-actual.md` ("Jarvis frontend — Fase 0: fondo
neuronal + tokens de diseño").

---

## Fase 1 — Shell de layout + navegación por tabs

**Objetivo**: `JarvisScreen.jsx` pasa a ser el grid de 3 columnas (izq/centro/der) con la
`JarvisSubBar` (tabs Cerebro/Inbox/Entidades/Debug + budget widget + health indicator). Los
tabs Chat e Inbox muestran el contenido **actual sin restyle** (solo movido de lugar); Entidades
y Debug muestran un placeholder simple ("Próximamente") — no pierden nada porque hoy no existen
como funcionalidad.

**Por qué en este orden y no restyleando directo**: mover `JarvisInboxPanel` de sidebar fijo a
contenido de un tab es un cambio estructural (deja de estar siempre visible). Aislarlo de los
cambios de estilo de la Fase 4 permite verificar que la navegación por tabs funciona sin
confundir bugs de layout con bugs de estilo.

**Archivos nuevos**:
- `JarvisSubBar.jsx` — tabs (dot coloreado + label + badge opcional de Inbox con el count real
  de `jarvisInbox.length`), budget widget (cantidad de barras leída de `jarvisPalette.js`, no
  un `12` inline, + monto, leyendo `jarvisBudget` real del store), health indicator (dot
  `jv-breathe` + label — **decisión de mapeo**: como no hay señal real de "worker vivo" en el
  store hoy, se deriva de `jarvisBudget.status`: `EXHAUSTED` → "modo local" / pink, cualquier
  otro → "worker activo" / verde. Documentar esto como simplificación consciente en
  `decisiones-implementacion.md`. Reemplazable por una señal real sin tocar el componente si se
  ejecuta `PLAN-IMPLEMENTACION-BACKEND.md` Fase B6 — ahí solo cambia de dónde viene el booleano).

**Archivos tocados**:
- `JarvisScreen.jsx` — reescritura de layout a grid 3 columnas (anchos leídos de
  `jarvisPalette.js`, no strings de grid-template-columns armados a mano en el componente);
  estado local `view` (`'chat'|'inbox'|'entities'|'debug'`, default `'chat'`); columna izquierda
  con "Tipos de memoria"/"Proyectos activos" — **requiere** `PLAN-IMPLEMENTACION-BACKEND.md`
  Fases B1 (`GET /jarvis/stats/types`) y B2 (`GET /jarvis/projects`) para datos reales. Si esas
  fases de backend todavía no corrieron, la sección se muestra sin counts/heat (nunca con
  números inventados) — no bloquea el resto de la Fase 1.
- `JarvisInboxPanel.jsx` — dejar de renderizarse como sidebar fijo en `JarvisScreen.jsx`;
  pasa a ser el contenido del tab "Inbox" (sin cambios internos todavía).

**Verificación**: los 4 tabs cambian el contenido central sin recargar; Chat e Inbox siguen
funcionando exactamente igual que antes (consultar, ver inbox real); budget widget en la
subbar muestra el `$spent/$daily` real; badge de Inbox muestra el count real.

**Cierre de fase**: entrada en `Cerebro/estado-actual.md`. Si el mapeo de `health` quedó como
simplificación (probable), entrada en `Cerebro/decisiones-implementacion.md`.

---

## Fase 2 — Restyle de Chat

**Objetivo**: `JarvisChat.jsx` adopta los tokens visuales del mock sin cambiar su lógica
(`jarvisQuery`, historial, sources).

**Archivo tocado**: `JarvisChat.jsx`.

**Qué cambia**:
- Burbuja usuario → gradiente sky/violet, `jv-rise` en cada mensaje nuevo.
- Burbuja de error (`msg.error`) → mantiene su función, adopta paleta Jarvis en vez de
  `var(--expense)`.
- Burbuja de respuesta → card oscura + separador + chips de fuentes (ya mapean bien desde
  `SourcesToggle`, ver `jarvis-design-system.md`).
- Thinking indicator → 3 dots `jv-blink` staggered (sky/violet/pink) en vez del `animate-bounce`
  actual.
- Composer → borde `jv-sweep`, panel interno oscuro con blur, footer con pill fija
  "PREGUNTA · va a retrieval" (sin heurística — es composer de solo-consulta, decisión ya
  cerrada), char count mono, hint "⏎ enviar · ⇧⏎ salto", botón gradiente sky→violet.

**No cambia**: `useStore` hooks, `jarvisQuery`, `jarvisClearHistory`, estructura de
`SourcesToggle` (solo su estilo).

**Verificación**: enviar una consulta real (con worker/backend corriendo) y confirmar que la
respuesta y las fuentes se ven con el estilo nuevo y siguen siendo funcionalmente correctas
(fuentes clickeables si aplica, scroll al fondo, Enter/Shift+Enter).

**Cierre de fase**: entrada en `Cerebro/estado-actual.md`.

---

## Fase 3 — Restyle de Captura

**Objetivo**: `JarvisCaptureModal.jsx` adopta la paleta Jarvis, sin cambiar el flujo de
aclaración pre-enqueue (`check_clarification` → pregunta → "Guardar con esta razón"/"Guardar
sin razón"/"Descartar").

**Archivo tocado**: `JarvisCaptureModal.jsx`.

**Qué cambia**: fondo del modal, colores de textarea/checkbox/botones a la paleta fija de
Jarvis (hoy usa `var(--surface)`/`var(--accent)` del tema activo — pasa a los tokens de
`jarvisPalette.js`). La burbuja de aclaración puede tomar el estilo "ask" del mock (fondo
amber, dot parpadeante, label "FALTA RAZONAMIENTO").

**No cambia**: `jarvisCapture()`, el gate de `check_clarification`, ninguna lógica de
`useStore`.

**Verificación**: abrir el modal (CTA del TopBar), capturar un texto real, y — con un caso
que dispare aclaración (una DECISION sin "porque...") — confirmar que las 3 acciones siguen
funcionando igual.

**Cierre de fase**: entrada en `Cerebro/estado-actual.md`.

---

## Fase 4 — Inbox como vista de página completa + panel derecho

**Objetivo**: el tab "Inbox" deja de ser el `JarvisInboxPanel` movido tal cual (Fase 1) y pasa
a ser la vista de tabla de página completa del mock. El panel derecho (columna 322px) se
implementa con sus 3 secciones.

**Archivos tocados/nuevos**:
- `JarvisInboxPanel.jsx` → reescritura a tabla (columnas leídas de `jarvisPalette.js`, no
  `104px 1fr 120px 74px` armado a mano en el JSX), con los 4 colores de estado fijos de
  `jarvisPalette.js` (recordar: `EXHAUSTED`/`ERROR` pasan a pink `#f472b6`, no rojo). Nuevo
  `utils/formatAge.js` para convertir `updated_at` en edad relativa tipo "12s"/"2m"/"26m" (no
  existe hoy — hoy se muestra la fecha completa truncada); los umbrales de formato (a partir de
  cuántos segundos pasa a mostrar minutos, etc.) van como constantes nombradas al tope de ese
  mismo archivo, no números sueltos en la función.
- `JarvisContextPanel.jsx` (nuevo) — las 3 secciones del panel derecho: "EN PROCESO" (primeros
  3 items de `jarvisInbox` — el `3` es una constante en `jarvisPalette.js`, no un `.slice(0,3)`
  con el número suelto, mismo estilo mini-card que el mock), "GASTO DE HOY" (budget grande +
  nota + breakdown de costo por modelo — **requiere** `PLAN-IMPLEMENTACION-BACKEND.md` Fase B4;
  si no corrió todavía, se omite esa sub-sección en vez de inventar números), "ENTIDADES
  RECIENTES" (requiere `GET /jarvis/entities`, ya existe hoy — si Fase 5 de este plan todavía no
  corrió, esta sección puede quedar vacía/oculta y completarse cuando Fase 5 esté lista, o
  adelantar el fetch acá).

**Verificación**: tab Inbox muestra la tabla real con datos reales, refresco automático sigue
funcionando (ya existe polling de 15s en el store); panel derecho visible en viewports anchos,
oculto en angostos (ver Fase 7 para el breakpoint exacto).

**Cierre de fase**: entrada en `Cerebro/estado-actual.md`.

---

## Fase 5 — Panel de Entidades

**Objetivo**: nuevo tab "Entidades" funcional, consumiendo `GET /jarvis/entities` (ya existe
en `jarvis/api/router.py`, Slice 3 de 0.2 — no requiere backend nuevo).

**Archivos nuevos**:
- `JarvisEntitiesPanel.jsx` — grid `auto-fill minmax(232px,1fr)` (el `232px` mínimo va a
  `jarvisPalette.js`), cards con avatar (círculo=persona, cuadrado redondeado=organización),
  iniciales, nombre, `entity_type` mono. Los campos `note`/`dots`/`count` del mock **requieren**
  `PLAN-IMPLEMENTACION-BACKEND.md` Fase B3 (`list_entities()` hoy solo devuelve
  `name`/`entity_type`/`last_seen`, confirmado leyendo `jarvis/entities/service.py`). Si esa
  fase de backend no corrió todavía, la card se adapta mostrando solo lo que hay (nombre, tipo,
  `last_seen`) en vez de dejar espacios vacíos con placeholders falsos.
- Store: agregar `jarvisEntities` + `fetchJarvisEntities()` a `useStore.js` (mismo patrón que
  `fetchJarvisInbox`).

**Verificación**: tab Entidades muestra entidades reales extraídas por el worker (requiere
haber capturado algo con nombres de persona/organización antes, o usar datos ya en
`project/database/jarvis.db`). Click en una entidad — decidir en implementación si navega al
chat con una pregunta prellenada ("¿Qué sé sobre X?") o simplemente no hace nada por ahora; el
mock lo manda al chat pero sin prellenar la pregunta realmente (es un mock).

**Cierre de fase**: entrada en `Cerebro/estado-actual.md`. Si los campos reales del endpoint
difieren de lo asumido en el mock, entrada en `Cerebro/decisiones-implementacion.md`.

---

## Fase 6 — Panel Debug (placeholder)

**Objetivo**: tab "Debug" visible y con estética del mock, sin backend nuevo (decisión ya
cerrada — ver `PLAN-IMPLEMENTACION-BACKEND.md` Fase B5, documentada pero explícitamente
diferida). Se llena con lo que ya hay disponible en el frontend, no con datos inventados.

**Archivo nuevo**: `JarvisDebugPanel.jsx` — grid de stat cards usando datos que **ya existen**
en el store: budget (`jarvisBudget`), tamaño de cola (`jarvisInbox.filter(status===PENDING/PROCESSING).length`),
errores recientes (`jarvisInbox.filter(status===ERROR).length` + su `last_error`). Sin log
stream (no hay backend). En vez de dejar un hueco vacío donde iría el log stream del mock,
mostrar una nota explícita tipo "Log en vivo — pendiente de endpoint de backend" en el espacio
que ocuparía, para que quede claro que es un límite conocido y no un bug.

**Verificación**: tab Debug no rompe nada, muestra datos reales derivados del store existente.

**Cierre de fase**: entrada en `Cerebro/estado-actual.md`, dejando explícito qué le falta al
panel para estar completo (para que una sesión futura sepa exactamente qué endpoint construir
si se decide completarlo).

---

## Fase 7 — Pulido, responsive y QA de punta a punta

**Objetivo**: cerrar huecos de las fases anteriores, definir comportamiento en viewports
angostos (el mock es desktop-first, sin breakpoints propios), y una pasada de QA completa.

**Trabajo**:
- Breakpoint para ocultar panel derecho (322px) y colapsar panel izquierdo (246px) en mobile/
  tablet — seguir el patrón ya usado en Finanzas (`hidden md:block`, `hidden xl:block`,
  bottom sheet en `lg`) en vez de inventar uno nuevo. Los breakpoints de Tailwind ya son la
  config centralizada acá (`tailwind.config.js`) — no agregar un `window.innerWidth` hardcodeado
  en JS para lo mismo.
- Verificar contraste/legibilidad del `<TopBar/>` global sobre el fondo oscuro fijo de Jarvis
  en los 6 temas (especialmente temas claros como Arcoíris/Sakura) — por diseño el TopBar sigue
  el tema activo, así que debería verse bien solo, pero hay que confirmarlo visualmente.
- Pasada completa: capturar (con y sin aclaración), consultar, ver inbox actualizarse en vivo,
  ver entidades, cambiar de tab repetidamente sin memory leaks del canvas (verificar que
  `JarvisNeuralBackground` no siga corriendo `requestAnimationFrame` si el componente se
  desmonta al navegar fuera de `/jarvis`).
- Revisar performance del canvas en sesiones largas (memory/CPU con DevTools).

**Cierre de fase**: entrada final en `Cerebro/estado-actual.md` marcando el rediseño visual de
Jarvis como completo, con checklist de qué quedó (y qué no: composer unificado, backend de
Debug) para que quede explícito qué falta para las próximas sesiones.

---

## Resumen de archivos por fase (referencia rápida)

| Fase | Nuevos | Tocados |
|---|---|---|
| 0 | `jarvisPalette.js`, `styles/jarvis.css`, `JarvisNeuralBackground.jsx` | `JarvisScreen.jsx` |
| 1 | `JarvisSubBar.jsx` | `JarvisScreen.jsx`, `JarvisInboxPanel.jsx` (solo reubicación) |
| 2 | — | `JarvisChat.jsx` |
| 3 | — | `JarvisCaptureModal.jsx` |
| 4 | `JarvisContextPanel.jsx`, `utils/formatAge.js` | `JarvisInboxPanel.jsx` (rewrite) |
| 5 | `JarvisEntitiesPanel.jsx` | `useStore.js` (+`jarvisEntities`) |
| 6 | `JarvisDebugPanel.jsx` | — |
| 7 | — | breakpoints en varios de los anteriores |
