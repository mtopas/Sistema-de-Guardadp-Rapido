"""
Cliente HTTP para Ollama.

Funciones públicas:
  is_available() -> bool          healthcheck rápido (timeout 3s)
  classify(system, mensaje) -> dict  extracción de intención; devuelve {} si falla
  chat(messages, system?) -> str     respuesta conversacional; devuelve "" si falla
  embed(text) -> list[float]         vector de embeddings; devuelve [] si falla

Si Ollama no está corriendo, todas las funciones fallan silenciosamente y devuelven
el tipo vacío correspondiente — el bot cae al sistema de prefijos sin excepciones.
"""

from __future__ import annotations

import json
import logging
import os

import requests

logger = logging.getLogger(__name__)

# ── Configuración desde .env ───────────────────────────────────────────────────

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
MODEL_CLASSIFY  = os.environ.get("OLLAMA_MODEL_CLASSIFY", "llama3.2:3b")
MODEL_CHAT      = os.environ.get("OLLAMA_MODEL_CHAT",     "llama3.2:3b")
MODEL_EMBED     = os.environ.get("OLLAMA_MODEL_EMBED",    "nomic-embed-text")
TIMEOUT         = int(os.environ.get("OLLAMA_TIMEOUT", "15"))


# ── Funciones públicas ─────────────────────────────────────────────────────────

def is_available() -> bool:
    """Devuelve True si el servicio Ollama está corriendo y responde."""
    try:
        r = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=3)
        return r.status_code == 200
    except Exception:
        return False


def classify(system_prompt: str, user_message: str) -> dict:
    """
    Clasifica la intención del mensaje y extrae datos estructurados.

    Usa /api/generate con format='json' — Ollama garantiza JSON válido en la respuesta.
    Devuelve el dict parseado, o {} si el modelo falla / no responde.
    """
    prompt = f"{system_prompt}\n\nMensaje del usuario: {user_message}"
    try:
        r = requests.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={
                "model":  MODEL_CLASSIFY,
                "prompt": prompt,
                "stream": False,
                "format": "json",
            },
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        raw = r.json().get("response", "")
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("llm_client.classify: respuesta no es JSON — %s", raw[:300])
        return {}
    except Exception as exc:
        logger.warning("llm_client.classify: %s", exc)
        return {}


def chat(messages: list[dict], system: str | None = None) -> str:
    """
    Genera una respuesta conversacional.

    messages: lista de dicts {role: 'user'|'assistant'|'system', content: str}
    system:   prompt de sistema opcional (alternativa a incluirlo en messages)

    Devuelve el texto de la respuesta, o "" si falla.
    """
    payload: dict = {
        "model":    MODEL_CHAT,
        "messages": messages,
        "stream":   False,
    }
    if system:
        payload["system"] = system
    try:
        r = requests.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json=payload,
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        return r.json().get("message", {}).get("content", "")
    except Exception as exc:
        logger.warning("llm_client.chat: %s", exc)
        return ""


def embed(text: str) -> list[float]:
    """
    Genera el vector de embeddings para un texto (usa nomic-embed-text por defecto).
    Devuelve lista vacía si falla.
    """
    try:
        r = requests.post(
            f"{OLLAMA_BASE_URL}/api/embeddings",
            json={"model": MODEL_EMBED, "prompt": text},
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        return r.json().get("embedding", [])
    except Exception as exc:
        logger.warning("llm_client.embed: %s", exc)
        return []


# ── Test manual ───────────────────────────────────────────────────────────────
# Correr desde project/mybot/:  python llm_client.py

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    print("=== Healthcheck ===")
    ok = is_available()
    print(f"Ollama disponible: {ok}")
    if not ok:
        print("Ollama no está corriendo. Inicialo y volvé a probar.")
        raise SystemExit(1)

    print("\n=== classify ===")
    SYSTEM = (
        "Clasificá la intención del mensaje. "
        "Devolvé SOLO JSON con los campos: modulo, accion, confianza (0.0-1.0)."
    )
    resultado = classify(SYSTEM, "gasté 1500 en el super con la Naranja X")
    print(json.dumps(resultado, ensure_ascii=False, indent=2))

    print("\n=== chat ===")
    respuesta = chat(
        messages=[{"role": "user", "content": "¿Cuánto es 15% de 1500? Respondé solo el número."}],
    )
    print(f"Respuesta: {respuesta!r}")

    print("\n=== embed ===")
    vector = embed("machine learning en español")
    print(f"Dimensión del vector: {len(vector)}")
    print(f"Primeros 5 valores: {vector[:5]}")
