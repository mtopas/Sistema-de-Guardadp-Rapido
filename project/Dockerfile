FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
COPY wheelhouse ./wheelhouse/

# Homelab sin salida en build: wheelhouse/ con .whl generado en Windows (ver scripts/prepare-docker-wheelhouse.ps1).
# Si wheelhouse/ está vacío, intenta pip online (requiere docker build --network=host en el gabinete).
RUN set -eux; \
    wheels="$(find wheelhouse -maxdepth 1 \( -name '*.whl' -o -name '*.tar.gz' \) 2>/dev/null | wc -l)"; \
    if [ "$wheels" -gt 0 ]; then \
        echo "Instalando dependencias desde wheelhouse/ (sin red)…"; \
        python -m pip install --no-index --find-links=wheelhouse -r requirements.txt; \
    else \
        echo "wheelhouse/ vacío — pip online (necesita: docker build --network=host)…"; \
        python -m pip install --no-cache-dir -r requirements.txt; \
    fi

COPY app ./app
COPY mybot ./mybot

ENV SGR_DATA_DIR=/app

EXPOSE 8765
