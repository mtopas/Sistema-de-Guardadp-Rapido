# Roadmap — Sistema de Guardado Rápido

## Current state *(updated 2026-04-14)*
- ~~FastAPI backend with flat categories + hojas (text only)~~ → **full schema implemented (Phase 1 done)**
- SQLite database with all Phase 1 columns migrated
- Bare-bones HTML frontend (dev tool, not a product)
- Working Telegram bot (text capture → category)

### Pre-flight fixes — DONE
- `git init` + `.gitignore` in place
- `requirements.txt` pinned (20 packages)
- Deprecated `@app.on_event` replaced with `lifespan`
- Debug `print` removed from `database.py`
- 404 bug fixed on `GET /hojas/{id}`
- XSS fixed in `index.html` (`innerHTML` → `textContent`)

---

## Phase 1 — Solid Backend ✅ DONE
*Goal: the data model matches the full idea before touching the UI.*

### What was done
- Added `padre_id` and `icono` to `categorias` — full category tree enabled
- Added to `hojas`: `tipo` (texto/link/foto), `apuntes`, `lugar`, `latitud`, `longitud`, `fecha_recordatorio`
- All new fields exposed in CRUD and API endpoints
- `DELETE /hojas/{id}` and `DELETE /categorias/{id}` added
- `app/config.py` created — single source of truth for `DEBUG`, `DB_PATH`, `API_BASE_URL`, `MAX_IMAGE_SIZE_MB`
- `DEBUG` convention applied across all backend files
- Migrations run automatically on startup via `_apply_migrations()` — existing DB updated without data loss

### Coding conventions to apply from Phase 1 onwards
Every Python file must follow these two rules from the start — retrofitting them later is painful:

- **DEBUG flag:** add `DEBUG = True` at the top of every file. Wrap all diagnostic prints with `if DEBUG: print(...)`. Before deploying to production, flip to `DEBUG = False` in each file (or load it from an env var). This way you can diagnose locally without noise in prod.
  ```python
  DEBUG = True  # set to False in production

  if DEBUG:
      print("categorias loaded:", filas)
  ```
- **Single config file:** anything that could ever need changing (DB path, API base URL, debug flag, file upload limits, reminder defaults) goes in one `config.py` at the root of `app/`. No magic strings scattered across files. Import from there everywhere.
  ```python
  # app/config.py
  DEBUG = True
  DB_PATH = "database/app.db"
  API_BASE_URL = "http://127.0.0.1:8000"
  MAX_IMAGE_SIZE_MB = 5
  ```

### Technologies
- **Python 3.12** (already in use)
- **FastAPI** (already in use)
- **SQLite** (keep for now)
- **Pydantic v2** (already in use via FastAPI)
- **Alembic** — migration tool, so schema changes don't require manual ALTER TABLE hacks

---

## Phase 2 — Design Decisions *(locked before implementation)*

| # | Decision |
|---|---|
| Platform | Mobile-first for capture (speed, frictionless). Desktop-first for browsing and deep work (clarity, structure). |
| Mobile nav | Minimal — only a FAB for capture + bottom nav for Browse and Settings. |
| Desktop layout | Left sidebar with category tree. Content area on the right. |
| Category picker | Searchable list with quick suggestions. Inline "Create" option if no match. No tree explorer during capture. |
| Type detection | Auto-detect: URL → `link`, otherwise `texto`. No manual classification. |
| Link previews | Yes — auto-fetch title, favicon, thumbnail when a URL is saved or viewed. |
| Animations | Subtle micro-interactions 100–200ms: save confirmation, note open, tap/hover feedback. |
| Default theme | Dark violet on first launch. Remembers last user selection via localStorage. |
| Icon style | Outlined / slightly rounded. Lucide icon set. |
| Apuntes editor | Full screen on mobile, clean distraction-free layout. TipTap (rich text: bold, italic, underline, lists, headings). |

---

## Phase 2 — Real Frontend (PWA) ✅ DONE (v2 — graph + i18n)
*Goal: a usable product UI that works on desktop and mobile browser, installable as an app.*

### Clarification — one app, two layouts
This is a single React app served from one URL. The same codebase renders the mobile layout on phones and the desktop layout on PC. There is no separate mobile app and no App Store involved. Users on Android or iOS install it directly from the browser ("Add to home screen").

### What to do
- Replace `index.html` with a proper React app
- Implement the dark violet visual identity (colors, typography, icon families)
- Screens:
  - Home / capture screen (paste text, link, or photo → pick category tree)
  - Category tree view (hierarchical navigation, icons per category)
  - Hoja detail view (content + apuntes editor)
  - Settings screen (font, text size, color theme)
    - Colors Themes (I give the base, there are obviusly more colores) :
      - Sand and black
      - Violet and black
      - Pastel colors
      - green lime and grey
      - Teal blue and white
      - black and matte gold
      - earth tones
      - 80s retro colors
      - Rainbow
- Make it a **PWA**:
  - Add `manifest.json` (app name, icons, theme color)
  - Add a Service Worker (offline cache of the shell)
  - This allows "Install to home screen" on Android and iOS — no App Store needed
- Make the share target work: register the app as a share destination on Android via the Web Share Target API

### Coding conventions to apply in Phase 2
- **No hardcoded strings in components.** API base URL, theme color values, and icon names go in a central constants file (e.g. `src/config.js`), not scattered inside components.
- **DEBUG equivalent on the frontend:** use a single `DEBUG` constant in `src/config.js`. Wrap `console.log` calls with `if (DEBUG) console.log(...)`. Set to `false` before building for production.
  ```js
  // src/config.js
  export const DEBUG = true;
  export const API_URL = "http://127.0.0.1:8000";
  ```

### Technologies
- **React 18** + **Vite** (fast dev server, small build output)
- **React Router v6** — navigation between screens
- **TailwindCSS** — utility-first styling, easy to implement the violet theme
- **Zustand** — lightweight global state (no Redux overhead)
- **TipTap** — rich text editor for apuntes (bold, italic, lists, internal links)
- **Workbox** (via vite-plugin-pwa) — Service Worker + PWA manifest generation

---

## Phase 3 — Deployment
*Goal: the app is live on the internet, always on, reachable from phone and PC.*

### Clarification — what changes between dev and prod
- Flip `DEBUG = False` in every Python file and `DEBUG = false` in `src/config.js` before deploying.
- `API_URL` in `src/config.js` changes from `http://127.0.0.1:8000` to your real domain (e.g. `https://tuapp.com`).
- The React app is built once (`npm run build`) and the output folder is served as static files by Nginx — Vite's dev server is never used in production.

### What to do
- Rent a VPS (recommended: **Hetzner CX22**, ~€4/month — cheapest reliable option)
- Point a domain at the VPS (optional but strongly recommended for PWA install to work well)
- Run the FastAPI backend with **Gunicorn + Uvicorn workers**
- Serve the React build as static files via **Nginx**
- Get a free HTTPS certificate via **Let's Encrypt + Certbot** (HTTPS is required for PWA and Web Share Target)
- Use **Supervisor** or **systemd** to keep the backend running after reboots
- Migrate from SQLite to **PostgreSQL** (runs on the same VPS, more reliable under concurrent writes)

### Technologies
- **Hetzner VPS** (or DigitalOcean, Vultr — same price range)
- **Nginx** — reverse proxy + static file server
- **Gunicorn + uvicorn workers** — production Python server
- **PostgreSQL 16** + **psycopg2** or **asyncpg**
- **Let's Encrypt / Certbot** — free HTTPS
- **Cloudflare** (free tier) — DNS, DDoS protection, optional CDN for static files

---

## Phase 4 — Telegram Bot Polish + Image Support
*Goal: Telegram becomes a full capture client, not just text.*

### What to do
- Accept photos sent to the bot → upload to server → store as `tipo: foto`
- Accept URLs → auto-detect if it's a YouTube/Vimeo link, store as `tipo: link`
- Add inline keyboard buttons (Telegram supports this) instead of numbered text menus — much better UX
- Add `/listar` command to browse recent hojas from Telegram

### Technologies
- **python-telegram-bot** (already in use)
- **Pillow** — image validation/resizing on the server before saving
- Server-side file storage: local folder on VPS, or **Cloudflare R2** (free for low volume) for object storage

---

## Phase 5 — Advanced Features
*Goal: the features that make it more than a bookmarking app.*

### Reminders & natural language dates
- Parse natural language in content ("este lunes", "el martes 15") → populate `fecha_recordatorio`
- **Library:** `dateparser` (Python) — handles Spanish locale out of the box
- Send reminder via Telegram bot at the scheduled time using **APScheduler** (runs inside FastAPI)

### Voice transcription
- Record audio in the PWA (Web Audio API) → send to backend → transcribe
- **Service:** OpenAI Whisper API or a self-hosted Whisper model (runs on the VPS if it has enough RAM)
- Post-transcription: extract `#tags`, dates, and places from the text with simple regex + dateparser

### Map view
- Display saved hojas that have coordinates on a map
- **Library:** Leaflet.js (lightweight, open source, no API key needed)
- Filter by category, proximity to a saved location

### Day summary
- A daily cron job (APScheduler or system cron) that compiles all hojas added that day
- Sends a Telegram message at a configured time with the summary + quick delete buttons

---

## Phase 6 — Polish & Gamification
*Goal: make it feel like a finished product.*

### What to do
- Implement achievement system (milestones: hojas created, links saved, etc.)
- Icon packs per category family (pick a set like **Lucide** or **Phosphor** — both free and MIT licensed)
- Color theme switcher with global impact (logo tint, icon accent, background)
- Trash bin: soft-delete hojas, permanent delete after 24h (add `deleted_at` column + a cleanup cron)
- Auth: simple email + password or magic link (use **FastAPI-Users** library)

### Technologies
- **Lucide** or **Phosphor Icons** — icon families with variants, MIT license
- **FastAPI-Users** — handles registration, login, JWT tokens, password reset
- **JWT (via python-jose)** — stateless auth tokens

---

## Technology summary

| Layer | Technology |
|---|---|
| Backend language | Python 3.12 |
| API framework | FastAPI |
| Database | SQLite → PostgreSQL |
| Migrations | Alembic |
| Frontend framework | React 18 + Vite |
| Styling | TailwindCSS |
| Rich text editor | TipTap |
| State management | Zustand |
| PWA tooling | vite-plugin-pwa + Workbox |
| Maps | Leaflet.js |
| Icons | Lucide or Phosphor |
| Scheduling | APScheduler |
| NLP dates | dateparser |
| Voice | OpenAI Whisper API |
| Auth | FastAPI-Users + JWT |
| Hosting | Hetzner VPS |
| Web server | Nginx + Gunicorn + Uvicorn |
| HTTPS | Let's Encrypt + Certbot |
| CDN / DNS | Cloudflare (free tier) |
| Object storage | Cloudflare R2 (free tier) |
| Telegram | python-telegram-bot |

---

## What you skip entirely
- Apple App Store (no review, no $99/year fee)
- Google Play Store
- React Native / Flutter
- Docker (overkill for a solo project at this scale — systemd is enough)





# My own Brain Storming

- 1 theme can be sand and black.