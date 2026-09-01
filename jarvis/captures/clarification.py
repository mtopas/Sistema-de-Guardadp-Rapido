"""
Detección de aclaración pre-enqueue para capturas (spec §14, UX de Jarvis).

El worker es fire-and-forget (polling a inbox_queue, sin canal de vuelta al
usuario) -- cualquier pregunta de aclaración tiene que resolverse ANTES de
encolar, nunca después. Este módulo es compartido por los tres clientes de
captura (Telegram, API REST, frontend) para no duplicar la heurística ni la
llamada al modelo local en cada handler.
"""
import logging

from jarvis.llm.client import call_llm

logger = logging.getLogger(__name__)

_REASONING_KEYWORDS = (
    "porque", "por qué", "por que", "ya que", "debido a", "debido",
    "dado que", "razón", "razon", "the reason", "because",
)

_DECISION_CLARIFICATION_QUESTION = "¿Por qué tomaste esta decisión?"


def infer_type_hint(content: str) -> str:
    """Clasificación preliminar heurística, sin LLM (RAW | DECISION | PROJECT).

    Compartida entre Telegram (/j), la API (?check_clarification) y el
    frontend -- sirve solo para decidir si vale la pena preguntar antes de
    encolar. La clasificación real y definitiva la hace el worker
    (call_classify en jarvis/worker/processor.py), que puede diferir.
    """
    c = (content or "").lower()
    if any(w in c for w in ("decidí", "decidi", "decidimos", "acordamos", "resolvimos", "vamos a")):
        return "DECISION"
    if any(w in c for w in ("proyecto", "avance", "sprint", "bloqueado", "estado:")):
        return "PROJECT"
    return "RAW"


def needs_clarification(text: str, detected_type: str) -> tuple[bool, str | None]:
    """¿Esta captura necesita una pregunta de aclaración antes de encolarse?

    Pura: no escribe nada, no encola nada, no hace I/O propio salvo la
    llamada best-effort a call_llm() (modelo local) cuando la heurística de
    keywords no alcanza. Si esa llamada falla por cualquier motivo, nunca
    bloquea la captura -- devuelve (False, None).

    Hoy solo cubre el caso DECISION sin razonamiento explícito (spec: una
    entrada DECISION debe incluir "decisión + razonamiento").
    """
    if detected_type != "DECISION":
        return False, None

    lowered = (text or "").lower()
    if any(kw in lowered for kw in _REASONING_KEYWORDS):
        return False, None

    if _has_reasoning_per_local_model(text):
        return False, None

    return True, _DECISION_CLARIFICATION_QUESTION


_HAS_REASONING_PROMPT = """\
Analiza si el siguiente texto explica el PORQUÉ de una decisión (una razón, \
motivo o justificación), no solo QUÉ se decidió.

Ejemplos:
Texto: decidí usar SQLite porque es más simple para este proyecto
Respuesta: si

Texto: decidí usar gemma3
Respuesta: no

Texto: vamos a usar Python
Respuesta: no

Texto: acordamos posponer el lanzamiento porque faltan pruebas
Respuesta: si

Ahora responde SOLO "si" o "no", sin texto extra.

Texto: {text}
Respuesta:"""


def _has_reasoning_per_local_model(text: str) -> bool:
    """Pide al modelo local un si/no sobre si el texto ya trae el porqué.

    Sin few-shot, gemma3:12b responde falsos positivos en el caso de ejemplo
    de la propia tarea ("decidí usar gemma3" -> "sí" cuando no hay ninguna
    razón). Con los 4 ejemplos de abajo acierta los 4 casos de control
    probados (2 con razón, 2 sin razón) -- ver Cerebro/decisiones-implementacion.md.
    """
    try:
        raw = call_llm(
            messages=[{"role": "user", "content": _HAS_REASONING_PROMPT.format(text=text)}],
            temperature=0.0,
        )
        return raw.strip().lower().startswith("s")
    except Exception as exc:
        logger.warning(
            "[jarvis.captures] Clasificación local de razonamiento falló, "
            "no se bloquea la captura: %s",
            exc,
        )
        return True
