"""
Punto de entrada del ejecutable de escritorio (PyInstaller).
Arranca la API + UI empaquetada y abre el navegador por defecto.
"""

from __future__ import annotations

import os
import sys
import threading
import time
import webbrowser


def _ensure_import_path() -> None:
    root = os.path.dirname(os.path.abspath(__file__))
    if root not in sys.path:
        sys.path.insert(0, root)


def main() -> None:
    _ensure_import_path()

    host = os.getenv("SGR_HOST", "127.0.0.1")
    port = int(os.getenv("SGR_PORT", "8000"))
    url = f"http://{host}:{port}/"

    if not os.getenv("SGR_NO_BROWSER"):

        def _open() -> None:
            time.sleep(1.5)
            webbrowser.open(url)

        threading.Thread(target=_open, daemon=True).start()

    import uvicorn
    from app.main import app

    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
