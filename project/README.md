**SI HAY CAMBIOS EN EL PROYECTO, ES OBLIGATORIO ACTUALIZAR ESTE README.**

# SGR — `project/`

Aplicación local full-stack (español) para capturar conocimiento (**Bóveda**), llevar finanzas personales (**Finanzas**), gestionar tiempo y tareas (**Agenda**) y construir hábitos (**Hábitos**). SQLite + API propia; UI React. Casi todo corre **offline** en la máquina del usuario. Lo único pensado como online es el **bot de Telegram** (`mybot/`), que llama al mismo REST.

**Spec de producto y decisiones nuevas:** `../Prompt.md`. **Comandos de arranque:** `../CLAUDE.md`.

---

## Stack

| Capa | Tecnología |
|------|------------|
| API | FastAPI, Pydantic, `uvicorn` |
| Datos | SQLite (`database/app.db`), migraciones en `init_db()` al startup |
| UI | React 18, Vite, React Router, Zustand, Tailwind (tokens vía CSS vars) |
| Gráficos Bóveda | D3 (`NetworkGraph.jsx`) |
| Rich text | TipTap (apuntes en hojas) |
| Iconos | `lucide-react` |
| Referencia visual | `../ClaudeDesign/` (HTML estático; no es el runtime) |

---

## Arranque rápido

```powershell
# Backend (desde project/)
.\venv\Scripts\activate
uvicorn app.main:app --reload    # :8000

# Frontend
cd frontend
npm install
npm run dev                      # :5173  →  API_URL en src/config.js
```

Bot opcional: `python mybot/bot.py` + `TELEGRAM_BOT_TOKEN` en `.env`. Build producción: `npm run build` → `frontend/dist/` (el backend puede servir estáticos).

---

## Arquitectura (cómo está armado)

### Flujo de datos

```
Componente  →  useStore (acción)  →  fetch(API)  →  crud.py  →  SQLite
                    ↓
              set() en Zustand  →  re-render
```

- **Un solo store** (`frontend/src/store/useStore.js`): Bóveda + Finanzas + Agenda + Hábitos + tema/idioma/toast/modales.
- **Sin capa de servicios** en frontend; sin React Query. Mutaciones: update optimista local + try/catch offline.
- **Backend plano:** casi todas las rutas en `app/main.py`; SQL en `app/db/crud.py`. Carpetas `app/routes/` y `app/services/` existen pero **no se usan**.
- **`DEBUG`** en `app/config.py` — logs solo si está activo.

### Rutas de la app (frontend)

| Ruta | Pantalla | Layout |
|------|----------|--------|
| `/` | `BrowseScreen` — grafo (desktop) o lista (mobile) | 3 paneles; sin sidebar global |
| `/capture` | `CaptureScreen` (legacy; captura principal = modal) | — |
| `/hoja/:id` | `DetailScreen` | Con sidebar Bóveda |
| `/finanzas` | `FinanzasScreen` — 5 tabs | 3 columnas: izq / centro / der (der solo xl) |
| `/agenda` | `AgendaScreen` — 4 tabs | 3 columnas: izq / centro / der (der solo xl) |
| `/habitos` | `HabitosScreen` — 3 tabs | 3 columnas: izq / centro / der (der solo xl) |
| `/settings` | `SettingsScreen` | Con sidebar |

Modales globales en `App.jsx`: `CaptureModal` (Bóveda), `MovementModal` (Finanzas), `TweaksPanel` (temas/tono/fuentes, Ctrl+M).
Modal Agenda en `AgendaScreen`: `EventoModal` (CTA TopBar o clic en día), `HorarioFacultadModal` (botón Facultad en tabs bar).
Modal Hábitos en `HabitosScreen`: `NuevoHabitoModal` (CTA TopBar `openHabitoModal` o botón panel izq), `CompletarModal` (click en celda de grilla, inline).

`Layout.jsx`: en `/`, `/finanzas`, `/agenda` y `/habitos` oculta el sidebar de Bóveda y delega scroll al módulo. Gestiona accent Arcoíris por ruta (`ARCOIRIS_ACCENTS`).

### Módulo Bóveda

**Dominio:** árbol de `categorias` (`padre_id`) + `hojas` (`tipo`: texto | link | foto; `contenido`, `apuntes` HTML, geo, recordatorio, `icono`).

**Piezas clave:** `LeftPanel` (árbol + búsqueda), `NetworkGraph` (fuerza D3, datos desde store), `RightPanel` (detalle + TipTap), `CaptureModal` (autodetect `detectType.js`, Ctrl+Enter).

**Temas:** `utils/themes.js` — mapas de variables CSS (`--bg`, `--accent`, …), **tonos** (`TONES`) y **pares tipográficos** (`FONT_PAIRS`, 6 presets). Persistencia en `localStorage`. Tema Arcoíris cambia acento por ruta.

### Módulo Finanzas

**Entrada:** `FinanzasScreen` + `DashboardTabs` (Dashboard | Anual | FIRE | Ahorro | Datos).

| Tab | Centro | Panel derecho (xl) | Selector mes/año |
|-----|--------|--------------------|------------------|
| Dashboard | Donuts, listas movimientos, cuotas, notas | Cuotas + gasto por categoría + metas FIRE/emergencia (legacy) | Sí (`selectedMes`) |
| Anual | Resumen año, barras, tabla meses, categorías | Highlights, comparación, inflación editable | Solo año |
| FIRE | Tabla plan mensual editable | % aumento aporte mensual, rentabilidad | Oculto |
| Ahorro | Totales, barra distribución, acordeón instrumentos | Objetivos + barra meta FIRE del mes | Oculto |
| Datos | Tabla histórica inline editable | KPIs histórico | Oculto |

**Panel izquierdo** (`FinanzasLeftPanel`): saldo cuentas, ingresos/gastos del mes, tasa ahorro, grupos Billeteras/Bancos/En mano, dólar oficial manual (`fin_config.dolar_oficial`).

**Reglas de negocio compartidas** (`data/finanzas.js`):
- `isTransferencia(m)` — categoría `transferencia` (case-insensitive) excluida de totales.
- Mock `FINANZAS` si falla el API (mismo patrón en todo el módulo).
- Helpers `fmtARS` / `fmtUSD`.

**Categoría `Ahorro` (exacta):** gasto suma al ahorro; ingreso resta (retiro a disponible). Objetivos matchean por **descripción = nombre del objetivo**; movimientos sin objetivo → **sin asignar** pero suman al total bruto.

**Dólar:** `fin_config.dolar_oficial` — conversión manual ARS ↔ USD en Ahorro/Anual; sin API de cotización.

### Módulo Agenda

**Entrada:** `AgendaScreen` (HOY | Mes | Tareas | Revisión).

**HOY:** grilla horaria 6–23h; tareas pendientes próximos 15 días en panel izq con checkbox y time blocking; capa facultad opacada. **Integración hábitos:** sección "Hábitos de hoy" en panel izq (hábitos sin hora con checkbox inline), bloques en grilla horaria (hábitos con hora).

**Mes:** vista 6×7 + semana; toggle calendarios activos; click en celda → `EventoModal`.

**Tareas:** listas con color; filtro pendientes/completadas/todas; detalle en panel derecho.

**Revisión:** selector de semana; completadas vs incompletas; vencidas +7 días; % tiempo planificado; distribución por calendario.

**Horario Facultad:** entidad propia (`agenda_horario_facultad`); solo visible en HOY; gestionado desde `HorarioFacultadModal`.

### Módulo Hábitos

**Entrada:** `HabitosScreen` (HOY | Progreso | Historial). Crear/editar hábitos → `NuevoHabitoModal` (no es una tab).

**HOY:** grilla mensual de un solo scroll container (fix al problema de múltiples scrollbars); columna nombre `sticky left`, columna % `sticky right`. Click en celda → `CompletarModal` (Total verde 1.0 / Parcial amarillo 0.5 + nota corta opcional). Días futuros grises, días sin programar muestran guión.

**Progreso:** resumen semanal/mensual, mensaje de momentum (basado en tendencia), heatmap 3 meses, sparkline 6 meses, tabla de todos los hábitos con racha/pct/tendencia.

**Historial:** calendario mensual coloreado por % de completación del día, notas de registros en hover, filtro por hábito.

**Panel izquierdo:** lista de hábitos activos con estado del día (hecho / parcial / pendiente / no toca), streak ≥3 con 🔥, barra de progreso del día.

**Panel derecho (xl):** detalle del hábito seleccionado: descripción, racha actual/máxima/% mes, registros recientes con notas, botones editar/eliminar.

**Frecuencia:** `diario` (todos los días) | `semanal` (días específicos de la semana, JSON array de índices 0=Dom…6=Sáb). Hora opcional: si está definida, el hábito aparece en la grilla horaria de Agenda HOY.

**Racha:** días consecutivos con `valor > 0` (parcial mantiene racha). Los días no programados no rompen la racha. Cálculo client-side en `habitosUtils.js`.

**`habitosUtils.js`:** helpers compartidos entre los 3 tabs — `isScheduled`, `calcStreak`, `calcMonthPct`, `buildRegistrosMap`, `toISODate`, `todayStatus`.

---

## Modelo de datos Finanzas (SQLite)

Tablas creadas en `app/db/database.py`:

| Tabla | Uso |
|-------|-----|
| `fin_cuentas` | Billeteras/bancos/efectivo; saldos ARS/USD editables |
| `fin_categorias` | Gasto/ingreso/both; seed incluye `Ahorro`, `Emergencia` |
| `fin_movimientos` | Movimientos del mes e histórico |
| `fin_config` | Clave-valor (`dolar_oficial`, `fire_*`, `tasa_ahorro_objetivo`, …) |
| `fin_notas` | Notas del dashboard |
| `fin_instrumentos` | Posiciones Ahorro (tipo polimórfico: acciones, FCI, plazo fijo, ONs, crypto, otros) |
| `fin_objetivos` | Metas de ahorro (nombre único, meta, moneda, fecha límite, cuota mensual) |
| `fin_fire_filas` | Override opcional de `ahorrado` por mes (`YYYY-MM`) |
| `fin_inflacion` | % inflación mensual (tab Anual, ajuste nominal/real) |

API bajo `/fin/*` — cuentas, categorías, movimientos GET con/sin `?mes=`, PATCH movimientos, instrumentos, objetivos, fire-filas, inflación, config, notas, emergencia (legacy).

**Dual schema en movimientos:** el mock y partes del front usan `type`/`amount`/`cat`; la API devuelve `tipo`/`monto`/`categoria_nombre`. Normalizar al leer/escribir.

---

## Modelo de datos Agenda (SQLite)

| Tabla | Uso |
|-------|-----|
| `agenda_calendarios` | Calendarios con color y toggle activo/inactivo |
| `agenda_eventos` | Eventos con fecha inicio/fin, todo_el_dia, se_repite, calendario_id |
| `agenda_listas` | Listas de tareas con color |
| `agenda_tareas` | Tareas con fecha/hora opcional, hora_bloque (time blocking), duracion_estimada, completada, lista_id |
| `agenda_horario_facultad` | Horario recurrente por día de semana; visible solo en vistas horarias |

API bajo `/agenda/*` — calendarios, eventos, listas, tareas, horario-facultad. Seed por defecto: 3 calendarios (Personal, Trabajo, Facultad) + 2 listas (Personal, Trabajo).

---

## Modelo de datos Hábitos (SQLite)

| Tabla | Uso |
|-------|-----|
| `habitos` | Definición del hábito: nombre, descripcion, color, categoria (libre), frecuencia_tipo ('diario'\|'semanal'), dias_semana (JSON, null si diario), hora (nullable), activo |
| `habitos_registros` | Completaciones: habito_id, fecha (YYYY-MM-DD), valor (0.5=parcial / 1.0=total), nota. UNIQUE(habito_id, fecha) → upsert con `ON CONFLICT` |

API bajo `/habitos/*`:
- `GET /habitos` — lista todos los hábitos
- `POST /habitos` — crear hábito
- `PATCH /habitos/{id}` — actualizar hábito
- `DELETE /habitos/{id}` — eliminar hábito (CASCADE a registros)
- `GET /habitos/registros?habito_id=&fecha_desde=&fecha_hasta=` — obtener registros
- `PUT /habitos/{id}/registro` — upsert registro para una fecha
- `DELETE /habitos/registros/{id}` — eliminar registro

Seed por defecto: 3 hábitos de ejemplo (Meditar, Correr, Leer).

---

## Estado implementado vs pendiente (mayo 2026)

### Bóveda — hecho

- Grafo conectado a API, barra superior estilo ClaudeDesign, modal captura (Ctrl+Enter), 6 temas + tonos + pares de fuentes, Tweaks Ctrl+M.
- Módulos Hábitos en UI de captura **deshabilitados**.

### Finanzas — hecho

- **Dashboard:** donuts, tarjetas movimientos, modal "ver todos" (sort 3-clicks + filtro categoría), cuotas, notas, panel derecho KPIs/cuotas/categorías.
- **Datos:** histórico completo, edición inline blur, delete sin confirmación, columnas reordenadas, fecha `DD-MM-AAAA`, PATCH backend.
- **Anual:** agregados por año, gráfico barras nominal/real, tabla meses, inflación mensual editable, panel derecho.
- **FIRE:** tabla mensual con proyección (aporte compuesto, interés, saldo), overrides de ahorrado, panel config (% aumento mensual, rentabilidad).
- **Ahorro:** totales ARS/USD, "líquido sin invertir", barra por tipo, secciones colapsables por instrumento, CRUD instrumentos, objetivos en panel derecho con modal, P&L básico.
- Scrollbars Finanzas tematizados (`.panel-scroll` en `index.css`).

### Finanzas — parcial / deuda conocida

- **MovementModal:** no valida "categoría Ahorro sin objetivo" con error al guardar.
- **Emergencia:** API `/fin/emergencia` y categoría `Emergencia` siguen en código; spec = migrar a objetivo `Fondo de Emergencia`.
- **Ahorro vs movimientos:** dos fuentes (ledger instrumentos vs suma categoría Ahorro); "líquido sin invertir" reconcilia parcialmente.
- **FIRE:** tabla superior de hitos por edad — spec pide recalcular desde último saldo real.
- **Instrumentos:** ventas parciales, splits, dividendos — spec futuro.
- **Config bancos** en panel izquierdo: incompleto respecto al prompt.

### Agenda — hecho

- **HOY (default):** grilla horaria 6–23h; tareas pendientes próximos 15 días con checkbox y time blocking; indicador "ahora" en tiempo real; capa horario facultad opacada; bloque expirado sin completar → se borra automáticamente al montar. Integración hábitos: sección + bloques en grilla.
- **Mes:** vista 6×7 + semana; chips sólidos eventos, chips punteados tareas; toggle calendarios; click → `EventoModal`.
- **Tareas:** gestión de listas (crear/renombrar/colorear/eliminar); filtro pendientes/completadas/todas; detalle en panel derecho.
- **Revisión:** selector de semana; completadas vs incompletas; vencidas +7 días; % tiempo planificado; distribución por calendario (incluyendo Facultad).
- **Horario Facultad:** CRUD vía `HorarioFacultadModal`; visible solo en HOY; no aparece en Mes.
- Store: slice completo con fallback offline en cada acción.

### Hábitos — hecho

- **HOY (default):** grilla mensual con scroll único y columnas sticky; click → `CompletarModal` (Total verde / Parcial amarillo) + nota corta; días futuros grises; días sin programar con guión.
- **Progreso:** resumen semanal/mensual/vs anterior; mensaje de momentum; heatmap 3 meses; sparkline 6 meses; tabla stats por hábito (racha/pct/tendencia).
- **Historial:** calendario mensual coloreado por % del día; notas en hover; filtro por hábito; selector de período.
- **Panel izquierdo:** lista de hábitos con estado del día, streak ≥3 con 🔥, barra de progreso.
- **Panel derecho (xl):** descripción, racha actual/máxima, % mes, registros recientes, editar/eliminar.
- **NuevoHabitoModal:** nombre, descripción, color picker, categoría libre, frecuencia diario/días específicos, hora opcional.
- **Integración Agenda HOY:** sección "Hábitos de hoy" en panel izq (sin hora, checkbox inline); bloques en grilla horaria (con hora).
- **BD + API:** `habitos` + `habitos_registros`, upsert por fecha. API bajo `/habitos/*`.
- **Accent Arcoíris** `/habitos` = verde `#059669`.
- Store: slice completo (`habitos`, `habitosRegistros`, acciones CRUD + `upsertHabitoRegistro`) con fallback offline.

### No implementado

- Patrimonio como tab separada.
- Bot Finanzas (captura solo Bóveda vía Telegram).
- Tests automatizados.

---

## Convenciones para agentes

1. **Leer primero** `../Prompt.md` para la tab o feature pedida; este README para arquitectura y estado.
2. **No re-explorar** rutas ya listadas abajo si el cambio es acotado.
3. **Offline:** toda acción del store debe funcionar si `fetch` falla (update optimista local + try/catch).
4. **i18n:** strings en `frontend/src/utils/i18n.js` (`t(lang, key)`), no hardcodear copy visible.
5. **Estilos:** variables CSS del tema; clases Tailwind `app-*`; cards usan `panel-strong`, `label`, `serif`, `mono`, `tnum`.
6. **Backend:** nueva ruta → `main.py` + función en `crud.py` + migración en `database.py` si hace falta columna/tabla.

---

## Mapa de archivos (solo lo crítico)

```
project/
├── app/
│   ├── main.py              # TODAS las rutas HTTP (Bóveda + Finanzas + Agenda + Hábitos)
│   ├── config.py            # DEBUG, DB_PATH, límites
│   └── db/
│       ├── database.py      # init_db, seeds (_seed_finanzas, _seed_agenda, _seed_habitos), migrations
│       └── crud.py          # SQL Bóveda + Finanzas + Agenda + Hábitos
├── frontend/src/
│   ├── App.jsx              # Router + fetch inicial + modales
│   ├── store/useStore.js    # Estado global (Bóveda + Finanzas + Agenda + Hábitos)
│   ├── screens/
│   │   ├── BrowseScreen.jsx
│   │   ├── FinanzasScreen.jsx
│   │   ├── AgendaScreen.jsx
│   │   └── HabitosScreen.jsx
│   ├── components/
│   │   ├── NetworkGraph.jsx, CaptureModal.jsx, TopBar.jsx, TweaksPanel.jsx
│   │   ├── Layout.jsx           # Accent Arcoíris por ruta (ARCOIRIS_ACCENTS)
│   │   ├── finanzas/
│   │   │   ├── DashboardTabs.jsx, FinanzasLeftPanel.jsx, FinanzasRightPanel.jsx
│   │   │   ├── MovementModal.jsx, MovimientosTableModal.jsx
│   │   │   ├── DatosTab.jsx, DatosRightPanel.jsx
│   │   │   ├── AhorroTab.jsx, AhorroRightPanel.jsx
│   │   │   ├── FireTab.jsx, FireRightPanel.jsx
│   │   │   └── AnualTab.jsx, AnualRightPanel.jsx
│   │   ├── agenda/
│   │   │   ├── AgendaTabs.jsx, MiniCalendar.jsx
│   │   │   ├── HoyTab.jsx       # Incluye integración hábitos
│   │   │   ├── MesTab.jsx
│   │   │   ├── TareasTab.jsx
│   │   │   ├── RevisionTab.jsx
│   │   │   └── EventoModal.jsx, TareaModal.jsx, HorarioFacultadModal.jsx
│   │   └── habitos/
│   │       ├── habitosUtils.js  # isScheduled, calcStreak, calcMonthPct, buildRegistrosMap, …
│   │       ├── HabitosTabs.jsx
│   │       ├── HabitosLeftPanel.jsx
│   │       ├── HabitosRightPanel.jsx
│   │       ├── HoyTab.jsx       # Grilla mensual + CompletarModal
│   │       ├── ProgresoTab.jsx
│   │       ├── HistorialTab.jsx
│   │       ├── NuevoHabitoModal.jsx
│   │       └── CompletarModal.jsx
│   ├── data/finanzas.js     # Mock + isTransferencia
│   └── utils/themes.js, i18n.js, detectType.js
├── mybot/bot.py
├── database/app.db
└── uploads/
```

---

## API resumen

**Bóveda:**
- `GET/POST /categorias`, `DELETE /categorias/{id}`
- `GET/POST /hojas`, `GET/PATCH/DELETE /hojas/{id}`
- `POST /upload`, `GET /preview?url=`

**Finanzas** (`/fin/*`): cuentas, categorías, movimientos, config, notas, instrumentos, objetivos, fire-filas, inflación, emergencia (legacy).

**Agenda** (`/agenda/*`): calendarios, eventos, listas, tareas, horario-facultad.

**Hábitos** (`/habitos/*`): hábitos CRUD, registros GET/PUT/DELETE.

CORS dev: `http://localhost:5173`.

---

## Decisiones arquitectónicas implícitas

| Decisión | Motivo / efecto |
|----------|-----------------|
| Monolito en `main.py` + `crud.py` | Velocidad de iteración; poco acoplamiento formal |
| Zustand único | Estado compartido entre módulos; riesgo de archivo grande |
| Mock fallback en catch | UX offline-first para todos los módulos |
| `finMovimientos` vs `finMovimientosAll` | Mes actual vs histórico (Datos, Ahorro, Anual, FIRE) |
| Instrumentos en tabla polimórfica | Un CRUD; campos opcionales por `tipo` |
| Objetivos por nombre = descripción movimiento | Sin tabla puente movimiento↔objetivo |
| FIRE: proyección en front + overrides en BD | Cálculo pesado en cliente; persistir solo excepciones |
| Temas como CSS variables | ClaudeDesign portado sin reescribir componentes |
| Hábitos: registros por fecha con UNIQUE | Upsert simple con `ON CONFLICT DO UPDATE` |
| Hábitos: cálculo de racha/stats en cliente | Sin columnas calculadas en BD; `habitosUtils.js` es la fuente de verdad |
| Integración Hábitos↔Agenda: unidireccional | Hábitos es source of truth; Agenda HOY solo muestra y permite check rápido |

---

## Dependencias entre piezas Finanzas

```
MovementModal ──POST──► fin_movimientos ──► finMovimientos / finMovimientosAll
                              │
                              ├──► Dashboard (filtro mes)
                              ├──► DatosTab (histórico, PATCH)
                              ├──► AnualTab (agregados año + inflación)
                              ├──► AhorroTab (total bruto categoría Ahorro)
                              │         └── vs fin_instrumentos (portfolio)
                              ├──► AhorroRightPanel (objetivos por descripción)
                              └──► FireTab (ahorrado residual + overrides)

fin_config.dolar_oficial ──► conversión ARS/USD en Ahorro, Anual, FIRE display
FinanzasLeftPanel ◄── fin_cuentas, finMovimientos (mes)
```

Para cualquier feature nueva en Finanzas: revisar impacto en **ambos** slices de movimientos, regla `isTransferencia`, y si la tab usa mes (`selectedMes`) o histórico completo.

## Dependencias entre piezas Hábitos

```
NuevoHabitoModal ──POST──► habitos ──► HabitosLeftPanel (estado hoy)
                                │
                                └──► HoyTab (grilla mensual)
                                └──► ProgresoTab (stats/heatmap)
                                └──► HistorialTab (calendario)
                                └──► HabitosRightPanel (detalle)
                                └──► AgendaScreen/HoyTab (integración)

CompletarModal ──PUT──► habitos_registros ──► habitosRegistros (store)
                              └──► buildRegistrosMap() ──► todas las vistas
```

`habitosUtils.js` es la fuente de verdad para `calcStreak`, `calcMonthPct`, `isScheduled`. Cualquier cambio en la lógica de completación impacta los 3 tabs y la integración con Agenda.
