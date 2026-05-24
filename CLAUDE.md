# CLAUDE.md

Guía para agentes en este repositorio. **Arquitectura detallada y estado implementado:** `project/README.md`. **Specs de producto (tabs Finanzas, temas, Hábitos, etc.):** `Prompt.md`.

---

## Commands

### Backend (FastAPI)
```bash
cd project
.\venv\Scripts\activate          # Windows
uvicorn app.main:app --reload    # :8000
```

### Frontend (React/Vite)
```bash
cd project/frontend
npm install
npm run dev      # :5173 — API_URL en src/config.js (default http://127.0.0.1:8000)
npm run build    # → frontend/dist
```

### Telegram Bot (única pieza "online")
```bash
cd project
python mybot/bot.py   # TELEGRAM_BOT_TOKEN en .env
```

SQLite y migraciones: `init_db()` al arrancar el backend (`app/db/database.py`).

### Ejecutable Windows
Ver **`project/BUILD.md`** — PyInstaller desde `project/` → `dist/SGR/`; datos en `%APPDATA%\SGR\`.

---

## Qué es el proyecto

**SGR** — app local full-stack en español con cuatro módulos principales:

| Módulo | Ruta | Rol |
|--------|------|-----|
| **Bóveda** | `/` | Captura texto/link/foto en categorías jerárquicas; grafo D3 o lista |
| **Finanzas** | `/finanzas` | Movimientos, dashboard mensual, Anual, FIRE, Ahorro, Datos |
| **Agenda** | `/agenda` | Calendario (Mes/Semana), HOY + time blocking, Tareas por listas, Revisión semanal |
| **Hábitos** | `/habitos` | Grilla mensual, Progreso (heatmap/stats/momentum), Historial |

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
│   ├── data/finanzas.js     # Mock + isTransferencia
│   └── utils/themes.js, i18n.js, detectType.js
├── mybot/bot.py
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
- **Reglas:** `isTransferencia()` excluye categoría transferencia; categoría exacta **`Ahorro`** para ahorro/objetivos (descripción = nombre objetivo).
- **Tabs:** ver tabla en `project/README.md`. Componentes en `components/finanzas/` (`DatosTab`, `AhorroTab`, `FireTab`, `AnualTab`, …).
- **API:** prefijo `/fin/*` (cuentas, categorías, movimientos, config, notas, instrumentos, objetivos, fire-filas, inflación).
- **Dual schema movimientos:** mock usa `type`/`amount`/`cat`; API usa `tipo`/`monto`/`categoria_nombre` — normalizar al leer/escribir.

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

| Ruta | Accent |
|------|--------|
| `/` (Bóveda) | violeta `#7c3aed` |
| `/finanzas` | ámbar `#d97706` |
| `/agenda` | azul `#2563eb` |
| `/habitos` | verde `#059669` |

Lógica en `Layout.jsx` (`ARCOIRIS_ACCENTS`).

### i18n

`utils/i18n.js` → `t(lang, key)`; `es` | `en`.

### Convenciones backend

- `DEBUG` desde `app/config.py` para logs.
- CORS dev: `http://localhost:5173`.

---

## Antes de implementar

1. Leer la sección relevante en **`Prompt.md`** (producto, sin duplicar aquí).
2. Leer **`project/README.md`** para estado real (qué está hecho / pendiente).
3. No re-explorar el árbol completo si el cambio es acotado a rutas ya documentadas allí.
