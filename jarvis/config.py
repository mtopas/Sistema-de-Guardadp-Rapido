import os
from pathlib import Path

_BASE = Path(__file__).parent.parent / "project"

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

JARVIS_CLASSIFY_MODEL = os.getenv(
    "JARVIS_CLASSIFY_MODEL",
    # "ollama_chat/" (no "ollama/") a propósito: usa /api/chat de Ollama, que maneja los
    # turnos nativamente. El provider "ollama/" arma el prompt a mano como texto plano
    # ("### System:\n...### User:\n...", litellm ollama_pt()) sin agregar un "### Assistant:"
    # final ni stop sequence para modelos sin "instruct" en el nombre (como "llama3.2:3b") —
    # en conversaciones multi-turno el modelo no sabe dónde termina su turno y alucina
    # "### Assistant:" extra (visto en vivo probando /jq por Telegram, respuesta con 3 turnos
    # fantasma incluyendo un bloque de código Python inventado).
    "ollama_chat/llama3.2:3b",
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
    JARVIS_CLASSIFY_MODEL,
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
