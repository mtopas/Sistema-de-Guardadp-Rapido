import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

from app.paths import is_frozen, resolve_db_path

# Docker / override manual; si no, project/database (dev y .exe desde el repo)
DB_PATH = os.getenv("DB_PATH") or resolve_db_path()

_DEBUG_DEFAULT = "0" if is_frozen() else "1"
DEBUG = os.getenv("SGR_DEBUG", _DEBUG_DEFAULT).lower() in ("1", "true", "yes")

# Puerto distinto de 8000 (p. ej. SimLab/uvicorn por defecto) — override: SGR_PORT / API_BASE_URL
SGR_HOST = os.getenv("SGR_HOST", "127.0.0.1")
SGR_PORT = int(os.getenv("SGR_PORT", "8765"))
API_BASE_URL = os.getenv("API_BASE_URL", f"http://{SGR_HOST}:{SGR_PORT}")
MAX_IMAGE_SIZE_MB = 5

import builtins as _builtins
_original_print = _builtins.print
def print(*args, **kwargs):
    kwargs.setdefault('flush', True)
    _original_print(*args, **kwargs)
