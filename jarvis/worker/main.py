"""
Worker de background Jarvis.

Uso:
    cd project
    .\\venv\\Scripts\\activate
    python -m jarvis.worker.main
"""
import logging
import sys
import threading
import time
from datetime import datetime, timezone

from jarvis.audit.service import (
    expire_stale_proposals as expire_stale_audit_proposals,
    push_next_audit_batch,
)
from jarvis.captures.passive import (
    expire_stale_proposals,
    push_next_capture_batch,
    scan_and_propose,
)
from jarvis.config import (
    JARVIS_BOVEDA_PATH,
    JARVIS_DEFAULT_USER,
    JARVIS_PASSIVE_CAPTURE_ENABLED,
    JARVIS_WORKER_POLL_INTERVAL,
)
from jarvis.db.database import get_connection, init_db
from jarvis.observability import setup as setup_observability
from jarvis.worker.consolidation import run_consolidation, should_run as should_run_consolidation
from jarvis.worker.heartbeat import write_heartbeat
from jarvis.worker.processor import process_entry
from jarvis.worker.task_manifest import MANIFEST

# Vive en app/ (project/), no en jarvis/ -- ver docstring de app/vault/guard.py. Importable
# acá porque el worker siempre corre con project/ en sys.path (cwd=project en dev por
# CLAUDE.md, cwd=/app -- WORKDIR del Dockerfile -- en el deploy real), igual que
# jarvis/config.py ya asume project/ como sibling fijo.
from app.vault.guard import ensure_vault_mounted

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("jarvis.worker")


def _reset_stuck() -> int:
    """Al arrancar, vuelve a PENDING todas las entradas en PROCESSING (crash recovery)."""
    now = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    try:
        with conn:
            cur = conn.execute(
                "UPDATE inbox_queue SET status = 'PENDING', updated_at = ? WHERE status = 'PROCESSING'",
                (now,),
            )
            return cur.rowcount
    finally:
        conn.close()


def _fetch_pending() -> list[str]:
    now = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT entry_id FROM inbox_queue
               WHERE status = 'PENDING'
                 AND (next_retry_at IS NULL OR next_retry_at <= ?)
               ORDER BY rowid
               LIMIT 1""",
            (now,),
        ).fetchall()
        return [r["entry_id"] for r in rows]
    finally:
        conn.close()


_consolidation_thread: threading.Thread | None = None


def _maybe_run_consolidation() -> None:
    """Lanza el job de consolidación diaria en un thread aparte si corresponde.

    Corre en background (no en el hilo del loop) para que nunca bloquee el
    procesamiento de entradas PENDING del inbox, que es la prioridad del worker.
    """
    global _consolidation_thread

    if _consolidation_thread is not None and _consolidation_thread.is_alive():
        return
    if not should_run_consolidation():
        return

    def _run() -> None:
        try:
            run_consolidation()
        except Exception:
            logger.exception("[worker] Job de consolidación falló")

    _consolidation_thread = threading.Thread(
        target=_run, name="jarvis-consolidation", daemon=True
    )
    _consolidation_thread.start()
    logger.info("[worker] Job de consolidación diaria lanzado en background")


_passive_thread: threading.Thread | None = None


def _maybe_run_passive_capture() -> None:
    """Escanea conversaciones inactivas y expira propuestas vencidas, en un
    thread aparte (mismo motivo que consolidación: nunca bloquear el
    procesamiento de inbox_queue, que es la prioridad del worker). A
    diferencia de consolidación (gate de 24h vía should_run), esto corre en
    cada vuelta ociosa del loop -- find_idle_conversations() es una query
    SQL barata; el costo real (llamada al modelo local) solo se paga cuando
    de verdad hay una conversación inactiva sin revisar.
    """
    global _passive_thread

    if not JARVIS_PASSIVE_CAPTURE_ENABLED:
        return
    if _passive_thread is not None and _passive_thread.is_alive():
        return

    def _run() -> None:
        try:
            MANIFEST.assert_allowed("read_conversations")
            MANIFEST.assert_allowed("propose_capture")
            summary = scan_and_propose()
            if summary["proposed"] or summary["errors"]:
                logger.info(
                    "[worker] Captura pasiva: %d conversación(es) revisadas, %d propuesta(s), %d error(es)",
                    summary["scanned"], summary["proposed"], len(summary["errors"]),
                )
            expired = expire_stale_proposals()
            if expired:
                logger.info("[worker] Captura pasiva: %d propuesta(s) expirada(s)", expired)
        except Exception:
            logger.exception("[worker] Job de captura pasiva falló")

        # Vencimiento de propuestas de auditoría (jarvis.audit.service) -- mismo
        # sweep periódico que captura pasiva, reusando esta misma vuelta del
        # loop en vez de un thread propio (no hay job_queue entre procesos,
        # ver jarvis/captures/passive.py).
        try:
            expired_audit = expire_stale_audit_proposals()
            if expired_audit:
                logger.info("[worker] Auditoría: %d propuesta(s) expirada(s)", expired_audit)
        except Exception:
            logger.exception("[worker] Sweep de vencimiento de auditoría falló")

        # Empuja el próximo lote de la cola de propuestas de auditoría
        # (jarvis.audit.service) -- mismo tick ocioso, mismo motivo que el
        # sweep de vencimiento de arriba (no hay job_queue entre procesos).
        # Es lo que hace que "contesté a la mañana" -> "la próxima llega
        # poco después" en vez de recién al otro día en la corrida de
        # auditoría -- ver Cerebro/decisiones-implementacion.md, 2026-09-17.
        try:
            from jarvis.debug.service import get_debug_chat_id

            chat_id = get_debug_chat_id()
            if chat_id:
                pushed = push_next_audit_batch("telegram", chat_id, JARVIS_DEFAULT_USER)
                if pushed:
                    logger.info(
                        "[worker] Auditoría: %d propuesta(s) empujada(s) de la cola", len(pushed)
                    )
        except Exception:
            logger.exception("[worker] Empuje de cola de auditoría falló")

        # Empuja el próximo lote de la cola de propuestas de captura
        # (jarvis.captures.passive) -- mismo tick ocioso, mismo motivo que el
        # empuje de auditoría de arriba (no hay job_queue entre procesos).
        # Aplica por igual a passive_capture y a agenda_ingestion (incluidos
        # los patrones de agenda_patterns.py) -- tabla hermana de
        # jarvis_audit_proposals, mismo throttle aplicado el mismo día, ver
        # Cerebro/decisiones-implementacion.md, 2026-09-17.
        try:
            from jarvis.debug.service import get_debug_chat_id

            chat_id = get_debug_chat_id()
            if chat_id:
                pushed = push_next_capture_batch("telegram", chat_id, JARVIS_DEFAULT_USER)
                if pushed:
                    logger.info(
                        "[worker] Captura: %d propuesta(s) empujada(s) de la cola", len(pushed)
                    )
        except Exception:
            logger.exception("[worker] Empuje de cola de captura falló")

    _passive_thread = threading.Thread(target=_run, name="jarvis-passive-capture", daemon=True)
    _passive_thread.start()


def main() -> None:
    logger.info("[worker] Iniciando Jarvis worker…")
    # Riesgo 1 de Cerebro/decisiones/2026-09-11-share-smb-boveda-homelab.md -- antes de
    # cualquier otra cosa, ver docstring de app/vault/guard.py.
    ensure_vault_mounted(JARVIS_BOVEDA_PATH, label="JARVIS_BOVEDA_PATH")
    setup_observability()
    init_db()

    reset_count = _reset_stuck()
    if reset_count:
        logger.info("[worker] %d entrada(s) en PROCESSING -> PENDING (crash recovery)", reset_count)

    logger.info("[worker] Loop activo. Poll cada %ds. Ctrl+C para detener.", JARVIS_WORKER_POLL_INTERVAL)

    _maybe_run_consolidation()

    try:
        while True:
            write_heartbeat()
            pending = _fetch_pending()
            if pending:
                for entry_id in pending:
                    logger.info("[worker] Procesando entry_id=%s", entry_id)
                    process_entry(entry_id)
            else:
                _maybe_run_consolidation()
                _maybe_run_passive_capture()
                time.sleep(JARVIS_WORKER_POLL_INTERVAL)
    except KeyboardInterrupt:
        logger.info("[worker] Detenido por usuario.")


if __name__ == "__main__":
    main()
