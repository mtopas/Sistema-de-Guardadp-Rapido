"""Chequeo de arranque compartido por los 3 entrypoints (backend, worker de Jarvis, bot).

Riesgo 1 de `Cerebro/decisiones/2026-09-11-share-smb-boveda-homelab.md`: si el mount
CIFS de `D:\\Boveda` no está montado en el homelab cuando arranca un contenedor, Docker
hace bind-mount de una carpeta local vacía sin error -- el proceso arrancaría en
silencio contra un vault vacío/inaccesible. Esta función fuerza el mismo principio que
ya rige todo el proyecto (nunca fallar en silencio): si la estructura PARA esperada no
está, el proceso se niega a arrancar.

Usado por `app/main.py` (VAULT_ROOT), `jarvis/worker/main.py` y `mybot/bot.py`
(JARVIS_BOVEDA_PATH / VAULT_ROOT -- mismo mount físico una vez desplegado, ver
`jarvis/config.py` y `project/docker-compose.yml.boveda-smb.diff`). Vive en `app/` (no
en `jarvis/`) porque `app/main.py` debe poder arrancar sin el paquete `jarvis` instalado
(ver `_JARVIS_AVAILABLE` en `app/main.py`) -- este módulo no importa nada de `jarvis` ni
de FastAPI, solo stdlib, así que el worker y el bot pueden importarlo sin heredar esa
dependencia opcional al revés.
"""
import sys
from pathlib import Path

REQUIRED_SUBFOLDERS = (
    "00 - Sin categorizar",
    "01 - Proyectos",
    "02 - Areas",
    "03 - Recursos",
    "04 - Archivo",
    "05 - Basura",
)


def ensure_vault_mounted(vault_root: Path | str, *, label: str) -> None:
    """Falla fuerte (log + exit != 0) si `vault_root` no tiene la estructura PARA real.

    No alcanza con `vault_root.exists()`: un bind-mount roto de Docker crea la carpeta
    vacía igual, así que el chequeo real es que el contenido esperado esté adentro.
    """
    root = Path(vault_root)
    missing = [name for name in REQUIRED_SUBFOLDERS if not (root / name).is_dir()]
    if not missing:
        return

    print(
        f"[vault_guard] FATAL: {label}={root} no tiene la estructura PARA esperada "
        f"(faltan: {', '.join(missing)}). El mount SMB/CIFS del vault probablemente no "
        f"está montado -- Docker bind-monta una carpeta local vacía sin avisar cuando "
        f"esto pasa. Verificá el mount (`/mnt/boveda` en el homelab) antes de reintentar. "
        f"El proceso se niega a arrancar para no operar en silencio contra un vault "
        f"vacío o inaccesible.",
        file=sys.stderr,
        flush=True,
    )
    sys.exit(1)
