"""
Triage automático del Inbox (`D:\\Boveda\\00 - Sin categorizar\\`).

Implementa la propuesta aprobada el 2026-09-15 ("PROPUESTA... triage
automático del Inbox (00 - Sin categorizar/)", ver Cerebro/decisiones-
implementacion.md para el detalle completo de diseño y las 4 recomendaciones
que el documento dejó marcadas "no cerradas" -- todas confirmadas por el
usuario al aprobar la implementación completa, implementadas acá tal cual
quedaron recomendadas, sin reabrirlas:

1. Señal "listo para clasificar": antigüedad de la última EDICIÓN del
   archivo (mtime real en disco -- D:\\Boveda es la fuente de verdad tras la
   fusión del 2026-09-11, jarvis.db es un índice reconstruible, así que la
   señal de "cuándo se tocó por última vez" tiene que venir del archivo, no
   de una columna de memory_entries) de 21+ días (JARVIS_INBOX_TRIAGE_MIN_AGE_DAYS)
   + un piso de contenido sustancial (JARVIS_INBOX_TRIAGE_MIN_CONTENT_CHARS,
   ~400 caracteres). El caso de ruido (archivos casi vacíos o duplicados
   exactos, ej. el ejemplo real Si.md/Sí.md/S í.md, ~170 bytes cada uno)
   queda afuera GRATIS con el mismo piso de contenido -- a propósito no hay
   ningún chequeo de duplicados nuevo acá.
2. `01 - Proyectos/` queda FUERA de esta primera versión -- solo los 8
   destinos fijos de Área/Recurso x dominio (_DEST_OPTIONS abajo), enumerable
   y cerrado. Proyectos es un conjunto abierto (se organiza por nombre de
   proyecto, no hay una lista fija) y proponer un destino ahí exigiría
   inventar un nombre nuevo o hacer fuzzy matching contra memory_projects --
   ninguna de las dos cosas existe hoy, es una pieza de diseño aparte.
3. Respuesta de texto libre nombrando otro destino: NO se parsea para
   redirigir el movimiento -- mismo criterio conservador que
   `archive_superseded` (ver jarvis/audit/service.py::_resolve_with_new_info()),
   se guarda la corrección como entrada nueva aparte.
4. Se implementa YA aunque el inbox real de D:\\Boveda tenga hoy 0
   candidatas bajo estos umbrales (Bóveda fusionada con apenas ~5 días de
   vida al momento de la propuesta -- ningún archivo real llega a 21 días
   sin tocar todavía). Esto es esperado, no un bug: la verificación de esta
   pieza usa datos sintéticos que sí cumplen los umbrales, no el inbox real.

Reusa `jarvis/vault/writer.py::move_entry_file()` sin tocarlo -- ya es
genérico (dest_dir_rel es un string libre, sin hardcode a ninguna carpeta en
particular). La capa nueva es la propuesta que lo dispara: `action_type`
nuevo `triage_move` en jarvis_audit_proposals (payload["dest_dir_rel"] en vez
de un destino fijo como archive_superseded), ver
jarvis/audit/service.py::_apply_triage_move()/propose_triage_move().

Gating: jarvis_audit_proposals (NO jarvis_capture_proposals) -- a diferencia
de la síntesis de patrones de Agenda, acá SÍ hace sentido reusar
jarvis_audit_proposals: la fuente de datos son memory_entries YA ACEPTADOS
(las notas del inbox ya son memoria real, no algo por aceptar todavía como
los eventos de Agenda), exactamente el contrato que _apply_create()/
_apply_archive_superseded() ya asumen.

Blast radius: lee memory_entries (propia DB) + el archivo real en disco para
mtime (mismo acceso a D:\\Boveda que ya tiene write_entry()/move_entry_file());
llama al LLM de razonamiento para clasificar (mismo tipo de operación que
_synthesize_entity_summary() de auditoría); propone -- nunca mueve nada sola.
Mismos permisos de MANIFEST que auditoría ("audit_memory"/
"propose_audit_action") -- no es una operación nueva de naturaleza distinta,
es la misma auditoría proactiva mirando un rincón distinto de la memoria.

Cadencia semanal propia (should_run_inbox_triage()), gate independiente del
de 24h del resto de run_consolidation() -- mismo mecanismo que
jarvis/ingestion/agenda_patterns.py::should_run_pattern_synthesis(): con un
umbral de antigüedad de 21+ días, el conjunto de candidatas casi no cambia de
un día a otro, correr todos los días gastaría LLM sin información nueva.
Cap explícito por corrida (JARVIS_INBOX_TRIAGE_LIMIT) para no generar una
ráfaga de propuestas de golpe la primera vez que corre sobre un inbox con
backlog real.
"""
import logging
import re
from datetime import datetime, timedelta, timezone

from jarvis.config import (
    JARVIS_BOVEDA_PATH,
    JARVIS_DEFAULT_USER,
    JARVIS_INBOX_TRIAGE_INTERVAL_DAYS,
    JARVIS_INBOX_TRIAGE_LIMIT,
    JARVIS_INBOX_TRIAGE_MIN_AGE_DAYS,
    JARVIS_INBOX_TRIAGE_MIN_CONTENT_CHARS,
)
from jarvis.db.database import get_connection
from jarvis.worker.task_manifest import MANIFEST

logger = logging.getLogger(__name__)

_POLICY_LAST_RUN = "inbox_triage_last_run"
_LOCAL_PREFIX_RE = re.compile(r"^\s*\[modo local\]\s*", re.IGNORECASE)

# Mismo literal que _INBOX_REL en jarvis/vault/writer.py -- duplicado a
# propósito (constante chica y estable, evita acoplar este módulo a un
# nombre privado de otro archivo).
_INBOX_REL = "00 - Sin categorizar"

# Las 8 rutas exactas permitidas (punto 2 de la propuesta aprobada: 01 -
# Proyectos/ queda fuera). Mismos literales exactos que
# project/app/vault/sync.py::_DOMINIOS_ESTRUCTURALES / _ROOTS_ESTRUCTURALES
# (confirmado leyendo ese archivo) -- duplicados acá por el mismo motivo que
# jarvis/vault/writer.py duplica el contrato de frontmatter en vez de
# importar cruzando el límite jarvis/<->app/ (dos subsistemas con ciclos de
# deploy independientes).
_DEST_OPTIONS = [
    "02 - Areas/Facultad",
    "02 - Areas/Carrera Profesional",
    "02 - Areas/Salud",
    "02 - Areas/Desarrollo Personal",
    "03 - Recursos/Facultad",
    "03 - Recursos/Carrera Profesional",
    "03 - Recursos/Salud",
    "03 - Recursos/Desarrollo Personal",
]
_DEST_OPTIONS_SET = set(_DEST_OPTIONS)

# Safety net de tamaño de prompt -- la propuesta pide leer "el contenido
# completo de la nota candidata" (punto 2), pero notas reales del inbox
# observadas en la investigación llegan a 14-53 KB; un tope generoso evita un
# prompt desmedido para el caso extremo sin recortar el caso típico (el piso
# de calificación ya es solo ~400 caracteres, la inmensa mayoría de
# candidatas reales entra entera).
_MAX_CONTENT_CHARS_FOR_PROMPT = 6000


def should_run_inbox_triage(now: datetime | None = None) -> bool:
    """True si nunca corrió o si pasaron >= JARVIS_INBOX_TRIAGE_INTERVAL_DAYS
    desde la última corrida -- mismo mecanismo que
    agenda_patterns.py::should_run_pattern_synthesis(), intervalo propio."""
    now = now or datetime.now(timezone.utc)
    last = _last_run_at()
    interval = timedelta(days=JARVIS_INBOX_TRIAGE_INTERVAL_DAYS)
    return last is None or (now - last) >= interval


def run_inbox_triage(now: datetime | None = None) -> dict:
    """Corre el triage completo si el gate semanal lo permite. Nunca lanza --
    cualquier error queda en el resumen (mismo contrato que
    run_agenda_pattern_synthesis()/run_audit()).
    """
    now = now or datetime.now(timezone.utc)
    summary = {
        "ran": False,
        "candidates_scanned": 0,
        "proposed": 0,
        "skipped_no_data": 0,
        "errors": [],
        "proposed_detail": [],
        "skipped_detail": [],
    }

    if not should_run_inbox_triage(now):
        return summary

    MANIFEST.assert_allowed("audit_memory")
    MANIFEST.assert_allowed("propose_audit_action")

    summary["ran"] = True

    from jarvis.debug.service import get_debug_chat_id

    chat_id = get_debug_chat_id()
    channel = "telegram" if chat_id else "desktop"

    try:
        candidates = _select_candidates(now)
        summary["candidates_scanned"] = len(candidates)
        for candidate in candidates:
            try:
                _process_candidate(candidate, channel, chat_id, summary)
            except Exception as exc:
                logger.exception(
                    "[jarvis.ingestion.inbox_triage] Error procesando candidata entry_id=%s",
                    candidate["entry"].get("id"),
                )
                summary["errors"].append(str(exc))
    except Exception as exc:
        logger.warning(
            "[jarvis.ingestion.inbox_triage] No se pudo seleccionar candidatas del inbox: %s", exc
        )
        summary["errors"].append(str(exc))

    _record_run(now)
    return summary


# ── Selección de candidatas (punto 1, señal "listo para clasificar") ───────

def _fetch_inbox_entries(user_id: str = JARVIS_DEFAULT_USER) -> list[dict]:
    """Entradas vigentes del inbox (`00 - Sin categorizar/`), siempre
    authorship='user' -- write_entry() nunca rutea síntesis de Jarvis ahí
    (ver jarvis/vault/writer.py), se filtra igual por defensividad."""
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT * FROM memory_entries
               WHERE user_id = ? AND valid_to IS NULL AND authorship = 'user'
                 AND vault_path LIKE ?""",
            (user_id, f"{_INBOX_REL}/%"),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def _file_age_days(vault_path: str, now: datetime) -> int | None:
    """Antigüedad en días desde la última edición REAL del archivo (mtime en
    disco) -- None si el archivo no existe (desincronizado con vault_path,
    ej. movido/borrado fuera de Jarvis) o no se pudo leer."""
    try:
        abs_path = JARVIS_BOVEDA_PATH / vault_path
        if not abs_path.exists():
            return None
        mtime = datetime.fromtimestamp(abs_path.stat().st_mtime, tz=timezone.utc)
        return (now - mtime).days
    except Exception as exc:
        logger.warning(
            "[jarvis.ingestion.inbox_triage] No se pudo leer mtime de %s: %s", vault_path, exc
        )
        return None


def _select_candidates(now: datetime) -> list[dict]:
    """Aplica la señal del punto 1 (antigüedad de edición + piso de
    contenido) y devuelve como mucho JARVIS_INBOX_TRIAGE_LIMIT candidatas,
    las más viejas (por última edición) primero -- mismo criterio de "lo más
    postergado primero" que ya usa el resto de auditoría
    (_select_tag_block(), entry_ids_without_catalog_tags()).
    """
    entries = _fetch_inbox_entries()
    scored: list[dict] = []
    for entry in entries:
        vault_path = entry.get("vault_path")
        if not vault_path:
            continue
        age_days = _file_age_days(vault_path, now)
        if age_days is None or age_days < JARVIS_INBOX_TRIAGE_MIN_AGE_DAYS:
            continue
        content = (entry.get("content_processed") or entry.get("content_raw") or "").strip()
        if len(content) < JARVIS_INBOX_TRIAGE_MIN_CONTENT_CHARS:
            continue
        scored.append({"entry": entry, "age_days": age_days, "content": content})

    scored.sort(key=lambda c: c["age_days"], reverse=True)
    return scored[:JARVIS_INBOX_TRIAGE_LIMIT]


# ── Clasificación por LLM (punto 2, mismo gate anti-alucinación que create) ─

_TRIAGE_PROMPT = """\
Tenés el contenido completo de una nota personal que hoy vive sin \
categorizar. Elegí UNA sola carpeta de destino de esta lista exacta \
(respondé ÚNICAMENTE con el texto exacto de una opción de la lista, sin \
agregar nada más) según dos ejes: (1) el dominio de vida al que pertenece, y \
(2) si es algo VIGENTE/ACTIVO ahora mismo ("02 - Areas/...") o una \
REFERENCIA/CONSULTA para más adelante, no una acción actual ("03 - \
Recursos/...").

Opciones exactas:
{options}

Estos 4 dominios NO cubren toda la vida del usuario -- son solo Facultad, \
Carrera Profesional, Salud y Desarrollo Personal. Sé estricto: si la nota \
trata un tema ajeno a los cuatro (ej. una receta de cocina, el auto, el \
clima, un trámite doméstico, entretenimiento, una lista suelta sin dominio \
claro), o si el contenido menciona un dominio pero no queda claro si es algo \
vigente/activo o una referencia para después, respondé exactamente "NO_SE". \
No es un fallback raro ni una mala respuesta -- es la respuesta correcta \
cada vez que no hay señal real y clara. Nunca inventes una carpeta fuera de \
esta lista, nunca elijas "para no dejarlo sin clasificar".

Contenido de la nota:
{content}

Destino:"""


def _classify_destination(content: str) -> str | None:
    """None si el LLM respondió NO_SE, si la respuesta no es exactamente una
    de las 8 opciones permitidas, o si la llamada falló -- mismo criterio
    anti-alucinación que _synthesize_entity_summary()/_CREATE_PROMPT
    (jarvis/audit/service.py): nunca se acepta una carpeta que no esté en la
    lista cerrada, cualquier cosa rara se trata como "sin dato", no como
    error a reintentar.
    """
    from jarvis.llm.client import call_reason

    truncated = content
    if len(truncated) > _MAX_CONTENT_CHARS_FOR_PROMPT:
        truncated = truncated[:_MAX_CONTENT_CHARS_FOR_PROMPT].rstrip() + "…"

    options_text = "\n".join(f"- {opt}" for opt in _DEST_OPTIONS)
    try:
        raw = call_reason(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Clasificás notas personales en una carpeta de una lista "
                        "cerrada, o decís NO_SE si no hay señal suficiente. Nunca "
                        "inventás una carpeta fuera de la lista."
                    ),
                },
                {
                    "role": "user",
                    "content": _TRIAGE_PROMPT.format(options=options_text, content=truncated),
                },
            ]
        )
    except Exception as exc:
        logger.warning("[jarvis.ingestion.inbox_triage] Clasificación falló: %s", exc)
        return None

    text = _LOCAL_PREFIX_RE.sub("", raw).strip()
    if text in _DEST_OPTIONS_SET:
        return text
    return None


# ── Candidata -> propuesta ───────────────────────────────────────────────

def _process_candidate(candidate: dict, channel: str, chat_id, summary: dict) -> None:
    entry = candidate["entry"]
    entry_id = entry["id"]
    content = candidate["content"]

    dest = _classify_destination(content)
    if not dest:
        summary["skipped_no_data"] += 1
        summary["skipped_detail"].append({
            "content": _short(content), "age_days": candidate["age_days"],
            "reason": "NO_SE (sin señal suficiente de dominio o Área-vs-Recurso)",
        })
        return

    from jarvis.audit.service import propose_triage_move

    pid = propose_triage_move(entry_id, dest, channel, chat_id, JARVIS_DEFAULT_USER)
    if not pid:
        # Dedup de create_proposal() -- ya había una propuesta (cualquier
        # status) para esta entrada, no se repite (mismo criterio que
        # archive_superseded/create de auditoría).
        summary["skipped_detail"].append({
            "content": _short(content), "age_days": candidate["age_days"],
            "reason": "ya había una propuesta pendiente/resuelta para esto -- no se repite",
        })
        return

    summary["proposed"] += 1
    summary["proposed_detail"].append({
        "content": _short(content), "dest": dest, "age_days": candidate["age_days"],
    })

    # 2026-09-17 (Cerebro/decisiones-implementacion.md): antes acá se
    # avisaba por Telegram de inmediato, una por candidata -- eso duplicaba
    # el push ahora que create_proposal()/propose_triage_move() encola esta
    # propuesta (pushed_at=NULL, action_type='triage_move' está en
    # _QUEUED_INDIVIDUAL_ACTION_TYPES de jarvis/audit/service.py) para que
    # la entregue push_next_audit_batch() respetando el throttle. Si este
    # run procesa varias candidatas en la misma corrida semanal, ya no se
    # mandan todas juntas -- salen de a una (o dos, según
    # JARVIS_AUDIT_PUSH_BATCH_SIZE) como el resto de las propuestas de
    # auditoría.


def _short(content: str, n: int = 140) -> str:
    c = (content or "").strip().replace("\n", " ")
    return c if len(c) <= n else c[:n].rstrip() + "…"


# ── Gate semanal (mismo mecanismo que agenda_patterns.py::_last_run_at()) ──

def _last_run_at() -> datetime | None:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT value FROM jarvis_policies WHERE policy_type = ? ORDER BY created_at DESC LIMIT 1",
            (_POLICY_LAST_RUN,),
        ).fetchone()
        if not row:
            return None
        return datetime.fromisoformat(row["value"])
    finally:
        conn.close()


def _record_run(now: datetime) -> None:
    import uuid

    conn = get_connection()
    try:
        with conn:
            conn.execute(
                "INSERT INTO jarvis_policies (id, policy_type, value, created_at) VALUES (?, ?, ?, ?)",
                (str(uuid.uuid4()), _POLICY_LAST_RUN, now.isoformat(), now.isoformat()),
            )
    finally:
        conn.close()
