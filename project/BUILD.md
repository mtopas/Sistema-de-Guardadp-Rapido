# Recompilar SGR (.exe)

Ejecutá **todo** esto en cada cambio (backend o frontend), desde la carpeta **`project`** del repositorio:

```powershell
python -m pip install -r requirements.txt -r requirements-build.txt
cd frontend
npm ci
npm run build
cd ..
python -m PyInstaller -y sgr.spec
```

python -m pip install -r requirements.txt -r requirements-build.txt; cd frontend; npm ci; npm run build; cd ..; python -m PyInstaller -y sgr.spec

El resultado queda en **`dist\SGR\`**. Para distribuir copiá **toda esa carpeta**, no solo `SGR.exe`.

Los datos del usuario (base SQLite, fotos subidas) **no** están ahí: van en **`%APPDATA%\SGR\`** en Windows (`database\app.db`, `uploads\`).

## Uso del ejecutable

- Doble clic en `dist\SGR\SGR.exe` (o ejecutarlo desde consola).
- Abre el navegador en `http://127.0.0.1:8000/` y sirve la UI ya compilada.
- Para cerrar: Ctrl+C en la consola o cerrar la ventana de terminal.

## Variables opcionales

| Variable | Efecto |
|----------|--------|
| `SGR_PORT` | Puerto (default `8000`) |
| `SGR_HOST` | Host (default `127.0.0.1`) |
| `SGR_NO_BROWSER=1` | No abrir el navegador al iniciar |
| `SGR_DATA_DIR` | Carpeta de datos en lugar de `%APPDATA%\SGR` |
| `DB_PATH` | Ruta explícita del SQLite |
| `SGR_DEBUG=1` | Logs de depuración en backend |

## Migrar datos de desarrollo

Si ya tenés `project\database\app.db` o fotos en `project\uploads\`, copiá:

- `app.db` → `%APPDATA%\SGR\database\app.db`
- archivos de `uploads\` → `%APPDATA%\SGR\uploads\`

## Desarrollo vs empaquetado

| | Desarrollo | Ejecutable |
|--|------------|------------|
| API + UI | Backend `:8000` + Vite `:5173` | Todo en `:8000` |
| SQLite | `project/database/app.db` | `%APPDATA%\SGR\database\app.db` |
| Uploads | `project/uploads/` | `%APPDATA%\SGR\uploads\` |

El bot de Telegram (`mybot/bot.py`) **no** se incluye en el `.exe`; sigue siendo un proceso aparte apuntando a la misma API.
