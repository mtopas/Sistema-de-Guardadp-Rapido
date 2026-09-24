import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

from app.paths import is_frozen, project_dir, resolve_db_path

# Docker / override manual; si no, project/database (dev y .exe desde el repo)
DB_PATH = os.getenv("DB_PATH") or resolve_db_path()

# Raíz del vault Bóveda -- override para el sandbox dev (dev-start.ps1). Default:
# sibling del repo (mismo criterio portable que JARVIS_BOVEDA_PATH en jarvis/config.py).
VAULT_ROOT = Path(os.getenv("VAULT_ROOT") or str(project_dir().parent.parent / "Boveda"))

_DEBUG_DEFAULT = "0" if is_frozen() else "1"
DEBUG = os.getenv("SGR_DEBUG", _DEBUG_DEFAULT).lower() in ("1", "true", "yes")

# Puerto distinto de 8000 (p. ej. SimLab/uvicorn por defecto) — override: SGR_PORT / API_BASE_URL
SGR_HOST = os.getenv("SGR_HOST", "127.0.0.1")
SGR_PORT = int(os.getenv("SGR_PORT", "8765"))
# 0.0.0.0 es bind del servidor; un cliente HTTP no puede conectarse ahí.
_api_host = "127.0.0.1" if SGR_HOST in ("0.0.0.0", "::", "[::]") else SGR_HOST
API_BASE_URL = os.getenv("API_BASE_URL", f"http://{_api_host}:{SGR_PORT}")
MAX_IMAGE_SIZE_MB = 5

# Versión de SGR expuesta en FastAPI(version=...) y por /settings/status -> UI (Settings > Información).
# Se actualiza a mano en cada release relevante; ver CHANGELOG.md en la raíz del repo.
SGR_VERSION = os.getenv("SGR_VERSION", "0.1.0")

import builtins as _builtins
_original_print = _builtins.print
def print(*args, **kwargs):
    kwargs.setdefault('flush', True)
    _original_print(*args, **kwargs)
