"""
Síntesis de patrones de Agenda de SGR — extensión de 0.3 (Ingestión Automática).

Implementa la propuesta aprobada el 2026-09-15 ("PROPUESTA... síntesis de
patrones de Agenda, distinta del contenido literal", ver
Cerebro/decisiones-implementacion.md para el detalle completo de diseño y
Cerebro/estado-actual.md para el resumen de la sesión). A diferencia de
jarvis/ingestion/agenda.py (0.3, contenido literal evento-por-evento,
authorship='user'), este módulo sintetiza PATRONES -- horarios recurrentes,
hábitos de vida inferidos -- con authorship='jarvis_synthesis', mismo criterio
que jarvis/audit/service.py::_apply_create() para fichas de entidad.

Dos caminos, según qué tan estructurado esté el patrón en los datos reales de
SGR (ver sección 0 de la propuesta aprobada, `_expand_recurring()` en
project/app/db/crud.py):

1. **Regla directa, sin LLM** (`_fetch_recurring_rule_events()` /
   `_propose_rule_pattern()`): un evento con `se_repite=1` ya trae el patrón
   completo en `regla_repeticion` (JSON custom de SGR: frecuencia/dias/hasta,
   NO es RRULE de iCal) -- es una transformación determinística de datos ya
   estructurados, cero llamadas a LLM. Cubre "cursa MatDis los lunes 9-11hs".
2. **Cluster inferido, con LLM acotado** (`_fetch_all_punctual_events()` /
   `_build_title_clusters()` / `_propose_cluster_pattern()`): `regla_repeticion`
   NO modela "cada N días" -- para ese caso el patrón solo se ve agrupando en
   el historial completo varios eventos puntuales (`se_repite=0`) que
   comparten título. Cubre "voy a la oficina cada 15 días". Mismo criterio
   anti-alucinación que `_CREATE_PROMPT` de auditoría (jarvis/audit/service.py):
   sintetiza SOLO con las fechas reales provistas, "SIN_DATOS" si no hay
   patrón reconocible.

Blast radius: idéntico al de 0.3 -- MANIFEST ya cubre "read_agenda_source"/
"propose_agenda_capture" (mismo tipo de operación: leer GET /agenda/eventos,
proponer una fila PENDING en jarvis_capture_proposals). Nunca escribe en
Agenda, nunca escribe en memory_entries directo, nunca otro request externo.

Cadencia propia, no diaria (ver should_run_pattern_synthesis()): "un patrón de
horario no cambia todos los días" -- criterio del usuario en la sesión de
diseño. Gate semanal independiente del gate de 24h del resto de
run_consolidation(), mismo mecanismo que _last_run_at()/_record_run() de
jarvis/worker/consolidation.py pero con su propio policy_type e intervalo.

Gating: reusa jarvis_capture_proposals (NO jarvis_audit_proposals -- evaluado
y descartado explícitamente en la propuesta aprobada: `target_entry_ids` de
audit depende de memory_entries YA ACEPTADOS como fuente, y la Agenda real del
usuario tiene hoy 20 EXPIRED + 1 REJECTED + 0 ACCEPTED sobre 21 propuestas de
0.3 -- fuente de datos insuficiente para sintetizar nada real). Namespace
nuevo de origin_source_key, paralelo al "agenda:evento:.../agenda:tarea:..."
que ya usa 0.3: "agenda:patron:evento:{id}:{hash}" (regla directa) /
"agenda:patron:cluster:{slug}:{n_ocurrencias}" (cluster -- ver
_propose_cluster_pattern() para por qué el conteo de ocurrencias reemplaza al
hash de contenido en este camino específico). authorship='jarvis_synthesis'
se resuelve en accept_proposal() (jarvis/captures/passive.py) mirando ese
prefijo -- ver el cambio puntual ahí.

Actualización de un patrón que cambió ("deja de entrenar los martes"): NO hay
mecanismo de supersesión nuevo acá -- se reusa la consolidación diaria
existente (same_fact, jarvis/worker/consolidation.py, recalibrada a umbral
0.70 el 26/08-31/08 con datos reales). Incertidumbre real, sin probar: nunca
se validó ese umbral contra contenido de horarios/hábitos (solo contra
domicilio/proveedor de hosting) -- si en producción un patrón viejo y uno
nuevo conviven más de un día sin que consolidación los detecte, esa es la
señal de que hace falta un mecanismo explícito (campo `supersedes_entry_id`),
no algo a construir preventivamente.
"""
import hashlib
import json
import logging
import re
from datetime import date, datetime, timedelta, timezone

import requests

from jarvis.config import (
    JARVIS_AGENDA_PATTERN_CLUSTER_LLM_LIMIT,
    JARVIS_AGENDA_PATTERN_CLUSTER_MIN_OCCURRENCES,
    JARVIS_AGENDA_PATTERN_HISTORY_START,
    JARVIS_AGENDA_PATTERN_SYNTH_INTERVAL_DAYS,
    JARVIS_DEFAULT_USER,
    JARVIS_SGR_API_BASE,
)
from jarvis.db.database import get_connection
from jarvis.ingestion.agenda import _already_proposed
from jarvis.worker.task_manifest import MANIFEST

logger = logging.getLogger(__name__)

_HTTP_TIMEOUT = 15
_POLICY_LAST_RUN = "agenda_pattern_synthesis_last_run"
_LOCAL_PREFIX_RE = re.compile(r"^\s*\[modo local\]\s*", re.IGNORECASE)

_DIAS_SEMANA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


def should_run_pattern_synthesis(now: datetime | None = None) -> bool:
    """True si nunca corrió o si pasaron >= JARVIS_AGENDA_PATTERN_SYNTH_INTERVAL_DAYS
    desde la última corrida -- mismo mecanismo que consolidation.py::should_run(),
    intervalo propio (semanal, no 24h)."""
    now = now or datetime.now(timezone.utc)
    last = _last_run_at()
    interval = timedelta(days=JARVIS_AGENDA_PATTERN_SYNTH_INTERVAL_DAYS)
    return last is None or (now - last) >= interval


def run_agenda_pattern_synthesis(now: datetime | None = None) -> dict:
    """Corre la síntesis completa (ambos caminos) si el gate semanal lo
    permite. Nunca lanza -- cualquier error queda en el resumen (mismo
    contrato que run_agenda_ingestion()/run_audit()).
    """
    now = now or datetime.now(timezone.utc)
    summary = {
        "ran": False,
        "rule_based_scanned": 0, "rule_based_proposed": 0,
        "clusters_scanned": 0, "clusters_proposed": 0,
        "errors": [], "proposed_detail": [],
    }

    if not should_run_pattern_synthesis(now):
        return summary

    MANIFEST.assert_allowed("read_agenda_source")
    MANIFEST.assert_allowed("propose_agenda_capture")

    summary["ran"] = True

    from jarvis.debug.service import get_debug_chat_id

    chat_id = get_debug_chat_id()
    channel = "telegram" if chat_id else "desktop"

    try:
        events = _fetch_recurring_rule_events()
        summary["rule_based_scanned"] = len(events)
        for evt in events:
            try:
                if _propose_rule_pattern(evt, channel, chat_id, summary):
                    summary["rule_based_proposed"] += 1
            except Exception as exc:
                logger.exception(
                    "[jarvis.ingestion.agenda_patterns] Error proponiendo patrón de regla para evento id=%s",
                    evt.get("id"),
                )
                summary["errors"].append(str(exc))
    except Exception as exc:
        logger.warning(
            "[jarvis.ingestion.agenda_patterns] No se pudo leer eventos recurrentes: %s", exc
        )
        summary["errors"].append(f"regla_directa: {exc}")

    try:
        eventos = _fetch_all_punctual_events()
        clusters = _build_title_clusters(eventos)
        summary["clusters_scanned"] = len(clusters)
        llm_calls = 0
        for cluster in clusters:
            if llm_calls >= JARVIS_AGENDA_PATTERN_CLUSTER_LLM_LIMIT:
                break
            titulo = cluster[0].get("titulo") or "(sin título)"
            key_base = f"agenda:patron:cluster:{_slug(titulo)}:{len(cluster)}"
            if _already_proposed(key_base):
                # Mismo título, misma cantidad de ocurrencias que la última
                # vez que se propuso -- nada nuevo que sintetizar, no gasta
                # LLM (ver docstring del módulo, "por qué el conteo
                # reemplaza al hash de contenido acá").
                continue
            llm_calls += 1
            try:
                if _propose_cluster_pattern(titulo, cluster, key_base, channel, chat_id, summary):
                    summary["clusters_proposed"] += 1
            except Exception as exc:
                logger.exception(
                    "[jarvis.ingestion.agenda_patterns] Error proponiendo patrón de cluster '%s'",
                    titulo,
                )
                summary["errors"].append(str(exc))
    except Exception as exc:
        logger.warning(
            "[jarvis.ingestion.agenda_patterns] No se pudo leer/clusterizar historial de eventos: %s",
            exc,
        )
        summary["errors"].append(f"cluster_inferido: {exc}")

    _record_run(now)

    # Empuja el próximo lote de la cola de propuestas de captura (throttle,
    # ver Cerebro/decisiones-implementacion.md, 2026-09-17) -- al final de la
    # corrida, para que el primer lote de propuestas recién creadas (o algo
    # que ya estaba en cola de una corrida anterior) salga sin esperar el
    # próximo tick ocioso del worker. Mismo criterio que run_audit()/
    # run_agenda_ingestion(). Si el gate semanal bloqueó esta corrida (return
    # temprano de arriba), no hace falta empujar acá -- el tick ocioso del
    # worker ya lo hace cada JARVIS_WORKER_POLL_INTERVAL de todos modos.
    if channel == "telegram" and chat_id:
        try:
            from jarvis.captures.passive import push_next_capture_batch

            push_next_capture_batch(channel, chat_id, JARVIS_DEFAULT_USER)
        except Exception as exc:
            logger.exception(
                "[jarvis.ingestion.agenda_patterns] Error empujando el próximo lote de la cola de captura"
            )
            summary["errors"].append(str(exc))

    return summary


# ── Camino 1: regla directa (sin LLM) ───────────────────────────────────────

def _fetch_recurring_rule_events() -> list[dict]:
    """Eventos con se_repite=1, uno por id (no expandidos por ocurrencia --
    regla_repeticion es metadata estática del evento, no algo derivado de
    mirar ocurrencias pasadas, ver sección 0 de la propuesta aprobada).

    Sin desde/hasta explícitos a propósito: la ruta GET /agenda/eventos ya
    rellena un default razonable (~1 mes atrás a ~2 meses adelante, ver
    project/app/main.py) que alcanza para capturar cualquier regla activa hoy
    con al menos una ocurrencia en ese rango -- no hace falta el historial
    completo para este camino (a diferencia del clustering de abajo), y pedir
    un rango amplio acá solo agregaría costo de expansión sin beneficio.
    """
    resp = requests.get(
        f"{JARVIS_SGR_API_BASE}/agenda/eventos",
        timeout=_HTTP_TIMEOUT,
    )
    resp.raise_for_status()
    eventos = resp.json()
    by_id: dict = {}
    for e in eventos:
        if not e.get("se_repite"):
            continue
        by_id.setdefault(e["id"], e)
    return list(by_id.values())


def _format_horario(fecha_inicio: str | None, fecha_fin: str | None, todo_el_dia: bool) -> str:
    if todo_el_dia or not fecha_inicio or len(fecha_inicio) < 16:
        return ""
    inicio = fecha_inicio[11:16]
    fin = fecha_fin[11:16] if fecha_fin and len(fecha_fin) >= 16 else ""
    return f" {inicio}-{fin}hs" if fin else f" {inicio}hs"


def _rule_pattern_text(evt: dict) -> str | None:
    """Transformación determinística de regla_repeticion -> texto de patrón,
    sin LLM (ver docstring del módulo). None si la regla no trae nada
    reconocible (frecuencia ausente/desconocida, o "semanal" sin días)."""
    regla = evt.get("regla_repeticion")
    if isinstance(regla, str):
        try:
            regla = json.loads(regla)
        except Exception:
            return None
    if not regla:
        return None

    titulo = evt.get("titulo") or "(sin título)"
    horario = _format_horario(evt.get("fecha_inicio"), evt.get("fecha_fin"), bool(evt.get("todo_el_dia")))
    frecuencia = regla.get("frecuencia")

    if frecuencia == "diario":
        texto = f"{titulo}: todos los días{horario}"
    elif frecuencia == "semanal":
        dias = sorted(d for d in (regla.get("dias") or []) if isinstance(d, int) and 0 <= d <= 6)
        if not dias:
            return None
        dias_txt = ", ".join(_DIAS_SEMANA[d] for d in dias)
        texto = f"{titulo}: todos los {dias_txt}{horario}"
    elif frecuencia == "mensual":
        try:
            dia_mes = date.fromisoformat(evt["fecha_inicio"][:10]).day
        except Exception:
            return None
        texto = f"{titulo}: el día {dia_mes} de cada mes{horario}"
    else:
        return None

    hasta = regla.get("hasta")
    if hasta:
        texto += f" (hasta {hasta})"
    return texto


def _propose_rule_pattern(evt: dict, channel: str, chat_id: str | None, summary: dict) -> bool:
    texto = _rule_pattern_text(evt)
    if not texto:
        return False
    content = f"Patrón detectado en tu Agenda: {texto}"
    source_key = f"agenda:patron:evento:{evt['id']}:{_content_hash(content)}"
    if _already_proposed(source_key):
        return False
    question = f'¿Guardo este patrón que detecté en tu Agenda: "{texto}"?'
    _create_proposal(source_key, content, question, channel, chat_id, summary)
    return True


# ── Camino 2: cluster inferido por título (con LLM acotado) ────────────────

def _fetch_all_punctual_events() -> list[dict]:
    """Historial completo de eventos puntuales (se_repite=0) -- necesario
    para detectar patrones no modelados como regla real (ver sección 0/6 de
    la propuesta aprobada). se_repite=1 se descarta ANTES de pedir esto (el
    request ya trae ambos, se filtra en memoria) -- ya cubiertos por
    _fetch_recurring_rule_events(), y expandirlos sobre un rango de
    JARVIS_AGENDA_PATTERN_HISTORY_START a hoy podría generar miles de filas
    (_expand_recurring() en project/app/db/crud.py) sin aportar nada al
    clustering por título.
    """
    resp = requests.get(
        f"{JARVIS_SGR_API_BASE}/agenda/eventos",
        params={
            "desde": JARVIS_AGENDA_PATTERN_HISTORY_START,
            "hasta": date.today().isoformat(),
        },
        timeout=_HTTP_TIMEOUT,
    )
    resp.raise_for_status()
    eventos = resp.json()
    return [e for e in eventos if not e.get("se_repite")]


def _normalize_titulo(titulo: str | None) -> str:
    return " ".join((titulo or "").strip().lower().split())


def _build_title_clusters(eventos: list[dict]) -> list[list[dict]]:
    """Agrupa eventos puntuales por título normalizado; se queda con los
    clusters de JARVIS_AGENDA_PATTERN_CLUSTER_MIN_OCCURRENCES ocurrencias o
    más (confirmado con el usuario: 3). Puro Python, sin costo de LLM."""
    groups: dict[str, list[dict]] = {}
    for e in eventos:
        key = _normalize_titulo(e.get("titulo"))
        if not key:
            continue
        groups.setdefault(key, []).append(e)
    clusters = [
        g for g in groups.values()
        if len(g) >= JARVIS_AGENDA_PATTERN_CLUSTER_MIN_OCCURRENCES
    ]
    clusters.sort(key=lambda g: g[0].get("titulo") or "")
    return clusters


_CLUSTER_PROMPT = """\
Tenés estas fechas en las que aparece el mismo evento "{titulo}" en la Agenda \
real del usuario (ya pasadas, ordenadas). Describí en una sola oración, en \
español, el patrón de frecuencia que ves -- SOLO si hay un patrón real y \
reconocible (ej. "aproximadamente cada 15 días", "una vez por mes", "cada 2-3 \
semanas, sin día fijo"). No agregues ningún dato que no se desprenda de estas \
fechas -- no inventes ni asumas nada. Si las fechas no muestran un patrón \
claro, respondé exactamente "SIN_DATOS".

Fechas:
{fechas}

Patrón:"""


def _synthesize_cluster_pattern(titulo: str, cluster: list[dict]) -> str | None:
    fechas = "\n".join(
        f"- {e['fecha_inicio'][:10]}"
        for e in sorted(cluster, key=lambda e: e.get("fecha_inicio") or "")
        if e.get("fecha_inicio")
    )
    if not fechas:
        return None
    from jarvis.llm.client import call_reason

    try:
        raw = call_reason(
            messages=[
                {
                    "role": "system",
                    "content": "Sintetizás patrones de frecuencia solo con las fechas provistas, sin inventar nada.",
                },
                {"role": "user", "content": _CLUSTER_PROMPT.format(titulo=titulo, fechas=fechas)},
            ]
        )
    except Exception as exc:
        logger.warning(
            "[jarvis.ingestion.agenda_patterns] Síntesis de cluster falló para '%s': %s", titulo, exc
        )
        return None
    text = _LOCAL_PREFIX_RE.sub("", raw).strip()
    if not text or text.upper().startswith("SIN_DATOS"):
        return None
    return text


def _propose_cluster_pattern(
    titulo: str, cluster: list[dict], source_key: str,
    channel: str, chat_id: str | None, summary: dict,
) -> bool:
    if _already_proposed(source_key):
        return False
    patron = _synthesize_cluster_pattern(titulo, cluster)
    if not patron:
        return False
    content = f"Patrón detectado en tu Agenda: {titulo} — {patron}"
    question = f'¿Guardo este patrón que detecté en tu Agenda: "{titulo}" — {patron}?'
    _create_proposal(source_key, content, question, channel, chat_id, summary)
    return True


# ── Compartido ───────────────────────────────────────────────────────────

def _content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def _slug(text: str) -> str:
    text = (text or "").lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text[:48].strip("-") or "patron"


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
    # por Telegram de inmediato, patrón por patrón -- una de las ráfagas
    # reales confirmadas en producción (ver el hallazgo documentado arriba,
    # "usuario tiene hoy 20 EXPIRED + 1 REJECTED + 0 ACCEPTED sobre 21
    # propuestas de 0.3"). create_proposal() ahora encola esta propuesta
    # (pushed_at=NULL para canal telegram) para que la entregue
    # jarvis.captures.passive.push_next_capture_batch() respetando
    # JARVIS_CAPTURE_PUSH_BATCH_SIZE -- mismo criterio ya aplicado el mismo
    # día a triage_move en jarvis/ingestion/inbox_triage.py y acá mismo en
    # jarvis/ingestion/agenda.py.


# ── Gate semanal (mismo mecanismo que consolidation.py::_last_run_at()) ────

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
