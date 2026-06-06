# CLAUDE.md

Guía para agentes en este repositorio.

| Documento | Contenido |
|-----------|-----------|
| `project/README.md` | Arquitectura, estado implementado, mapa de archivos |
| `project/Finanzas.md` | Finanzas: reglas, API, componentes, bot |
| `project/Finanzas-Roadmap.md` | Pendientes y deuda Finanzas |
| `project/Boveda.md`, `Agenda.md`, `Habitos.md`, `Bot.md` | Otros módulos (en `project/` si existen) |
| `project/SYNC-WINDOWS.md` | Sync homelab ↔ `.exe` (pull al abrir, push al cerrar, dev sandbox) |
| `HOMELAB.md` | Docker, ICS, sync homelab ↔ Windows |

---

## Commands

### Backend (FastAPI)

```bash
cd project
.\venv\Scripts\activate          # Windows
uvicorn app.main:app --reload --port 8765    # API SGR (default :8765, no :8000)
```

### Frontend (React/Vite)

```bash
cd project/frontend
npm install
npm run dev      # :5173 — API_URL en src/config.js (default http://127.0.0.1:8765)
npm run build    # → frontend/dist
```

### Telegram Bot (única pieza "online")

```bash
cd project
python mybot/bot.py   # TELEGRAM_BOT_TOKEN en .env — API en :8765 (API_BASE_URL)
```

### Puertos (local)


| Qué        | Puerto / URL                                                          |
| ---------- | --------------------------------------------------------------------- |
| API SGR    | **8765** — `uvicorn … --port 8765`, `.exe`, `app/config.py`           |
| Vite (dev) | **5173** — llama a `http://127.0.0.1:8765` (`frontend/src/config.js`) |
| Override   | `SGR_PORT`, `API_BASE_URL` en `.env` — ver `project/.env.example`     |


No usar `:8000` por defecto (conflicto frecuente con otros proyectos en la misma máquina).

SQLite y migraciones: `init_db()` al arrancar el backend (`app/db/database.py`).

### Datos de demo (opcional)

```bash
cd project
python seed_demo.py   # ADVERTENCIA: borra toda la DB y inserta datos de ejemplo
```

### Ejecutable Windows

Ver `project/BUILD.md` — PyInstaller desde `project/` → `dist/SGR/`; abre `http://127.0.0.1:8765/`; datos en `project/database/` (fuera de `dist/`). El bot **no** va en el `.exe` (proceso aparte, misma API `:8765`).

---

## Qué es el proyecto

**SGR** — app local full-stack en español con cuatro módulos principales:


| Módulo       | Ruta        | Rol                                                                               |
| ------------ | ----------- | --------------------------------------------------------------------------------- |
| **Bóveda**   | `/`         | Captura texto/link/foto en categorías jerárquicas; grafo D3 o lista               |
| **Finanzas** | `/finanzas` | Movimientos, dashboard mensual, Anual, FIRE, Ahorro, Datos                        |
| **Agenda**   | `/agenda`   | Calendario (Mes/Semana), HOY + time blocking, Tareas por listas, Revisión semanal |
| **Hábitos**  | `/habitos`  | Grilla mensual, Progreso (heatmap/stats/momentum), Historial                      |


Referencia visual estática: `ClaudeDesign/` (no es el runtime). Implementación: `project/`.

**Offline-first:** todos los módulos usan API local + fallback optimista en `useStore` si falla `fetch`. El bot Telegram llama al mismo REST.

---

## Arquitectura (resumen)

```
Componente → useStore.js → fetch → app/main.py → app/db/crud.py → SQLite
```

- **Un** store Zustand (`frontend/src/store/useStore.js`): Bóveda + Finanzas + Agenda + Hábitos + tema/idioma/modales.
- **Backend plano:** rutas en `app/main.py`; SQL en `app/db/crud.py`. `app/routes/` y `app/services/` **no se usan**.
- Mutaciones: update optimista local en Finanzas/Agenda/Hábitos; sin React Query ni invalidación centralizada.

```
project/
├── app/main.py, config.py, db/{database,crud}.py
├── frontend/src/
│   ├── App.jsx              # Router + fetch inicial + modales globales
│   ├── screens/             # Browse, Finanzas, Agenda, Habitos, Detail, Settings, Capture (legacy)
│   ├── components/          # Bóveda + finanzas/* + agenda/* + habitos/*
│   ├── store/useStore.js
│   ├── data/finanzas.js, finCategorias.js, finCategoriaColors.js
│   └── utils/themes.js, i18n.js, detectType.js
├── mybot/bot.py, finanzas_handlers.py
├── seed_demo.py           # demo: vacía DB + seed (no producción)
├── database/app.db
└── uploads/
```

### Rutas frontend

- `/` — `BrowseScreen` (grafo + paneles; captura vía `CaptureModal`, Ctrl+Enter)
- `/finanzas` — `FinanzasScreen` (tabs: dashboard | anual | fire | ahorro | datos)
- `/agenda` — `AgendaScreen` (tabs: hoy | mes | tareas | revisión)
- `/habitos` — `HabitosScreen` (tabs: hoy | progreso | historial)
- `/hoja/:id`, `/settings`, `/capture` (legacy)

Modales en `App.jsx`: `CaptureModal`, `MovementModal`, `TweaksPanel` (Ctrl+M: temas, tono, fuentes).
Modal Agenda en `AgendaScreen`: `EventoModal` (TopBar CTA o clic en día), `HorarioFacultadModal` (botón Facultad).
Modal Hábitos en `HabitosScreen`: `NuevoHabitoModal` (TopBar CTA o botón del panel izq); `CompletarModal` (click en celda de grilla).

### Bóveda

- **Categorias** (árbol `padre_id`) + **Hojas** (`tipo`: texto | link | foto; TipTap en `apuntes`).
- UI: `LeftPanel`, `NetworkGraph`, `RightPanel`.

### Finanzas (resumen)

- **Movimientos:** `fin_movimientos`; mes actual → `finMovimientos`; histórico → `finMovimientosAll`.
- **Transferencias:** `isTransferencia()` — categoría `transferencia` (case-insensitive); excluida de ingresos/gastos y KPIs del mes.
- **Asignación por categoría (modelo actual):**
  - **`FIRE`** — única categoría que alimenta el plan FIRE (`contribucionFire` / tab FIRE).
  - **Objetivos** — cada objetivo crea categoría **homónima** (`fin_categorias.objetivo_id`); el movimiento se asigna por categoría **o** descripción (= nombre del objetivo/FIRE).
  - **Gasto** suma al cajón; **ingreso** resta (puede quedar negativo).
  - Sistema: `Transferencia`, `Ajuste`, `FIRE` — no renombrar/eliminar desde UI. Al borrar objetivo → categoría `oculta=1`.
  - Legacy: categoría `Ahorro` (modelo viejo) — migración manual del usuario.
  - Emergencia: objetivo seed **Fondo de emergencia** + categoría vinculada; `GET /fin/emergencia` deprecated.
- **Tab Ahorro:** reparto FIRE + objetivos + **líquido sin invertir** (suma cajones − costo instrumentos); portafolio + ledger.
- **Saldos cuentas:** derivados de movimientos; saldo inicial vía movimiento cat. **Ajuste**; `POST /fin/recalcular-saldos`; `PATCH /fin/cuentas/{id}/saldo` → 410.
- **Helpers:** `data/finanzas.js` (`contribucionCategoria`, `acumuladoPorCategoriaNombre`, …); `data/finCategorias.js` (`isFinCategoriaReservada`); colores en `finCategoriaColors.js`.
- **Tabs:** dashboard | anual | fire | ahorro | datos — ver `project/README.md`. Datos: CRUD categorías en `DatosRightPanel`.
- **API:** `/fin/*` — categorías con `?include_ocultas=`, objetivos sin PATCH de `nombre`, emergencia deprecated.
- **Dual schema:** algunos consumidores aceptan `type`/`amount`/`cat`; API usa `tipo`/`monto`/`categoria_nombre` — usar `normalizeMovimiento()`.
- **Dólar:** `GET /fin/dolar/cotizacion` → cache en `fin_config` (`dolar_mep`, `dolar_oficial_compra`); UI usa MEP con fallback.
- **Demo opcional:** `project/seed_demo.py` — **borra** la DB y rellena datos de ejemplo (aún usa cat. `Ahorro` legacy; no alineado al modelo nuevo).
- **Bot Telegram:** `mybot/finanzas_handlers.py` — `/mov`, `/mes`, `/ahorro` (FIRE + objetivos por categoría), `/objetivo`, captura `$:`; categorías `oculta` no en teclados. Ver `project/Finanzas.md` §6.

### Agenda (resumen)

- **Tabs:** `hoy` (default) | `mes` | `tareas` | `revision`. Componentes en `components/agenda/`.
- **HOY:** grilla horaria 6–23h; tareas pendientes próximos 15 días en panel izq; time blocking; capa facultad opacada. **Integración hábitos:** sección "Hábitos de hoy" en panel izq (hábitos sin hora), bloques en grilla (hábitos con hora).
- **Mes:** vista 6×7 + semana; chips sólidos eventos, chips punteados tareas.
- **Tareas:** listas con color; filtro pendientes/completadas/todas.
- **Revisión:** retrospectiva semanal; distribución por calendario.
- **API:** prefijo `/agenda/*` (calendarios, eventos, listas, tareas, horario-facultad).
- **Offline:** optimista local + try/catch en cada acción del store.

### Hábitos (resumen)

- **Tabs:** `hoy` (default) | `progreso` | `historial`. Componentes en `components/habitos/`.
- **HOY:** grilla mensual de un solo scroll container; celdas Total (verde/1.0) / Parcial (amarillo/0.5) / pendiente / no programado; columnas nombre y % sticky.
- **Progreso:** heatmap 3 meses, sparkline 6 meses, mensaje de momentum, tabla de stats por hábito.
- **Historial:** calendario mensual coloreado por % diario; notas en hover; filtro por hábito.
- **Frecuencia:** diario | días específicos de la semana + hora opcional.
- **Racha:** días consecutivos con `valor > 0`; los días no programados no rompen la racha.
- **API:** prefijo `/habitos/*` (hábitos CRUD + registros GET/PUT/DELETE).
- **Offline:** mismo patrón que Finanzas/Agenda — optimista local + try/catch.
- **Helpers compartidos:** `components/habitos/habitosUtils.js` (`isScheduled`, `calcStreak`, `calcMonthPct`, `buildRegistrosMap`, …).

### Theming

`utils/themes.js`: **6 temas** + **tonos** (`TONES`) + **6 pares tipográficos** (`FONT_PAIRS`). Vars CSS en `document.documentElement`; Tailwind alias `app-*`. Arcoíris cambia `--accent` por ruta:


| Ruta         | Accent            |
| ------------ | ----------------- |
| `/` (Bóveda) | violeta `#7c3aed` |
| `/finanzas`  | ámbar `#d97706`   |
| `/agenda`    | azul `#2563eb`    |
| `/habitos`   | verde `#059669`   |


Lógica en `Layout.jsx` (`ARCOIRIS_ACCENTS`).

### i18n

`utils/i18n.js` → `t(lang, key)`; `es` | `en`.

### Convenciones backend

- `DEBUG` desde `app/config.py` para logs.
- CORS dev: `http://localhost:5173`.

---

## Antes de implementar

1. Leer `project/README.md` (arquitectura y estado global).
2. Si el cambio es Finanzas: `project/Finanzas.md` + pendientes en `project/Finanzas-Roadmap.md`.
3. No re-explorar el árbol completo si el cambio es acotado a rutas ya documentadas en esos archivos.
4. Finanzas: respetar `isTransferencia`, cajón FIRE = cat. `FIRE`, objetivo = cat. con mismo nombre; decidir si la tab usa `finMovimientos` (mes) o `finMovimientosAll` (histórico).

