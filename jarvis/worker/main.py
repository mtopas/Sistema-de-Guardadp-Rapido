"""
Worker de background Jarvis.

Uso:
    cd project
    .\\venv\\Scripts\\activate
    python -m jarvis.worker.main
"""
import logging
import sys
import time
from datetime import datetime, timezone

from jarvis.config import JARVIS_WORKER_POLL_INTERVAL
from jarvis.db.database import get_connection, init_db
from jarvis.observability import setup as setup_observability
from jarvis.worker.processor import process_entry

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


def main() -> None:
    logger.info("[worker] Iniciando Jarvis worker…")
    setup_observability()
    init_db()

    reset_count = _reset_stuck()
    if reset_count:
        logger.info("[worker] %d entrada(s) en PROCESSING → PENDING (crash recovery)", reset_count)

    logger.info("[worker] Loop activo. Poll cada %ds. Ctrl+C para detener.", JARVIS_WORKER_POLL_INTERVAL)

    try:
        while True:
            pending = _fetch_pending()
            if pending:
                for entry_id in pending:
                    logger.info("[worker] Procesando entry_id=%s", entry_id)
                    process_entry(entry_id)
            else:
                time.sleep(JARVIS_WORKER_POLL_INTERVAL)
    except KeyboardInterrupt:
        logger.info("[worker] Detenido por usuario.")


if __name__ == "__main__":
    main()
