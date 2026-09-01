"""
Heartbeat real del worker (Fase B6) — señal de "worker vivo" para el frontend.

Módulo separado de jarvis/worker/main.py a propósito: main.py configura logging
global al importarse (`logging.basicConfig`), e importarlo desde el proceso de la
API reconfiguraría su logging como efecto secundario no deseado.
"""
import logging
import uuid
from datetime import datetime, timedelta, timezone

from jarvis.config import JARVIS_HEALTH_STALE_MULTIPLIER, JARVIS_WORKER_POLL_INTERVAL
from jarvis.db.database import get_connection

logger = logging.getLogger(__name__)

_POLICY_HEARTBEAT = "worker_heartbeat"


# get_worker_alive() solo lee la fila MÁS RECIENTE de heartbeat -- no hay
# ningún consumidor que necesite historial. Sin poda, cada vuelta del loop
# del worker (cada JARVIS_WORKER_POLL_INTERVAL, 5s por default) agrega una
# fila nueva a jarvis_policies para siempre -- ~17k filas/día, encontrado
# acumulando >11k filas en jarvis.db real durante una sola sesión de testing
# (2026-08-28). A diferencia de consolidation_last_run/consolidation_run
# (auditoría real, baja frecuencia -- una vez al día, esas si valen la pena
# guardar como historial), un heartbeat viejo no tiene ningún valor una vez
# que hay uno más nuevo. Se poda lo anterior a _HEARTBEAT_RETENTION en cada
# escritura -- barato (mismo INSERT ya paga la conexión) y mantiene la tabla
# acotada sin necesitar un job de limpieza aparte.
_HEARTBEAT_RETENTION = timedelta(hours=1)


def write_heartbeat() -> None:
    """Registra que el worker sigue vivo. Mismo patrón append-only que
    consolidation_last_run — INSERT nuevo cada vez, nunca UPDATE in place —
    pero podando heartbeats viejos (ver _HEARTBEAT_RETENTION) porque acá,
    a diferencia de consolidación, no hay ningún valor en conservar el
    historial completo.
    """
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    conn = get_connection()
    try:
        with conn:
            # created_at explícito -- BUG REAL encontrado 2026-08-31: el INSERT
            # original omitía esta columna (única escritura a jarvis_policies en
            # todo el código que lo hace -- _log_conflict/_record_run/debug.
            # service.py siempre la pasan explícita), así que quedaba en manos
            # del DEFAULT del schema (`datetime('now','utc')`), que genera un
            # formato DISTINTO ("2026-08-31 20:22:33", con espacio, sin
            # timezone) al de `now_iso` de abajo ("2026-08-31T17:22:33+00:00",
            # con "T" y offset) -- y además, en este entorno, un valor de reloj
            # distinto (~3h de diferencia, confirmado comparando ambos).
            # El DELETE de acá abajo compara ese created_at (formato SQLite)
            # contra un cutoff en formato Python -- con la misma fecha
            # calendario, "2026-08-31 20:22:33" < "2026-08-31T16:22:33..." da
            # True SIEMPRE (el espacio, 0x20, ordena antes que "T", 0x54),
            # sin importar la hora real -- así que la fila recién insertada se
            # borraba a sí misma en la MISMA transacción, todos los días,
            # dejando `jarvis_policies` sin ningún heartbeat y `get_worker_
            # alive()` devolviendo False para siempre. Confirmado en vivo con
            # `py-spy dump` sobre el proceso real: el worker estaba
            # perfectamente vivo, dormido en el `time.sleep()` normal del
            # loop -- nunca colgado, solo con la tabla vaciándose sola en cada
            # vuelta. Fix: created_at explícito en el mismo formato Python
            # ISO que usa el resto del sistema, consistente con la comparación
            # del DELETE.
            conn.execute(
                "INSERT INTO jarvis_policies (id, policy_type, value, created_at) VALUES (?, ?, ?, ?)",
                (uuid.uuid4().hex, _POLICY_HEARTBEAT, now_iso, now_iso),
            )
            conn.execute(
                "DELETE FROM jarvis_policies WHERE policy_type = ? AND created_at < ?",
                (_POLICY_HEARTBEAT, (now - _HEARTBEAT_RETENTION).isoformat()),
            )
    except Exception as exc:
        logger.warning("[jarvis.heartbeat] write_heartbeat falló: %s", exc)
    finally:
        conn.close()


def get_worker_alive() -> bool:
    """True si el último heartbeat es más reciente que el umbral de tolerancia."""
    conn = get_connection()
    try:
        row = conn.execute(
            """SELECT value FROM jarvis_policies
               WHERE policy_type = ?
               ORDER BY created_at DESC LIMIT 1""",
            (_POLICY_HEARTBEAT,),
        ).fetchone()
    finally:
        conn.close()

    if not row:
        return False
    try:
        last = datetime.fromisoformat(row["value"])
    except Exception:
        return False

    stale_after = timedelta(seconds=JARVIS_WORKER_POLL_INTERVAL * JARVIS_HEALTH_STALE_MULTIPLIER)
    return (datetime.now(timezone.utc) - last) < stale_after
