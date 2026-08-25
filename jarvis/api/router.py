"""
FastAPI router para /jarvis/* (spec §15 — FastAPI /jarvis/*).

Montado en project/app/main.py con prefix="/jarvis" cuando el paquete
jarvis está instalado. Si no está disponible, el backend SGR sigue funcionando.

Endpoints:
    POST /jarvis/query    — consulta RAG (pregunta + historial + contexto)
    POST /jarvis/capture  — captura texto al Memory Core (alternativa a /j en Telegram)
    GET  /jarvis/inbox    — lista inbox con estado PENDING/PROCESSING/DONE/ERROR
    GET  /jarvis/budget   — estado del presupuesto diario
"""
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from jarvis.budget.tracker import get_status, spent_today
from jarvis.config import JARVIS_DAILY_BUDGET_USD, JARVIS_DEFAULT_USER
from jarvis.db.database import get_connection
from jarvis.memory.service import capture_raw
from jarvis.query.service import query as _run_query

logger = logging.getLogger(__name__)

router = APIRouter(tags=["jarvis"])


# ── Modelos ────────────────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    question: str
    conversation_id: Optional[str] = None
    user_id: str = JARVIS_DEFAULT_USER


class QueryResponse(BaseModel):
    answer: str
    sources: list[dict]
    conversation_id: str
    context_count: int
    context_sent: int


class CaptureRequest(BaseModel):
    content: str
    source: str = "desktop"
    local_only: bool = False
    confidential: bool = False
    source_id: Optional[str] = None
    user_id: str = JARVIS_DEFAULT_USER


class CaptureResponse(BaseModel):
    entry_id: str


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/query", response_model=QueryResponse)
def query_endpoint(req: QueryRequest):
    """Consulta RAG: recupera fragmentos relevantes y sintetiza respuesta."""
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="La pregunta no puede estar vacía.")
    try:
        result = _run_query(
            question=req.question,
            conversation_id=req.conversation_id,
            channel="desktop",
            channel_id="web",
            user_id=req.user_id,
        )
        return result
    except Exception as exc:
        logger.exception("[jarvis.api] Error en POST /jarvis/query: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/capture", response_model=CaptureResponse)
def capture_endpoint(req: CaptureRequest):
    """Captura texto al Memory Core (equivalente al comando /j en Telegram)."""
    if not req.content.strip():
        raise HTTPException(status_code=400, detail="El contenido no puede estar vacío.")

    valid_sources = {"desktop", "telegram", "migration"}
    source = req.source if req.source in valid_sources else "desktop"
    sid = req.source_id or f"desktop:{uuid.uuid4().hex[:8]}"

    try:
        entry_id = capture_raw(
            content=req.content,
            source=source,
            channel=None,
            source_id=sid,
            origin_trust="user.authenticated",
            local_only=req.local_only,
            confidential=req.confidential,
            user_id=req.user_id,
        )
        return {"entry_id": entry_id}
    except Exception as exc:
        logger.exception("[jarvis.api] Error en POST /jarvis/capture: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/inbox")
def inbox_endpoint(
    limit: int = Query(default=20, ge=1, le=100),
    status: Optional[str] = Query(default=None),
):
    """Lista el inbox con estado de cada entrada."""
    conn = get_connection()
    try:
        if status:
            rows = conn.execute(
                """SELECT iq.entry_id, iq.status, iq.attempts, iq.last_error,
                          iq.updated_at, me.content_raw, me.type, me.recorded_at
                   FROM inbox_queue iq
                   JOIN memory_entries me ON me.id = iq.entry_id
                   WHERE iq.status = ?
                   ORDER BY iq.updated_at DESC LIMIT ?""",
                (status.upper(), limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT iq.entry_id, iq.status, iq.attempts, iq.last_error,
                          iq.updated_at, me.content_raw, me.type, me.recorded_at
                   FROM inbox_queue iq
                   JOIN memory_entries me ON me.id = iq.entry_id
                   ORDER BY iq.updated_at DESC LIMIT ?""",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@router.get("/budget")
def budget_endpoint():
    """Estado del presupuesto diario (ACTIVE / LOW / EXHAUSTED)."""
    return {
        "status": get_status(),
        "spent_usd": round(spent_today(), 6),
        "daily_budget_usd": float(JARVIS_DAILY_BUDGET_USD),
    }
