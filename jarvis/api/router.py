"""
FastAPI router para /jarvis/* (spec §15 — FastAPI /jarvis/*).

Montado en project/app/main.py con prefix="/jarvis" cuando el paquete
jarvis está instalado. Si no está disponible, el backend SGR sigue funcionando.

Endpoints:
    POST /jarvis/query            — consulta RAG (pregunta + historial + contexto)
    POST /jarvis/capture          — captura texto al Memory Core (alternativa a /j en Telegram)
    GET  /jarvis/inbox            — lista inbox con estado PENDING/PROCESSING/DONE/ERROR
    GET  /jarvis/budget           — estado del presupuesto diario (+ desglose por modelo)
    GET  /jarvis/entities         — lista de entidades conocidas (0.2 Slice 3, enriquecida en B3)
    GET  /jarvis/entities/{name}  — entradas vinculadas a una entidad
    GET  /jarvis/stats/types      — conteos por tipo de memoria (panel izquierdo)
    GET  /jarvis/projects         — proyectos con memory_count/last_activity crudos
    GET  /jarvis/events           — últimos eventos del worker (tab Debug)
    GET  /jarvis/health           — señal real de "worker vivo" (heartbeat)
    GET  /jarvis/chats            — lista de chats web (multi-chat)
    POST /jarvis/chats            — crear chat
    PATCH  /jarvis/chats/{id}     — renombrar chat
    DELETE /jarvis/chats/{id}     — borrar chat (cascada a sus mensajes)
    GET  /jarvis/chats/{id}/messages — historial completo del chat, con fecha/hora
    GET  /jarvis/entries/{id}     — detalle de una entrada de memoria (fuente clickeable)
    GET  /jarvis/audit-proposals  — propuestas de auditoría (?status=all para historial)
    GET  /jarvis/audit-proposals/isolated — hueco tipo B, entradas sin entidad/proyecto
    POST /jarvis/audit-proposals/{id}/accept
    POST /jarvis/audit-proposals/{id}/reject
"""
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from jarvis.audit.service import (
    accept_proposal as accept_audit_proposal,
    list_isolated_entries,
    list_pending_proposals as list_pending_audit_proposals,
    list_proposals as list_audit_proposals,
    reject_proposal as reject_audit_proposal,
)
from jarvis.browse.service import browse_entries
from jarvis.budget.tracker import get_status, spent_today, spent_today_by_model
from jarvis.captures.clarification import infer_type_hint, needs_clarification
from jarvis.captures.passive import accept_proposal, list_pending_proposals, reject_proposal
from jarvis.chats.service import create_chat, delete_chat, get_messages, list_chats, rename_chat
from jarvis.config import JARVIS_DAILY_BUDGET_USD, JARVIS_DEFAULT_USER
from jarvis.db.database import get_connection
from jarvis.entities.service import get_entries_for_entity, list_entities
from jarvis.events.service import list_recent_events
from jarvis.memory.service import capture_raw, edit_entry, forget_entry, get_entry
from jarvis.projects.service import list_projects_with_activity
from jarvis.query.service import query as _run_query
from jarvis.stats.service import count_entries_by_type
from jarvis.tags.service import get_entries_for_tag, list_tags_with_counts
from jarvis.worker.heartbeat import get_worker_alive

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
    # Aclaración pre-enqueue (opt-in, ver jarvis/captures/clarification.py):
    # check_clarification=True pide chequear antes de encolar; clarification
    # trae la razón del usuario para concatenar y encolar sin volver a chequear.
    check_clarification: bool = False
    clarification: Optional[str] = None


class CaptureResponse(BaseModel):
    entry_id: str


class ClarificationNeededResponse(BaseModel):
    clarification_needed: bool = True
    question: str


class CreateChatRequest(BaseModel):
    title: Optional[str] = None
    user_id: str = JARVIS_DEFAULT_USER


class RenameChatRequest(BaseModel):
    title: Optional[str] = None
    user_id: str = JARVIS_DEFAULT_USER


class EditEntryRequest(BaseModel):
    content: Optional[str] = None
    type: Optional[str] = None
    tags: Optional[list[str]] = None


class AcceptProposalRequest(BaseModel):
    clarification: Optional[str] = None


class AcceptAuditProposalRequest(BaseModel):
    reply: Optional[str] = None  # solo usado por action_type='clarify'


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
            # channel_id solo importa cuando conversation_id es None -- ahí
            # query.service.query() cae a get_or_create_conversation(), que
            # resuelve "la conversación MÁS RECIENTE para este channel_id
            # exacto". Antes era el string fijo "web", compartido por
            # cualquier caller que omitiera conversation_id -- exactamente el
            # bug raíz ya cerrado una vez (Mejoras_Jarvis.md punto 3, ver
            # decisiones-implementacion.md 2026-08-26): con un channel_id
            # compartido, dos llamadas sin id podían reengancharse a la misma
            # fila y arrastrar historial ajeno. El frontend real (useStore.js
            # jarvisQuery()) siempre crea un chat primero y manda su id, así
            # que este fallback nunca se ejercita en uso normal -- pero
            # generar un channel_id nuevo por llamada (en vez de arreglar el
            # contrato exigiendo conversation_id) mantiene la conveniencia de
            # "funciona sin gestionar chats" para cualquier otro caller
            # (tests, integraciones futuras) sin dejar la puerta abierta a
            # reengancharse con la conversación de otro caller.
            channel_id=f"web-implicit:{uuid.uuid4().hex}",
            user_id=req.user_id,
        )
        return result
    except Exception as exc:
        logger.exception("[jarvis.api] Error en POST /jarvis/query: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/capture")
def capture_endpoint(req: CaptureRequest):
    """Captura texto al Memory Core (equivalente al comando /j en Telegram).

    Aclaración pre-enqueue opt-in: con check_clarification=true, si el texto
    parece una DECISION sin razonamiento explícito, responde
    {"clarification_needed": true, "question": "..."} SIN encolar todavía
    (ClarificationNeededResponse). El caller reintenta el POST con el campo
    "clarification" -- se concatena al contenido original y se encola. Sin
    ninguno de los dos campos, el comportamiento es exactamente el de antes.
    """
    if not req.content.strip():
        raise HTTPException(status_code=400, detail="El contenido no puede estar vacío.")

    content = req.content
    if req.clarification and req.clarification.strip():
        content = f"{req.content}\nRazón: {req.clarification.strip()}"
    elif req.check_clarification:
        detected_type = infer_type_hint(req.content)
        needs, question = needs_clarification(req.content, detected_type)
        if needs:
            return ClarificationNeededResponse(question=question)

    valid_sources = {"desktop", "telegram", "migration"}
    source = req.source if req.source in valid_sources else "desktop"
    sid = req.source_id or f"desktop:{uuid.uuid4().hex[:8]}"

    try:
        entry_id = capture_raw(
            content=content,
            source=source,
            channel=None,
            source_id=sid,
            origin_trust="user.authenticated",
            local_only=req.local_only,
            confidential=req.confidential,
            user_id=req.user_id,
        )
        return CaptureResponse(entry_id=entry_id)
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
    """Estado del presupuesto diario (ACTIVE / LOW / EXHAUSTED) + desglose por modelo (B4)."""
    return {
        "status": get_status(),
        "spent_usd": round(spent_today(), 6),
        "daily_budget_usd": float(JARVIS_DAILY_BUDGET_USD),
        "by_model": spent_today_by_model(),
    }


@router.get("/entities")
def entities_endpoint(user_id: str = Query(default=JARVIS_DEFAULT_USER)):
    """Lista de entidades conocidas (personas/organizaciones detectadas en capturas)."""
    return list_entities(user_id=user_id)


@router.get("/entities/{name}")
def entity_entries_endpoint(name: str, user_id: str = Query(default=JARVIS_DEFAULT_USER)):
    """Entradas vinculadas a una entidad, buscada por nombre o alias."""
    entries = get_entries_for_entity(name, user_id=user_id)
    if not entries:
        raise HTTPException(status_code=404, detail=f"No se encontró la entidad '{name}'.")
    return entries


@router.get("/proposals")
def list_proposals_endpoint(user_id: str = Query(default=JARVIS_DEFAULT_USER)):
    """Propuestas de captura pasiva pendientes (pieza C) -- polling desde el frontend."""
    return list_pending_proposals(user_id=user_id, channel="desktop")


@router.post("/proposals/{proposal_id}/accept")
def accept_proposal_endpoint(proposal_id: str, req: AcceptProposalRequest):
    entry_id = accept_proposal(proposal_id, extra_text=req.clarification)
    if not entry_id:
        raise HTTPException(status_code=404, detail=f"No hay propuesta pendiente '{proposal_id}'.")
    return {"entry_id": entry_id}


@router.post("/proposals/{proposal_id}/reject")
def reject_proposal_endpoint(proposal_id: str):
    ok = reject_proposal(proposal_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"No hay propuesta pendiente '{proposal_id}'.")
    return {"rejected": True}


@router.get("/audit-proposals")
def list_audit_proposals_endpoint(
    user_id: str = Query(default=JARVIS_DEFAULT_USER),
    status: Optional[str] = Query(default=None),
):
    """Propuestas de auditoría (jarvis.audit.service, ver Cerebro/decisiones-
    implementacion.md 2026-08-31). Sin `status`: solo PENDING (banner de
    JarvisProposalBanner.jsx, mismo patrón que /proposals). `status=all`:
    historial completo para Explorar; cualquier otro valor filtra por ese
    status puntual (ACCEPTED/REJECTED/EXPIRED)."""
    if status is None:
        return list_pending_audit_proposals(user_id=user_id, channel="desktop")
    if status == "all":
        return list_audit_proposals(user_id=user_id)
    return list_audit_proposals(user_id=user_id, status=status)


@router.get("/audit-proposals/isolated")
def list_isolated_entries_endpoint(user_id: str = Query(default=JARVIS_DEFAULT_USER)):
    """Hueco tipo B (entrada aislada, sin entidad ni proyecto) -- SQL puro,
    sin acción asociada, para el filtro de Explorar (nunca pasa por
    jarvis_audit_proposals, ver jarvis/audit/service.py)."""
    return list_isolated_entries(user_id=user_id)


@router.post("/audit-proposals/{proposal_id}/accept")
def accept_audit_proposal_endpoint(proposal_id: str, req: AcceptAuditProposalRequest):
    result = accept_audit_proposal(proposal_id, reply_text=req.reply)
    if result is None:
        raise HTTPException(status_code=404, detail=f"No hay propuesta de auditoría pendiente '{proposal_id}'.")
    return result


@router.post("/audit-proposals/{proposal_id}/reject")
def reject_audit_proposal_endpoint(proposal_id: str):
    ok = reject_audit_proposal(proposal_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"No hay propuesta de auditoría pendiente '{proposal_id}'.")
    return {"rejected": True}


@router.get("/browse")
def browse_endpoint(
    user_id: str = Query(default=JARVIS_DEFAULT_USER),
    type: Optional[str] = Query(default=None),
    tag: Optional[str] = Query(default=None),
    project_id: Optional[str] = Query(default=None),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    """Navegar/filtrar toda la memoria sin pasar por el chat (pieza F)."""
    return browse_entries(
        user_id=user_id, type=type, tag=tag, project_id=project_id,
        date_from=date_from, date_to=date_to, q=q, limit=limit, offset=offset,
    )


@router.get("/tags")
def tags_endpoint(user_id: str = Query(default=JARVIS_DEFAULT_USER)):
    """Catálogo de tags con conteo de entradas vigentes (pieza A)."""
    return list_tags_with_counts(user_id=user_id)


@router.get("/tags/{name}")
def tag_entries_endpoint(name: str, user_id: str = Query(default=JARVIS_DEFAULT_USER)):
    """Entradas vinculadas a un tag, por nombre exacto (case-insensitive)."""
    entries = get_entries_for_tag(name, user_id=user_id)
    if not entries:
        raise HTTPException(status_code=404, detail=f"No se encontró el tag '{name}'.")
    return entries


@router.get("/stats/types")
def stats_types_endpoint(user_id: str = Query(default=JARVIS_DEFAULT_USER)):
    """Conteos por tipo de memoria vigente — panel izquierdo (Fase B1)."""
    return count_entries_by_type(user_id=user_id)


@router.get("/projects")
def projects_endpoint(user_id: str = Query(default=JARVIS_DEFAULT_USER)):
    """Proyectos con memory_count/last_activity crudos (Fase B2, panel izquierdo)."""
    return list_projects_with_activity(user_id=user_id)


@router.get("/events")
def events_endpoint(limit: int = Query(default=20, ge=1, le=200)):
    """Últimos eventos del worker — log real del tab Debug (Fase B5)."""
    return list_recent_events(limit=limit)


@router.get("/health")
def health_endpoint():
    """Señal real de que el worker sigue corriendo, vía heartbeat (Fase B6)."""
    return {"worker_alive": get_worker_alive()}


@router.get("/entries/{entry_id}")
def entry_endpoint(entry_id: str):
    """Detalle completo de una entrada de memoria -- usado por el frontend
    para hacer clickeables las fuentes citadas en el chat (Mejoras_Jarvis.md
    punto 2)."""
    entry = get_entry(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"No se encontró la entrada '{entry_id}'.")
    return entry


@router.patch("/entries/{entry_id}")
def edit_entry_endpoint(entry_id: str, req: EditEntryRequest):
    """Corrige una entrada mal guardada (contenido/tipo/tags) -- pieza B."""
    if req.content is not None and not req.content.strip():
        raise HTTPException(status_code=400, detail="El contenido no puede quedar vacío.")
    updated = edit_entry(entry_id, content=req.content, type=req.type, tags=req.tags)
    if not updated:
        existing = get_entry(entry_id)
        if not existing:
            raise HTTPException(status_code=404, detail=f"No se encontró la entrada '{entry_id}'.")
        raise HTTPException(status_code=400, detail=f"Tipo inválido: '{req.type}'.")
    return updated


@router.delete("/entries/{entry_id}")
def forget_entry_endpoint(entry_id: str):
    """"Olvidar" una entrada -- soft-delete vía valid_to (ver jarvis/memory/service.py::forget_entry)."""
    ok = forget_entry(entry_id)
    if not ok:
        existing = get_entry(entry_id)
        if not existing:
            raise HTTPException(status_code=404, detail=f"No se encontró la entrada '{entry_id}'.")
        raise HTTPException(status_code=409, detail="La entrada ya estaba olvidada o superseded.")
    return {"forgotten": True}


# ── Chats (multi-chat web, Mejoras_Jarvis.md punto 3) ───────────────────────

@router.get("/chats")
def list_chats_endpoint(user_id: str = Query(default=JARVIS_DEFAULT_USER)):
    return list_chats(user_id=user_id)


@router.post("/chats")
def create_chat_endpoint(req: CreateChatRequest):
    return create_chat(title=req.title, user_id=req.user_id)


@router.patch("/chats/{chat_id}")
def rename_chat_endpoint(chat_id: str, req: RenameChatRequest):
    ok = rename_chat(chat_id, req.title, user_id=req.user_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"No se encontró el chat '{chat_id}'.")
    return {"id": chat_id, "title": req.title}


@router.delete("/chats/{chat_id}")
def delete_chat_endpoint(chat_id: str, user_id: str = Query(default=JARVIS_DEFAULT_USER)):
    ok = delete_chat(chat_id, user_id=user_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"No se encontró el chat '{chat_id}'.")
    return {"deleted": True}


@router.get("/chats/{chat_id}/messages")
def chat_messages_endpoint(chat_id: str, user_id: str = Query(default=JARVIS_DEFAULT_USER)):
    messages = get_messages(chat_id, user_id=user_id)
    if messages is None:
        raise HTTPException(status_code=404, detail=f"No se encontró el chat '{chat_id}'.")
    return messages
