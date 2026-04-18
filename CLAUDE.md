# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (FastAPI)
```bash
cd project
.\venv\Scripts\activate          # Windows
uvicorn app.main:app --reload    # Dev server on :8000
```

### Frontend (React/Vite)
```bash
cd project/frontend
npm install
npm run dev      # Dev server on :5173
npm run build    # Output to frontend/dist
```

### Telegram Bot
```bash
cd project
python mybot/bot.py   # Requires TELEGRAM_BOT_TOKEN in .env
```

Database migrations run automatically on backend startup via `init_db()`.

---

## Architecture

Full-stack knowledge capture app (Spanish: "Sistema de Guardado Rápido" = Quick Save System).

```
project/
├── app/              # FastAPI backend
│   ├── main.py       # All route handlers (no routes/ subfolder in use)
│   ├── config.py     # DEBUG, DB_PATH, API_BASE_URL, MAX_IMAGE_SIZE_MB
│   ├── db/
│   │   ├── database.py   # SQLite init + migrations (called on startup)
│   │   └── crud.py       # All data access functions
│   └── models/           # Pydantic schemas
├── frontend/src/
│   ├── App.jsx            # Router: /, /capture, /hoja/:id, /settings
│   ├── store/useStore.js  # Zustand — all state + API calls live here
│   ├── screens/           # BrowseScreen, CaptureScreen, DetailScreen, SettingsScreen
│   ├── components/        # Layout, Panels, NetworkGraph, CategoryPicker, etc.
│   └── utils/             # themes.js, i18n.js, detectType.js, leafIcons.js
├── mybot/bot.py       # Telegram bot (async capture)
├── database/app.db    # SQLite file
└── uploads/           # User-uploaded images (served as static)
```

### Data Flow
Components → `useStore.js` actions → `fetch()` to FastAPI → store update → re-render. There is no local cache invalidation strategy; actions refetch full lists after mutations.

### Domain Model
- **Categorias**: Hierarchical tree (`padre_id` self-reference), each can have an `icono`.
- **Hojas**: The core unit — a captured item with `contenido`, `tipo` (`texto`/`link`/`foto`), optional `apuntes` (TipTap rich text), `lugar`/`latitud`/`longitud`, `fecha_recordatorio`, and `icono`.

### Key Screens
- **BrowseScreen**: Mobile = list view; Desktop = D3 force-directed knowledge graph (`NetworkGraph.jsx`). Three-panel layout: `LeftPanel` (category tree + search), center (graph or list), `RightPanel` (hoja detail + apuntes editor).
- **CaptureScreen**: Auto-detects content type via `utils/detectType.js` (URL → `link`, otherwise `texto`). Photo capture uses browser `<input type="file" capture>`.

### State (useStore.js)
Single Zustand store. Key slices:
- `categorias`, `hojas` — fetched from API
- `selectedCategoria`, `selectedHoja` — UI selection
- `theme`, `lang`, `userName` — persisted to `localStorage`
- `toast` — ephemeral notification state

### Theming
`utils/themes.js` defines 9 themes as CSS variable maps (`--bg`, `--surface`, `--sidebar`, `--accent`, `--accent-light`, `--text`, `--subtext`, `--border`, `--panel-bg`). `applyTheme(key)` sets them on `document.documentElement`. Tailwind is configured with aliases (`bg-app-bg`, `text-app-accent`, etc.) that map to these variables.

### Internationalization
`utils/i18n.js` exports `t(lang, key)`. Languages: `es` (default) and `en`. All UI strings go through this function.

### Backend Conventions
- Every file imports `DEBUG` from `app/config.py`; debug prints are guarded with `if DEBUG: print(...)`.
- All API routes are in `app/main.py` — `app/routes/` and `app/services/` exist but are empty.
- CORS is configured for `http://localhost:5173` only.
