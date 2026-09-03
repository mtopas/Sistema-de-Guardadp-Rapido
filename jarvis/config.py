import os
from pathlib import Path

_BASE = Path(__file__).parent.parent / "project"

# Carga project/.env antes de leer cualquier os.getenv() de este módulo.
# Bug real encontrado probando el worker standalone (`python -m
# jarvis.worker.main`, proceso Python suelto sin pasar por app/config.py ni
# mybot/api_config.py -- los dos únicos lugares que hasta ahora llamaban
# load_dotenv()): sin esto, OPENAI_API_KEY y JARVIS_REASON_MODEL nunca
# llegaban al proceso del worker, así que jarvis/worker/consolidation.py::
# call_reason() (pensado para usar el modelo externo con fallback a local)
# degradaba SIEMPRE a modo local en silencio, sin ningún error visible salvo
# un warning en el log. python-dotenv ya es dependencia de jarvis/ (ver
# pyproject.toml) -- centralizarlo acá, no en cada entrypoint, para que
# cualquier proceso que importe jarvis.config (worker, CLIs futuras, tests)
# quede cubierto sin tener que acordarse de repetirlo. No pisa variables ya
# seteadas en el entorno real (override=False, default de load_dotenv) --
# Docker sigue pasando sus propias env vars sin que esto interfiera.
try:
    from dotenv import load_dotenv

    load_dotenv(_BASE / ".env")
except ImportError:
    pass

# ── Paths ─────────────────────────────────────────────────────────────────────
JARVIS_DB_PATH = Path(
    os.getenv("JARVIS_DB_PATH", str(_BASE / "database" / "jarvis.db"))
)
JARVIS_VAULT_PATH = Path(
    os.getenv("JARVIS_VAULT_PATH", str(_BASE / "vault"))
)
JARVIS_CHROMA_PATH = Path(
    os.getenv("JARVIS_CHROMA_PATH", str(_BASE / "database" / "chroma"))
)

# ── LLM (siempre vía LiteLLM — nunca openai.* ni ollama.* directamente) ──────
_OLLAMA_BASE = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

JARVIS_LOCAL_MODEL = os.getenv(
    "JARVIS_LOCAL_MODEL",
    # "ollama_chat/" (no "ollama/") a propósito: usa /api/chat de Ollama, que maneja los
    # turnos nativamente. El provider "ollama/" arma el prompt a mano como texto plano
    # ("### System:\n...### User:\n...", litellm ollama_pt()) sin agregar un "### Assistant:"
    # final ni stop sequence para modelos sin "instruct" en el nombre — en conversaciones
    # multi-turno el modelo no sabe dónde termina su turno y alucina "### Assistant:" extra
    # (visto en vivo probando /jq por Telegram con llama3.2:3b, respuesta con 3 turnos
    # fantasma incluyendo un bloque de código Python inventado).
    #
    # gemma3:12b — ganador del bake-off 2026-08-26 (ver Cerebro/estado-actual.md): único
    # modelo con 3/3 en los prompts de control de consolidación/clasificación/filtro coarse
    # (llama3.2:3b y deepseek-r1:7b 1/3, mistral-small:22b 2/3 pero más lento). Reemplaza a
    # llama3.2:3b, que fallaba en la tarea de consolidación (spec: "mismo hecho" vs
    # "contradicción" vs "temas distintos").
    "ollama_chat/gemma3:12b",
)
JARVIS_REASON_MODEL = os.getenv(
    "JARVIS_REASON_MODEL",
    "openai/gpt-4o-mini",
)
JARVIS_EMBED_MODEL = os.getenv(
    "JARVIS_EMBED_MODEL",
    "ollama/nomic-embed-text",
)
# Modelo local usado cuando el presupuesto diario se agota (spec §11 — EXHAUSTED)
JARVIS_LOCAL_FALLBACK_MODEL = os.getenv(
    "JARVIS_LOCAL_FALLBACK_MODEL",
    JARVIS_LOCAL_MODEL,
)
JARVIS_OLLAMA_API_BASE = os.getenv("JARVIS_OLLAMA_API_BASE", _OLLAMA_BASE)
# Ollama local puede colgarse sin responder (visto en hardware con poca VRAM) — sin timeout,
# litellm espera indefinidamente y bloquea el worker entero (loop de un solo hilo). Con timeout,
# la llamada falla y el entry_id vuelve a PENDING con retry (spec: _RETRY_DELAYS en processor.py).
JARVIS_OLLAMA_TIMEOUT = float(os.getenv("JARVIS_OLLAMA_TIMEOUT", "120"))


def is_ollama_model(model: str) -> bool:
    return model.startswith("ollama/") or model.startswith("ollama_chat/")


# ── Budget ────────────────────────────────────────────────────────────────────
JARVIS_DAILY_BUDGET_USD = float(os.getenv("JARVIS_DAILY_BUDGET_USD", "1.0"))

# ── Worker ────────────────────────────────────────────────────────────────────
JARVIS_WORKER_POLL_INTERVAL = int(os.getenv("JARVIS_WORKER_POLL_INTERVAL", "5"))

# ── Observabilidad ────────────────────────────────────────────────────────────
LANGFUSE_HOST = os.getenv("LANGFUSE_HOST", "")
LANGFUSE_PUBLIC_KEY = os.getenv("LANGFUSE_PUBLIC_KEY", "")
LANGFUSE_SECRET_KEY = os.getenv("LANGFUSE_SECRET_KEY", "")
OTEL_EXPORTER_ENDPOINT = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")

# ── User ──────────────────────────────────────────────────────────────────────
JARVIS_DEFAULT_USER = os.getenv("JARVIS_DEFAULT_USER", "default")

# ── Debug por Telegram ───────────────────────────────────────────────────────
# chat_id al que el worker manda los mensajes de /jdebugon. Si está vacío, se usa
# el chat_id derivado del primer /j recibido (guardado en jarvis_policies).
JARVIS_TELEGRAM_CHAT_ID = os.getenv("JARVIS_TELEGRAM_CHAT_ID", "").strip()

# ── Consolidación de memoria (jarvis/worker/consolidation.py) ────────────────
# Similitud coseno mínima entre dos entradas del mismo tipo/usuario para
# considerarlas candidatas a "mismo hecho" o "contradicción".
#
# Bajado de 0.92 a 0.70 (2026-08-28) con datos reales de una sesión de testing
# con embeddings reales (nomic-embed-text, no simulados): un same_fact real
# reformulado con otras palabras dio coseno 0.898 y una contradicción real
# ("vivo en Madrid" / "me mudé a Buenos Aires", redactadas sin parecido
# textual) dio 0.748 -- ambos por debajo de 0.92, así que con el umbral viejo
# NUNCA se hubieran detectado (confirma con datos la sospecha ya documentada
# el 26/08: "0.92 probablemente nunca agrupa un same_fact/contradiction real,
# solo casi-duplicados textuales"). Pares sin relación temática midieron
# 0.54-0.59 en el mismo dataset -- 0.70 deja margen cómodo por encima de ese
# piso de ruido y por debajo de las dos señales reales. Bajar este número no
# es riesgoso por sí solo: solo amplía qué pares se le PROPONEN al modelo de
# razonamiento (call_reason) para que decida same_fact/contradiction/
# different -- ese juicio por par ya es el que realmente filtra (un par
# genuinamente distinto sigue resolviendo "different", sin mutación), así
# que ampliar el embudo de candidatos no relaja la decisión final, solo la
# alimenta con más pares que antes ni siquiera llegaban a evaluarse.
JARVIS_CONSOLIDATION_SIMILARITY_THRESHOLD = float(
    os.getenv("JARVIS_CONSOLIDATION_SIMILARITY_THRESHOLD", "0.70")
)
# Días desde valid_from a partir de los cuales una entrada de baja confianza
# se marca obsoleta por edad (sin pasar por el modelo).
JARVIS_CONSOLIDATION_STALE_DAYS = int(os.getenv("JARVIS_CONSOLIDATION_STALE_DAYS", "90"))
# Umbral de confidence por debajo del cual una entrada vieja se marca stale.
JARVIS_CONSOLIDATION_STALE_CONFIDENCE = float(
    os.getenv("JARVIS_CONSOLIDATION_STALE_CONFIDENCE", "0.4")
)

# ── Worker — reintentos (jarvis/worker/processor.py) ─────────────────────────
# Delays en segundos antes de reintentar una entrada que falló (1min, 5min, 30min).
JARVIS_RETRY_DELAYS_SECONDS = [
    int(x) for x in os.getenv("JARVIS_RETRY_DELAYS_SECONDS", "60,300,1800").split(",") if x.strip()
]

# ── Budget (jarvis/budget/tracker.py) ─────────────────────────────────────────
# Ratio de gasto (spent/daily_budget) a partir del cual el status pasa a LOW.
JARVIS_BUDGET_LOW_RATIO = float(os.getenv("JARVIS_BUDGET_LOW_RATIO", "0.8"))

# ── Captura pasiva por inactividad (jarvis/captures/passive.py, pieza C) ─────
JARVIS_PASSIVE_CAPTURE_ENABLED = os.getenv("JARVIS_PASSIVE_CAPTURE_ENABLED", "1") == "1"
# Minutos sin actividad en una conversación antes de evaluarla para proponer
# una captura. No es por-mensaje: espera a que la charla termine de verdad.
JARVIS_PASSIVE_CAPTURE_INACTIVITY_MINUTES = int(
    os.getenv("JARVIS_PASSIVE_CAPTURE_INACTIVITY_MINUTES", "20")
)
# Minutos que una propuesta queda PENDING antes de expirar sola (nunca se
# guarda por default al vencer -- lo contrario de la aclaración de DECISION,
# que si guarda sin razón al vencer: acá el guardado en sí es lo opcional).
JARVIS_PASSIVE_PROPOSAL_TIMEOUT_MINUTES = int(
    os.getenv("JARVIS_PASSIVE_PROPOSAL_TIMEOUT_MINUTES", "30")
)

# ── Auditoría proactiva de memoria (jarvis/audit/service.py) ─────────────────
# Cuarto paso de run_consolidation() -- ver Cerebro/decisiones-implementacion.md
# (2026-08-31). Entradas revisadas por bloque; hay 2 bloques por corrida (uno
# por tag, uno random -- ver jarvis/audit/service.py), así que el tope real de
# entradas revisadas/día es JARVIS_AUDIT_BLOCK_SIZE * 2. Mismo orden de
# magnitud que _TAG_BACKFILL_LIMIT (volumen real ~20 capturas/día).
JARVIS_AUDIT_BLOCK_SIZE = int(os.getenv("JARVIS_AUDIT_BLOCK_SIZE", "10"))
# Días desde la última auditoría antes de que una entrada vuelva a ser
# candidata al bloque random -- evita gastar presupuesto re-revisando por
# azar lo que ya se miró esta semana (no sesga la selección, solo excluye
# lo demasiado reciente).
JARVIS_AUDIT_RANDOM_COOLDOWN_DAYS = int(os.getenv("JARVIS_AUDIT_RANDOM_COOLDOWN_DAYS", "7"))
# Minutos que una jarvis_audit_proposals queda PENDING antes de expirar sola
# (nunca se aplica nada al vencer -- mismo default que captura pasiva). 24h
# por default, no 30 min como captura pasiva: el audit corre una vez al día,
# probablemente sin el usuario cerca del chat.
JARVIS_AUDIT_PROPOSAL_TIMEOUT_MINUTES = int(
    os.getenv("JARVIS_AUDIT_PROPOSAL_TIMEOUT_MINUTES", "1440")
)

# ── Pregunta abierta exploratoria (jarvis/audit/service.py) ──────────────────
# Quinto paso de run_consolidation() -- dispara SOLO cuando la corrida no tuvo
# nada más que reportar (pairwise/stale/backfill/auditoría vacíos, ver
# Cerebro/decisiones-implementacion.md). Dos variables independientes a
# propósito -- no un único número mágico: ENABLED apaga el mecanismo entero
# (para cuando el usuario ya no lo quiere más) sin tocar el cooldown; COOLDOWN
# ajusta la frecuencia (el usuario la va a subir a mano si empieza a molestar)
# sin tener que desactivarlo. Nunca se mezclan en una sola variable.
JARVIS_OPEN_QUESTION_ENABLED = os.getenv("JARVIS_OPEN_QUESTION_ENABLED", "1") == "1"
# Días desde la última pregunta abierta antes de que el mecanismo pueda
# disparar otra -- default corto (~2 días, roughly 3x/semana) porque el gate
# real de "no molestar todos los días" ya lo da la condición de "nada más
# para reportar" (un día con actividad real nunca dispara esto); el cooldown
# es una segunda capa para no preguntar dos días quietos seguidos.
JARVIS_OPEN_QUESTION_COOLDOWN_DAYS = int(os.getenv("JARVIS_OPEN_QUESTION_COOLDOWN_DAYS", "2"))

# ── Health del worker (jarvis/worker/heartbeat.py) ───────────────────────────
# El worker escribe un heartbeat cada JARVIS_WORKER_POLL_INTERVAL segundos.
# worker_alive = True si el último heartbeat es más reciente que
# JARVIS_WORKER_POLL_INTERVAL * este multiplicador (tolerancia a una vuelta lenta
# del loop, ej. procesando una entrada pesada).
JARVIS_HEALTH_STALE_MULTIPLIER = int(os.getenv("JARVIS_HEALTH_STALE_MULTIPLIER", "3"))
