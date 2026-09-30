# SGR · Nexus

Frontend alternativo para la API de SGR. Estética futurista, con fondo espacial animado, auroras que cambian de color según el módulo, vidrio con bordes neón y animaciones con framer-motion. Funciona contra la misma API FastAPI (`project/app/main.py`, puerto 8765) y no toca `project/frontend`.

## Arranque

```powershell
# 1. API de SGR (como siempre)
cd D:\SGR\project
.\venv\Scripts\activate
uvicorn app.main:app --port 8765

# 2. Este frontend
cd D:\SGR\Front-CLAUDE\SGR
npm install
npm run dev          # http://localhost:5180
```

El frontend le habla a la API por el proxy `/api` de Vite, así que no depende de la lista CORS del backend.

| Variable | Default | Uso |
|---|---|---|
| `SGR_API_TARGET` | `http://127.0.0.1:8765` | Destino del proxy `/api` (dev y `npm run preview`) |
| `SGR_FRONT_PORT` | `5180` | Puerto del dev server / preview |
| `VITE_API_URL` | — | Opcional: saltear el proxy (requiere CORS para este origen) |

Copiá `.env.example` → `.env` para cambiarlas. La base URL también se puede cambiar en **Ajustes → Conexión con la API**.

Build de producción: `npm run build` genera `dist/`, que se sirve con `npm run preview` (usa el mismo proxy).

## Módulos

| Ruta | Módulo | Qué hay |
|---|---|---|
| `/` | **Bóveda** | Grafo neural radial (zoom, paneo, hover, filtro), tarjetas y lista, árbol de categorías (CRUD, subcategorías, borrado forzado), búsqueda textual y semántica, reindexado, detalle con editor enriquecido y autoguardado, vista previa de links, fotos. `/hoja/:id` abre la hoja a pantalla completa |
| `/finanzas` | **Finanzas** | Dashboard (KPIs, donuts clickeables, pulso diario, movimientos, cuotas, notas), Anual (nominal/real con inflación editable), FIRE (plan en USD, overrides, proyección, parámetros), Ahorro (reparto por cajón, objetivos, portafolio, ledger de operaciones), Datos (histórico editable inline, filtros, acciones masivas, CSV import/export, duplicados, CRUD de categorías). Cuentas con saldo inicial y ajuste vía movimientos “Ajuste”, transferencias entre cuentas, dólar MEP |
| `/agenda` | **Agenda** | Hoy/Semana en grilla horaria (eventos, bloques de tareas, hábitos con hora, capa Facultad, línea de “ahora”, arrastrar tareas para bloquear tiempo), Mes, Tareas (lista y canvas, listas con pin), Revisión semanal (API `/agenda/revision`, export Markdown / .ics / PDF). Recurrencias, detener series, calendarios con reasignación, horario de facultad con excepciones |
| `/habitos` | **Hábitos** | Grilla mensual con teclado (flechas, 1, 2, ⌫), completar total/parcial con nota, Progreso (heatmap de 3 meses, tendencia de 6 meses, momentum, stats), Historial (mes/trimestre/año), archivados, detalle con rachas |
| `/jarvis` | **Jarvis** | Chat con historial de conversaciones, captura a memoria, explorador de memoria (editar/borrar), entidades, propuestas, estado del worker y presupuesto |
| `/settings` | **Ajustes** | Perfil, paletas (Nébula, Synthwave, Ártico, Toxic), intensidad de efectos, datos/backup, avisos del navegador, feedback, conexión |

Global: paleta de comandos (`Ctrl+K`), captura rápida (`Ctrl+Enter`: nota, movimiento, evento, tarea, hábito, Jarvis), campana con eventos próximos y hábitos pendientes, cotización del dólar, toasts. Todas las mutaciones son optimistas y, si la API no responde, quedan guardadas localmente y se reintenta la conexión.

## Estructura

```
src/
├── App.jsx                 # router, acento por módulo, carga inicial, atajos
├── app/                    # Shell (sidebar/topbar/campana), CommandPalette, CaptureModal
├── components/             # ui.jsx (Modal, Tabs, Seg, Kpi…), charts.jsx (SVG), Background, RichEditor
├── lib/                    # api, fechas, reglas de finanzas y hábitos
├── store/                  # zustand: ui, boveda, fin, agenda, habitos, jarvis
├── modules/<modulo>/       # pantallas por módulo
└── styles/global.css       # sistema visual
```

## Convenciones de la API que usa el frontend

- Movimientos: `tipo` = `income` | `expense` | `transfer`. Una transferencia son dos movimientos `transfer`: monto positivo en la cuenta origen y negativo en la cuenta destino.
- Recurrencia de Agenda: `regla_repeticion` = `{"frecuencia": "diario|semanal|mensual", "dias": [0..6], "hasta": "YYYY-MM-DD"}` con `0 = lunes`. `dia_semana` del horario de facultad usa la misma convención.
- Hábitos: `dias_semana` usa `0 = domingo`.
- Fotos: se suben con `POST /upload` y la hoja guarda un `<img>` inicial en `apuntes`.
