import os
import sys
from pathlib import Path


def _resolve_project_dir() -> Path:
    """`project/` real, sea dev o `.exe` empaquetado (PyInstaller onedir).

    Bug real encontrado el 2026-09-16 investigando por qué el panel "Tipos
    de memoria" del `.exe` mostraba todo en 0 pese a que `jarvis.db` real
    tenía entradas: `Path(__file__).parent.parent` resuelve, dentro del
    bundle, a `dist/SGR/_internal` (donde vive el .py empaquetado), no al
    repo real -- así que `JARVIS_DB_PATH`/`JARVIS_BOVEDA_PATH` apuntaban a
    una `jarvis.db` y una carpeta `Boveda/` fantasma dentro del bundle,
    vacías, creadas en el primer arranque y nunca vinculadas a los datos
    reales. `app/paths.py::_find_repo_data_root()` ya resuelve esto mismo
    para `app.db` (Bóveda/Finanzas/Agenda/Hábitos); se replica el mismo
    criterio acá en vez de importarlo, para no acoplar `jarvis/` a
    `project/app/` (jarvis debe poder correr standalone, ver
    `jarvis/worker/main.py`).
    """
    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).resolve().parent  # project/dist/SGR
        for base in (exe_dir.parent.parent, exe_dir.parent.parent.parent):
            if (base / "database").is_dir():
                return base
    return Path(__file__).resolve().parent.parent / "project"


_BASE = _resolve_project_dir()

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
# Fusión Jarvis + Bóveda (Cerebro/decisiones-implementacion.md, 2026-09-11):
# dos raíces en vez de una sola JARVIS_VAULT_PATH. JARVIS_BOVEDA_PATH es el
# árbol PARA (D:\Boveda) -- contenido del usuario, mismo contrato de
# frontmatter que ya usa project/app/vault/. JARVIS_SYNTH_PATH es el
# subárbol Boveda/Jarvis/ -- SOLO contenido que Jarvis sintetiza (fichas de
# entidades/proyectos, resúmenes de auditoría 'create'), con el schema rico
# (confidence/origin_trust/valid_from/valid_to/source_id). Derivado, no un
# env var independiente, a propósito: evita que las dos raíces queden
# apuntando a lugares no relacionados por un typo de configuración.
# Default: sibling de D:\Boveda al lado del repo (_BASE.parent.parent es la
# carpeta que contiene el repo, ej. D:\ -- no D: hardcodeado, portable a
# donde sea que viva el repo real).
JARVIS_BOVEDA_PATH = Path(
    os.getenv("JARVIS_BOVEDA_PATH", str(_BASE.parent.parent / "Boveda"))
)
JARVIS_SYNTH_PATH = JARVIS_BOVEDA_PATH / "Jarvis"
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
# Cada cuántos días corre el job de consolidación completo (pares similares,
# stale por edad, backfill de tags, auditoría, ingestión/síntesis de Agenda,
# triage de Inbox, pregunta abierta) -- antes corría una vez por día (2026-09-21).
JARVIS_CONSOLIDATION_INTERVAL_DAYS = int(os.getenv("JARVIS_CONSOLIDATION_INTERVAL_DAYS", "7"))

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
# Cuántas propuestas de jarvis_capture_proposals (passive_capture +
# agenda_ingestion, incluidos los patrones de agenda_patterns.py) se empujan
# por Telegram de una vez cuando no queda ninguna sin resolver para ese chat
# -- mismo throttle anti-ráfaga que jarvis/audit/service.py (Cerebro/
# decisiones-implementacion.md, 2026-09-17), namespace propio (NO se reusa
# JARVIS_AUDIT_PUSH_BATCH_SIZE -- son colas independientes, con volumen y
# naturaleza distintos). 1 por default, subible vía env sin tocar código.
JARVIS_CAPTURE_PUSH_BATCH_SIZE = int(os.getenv("JARVIS_CAPTURE_PUSH_BATCH_SIZE", "1"))

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
# Cuántas propuestas de auditoría INDIVIDUALES (no las agrupadas flag_*, no
# open_question) se empujan por Telegram de una vez cuando no queda ninguna
# sin resolver para ese chat -- throttle anti-ráfaga (Cerebro/decisiones-
# implementacion.md, 2026-09-17). 1 por default: lectura más estricta del
# pedido "de a una o dos a la vez"; subir a 2 vía env si hace falta más
# caudal, sin tocar código.
JARVIS_AUDIT_PUSH_BATCH_SIZE = int(os.getenv("JARVIS_AUDIT_PUSH_BATCH_SIZE", "1"))

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

# ── Ingestión automática — Agenda de SGR (jarvis/ingestion/agenda.py, 0.3) ──
# Sexto paso de run_consolidation() -- ver Cerebro/decisiones-implementacion.md
# (2026-09-03, "0.3, Ingestión Automática — arrancando por Agenda de SGR").
# HTTP localhost sin auth al propio backend de SGR (mismo patrón que
# project/mybot/api_config.py / project/mybot/agenda_handlers.py, que ya
# consumen esta misma API) -- ninguna credencial nueva.
_SGR_PORT = os.getenv("SGR_PORT", "8765")
JARVIS_SGR_API_BASE = os.getenv("API_BASE_URL", f"http://127.0.0.1:{_SGR_PORT}")
# Ventana de días hacia atrás que cada corrida revisa (eventos ya terminados,
# tareas completadas) -- candidato de la propuesta aprobada, mismo orden de
# magnitud que JARVIS_AUDIT_RANDOM_COOLDOWN_DAYS.
JARVIS_AGENDA_INGESTION_WINDOW_DAYS = int(os.getenv("JARVIS_AGENDA_INGESTION_WINDOW_DAYS", "7"))

# ── Síntesis de patrones de Agenda (jarvis/ingestion/agenda_patterns.py) ────
# Extensión de 0.3 -- ver Cerebro/decisiones-implementacion.md (2026-09-15,
# "PROPUESTA... síntesis de patrones de Agenda"). Cadencia propia (semanal,
# no diaria como el resto de run_consolidation()): "un patrón de horario no
# cambia todos los días" (criterio del usuario en la propuesta aprobada).
JARVIS_AGENDA_PATTERN_SYNTH_INTERVAL_DAYS = int(
    os.getenv("JARVIS_AGENDA_PATTERN_SYNTH_INTERVAL_DAYS", "7")
)
# Piso de fecha para el escaneo de historial completo que necesita el
# clustering por título (caso "cada 15 días", no modelado como regla de
# repetición real -- ver sección 0 de la propuesta). GET /agenda/eventos
# rellena desde/hasta con un default de ~1 mes atrás/~2 adelante si no se
# pasan explícitos (confirmado en project/app/main.py) -- nunca "todo el
# historial" por sí solo. "2000-01-01" es un piso seguro para cualquier dato
# real de una agenda personal, sin tener que conocer la fecha real de la
# primera fila.
JARVIS_AGENDA_PATTERN_HISTORY_START = os.getenv(
    "JARVIS_AGENDA_PATTERN_HISTORY_START", "2000-01-01"
)
# Ocurrencias mínimas del mismo título (eventos puntuales, se_repite=0) antes
# de que un cluster se le mande al LLM para proponer patrón -- confirmado con
# el usuario en la sesión de diseño (2026-09-15): 3, evita proponer patrón
# sobre una coincidencia de 2 eventos con el mismo nombre.
JARVIS_AGENDA_PATTERN_CLUSTER_MIN_OCCURRENCES = int(
    os.getenv("JARVIS_AGENDA_PATTERN_CLUSTER_MIN_OCCURRENCES", "3")
)
# Tope de llamadas a call_reason() por corrida para el camino de clustering
# -- mismo orden de magnitud que _ENTITY_CREATE_LIMIT de auditoría (jarvis/
# audit/service.py). El costo NO escala con el volumen histórico gracias a
# este tope, solo con la cantidad (acotada) de clusters nuevos por corrida.
JARVIS_AGENDA_PATTERN_CLUSTER_LLM_LIMIT = int(
    os.getenv("JARVIS_AGENDA_PATTERN_CLUSTER_LLM_LIMIT", "3")
)

# ── Triage automático del Inbox (jarvis/ingestion/inbox_triage.py) ──────────
# Ver Cerebro/decisiones-implementacion.md (2026-09-15, "PROPUESTA... triage
# automático del Inbox (00 - Sin categorizar/)", aprobada con las 4
# recomendaciones marcadas "no cerradas" confirmadas tal cual). Cadencia
# semanal propia, mismo criterio de costo que la síntesis de patrones de
# Agenda: con el umbral de antigüedad de abajo, el conjunto de candidatas
# casi no cambia de un día a otro.
JARVIS_INBOX_TRIAGE_INTERVAL_DAYS = int(os.getenv("JARVIS_INBOX_TRIAGE_INTERVAL_DAYS", "7"))
# Antigüedad mínima (días) desde la última edición del ARCHIVO en disco (no
# de memory_entries -- D:\Boveda es la fuente de verdad tras la fusión del
# 2026-09-11, jarvis.db es un índice reconstruible) antes de que una nota del
# inbox sea candidata a triage. Umbral conservador recomendado en la
# propuesta (21-30 días, más laxo que los 7 de agenda/auditoría) porque acá
# el costo de un falso positivo es más alto: se le ofrece mover algo que el
# usuario puede estar germinando a propósito.
JARVIS_INBOX_TRIAGE_MIN_AGE_DAYS = int(os.getenv("JARVIS_INBOX_TRIAGE_MIN_AGE_DAYS", "21"))
# Piso de contenido (caracteres, sobre content_processed/content_raw ya
# strip()eado) para no proponerle destino a un clip corto que el usuario
# guardó tal cual a propósito -- mismo orden de magnitud que
# _MAX_FRAGMENT_CHARS de auditoría (jarvis/audit/service.py). El ruido
# casi-vacío/duplicado (ej. Si.md/Sí.md/S í.md, ~170 bytes cada uno) queda
# afuera GRATIS con este mismo piso -- a propósito no hay un chequeo de
# duplicados nuevo (ver la propuesta: "usa el mismo criterio de contenido
# vacío que ya dispara delete en auditoría").
JARVIS_INBOX_TRIAGE_MIN_CONTENT_CHARS = int(os.getenv("JARVIS_INBOX_TRIAGE_MIN_CONTENT_CHARS", "400"))
# Tope de propuestas por corrida -- mismo criterio de costo acotado que
# _ENTITY_CREATE_LIMIT (auditoría) / JARVIS_AGENDA_PATTERN_CLUSTER_LLM_LIMIT
# (patrones de Agenda): evita una ráfaga de propuestas de golpe la primera
# vez que corre sobre un inbox con backlog.
JARVIS_INBOX_TRIAGE_LIMIT = int(os.getenv("JARVIS_INBOX_TRIAGE_LIMIT", "4"))

# ── Health del worker (jarvis/worker/heartbeat.py) ───────────────────────────
# El worker escribe un heartbeat cada JARVIS_WORKER_POLL_INTERVAL segundos.
# worker_alive = True si el último heartbeat es más reciente que
# JARVIS_WORKER_POLL_INTERVAL * este multiplicador (tolerancia a una vuelta lenta
# del loop, ej. procesando una entrada pesada).
JARVIS_HEALTH_STALE_MULTIPLIER = int(os.getenv("JARVIS_HEALTH_STALE_MULTIPLIER", "3"))
