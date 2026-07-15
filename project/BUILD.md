# Recompilar SGR (.exe)

Ejecutá **todo** esto en cada cambio (backend o frontend), desde la carpeta **`project`** del repositorio:

```bash
python -m pip install -r requirements.txt -r requirements-build.txt
cd frontend
npm ci
npm run build
cd ..
python -m PyInstaller -y sgr.spec
```

```bash
python -m pip install -r requirements.txt -r requirements-build.txt; cd frontend; npm ci; npm run build; cd ..; python -m PyInstaller -y sgr.spec
```

Probar:
```bash
$ErrorActionPreference = 'Stop'; python -m pip install -q -r requirements.txt -r requirements-build.txt; cd frontend; npm ci -****-loglevel=error; npm run build -- --logLevel warn; cd ..; python -m PyInstaller -y --log-level WARN sgr.spec
```

El resultado queda en **`dist\SGR\`**. Para distribuir copiá **toda esa carpeta**, no solo `SGR.exe`.

Los datos **no** van dentro de `dist\`: el `.exe` los busca en **`project\`** (misma base que en desarrollo).

## Dónde quedan los datos

| Situación | SQLite | Uploads |
|-----------|--------|---------|
| `uvicorn` / `npm run dev` | `project/database/app.db` | `project/uploads/` |
| `SGR.exe` desde este repo (`project/dist/SGR/`) | `project/database/app.db` | `project/uploads/` |
| Solo copiaste `dist/SGR` a otro disco | `…/SGR-data/database/app.db` | `…/SGR-data/uploads/` |

La carpeta `project/database/` puede versionarse con git (o ignorar `app.db` en `.gitignore` si preferís no subir datos reales).

Override manual: variable `SGR_DATA_DIR` apuntando a cualquier carpeta.

## Uso del ejecutable

- Doble clic en `dist\SGR\SGR.exe`.
- Aparece una **ventana pequeña** (sin consola negra) y se abre el navegador en **`http://127.0.0.1:8765/`** (puerto por defecto de SGR; SimLab y otros suelen usar `:8000`).
- **Cerrar la pestaña del navegador no detiene SGR** — el servidor sigue en `:8765` hasta que usás **Salir** o la **X** de la ventana de control.
- Para depurar con consola visible: `set SGR_CONSOLE=1` y ejecutá `SGR.exe` (o corré `python run_sgr.py` desde `project/`).

Tras cambios en `run_sgr.py` o el puerto, volvé a correr PyInstaller (`python -m PyInstaller -y sgr.spec`).

## Variables opcionales

| Variable | Efecto |
|----------|--------|
| `SGR_PORT` | Puerto (default `8765`) |
| `SGR_HOST` | Host (default `127.0.0.1`) |
| `API_BASE_URL` | URL completa de la API (bot; default `http://127.0.0.1:8765`) |
| `SGR_NO_BROWSER=1` | No abrar el navegador al iniciar |
| `SGR_CONSOLE=1` | Mostrar consola (modo depuración; solo en el `.exe`) |
| `SGR_DATA_DIR` | Carpeta raíz de datos (contiene `database/` y `uploads/`) |
| `DB_PATH` | Ruta explícita del SQLite |
| `SGR_DEBUG=1` | Logs de depuración en backend |

## Desarrollo vs empaquetado

| | Desarrollo | Ejecutable (desde repo) |
|--|------------|-------------------------|
| API + UI | Backend `:8765` + Vite `:5173` | Todo en `:8765` |
| SQLite | `project/database/app.db` | `project/database/app.db` |
| Uploads | `project/uploads/` | `project/uploads/` |

El bot de Telegram (`mybot/bot.py`) **no** se incluye en el `.exe`; sigue siendo un proceso aparte apuntando a la misma API.

**Homelab + `.exe` en Windows:** la DB canónica vive en el gabinete; antes de abrir el ejecutable conviene sincronizar. Diseño y scripts previstos: [`SYNC-WINDOWS.md`](SYNC-WINDOWS.md).

## Tabs Finanzas en blanco / 404 en `/assets/FireTab-….js`

Síntoma: al abrir FIRE, Anual o Ahorro en `:8765`, la consola muestra `Failed to fetch dynamically imported module` con hashes viejos (`index-6-qjpu8G.js`, etc.).

**Causa habitual:** el frontend se recompiló pero el navegador (o un service worker viejo) sigue usando bundles de un build anterior. Los archivos con hash nuevo sí están en `frontend/dist/assets/`.

**Una vez (limpiar caché del sitio):**

1. Abrí DevTools (F12) → **Application** → **Service Workers** → **Unregister** en `http://127.0.0.1:8765`.
2. Misma pestaña → **Storage** → **Clear site data** (solo para `127.0.0.1:8765`).
3. Recargá con Ctrl+Shift+R.

**Para que no vuelva a pasar:** después de cambios en el frontend, corré `npm run build` en `frontend/` y, si usás el `.exe`, volvé a empaquetar con PyInstaller. El backend sirve `sw.js`, `registerSW.js` e `/index.html` desde `frontend/dist/` para que el PWA pueda precachear sin 404.

**Consola: `bad-precaching-response` … `index.html` 404:** el service worker pide `/index.html` sin header `Accept: text/html`. Reiniciá uvicorn (o recompilá el `.exe`) para tomar el fix en `main.py`; luego unregister del SW + recarga una vez.
