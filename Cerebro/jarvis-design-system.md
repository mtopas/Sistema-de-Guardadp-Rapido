# Sistema de diseño — Jarvis Frontend

Extraído de `ClaudeDesign - Jarvis/Jarvis.dc.html` (mockup Claude Design). Este documento
es la fuente de verdad de los tokens visuales; el plan de aplicación al frontend real vive
en `Cerebro/decisiones-implementacion.md` (entrada "Plan de implementación — rediseño visual
de Jarvis frontend").

## Colores por tipo de memoria

| Tipo | Hex | Uso |
|------|-----|-----|
| `RAW` | `#7dd3fc` (sky) | captura bruta, sin digerir |
| `SEMANTIC` | `#4ade80` (green) | hechos verificables |
| `DECISION` | `#fbbf24` (amber) | con su razonamiento |
| `PROJECT` | `#a78bfa` (violet) | contexto de un proyecto |
| `PEOPLE` | `#f472b6` (pink) | quién es quién |

Todas las superficies tintadas (chips, bordes, fondos) se derivan de estos 5 hex con alpha,
nunca con hex nuevos: fondo tenue `rgba(hex, 0.05–0.10)`, borde `rgba(hex, 0.16–0.30)`, glow
`rgba(hex, 0.55–0.85)` en el propio hex a distinta opacidad. Fórmula del mock:
`rgba = (hex, a) => 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'`.

## Colores de estado del inbox

| Estado | Hex | Animación |
|--------|-----|-----------|
| `PENDING` | `#7dd3fc` | ninguna |
| `PROCESSING` | `#fbbf24` | `jv-blink 1s infinite` |
| `DONE` | `#4ade80` | ninguna |
| `ERROR` | `#f472b6` | `jv-blink .7s infinite` |

**Diverge del frontend actual**: `JarvisInboxPanel.jsx` hoy usa `--success`/`--mute`/`--accent`/
`--expense` (paleta del tema activo) para estos 4 estados. El mock usa una paleta **fija**,
independiente del tema SGR — es la paleta de Jarvis, no la de Bóveda/Finanzas/Agenda/Hábitos.
Al reimplementar, migrar a estos 4 hex fijos (no vars de tema).

## Budget — nivel de gasto

Umbral sobre `spent_usd / daily_budget_usd`, pero el mapeo real debe hacerse por
`jarvisBudget.status` (`ACTIVE` | `LOW` | `EXHAUSTED`, ya lo devuelve el backend), no
recalculando el ratio en el frontend:

| Status backend | Nivel mock | Hex | Nota |
|---|---|---|---|
| `ACTIVE` | activo | `#4ade80` | "Todo con el modelo grande." |
| `LOW` | bajo | `#fbbf24` | "Queda poco. Las consultas largas van a modelo chico." |
| `EXHAUSTED` | agotado | `#f472b6` | "Presupuesto agotado — Jarvis cayó a modo local..." |

**Diverge del frontend actual**: `JarvisInboxPanel.jsx` usa `var(--expense, #ef4444)` (rojo) para
`EXHAUSTED`. El mock usa `#f472b6` (pink, el mismo hex de `PEOPLE`/`ERROR`) — no rojo. Adoptar el
pink para consistencia con el resto de la paleta Jarvis.

## Background base

```css
/* fondo raíz, detrás del canvas */
background: radial-gradient(120% 90% at 20% 0%, #10132a 0%, #070914 45%, #04050b 100%);

/* body */
background: #05060d;
color: #e8ecfb;

/* vignette sobre el canvas, entre el canvas y el contenido */
background: radial-gradient(75% 60% at 50% 45%, rgba(4,5,11,0) 0%, rgba(4,5,11,0.55) 70%, rgba(3,4,8,0.9) 100%);

/* links */
a { color: #7dd3fc; }
a:hover { color: #bae6fd; }
```

Este fondo es **oscuro fijo**, no reacciona a los 6 temas de `themes.js` — Jarvis es una
identidad visual propia (más cerca de un "modo consola" que del sistema de temas de Bóveda/
Finanzas/Agenda/Hábitos). Ver decisión en `decisiones-implementacion.md` sobre cómo convive esto
con `--app-*`.

## Tipografía

- **Space Grotesk** (400/500/600/700) — familia display/body. Ya está cargada en
  `project/frontend/index.html` (Google Fonts, usada también por el font-pair "Neo-grotesque"
  de `themes.js`). No hace falta agregar el `<link>`.
- **JetBrains Mono** (400/500/700) — toda la capa "meta": labels en mayúscula con
  letter-spacing ancho (`TIPOS DE MEMORIA`, `BUDGET`, `FUENTES · N MEMORIAS`), badges de tipo/
  estado, timestamps/edades, montos, stats numéricos, el log stream de Debug. Ya está cargada en
  `index.html`.

**Regla de uso**: texto de prosa (mensajes del chat, notas de entidades, headings de sección)
→ Space Grotesk. Cualquier cosa estructurada/numérica/etiqueta → JetBrains Mono, uppercase,
`letter-spacing: 0.08–0.16em`, tamaño 9–11px.

Tamaños clave: 22px/600 (headings de sección: "Inbox de captura", "Entidades reconocidas"),
14.5px (texto de mensajes/prosa), 13–13.5px (texto secundario), 11–12px (texto chico), 9–11px
mono (labels/meta), 26px/700 mono (monto de budget grande), 20px/600 (valor de stat card).

## Animaciones CSS (`@keyframes`)

```css
@keyframes jv-breathe { 0%,100% { opacity:.55; transform:scale(1);} 50% { opacity:1; transform:scale(1.18);} }
@keyframes jv-rise    { from { opacity:0; transform:translateY(10px);} to { opacity:1; transform:translateY(0);} }
@keyframes jv-sweep   { from { background-position:0% 50%; } to { background-position:200% 50%; } }
@keyframes jv-spin    { to { transform:rotate(360deg); } }
@keyframes jv-blink   { 0%,100%{opacity:1} 50%{opacity:.2} }
```

| Keyframe | Dónde se aplica |
|---|---|
| `jv-breathe` | dot de health indicator en la topbar (`2.6s ease-in-out infinite`) |
| `jv-rise` | entrada de cada burbuja de chat (`.35s ease both`) |
| `jv-sweep` | borde-gradiente animado del composer (`14s linear infinite`, `background-size:200% 100%`) |
| `jv-spin` | anillo cónico del logo Jarvis (`9s linear infinite`) |
| `jv-blink` | dots de estado `PROCESSING`/`ERROR` en inbox, dots del "thinking indicator" (staggered con `animation-delay`), dot de "EN PROCESO" del panel derecho — duración varía 0.7s–1.5s según contexto |

## Animación Canvas — fondo neuronal

Componente candidato: `JarvisNeuralBackground.jsx` (nuevo, ver plan sección C).

**Estructura de datos** (calculada una vez al montar, con `density` nodos):
- **nodes**: `{ x, y (0–1 normalizados), vx, vy (~±0.00012), r (0.7–3), z (0.25–1, profundidad
  para parallax), c (uno de los 5 hex de tipo, random), ph (fase random para el twinkle) }`.
- **edges**: para cada nodo, sus 2 vecinos más cercanos (distancia euclídea al cuadrado en
  espacio normalizado); se conecta si `d < 0.035`, deduplicado.
- **pulses**: `max(8, density/4)` pulsos, cada uno referencia un edge (`e`), posición `t∈[0,1]`
  a lo largo del edge, velocidad `s = (0.0022 + rand()*0.005) * pulseSpeed`.

**Loop de render** (`requestAnimationFrame`):
1. Limpiar canvas.
2. Actualizar posición de cada nodo (`x += vx`, rebote en los bordes 0/1).
3. Dibujar edges: `createLinearGradient` del color del nodo A al color del nodo B, alpha
   `0.13 * z`.
4. Dibujar nodos: círculo núcleo (`r * z * 1.6`, alpha `0.55 * z * twinkle`) + halo (`r * z * 7`,
   alpha `0.07 * z * twinkle`); `twinkle = 0.55 + 0.45 * sin(ts/900 + ph)`.
5. Dibujar pulsos: gradiente de cola (alpha 0→0.85) sobre el último 30% del tramo recorrido +
   punto brillante + halo suave; avanzar `t += s`; al pasar 1, resetear a `t=0` y reasignar a un
   edge random.

**Parallax con el mouse**: posición target `(tmx, tmy)` = puntero normalizado a la ventana;
posición suavizada `(mx, my)` interpola `+= (target - actual) * 0.05` cada frame (lerp). Offset
de cada nodo: `px = (mx-0.5)*34*z`, `py = (my-0.5)*34*z` — nodos con más `z` (más "cerca")
se mueven más.

**Parámetros configurables** (props del componente):
- `density` (default 76, rango sugerido 24–150) — cantidad de nodos.
- `pulseSpeed` (default 1, rango 0.2–2.5) — multiplicador de velocidad de los pulsos.

**Colores**: los 5 hex de tipos de memoria (`RAW/SEMANTIC/DECISION/PROJECT/PEOPLE`), mismos
valores que la sección "Colores por tipo de memoria" arriba — el canvas no tiene paleta propia.

**Nota sobre el "watchdog" del mock**: el `.dc.html` tiene un `ensureAlive()` que reinicia el
canvas cada 1.2s si detecta que quedó stale — es una mitigación específica del entorno de
Claude Design (hot-swap del DOM del canvas entre re-renders del editor), **no aplica a React
real**. En la implementación real, un `useRef` + `useEffect` con cleanup en unmount es
suficiente; no portar el watchdog.

## Layout — 3 columnas

```
grid-template-rows: 66px (topbar) 1fr (body)
grid-template-columns (body): 246px (izq) minmax(0,1fr) (centro) 322px (der, condicional)
```

- **Panel derecho** se oculta cuando `view === 'debug'` (en el mock, vía prop
  `showContextPanel`). Fuera del mock, también debería ocultarse en viewports angostos
  (el mock es desktop-first, sin breakpoints propios).
  **Decisión final (2026-08-26)**: se implementó siempre visible en las 4 tabs — la tarea de
  implementación no pedía ese toggle explícitamente y se priorizó consistencia. Ver
  `decisiones-implementacion.md`.
- **Panel izquierdo**: `border-right`, scroll propio, `padding: 20px 16px`, `gap: 26px` entre
  secciones (Tipos de memoria / Proyectos activos / Próximamente).
- **Panel derecho**: `border-left`, scroll propio, `padding: 20px 16px`, `gap: 22px` (En proceso /
  Gasto de hoy / Entidades recientes).
- **Centro**: 4 vistas mutuamente excluyentes (`chat` | `inbox` | `entities` | `debug`),
  `padding: 26px 34px` cada una excepto `chat`, que reparte entre lista de mensajes
  (scroll) y composer (fijo abajo, `padding: 14px 34px 22px`).

## Componentes clave — resumen de diseño

- **TopBar**: logo con anillo cónico girando (`jv-spin`, colores de los 5 tipos + repetición del
  primero para cerrar el gradiente) + wordmark "JARVIS" (`letter-spacing:0.22em`, 700) + badge
  mono "2º CEREBRO" · tabs en pill container (dot de color + label, badge numérico opcional en
  Inbox) · budget widget (label mono "BUDGET" + 12 barras verticales tipo sparkline coloreadas
  hasta el % gastado + monto mono coloreado por nivel) · health indicator (dot `jv-breathe` verde/
  pink + label "worker activo"/"modo local").
- **Panel izquierdo**: tipos de memoria (dot coloreado + key mono + desc + count, hover
  `translateX(3px)`) · proyectos activos (nombre + count mono + barra de "calor" gradiente
  violeta→sky proporcional a `heat`).
- **Chat**: burbuja usuario (gradiente sky/violet 12–14% alpha, alineada derecha, esquina inferior-
  derecha recta) · burbuja "ask"/aclaración (fondo amber 7%, dot parpadeante + label "FALTA
  RAZONAMIENTO") · confirmación "saved" (pill horizontal, check circular coloreado por tipo +
  label mono del tipo + texto) · respuesta "answer" (card oscura, texto, separador, fuentes como
  chips con dot+tipo mono+texto truncado, hover `translateY(-2px)`) · thinking indicator (3 dots
  `jv-blink` staggered sky/violet/pink + label de pipeline).
- **Inbox** (vista de página completa, no lista lateral): header con título + "refresco en Ns" +
  leyenda de 4 estados; filas grid `104px|1fr|120px|74px` (estado animado | texto truncado | tipo
  | edad).
- **Entidades** (nuevo): grid `auto-fill minmax(232px,1fr)` de cards — avatar (círculo persona /
  cuadrado redondeado organización) con iniciales, nombre + kind mono, nota, fila de dots por tipo
  de memoria en que aparece + count mono.
- **Debug** (nuevo): toggle "worker en vivo" (pill con dot `jv-blink`) · grid de 4 stat cards
  (label mono + valor grande + sub) · log stream (grid mono `time|level(coloreado)|msg`).
- **Composer**: borde con gradiente `jv-sweep` de 6 colores (sky→green→amber→violet→pink→sky,
  `background-size:200% 100%`) envolviendo un panel interno oscuro con blur; textarea Space
  Grotesk 15px; footer con pill de tipo detectado en vivo (dot + label mono, recalculado por
  heurística en cada tecla), char count mono, hint "⏎ capturar · ⇧⏎ salto", botón gradiente
  sky→violet.

## Fuera de alcance del mock (usar tokens de arriba, pero sin réplica exacta)

- El mock unifica captura + consulta en un solo composer (`guessType()` decide si es `QUERY` o
  un tipo de memoria a capturar). El frontend real hoy separa ambos flujos
  (`JarvisChat` = solo consulta, `JarvisCaptureModal` = solo captura).
  **Decisión final (2026-08-26, corregida en la re-implementación contra
  `PLAN-IMPLEMENTACION.md`)**: no se unifica — el plan de implementación cierra esto
  explícitamente en su Fase 2 ("composer separado", "sin heurística — es composer de
  solo-consulta"). El pill del composer de `JarvisChat` es **fijo** ("PREGUNTA · va a
  retrieval"), sin `guessType()` — la nota anterior de esta misma sección (que decía que
  `guessType()` se portó como badge informativo) quedó desactualizada apenas se leyó el
  plan real; corregida acá. `guessType()` no se usa en ningún lado del frontend actual.
- El panel Debug del mock muestra un log stream en vivo; no existe endpoint de backend que lo
  sirva hoy (`GET /jarvis/*` no tiene nada equivalente — el snapshot de debug real vive solo por
  Telegram, `jarvis/debug/service.py`). Requiere endpoint nuevo si se implementa tal cual.
  **Decisión final (2026-08-26, Fase B5 de `PLAN-IMPLEMENTACION-BACKEND.md`, retomada)**:
  se implementó. Tabla nueva `jarvis_event_log` — el worker escribe una fila real por
  evento (`CLASSIFY`/`ENTITY`/`EMBED`/`LINK`/`ERROR`) en `jarvis/worker/processor.py`, vía
  `jarvis/events/service.py::log_event()`. `GET /jarvis/events` alimenta el log real del
  tab Debug (`JarvisDebugPanel.jsx`) — ya no es un placeholder ni un sustituto de
  `jarvisInbox`. "Cola"/"errores"/"último procesado" sí siguen derivándose del lado del
  cliente desde `jarvisInbox`, tal como pedía la Fase 6 del plan de frontend.
