import os

from app.paths import is_frozen, resolve_db_path

# Docker / override manual; si no, dev → project/database, .exe → %APPDATA%\SGR\database
DB_PATH = os.getenv("DB_PATH") or resolve_db_path()

_DEBUG_DEFAULT = "0" if is_frozen() else "1"
DEBUG = os.getenv("SGR_DEBUG", _DEBUG_DEFAULT).lower() in ("1", "true", "yes")

API_BASE_URL = "http://127.0.0.1:8000"
MAX_IMAGE_SIZE_MB = 5

import builtins as _builtins
_original_print = _builtins.print
def print(*args, **kwargs):
    kwargs.setdefault('flush', True)
    _original_print(*args, **kwargs)
