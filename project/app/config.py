import os

# Si existe la variable en Docker la usa, si no, usa la ruta local
DB_PATH = os.getenv("DB_PATH", "./database/app.db")

DEBUG = True  # set to False in production

API_BASE_URL = "http://127.0.0.1:8000"
MAX_IMAGE_SIZE_MB = 5

import builtins as _builtins
_original_print = _builtins.print
def print(*args, **kwargs):
    kwargs.setdefault('flush', True)
    _original_print(*args, **kwargs)
