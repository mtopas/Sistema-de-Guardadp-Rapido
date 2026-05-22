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
- **Offline:** Bóveda **no** tiene update optimista en `crearHoja`/`fetchHojas`; si falla la API, el modal muestra error y no persiste localmente (a diferencia de Finanzas/Agenda/Hábitos).

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
| `lugar` | TEXT | En schema; poco usado en UI |
| `latitud`, `longitud` | REAL | En schema; poco usado en UI |
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
| DELETE | `/categorias/{id}` | Borra categoría (sin validar hojas huérfanas) |
| GET | `/hojas` | Todas con `categoria_nombre` |
| GET | `/hojas/{id}` | Una hoja |
| POST | `/hojas` | Crear; si `tipo=link`, fetch OG preview en servidor |
| PATCH | `/hojas/{id}` | Solo `{ apuntes }` o `{ icono }` (`HojaPatch`) |
| DELETE | `/hojas/{id}` | Eliminar |
| POST | `/hojas/{id}/preview` | Refrescar link preview |
| POST | `/upload` | Multipart → `{ url: "/uploads/..." }` |
| GET | `/preview?url=` | Preview sin guardar hoja |

`HojaPatch` **solo** acepta `apuntes` e `icono` — no se puede cambiar categoría/contenido/tipo vía API hoy.

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
- Controles zoom: **decorativos**, sin lógica real.
- **Sin clicks en nodos** — no abre `RightPanel`.
- `utils/parseGraph.js` existe pero **no se usa** (vestigio D3).

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

## 6. Bot de Telegram

### Flujo actual

1. **Texto libre** → draft → menú numérico de categorías (+ "Crear categoría").
2. **Foto** → sube a `/upload` → pide título → menú de categorías → guarda `tipo=foto`.
3. **Links:** no hay detección automática de URL desde el bot; todo texto va como `tipo=texto`.
4. **Prefijos rápidos:** `t:` crea tarea en Agenda, `e:` crea evento en Agenda.

### Limitaciones actuales

| Tema | Estado |
|------|--------|
| Links como `tipo=link` | No; bot no llama `detectType` |
| Subcategorías | No (lista plana) |
| Editar / borrar hojas | No |
| Recordatorios | No |
| `/cancel` | Implementado en `cmd_cancel` de `bot.py` |
| Auth / multi-usuario | Token del bot = un usuario implícito |

---

## 7. Estado implementado (mayo 2026)

- Grafo radial conectado a BD, árbol izquierdo, panel derecho con TipTap.
- Barra superior ClaudeDesign, modal captura, autodetect tipo, `Ctrl+Enter` guardar.
- 6 temas + tonos + 6 pares tipográficos; Tweaks `Ctrl+M`.
- Tags en UI y cross-links en grafo.
- Link preview server-side al crear link.
- Bot: texto + foto + crear categoría + elegir por número + `/cancel` + prefijos rápidos `t:`/`e:`.
- Campos BD para recordatorio y geo (parcialmente preparados).

---

## 8. Mapa de archivos

```
project/
├── app/main.py              # Rutas /categorias, /hojas, /upload, /preview
├── app/models/hoja.py       # HojaCreate, HojaPatch
├── app/db/crud.py           # crear_hoja, obtener_hojas, …
├── app/db/database.py       # Schema + migraciones categorias/hojas
├── mybot/bot.py             # Captura Telegram → API
├── uploads/                 # Imágenes subidas
└── frontend/src/
    ├── screens/BrowseScreen.jsx, DetailScreen.jsx, CaptureScreen.jsx
    ├── components/
    │   ├── LeftPanel.jsx, RightPanel.jsx, NetworkGraph.jsx
    │   ├── CaptureModal.jsx, CategoryPicker.jsx, TopBar.jsx
    │   ├── TweaksPanel.jsx, LinkPreview.jsx, ScrollArea.jsx, FAB.jsx
    ├── store/useStore.js
    └── utils/detectType.js, tags.js, parseGraph.js (no usado), leafIcons.js
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
