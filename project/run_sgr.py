"""
Punto de entrada del ejecutable de escritorio (PyInstaller).
Sin consola: ventana pequeña para abrir el navegador y salir con limpieza.
"""

from __future__ import annotations

import os
import socket
import sys
import threading
import time
import webbrowser
from urllib.error import URLError
from urllib.request import urlopen


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


def _port_available(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind((host, port))
        except OSError:
            return False
    return True


def _wait_for_sgr_ui(base_url: str, timeout: float = 20.0) -> bool:
    """Confirma que en base_url corre la SPA de SGR (no otra app en el mismo puerto)."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urlopen(base_url, timeout=1.5) as resp:
                body = resp.read(8192).decode("utf-8", errors="replace")
                if "Bóveda" in body or "/assets/index-" in body:
                    return True
        except (URLError, OSError, TimeoutError):
            pass
        time.sleep(0.3)
    return False


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
    if not _port_available(host, port):
        print(
            f"ERROR: el puerto {port} ya está en uso (¿otra app en {url}?).\n"
            f"Cerrala o ejecutá con SGR_PORT distinto, p. ej. set SGR_PORT=9876",
            file=sys.stderr,
        )
        sys.exit(1)

    if not os.getenv("SGR_NO_BROWSER"):

        def _open() -> None:
            if _wait_for_sgr_ui(url):
                webbrowser.open(url)
            else:
                print(
                    f"ERROR: no respondió la UI de SGR en {url}. "
                    "¿Otra aplicación usa ese puerto?",
                    file=sys.stderr,
                )

        threading.Thread(target=_open, daemon=True).start()

    import uvicorn
    from app.main import app

    uvicorn.run(app, host=host, port=port, log_level="info")


def _run_window(host: str, port: int, url: str) -> None:
    import tkinter as tk
    from tkinter import messagebox, ttk

    port_busy = not _port_available(host, port)
    server = None
    thread = None
    if not port_busy:
        server, thread = _start_server(host, port)
    shutting_down = False

    def open_browser() -> None:
        if port_busy:
            messagebox.showerror(
                "Puerto ocupado",
                f"El puerto {port} ya está en uso.\n\n"
                f"Si tenés otra app (p. ej. SimLab) en {url}, cerrala o definí "
                "otro SGR_PORT antes de abrir SGR.",
            )
            return
        if _wait_for_sgr_ui(url, timeout=3.0):
            webbrowser.open(url)
        else:
            messagebox.showerror(
                "SGR no disponible",
                f"No se detectó la interfaz de SGR en {url}.\n\n"
                "Probablemente otra aplicación usa ese puerto.",
            )

    def quit_app() -> None:
        nonlocal shutting_down
        if shutting_down:
            return
        shutting_down = True
        if server is not None and thread is not None:
            _stop_server(server, thread)
        root.destroy()

    root = tk.Tk()
    root.title("SGR")
    root.resizable(False, False)
    root.protocol("WM_DELETE_WINDOW", quit_app)

    pad = {"padx": 20}
    if port_busy:
        status = f"El puerto {port} ya está en uso."
        hint = (
            f"Otra app puede estar en {url} (p. ej. SimLab).\n"
            "Cerrala o definí otro SGR_PORT."
        )
    else:
        status = "SGR está activo en segundo plano."
        hint = "Cerrar la pestaña del navegador no detiene el programa."
    ttk.Label(root, text=status, font=("Segoe UI", 10)).pack(pady=(16, 6), **pad)
    ttk.Label(
        root,
        text=hint,
        font=("Segoe UI", 9),
        wraplength=320,
        justify="center",
    ).pack(**pad)
    if not port_busy:
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

    if not os.getenv("SGR_NO_BROWSER") and not port_busy:
        root.after(800, open_browser)
    elif port_busy:
        root.after(200, open_browser)

    try:
        root.mainloop()
    finally:
        if not shutting_down and server is not None and thread is not None:
            _stop_server(server, thread)


def main() -> None:
    _ensure_import_path()
    _ensure_stdio()

    from app.config import SGR_HOST as _default_host, SGR_PORT as _default_port

    host = os.getenv("SGR_HOST", _default_host)
    port = int(os.getenv("SGR_PORT", str(_default_port)))
    url = f"http://{host}:{port}/"

    if _use_console_mode():
        _run_console(host, port, url)
    else:
        _run_window(host, port, url)


if __name__ == "__main__":
    main()
