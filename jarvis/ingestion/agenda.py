"""
Ingestión automática — Agenda de SGR (Jarvis 0.3, primera fuente).

Implementa la propuesta aprobada el 2026-09-03 ("0.3, Ingestión Automática —
arrancando por Agenda de SGR", ver Cerebro/decisiones-implementacion.md
para el detalle completo, y Cerebro/estado-actual.md, "Fase B", para el
resumen). Sexto paso de jarvis/worker/consolidation.py::run_consolidation()
(mismo gating de "una vez por día" vía should_run(), sin thread ni
scheduling propio) — lee eventos ya terminados y tareas ya completadas de
la Agenda de SGR de los últimos JARVIS_AGENDA_INGESTION_WINDOW_DAYS días y
propone una fila PENDING en jarvis_capture_proposals por cada candidato
nuevo, reusando exactamente el mismo mecanismo de confirmación humana
(Telegram/desktop, accept_proposal()/reject_proposal()) que ya usa captura
pasiva por inactividad.

Blast radius explícito (punto 3 de la propuesta, mismo principio que
jarvis/worker/task_manifest.py):
  - Puede leer ÚNICAMENTE GET /agenda/eventos y GET /agenda/tareas de la API
    HTTP local de SGR (nunca project/database/app.db directo).
  - Nunca escribe en Agenda (ni siquiera para marcar "ya ingerido" — ese
    estado vive enteramente del lado de Jarvis, ver _already_proposed()).
  - Nunca hace ningún otro request externo.
  - Nunca escribe en memory_entries directo — únicamente crea filas PENDING
    en jarvis_capture_proposals (jarvis.captures.passive.create_proposal()).
    La única forma de que algo se vuelva memoria real es la misma
    confirmación humana de siempre (jarvis.captures.passive.accept_proposal()).
  - Dos operaciones nuevas en TaskManifest.ALLOWED_OPERATIONS:
    "read_agenda_source" y "propose_agenda_capture" — assert_allowed()
    explícito antes de cada una, igual que el resto del worker.

Nunca ingiere eventos futuros — solo lo que YA pasó (fecha_fin/fecha_inicio
de un evento, o completada=1 de una tarea): ingerir algo que todavía no
ocurrió sería "recordar algo que no pasó todavía", y es un mecanismo de
recordatorios (0.9 Proactividad), no esta fase.

Tres decisiones no cerradas del todo por el documento de diseño — resueltas
acá con criterio conservador, reportadas explícitamente (no en silencio, ver
Cerebro/decisiones-implementacion.md para el detalle completo de cada una):

1. **Zona horaria**: `agenda_eventos.fecha_inicio`/`fecha_fin` y
   `agenda_tareas.fecha_opcional` son timestamps NAIVE en hora LOCAL (el
   frontend arma "YYYY-MM-DDTHH:MM:00" directo de <input type=date/time>,
   sin conversión a UTC — confirmado leyendo
   project/frontend/src/components/agenda/EventoModal.jsx). El `now`
   UTC-aware que recibe run_consolidation() NO sirve para comparar "¿esto ya
   pasó?" contra esos campos sin arriesgar un desfase silencioso cerca de la
   medianoche según el offset horario real del entorno — se usa acá un
   `datetime.now()` local naive aparte, solo para esta comparación.
2. **`agenda_tareas` no tiene una columna "fecha de completado" real** — solo
   `fecha_opcional` (la fecha en la que la tarea está agendada, no cuándo se
   marcó como hecha) y `completada` (booleano). La propuesta asumía que sí
   existía ("filtrado ... a completada=1 con fecha de completado dentro de
   la misma ventana"). Resolución conservadora: se usa `fecha_opcional` como
   proxy — tareas completadas SIN fecha_opcional se excluyen de 0.3 por
   completo (no hay señal de recencia con la que acotarlas a la ventana de
   N días sin arriesgar ingerir de golpe todo el historial de tareas
   completadas la primera vez que corre esto).
3. **Eventos recurrentes**: GET /agenda/eventos expande una regla de
   repetición en varias ocurrencias, todas con el MISMO `id` (fila única en
   agenda_eventos) pero `fecha_inicio` distinta por ocurrencia (ver
   project/app/db/crud.py::_expand_recurring()). La propuesta proponía
   `source_id` determinístico `"agenda:evento:{id}"` a secas — con eso, solo
   la primera ocurrencia de un evento recurrente se propondría jamás (las
   siguientes dedupearían contra la primera). Se agrega `fecha_inicio` a la
   clave (`"agenda:evento:{id}:{fecha_inicio}"`) para que cada ocurrencia
   pasada se proponga como lo que es — una instancia distinta.

Además, un gap real del documento (no una decisión de diseño, un caso que
directamente no cerraba): dedupear ÚNICAMENTE contra memory_entries.source_id
(como decía el punto 3 de la propuesta) no evita re-proponer un evento que
el usuario ya RECHAZÓ explícitamente — rechazar una propuesta nunca crea una
memory_entry, así que la próxima corrida lo volvería a proponer mientras
siga dentro de la ventana. Se agrega origin_source_key en
jarvis_capture_proposals (ver jarvis/db/schema.py) y se dedupea también
contra esa tabla, cualquiera sea el status ya resuelto (incluye REJECTED) —
mismo criterio que ya usa jarvis.audit.service._already_exists() (dedupea
sin mirar status).

Extensión (2026-09-15, ver Cerebro/decisiones-implementacion.md, "PROPUESTA...
síntesis de patrones de Agenda"): eventos con se_repite=1 dejan de proponerse
acá ocurrencia por ocurrencia (`_fetch_recent_events()`) -- lo recurrente lo
cubre exclusivamente `jarvis/ingestion/agenda_patterns.py`, que sintetiza el
patrón una sola vez a partir de `regla_repeticion` en vez de repetir la misma
información cada semana. Este módulo queda exclusivo para eventos puntuales
(se_repite=0) y tareas completadas (sin cambio, nunca tuvieron recurrencia).
"""
import logging
from datetime import date, datetime, timedelta, timezone

import requests

from jarvis.config import (
    JARVIS_AGENDA_INGESTION_WINDOW_DAYS,
    JARVIS_DEFAULT_USER,
    JARVIS_SGR_API_BASE,
)
from jarvis.db.database import get_connection
from jarvis.worker.task_manifest import MANIFEST

logger = logging.getLogger(__name__)

_HTTP_TIMEOUT = 15


def run_agenda_ingestion(now: datetime | None = None) -> dict:
    """Corre la ingestión completa. Nunca lanza -- cualquier error queda en
    el resumen (mismo contrato que run_audit()/scan_and_propose()).
    """
    MANIFEST.assert_allowed("read_agenda_source")
    MANIFEST.assert_allowed("propose_agenda_capture")

    now = now or datetime.now(timezone.utc)
    local_now = datetime.now()  # ver punto 1 del docstring del módulo

    summary = {
        "events_scanned": 0, "tasks_scanned": 0, "proposed": 0, "errors": [],
        "proposed_detail": [],
    }

    from jarvis.debug.service import get_debug_chat_id

    chat_id = get_debug_chat_id()
    channel = "telegram" if chat_id else "desktop"

    try:
        events = _fetch_recent_events(local_now)
        summary["events_scanned"] = len(events)
        for evt in events:
            try:
                if _propose_event(evt, channel, chat_id, summary):
                    summary["proposed"] += 1
            except Exception as exc:
                logger.exception(
                    "[jarvis.ingestion.agenda] Error proponiendo evento id=%s", evt.get("id")
                )
                summary["errors"].append(str(exc))
    except Exception as exc:
        logger.warning("[jarvis.ingestion.agenda] No se pudo leer /agenda/eventos: %s", exc)
        summary["errors"].append(f"eventos: {exc}")

    try:
        tasks = _fetch_recent_completed_tasks(local_now)
        summary["tasks_scanned"] = len(tasks)
        for t in tasks:
            try:
                if _propose_task(t, channel, chat_id, summary):
                    summary["proposed"] += 1
            except Exception as exc:
                logger.exception(
                    "[jarvis.ingestion.agenda] Error proponiendo tarea id=%s", t.get("id")
                )
                summary["errors"].append(str(exc))
    except Exception as exc:
        logger.warning("[jarvis.ingestion.agenda] No se pudo leer /agenda/tareas: %s", exc)
        summary["errors"].append(f"tareas: {exc}")

    # Empuja el próximo lote de la cola de propuestas de captura (throttle,
    # ver Cerebro/decisiones-implementacion.md, 2026-09-17) -- al final de la
    # corrida, para que el primer lote de propuestas recién creadas (o algo
    # que ya estaba en cola de una corrida anterior) salga sin esperar el
    # próximo tick ocioso del worker. Mismo criterio que run_audit().
    if channel == "telegram" and chat_id:
        try:
            from jarvis.captures.passive import push_next_capture_batch

            push_next_capture_batch(channel, chat_id, JARVIS_DEFAULT_USER)
        except Exception as exc:
            logger.exception(
                "[jarvis.ingestion.agenda] Error empujando el próximo lote de la cola de captura"
            )
            summary["errors"].append(str(exc))

    return summary


# ── Lectura de la Agenda (solo GET /agenda/eventos y GET /agenda/tareas) ────

def _fetch_recent_events(local_now: datetime) -> list[dict]:
    desde = (local_now - timedelta(days=JARVIS_AGENDA_INGESTION_WINDOW_DAYS)).isoformat()
    hasta = local_now.isoformat()
    resp = requests.get(
        f"{JARVIS_SGR_API_BASE}/agenda/eventos",
        params={"desde": desde, "hasta": hasta},
        timeout=_HTTP_TIMEOUT,
    )
    resp.raise_for_status()
    eventos = resp.json()
    # Extensión de síntesis de patrones (ver Cerebro/decisiones-implementacion.md,
    # 2026-09-15, sección 1): un evento con se_repite=1 ya NO se propone
    # ocurrencia por ocurrencia acá -- proponer cada ocurrencia pasada de
    # "MatDis lunes 9-11hs" sería la misma información repetida cada semana
    # una vez que el patrón (jarvis/ingestion/agenda_patterns.py) ya la
    # sintetiza una sola vez. 0.3 literal queda exclusivo para eventos
    # puntuales y tareas completadas (las tareas no tienen recurrencia, ver
    # jarvis_tareas -- no requieren cambio).
    return [
        e for e in eventos
        if not e.get("se_repite") and _event_already_ended(e, local_now)
    ]


def _event_already_ended(evt: dict, local_now: datetime) -> bool:
    """Solo eventos ya PASADOS -- nunca futuros (ver docstring del módulo)."""
    marker = evt.get("fecha_fin") or evt.get("fecha_inicio")
    if not marker:
        return False
    try:
        if evt.get("todo_el_dia"):
            return date.fromisoformat(marker[:10]) < local_now.date()
        return datetime.fromisoformat(marker) <= local_now
    except Exception:
        return False


def _fetch_recent_completed_tasks(local_now: datetime) -> list[dict]:
    resp = requests.get(
        f"{JARVIS_SGR_API_BASE}/agenda/tareas",
        params={"pendientes": "false"},
        timeout=_HTTP_TIMEOUT,
    )
    resp.raise_for_status()
    tareas = resp.json()

    cutoff = (local_now - timedelta(days=JARVIS_AGENDA_INGESTION_WINDOW_DAYS)).date()
    today = local_now.date()
    result = []
    for t in tareas:
        if not t.get("completada"):
            continue
        fecha = t.get("fecha_opcional")
        if not fecha:
            # Sin fecha_opcional no hay señal de recencia -- ver punto 2 del
            # docstring del módulo. Se excluyen a propósito.
            continue
        try:
            fecha_date = date.fromisoformat(fecha[:10])
        except Exception:
            continue
        if cutoff <= fecha_date <= today:
            result.append(t)
    return result


# ── Dedup (nunca vuelve a proponer lo mismo) ─────────────────────────────────

def _already_proposed(source_key: str) -> bool:
    """True si este evento/tarea ya se convirtió en memory_entry (aceptado
    alguna vez) O ya tiene una fila en jarvis_capture_proposals con esta
    clave, sea cual sea su status -- incluye REJECTED, ver punto final del
    docstring del módulo (gap del documento original, resuelto acá).
    """
    conn = get_connection()
    try:
        if conn.execute(
            "SELECT 1 FROM memory_entries WHERE source_id = ? LIMIT 1", (source_key,)
        ).fetchone():
            return True
        return (
            conn.execute(
                "SELECT 1 FROM jarvis_capture_proposals WHERE origin_source_key = ? LIMIT 1",
                (source_key,),
            ).fetchone()
            is not None
        )
    finally:
        conn.close()


# ── Propuestas ────────────────────────────────────────────────────────────

def _propose_event(evt: dict, channel: str, chat_id: str | None, summary: dict) -> bool:
    source_key = f"agenda:evento:{evt['id']}:{evt.get('fecha_inicio')}"
    if _already_proposed(source_key):
        return False
    content, question = _event_content_and_question(evt)
    _create_proposal(source_key, content, question, channel, chat_id, summary)
    return True


def _propose_task(t: dict, channel: str, chat_id: str | None, summary: dict) -> bool:
    source_key = f"agenda:tarea:{t['id']}"
    if _already_proposed(source_key):
        return False
    content, question = _task_content_and_question(t)
    _create_proposal(source_key, content, question, channel, chat_id, summary)
    return True


def _create_proposal(
    source_key: str, content: str, question: str,
    channel: str, chat_id: str | None, summary: dict,
) -> None:
    from jarvis.captures.passive import create_proposal

    create_proposal(
        conversation_id=None,
        channel=channel,
        channel_id=chat_id,
        content=content,
        question=question,
        user_id=JARVIS_DEFAULT_USER,
        origin_source="agenda_ingestion",
        origin_source_key=source_key,
    )
    summary["proposed_detail"].append({"content": content, "question": question})
    # 2026-09-17 (Cerebro/decisiones-implementacion.md): antes acá se avisaba
    # por Telegram de inmediato, evento/tarea por evento/tarea -- confirmado
    # como una de las ráfagas reales de producción (21 propuestas de Agenda
    # terminaron 20 EXPIRED + 1 REJECTED + 0 ACCEPTED, ninguna resuelta a
    # tiempo, ver Cerebro/decisiones/... y el comentario histórico en
    # jarvis/ingestion/agenda_patterns.py). create_proposal() ahora encola
    # esta propuesta (pushed_at=NULL para canal telegram) para que la
    # entregue jarvis.captures.passive.push_next_capture_batch() respetando
    # JARVIS_CAPTURE_PUSH_BATCH_SIZE -- mismo criterio ya aplicado el mismo
    # día a triage_move en jarvis/ingestion/inbox_triage.py.


# ── Contenido/pregunta sintetizados (sin LLM -- datos ya estructurados) ─────

def _format_fecha_evento(fecha_inicio: str | None, todo_el_dia: bool) -> str:
    if not fecha_inicio:
        return "sin fecha"
    if todo_el_dia:
        return fecha_inicio[:10]
    return fecha_inicio.replace("T", " ")[:16]


def _event_content_and_question(evt: dict) -> tuple[str, str]:
    titulo = evt.get("titulo") or "(sin título)"
    fecha = _format_fecha_evento(evt.get("fecha_inicio"), bool(evt.get("todo_el_dia")))
    content = f"Evento en tu Agenda: {titulo} ({fecha})"
    if evt.get("descripcion"):
        content += f"\n{evt['descripcion']}"
    question = f'¿Guardo en tu memoria este evento de tu Agenda: "{titulo}" ({fecha})?'
    return content, question


def _task_content_and_question(t: dict) -> tuple[str, str]:
    titulo = t.get("titulo") or "(sin título)"
    fecha = t.get("fecha_opcional") or ""
    content = f"Tarea completada en tu Agenda: {titulo}"
    if fecha:
        content += f" ({fecha})"
    if t.get("descripcion"):
        content += f"\n{t['descripcion']}"
    question = f'¿Guardo en tu memoria esta tarea completada de tu Agenda: "{titulo}"?'
    return content, question
