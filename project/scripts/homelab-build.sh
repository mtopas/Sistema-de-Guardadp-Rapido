#!/usr/bin/env bash
# Build en el gabinete. Preferir wheelhouse/ (offline); si no, --network=host.
set -euo pipefail
cd "$(dirname "$0")/.."

if ls wheelhouse/*.whl 1>/dev/null 2>&1; then
    echo "[homelab-build] wheelhouse detectado — build sin red"
    sudo docker compose build --no-cache
else
    echo "[homelab-build] wheelhouse vacío — build con red del host"
    echo "[homelab-build] Si falla DNS, en Windows: .\\scripts\\prepare-docker-wheelhouse.ps1"
    sudo docker build --network=host --no-cache -t sgr-app:latest .
    sudo docker compose up -d --no-build
    exit 0
fi

sudo docker compose up -d --build
