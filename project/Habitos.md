# Hábitos — documentación técnica

Estado real del módulo Hábitos en SGR. Todo lo que está implementado y cómo funciona.
Para roadmap, mejoras y features pendientes: **`Habitos-Roadmap.md`**.

**Última revisión del código:** mayo 2026.

---

## 1. Qué es

**Hábitos** es el módulo de **seguimiento de comportamientos recurrentes**: definir hábitos con frecuencia (diaria o días específicos), marcar completaciones **totales** (1.0) o **parciales** (0.5), ver rachas y porcentajes, y reflexionar con heatmaps e historial.

| Rol | Dónde |
|-----|--------|
| Operación diaria | Tab **HOY** — grilla mensual + lista lateral con progreso del día |
| Análisis | Tab **Progreso** — heatmap, sparkline, momentum, tabla de stats |
| Retrospectiva | Tab **Historial** — calendario mensual coloreado por % del día |
| Configuración | `NuevoHabitoModal` — crear/editar (no es una tab) |
| Vista complementaria | **Agenda HOY** — hábitos con/sin hora (solo lectura + check rápido) |
| Bot Telegram | `/habitos`, `/hecho`, `/ayer`, `/racha`, `/nota`, check-in 21:00 |

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

mybot/agenda_handlers.py ── /habitos, /hecho, /ayer, /racha, /nota
```

- **Un solo store:** `frontend/src/store/useStore.js` — slice `habitos` + `habitosRegistros`.
- **Sin capa de servicios:** rutas en `app/main.py`, SQL en `app/db/crud.py`.
- **Offline-first:** update optimista en CRUD de hábitos y upsert/delete de registros; si falla `fetch`, se mantiene el estado local.
- **Lógica de negocio en cliente:** rachas, % mensual, "¿toca hoy?" viven en `habitosUtils.js`. El bot tiene su propio port Python (`_calc_racha`, `_is_scheduled`) en `agenda_handlers.py`.

### Tabs internas (estado local en `HabitosScreen`)

| Tab | Default | Panel central |
|-----|---------|---------------|
| `hoy` | **Sí** | Grilla mensual (`HoyTab`) |
| `progreso` | No | Resumen + heatmap + sparkline + tabla (`ProgresoTab`) |
| `historial` | No | Calendario mensual + filtro hábito (`HistorialTab`) |

El panel izquierdo (`HabitosLeftPanel`) y el derecho (`HabitosRightPanel`, solo `xl+`) se comparten entre tabs.

---

## 3. Modelo de datos (SQLite)

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

**Reglas implícitas:**
- **Racha actual** (`calcStreak`): días **programados** consecutivos hacia atrás con `valor > 0`. Días no programados se **saltan** (no rompen ni suman).
- **% del mes** (`calcMonthPct`): `suma(valores) / días_programados_hasta_hoy × 100`.
- **Desmarcar** en UI: `DELETE` del registro. En Agenda HOY el toggle-off hace upsert con `valor: 0` (bug conocido — ver Roadmap).

---

## 4. API REST

Prefijo `/habitos/*`.

| Método | Ruta | Uso |
|--------|------|-----|
| GET | `/habitos` | Lista todos los hábitos (`ORDER BY id`) |
| POST | `/habitos` | Crear |
| PATCH | `/habitos/{id}` | Actualizar campos opcionales |
| DELETE | `/habitos/{id}` | Borra hábito + registros (CASCADE) |
| GET | `/habitos/registros` | Query: `habito_id`, `fecha_desde`, `fecha_hasta` |
| PUT | `/habitos/{id}/registro` | Upsert `{ fecha, valor, nota }` |
| DELETE | `/habitos/registros/{id}` | Eliminar un registro |

---

## 5. Frontend — piezas clave

### 5.1 `HabitosScreen.jsx`

- Estado local: `tab`, `selectedId`, `editingHabito`, `localModalOpen`.
- Modal unificado: `habitoModalOpen` (TopBar CTA) **o** `localModalOpen` (panel izq / Editar).

### 5.2 `HabitosLeftPanel.jsx`

- Lista hábitos **activos** con estado de hoy: hecho · parcial · pendiente · no toca.
- Racha ≥ 3 → icono 🔥 + número (`calcStreak`).
- Barra "X de Y completados hoy".
- Botón **Nuevo** → `onNew()` → `NuevoHabitoModal`.

### 5.3 `HoyTab.jsx`

- Grilla mensual: **un solo** `overflow-x-auto`.
- Columnas sticky: nombre (176px izq), % mes (72px der), celdas día 34px.
- Celdas futuras: no clicables; hoy con highlight `var(--accent)`.
- Click celda programada pasada/hoy → `CompletarModal` anclado al rect.
- Click nombre de fila → selecciona hábito (panel derecho).

### 5.4 `CompletarModal.jsx`

- Popup flotante: Total / Parcial + nota + Desmarcar.
- `upsertHabitoRegistro` / `deleteHabitoRegistro`.
- Cierra con click fuera o `Escape`.

### 5.5 `NuevoHabitoModal.jsx`

- Campos: nombre, descripción, color (palette `HABITO_COLORS`), categoría libre, frecuencia diario/semanal, días, hora.
- `addHabito` / `updateHabito` en store.
- Validación: nombre requerido; semanal requiere ≥1 día.

### 5.6 `ProgresoTab.jsx`

- Tarjetas: % esta semana, este mes, semana anterior.
- Mensaje **momentum** (heurística local, no LLM).
- Heatmap 84 días (% global del día).
- Sparkline SVG 6 meses.
- Tabla stats por hábito (racha, máx., % mes, % mes ant., tendencia ↑↓).

### 5.7 `HistorialTab.jsx`

- Sub-panel izq: mes anterior/siguiente + filtro por hábito.
- Calendario 6×7: color por % cumplimiento del día; tooltip notas en hover.

### 5.8 `HabitosRightPanel.jsx`

- Visible solo `xl+`; detalle, stats, registros recientes, Editar / Eliminar.
- `maxStreak` usa algoritmo calendar-day simple (no `isScheduled`) — distorsiona vs racha real (ver Roadmap).

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
El bot tiene su propio port Python de estas funciones en `agenda_handlers.py`.

### 5.10 Store (`useStore.js` — slice Hábitos)

| Acción | Comportamiento |
|--------|----------------|
| `fetchHabitos` | GET `/habitos`; error → `[]` |
| `fetchHabitosRegistros(desde?, hasta?)` | GET con merge por rango |
| `addHabito` | POST + append; offline → id mock `h_*` |
| `updateHabito` | Optimista + PATCH |
| `deleteHabito` | Optimista + DELETE |
| `upsertHabitoRegistro` | Optimista + PUT |
| `deleteHabitoRegistro` | Optimista + DELETE por `registro_id` |

**Carga inicial (`App.jsx`):** `fetchHabitos()` + `fetchHabitosRegistros()` **sin rango** → trae todos los registros históricos.

---

## 6. Integración con Agenda

Archivo: `components/agenda/HoyTab.jsx`.

| Condición | UI Agenda |
|-----------|-----------|
| Activo + programado hoy + **sin** `hora` | Sección "Hábitos de hoy" en panel izq; checkbox inline |
| Activo + programado hoy + **con** `hora` | Bloque en grilla horaria 6–23h (color del hábito) |

- Checkbox: si hay registro con `valor > 0` → upsert `valor: 0`; si no → upsert `1.0`.
- **Solo total y sin nota** desde Agenda (completación rica → solo desde `/habitos`).
- Hábitos no aparecen en vista Mes.
- **Bug:** toggle-off debería llamar `deleteHabitoRegistro` en lugar de upsert `valor: 0`.

---

## 7. Estado implementado (mayo 2026)

### Hecho

- 3 tabs HOY / Progreso / Historial con layout 3 paneles.
- CRUD hábitos + registros con API y store offline.
- Grilla mensual sticky, `CompletarModal`, `NuevoHabitoModal`.
- Integración Agenda HOY (lista + grilla horaria).
- Accent verde Arcoíris; i18n keys en `i18n.js`.
- Seeds de ejemplo en BD.
- **Bot:** `/habitos` (Total/Parcial/Deshacer inline), `/hecho` (fuzzy match), `/ayer`, `/racha`, `/nota`. Cache 60s. Check-in nocturno 21:00 vía `job_queue`. Port Python de `calcStreak`/`isScheduled` en `agenda_handlers.py`.

### Bugs conocidos

| Bug | Dónde | Impacto |
|-----|-------|---------|
| Desmarcar hábito en Agenda HOY hace upsert `valor: 0` en lugar de DELETE | `Agenda/HoyTab.jsx` | Registros fantasma con valor 0 |
| `maxStreak` no usa `isScheduled` | `HabitosRightPanel`, `ProgresoTab` | Racha máxima puede estar inflada |
| IDs mock offline `h_*`, `reg_*` | Store | Posibles duplicados al reconectar |
| `window.confirm` en eliminar hábito | `HabitosRightPanel` | Rompe estética; sin undo |

---

## 8. Mapa de archivos

```
project/
├── app/main.py                    # Rutas /habitos/*
├── app/db/
│   ├── database.py                # Schema + _seed_habitos
│   └── crud.py                    # habitos_*, habitos_registros_*
├── mybot/agenda_handlers.py       # /habitos, /hecho, /ayer, /racha, /nota + lógica racha Python
├── frontend/src/
│   ├── App.jsx                    # fetchHabitos + fetchHabitosRegistros al mount
│   ├── screens/HabitosScreen.jsx
│   └── components/habitos/
│       ├── habitosUtils.js        # isScheduled, calcStreak, calcMonthPct, …
│       ├── HabitosTabs.jsx
│       ├── HabitosLeftPanel.jsx
│       ├── HabitosRightPanel.jsx
│       ├── HoyTab.jsx
│       ├── ProgresoTab.jsx
│       ├── HistorialTab.jsx
│       ├── NuevoHabitoModal.jsx
│       └── CompletarModal.jsx
```

---

## 9. Dependencias entre piezas

```
NuevoHabitoModal ──POST/PATCH──► habitos ──► HabitosLeftPanel (estado hoy)
                                      │
CompletarModal ──PUT/DELETE──► habitos_registros ──► habitosRegistros (store)
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
              HoyTab grilla    ProgresoTab stats   HistorialTab
                    │
                    └──────── habitosUtils.js ◄─── Agenda HoyTab
                                      │
                              agenda_handlers.py (bot port)
```

**Regla para agentes:** cambiar `calcStreak` / `isScheduled` en `habitosUtils.js` implica revisar los 3 tabs, panel izquierdo, panel derecho y Agenda HOY. Si afecta lógica de racha, también revisar `_calc_racha` / `_is_scheduled` en `agenda_handlers.py`.

---

*Actualizar este archivo cuando se complete algo del roadmap. Referencia de pendientes: `Habitos-Roadmap.md`.*
