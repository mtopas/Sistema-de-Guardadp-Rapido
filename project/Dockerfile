FROM python:3.11-slim

WORKDIR /app

COPY project/requirements.txt .
COPY project/wheelhouse ./wheelhouse/

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

# Jarvis vive como paquete hermano de project/ en el repo (ver CLAUDE.md) -- por eso el
# build context de docker-compose.yml es el root del repo (..), no project/. Instalado
# editable: pip lo registra a nivel de entorno (site-packages), así que "jarvis" queda
# importable sin importar el cwd o cómo se invoque cada proceso (bot.py como script,
# el worker con -m, el backend vía FastAPI). Sin wheelhouse propio -- requiere red en
# build time (litellm, chromadb, langfuse, opentelemetry); ver HOMELAB.md
# "docker build --network=host" (el gabinete tiene salida a Internet real).
#
# Esta capa va ANTES de copiar app/mybot a propósito: son las que más cambian entre
# deploys, y COPY invalida el caché de todo lo que sigue -- poniéndola antes evita
# reinstalar litellm/chromadb (pesado, ~2 min) en cada rebuild por un cambio de código
# SGR sin tocar jarvis/.
COPY jarvis ./jarvis
RUN python -m pip install --no-cache-dir -e ./jarvis

COPY project/app ./app
COPY project/mybot ./mybot

ENV SGR_DATA_DIR=/app

EXPOSE 8765
