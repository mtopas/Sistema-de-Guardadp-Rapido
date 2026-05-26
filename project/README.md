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
uvicorn app.main:app --reload --port 8765

# Frontend
cd frontend
npm install
npm run dev                      # :5173  →  API en :8765 (src/config.js)
```

Bot opcional: `python mybot/bot.py` + `TELEGRAM_BOT_TOKEN` en `.env` (misma API en `:8765`). Build producción: `npm run build` → `frontend/dist/` (el backend puede servir estáticos).

**Ejecutable Windows (.exe):** ver [`BUILD.md`](BUILD.md) — PyInstaller → `dist/SGR/`; abre **`http://127.0.0.1:8765/`**; mismos datos que en dev en `project/database/` y `project/uploads/`.

### Puertos y URLs (local)

| Servicio | URL / puerto | Notas |
|----------|----------------|--------|
| API SGR (uvicorn, `.exe`) | `http://127.0.0.1:8765` | Default en `app/config.py` (`SGR_PORT=8765`). Evita `:8000` (p. ej. SimLab, uvicorn genérico). |
| UI dev (Vite) | `http://127.0.0.1:5173` | `API_URL` → `:8765` salvo `VITE_API_URL` en `.env` |
| UI prod / `.exe` | mismo origen que la API | `API_URL` vacío en build; todo en `:8765` |
| Bot Telegram | `API_BASE_URL` en `.env` | Default `http://127.0.0.1:8765` vía `app/config.py` |

Override: `SGR_PORT`, `SGR_HOST`, `API_BASE_URL` o `DB_PATH` — ver [`BUILD.md`](BUILD.md). Ejemplo: copiá `.env.example` → `.env`.

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

**Temas:** `utils/themes.js` — mapas de variables CSS (`--bg`, `--accent`, …), **tonos** (`TONES`) y **pares tipográficos** (`FONT_PAIRS`, 6 presets). **Temas y tonos son por sección** (`sgr-theme-{section}`, `sgr-tone-{section}` en `localStorage`); la tipografía es global. `setCurrentSection` en el store aplica el tema de la sección al navegar. Tema Arcoíris cambia acento por ruta (lógica centralizada en `_applyArcoirisAccent` en el store).

### Módulo Finanzas

**Entrada:** `FinanzasScreen` + `DashboardTabs` (Dashboard | Anual | FIRE | Ahorro | Datos).

| Tab | Centro | Panel derecho (xl) | Selector mes/año |
|-----|--------|--------------------|------------------|
| Dashboard | Donuts, listas movimientos, cuotas, notas | Cuotas + gasto por categoría + metas FIRE/emergencia (legacy) | Sí (`selectedMes`) |
| Anual | Resumen año, barras, tabla meses, categorías | Highlights, comparación, inflación editable | Solo año |
| FIRE | Tabla plan mensual editable | % aumento aporte mensual, rentabilidad | Oculto |
| Ahorro | Totales, barra distribución, acordeón instrumentos | Objetivos + barra meta FIRE del mes | Oculto |
| Datos | Tabla histórica inline editable | KPIs histórico | Oculto |

**Panel izquierdo** (`FinanzasLeftPanel`): saldo cuentas, ingresos/gastos del mes, tasa ahorro, grupos Billeteras/Bancos/En mano, widget cotización dólar (MEP + oficial compra) con botón "↻ Actualizar" que llama a `GET /fin/dolar/cotizacion`.

**Reglas de negocio compartidas** (`data/finanzas.js`):
- `isTransferencia(m)` — categoría `transferencia` (case-insensitive) excluida de totales.
- Helpers `fmtARS` / `fmtUSD`. Sin mock — sin backend la app muestra estado vacío.

**Categoría `Ahorro` (exacta):** gasto suma al ahorro; ingreso resta (retiro a disponible). Objetivos matchean por **descripción = nombre del objetivo**; movimientos sin objetivo → **sin asignar** pero suman al total bruto.

**Dólar:** `fin_config.dolar_mep` (MEP, fuente principal) y `fin_config.dolar_oficial_compra` (oficial compra, referencia). Se obtienen vía `GET /fin/dolar/cotizacion` → `dolarapi.com`; se cachean en `fin_config` para uso offline. FIRE, Ahorro y Anual usan `dolar_mep ?? dolar_oficial` (fallback al valor manual previo). `dolar_actualizado_at` auto-stamped al actualizar.

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
| `agenda_eventos` | Eventos con fecha inicio/fin, todo_el_dia, se_repite, calendario_id, creado_en, actualizado_en |
| `agenda_listas` | Listas de tareas con color |
| `agenda_tareas` | Tareas con fecha/hora opcional, hora_bloque (time blocking), duracion_estimada, completada, lista_id, creado_en, actualizado_en |
| `agenda_horario_facultad` | Horario recurrente por día de semana; visible solo en vistas horarias |

API bajo `/agenda/*` — calendarios, eventos, listas, tareas, horario-facultad. Sin seed — arranca vacío. Índice `idx_eventos_inicio` en `agenda_eventos(fecha_inicio)`.

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

Sin seed — arranca vacío.

---

## Estado implementado vs pendiente (mayo 2026)

### Bóveda — hecho

- Grafo conectado a API, barra superior ClaudeDesign, modal captura (`Ctrl+Enter`), 6 temas + tonos + pares de fuentes, Tweaks `Ctrl+M`.
- **NetworkGraph:** click en hoja → abre RightPanel; tooltip hover (título + tipo + categoría); `cursor:pointer` hojas / `cursor:grab` fondo; aviso "+N" cuando hay >14 hojas por rama; ARIA completo. `parseGraph.js` + `DetailPanel.jsx` eliminados.
- **LeftPanel:** estado expansión en `localStorage`; expandir/colapsar todo; highlight búsqueda; botón "+ Hoja" inline por categoría (`openCaptureWith`); formulario inline "Nueva subcategoría".
- **RightPanel:** título editable al click; breadcrumb → select categoría; indicador "⚠ Sin guardar" si falla la red; TipTap Extension `Link` + `Placeholder`.
- **CaptureModal:** pre-selecciona última categoría usada (`localStorage`) y `captureDefaultCategoriaId` del store; `role="dialog"` + `aria-modal` + focus trap. Tab Hábitos habilitado con formulario compacto.
- **Store Bóveda:** `crearHoja` con update optimista (temp id + rollback); `updateHoja(id, patch)` genérico; `openCaptureWith(categoriaId)`.
- **Backend:** `HojaPatch` ampliado (contenido, categoria_id, tipo); `GET /hojas?q=&tipo=&categoria_id=`; `GET /hojas/recientes?limit=`; `PATCH /categorias/{id}`; `DELETE /categorias/{id}` con 409 si tiene hojas; índices SQLite en `hojas`; DELETE archivo al borrar foto.
- Link preview server-side, tags + cross-links en grafo.
- **Bot Bóveda completo:** inline keyboards, subcategorías, `/rapido`, `/ultimas`, `/buscar`, forward, ubicación, foto con caption, caché 60s, healthcheck `/categorias`. Prefijos Agenda: `t:`/`e:`.

### Finanzas — hecho

- **Dashboard:** donuts con tooltip hover monto/% por segmento e highlight interactivo; tarjetas movimientos; modal "ver todos" (sort 3-clicks + filtro categoría + **export CSV**); cuotas; notas; panel derecho.
- **Datos:** histórico completo, edición inline blur con **debounce 300ms**, delete, orden por fecha. `scope="col"` en headers de tabla.
- **Anual:** agregados por año, gráfico barras nominal/real, tabla meses, inflación mensual editable, panel derecho.
- **FIRE:** tabla mensual con proyección, overrides ahorrado, panel config.
- **Ahorro:** totales ARS/USD, "líquido sin invertir", barra por tipo, instrumentos colapsables, CRUD, objetivos, P&L. Tokens CSS `var(--warning)`/`var(--success)` (antes hex hardcoded).
- **`MovementModal`:** `Ctrl+Enter` guarda; validación "Ahorro sin objetivo" con warning inline; chips de plantillas rápidas; autocompletar última cuenta/categoría desde `localStorage`.
- **`FinanzasMobileDrawer`:** botón "Ver resumen" en `< md` abre `FinanzasLeftPanel` como drawer deslizante.
- **Code-split:** `AnualTab`, `FireTab`, `AhorroTab`, `DatosTab` con `React.lazy` + `Suspense`. Prefetch `finMovimientosAll` al montar.
- **`MovimientosTableModal`:** botón export CSV con los movimientos actualmente filtrados.
- **Store:** `finActiveTab` + `setFinActiveTab`; `normalizeMovimiento()` centralizado.
- **`utils/months.js`** centralizado; `DashboardTabs` y otros ya lo usan.
- **`prefers-reduced-motion`** para `.anim-card-in`.
- **Toast:** `role="status"/"alert"` + `aria-live` para screen readers.
- **i18n:** `finSaldosCuenta`, `finBlue`, `finActual` en `i18n.js`; `FinanzasLeftPanel` sin strings hardcodeados.
- **Backend:** índices SQL `(fecha)`, `(categoria_id)`, `(tipo, fecha)` en `fin_movimientos`; `dolar_oficial_updated_at` auto-stamped en PUT; `mes_cierre` en config; `GET /fin/movimientos/resumen?mes=`.
- Scrollbars Finanzas tematizados (`.panel-scroll`).

### Finanzas — deuda conocida

- **Emergencia:** `GET /fin/emergencia` sigue en código — pendiente migrar a objetivo `Fondo de Emergencia`.
- **FIRE:** hitos por edad sin recalcular desde saldo real.
- **Instrumentos:** ventas parciales, splits, dividendos — spec futuro.
- **Dual schema movimientos:** `normalizeMovimiento()` existe pero no se aplica en todos los consumidores todavía.
- **TopBar búsqueda:** input existe pero no filtra nada.

### Agenda — hecho

- **HOY (default):** grilla horaria 6–23h; navegación de día (prev/next + botón "hoy"); scroll automático a la hora actual al montar; click en slot vacío → `EventoModal` prellenado con hora; chips all-day encima de la grilla; tareas pendientes próximos 15 días con checkbox y time blocking; indicador "ahora" en tiempo real (pulso animado `.now-dot`); capa horario facultad opacada; bloques con animación `.block-new`. Integración hábitos: sección + bloques en grilla. Filtros memoizados con `useMemo`.
- **Mes:** vista 6×7 + semana; chips sólidos eventos, chips punteados tareas; toggle calendarios; click → `EventoModal`. Bordes de hora en vista Semana corregidos (`style2` → `style`).
- **Tareas:** gestión de listas (crear/renombrar/colorear/eliminar); filtro pendientes/completadas/todas; detalle en panel derecho.
- **Revisión:** selector de semana; completadas vs incompletas; vencidas +7 días; sparkline de completadas por día (L–D); botón exportar Markdown; % tiempo planificado con denominador correcto (16h despierto × 7 = 6720 min, incluye bloques de tareas); distribución por calendario (incluyendo Facultad).
- **Horario Facultad:** CRUD vía `HorarioFacultadModal`; visible solo en HOY; no aparece en Mes. Modal con Escape + backdrop blur.
- **AgendaModalShell:** shell reutilizable para modales de Agenda (header, footer, Escape, Ctrl+Enter, backdrop blur). Usado en `EventoModal` y `TareaModal`.
- **`agendaUtils.js`:** `toLocalISODate` + `HOURS`, `HOUR_HEIGHT`, `timeToMinutes`, `minutesToTop` (compartidas entre HoyTab y otros).
- **Tab en URL:** `AgendaScreen` lee/escribe `?tab=` en search params vía `useLocation`/`useNavigate`; permite deep-link y navegación con back/forward.
- **CSS animations:** `index.css` — `.tab-enter`, `.now-dot` (pulso), `.block-new` (scaleY), `.modal-overlay` (fade-in).
- Store: slice completo con fallback offline en cada acción. Desmarcar hábito en HOY usa `deleteHabitoRegistro` (DELETE real, sin registros fantasma). `showToast` al guardar en modales.
- **Fechas TZ-safe:** `toLocalISODate()` en `agendaUtils.js` reemplaza `toISOString().slice(0,10)` en todos los tabs; evita desfase en UTC−3 pasadas las 21 h.
- **BD:** `agenda_eventos.calendario_id` tiene `ON DELETE CASCADE` (migración automática en `_apply_migrations`); `PRAGMA foreign_keys = ON` activado en `get_connection()`. Migraciones: `creado_en`/`actualizado_en` en `agenda_tareas` y `agenda_eventos`; índice `idx_eventos_inicio`. `actualizado_en` se actualiza en cada PATCH.
- **API:** `GET /agenda/eventos` tiene defaults de rango automáticos (mes actual ±2 meses) cuando no se pasan params. `POST /agenda/tareas` acepta `hora_bloque`.

### Agenda — hecho (mayo 2026 — segunda ronda)

- **Layout columnas eventos solapados:** `layoutTimedEvents()` greedy en `HoyTab`; `_col`/`_totalCols`; CSS `calc(col% + 56px)`.
- **Refetch en navegación:** `useRef(lastFetchedMonth)` en `HoyTab` y `MesTab`; refetch al salir del rango cargado.
- **Panel derecho HOY editable:** click en bloque → selecciona ítem; botón Editar abre modal; drawer en `< xl`.
- **Semáforo vencimiento tareas:** rojo (vencida), ámbar (hoy), normal (futura) en panel izq HOY.
- **Quick-add inline:** input "Nueva tarea..." en panel izq HOY; `QuickEventPopover` al click en slot vacío.
- **Panel derecho Mes editable:** botón Edit2 abre `EventoModal`/`TareaModal` con ítem seleccionado.
- **Confirmación doble eliminar:** `confirmDelete` state en `EventoModal` y `TareaModal`; primer click = confirmar, segundo = DELETE.
- **Vista Semana completa:** franja all-day con chips tareas + eventos todo-el-día; capa facultad en cada columna.
- **Recurrencia UI:** toggle `seRepite` → selector Diario/Semanal/Mensual + días + fecha hasta; serializa a `regla_repeticion` JSON.
- **Validación Pydantic Agenda:** HH:MM para campos hora; `model_validator` fecha_fin > fecha_inicio; `dia_semana` 0–6.
- **`GET /agenda/buscar?q=`:** full-text LIKE en título/descripción eventos y tareas; `{eventos, tareas}` (20 c/u).
- **TopBar búsqueda agenda:** debounce 300ms → dropdown resultados en `/agenda`; placeholder diferenciado.
- **CaptureModal tab Agenda:** habilitado; toggle Evento/Tarea, título, fecha, hora, lista.
- **ARIA AgendaTabs:** `role="tablist"`, `aria-controls`, `id` en tabs.
- **i18n Agenda completo:** 35+ claves nuevas; eliminados hardcoded strings en `TareasTab`, `EventoModal`, `TareaModal`, `RevisionTab`, `MesTab`.

### Agenda — hecho (tercera ronda — mayo 2026)

- **useShallow** en `MesTab` + `RevisionTab`: un solo selector agrupado evita re-renders por cambios de otros módulos.
- **AgendaContextMenu:** portal con posición x/y, cierre Escape/click-fuera, ítems danger; integrado en chips de `MesTab`.
- **Crossfade Mes:** `key={year-month}` en grid + animación `sgr-fade-in 180ms`; CSS `sgr-highlight-pulse` para ítems encontrados por búsqueda.
- **i18n MesTab:** `WEEKDAYS` → `t(lang, 'agendaDiasLargos').split(',')`.
- **Highlight TopBar→Mes:** resultados de búsqueda navegan a `?tab=mes&highlight=ID&highlightDate=YYYY-MM-DD`; `MesTab` salta al mes y aplica clase `sgr-highlight`.
- **TareasTab Inbox:** lista virtual `__inbox__` (tareas sin fecha); siempre visible en panel izq con badge count; botón "Nueva tarea" deshabilitado en Inbox.
- **Toggle descompletar tarea HOY:** `handleBlockToggle` maneja `completada → false`; anima fade + strike-through 200ms antes de confirmar.
- **AgendaModalShell:** focus trap Tab/Shift-Tab + ARIA (`role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-label` en close); grilla HOY tiene `role="grid"` / `role="row"` / `role="gridcell"`.
- **TweaksPanel atajos contextuales:** `agendaActiveTab` en store; sección dinámica en Ctrl+M muestra atajos del tab activo.
- **RevisionTab mejorado:** hábitos incluidos en % tiempo planificado; barra `role="progressbar"` + `aria-valuenow/min/max`; comparación N vs N-1 (delta badge); export PDF via `window.print()`; card "Finanzas · semana" con ingresos/gastos/neto.
- **Motor recurrencia backend:** `_expand_recurring()` en `crud.py`; soporta `diario`, `semanal`, `mensual`; respeta `hasta`; se invoca en `agenda_obtener_eventos`.
- **`GET /agenda/export.ics`:** iCalendar RFC-compliant con `DTSTART`, `DTEND`, `SUMMARY`, `DESCRIPTION`, `UID`.
- **`GET /agenda/notificaciones/pending`:** eventos próximos en ventana configurable (default 15 min); TopBar polling 60s + `Notification API` del browser.
- **Cross-módulo Bóveda↔Agenda:** widget "Próximos eventos" en `RightPanel` con hasta 4 eventos de hoy; navega a `/agenda?tab=hoy`.
- **Cross-módulo Finanzas↔Agenda:** `FinanzasLeftPanel` muestra tareas pendientes con keywords financieros (pagar, cuota, vencimiento…) con link a `/agenda?tab=tareas`; `HoyTab` muestra 💰 en tareas financieras con link a `/finanzas`.
- **Deuda técnica:** `HourGrid.jsx` (grilla horaria reutilizable), `useAgendaDay.js` (hook datos de día), `useAgendaKeyboard.js` (ArrowLeft/Right + T/N), `AgendaPanel.jsx` (aside reutilizable).
- **Bot — nota conversacional:** tras marcar ✓/½, el bot pregunta "¿Querés agregar una nota?" y gestiona la respuesta vía `STEP_HABITO_NOTA`.
- **Bot — `/checkin [HH:MM]`:** ver o cambiar la hora del check-in nocturno; persiste en `checkin_config.json`; reprograma el job sin reiniciar el bot.

### Agenda — deuda conocida

- **Semana en SemanTab propio:** actualmente la vista Semana está embebida en `MesTab`; no hay tab separada.
- **Notificaciones completas:** `agenda_recordatorios` tabla + worker scheduler en backend pendientes.
- **Menú contextual completo:** sólo en chips Mes; falta en slots vacíos HOY, bloques grilla, listas, calendarios.

### Hábitos — hecho

- **HOY:** grilla mensual sticky; anillo SVG de progreso en número del día actual; ARIA `role="grid"` completo; navegación por teclado (flechas + 1/2/Enter/Escape); leyenda; tooltip fecha+nota; scroll automático a hoy; animación `habito-cell-pulse`.
- **Progreso:** resumen semanal/mensual; afirmaciones de identidad con stats reales; heatmap 3 meses (click → navega a HOY del mes); sparkline 6 meses; tabla stats; filtro por categoría; cards "Más consistente" / "Más fallas".
- **Historial:** selector período Mes/Trimestre/Año (multi-grilla); marca ⚡ racha rota por hábito; click en día → `DetalleDiaModal`; tooltip notas seleccionable.
- **Panel izquierdo:** quick-check inline; toggle "Solo pendientes hoy"; empty state con CTA.
- **Panel derecho:** sparkline 30 días; racha máxima con `calcMaxStreak`; modal confirmación eliminar + toast; drawer `HabitosDrawer` en `< xl`.
- **NuevoHabitoModal:** `Ctrl+Enter`; preview frecuencia en vivo; toggle Activo (soft-archive); autocomplete categoría.
- **TopBar campana (en `/habitos`):** dropdown pendientes del día; badge count real; usa `GET /habitos/pendientes-hoy`.
- **CaptureModal tab Hábitos:** habilitado con formulario compacto (nombre + color + frecuencia).
- **Code-split:** `ProgresoTab` + `HistorialTab` con `React.lazy`; `HabitosScreen` usa `useShallow`.
- **Integración Agenda HOY:** sección "Hábitos de hoy" en panel izq (sin hora, checkbox inline); bloques en grilla horaria (con hora).
- **BD + API:** `habitos` + `habitos_registros`, upsert por fecha. Columnas `archivado_en`, `notificar`, `minutos_antes` en `habitos`. `valor` validado ∈ {0.5, 1.0}. Endpoints: `GET /habitos/pendientes-hoy`, `GET /habitos/{id}/stats`, `POST /habitos/registros/batch`. API bajo `/habitos/*`.
- **Rendimiento:** `fetchHabitosRegistros` acotado a últimos 120 días; `useMemo(buildRegistrosMap)` en todos los tabs.
- **Accent Arcoíris** `/habitos` = verde `#059669`.
- Store: slice completo con fallback offline en todas las acciones.

### Bot Telegram — hecho

- **Bóveda:** texto libre → detección automática `tipo=link` si hay URL; inline keyboards de categorías (📂 raíz → hijos en dos pasos); modo rápido `/rapido on|off` (guarda en última categoría sin menú, persiste en `rapido.json`); `/ultimas` (últimas 5 hojas con botón 🗑 eliminar); `/buscar <palabra>` (usa `GET /hojas?q=`); fotos con caption como título directo; forwards → extrae texto/URL; ubicaciones → captura lat/lon; caché categorías 60s; healthcheck `/categorias` al arrancar. Prefijos rápidos: `t:` crea tarea, `e:` crea evento.
- **Agenda:** `/hoy` (eventos + tareas + hábitos integrados), `/dia <fecha>`, `/planificar` (organización del día: ocupado + slots libres + asignación con inline keyboards), `/asignar`, `/tarea` (con parsing de fecha), `/evento` (duración configurable + selección de calendario inline), `/pendientes [lista]` (con lista; acepta filtro por nombre de lista), `/semana`, `/bloquear <N> <HH:MM>`, `/revision`.
- **Hábitos:** `/habitos` (Total/Parcial/Deshacer inline), `/hecho <nombre>` (fuzzy match), `/ayer`, `/racha`, `/nota`. Cache 60 s.
- **Finanzas:** `/mov` (flujo guiado con inline keyboards: tipo → monto → desc → cuenta → categoría → confirmación con preview), `/saldo` (cuentas + equivalente USD), `/mes [YYYY-MM]` (ingresos/gastos/tasa ahorro), `/ahorro` (total mes + objetivos), `/ultimo` (últimos 5 con botón eliminar), `/dolar [valor]` (ver/actualizar tipo de cambio), `/objetivo [nombre]` (progreso con barra). Captura rápida `$: gasto 4500 Super Coto uala` con fuzzy match de cuenta. Seguridad: `BOT_ALLOWED_CHAT_IDS` en `.env`.
- **Infraestructura:** healthcheck al arrancar con backoff exponencial (1→2→4→8 s, 4 intentos); `chat_id` persistido en `chat_id.json`, check-in nocturno 21:00 vía `job_queue`. Dispatcher de callbacks: Finanzas tiene prioridad sobre Agenda/Hábitos.
- **General:** `/help`, `/cancel`, parsers de fecha/hora/duración, port Python de `calcStreak`/`isScheduled`.
- Código: `mybot/bot.py` + `mybot/agenda_handlers.py` + `mybot/finanzas_handlers.py`.

### No implementado

El detalle completo de pendientes por módulo está en los archivos de roadmap:

- **Bóveda:** `Boveda-Roadmap.md` — grafo (zoom/pan), menú contextual, notificaciones. Bot Bóveda: completo (ver `Boveda.md §6`).
- **Finanzas:** `Finanzas-Roadmap.md` — bot, frontend, backend, notificaciones.
- **Agenda:** `Agenda-Roadmap.md` — bot (menor), frontend, backend, notificaciones.
- **Hábitos:** `Habitos-Roadmap.md` — bugs P0, frontend, backend, notificaciones.
- **Global:** patrimonio como tab separada, tests automatizados.

---

## Convenciones para agentes

1. **Leer primero** `../Prompt.md` para la tab o feature pedida; este README para arquitectura y estado.
2. **Documentación por módulo** (qué está hecho, cómo funciona): `Boveda.md`, `Finanzas.md`, `Agenda.md`, `Habitos.md`.
3. **Roadmap / pendientes** (qué falta, bugs, ideas): `Boveda-Roadmap.md`, `Finanzas-Roadmap.md`, `Agenda-Roadmap.md`, `Habitos-Roadmap.md`.
4. **No re-explorar** rutas ya listadas abajo si el cambio es acotado.
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
│   │   │   ├── agendaUtils.js        # toLocalISODate, HOURS, HOUR_HEIGHT, timeToMinutes, minutesToTop
│   │   │   ├── AgendaModalShell.jsx  # Shell reutilizable: Escape, Ctrl+Enter, backdrop blur
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
├── mybot/bot.py                  # Entry point + handlers Bóveda + dispatcher callbacks
├── mybot/agenda_handlers.py      # Handlers Agenda + Hábitos (commands + callbacks)
├── mybot/finanzas_handlers.py    # Handlers Finanzas (commands + callbacks + captura $:)
├── Boveda.md                # Documentación técnica del módulo Bóveda
├── Boveda-Roadmap.md        # Pendientes Bóveda
├── Finanzas.md              # Documentación técnica del módulo Finanzas
├── Finanzas-Roadmap.md      # Pendientes Finanzas
├── Agenda.md                # Documentación técnica del módulo Agenda
├── Agenda-Roadmap.md        # Pendientes Agenda
├── Habitos.md               # Documentación técnica del módulo Hábitos
├── Habitos-Roadmap.md       # Pendientes Hábitos
├── database/app.db
└── uploads/
```

---

## API resumen

**Bóveda:**
- `GET/POST /categorias`, `PATCH/DELETE /categorias/{id}` (`?forzar=true` si tiene hojas)
- `GET/POST /hojas`, `GET /hojas?q=&tipo=&categoria_id=`, `GET /hojas/recientes?limit=`
- `GET/PATCH/DELETE /hojas/{id}`
- `POST /upload`, `GET /preview?url=`

**Finanzas** (`/fin/*`): cuentas, categorías, movimientos, config, notas, instrumentos, objetivos, fire-filas, inflación, emergencia (legacy).

**Agenda** (`/agenda/*`): calendarios, eventos, listas, tareas, horario-facultad.

**Hábitos** (`/habitos/*`): hábitos CRUD, registros GET/PUT/DELETE.

CORS dev: `http://localhost:5173` y `http://127.0.0.1:5173` (API en `:8765`).

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
