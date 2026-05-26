# Bóveda — documentación técnica

Estado real del módulo Bóveda en SGR. Todo lo que está implementado y cómo funciona.
Para roadmap, mejoras y features pendientes: **`Boveda-Roadmap.md`**.

**Última revisión del código:** mayo 2026.

---

## 1. Qué es

**Bóveda** es el módulo de **captura y archivo de conocimiento personal**: guardar ideas, links y fotos en un árbol de categorías, explorarlos en un grafo radial (desktop) o lista (mobile), y ampliarlos con apuntes enriquecidos (TipTap).

| Rol | Dónde |
|-----|--------|
| Captura rápida | `CaptureModal` (Ctrl+Enter), bot Telegram, PWA share target → `/capture` |
| Exploración densa | `/` — `BrowseScreen` (3 paneles + grafo) |
| Lectura/edición profunda | `/hoja/:id` — `DetailScreen` |
| Ajustes globales | `/settings` |

**Accent Arcoíris** en `/`: violeta `#7c3aed` (`Layout.jsx` → `ARCOIRIS_ACCENTS`).

---

## 2. Arquitectura

```
UI (React)                    API (FastAPI)              Persistencia
────────────                  ─────────────              ────────────
BrowseScreen ──┐
LeftPanel      ├── useStore ── fetch ── main.py ── crud.py ── SQLite (app.db)
NetworkGraph   │              POST/PATCH/DELETE
RightPanel     │              /upload → uploads/
CaptureModal ──┘
DetailScreen ───────────────── (misma API)

mybot/bot.py ── requests ──► /categorias, /hojas, /upload
```

- **Un solo store:** `frontend/src/store/useStore.js`.
- **Sin capa de servicios:** rutas en `app/main.py`, SQL en `app/db/crud.py`.
- **Offline:** `crearHoja` tiene update optimista (temp id + rollback en catch); `fetchHojas`/`fetchCategorias` sin mock fallback — si falla la API, log en consola.

### Rutas frontend

| Ruta | Pantalla | Layout |
|------|----------|--------|
| `/` | `BrowseScreen` | Full-screen; sin sidebar Bóveda |
| `/hoja/:id` | `DetailScreen` | Con `Sidebar` |
| `/capture` | `CaptureScreen` (legacy) | PWA share target |
| `/settings` | `SettingsScreen` | Con sidebar |

---

## 3. Modelo de datos (SQLite)

### `categorias`

| Columna | Tipo | Notas |
|---------|------|--------|
| `id` | INTEGER PK | |
| `nombre` | TEXT UNIQUE | No puede repetirse a nivel global |
| `padre_id` | INTEGER FK → categorias | `NULL` = raíz del árbol |
| `icono` | TEXT | Emoji opcional |

Seed: categoría **General** si la tabla está vacía.

### `hojas`

| Columna | Tipo | Notas |
|---------|------|--------|
| `id` | INTEGER PK | |
| `contenido` | TEXT NOT NULL | Título / URL / referencia foto |
| `fecha` | TEXT ISO | Creación |
| `categoria_id` | INTEGER FK | Obligatorio |
| `tipo` | TEXT | `texto` \| `link` \| `foto` |
| `apuntes` | TEXT | HTML (TipTap) |
| `lugar` | TEXT | Bot Telegram (ubicación); sin vista mapa en UI |
| `latitud`, `longitud` | REAL | Bot Telegram (ubicación); sin vista mapa en UI |
| `fecha_recordatorio` | TEXT | Persistido en BD; **UI deshabilitada** |
| `icono` | TEXT | Override visual (`leafIcons.js`) |
| `fecha_actualizado` | TEXT | Se actualiza al PATCH apuntes/icono |
| `link_preview` | TEXT JSON | og:title, image, etc. (links) |

**Reglas implícitas:**
- **Tags** (`#algo`): no hay tabla; se extraen de `contenido` + `apuntes` con regex (`utils/tags.js`).
- Las hojas viven en la categoría elegida; el grafo agrupa hojas bajo la categoría raíz del árbol.
- Fotos: `contenido` = URL de `/uploads/...`; `apuntes` puede llevar `<img>` (patrón del bot).

---

## 4. API REST

Prefijos sin namespace (`/categorias`, `/hojas`).

| Método | Ruta | Uso |
|--------|------|-----|
| GET | `/categorias` | Lista árbol plano `{ id, nombre, padre_id, icono }` |
| POST | `/categorias` | `{ nombre, padre_id?, icono? }` |
| PATCH | `/categorias/{id}` | Renombrar, cambiar `padre_id` o `icono` |
| DELETE | `/categorias/{id}` | Borra categoría; 409 si tiene hojas (`?forzar=true`) |
| GET | `/hojas` | Todas con `categoria_nombre` |
| GET | `/hojas?q=&tipo=&categoria_id=` | Búsqueda/filtro server-side (contenido + apuntes) |
| GET | `/hojas/recientes?limit=` | Últimas hojas por fecha (default 20, max 100) |
| GET | `/hojas/{id}` | Una hoja |
| POST | `/hojas` | Crear; si `tipo=link`, fetch OG preview en servidor |
| PATCH | `/hojas/{id}` | `HojaPatch`: `apuntes`, `icono`, `contenido`, `categoria_id`, `tipo` |
| DELETE | `/hojas/{id}` | Eliminar (+ borra archivo en `/uploads/` si era foto) |
| POST | `/hojas/{id}/preview` | Refrescar link preview |
| POST | `/upload` | Multipart → `{ url: "/uploads/..." }` |
| GET | `/preview?url=` | Preview sin guardar hoja |

---

## 5. Frontend — piezas clave

### `BrowseScreen.jsx`

- **Desktop:** `TopBar` + `NetworkGraph` (entre márgenes 300px/425px) + `LeftPanel` + `RightPanel` flotantes.
- **Mobile:** `MobileList` agrupada por categoría; navega a `/hoja/:id`.
- Estado local: `openHojaId`, `searchQuery`.

### `LeftPanel.jsx`

- Árbol de categorías raíz → subcategorías → `NoteCard` por hoja.
- Colores por rama: `BRANCH_COLORS` en `themes.js`.
- Búsqueda: filtra hojas por `contenido` y `categoria_nombre` (no busca en apuntes ni tags).
- Panel expandible 300px → 50vw.

### `NetworkGraph.jsx`

- Grafo **estático SVG** (no D3 force): hub central "SGR", ramas = categorías raíz, leaves = hojas (máx. **14 por rama**).
- Formas: círculo = texto, cuadrado rotado = link, rect redondeado = foto.
- **Cross-links** punteados entre hojas que comparten `#tag`.
- Click en hoja → abre `RightPanel` vía `onOpenHoja`; tooltip hover (título + tipo + categoría).
- Controles zoom: **decorativos**, sin lógica real.
- Aviso "+N" cuando hay más de 14 hojas por rama; ARIA en legend y SVG.

### `RightPanel.jsx`

- Vista **latest**: lista de hojas recientes.
- Vista **note**: TipTap + autosave debounce 800ms + picker de icono + `LinkPreview`.
- Abre vía `openHojaId` desde LeftPanel.
- PATCH: `updateApuntes`, `updateIcono` en store.

### `CaptureModal.jsx`

- Tabs Bóveda / Finanzas / Agenda / Hábitos — **solo Bóveda habilitada**.
- Autodetect tipo: `detectType.js` (URL http(s) → link; resto texto).
- `CategoryPicker`: buscar, elegir, crear categoría inline.
- Recordatorio: UI visible, **disabled** ("Próximamente").
- Atajos: `Escape` cierra, `Ctrl/Cmd+Enter` guarda.

### `DetailScreen.jsx`

- Ruta dedicada mobile/legacy: edición apuntes, borrar hoja (doble confirmación), tags, preview link.
- No edita `contenido`, categoría ni recordatorio en UI.

### `TopBar.jsx` (solo en `/`)

- Título: **click** = siguiente módulo, **click derecho** = módulo anterior.
- Búsqueda global del browse.
- Badge campana de notificaciones (**sin handler**).
- CTA **+ Captura** → `openCapture`.

### Store (slice Bóveda)

| Acción | Comportamiento |
|--------|----------------|
| `fetchCategorias` / `fetchHojas` | GET; error → log, sin mock fallback |
| `crearCategoria` | POST + refetch categorías |
| `crearHoja` | POST + refetch hojas |
| `eliminarHoja` | DELETE + filtro local optimista |
| `updateApuntes` / `updateIcono` | PATCH + merge en `hojas` |
| `openCapture` / `closeCapture` | Modal |

---

## 6. Bot de Telegram (`mybot/bot.py`)

**API local:** `http://127.0.0.1:8765` (`API_BASE_URL` en `.env` si necesitás otro host/puerto).

Cliente de captura Bóveda completo. Persistencia local: `rapido.json` (modo rápido + última categoría), `chat_id.json` (check-in nocturno).

### Flujo de captura

1. **Texto libre** → regex `https?://\S+` → `tipo=link` o `texto` → inline keyboard de categorías → `POST /hojas`.
2. **Foto** → `POST /upload` → caption como título directo (sin paso extra); sin caption pide título → keyboard → `tipo=foto`.
3. **Forward** → extrae texto/caption del reenviado → mismo flujo que texto.
4. **Ubicación** → `lugar` + `latitud`/`longitud` en `POST /hojas` → keyboard → guarda.
5. **Modo rápido** (`/rapido on`) → salta menú; guarda en última categoría usada (persiste en `rapido.json`).
6. **Prefijos rápidos** (Agenda, no Bóveda): `t:` tarea, `e:` evento.

### Features implementadas

| Feature | Cómo funciona |
|---------|---------------|
| **URL → `tipo=link`** | Regex `https?://\S+` al recibir texto — sin fricción |
| **Inline keyboards** | Reemplazan el menú numérico. Callbacks `bov_root:`, `bov_cat:`, `bov_back`, `bov_new_cat` |
| **Subcategorías en dos pasos** | Click en `📂 Categoría` → segundo teclado con hijos + botón ⬅ Volver |
| **Modo rápido `/rapido`** | `on` = guarda directo en última cat usada (sin menú). Persiste en `rapido.json` |
| **`/ultimas`** | Últimas 5 hojas con botones 🗑 para eliminar. Usa `GET /hojas/recientes` |
| **`/buscar <texto>`** | Busca en contenido + apuntes. Usa `GET /hojas?q=`. Devuelve hasta 10 |
| **Caché categorías 60s** | `bot_data["cat_cache"]` con TTL. Se invalida al crear categoría nueva |
| **Healthcheck `/categorias`** | Al arrancar verifica `/habitos` y `/categorias`; avisa si falla |
| **Forward → texto** | Extrae texto/caption del mensaje reenviado y lo captura a Bóveda |
| **Ubicación** | Captura `lat`/`lon` + `lugar` en `POST /hojas` |
| **Foto con caption** | Si la foto viene con caption, lo usa como título directo (sin paso extra) |

### Comandos Bóveda

| Comando | Acción |
|---------|--------|
| `/ultimas` | Últimas 5 hojas con botón 🗑 por hoja (`bov_del:{id}`) |
| `/buscar <palabra>` | `GET /hojas?q=` — hasta 10 resultados |
| `/rapido [on\|off]` | Sin args: estado + última categoría. Con args: activa/desactiva |
| `/cancel` | Cancela flujo pendiente (categoría nueva, título foto, etc.) |

### Callbacks inline

| Callback | Acción |
|----------|--------|
| `bov_root:{id}` | Entra a subcategorías de la raíz |
| `bov_cat:{id}` | Selecciona categoría hoja → guarda draft |
| `bov_back` | Vuelve al nivel raíz del teclado |
| `bov_new_cat` | Pide nombre de categoría (respeta `cat_parent_id` actual) |
| `bov_del:{id}` | Elimina hoja (`DELETE /hojas/{id}`) |

### Limitaciones conocidas

| Tema | Estado |
|------|--------|
| Editar hojas | No (solo eliminar desde `/ultimas`) |
| Recordatorios | No (requiere pipeline de notificaciones) |
| Auth / multi-usuario | Token del bot = un usuario implícito |

---

## 7. Estado implementado (mayo 2026)

- Grafo radial conectado a BD; árbol izquierdo; panel derecho con TipTap.
- Barra superior ClaudeDesign, modal captura, autodetect tipo, `Ctrl+Enter` guardar.
- 6 temas + tonos + 6 pares tipográficos; Tweaks `Ctrl+M`.
- Tags en UI y cross-links en grafo.
- Link preview server-side al crear link.
- Bot Bóveda completo: inline keyboards, subcategorías, `/rapido`, `/ultimas`, `/buscar`, forward, ubicación, foto con caption, caché 60s, healthcheck `/categorias`.
- Campos BD para recordatorio y geo (parcialmente preparados).
- **NetworkGraph mejorado:** click en hoja → abre en RightPanel; tooltip hover (título + tipo + categoría); `cursor:pointer` en hojas, `cursor:grab` en fondo; aviso "+N" cuando hay más de 14 hojas por rama; `aria-label` en legend y botones zoom; `role="img"` + `aria-label` en SVG. `parseGraph.js` y `DetailPanel.jsx` (huérfanos) eliminados.
- **LeftPanel mejorado:** estado de expansión en `localStorage` (`sgr-boveda-tree-open`); botón "expandir/colapsar todo" (con `ChevronsUpDown`); highlight del texto de búsqueda coincidente; botón "+ Hoja" inline en cada categoría (abre `CaptureModal` con cat preseleccionada vía `openCaptureWith`); formulario inline de "Nueva subcategoría" con `Enter`/`Escape`.
- **RightPanel mejorado:** título `contenido` editable al click (PATCH `updateHoja`); breadcrumb clickeable → select de `categoria_id` inline; indicador "⚠ Sin guardar" si el autosave falla la red; TipTap Extension `Link` (URLs clicables, autolink, linkOnPaste); TipTap `Placeholder` ("Apuntes, #tags, ideas…").
- **CaptureModal mejorado:** pre-selecciona última categoría usada (`localStorage`); respeta `captureDefaultCategoriaId` del store (preset desde LeftPanel); `role="dialog"` + `aria-modal` + `aria-label`; focus trap Tab/Shift+Tab dentro del modal.
- **Store Bóveda:** `crearHoja` con update optimista local (temp id + rollback en catch); `updateHoja(id, patch)` genérico para contenido/categoria_id/tipo; `openCaptureWith(categoriaId)`; `captureDefaultCategoriaId` en store.
- **Backend:** `HojaPatch` ampliado (contenido, categoria_id, tipo); `GET /hojas?q=&tipo=&categoria_id=` búsqueda server-side; `GET /hojas/recientes?limit=`; `PATCH /categorias/{id}` (renombrar, padre_id, icono); `DELETE /categorias/{id}` con 409 si tiene hojas (`?forzar=true` para forzar); índices SQLite `(categoria_id)`, `(fecha DESC)`, `(tipo)`; DELETE archivo al borrar hoja foto; `actualizar_hoja()` genérica en `crud.py`.
- **CSS:** placeholder TipTap y links en `index.css`.

---

## 8. Mapa de archivos

```
project/
├── app/main.py              # Rutas /categorias, /hojas, /upload, /preview
├── app/models/hoja.py       # HojaCreate, HojaPatch
├── app/db/crud.py           # crear_hoja, obtener_hojas, buscar_hojas, …
├── app/db/database.py       # Schema + migraciones categorias/hojas
├── mybot/
│   ├── bot.py               # Handlers Bóveda + dispatcher callbacks
│   ├── rapido.json          # Modo rápido (generado en runtime)
│   └── chat_id.json         # chat_id persistido (generado en runtime)
├── uploads/                 # Imágenes subidas
└── frontend/src/
    ├── screens/BrowseScreen.jsx, DetailScreen.jsx, CaptureScreen.jsx
    ├── components/
    │   ├── LeftPanel.jsx, RightPanel.jsx, NetworkGraph.jsx
    │   ├── CaptureModal.jsx, CategoryPicker.jsx, TopBar.jsx
    │   ├── TweaksPanel.jsx, LinkPreview.jsx, ScrollArea.jsx, FAB.jsx
    ├── store/useStore.js
    └── utils/detectType.js, tags.js, leafIcons.js
```

---

## 9. Preguntas abiertas (bloquean arquitectura)

1. ¿Bóveda **solo un usuario** o categorías compartidas algún día?
2. ¿Tags solo en texto o también **taxonomía formal** (tabla `tags`)?
3. ¿El bot debe **editar** hojas o solo crear?
4. ¿Recordatorios de hoja son **imprescindibles** o basta integrar con Agenda?
5. ¿Export **Markdown/ZIP** es requisito o copia NAS del `.db` alcanza?

---

*Actualizar este archivo cuando se complete algo del roadmap. Referencia de pendientes: `Boveda-Roadmap.md`.*
