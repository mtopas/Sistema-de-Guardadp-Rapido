"""
Punto de entrada del ejecutable de escritorio (PyInstaller).
Sin consola: ventana pequeña para abrir el navegador y salir con limpieza.
"""

from __future__ import annotations

import os
import sys
import threading
import time
import webbrowser


def _ensure_stdio() -> None:
    """console=False (PyInstaller) deja stdout/stderr en None; uvicorn usa .isatty()."""
    if sys.stdout is not None and sys.stderr is not None:
        return
    sink = open(os.devnull, "w", encoding="utf-8", errors="replace")
    if sys.stdout is None:
        sys.stdout = sink
    if sys.stderr is None:
        sys.stderr = sink


def _ensure_import_path() -> None:
    root = os.path.dirname(os.path.abspath(__file__))
    if root not in sys.path:
        sys.path.insert(0, root)


def _is_frozen() -> bool:
    return getattr(sys, "frozen", False)


def _use_console_mode() -> bool:
    return os.getenv("SGR_CONSOLE") == "1" or not _is_frozen()


def _start_server(host: str, port: int):
    import uvicorn
    from app.main import app

    config = uvicorn.Config(app, host=host, port=port, log_level="info")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    return server, thread


def _stop_server(server, thread: threading.Thread, timeout: float = 8.0) -> None:
    server.should_exit = True
    thread.join(timeout=timeout)


def _run_console(host: str, port: int, url: str) -> None:
    if not os.getenv("SGR_NO_BROWSER"):

        def _open() -> None:
            time.sleep(1.5)
            webbrowser.open(url)

        threading.Thread(target=_open, daemon=True).start()

    import uvicorn
    from app.main import app

    uvicorn.run(app, host=host, port=port, log_level="info")


def _run_window(host: str, port: int, url: str) -> None:
    import tkinter as tk
    from tkinter import ttk

    server, thread = _start_server(host, port)
    shutting_down = False

    def open_browser() -> None:
        webbrowser.open(url)

    def quit_app() -> None:
        nonlocal shutting_down
        if shutting_down:
            return
        shutting_down = True
        _stop_server(server, thread)
        root.destroy()

    root = tk.Tk()
    root.title("SGR")
    root.resizable(False, False)
    root.protocol("WM_DELETE_WINDOW", quit_app)

    pad = {"padx": 20}
    ttk.Label(
        root,
        text="SGR está activo en segundo plano.",
        font=("Segoe UI", 10),
    ).pack(pady=(16, 6), **pad)
    ttk.Label(
        root,
        text="Cerrar la pestaña del navegador no detiene el programa.",
        font=("Segoe UI", 9),
        wraplength=320,
        justify="center",
    ).pack(**pad)
    ttk.Label(
        root,
        text="Para salir: «Salir» o la X de esta ventana.",
        font=("Segoe UI", 9),
        wraplength=320,
        justify="center",
    ).pack(pady=(0, 12), **pad)

    actions = ttk.Frame(root)
    actions.pack(pady=(0, 18))
    ttk.Button(actions, text="Abrir navegador", command=open_browser).pack(
        side=tk.LEFT, padx=6
    )
    ttk.Button(actions, text="Salir", command=quit_app).pack(side=tk.LEFT, padx=6)

    if not os.getenv("SGR_NO_BROWSER"):
        root.after(800, open_browser)

    try:
        root.mainloop()
    finally:
        if not shutting_down:
            _stop_server(server, thread)


def main() -> None:
    _ensure_import_path()
    _ensure_stdio()

    host = os.getenv("SGR_HOST", "127.0.0.1")
    port = int(os.getenv("SGR_PORT", "8000"))
    url = f"http://{host}:{port}/"

    if _use_console_mode():
        _run_console(host, port, url)
    else:
        _run_window(host, port, url)


if __name__ == "__main__":
    main()
