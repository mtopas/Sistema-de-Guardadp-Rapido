# Bóveda — documentación y hoja de ruta

Referencia técnica y de producto para el módulo **Bóveda** de SGR. Complementa `../Prompt.md` (spec visual migrada desde ClaudeDesign), `README.md` (estado global del repo) y `../Objetivo-Final.md` (visión a largo plazo).

**Última revisión del código:** mayo 2026.

---

## 1. Qué es Bóveda

**Bóveda** es el módulo de **captura y archivo de conocimiento personal**: guardar ideas, links y fotos en un **árbol de categorías**, explorarlos en un **grafo radial** (desktop) o **lista** (mobile), y ampliarlos con **apuntes** enriquecidos (TipTap).

| Rol | Dónde |
|-----|--------|
| Captura rápida | Modal flotante (`CaptureModal`), bot Telegram, PWA share target → `/capture` |
| Exploración densa | `/` — `BrowseScreen` (3 paneles + grafo) |
| Lectura/edición profunda | `/hoja/:id` — `DetailScreen` (sidebar Bóveda visible) |
| Ajustes globales | `/settings` (tema, idioma, nombre; no específico de Bóveda) |

**Filosofía del ecosistema:** la PC/navegador es el lugar de **configuración y vistas densas**; el **bot Telegram** es el **atajo de captura** cuando no estás en el teclado. Hoy el bot **solo escribe en Bóveda** (Finanzas/Agenda/Hábitos en el modal de captura están deshabilitados).

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

mybot/bot.py ── requests ──► mismos endpoints /categorias, /hojas, /upload
```

- **Un solo store:** `frontend/src/store/useStore.js` (Bóveda + Finanzas + Agenda + Hábitos).
- **Sin capa de servicios:** rutas en `app/main.py`, SQL en `app/db/crud.py`.
- **Offline:** Bóveda **no** tiene update optimista en `crearHoja`/`fetchHojas` como Finanzas/Agenda/Hábitos; si falla el API, el modal muestra error y no persiste localmente (deuda conocida).

### Rutas frontend

| Ruta | Pantalla | Layout |
|------|----------|--------|
| `/` | `BrowseScreen` | Full-screen, sin sidebar Bóveda |
| `/hoja/:id` | `DetailScreen` | Con `Sidebar` |
| `/capture` | `CaptureScreen` (legacy) | Con sidebar; PWA share target |
| `/settings` | `SettingsScreen` | Con sidebar |

`Layout.jsx` trata `/`, `/finanzas`, `/agenda`, `/habitos` como módulos que **gestionan su propio layout** y ocultan el sidebar clásico.

### Acento visual (tema Arcoíris)

En ruta `/` (y subrutas Bóveda): `--accent: #7c3aed` (violeta). Definido en `Layout.jsx` → `ARCOIRIS_ACCENTS`.

---

## 3. Modelo de datos (SQLite)

Tablas en `app/db/database.py` (mismo `app.db` que el resto del sistema).

### `categorias`

| Columna | Tipo | Notas |
|---------|------|--------|
| `id` | INTEGER PK | |
| `nombre` | TEXT UNIQUE | No puede repetirse a nivel global |
| `padre_id` | INTEGER FK → categorias | `NULL` = raíz del árbol |
| `icono` | TEXT | Emoji opcional (UI: prefijo en nombre) |

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
| `fecha_recordatorio` | TEXT | **Persistido en BD; UI de captura deshabilitada** |
| `icono` | TEXT | Override visual (`leafIcons.js`) |
| `fecha_actualizado` | TEXT | Se actualiza al PATCH apuntes/icono |
| `link_preview` | TEXT JSON | og:title, image, etc. (links) |

**Reglas implícitas:**

- Los **tags** (`#algo`) no tienen tabla: se extraen del `contenido` + `apuntes` con regex (`utils/tags.js`).
- Subcategorías: las hojas viven en la categoría elegida; el grafo **agrupa hojas bajo la categoría raíz** del árbol.
- Fotos: `contenido` suele ser URL de `/uploads/...`; `apuntes` puede llevar `<img>` (patrón del bot).

---

## 4. API REST (Bóveda)

Prefijos sin namespace (`/categorias`, `/hojas`, no `/boveda/*`).

| Método | Ruta | Uso |
|--------|------|-----|
| GET | `/categorias` | Lista árbol plano `{ id, nombre, padre_id, icono }` |
| POST | `/categorias` | `{ nombre, padre_id?, icono? }` |
| DELETE | `/categorias/{id}` | Borra categoría (sin validar hojas huérfanas en front) |
| GET | `/hojas` | Todas las hojas con `categoria_nombre` |
| GET | `/hojas/{id}` | Una hoja |
| POST | `/hojas` | Crear; si `tipo=link`, fetch OG preview en servidor |
| PATCH | `/hojas/{id}` | Solo `{ apuntes }` o `{ icono }` (`HojaPatch`) |
| DELETE | `/hojas/{id}` | Eliminar |
| POST | `/hojas/{id}/preview` | Refrescar link preview |
| POST | `/upload` | Multipart → `{ url: "/uploads/..." }` |
| GET | `/preview?url=` | Preview sin guardar hoja |

**Pydantic:** `app/models/hoja.py` — `HojaCreate` incluye `fecha_recordatorio`, geo, etc.; `HojaPatch` **solo** apuntes e icono (no se puede cambiar categoría/contenido/tipo vía API hoy).

---

## 5. Frontend — piezas clave

### 5.1 `BrowseScreen.jsx`

- **Desktop:** `TopBar` + área central con `NetworkGraph` (entre márgenes 300px / 425px) + `LeftPanel` + `RightPanel` flotantes.
- **Mobile:** `MobileList` agrupada por categoría; navega a `/hoja/:id`.
- Estado local: `openHojaId`, `searchQuery` (compartido con TopBar).

### 5.2 `LeftPanel.jsx`

- Árbol de categorías raíz → subcategorías → `NoteCard` por hoja.
- Colores por rama: `BRANCH_COLORS` en `themes.js`.
- Búsqueda: filtra hojas por `contenido` y `categoria_nombre` (no busca en apuntes ni tags).
- Panel expandible 300px → 50vw.

### 5.3 `NetworkGraph.jsx`

- Grafo **estático SVG** (no D3 force): hub central “SGR”, ramas = categorías raíz, hojas = leaves (máx. **14 por rama**).
- Formas: círculo = texto, cuadrado rotado = link, rect redondeado = foto.
- **Cross-links** punteados entre hojas que comparten `#tag`.
- Controles zoom: **decorativos**, sin lógica.
- **Sin clicks** en nodos hoy → no abre `RightPanel`.

> Existe `utils/parseGraph.js` (modelo root/cat/tag/hoja para D3) **no usado** por el grafo actual; es vestigio/alternativa.

### 5.4 `RightPanel.jsx`

- Vista **latest**: lista de hojas recientes.
- Vista **note**: TipTap en apuntes, autosave con debounce, picker de icono, `LinkPreview` si link.
- Abre vía `openHojaId` desde LeftPanel.
- PATCH: `updateApuntes`, `updateIcono` en store.

### 5.5 `CaptureModal.jsx`

- Tabs Bóveda / Finanzas / Agenda / Hábitos — **solo Bóveda habilitada**.
- Autodetect tipo: `detectType.js` (URL http(s) → link; resto texto).
- `CategoryPicker`: buscar, elegir, **crear categoría inline**.
- Recordatorio: UI visible, **disabled** (“Próximamente”).
- Atajos: `Escape` cierra, `Ctrl/Cmd+Enter` guarda.
- Subida foto: `POST /upload` + `tipo=foto`.

### 5.6 `DetailScreen.jsx`

- Ruta dedicada mobile/legacy: edición apuntes, borrar hoja (doble confirmación), tags, preview link.
- No edita `contenido`, categoría ni recordatorio en UI.

### 5.7 `TopBar.jsx` (solo en `/`)

- Título del módulo: **click** = siguiente módulo, **click derecho** = módulo anterior (ya usa `onContextMenu`).
- Búsqueda global del browse (prop `searchQuery`).
- Badge en campana de notificaciones (**sin handler**).
- CTA **+ Captura** → `openCapture`.
- Hint visual `Ctrl+M` en la barra de búsqueda (abre Tweaks, no captura).

### 5.8 Store (`useStore.js` — slice Bóveda)

| Acción | Comportamiento |
|--------|----------------|
| `fetchCategorias` / `fetchHojas` | GET; error → log, sin mock fallback |
| `crearCategoria` | POST + refetch categorías |
| `crearHoja` | POST + refetch hojas |
| `eliminarHoja` | DELETE + filtro local optimista |
| `updateApuntes` / `updateIcono` | PATCH + merge en `hojas` |
| `openCapture` / `closeCapture` | Modal |

**No implementado en store:** mover hoja de categoría, editar contenido, recordatorios, búsqueda full-text server-side.

### 5.9 Otros

- **`CategoryPicker`:** creación rápida de categoría (raíz, sin `padre_id` desde UI).
- **`FAB` (mobile):** toggle `CaptureModal` en rutas con sidebar.
- **`TweaksPanel`:** global, `Ctrl+M` — solo temas/tono/tipografía (ver §8).
- **PWA:** `vite.config.js` share_target → `/capture?text=&url=` (pantalla legacy, no el modal).

**Análisis visual, rendimiento, accesibilidad y backlog de UI:** ver **§17 Frontend**.

---

## 6. Bot de Telegram (`mybot/bot.py`)

### Flujo actual

1. **Texto libre** → guarda draft → menú numérico de categorías (+ opción “Crear categoría”).
2. **Foto** → sube a `/upload` → pide título → menú de categorías → guarda `tipo=foto` con `<img>` en `apuntes`.
3. **Links:** no hay detección automática de URL; todo texto va como `tipo=texto` salvo que el usuario copie solo la URL y el backend no reclasifique (el bot no llama `detectType`).

### Limitaciones

| Tema | Estado |
|------|--------|
| Editar / borrar hojas | No |
| Elegir subcategoría | No (lista plana) |
| Recordatorios | No |
| Links con preview | No (`tipo=texto` desde bot) |
| Cancelar conversación | Mensaje “completá primero”; no hay `/cancel` |
| Finanzas / Agenda / Hábitos | No |
| Notificaciones push | No |
| Auth / multi-usuario | Token del bot = un usuario implícito |

### Variables

- `TELEGRAM_BOT_TOKEN` — `.env`
- `API_BASE_URL` — default `http://127.0.0.1:8000` (Docker: `http://backend:8000`)

---

## 7. Estado: hecho vs pendiente

### Hecho (según `README.md` + código)

- Grafo radial conectado a BD, árbol izquierdo, panel derecho con TipTap.
- Barra superior ClaudeDesign, modal captura, autodetect tipo, Ctrl+Enter guardar.
- 6 temas + tonos + 6 pares tipográficos; Tweaks `Ctrl+M`.
- Tags en UI y cross-links en grafo.
- Link preview server-side al crear link.
- Bot: texto + foto + crear categoría + elegir categoría por número.
- Campos BD para recordatorio y geo (parcialmente preparados).

### Pendiente / deuda explícita

- Recordatorio en UI y pipeline de notificación.
- Bot: links como `tipo=link`, editar, cancelar, subcategorías.
- Grafo: click en nodo, zoom real, >14 hojas por rama (paginación o cluster).
- PATCH ampliado (contenido, `categoria_id`, `fecha_recordatorio`).
- Gestión de categorías en UI (renombrar, mover, borrar con confirmación, emoji).
- Búsqueda en apuntes/tags; filtros por tipo/fecha.
- Offline-first simétrico a otros módulos.
- Export / backup Bóveda.
- Integración con Finanzas/Agenda/Hábitos (enlaces cruzados).
- Tests automatizados.
- Notificaciones TopBar (campana decorativa).

---

## 8. Ctrl+M contextual (hoy vs propuesta)

### Hoy

`TweaksPanel.jsx` escucha **globalmente** `Ctrl/Cmd+M` y alterna un panel de **Tema / Tono / Tipografía**. Es el mismo en Bóveda, Finanzas, Agenda y Hábitos. La barra de búsqueda de Bóveda muestra el hint `Ctrl+M` pero **no** abre captura.

**Conflicto de expectativas:** el usuario puede pensar que `Ctrl+M` es “menú contextual del módulo”, pero es solo apariencia global.

### Propuesta: “Command palette” por módulo

Mantener **un solo atajo global** `Ctrl+M`, pero el contenido del panel depende de `location.pathname` (o `currentModule` como en `TopBar`).

#### En Bóveda (`/`, `/hoja/*`)

| Sección | Acciones sugeridas |
|---------|-------------------|
| **Captura** | Nueva hoja (abrir `CaptureModal`), pegar URL del portapapeles, subir imagen |
| **Navegación** | Ir a categoría…, filtrar por tag `#`, abrir última hoja editada |
| **Vista** | Expandir panel izquierdo, toggle “solo links”, densidad lista |
| **Apariencia** | (actual) tema, tono, fuentes — pestaña o acordeón “Apariencia” |
| **Atajos** | Lista visible: `Ctrl+Enter` guardar captura, `Ctrl+K` búsqueda (si se implementa) |

#### En Finanzas

- Mes anterior/siguiente, nuevo movimiento, ir a tab FIRE/Ahorro, dólar manual.

#### En Agenda

- Nuevo evento, ir a HOY, toggle facultad.

#### En Hábitos

- Nuevo hábito, marcar hábito X hoy (si hay selección).

### Implementación sugerida (mínima)

1. Extraer `TweaksPanel` → `CommandPanel` con prop `mode` derivado de ruta.
2. Registrar atajos secundarios **solo cuando el panel está abierto** (evitar robar `M` a otros inputs).
3. Opcional: renombrar hint en TopBar según módulo (“`Ctrl+M` comandos” vs “`Ctrl+M` tweaks”).
4. **Bóveda:** segunda tecla rápida sin panel — p.ej. `Ctrl+Shift+C` = captura (estándar en apps de notes).

---

## 9. Click derecho en Bóveda

### Uso actual en el proyecto

- `TopBar`: click derecho en título → **módulo anterior** (patrón ya implementado).
- **No hay** `onContextMenu` en LeftPanel, NetworkGraph, RightPanel ni NoteCard.

### Propuesta: menú contextual por superficie

Implementar un componente `ContextMenu` (portal, posición x/y, cierre al click fuera / Escape) y menús distintos:

#### Árbol (`LeftPanel`) — categoría

- Nueva subcategoría
- Renombrar / cambiar emoji
- Nueva hoja aquí (abre captura con categoría preseleccionada)
- Expandir / contraer todo
- Color de rama (si se expone en BD)
- Eliminar categoría (con aviso si tiene hojas)

#### Árbol — hoja (`NoteCard`)

- Abrir en panel derecho / pantalla completa
- Copiar contenido / copiar URL si link
- Mover a categoría…
- Cambiar icono
- Añadir recordatorio…
- Eliminar

#### Grafo (`NetworkGraph`)

- Click derecho en **rama** → filtrar panel izquierdo a esa categoría; nueva hoja en rama.
- Click derecho en **hoja** → mismas acciones que NoteCard.
- Click derecho en **hub** → nueva captura, centrar vista (cuando haya zoom).

#### Panel derecho — nota abierta

- Duplicar hoja
- Exportar apuntes (Markdown)
- Abrir link en navegador
- Historial de `fecha_actualizado` (si se guarda en futuro)

#### Configuración avanzada (power user)

- Archivo `boveda-context-actions.json` o sección en Settings para **reordenar/ocultar** acciones (inspiración: VS Code / Obsidian).
- Persistir en `localStorage` clave `sgr-boveda-context-menu`.

### Atajos desde menú contextual

Mostrar a la derecha del ítem: `Del`, `Ctrl+D`, etc., y reutilizar las mismas funciones que el Command panel (`Ctrl+M`).

---

## 10. Notificaciones y Bóveda

### Estado actual

- Campana en `TopBar` con **badge fijo**; **sin lista ni API**.
- `fecha_recordatorio` en BD; captura muestra “Sin recordatorio” deshabilitado.
- No hay worker/cron en backend ni integración con Telegram para pings de hojas.

### Modelo conceptual (distinto de Agenda/Hábitos)

| Tipo | Origen | Ejemplo |
|------|--------|---------|
| **Recordatorio de hoja** | `hojas.fecha_recordatorio` | “Revisar este paper el viernes” |
| **Inbox / revisión** | Derivado | “12 hojas sin apuntes”, “5 links sin abrir hace 30 días” |
| **Sistema** | App | Backup fallido, bot no alcanza API |

Agenda y Hábitos ya tienen lógica de “qué toca hoy”; Bóveda sería más **asíncrona y opcional** (no todo el mundo quiere pings por cada nota).

### Pipeline propuesto

```
1. UI captura/edición → PATCH fecha_recordatorio (ISO + timezone usuario)
2. Backend: tabla opcional notificaciones_pendientes (hoja_id, fire_at, canal: web|telegram|ambos, enviado)
3. Scheduler: script cron o asyncio en lifespan (cada 1 min) → SELECT due → dispatch
4. Telegram: bot.send_message(chat_id, texto + inline “Abrir” URL web /hoja/id)
5. Web: campana lee GET /notificaciones?unread=1 → marca leídas
```

### UX en campana (Bóveda)

- Agrupar: **Hoy**, **Esta semana**, **Archivo**.
- Item: icono tipo hoja + título truncado + categoría + acción “Posponer 1 día”.
- Click → abre `RightPanel` o `/hoja/:id` y marca leída.

### Telegram como canal de notificación

- Reutilizar el mismo bot de captura para **recordatorios salientes** (no solo entrante).
- Requiere guardar `telegram_chat_id` en config (tabla `user_settings` o `.env` fijo para single-user).
- Inline keyboard: ✅ Hecho (archivar) · 🕐 Posponer · 📖 Abrir en web

### Sin servidor 24/7 (HomeLab)

Alternativas si no querés proceso siempre activo:

- **Notificaciones solo con app abierta** (Web Notifications API + `setInterval` en front).
- **Recordatorios solo por Telegram** cuando el bot corre en Docker siempre.
- **Export ICS** de recordatorios de hojas → calendario del SO.

---

## 11. Optimizar funcionamiento con el Bot

### Quick wins (bajo esfuerzo)

1. **Detectar URL** en texto del bot → `tipo=link` (misma regex que backend).
2. **Comando `/cancel`** o palabra `cancelar` → `user_data.clear()`.
3. **Comando `/categorias`** → listar sin crear draft.
4. **Inline keyboards** en lugar de “respondé con el número” (menos fricción, más móvil).
5. **Categoría por defecto** configurable (`fin_config`-style en `boveda_config` o env `DEFAULT_CATEGORIA_ID`).
6. **Forward de mensaje** → extraer texto/URL de forward (Telegram API).

### Flujo “captura en un paso” (modo rápido)

- Si el usuario envía texto y tiene **una sola categoría favorita** (o la última usada en `user_data['last_cat_id']`), guardar **sin menú**.
- Comando `/rapido on|off`.

### Subcategorías en bot

- Menú en dos pasos: primero raíces, luego hijos (o solo categorías con `padre_id IS NULL` + “Ver más…”).

### Edición y consulta

| Comando | Acción |
|---------|--------|
| `/ultimas` | 5 últimas hojas con botones inline |
| `/buscar palabra` | `GET /hojas` filtrado en bot (límite 10) |
| `/mover 123 2` | PATCH futuro `categoria_id` |
| `/nota 123 texto` | append a apuntes |

### Robustez

- Reintentos en `requests` si API levanta después del bot.
- Healthcheck al inicio: si `/categorias` falla, avisar una vez.
- Rate limit suave (Telegram ya limita; evitar refetch categorías en cada mensaje — **cachear** con TTL 60s).

### Paridad con web

- Enviar **ubicación** Telegram → rellenar `lugar` + lat/long en `POST /hojas`.
- Enviar **documento** PDF → guardar en uploads + `tipo=texto` + link en apuntes (requiere ampliar tipos o convención).

### Bot multi-módulo (visión `Objetivo-Final.md`)

Menú principal: `Bóveda | Finanzas | Agenda | Hábitos` con sub-flujos. Hoy solo Bóveda está cableado; Finanzas podría reutilizar `MovementModal` fields vía mensaje guiado (esfuerzo grande; v1 = seguir web para Finanzas).

---

## 12. Mejoras de backend

### API / CRUD

| Mejora | Motivo |
|--------|--------|
| `HojaPatch` ampliado: `contenido`, `categoria_id`, `tipo`, `fecha_recordatorio`, geo | Edición completa sin recrear hoja |
| `GET /hojas?q=&tipo=&categoria_id=&tag=` | Búsqueda y filtros server-side |
| `GET /hojas/recientes?limit=20` | Panel derecho y bot `/ultimas` |
| `PATCH /categorias/{id}` | Renombrar, mover `padre_id`, `icono` |
| Validar DELETE categoría | 409 si tiene hojas o reasignar |
| Índices SQLite | `(categoria_id)`, `(fecha DESC)`, FTS5 en contenido+apuntes |
| Paginación | `GET /hojas?offset=&limit=` para escalar |
| Webhook Telegram | Alternativa a polling; mismo handler |

### Link preview

- Cache por URL (tabla `link_preview_cache`) para no golpear sitios.
- Timeout configurable; User-Agent explícito.
- Fallback si OG falla (título = hostname).

### Uploads

- Validar MIME, tamaño máximo, renombrar con UUID (ya parcial).
- Endpoint DELETE archivo huérfano al borrar hoja foto.
- Opcional: thumbnails para grafo/lista.

### Recordatorios y notificaciones

- Tabla `notificaciones` + endpoint CRUD.
- `GET /notificaciones/pendientes` para cron externo (compatible HomeLab sin worker embebido).

### Seguridad / operación

- Auth token único para API si se expone fuera de LAN.
- Backup: `POST /admin/export/boveda` → JSON/ZIP (categorías + hojas + uploads refs).

### Separación de BD (futuro `Objetivo-Final.md`)

- `boveda.db` separado implica cambiar `get_connection()` por módulo; sin FK cruzados a Finanzas. Solo tiene sentido con capa de “enlaces” explícita entre módulos.

---

## 13. Otras ideas de producto y UX

### Cuadro apuntes flotante en otras páginas

Podemos poner que cuando se abra un link de una nota, se abra el link pero con un cuadro flotante para que se tomen apuntes? Un cuadro que no se vaya si aprieto algo en el link que se abrió. Como para ver un vídeo y tomar apuntes o cosas así.
Tal vez es más fácil dentro de la página un contender donde se pueda abrir la pagina, el video y así poder tomar apuntes.

### Grafo

- Hacer nodos **clicables** → `setOpenHojaId`.
- **Hover** tooltip con título + fecha.
- Modo “solo esta rama” al click en categoría.
- Segundo layout: grafo por **tags** (clusters) toggle en TopBar.
- Performance: virtualizar leaves; WebGL si >500 nodos.

### Tags

- Autocompletar `#` en TipTap.
- Panel “Todos los tags” en LeftPanel o Command palette.
- Tag como filtro global en búsqueda TopBar.

### Captura

- Habilitar tabs Finanzas/Agenda/Hábitos cuando los modales estén listos (ya está el shell en `CaptureModal`).
- Recordatorio: date picker + hora + “avisar por Telegram sí/no”.
- **Plantillas** de captura (“Reunión”, “Artículo”) → prefijan categoría + icono.

### Mobile / PWA

- Share target debería abrir **`CaptureModal`** con query params prellenados, no solo `/capture` legacy.
- Grafo opcional simplificado en tablet.

### Integración entre módulos

- En apuntes: enlace interno `[[hoja:42]]` o “vincular movimiento Agenda #id” (tabla `enlaces` genérica).
- Desde movimiento Finanzas: nota con link a hoja de recibo (foto).

### Calidad de vida

- **Papelera** (soft delete) antes de DELETE definitivo.
- Duplicar hoja.
- Arrastrar hoja entre categorías (DnD en árbol).
- Historial de versiones de apuntes (tabla `hojas_revisiones`).

### Observabilidad

- Métricas locales: hojas/semana, categoría más usada, ratio link vs texto (dashboard opcional en Bóveda).

---

## 17. Frontend — análisis, mejoras y optimizaciones

Análisis del código en `project/frontend/src/` aplicado solo al módulo Bóveda. Objetivo: mantener la estética **ClaudeDesign / editorial-vault** (paneles flotantes, grafo radial, violeta Arcoíris) y llevarla a **producción densa** sin caer en patrones genéricos desconectados del resto de SGR.

---

### 17.1 Dirección estética (design intent)

| Dimensión | Estado actual | Dirección recomendada |
|-----------|---------------|------------------------|
| **Tono** | Oscuro “disco/vault”, glassmorphism en paneles, serif en títulos | Reforzar **archivo personal premium**: pergamino digital, no dashboard SaaS. La Bóveda debe sentirse como **cámara de resonancia** del conocimiento, no lista de tareas. |
| **Color** | `BRANCH_COLORS` por categoría raíz; acento módulo violeta | Mantener ramas de color; añadir **leve grain/noise** solo en zona del grafo (CSS `background-image` + `mix-blend-mode`) para profundidad sin competir con Finanzas (ámbar) o Hábitos (verde). |
| **Tipografía** | `FONT_PAIRS` globales; títulos en RightPanel con `--font-serif` | En Bóveda: títulos de hoja más grandes en panel expandido; **mono** solo en fechas/contadores (`relativeDate`, contador de hojas en grafo). |
| **Motion** | `animate-fade` / `animate-in` 150ms; hover en cards | Priorizar **una** entrada al abrir nota (panel derecho slide + fade 220ms); **stagger** al expandir categoría en árbol (`animation-delay` por `NoteCard`). Evitar micro-bounces en cada hover. |
| **Diferenciador** | Grafo radial único en el producto | Hacer el grafo **interactivo y memorable**: hover con pulse en rama, click con “focus ring” radial, cross-links de tags más visibles al hover de un tag en LeftPanel. |

**Anti-patrones a evitar en Bóveda:** layout tipo Notion de 3 columnas iguales; cards blancas con sombra gris; fuente Inter/Roboto solo en este módulo; gradientes violeta→rosa en fondo completo (ya cubierto por `body::before` global).

---

### 17.2 Arquitectura de layout

```
┌─────────────────────────────────────────────────────────────┐
│ TopBar (60px sticky, z-30) — búsqueda, CTA, campana         │
├──────────┬──────────────────────────────┬───────────────────┤
│ LeftPanel│   NetworkGraph (SVG)         │ RightPanel        │
│ 300px    │   left:300 right:425         │ 425px             │
│ z-20     │   (absolute inset)           │ z-20              │
│ expand→  │                              │ expand→ 50vw      │
│ 50vw     │                              │                   │
└──────────┴──────────────────────────────┴───────────────────┘
```

**Problemas detectados:**

| Problema | Detalle | Impacto |
|----------|---------|---------|
| **Márgenes fijos** | `BrowseScreen` usa `left: 300` y `right: 425` en px inline | Al expandir un panel, el grafo **no se reacomoda**; puede quedar descentrado o tapado. |
| **Dos rutas de detalle** | `RightPanel` (desktop) vs `/hoja/:id` `DetailScreen` (mobile/sidebar) | Duplicación TipTap, estilos y lógica de guardado; riesgo de divergencia. |
| **Sin breakpoint tablet** | `md:` solo separa lista móvil vs desktop completo | Tablets en landscape muestran grafo + paneles estrechos. |
| **TopBar en mobile list** | `MobileList` no incluye `TopBar` | En `< md` no hay captura ni ciclo de módulos desde la misma barra (solo FAB en rutas con sidebar). |

**Mejoras de layout:**

1. **CSS variables de layout:** `--boveda-left-w`, `--boveda-right-w` actualizadas al expandir paneles; el contenedor del grafo usa `inset` con esas vars.
2. **Breakpoint `lg` (1024px):** grafo + un panel; `xl` (1280px): tres columnas.
3. **Unificar detalle:** `DetailScreen` como sheet full-screen en mobile; en desktop ≥1280px solo `RightPanel` (eliminar duplicación gradual).
4. **TopBar en mobile browse:** barra mínima con título + búsqueda + FAB captura aunque no haya sidebar.

---

### 17.3 Sistema de estilos (deuda técnica)

Bóveda mezcla **tres capas** de estilo:

| Capa | Ejemplos | Observación |
|------|----------|-------------|
| **Variables CSS** | `var(--surface)`, `color-mix(in oklch, …)` | Correcto; coherente con temas. |
| **Clases Tailwind `app-*`** | `LinkPreview`, `CategoryPicker` | Mapeadas en `tailwind.config`; bien para componentes compartidos. |
| **Estilos inline + handlers** | `onMouseEnter` → `style.background` en casi todos los botones | Repetitivo; difícil de mantener; **no** respeta `prefers-reduced-motion` centralizado. |

**Inconsistencias concretas:**

- **Scrollbars:** `LeftPanel` / `RightPanel` usan `ScrollArea` (thumb custom con gradiente animado). Finanzas usa `.panel-scroll` (nativo). Bóveda quedó **más pulida** en scroll; conviene **unificar** exportando `ScrollArea` a todos los paneles Bóveda o migrar Bóveda a `panel-scroll` por consistencia global (Prompt.md pidió scrollbars Finanzas como Bóveda — hoy es al revés en código).
- **`CaptureModal`:** mezcla `var(--*)` e inputs sin clase `app-*`; coherente visualmente pero distinto patrón que `MovementModal` (`panel-strong`, `anim-card-in`).
- **`NetworkGraph`:** leyenda y zoom con `panelStyle` inline; botones zoom **sin `onClick`** — frustración UX.
- **Tags en RightPanel:** chips sin `#` prefix en detalle (solo texto); en LeftPanel sí llevan `#` — unificar.

**Refactor sugerido (sin cambiar look):**

```
components/boveda/
  boveda-tokens.css      # opcional: --boveda-panel-blur, etc.
  ContextMenu.jsx
  useBovedaLayout.js     # anchos paneles + expand
  NoteCard.jsx           # compartido Left + Right list
  CategoryTree.jsx       # extraído de LeftPanel
```

---

### 17.4 Auditoría por componente

#### `BrowseScreen.jsx`

- **Hoy:** orquestador delgado; estado local `openHojaId`, `searchQuery`.
- **Falta:** sincronizar búsqueda con highlight en grafo/árbol; limpiar `openHojaId` al cambiar ruta; `useMemo` para `filteredHojas` compartido con LeftPanel (hoy se filtra dos veces).
- **Mobile `MobileList`:** buena agrupación por categoría; sin pull-to-refresh; sin swipe actions (archivar/borrar).

#### `TopBar.jsx` (contexto Bóveda)

- Búsqueda no tiene **atajo** `Ctrl+K` / `/` (solo muestra kbd `Ctrl+M` que abre Tweaks).
- Campana con `badge` hardcodeado — confunde (“hay notificaciones” cuando no las hay).
- **Mejora:** focus trap en búsqueda; resultados dropdown (hojas + categorías + tags); deshabilitar badge hasta implementar §10.

#### `LeftPanel.jsx`

- **Fortalezas:** árbol claro, tags on hover en `NoteCard`, colores de rama, expand 50vw.
- **Debilidades:**
  - Categorías **cerradas por defecto** — con muchas hojas, muchos clicks.
  - No hay DnD para reordenar/mover hojas.
  - `searchQuery` filtra hojas pero **no resalta** texto coincidente.
  - Crear categoría/hoja solo vía captura global, no desde panel.
- **Implementar:** botón “+ Hoja” en header del árbol; “expandir todo / colapsar todo”; estado persistido en `localStorage` (`sgr-boveda-tree-open`).

#### `NetworkGraph.jsx`

- **Fortalezas:** SVG ligero, sin D3; cross-links por tags; formas por tipo; leyenda.
- **Debilidades críticas:**
  - **Cero interactividad** (`pointer-events` implícitos en SVG sin handlers).
  - **Máx. 14 hojas por rama** — silencioso; el usuario no sabe que faltan nodos.
  - Sin pan/zoom real (controles decorativos).
  - Re-render completo del SVG cuando cambia `hojas` en store (aceptable hasta ~200 nodos).
  - Posiciones **determinísticas por índice** (`j * 37 % 50`) — no estable si cambia orden de API.
- **Optimización:** memoizar `buildGraph` (ya está en `useMemo`); extraer subcomponentes `BranchNode`, `LeafNode` con `React.memo`; para >100 leaves, canvas o “cluster +N”.
- **UX:** `cursor: pointer` en leaves; `onClick` → `onOpenHoja`; tooltip `<title>` o portal; aviso “+N más” en rama.

#### `RightPanel.jsx`

- **Fortalezas:** autosave 800ms debounced; manejo foto (`img` fuera de TipTap); breadcrumb; icon picker; `LinkPreview` integrado.
- **Debilidades:**
  - `useEditor` con dependencia `[view === 'note' ? selHoja?.id : null]` — correcto para remount, pero **parpadeo** al guardar si `fecha_actualizado` actualiza `hojas`.
  - Título y `contenido` **no editables** en panel (solo apuntes).
  - Breadcrumb **no clickeable** para cambiar categoría.
  - Sin indicador de “sin guardar” si falla red (solo toast).
  - `dangerouslySetInnerHTML` para foto — necesario pero sin sanitizar (contenido propio; riesgo bajo en single-user).
- **TipTap:** solo StarterKit + Underline — sin links clicables, blockquote, code, highlight, `#tag` autocomplete.

#### `CaptureModal.jsx`

- **Fortalezas:** mejor UX que `CaptureScreen`; tabs módulo; autodetect; preview link debounced 600ms; Ctrl+Enter.
- **Debilidades:**
  - Tabs deshabilitadas muestran toast “próximamente” — bien; podrían **ocultarse** hasta estar listas para reducir ruido.
  - `useEffect` de teclado con deps `[open, contenido, …]` — recrea listener cada tecla; usar ref para `handleSave`.
  - Sin **drag & drop** de imagen en el área de foto.
  - Recordatorio disabled sin explicación corta bajo el botón.
  - Al guardar, no pre-selecciona última categoría usada (`localStorage`).
- **Visual:** overlay `blur(8px)` + `panel-bg` — alineado con diseño; añadir `role="dialog"` + `aria-modal` + focus trap.

#### `DetailScreen.jsx`

- Pantalla “clásica” con sidebar; header con guardar manual vs autosave en RightPanel.
- **Duplicación** con RightPanel: extraer `HojaEditor` compartido.
- Mobile: bien para lectura larga; falta gestos (swipe back).

#### `CategoryPicker.jsx`

- Solo lista **plana** de categorías (no árbol padre/hijo en dropdown).
- Crear categoría siempre **raíz** (`padre_id` null) — limitación producto.
- Errores de `crearCategoria` tragados en `catch` vacío — debería `showToast`.

#### `LinkPreview.jsx`

- Doble fetch posible: backend al crear + front en modal si no hay cache.
- Skeleton `animate-pulse` genérico — podría usar shimmer con `var(--accent)`.
- Imágenes externas sin `loading="lazy"` en lista.

#### `ScrollArea.jsx`

- Implementación sólida (ResizeObserver + rAF).
- Thumb `pointer-events: none` — no se puede arrastrar (solo visual). Finanzas no lo necesita; Bóveda podría añadir drag en v2.

#### `TweaksPanel.jsx` (impacto en Bóveda)

- Panel global; en Bóveda el hint en TopBar sugiere que es “del módulo” pero cambia tema de **toda** la app — documentado en §8; en UI mostrar pestaña contextual (§8).

#### Componentes legacy / huérfanos

| Archivo | Estado |
|---------|--------|
| `parseGraph.js` | No usado por `NetworkGraph` — eliminar o usar para vista alternativa D3 |
| `DetailPanel.jsx` | No referenciado en rutas actuales — candidato a borrar |
| `CaptureScreen.jsx` | PWA + Sidebar; desincronizado del modal |

---

### 17.5 Rendimiento y datos en cliente

| Área | Comportamiento actual | Riesgo | Optimización |
|------|----------------------|--------|--------------|
| **Carga inicial** | `App.jsx` hace `fetchHojas()` + todas las finanzas/agenda/hábitos | Payload grande en cold start | `fetchHojas` lazy al entrar `/`; paginación server-side |
| **Store** | Cualquier cambio en `hojas` re-renderiza consumidores Zustand | Grafo + árbol + panel juntos | Selectores finos: `useStore(s => s.hojas, shallow)` o slice `boveda` |
| **Grafo SVG** | O(n) leaves + cross-links O(tags²) peor caso | Muchos tags compartidos → muchas líneas | Limitar cross-links visibles; toggle “mostrar enlaces” |
| **Búsqueda** | Filter en cada keystroke sobre array completo | OK <1000 hojas | `useDeferredValue(query)` + highlight async |
| **TipTap** | Instancia por hoja abierta | Memoria OK | Destruir editor al cerrar panel (`editor.destroy()`) — verificar leak |
| **Imágenes** | `uploads/` full size en modal y apuntes | Lento en 4G | Thumbnails + `srcset` en API |

**Offline-first (frontend):** patrón Finanzas: actualizar `hojas` en store antes del `fetch`, revertir en catch. Bóveda debería adoptarlo en `crearHoja`, `updateApuntes`, `eliminarHoja` para paridad.

---

### 17.6 Accesibilidad (a11y)

| Check | Estado |
|-------|--------|
| Contraste texto | Temas validados en Prompt (AAA títulos); chips pastel revisar |
| Focus visible | Muchos botones solo cambian color en hover, sin `:focus-visible` |
| Teclado en grafo | No navegable |
| Modales | `CaptureModal` sin focus trap; `TweaksPanel` tiene `role="dialog"` |
| Iconos decorativos | Lucide con tamaño fijo; faltan `aria-label` en varios icon-only (zoom grafo) |
| Reduced motion | No hay `@media (prefers-reduced-motion: reduce)` para animaciones |

**Mínimo viable:** `focus-visible: ring` con `--accent`; Escape cierra modales (parcialmente hecho); grafo: Enter abre hoja enfocada con roving tabindex en lista del árbol como alternativa.

---

### 17.7 Responsive y PWA

| Contexto | Experiencia |
|----------|-------------|
| **Desktop ≥1280px** | Experiencia diseñada (referencia ClaudeDesign) |
| **Tablet** | Grafo comprimido; paneles solapan |
| **Mobile `<md`** | Solo lista; pierde grafo e identidad visual fuerte |
| **PWA standalone** | `manifest` tema violeta; share → `/capture` legacy |
| **FAB** | Solo visible con sidebar (`Layout`); **no** en `/` mobile |

**Implementar:**

- Share target → abrir `CaptureModal` vía query `?text=` parseado en `App.jsx`.
- Opción “vista compacta” del grafo en tablet (solo hub + ramas, sin leaves).
- Instalar banner / ícono Bóveda coherente con `theme_color`.

---

### 17.8 TipTap y contenido rico

**Hoy:** negrita, cursiva, subrayado, H1, listas.

**Prioridad alta para Bóveda:**

1. **Extension Link** — URLs en apuntes clicables.
2. **Placeholder** — “Apuntes, #tags, ideas…”
3. **#tag highlight** — decoración inline (regex) sin tabla tags.
4. **Pegar URL** → card embed opcional (reutilizar `LinkPreview`).

**Prioridad media:** `TaskList`, `CodeBlock`, imágenes paste → upload.

**Prioridad baja:** colaboración, comentarios, markdown export desde editor.

---

### 17.9 Nuevos componentes UI recomendados

| Componente | Responsabilidad |
|------------|-----------------|
| `BovedaContextMenu` | Menú click derecho (§9); posición viewport, items por `targetType` |
| `CommandPalette` | Reemplazo/evolución de `TweaksPanel` en `/` (§8) |
| `SearchResultsPopover` | Dropdown desde TopBar: hojas, categorías, tags |
| `HojaEditor` | TipTap + header + preview link/foto compartido Right/Detail |
| `GraphTooltip` | Título, tipo, fecha, categoría |
| `EmptyState` | Ilustración ligera cuando `hojas.length === 0` + CTA captura |
| `ReminderPicker` | Cuando backend listo; sustituye botón disabled en CaptureModal |

---

### 17.10 Micro-interacciones y motion (propuesta)

Respetar `prefers-reduced-motion`. Duraciones sugeridas: 150ms UI chrome, 220ms paneles.

1. **Apertura `RightPanel` nota:** `transform: translateX(8px)` → `0` + opacity.
2. **Expand categoría en árbol:** `grid-template-rows: 0fr → 1fr` (CSS) en hijos.
3. **Guardado:** checkmark breve en header (ya `savedFlash`); añadir barra de progreso fina 800ms.
4. **Grafo:** al hover leaf, escalar 1.15 + glow `filter` (solo desktop).
5. **Nueva hoja en lista:** `anim-card-in` con `--i` (ya existe en `index.css` para Finanzas — reutilizar en `NoteCard`).

Evitar: parallax excesivo, Particles.js, blur >24px en móvil (GPU).

---

### 17.11 Integración con otros módulos (solo UI)

- **CaptureModal tabs:** cuando Finanzas/Agenda/Hábitos estén listos, **misma shell** — no duplicar modales.
- **TopBar CTA:** ya cambia por ruta; Bóveda mantiene “+ Captura”.
- **Tema Arcoíris:** violeta solo en `/` — no hardcodear `#7c3aed` en componentes Bóveda; siempre `var(--accent)`.

---

### 17.12 Backlog frontend priorizado

| ID | Tarea | Esfuerzo | Impacto |
|----|-------|----------|---------|
| F1 | Click + hover en nodos del grafo → abrir `RightPanel` | S | Alto |
| F2 | Variables CSS layout paneles + grafo reactivo al expand | M | Alto |
| F3 | `Ctrl+K` búsqueda con dropdown resultados | M | Alto |
| F4 | `BovedaContextMenu` en árbol y cards | M | Alto |
| F5 | Unificar scroll (`ScrollArea` o `panel-scroll`) en paneles Bóveda | S | Medio |
| F6 | Extraer `HojaEditor` (RightPanel + DetailScreen) | M | Medio |
| F7 | Focus trap + a11y modales Capture/Tweaks | S | Medio |
| F8 | TipTap Link + placeholder + tag styling | S | Medio |
| F9 | Última categoría en captura (`localStorage`) | S | Medio |
| F10 | Aviso “+N hojas” en rama del grafo | S | Medio |
| F11 | TopBar + captura en mobile `/` | S | Medio |
| F12 | Offline optimista en slice Bóveda del store | M | Alto |
| F13 | Share target → `CaptureModal` | S | Medio |
| F14 | Eliminar `parseGraph.js` / `DetailPanel` muertos | S | Bajo |
| F15 | Grafo: pan/zoom (d3-zoom o SVG viewBox) | L | Medio |
| F16 | Vista tag-cluster / toggle grafo | L | Medio |
| F17 | DnD hojas en árbol | L | Alto |
| F18 | Grain sutil en fondo grafo + stagger árbol | S | Bajo (delight) |

---

### 17.13 Criterios de “hecho” para pulido visual Bóveda

- [ ] Grafo usable sin tocar solo el árbol izquierdo.
- [ ] Un solo flujo de edición de apuntes en desktop (RightPanel).
- [ ] Búsqueda encuentra contenido en título y, en v2, apuntes.
- [ ] Click derecho con ≥4 acciones útiles en hoja y categoría.
- [ ] `Ctrl+M` o `Ctrl+K` documentados en UI coinciden con comportamiento.
- [ ] Mobile browse: captura + lista sin regresiones.
- [ ] Lighthouse a11y ≥90 en `/` (desktop).
- [ ] Sin regresión de temas (6 paletas + Arcoíris violeta).

---

## 14. Mapa de archivos (referencia rápida)

```
project/
├── app/main.py              # Rutas /categorias, /hojas, /upload, /preview
├── app/models/hoja.py       # HojaCreate, HojaPatch
├── app/db/crud.py           # crear_hoja, obtener_hojas, ...
├── app/db/database.py       # Schema + migraciones categorias/hojas
├── mybot/bot.py             # Captura Telegram → API
├── uploads/                 # Imágenes
├── frontend/src/
│   ├── screens/BrowseScreen.jsx, DetailScreen.jsx, CaptureScreen.jsx
│   ├── components/
│   │   ├── LeftPanel.jsx, RightPanel.jsx, NetworkGraph.jsx
│   │   ├── CaptureModal.jsx, CategoryPicker.jsx, TopBar.jsx
│   │   ├── TweaksPanel.jsx, LinkPreview.jsx, ScrollArea.jsx, FAB.jsx
│   │   ├── (futuro) boveda/ — ContextMenu, HojaEditor, useBovedaLayout
│   ├── store/useStore.js
│   └── utils/detectType.js, tags.js, parseGraph.js, leafIcons.js
└── Boveda.md                # Este archivo
```

---

## 15. Preguntas abiertas (de `Objetivo-Final.md`)

Respuestas pendientes del product owner; bloquean algunas decisiones de arquitectura:

1. ¿Bóveda **solo un usuario** o categorías compartidas algún día?
2. ¿Tags solo en texto o también **taxonomía** formal (tabla `tags`)?
3. ¿El bot debe **editar** hojas o solo crear?
4. ¿Recordatorios de hoja son **imprescindibles** o basta integrar con Agenda?
5. ¿Export **Markdown/ZIP** es requisito para backup o copia NAS del `.db` alcanza?

---

## 16. Priorización sugerida (si se implementa en sprints)

| Prioridad | Entrega | Impacto |
|-----------|---------|---------|
| P0 | **F1–F4** (§17): grafo clickable, layout vars, `Ctrl+K`, context menu | Exploración usable |
| P0 | `Ctrl+M` contextual en Bóveda (captura + apariencia) — §8 | Alinea expectativa del atajo |
| P1 | **F6, F8, F12** (§17): `HojaEditor`, TipTap links, offline store | Calidad edición |
| P1 | Bot: URL→link, `/cancel`, categoría favorita | Menos fricción móvil |
| P1 | PATCH hoja completo + mover categoría | Paridad web/bot |
| P1 | Recordatorio UI + campana (sin badge falso) — §10, **F7** | Notificaciones fase 1 |
| P2 | **F11, F13** mobile/PWA + Scheduler Telegram | Uso fuera del escritorio |
| P2 | FTS / búsqueda en apuntes | Escala contenido |
| P3 | **F15–F17** grafo avanzado, DnD, export cross-módulo | Ecosistema maduro |

---

*Documento generado para agentes y desarrollo local. Actualizar este archivo cuando cambien contratos de API o flujos principales de Bóveda.*
