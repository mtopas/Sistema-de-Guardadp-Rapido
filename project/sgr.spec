# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec — generar con: python -m PyInstaller -y sgr.spec
# Salida: dist/SGR/  (copiar la carpeta entera para distribuir)

import sys
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files

block_cipher = None
ROOT = Path(SPECPATH)

dist_frontend = ROOT / "frontend" / "dist"
if not dist_frontend.is_dir():
    raise SystemExit(
        "Falta frontend/dist. Ejecutá: cd frontend && npm ci && npm run build"
    )

datas = [(str(dist_frontend), "frontend/dist")]
# litellm trae archivos de datos propios (tokenizers, precios por proveedor, etc.) que
# PyInstaller no detecta solo (solo analiza imports de Python, no package_data) -- sin esto
# falla con FileNotFoundError apenas litellm intenta abrir uno de esos JSON (2026-09-14).
datas += collect_data_files("litellm")

hiddenimports = [
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "uvicorn.lifespan.off",
    "multipart",
    "app.db.crud",
    "app.db.database",
    "app.vault.guard",
    "app.vault.parser",
    "app.vault.sync",
    "app.vault.markdown",
    "app.vault.writer",
    "tkinter",
    "_tkinter",
    # tiktoken descubre sus encodings via el mecanismo de plugins tiktoken_ext,
    # que no funciona con el import estatico de PyInstaller (pkgutil.iter_modules
    # no ve nada dentro del bundle congelado) -- sin esto, litellm/jarvis fallan
    # al arrancar con "Unknown encoding cl100k_base" (2026-09-14).
    "tiktoken_ext",
    "tiktoken_ext.openai_public",
]

a = Analysis(
    ["run_sgr.py"],
    pathex=[str(ROOT)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="SGR",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="SGR",
)
