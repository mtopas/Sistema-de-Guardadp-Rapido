"""API base del bot — misma fuente que app.config (puerto SGR por defecto)."""

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from app.config import API_BASE_URL as DEFAULT_API_BASE  # noqa: E402
