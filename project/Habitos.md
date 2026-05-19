# Hábitos — documentación y hoja de ruta

Referencia técnica y de producto para el módulo **Hábitos** de SGR. Complementa `../Prompt.md` (spec visual, § Hábitos), `README.md` (estado global del repo) y `Boveda.md` (patrón de documentación por módulo).

**Última revisión del código:** mayo 2026.

---

## 1. Qué es Hábitos

**Hábitos** es el módulo de **seguimiento de comportamientos recurrentes**: definir hábitos con frecuencia (diaria o días específicos), marcar completaciones **totales** (1.0) o **parciales** (0.5), ver rachas y porcentajes, y reflexionar con heatmaps e historial.

| Rol | Dónde |
|-----|--------|
| Operación diaria | Tab **HOY** — grilla mensual + lista lateral con progreso del día |
| Análisis | Tab **Progreso** — heatmap, sparkline, momentum, tabla de stats |
| Retrospectiva | Tab **Historial** — calendario mensual coloreado por % del día |
| Configuración | `NuevoHabitoModal` — crear/editar (no es una tab) |
| Vista complementaria | **Agenda HOY** — hábitos con/sin hora (solo lectura + check rápido) |

**Filosofía del ecosistema:** la web es la **fuente de verdad** para definición, parcial/total, notas y estadísticas; el **bot Telegram** aún **no** escribe en Hábitos (solo Bóveda). Las notificaciones del TopBar son **decorativas** en todo el sistema.

**Accent Arcoíris** en `/habitos`: verde `#059669` (`Layout.jsx` → `ARCOIRIS_ACCENTS`).

---

## 2. Arquitectura

```
UI (React)                         API (FastAPI)              Persistencia
──────────                         ─────────────              ────────────
HabitosScreen ──┐
HoyTab          │
ProgresoTab     ├── useStore ── fetch ── main.py ── crud.py ── SQLite (app.db)
HistorialTab    │              /habitos/*
HabitosLeftPanel│
CompletarModal ─┘

Agenda HoyTab ── habitosUtils + upsertHabitoRegistro (mismo store)

mybot/bot.py ── (sin rutas /habitos hoy)
```

- **Un solo store:** `frontend/src/store/useStore.js` — slice `habitos` + `habitosRegistros`.
- **Sin capa de servicios:** rutas en `app/main.py`, SQL en `app/db/crud.py`.
- **Offline-first:** update optimista en CRUD de hábitos y upsert/delete de registros; si falla `fetch`, se mantiene el estado local.
- **Lógica de negocio en cliente:** rachas, % mensual, “¿toca hoy?” viven en `habitosUtils.js` (no hay columnas calculadas en BD).

### Rutas frontend

| Ruta | Pantalla | Layout |
|------|----------|--------|
| `/habitos` | `HabitosScreen` | 3 columnas: izq fijo / centro (tab) / der xl |

`Layout.jsx` oculta el sidebar clásico de Bóveda en `/habitos` (igual que Finanzas y Agenda).

### Tabs internas (estado local en `HabitosScreen`)

| Tab | Default | Panel central |
|-----|---------|---------------|
| `hoy` | **Sí** | Grilla mensual (`HoyTab`) |
| `progreso` | No | Resumen + heatmap + sparkline + tabla (`ProgresoTab`) |
| `historial` | No | Calendario mensual + filtro hábito (`HistorialTab`) |

El panel izquierdo (`HabitosLeftPanel`) y el derecho (`HabitosRightPanel`, solo `xl+`) se comparten entre tabs.

---

## 3. Modelo de datos (SQLite)

Tablas en `app/db/database.py` (mismo `app.db` que el resto del sistema).

### `habitos`

| Columna | Tipo | Notas |
|---------|------|--------|
| `id` | INTEGER PK | |
| `nombre` | TEXT NOT NULL | |
| `descripcion` | TEXT | Propósito; tooltip en grilla y panel derecho |
| `color` | TEXT | Hex; default seed `#7c3aed` |
| `categoria` | TEXT | **Libre** (texto); no hay tabla de categorías |
| `frecuencia_tipo` | TEXT | `diario` \| `semanal` |
| `dias_semana` | TEXT | JSON array de índices `0=Dom … 6=Sáb`; `NULL` si diario |
| `hora` | TEXT | `HH:MM` opcional; integra con Agenda HOY |
| `activo` | INTEGER | `1` activo; soft-disable vía PATCH `activo: false` (sin UI dedicada hoy) |
| `creado_en` | TEXT ISO | Límite inferior para `calcStreak` |

**Seed** (si tabla vacía): Meditar 10 min (diario, 08:00), Correr (lun/mié/vie, 07:00), Leer 30 min (diario, 22:00).

### `habitos_registros`

| Columna | Tipo | Notas |
|---------|------|--------|
| `id` | INTEGER PK | |
| `habito_id` | INTEGER FK | `ON DELETE CASCADE` |
| `fecha` | TEXT | `YYYY-MM-DD` |
| `valor` | REAL | `1.0` = total · `0.5` = parcial |
| `nota` | TEXT | Opcional |
| `creado_en` | TEXT ISO | |
| **UNIQUE** | `(habito_id, fecha)` | Upsert con `ON CONFLICT DO UPDATE` |

**Reglas implícitas (producto):**

- **Racha actual** (`calcStreak`): días **programados** consecutivos hacia atrás desde hoy con `valor > 0`. Días no programados se **saltan** (no rompen ni suman).
- **% del mes** (`calcMonthPct`): `suma(valores) / días_programados_hasta_hoy × 100`, redondeado.
- **Desmarcar** en UI de Hábitos: `DELETE` del registro (`CompletarModal` → “Desmarcar”). En Agenda HOY el toggle-off hace **upsert con `valor: 0`** (deuda — ver §7).

---

## 4. API REST

Prefijo `/habitos/*`. Modelos Pydantic inline en `app/main.py` (`HabitoCreate`, `HabitoPatch`, `HabitoRegistroUpsert`).

| Método | Ruta | Uso |
|--------|------|-----|
| GET | `/habitos` | Lista todos los hábitos (`ORDER BY id`) |
| POST | `/habitos` | Crear |
| PATCH | `/habitos/{id}` | Actualizar campos opcionales; `activo` bool → int en SQL |
| DELETE | `/habitos/{id}` | Borra hábito + registros (CASCADE) |
| GET | `/habitos/registros` | Query: `habito_id`, `fecha_desde`, `fecha_hasta` |
| PUT | `/habitos/{id}/registro` | Upsert body `{ fecha, valor, nota }` |
| DELETE | `/habitos/registros/{id}` | Eliminar un registro |

**No implementado en API:**

- Validación de `valor` ∈ `{0.5, 1.0}` (acepta cualquier float, p. ej. `0` desde Agenda).
- `GET /habitos/hoy` o agregados server-side (todo se calcula en front).
- Archivar vs eliminar; duplicar hábito; import/export.
- Webhooks / cola de notificaciones.

---

## 5. Frontend — piezas clave

### 5.1 `HabitosScreen.jsx`

- Estado local: `tab`, `selectedId`, `editingHabito`, `localModalOpen`.
- Modal unificado: `habitoModalOpen` (TopBar CTA) **o** `localModalOpen` (panel izq / Editar).
- Delega centro/derecha a cada tab; panel izquierdo siempre visible.

### 5.2 `HabitosLeftPanel.jsx`

- Lista hábitos **activos** con estado de hoy: hecho · parcial · pendiente · no toca.
- Racha ≥ 3 → icono 🔥 + número (`calcStreak`).
- Barra “X de Y completados hoy” (solo cuenta `valor > 0` en días programados).
- Botón **Nuevo** → `onNew()` → `NuevoHabitoModal`.

### 5.3 `HoyTab.jsx`

- Grilla mensual: **un solo** `overflow-x-auto` (fix vs ClaudeDesign).
- Columnas sticky: nombre (176px izq), % mes (72px der), celdas día 34px.
- Celdas futuras: no clicables; hoy con highlight `var(--accent)`.
- Click celda programada pasada/hoy → `CompletarModal` anclado al rect de la celda.
- Click nombre de fila → selecciona hábito (panel derecho).

### 5.4 `CompletarModal.jsx`

- Popup flotante (no modal full-screen): Total / Parcial + nota + Desmarcar.
- `upsertHabitoRegistro` / `deleteHabitoRegistro`.
- Cierra con click fuera o `Escape`.

### 5.5 `NuevoHabitoModal.jsx`

- Campos: nombre, descripción, color (palette `HABITO_COLORS`), categoría libre, frecuencia diario/semanal, días, hora.
- `addHabito` / `updateHabito` en store.
- Validación: nombre requerido; semanal requiere ≥1 día.

### 5.6 `ProgresoTab.jsx`

- Tarjetas: % esta semana, este mes, semana anterior.
- Mensaje **momentum** (`getMomentumMsg`) — heurística local, no LLM.
- Heatmap 84 días (% global del día).
- Sparkline SVG 6 meses.
- Tabla stats por hábito (racha, máx., % mes, % mes ant., tendencia ↑↓).
- **No implementado vs Prompt:** filtro por categoría; afirmaciones de identidad (“Meditaste X de 14 días…”).

### 5.7 `HistorialTab.jsx`

- Sub-panel izq: mes anterior/siguiente + filtro por hábito.
- Calendario 6×7: color por % cumplimiento del día; tooltip notas en hover.
- **No implementado vs Prompt:** selector trimestre/año; marcas explícitas “racha rota acá”.

### 5.8 `HabitosRightPanel.jsx`

- Visible solo `xl+`; detalle, stats, registros recientes, Editar / Eliminar.
- **Racha máxima:** algoritmo distinto a `calcStreak` — cuenta días **calendario** consecutivos con registro `valor > 0`, **sin** respetar `isScheduled` (deuda — ver §7).

### 5.9 `habitosUtils.js` — fuente de verdad

| Función | Uso |
|---------|-----|
| `isScheduled(habito, date)` | ¿Toca ese día? |
| `parseDias(raw)` | JSON → array |
| `toISODate(date)` | `YYYY-MM-DD` |
| `buildRegistrosMap(registros)` | Clave `"habitoId-fecha"` |
| `calcStreak(habito, map)` | Racha actual (programada) |
| `calcMonthPct(habito, map, year, month)` | % mes |
| `todayStatus(habito, map)` | `done` \| `partial` \| `pending` \| `off` |

**Impacto:** cualquier cambio aquí afecta HOY, Progreso, Historial, panel izq y Agenda HOY.

### 5.10 Store (`useStore.js` — slice Hábitos)

| Acción | Comportamiento |
|--------|----------------|
| `fetchHabitos` | GET `/habitos`; error → `[]` |
| `fetchHabitosRegistros(desde?, hasta?)` | GET con merge por rango; sin args → reemplaza todo el slice |
| `addHabito` | POST + append; offline → id mock `h_*` |
| `updateHabito` | Optimista + PATCH |
| `deleteHabito` | Optimista + DELETE |
| `upsertHabitoRegistro` | Optimista + PUT |
| `deleteHabitoRegistro` | Optimista + DELETE por `registro_id` |

**Carga inicial (`App.jsx`):** `fetchHabitos()` + `fetchHabitosRegistros()` **sin rango** → trae **todos** los registros históricos. A escala conviene acotar (p. ej. últimos 400 días) o paginar.

### 5.11 TopBar y captura global

- En `/habitos`: CTA **+ Nuevo hábito** → `openHabitoModal`.
- `CaptureModal`: tab Hábitos **deshabilitada** (`enabled: false`) — no crea hábitos desde captura global.
- Campana de notificaciones: badge fijo, sin lista (global).

---

## 6. Integración con Agenda

Archivo: `components/agenda/HoyTab.jsx`.

| Condición | UI Agenda |
|-----------|-----------|
| Activo + programado hoy + **sin** `hora` | Sección “Hábitos de hoy” en panel izquierdo; checkbox inline |
| Activo + programado hoy + **con** `hora` | Bloque en grilla horaria 6–23h (color del hábito) |

**Comportamiento:**

- Checkbox: si hay registro con `valor > 0` → upsert `valor: 0`; si no → upsert `1.0` (solo total, sin parcial ni nota).
- **Unidireccional en diseño:** completación rica (parcial, nota, días pasados) solo desde `/habitos`.
- Calendario “Hábitos” en Agenda: **no** aparece en vista Mes (mismo patrón que Facultad) — los bloques son derivados del store, no eventos `agenda_eventos`.

**Deuda:** toggle-off debería llamar `deleteHabitoRegistro` en lugar de `valor: 0` para alinear con Hábitos y no dejar registros fantasma.

---

## 7. Estado: hecho vs pendiente vs deuda

### Hecho (mayo 2026)

- 3 tabs HOY / Progreso / Historial con layout 3 paneles.
- CRUD hábitos + registros con API y store offline.
- Grilla mensual sticky, `CompletarModal`, `NuevoHabitoModal`.
- Integración Agenda HOY (lista + grilla horaria).
- Accent verde Arcoíris; i18n keys en `i18n.js`.
- Seeds de ejemplo en BD.

### Pendiente explícito (`Prompt.md` § PRÓXIMAMENTE → Hábitos)

- Conectar con el Bot.
- Notificaciones.
- Mejoras varias.
- `Ctrl+M` contextual por módulo.
- Click izquierdo/derecho personalizable.

### Gaps spec vs código (sin estar en PRÓXIMAMENTE)

| Tema | Spec (`Prompt.md`) | Código actual |
|------|-------------------|---------------|
| Historial período | Mes · trimestre · año | Solo navegación mensual |
| Progreso filtro | Por categoría | No |
| Progreso copy | Afirmaciones de identidad | No |
| Historial UX | “Racha rota acá” | No |
| Desactivar hábito | Campo `activo` | API sí; UI no |
| Racha máxima panel der. | Coherente con reglas de frecuencia | Algoritmo calendar-day simple |
| Carga registros | — | Todos al arranque |

### Bugs / deuda técnica conocida

1. **Agenda `valor: 0`** al desmarcar — debería DELETE.
2. **`maxStreak` en `HabitosRightPanel` / `ProgresoTab`** — no usa `isScheduled`; puede inflar o distorsionar vs racha “real”.
3. **IDs mock offline** (`h_*`, `reg_*`) — al reconectar API, posibles duplicados si no se reconcilia.
4. **Sin `onContextMenu`** en ningún componente de Hábitos.
5. **`TweaksPanel`** — mismo contenido en todos los módulos (solo apariencia).

---

## 8. Optimizar funcionamiento con el Bot

Hoy `mybot/bot.py` solo llama `/categorias`, `/hojas`, `/upload`. **Cero** integración con `/habitos/*`.

### Quick wins (bajo esfuerzo)

| Comando / flujo | Acción API |
|-----------------|------------|
| `/hoy` o `/habitos` | `GET /habitos` + registros de hoy → lista con ✅/⬜ |
| Responder `1` o `1p` | `PUT /habitos/{id}/registro` con `valor: 1.0` o `0.5` |
| `/hecho meditar` | Fuzzy match por nombre → total hoy |
| `/racha` | Resumen de rachas (cálculo en bot replicando `calcStreak` o endpoint nuevo) |
| Inline keyboard | Un botón por hábito pendiente hoy (máx. 8 + “Ver más”) |

### Flujo “check-in de la noche”

1. Bot envía a las 21:00 (cron externo): “Te falta: Correr, Leer”.
2. Usuario toca ✅ en inline → upsert.
3. Opcional: “¿Nota?” → segundo mensaje con texto → PATCH nota.

### Menú multi-módulo (visión ecosistema)

```
[ Bóveda | Finanzas | Agenda | Hábitos ]
```

Al elegir Hábitos: submenú `Marcar hoy | Ver racha | Nuevo hábito (guiado) | Pendientes`.

### Paridad con web

| Capacidad web | Bot |
|---------------|-----|
| Parcial 0.5 | Botón “Parcial” o comando `1p` |
| Nota | Segundo paso o caption |
| Días pasados | `/ayer 2 total` o date picker inline |
| Editar hábito | Solo web (v1) o `/habito 3 nombre=...` |
| Crear hábito | Wizard corto: nombre → diario/semanal → listo |

### Robustez

- Cachear lista de hábitos 60s en memoria del bot.
- Reintentos en `requests` si el backend arranca después.
- `GET /habitos` al inicio como healthcheck extendido.

### Implementación sugerida en `bot.py`

```python
def _get_habitos():
    return requests.get(f"{API_BASE}/habitos", timeout=30).json()

def _marcar(habito_id, fecha, valor=1.0, nota=None):
    return requests.put(
        f"{API_BASE}/habitos/{habito_id}/registro",
        json={"fecha": fecha, "valor": valor, "nota": nota},
        timeout=30,
    )
```

Handlers: `CommandHandler("hoy", cmd_hoy)`, `CallbackQueryHandler` para inline ✅/🟡.

---

## 9. Notificaciones y Hábitos

### Estado actual

- Campana en `TopBar`: **badge fijo**, sin `GET` ni lista.
- No hay `habitos_recordatorio` ni campo “avisar a las HH:MM”.
- La hora del hábito solo sirve para **Agenda HOY**, no dispara pings.

### Modelo conceptual (distinto de Bóveda)

| Tipo | Origen | Ejemplo |
|------|--------|---------|
| **Recordatorio por hábito** | `habitos.hora` + `frecuencia` | “Son las 7:00 — Correr” |
| **Resumen del día** | Derivado | “Te falta 2 de 5 hábitos” |
| **Racha en riesgo** | Derivado | “Llevás 12 días — no pierdas hoy” |
| **Momentum** | Derivado | “3 días sin completar nada” |
| **Sistema** | App | API caída, backup |

Hábitos es el módulo **más natural** para notificaciones recurrentes (junto con Agenda).

### Pipeline propuesto

```
1. Opcional: habitos.notificar (bool), habitos.minutos_antes (int)
2. Tabla notificaciones_pendientes (modulo, ref_id, fire_at, canal, enviado)
3. Scheduler (cron / lifespan cada 1 min) → SELECT due
4. Canales:
   - Web: campana + Web Notifications API si pestaña en background
   - Telegram: bot.send_message + inline ✅ Total / 🟡 Parcial / Posponer 1h
5. Marcar leída / hecha al upsert desde cualquier canal
```

### UX en campana (Hábitos)

Agrupar **Pendientes hoy**, **Esta tarde** (por `hora`), **Rachas**.

Item ejemplo:

> 🔥 Correr — racha 8 — pendiente  
> [Marcar total] [Parcial] [Ir a Hábitos]

Click en item → navegar `/habitos` con `selectedId` y abrir `CompletarModal` para hoy.

### Telegram como canal

- Mismo bot de captura; requiere `telegram_chat_id` en config usuario.
- Recordatorio: “¿Corriste hoy?” + inline ✅ / 🟡 / ⏭ Mañana.
- Resumen nocturno configurable (opt-in).

### Sin servidor 24/7 (HomeLab)

| Enfoque | Pros |
|---------|------|
| Solo notif. con **app abierta** | `setInterval` + permiso browser; cero infra |
| Solo **Telegram** si bot en Docker siempre | Fiable para recordatorios |
| **ICS export** de slots con hora | Calendario del SO como recordatorio pasivo |

### Relación con Agenda

- Evitar duplicar: si el usuario ya ve el bloque en Agenda HOY, la notificación puede ser **solo** para hábitos **sin hora** o 15 min antes del slot.

---

## 10. Mejoras de backend

### API / CRUD

| Mejora | Motivo |
|--------|--------|
| Validar `valor` en `{0.5, 1.0}` o rechazar `0` | Consistencia; forzar DELETE para desmarcar |
| `GET /habitos/resumen?fecha=` | Lista hábitos + estado hoy + racha (menos lógica en bot/PWA) |
| `GET /habitos/registros/agregado?desde=&hasta=` | Heatmap/stats sin bajar todos los registros |
| `GET /habitos/pendientes-hoy` | Bot + campana + widget |
| Índice `(fecha)`, `(habito_id, fecha)` | Ya UNIQUE; asegurar índice explícito si crece BD |
| Soft delete / `archivado_en` | Pausar sin perder historial |
| Tabla `habitos_categorias` opcional | Normalizar categorías libres repetidas |
| `orden` en hábitos | Reordenar lista izquierda |
| Batch `PUT /habitos/registros` | Import o marcar varios días |

### Cálculos server-side (opcional)

Hoy todo es cliente → duplicación con bot y futuros informes.

| Endpoint | Devuelve |
|----------|----------|
| `GET /habitos/{id}/stats` | racha_actual, racha_max_programada, pct_mes, pct_mes_anterior |
| `GET /habitos/stats/global` | % semana, heatmap 84 días |

Si se implementa, **`habitosUtils.js` debe delegar o compartir tests** con Python para no divergir.

### Notificaciones (backend)

- `POST /habitos/{id}/recordatorio` → `{ activo, hora, canal }`
- `GET /notificaciones?modulo=habitos&unread=1`

### Seguridad / operación

- Mismo token API que resto de SGR si se expone fuera de LAN.
- `POST /admin/export/habitos` → JSON (hábitos + registros) para backup NAS.

### Migraciones útiles

```sql
ALTER TABLE habitos ADD COLUMN notificar INTEGER DEFAULT 0;
ALTER TABLE habitos ADD COLUMN orden INTEGER DEFAULT 0;
```

---

## 11. Ctrl+M contextual en Hábitos

### Hoy

`TweaksPanel.jsx` escucha **globalmente** `Ctrl/Cmd+M` y muestra solo **Tema / Tono / Tipografía** — idéntico en Bóveda, Finanzas, Agenda y Hábitos.

En Hábitos no hay hint específico en TopBar (a diferencia de Bóveda que muestra `Ctrl+M` en búsqueda).

### Propuesta: un atajo, contenido por ruta

Mantener **`Ctrl+M` global**; el panel depende de `location.pathname` y, dentro de `/habitos`, del **tab activo** (pasar `tab` vía contexto React o store `habitosTab`).

#### Siempre en `/habitos` (cualquier tab)

| Sección | Acciones |
|---------|----------|
| **Hábitos** | Nuevo hábito · Marcar **hoy** el seleccionado (total) · Marcar hoy **parcial** |
| **Navegación** | Ir a tab HOY / Progreso / Historial · Ir a Agenda HOY |
| **Apariencia** | Acordeón actual (temas, tono, fuentes) |
| **Atajos** | Lista: `H` HOY, `P` Progreso, `Esc` cerrar modal |

#### Tab HOY (adicional)

| Acción | Atajo sugerido (con panel abierto) |
|--------|-----------------------------------|
| Mes anterior / siguiente | `←` / `→` |
| Ir a mes actual | `T` (today month) |
| Completar hoy hábito seleccionado | `Enter` → abrir `CompletarModal` |
| Desmarcar hoy | `Backspace` (si hay registro) |

#### Tab Progreso

| Acción | Descripción |
|--------|-------------|
| Filtrar categoría | Chips en panel (cuando exista UI) |
| Copiar resumen semanal | Markdown al portapapeles |

#### Tab Historial

| Acción | Descripción |
|--------|-------------|
| Mes anterior/siguiente | `←` / `→` |
| Limpiar filtro hábito | `Esc` |

### Implementación sugerida

1. Renombrar mentalmente `TweaksPanel` → `CommandPanel` con prop `sections[]`.
2. `HabitosScreen` registra `setHabitosTab` en store al cambiar tab (para que el panel lea contexto sin prop drilling).
3. Atajos secundarios (`←`, `Enter`) **solo con panel abierto** (`if (!commandPanelOpen) return`) para no robar navegación del browser.
4. TopBar en `/habitos`: hint `Ctrl+M` → “Comandos”.

### Atajos globales sin panel (opcional)

| Atajo | Acción |
|-------|--------|
| `Ctrl+Shift+H` | Ir a `/habitos` |
| `Ctrl+Shift+1` | Marcar total hábito #1 de la lista de hoy (power user) |

---

## 12. Click derecho en Hábitos

### Uso actual

- **No hay** `onContextMenu` en grilla, lista izquierda, filas de stats ni calendario de Historial.
- Patrón existente en proyecto: `TopBar` título → click derecho = **módulo anterior** (`cyclePrev`).

### Propuesta: menú contextual por superficie

Componente reutilizable `ContextMenu` (portal, posición x/y, cierre Escape / click fuera). Persistencia opcional en `localStorage` clave `sgr-habitos-context-menu`.

#### Lista izquierda (`HabitosLeftPanel`) — fila hábito

| Acción | Notas |
|--------|--------|
| Marcar hoy **total** | `upsert` 1.0 |
| Marcar hoy **parcial** | `upsert` 0.5 |
| Desmarcar hoy | `delete` registro |
| Editar hábito | `NuevoHabitoModal` |
| Archivar / desactivar | `PATCH activo: false` |
| Eliminar | Confirmación |
| Ir a detalle | Seleccionar + scroll panel der. |

#### Grilla HOY — celda día

| Acción | Notas |
|--------|--------|
| Total / Parcial / Desmarcar | Igual que `CompletarModal` sin abrir popup |
| Agregar nota… | Mini input inline |
| Copiar fecha | `YYYY-MM-DD` |
| Ir a semana en Historial | Cambiar tab + mes |

#### Grilla HOY — nombre de fila (sticky izq)

| Acción |
|--------|
| Editar · Duplicar hábito · Ver solo esta fila (filtro) · Color… |

#### Tab Progreso — fila tabla

| Acción |
|--------|
| Seleccionar · Editar · Exportar CSV mes · Fijar como “foco” |

#### Tab Historial — celda día

| Acción |
|--------|
| Ver detalle del día (modal lista hábitos + estados) |
| Copiar resumen |
| Marcar todos totales (si día pasado) |

#### Vacío / fondo del panel central

| Acción |
|--------|
| Nuevo hábito |
| Ir a HOY |
| Refrescar datos (`fetchHabitosRegistros` rango) |

### Click izquierdo avanzado (complemento)

| Gesto | Acción |
|-------|--------|
| **Doble click** celda hoy | Total directo (sin popup) |
| **Shift+click** celda | Parcial directo |
| **Alt+click** nombre | Abrir edición |

Configurables en Settings junto al menú contextual.

### Atajos en ítems del menú

Mostrar `Del`, `Ctrl+D` a la derecha; mismas funciones que `CommandPanel` (`Ctrl+M`).

---

## 13. Otras ideas de producto y UX

### Gamificación ligera (sin volverse juego)

- **“No romper dos veces”** — copy ya alineado en momentum; badge al recuperar después de fallar.
- **Hábito ancla** — pin en top de lista izquierda.
- **Modo enfoque** — solo hábitos pendientes hoy, pantalla limpia.

### Datos y export

- Export CSV / JSON de registros por rango.
- Import desde Loop, Habitica, CSV genérico.
- Vista anual tipo “GitHub contributions” (52×7).

### Social / identidad (local)

- Frases en Progreso generadas desde stats reales (“Leíste 22 de 30 días programados”).
- Comparar mes actual vs mejor mes histórico.

### Integración cross-módulo

- Finanzas: hábito “Registrar gastos” con deep link a movimiento.
- Bóveda: hoja vinculada a hábito (`habitos.hoja_id` FK opcional) — apuntes de progreso.
- Agenda: completar hábito con hora podría ofrecer “bloquear 30 min” como evento real (hoy es solo visual).

### Calidad de vida

- **Pausar vacaciones** — rango de fechas donde `isScheduled` siempre false.
- **Meta semanal** — “3 de 5 días” en lugar de diario estricto (nuevo `frecuencia_tipo`).
- **Widget PWA** — % del día en pantalla de inicio.
- Atajo teclado `1`/`2`/`3` en lista izquierda para marcar los primeros tres pendientes.

### Observabilidad local

- Dashboard: hábito más consistente del trimestre, día de la semana más débil, hora con más fallos (si hay `hora`).

### Accesibilidad

- Navegación por teclado en grilla (flechas + Enter).
- Anunciar racha y % con `aria-live` al completar.

---

## 14. Frontend — estado, diseño, optimizaciones e implementación

Análisis del código React actual (`frontend/src/components/habitos/`, `HabitosScreen`, integración Agenda/TopBar) y hoja de ruta UI. Alineado con el sistema SGR (`panel-strong`, `label`, `serif`, variables CSS) y con la intención de **Prompt.md** (grilla mensual densa, verde Arcoíris, micro-animación al completar).

### 14.1 Auditoría del estado actual

#### Lo que funciona bien

| Aspecto | Implementación |
|---------|----------------|
| **Layout 3 paneles** | Mismo patrón que Finanzas/Agenda; izquierda fija 260px, derecha solo `xl+` |
| **Grilla HOY** | Un solo scroll horizontal; sticky nombre + %; fix explícito vs ClaudeDesign |
| **Tema** | Hereda 6 temas + tonos + fuentes globales; Arcoíris pone `--accent` verde en `/habitos` |
| **Completar** | Popup anclado (`CompletarModal`) con Total/Parcial/nota; `active:scale-95` en botones |
| **Offline** | Optimista en store antes que `fetch`; usuario no pierde el check si cae API |
| **i18n** | Keys dedicadas en `i18n.js` (es/en) para casi todo el copy visible |
| **Tipografía de datos** | `tnum`, `serif italic` en títulos de mes y % — coherente con Finanzas |

#### Deuda y fragilidad (código)

| Problema | Dónde | Impacto |
|----------|--------|---------|
| **Sin memoización** | Todos los tabs suscriben `habitos` + `habitosRegistros` completos | Cualquier upsert re-renderiza grilla entera (O(hábitos × días)) |
| **`buildRegistrosMap` en cada render** | Left, Hoy, Progreso, Historial, Right | Objeto nuevo cada vez; impide memo estable en hijos |
| **Cálculos duplicados** | `calcMonthPct`, `calcStreak`, `calcWeekPct` repetidos por fila/celda | CPU innecesaria con 20+ hábitos y heatmap 84 días |
| **`maxStreak` distinto** | `HabitosRightPanel`, `ProgresoTab` | UI muestra números que no coinciden con `calcStreak` |
| **Panel derecho ausente en mobile** | `hidden xl:flex` en `HabitosRightPanel` | En `<1280px` no hay detalle, edición solo vía lista + modal |
| **Historial: doble sidebar** | `HistorialTab` añade aside 220px + `HabitosLeftPanel` 260px | En laptop pequeño el centro queda muy estrecho |
| **Sin loading / error UI** | Store silencioso en fetch | Pantalla vacía si API falla al inicio |
| **Sin animación al completar** | Spec: “micro-animación al confirmar” | Solo `scale` en botones del modal, no en celda |
| **Inline styles masivos** | `onFocus` muta `borderColor` en inputs | Difícil mantener; preferir clases + `focus-visible:` |
| **SVG check duplicado** | `HoyTab`, `Agenda HoyTab` | Mismo path copiado 2 veces |
| **Tab state local** | `HabitosScreen` `useState('hoy')` | `Ctrl+M`, deep links y CommandPanel no saben tab activo |
| **Selección no en URL** | `selectedId` solo en memoria | Refresh pierde hábito seleccionado |
| **Confirm delete** | `window.confirm` | Rompe estética; sin undo toast |

#### Responsive / mobile

```
Viewport        Izq 260px   Centro        Der 260px   Navegación módulo
─────────────────────────────────────────────────────────────────────
≥ xl (1280)     ✓           Grilla        ✓           TopBar cycle
md–lg           ✓           Comprimido    ✗           Bottom nav solo / y settings
< md            ✓ (estrecho) Scroll X      ✗           No hay entrada Hábitos en bottom nav
```

- **Bottom nav** (`Layout.jsx`): solo Home y Settings — **no hay icono Hábitos** en móvil; hay que cyclar desde TopBar en otro módulo o bookmark `/habitos`.
- **FAB** (`CaptureModal`): no abre hábitos; tab deshabilitada.
- **Touch:** celdas 34×40px — aceptable; popup 220px puede quedar fuera de viewport en borde inferior (ya hay `Math.min` en top).

#### Rendimiento estimado (orden de magnitud)

Con **15 hábitos**, mes de **31 días**:

- Celdas DOM en HOY: ~465 `div` + headers — OK.
- Con **50 hábitos**, **12 meses** de registros en memoria: ~18k registros en array + map rebuild cada render — empieza a notarse en laptops débiles.
- Progreso heatmap: **84 iteraciones × N hábitos** por render del tab — sin `useMemo`, cambiar tab y volver recalcula todo.

---

### 14.2 Dirección estética (frontend-design)

Hábitos debe sentirse **distinto de Bóveda (violeta/exploración)** y **Finanzas (ámbar/cifras)**, pero familiar dentro de SGR.

#### Concepto recomendado: *“Cuaderno de constancia”*

| Pilar | Decisión |
|-------|----------|
| **Tono** | Editorial calmado + datos vivos en verde — no gamificación infantil ni dashboard SaaS genérico |
| **Color** | El **color del hábito** es protagonista en celdas hechas; el **accent del módulo** (`#059669`) reserva para “hoy”, progreso del día y CTAs |
| **Tipografía** | Mantener **serif italic** en meses y titulares (“Mayo 2026”); **mono/tnum** en % y rachas; body en par del tema activo (no forzar Inter) |
| **Densidad** | Alta en grilla HOY (productividad); más aire en Progreso (reflexión) |
| **Motion** | Un solo momento fuerte: **celda que “pulsa” y rellena** al marcar total; parcial = **medio fill** animado; evitar confetti |

#### Temas globales — notas por tema (Prompt § temas)

| Tema | Hábitos |
|------|---------|
| **Arcoíris** | Verde ruta; gráficos pueden usar escala verde + gris |
| **Lima y gris** | Ideal para “dato vivo” del mes actual y hábito de hoy (spec explícito) |
| **Pasteles / claros** | Celdas completadas: usar `habito.color` con borde, no solo fill plano — contraste AA |
| **Arena y negro** | Rachas en terracota/musgo desaturado en lugar de `--warning` estándar |

#### Anti-patrones a evitar

- Gradiente violeta→verde en headers (cliché AI).
- Reemplazar colores por hábito con un solo verde uniforme (pierde lectura rápida).
- Ilustraciones decorativas que compitan con la grilla.
- Fuente nueva solo para Hábitos (rompe coherencia SGR).

#### Micro-detalles memorables (implementables)

1. **Anillo de progreso** alrededor del número del día actual en header de grilla (SVG circular, % del día).
2. **Racha 🔥** con `filter: drop-shadow` suave del color del hábito cuando streak ≥ 7.
3. **Heatmap** con bordes `1px` entre celdas (grid visible como cuaderno punteado).
4. **Sonido opcional** (off por defecto): click seco al marcar total — `localStorage` `sgr-habitos-sound`.

---

### 14.3 Mejoras por superficie (UX + UI)

#### `HabitosScreen` + `HabitosTabs`

| Mejora | Descripción |
|--------|-------------|
| Tab en URL | `/habitos?tab=progreso` o `/habitos/progreso` — compartir vista |
| Badge en tab HOY | Número de pendientes hoy en pill sobre el tab |
| Transición tab | Fade 150ms del panel central, no swap brusco |
| Persistir tab | `sessionStorage` último tab |

#### `HabitosLeftPanel`

| Mejora | Descripción |
|--------|-------------|
| **Check rápido** | Checkbox en fila (como Agenda) sin abrir grilla |
| Agrupar por categoría | Headers colapsables si `categoria` repetida |
| Orden manual | Drag handle + `orden` en BD |
| Filtro | “Solo pendientes hoy” toggle |
| Empty state | Ilustración ligera + CTA, no solo texto |
| Skeleton | 3 filas placeholder mientras `fetchHabitos` |

#### `HoyTab` (grilla)

| Mejora | Descripción |
|--------|-------------|
| **Columna “hoy”** | Borde vertical accent en toda la columna del día actual |
| Leyenda | Mini leyenda bajo grilla: guión / vacío / parcial / total |
| Hover celda | Preview fecha + nota en tooltip unificado |
| Teclado | Flechas mueven foco; `Enter` abre completar; `1`/`2` total/parcial |
| Rango visible | Pin mes: al cambiar mes, scroll automático a columna 1 o a hoy |
| Filtro filas | “Mostrar solo seleccionado” desde panel der. |
| Semana ISO | Opcional: fila auxiliar con número de semana |

#### `CompletarModal`

| Mejora | Descripción |
|--------|-------------|
| Posición | Flip arriba si no hay espacio abajo (ya parcial en Y) |
| Atajos | `1` total, `2` parcial, `Enter` repite último valor |
| Autofocus nota | Opcional con `N` |
| Feedback | Al guardar: propagar animación a celda origen (callback + `data-habito-id`) |

#### `NuevoHabitoModal`

| Mejora | Descripción |
|--------|-------------|
| `Ctrl+Enter` guardar | Paridad con `CaptureModal` |
| Vista previa | Chip “Toca: Lun, Mié, Vie · 07:00” en vivo |
| Plantillas | “Meditación”, “Ejercicio”, “Lectura” prellenan color/frecuencia |
| Archivar | Toggle “Activo” en edición |
| Autocomplete categoría | Sugerir valores ya usados en otros hábitos |

#### `ProgresoTab`

| Mejora | Descripción |
|--------|-------------|
| Filtro categoría | Chips derivados de `habitos.map(categoria)` |
| Afirmaciones | Bloque serif bajo momentum con stats reales |
| Heatmap | Etiquetas mes/semana; click día → salta a HOY ese mes |
| Mejor / peor | Cards “Mejor hábito del mes” / “Más fallas” (spec panel der.) — hoy solo tabla |
| Lazy mount | No calcular heatmap hasta que tab sea visible |

#### `HistorialTab`

| Mejora | Descripción |
|--------|-------------|
| Unificar sidebars | En tab Historial, **ocultar** `HabitosLeftPanel` o fusionar filtros en uno |
| Trimestre / año | Selector que pide el spec |
| Rachas rotas | Icono ⚡ en día donde `calcStreak` reinicia |
| Click día | Modal “Detalle del 12/05” con lista hábitos |
| Tooltip notas | `pointer-events-none` impide copiar — permitir hover sticky |

#### `HabitosRightPanel`

| Mejora | Descripción |
|--------|-------------|
| Drawer en `<xl` | Sheet deslizable desde abajo o derecha al seleccionar hábito |
| Sparkline mini | Por hábito, últimos 30 días |
| `maxStreak` | Reemplazar por `calcMaxStreak(habito, map)` en `habitosUtils` |
| Eliminar | Modal inline estilizado + toast undo 5s |

---

### 14.4 Optimizaciones técnicas (React / datos)

#### Capa de datos en cliente

```javascript
// hooks/useHabitosData.js (propuesto)
export function useHabitosRegistrosMap() {
  const registros = useStore(s => s.habitosRegistros)
  return useMemo(() => buildRegistrosMap(registros), [registros])
}

export function useHabitoStats(habitoId, year, month) {
  const habito = useStore(s => s.habitos.find(h => h.id === habitoId))
  const map = useHabitosRegistrosMap()
  return useMemo(() => ({
    streak: calcStreak(habito, map),
    pct: calcMonthPct(habito, map, year, month),
    today: todayStatus(habito, map),
  }), [habito, map, year, month])
}
```

| Optimización | Beneficio |
|--------------|-----------|
| `useMemo` en `registrosMap` | Un rebuild por cambio de registros, no por render padre |
| Selectores Zustand | `useStore(s => s.habitos.filter(h => h.activo))` con shallow compare o `useShallow` |
| Precalcular mes en `HoyTab` | `useMemo(() => rows.map(...), [activos, map, year, month])` |
| `fetchHabitosRegistros(desde, hasta)` al entrar `/habitos` | Últimos 400 días + merge; no cargar histórico completo en `App.jsx` |
| Refetch al cambiar mes | Solo si mes visible ∉ cache local |
| Web Worker opcional | Heatmap + stats si >30 hábitos (futuro) |

#### Grilla: virtualización

Si **hábitos > 25** o **meses navegables con muchas filas**:

- **Vertical:** `react-window` `FixedSizeList` por fila de hábito (altura fija 40px).
- **Horizontal:** virtualizar columnas de días o paginar “semana 1–2” con tabs.
- Mantener sticky izq/der con librerías que soporten `stickyIndices` o duplicar columnas fijas fuera del scroll virtual.

#### Componentización sugerida

```
habitos/
├── HabitGrid/
│   ├── HabitGrid.jsx          # contenedor scroll
│   ├── HabitGridHeader.jsx    # días + nav mes
│   ├── HabitGridRow.jsx       # memo(HabitGridRow)
│   └── HabitCell.jsx          # memo, onComplete
├── HabitCheckPopover.jsx      # renombre CompletarModal
├── hooks/
│   ├── useHabitosData.js
│   └── useHabitKeyboard.js
└── habitosUtils.js            # + calcMaxStreak programada
```

#### Store (Zustand)

| Cambio | Motivo |
|--------|--------|
| `habitosTab`, `habitosSelectedId` en store | CommandPanel, deep link, persistencia |
| `habitosRegistrosByKey: Record<string, Registro>` | O(1) lookup sin rebuild map (alternativa a useMemo) |
| Toast slice | Undo delete hábito / desmarcar |
| `habitosFetchStatus: 'idle'|'loading'|'error'` | UI skeleton |

#### Bundle / carga

- **Code-split:** `React.lazy(() => import('./ProgresoTab'))` y `HistorialTab` — HOY es el critical path.
- **No importar** libs pesadas en `habitosUtils` (mantener puro).
- Iconos: ya `lucide-react` tree-shaken por icono.

---

### 14.5 Accesibilidad y input

| Ítem | Estado | Acción |
|------|--------|--------|
| Contraste celda parcial | Amarillo `--warning` sobre fondo oscuro | Verificar AA; borde adicional |
| `focus-visible` en celdas | No | Anillo accent en celda enfocada |
| `role="grid"` + `aria-selected` | No | Grilla HOY como grid ARIA |
| `aria-live="polite"` | No | Anunciar “Meditar completado, racha 5” |
| `prefers-reduced-motion` | No | Desactivar pulse de completado |
| Labels i18n en iconos | Parcial | `aria-label` en nav mes, cerrar modal |

---

### 14.6 Integraciones frontend pendientes

| Integración | Trabajo |
|-------------|---------|
| **CaptureModal** tab Hábitos | Habilitar tab → `openHabitoModal` o mini form en modal |
| **TopBar** campana | Lista pendientes hoy; click → `/habitos` + highlight |
| **Bottom nav móvil** | Cuarto icono Target → `/habitos` (verde si activo) |
| **CommandPanel (`Ctrl+M`)** | Sección Hábitos (ver §11) |
| **ContextMenu** | Componente shared `components/ContextMenu.jsx` (ver §12) |
| **Agenda** | Fix toggle → `deleteHabitoRegistro`; long-press → ir a Hábitos |

---

### 14.7 Backlog frontend priorizado

| P | Entrega | Esfuerzo | Impacto UX |
|---|---------|----------|------------|
| P0 | `useMemo` registrosMap + stats por fila en `HoyTab` | Bajo | Fluidez al marcar varios hábitos |
| P0 | Drawer panel derecho en `<xl` | Medio | Mobile usable |
| P0 | Animación celda al completar + `prefers-reduced-motion` | Bajo | Cumple spec + delight |
| P0 | Entrada Hábitos en bottom nav móvil | Bajo | Descubribilidad |
| P1 | `fetchHabitosRegistros` con rango al montar `/habitos` | Medio | Tiempo de carga inicial |
| P1 | Tab + selección en query string | Bajo | Compartir / refrescar |
| P1 | Check rápido en `HabitosLeftPanel` | Bajo | Menos clicks que grilla |
| P1 | Unificar `calcMaxStreak` en utils | Bajo | Confianza en stats |
| P1 | Historial: ocultar panel izq duplicado | Bajo | Más espacio calendario |
| P2 | Virtualización grilla (>25 hábitos) | Alto | Escala |
| P2 | Code-split Progreso/Historial | Bajo | FCP en ruta hábitos |
| P2 | Filtro categoría + afirmaciones Progreso | Medio | Cierra spec |
| P2 | Toast undo eliminar | Medio | Seguridad |
| P3 | Sonido opcional / temas hábito-específicos | Bajo | Polish |
| P3 | Plantillas en `NuevoHabitoModal` | Bajo | Onboarding |

---

### 14.8 Checklist para agentes (antes de tocar UI)

1. ¿El cambio afecta `habitosUtils.js`? → actualizar tests manuales en los 3 tabs + Agenda.
2. ¿Nuevo string visible? → `i18n.js` es + en.
3. ¿Usa `var(--accent)` para “hoy” y el **color del hábito** para celdas completadas?
4. ¿Funciona en **md** sin panel derecho?
5. ¿Evita suscribir todo el store si solo necesita un hábito?
6. ¿Respeta offline-first (optimista primero)?

---

## 15. Mapa de archivos (referencia rápida)

```
project/
├── app/main.py                    # Rutas /habitos/*, Pydantic Habito*
├── app/db/
│   ├── database.py                # Schema habitos + habitos_registros, _seed_habitos
│   └── crud.py                    # habitos_*, habitos_registros_*
├── mybot/bot.py                   # Sin Hábitos (solo Bóveda)
├── frontend/src/
│   ├── App.jsx                    # fetchHabitos + fetchHabitosRegistros al mount
│   ├── screens/HabitosScreen.jsx
│   ├── components/
│   │   ├── habitos/
│   │   │   ├── habitosUtils.js    # isScheduled, calcStreak, calcMonthPct, …
│   │   │   ├── HabitosTabs.jsx
│   │   │   ├── HabitosLeftPanel.jsx
│   │   │   ├── HabitosRightPanel.jsx
│   │   │   ├── HoyTab.jsx
│   │   │   ├── ProgresoTab.jsx
│   │   │   ├── HistorialTab.jsx
│   │   │   ├── NuevoHabitoModal.jsx
│   │   │   └── CompletarModal.jsx
│   │   ├── agenda/HoyTab.jsx      # Integración hábitos
│   │   ├── CaptureModal.jsx     # Tab Hábitos disabled
│   │   ├── TopBar.jsx             # CTA openHabitoModal
│   │   ├── TweaksPanel.jsx        # Ctrl+M global (apariencia)
│   │   └── Layout.jsx             # Accent /habitos
│   └── store/useStore.js          # Slice habitos
└── Habitos.md                     # Este archivo
```

---

## 16. Dependencias entre piezas

```
NuevoHabitoModal ──POST/PATCH──► habitos ──► HabitosLeftPanel (estado hoy)
                                      │
CompletarModal ──PUT/DELETE──► habitos_registros ──► habitosRegistros (store)
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
              HoyTab grilla    ProgresoTab stats   HistorialTab
                    │                 │                 │
                    └──────── habitosUtils.js ◄───────┘
                                      │
                              Agenda HoyTab (check rápido)
```

**Regla para agentes:** cambiar `calcStreak` / `isScheduled` implica revisar los 3 tabs, panel izquierdo, panel derecho y Agenda HOY.

---

## 17. Priorización sugerida (sprints)

| Prioridad | Entrega | Impacto |
|-----------|---------|---------|
| P0 | **Frontend:** `useMemo` + animación celda + drawer `<xl` + bottom nav Hábitos | UX diaria y móvil |
| P0 | `Ctrl+M` contextual en Hábitos (nuevo hábito + marcar hoy + tabs) | Alinea expectativa del atajo |
| P0 | Menú contextual en lista izq + celda grilla HOY | Flujo diario más rápido |
| P0 | Fix Agenda desmarcar → `DELETE` registro | Datos consistentes |
| P1 | Bot: `/hoy` + inline ✅/🟡 | Check-in móvil sin abrir PC |
| P1 | `GET /habitos/pendientes-hoy` o resumen | Campana + bot + menos payload |
| P1 | `fetchHabitosRegistros` con rango (últimos 120 días) | Performance |
| P1 | Unificar `maxStreak` con `calcStreak` o endpoint stats | Stats confiables |
| P2 | Notificaciones Telegram + tabla `notificaciones` | Recordatorios reales |
| P2 | UI `activo`/archivar + pausar vacaciones | Gestión vida real |
| P2 | Filtro categoría en Progreso + afirmaciones | Cierra gaps del spec |
| P3 | Export/import · metas semanales · `habitos.db` separado | Ecosistema maduro |

---

## 18. Preguntas abiertas (producto)

1. ¿Las notificaciones deben respetar **solo** hábitos con `hora` o también recordar los **sin hora** a una hora fija global (ej. 21:00)?
2. ¿El bot puede crear hábitos o solo **marcar** los existentes?
3. ¿`valor: 0` debe existir en BD o solo DELETE?
4. ¿Agenda debe permitir **parcial** desde checkbox o siempre redirigir a `/habitos`?
5. ¿Categorías de hábitos pasan a taxonomía formal o siguen texto libre?

---

*Documento para agentes y desarrollo local. Actualizar cuando cambien contratos de API, `habitosUtils.js`, componentes en `frontend/src/components/habitos/` o flujos principales de Hábitos.*
