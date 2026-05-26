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
- Aparece una **ventana pequeña** (sin consola negra) y se abre el navegador en `http://127.0.0.1:8000/`.
- **Cerrar la pestaña del navegador no detiene SGR** — el servidor sigue en `:8000` hasta que usás **Salir** o la **X** de la ventana de control.
- Para depurar con consola visible: `set SGR_CONSOLE=1` y ejecutá `SGR.exe` (o corré `python run_sgr.py` desde `project/`).

## Variables opcionales

| Variable | Efecto |
|----------|--------|
| `SGR_PORT` | Puerto (default `8000`) |
| `SGR_HOST` | Host (default `127.0.0.1`) |
| `SGR_NO_BROWSER=1` | No abrar el navegador al iniciar |
| `SGR_CONSOLE=1` | Mostrar consola (modo depuración; solo en el `.exe`) |
| `SGR_DATA_DIR` | Carpeta raíz de datos (contiene `database/` y `uploads/`) |
| `DB_PATH` | Ruta explícita del SQLite |
| `SGR_DEBUG=1` | Logs de depuración en backend |

## Desarrollo vs empaquetado

| | Desarrollo | Ejecutable (desde repo) |
|--|------------|-------------------------|
| API + UI | Backend `:8000` + Vite `:5173` | Todo en `:8000` |
| SQLite | `project/database/app.db` | `project/database/app.db` |
| Uploads | `project/uploads/` | `project/uploads/` |

El bot de Telegram (`mybot/bot.py`) **no** se incluye en el `.exe`; sigue siendo un proceso aparte apuntando a la misma API.
