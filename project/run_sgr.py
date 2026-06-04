"""
Punto de entrada del ejecutable de escritorio (PyInstaller).
Sin consola: ventana pequeña para abrir el navegador y salir con limpieza.

Si HOMELAB_HOST está definido en .env, sincroniza la DB con el homelab al
abrir (pull) y ofrece subir cambios al cerrar (push), sin parar Docker.
"""

from __future__ import annotations

import hashlib
import http.client
import os
import queue
import shutil
import socket
import sys
import threading
import time
import uuid
import webbrowser
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import Request as _HttpReq, urlopen


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


# ---------------------------------------------------------------------------
# Sync helpers (pull / push con homelab via HTTP; no requiere parar Docker)
# ---------------------------------------------------------------------------

def _load_dotenv() -> None:
    """Carga .env desde data_root() — funciona tanto en dev como en el .exe frozen."""
    try:
        from dotenv import load_dotenv
        from app.paths import data_root
        load_dotenv(data_root() / ".env", override=False)
    except Exception:
        pass


def _homelab_url() -> str:
    """Devuelve la URL base del homelab, o '' si HOMELAB_HOST no está configurado."""
    _load_dotenv()
    host = os.getenv("HOMELAB_HOST", "").strip()
    if not host:
        return ""
    port = os.getenv("HOMELAB_PORT", "8765")
    return f"http://{host}:{port}"


def _db_hash(path: str) -> str:
    """SHA-256 del archivo; '' si no existe."""
    if not path or not os.path.exists(path):
        return ""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _pull_db(homelab_url: str, db_path: str) -> bool:
    """Descarga app.db del homelab via GET /sync/export. Hace backup local .bak."""
    token = os.getenv("SGR_SYNC_TOKEN", "")
    tmp = db_path + ".sync_tmp"
    try:
        req = _HttpReq(f"{homelab_url}/sync/export")
        if token:
            req.add_header("X-Sync-Token", token)
        with urlopen(req, timeout=30) as resp:
            data = resp.read()
        if len(data) < 4096:
            return False
        if os.path.exists(db_path):
            shutil.copy2(db_path, db_path + ".bak")
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, db_path)
        return True
    except Exception as exc:
        print(f"[sync] pull error: {exc}")
        try:
            os.unlink(tmp)
        except OSError:
            pass
        return False


def _push_db(homelab_url: str, db_path: str) -> bool:
    """Sube app.db al homelab via POST /sync/import (multipart). El homelab hace backup."""
    token = os.getenv("SGR_SYNC_TOKEN", "")
    boundary = uuid.uuid4().hex
    try:
        with open(db_path, "rb") as f:
            file_data = f.read()
        body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="app.db"\r\n'
            f"Content-Type: application/octet-stream\r\n\r\n"
        ).encode() + file_data + f"\r\n--{boundary}--\r\n".encode()
        p = urlparse(homelab_url)
        conn = http.client.HTTPConnection(p.hostname, p.port or 8765, timeout=60)
        hdrs = {
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Content-Length": str(len(body)),
        }
        if token:
            hdrs["X-Sync-Token"] = token
        conn.request("POST", "/sync/import", body=body, headers=hdrs)
        return conn.getresponse().status == 200
    except Exception as exc:
        print(f"[sync] push error: {exc}")
        return False


# ---------------------------------------------------------------------------
# Modos de ejecución
# ---------------------------------------------------------------------------

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

    # -- Sync config --
    homelab_url = _homelab_url()
    try:
        from app.config import DB_PATH as db_path
    except Exception:
        db_path = ""
        homelab_url = ""

    port_busy = not _port_available(host, port)
    do_sync = bool(homelab_url and not port_busy and db_path)

    # -- Estado mutable (dict para evitar nonlocal en múltiples closures) --
    state: dict = {
        "server": None,
        "thread": None,
        "shutting_down": False,
        "db_hash_before": "",
    }
    pull_q: queue.Queue = queue.Queue()

    # ----------------------------------------------------------------
    # Ventana (única instancia Tk)
    # ----------------------------------------------------------------
    root = tk.Tk()
    root.title("SGR")
    root.resizable(False, False)
    root.protocol("WM_DELETE_WINDOW", lambda: _quit())

    pad = {"padx": 20}

    # ── Frame sync ──────────────────────────────────────────────────
    f_sync = ttk.Frame(root)
    lbl_sync = ttk.Label(f_sync, text="Sincronizando con el homelab...",
                          font=("Segoe UI", 10))
    lbl_sync.pack(pady=(16, 8), **pad)
    frm_sync_btns = ttk.Frame(f_sync)
    frm_sync_btns.pack(pady=(0, 16))
    btn_offline = ttk.Button(frm_sync_btns, text="Continuar sin sync",
                              state="disabled", command=lambda: _enter_run())
    ttk.Button(frm_sync_btns, text="Cancelar",
               command=lambda: _quit()).pack(side=tk.LEFT, padx=6)
    btn_offline.pack(side=tk.LEFT, padx=6)

    # ── Frame run ───────────────────────────────────────────────────
    f_run = ttk.Frame(root)
    if port_busy:
        _run_status = f"El puerto {port} ya está en uso."
        _run_hint = (
            f"Otra app puede estar en {url} (p. ej. SimLab).\n"
            "Cerrala o definí otro SGR_PORT antes de abrir SGR."
        )
    else:
        _run_status = "SGR está activo en segundo plano."
        _run_hint = "Cerrar la pestaña del navegador no detiene el programa."
    ttk.Label(f_run, text=_run_status, font=("Segoe UI", 10)).pack(pady=(16, 6), **pad)
    ttk.Label(f_run, text=_run_hint, font=("Segoe UI", 9),
              wraplength=320, justify="center").pack(**pad)
    if not port_busy:
        ttk.Label(f_run, text='Para salir: "Salir" o la X de esta ventana.',
                  font=("Segoe UI", 9), wraplength=320,
                  justify="center").pack(pady=(0, 12), **pad)
    frm_actions = ttk.Frame(f_run)
    frm_actions.pack(pady=(0, 18))
    ttk.Button(frm_actions, text="Abrir navegador",
               command=lambda: _open_browser()).pack(side=tk.LEFT, padx=6)
    ttk.Button(frm_actions, text="Salir",
               command=lambda: _quit()).pack(side=tk.LEFT, padx=6)

    # ----------------------------------------------------------------
    # Callbacks
    # ----------------------------------------------------------------

    def _open_browser() -> None:
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

    def _quit() -> None:
        if state["shutting_down"]:
            return
        state["shutting_down"] = True
        if state["server"] is not None:
            _stop_server(state["server"], state["thread"])
        # Push check: ofrecer subir si la DB cambió durante la sesión
        if homelab_url and state["db_hash_before"] and db_path:
            current = _db_hash(db_path)
            if current and current != state["db_hash_before"]:
                if messagebox.askyesno(
                    "SGR — Sync",
                    "Se detectaron cambios locales.\n\n¿Subir al homelab?",
                ):
                    if not _push_db(homelab_url, db_path):
                        messagebox.showerror(
                            "SGR — Sync",
                            "No se pudo subir al homelab.\nDatos locales intactos.",
                        )
        root.destroy()

    def _enter_run() -> None:
        """Transición sync → run: arranca servidor y muestra frame principal."""
        f_sync.pack_forget()
        f_run.pack()
        if not port_busy:
            state["server"], state["thread"] = _start_server(host, port)
        state["db_hash_before"] = _db_hash(db_path) if (homelab_url and db_path) else ""
        if not os.getenv("SGR_NO_BROWSER") and not port_busy:
            root.after(800, _open_browser)
        elif port_busy:
            root.after(200, _open_browser)

    def _check_pull() -> None:
        """Polling del resultado del pull (corre en el hilo principal via root.after)."""
        try:
            ok = pull_q.get_nowait()
            if ok:
                lbl_sync.config(text="Sincronizado. Iniciando SGR...")
                root.after(500, _enter_run)
            else:
                lbl_sync.config(text="No se pudo sincronizar con el homelab.")
                btn_offline.config(state="normal")
        except queue.Empty:
            root.after(100, _check_pull)

    # ----------------------------------------------------------------
    # Estado inicial
    # ----------------------------------------------------------------
    if do_sync:
        f_sync.pack()
        threading.Thread(
            target=lambda: pull_q.put(_pull_db(homelab_url, db_path)),
            daemon=True,
        ).start()
        root.after(100, _check_pull)
    else:
        _enter_run()

    try:
        root.mainloop()
    finally:
        if not state["shutting_down"] and state["server"] is not None:
            _stop_server(state["server"], state["thread"])


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
