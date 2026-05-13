SI HAY CAMBIOS EN EL PROYECTO, ES OBLIGATORIO ACTUALIZAR ESTE README.

# Sistema de Guardado Rápido (SGR)

Aplicación full stack para capturar y organizar notas rápidas: texto, enlaces y fotos, agrupadas en categorías jerárquicas, con apuntes enriquecidos (TipTap), recordatorio y ubicación opcionales.

## Requisitos

- Python 3.10+ (recomendado: entorno virtual en esta carpeta)
- Node.js 18+ (para el frontend con Vite)

## Puesta en marcha

### Backend (FastAPI)

Desde la carpeta `project/`:

```powershell
.\venv\Scripts\activate
uvicorn app.main:app --reload
```

API en `http://127.0.0.1:8000`. La base SQLite y las migraciones se inicializan al arrancar (`init_db()`). Los archivos subidos van a `uploads/`; en producción el backend puede servir también el build estático en `frontend/dist/`.

### Frontend (React + Vite)

```powershell
cd frontend
npm install
npm run dev
```

UI en `http://localhost:5173`. La URL del API se configura en `frontend/src/config.js` (`API_URL`, por defecto `http://127.0.0.1:8000`).

### Bot de Telegram (opcional)

```powershell
cd project
python mybot/bot.py
```

Requiere `TELEGRAM_BOT_TOKEN` en `.env`. Opcional: `API_BASE_URL` si el backend no está en `http://127.0.0.1:8000` (por ejemplo `http://backend:8000` en Docker).

## Estructura del directorio

| Ruta | Contenido |
|------|-------------|
| `app/` | FastAPI: `main.py` (rutas), `config.py`, modelos Pydantic, acceso a datos en `db/` |
| `frontend/` | React, Zustand (`src/store/useStore.js`), pantallas en `src/screens/`, componentes en `src/components/` |
| `mybot/` | Bot que llama al mismo REST API |
| `database/` | Archivo SQLite (`app.db` según configuración) |
| `uploads/` | Imágenes servidas como estáticos bajo `/uploads/` |

## API relevante

- `GET/POST /categorias`, `DELETE /categorias/{id}`
- `GET/POST /hojas`, `GET/PATCH/DELETE /hojas/{id}`
- `POST /upload` — subida de imagen
- `GET /preview?url=...` — metadatos de enlace (Open Graph)

CORS en desarrollo permite el origen de Vite (`localhost:5173`).

## Más detalle

Convenciones y diagrama de flujo de datos: ver `../CLAUDE.md` en la raíz del repositorio.
