"""Regresiones de los hallazgos de auditoría de Jarvis."""
import asyncio
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from jarvis.audit import service as audit
from jarvis.db.database import get_connection
from jarvis.entities.service import list_entities
from jarvis.ingestion import agenda
from jarvis.memory.service import capture_raw, edit_entry, forget_entry, get_entry
from jarvis.retriever.retriever import _merge_entity_first
from jarvis.vault import writer
from jarvis.worker import processor


def _capture(content, **kwargs):
    return capture_raw(content, "desktop", None, f"test:{content}", **kwargs)


def test_recapture_tightens_privacy_without_clearing_existing_flags(tmp_jarvis_db):
    entry_id = _capture("texto repetido", confidential=True)
    assert _capture("texto repetido", local_only=True) == entry_id
    entry = get_entry(entry_id)
    assert entry["local_only"] == 1
    assert entry["confidential"] == 1


def test_recapture_after_forget_creates_active_entry(tmp_jarvis_db):
    old_id = _capture("texto olvidado")
    assert forget_entry(old_id)
    new_id = _capture("texto olvidado")
    assert new_id != old_id
    assert get_entry(old_id)["valid_to"] is not None
    assert get_entry(new_id)["valid_to"] is None


def test_forget_cancels_pending_work_and_prevents_vault_write(tmp_jarvis_db, monkeypatch):
    entry_id = _capture("pendiente")
    assert forget_entry(entry_id)
    conn = get_connection()
    try:
        assert conn.execute("SELECT 1 FROM inbox_queue WHERE entry_id = ?", (entry_id,)).fetchone() is None
    finally:
        conn.close()
    write = Mock()
    monkeypatch.setattr(processor, "write_entry", write)
    assert processor._write_if_active(get_entry(entry_id), "título") is None
    write.assert_not_called()


def test_retry_keeps_existing_vault_path_even_with_new_title(tmp_jarvis_db, tmp_vault, monkeypatch):
    monkeypatch.setattr(writer, "JARVIS_BOVEDA_PATH", tmp_vault)
    entry = {
        "id": "abcdef12-0000-0000-0000-000000000000",
        "source": "desktop", "content_raw": "Nota original",
        "recorded_at": "2020-01-01T00:00:00",
    }
    path = writer.write_entry(entry, title="Primer título")
    entry["vault_path"] = path
    assert writer.write_entry(entry, title="Otro título") == path
    assert len(list(tmp_vault.rglob("*.md"))) == 1
    text = (tmp_vault / path).read_text(encoding="utf-8")
    assert "actualizado_en: 2020-01-01T00:00:00" not in text


def test_edit_rolls_back_sqlite_when_vault_write_fails(tmp_jarvis_db, monkeypatch):
    entry_id = _capture("original")
    monkeypatch.setattr(writer, "write_entry", Mock(side_effect=OSError("vault sin acceso")))
    with pytest.raises(OSError, match="vault sin acceso"):
        edit_entry(entry_id, content="corregido")
    assert get_entry(entry_id)["content_processed"] is None


def test_entity_count_excludes_forgotten_entries(tmp_jarvis_db):
    active_id = _capture("memoria vigente")
    forgotten_id = _capture("memoria olvidada")
    assert forget_entry(forgotten_id)
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                """INSERT INTO memory_entities
                   (entity_id, name, entity_type, first_seen, last_seen)
                   VALUES ('entity-1', 'Alguien', 'person', '2020-01-01', '2020-01-01')"""
            )
            conn.executemany(
                "INSERT INTO memory_entry_entities (entry_id, entity_id) VALUES (?, 'entity-1')",
                [(active_id,), (forgotten_id,)],
            )
    finally:
        conn.close()
    assert list_entities()[0]["memory_count"] == 1


def test_entity_boost_obeys_result_limit():
    entities = [{"id": str(i), "recorded_at": str(i)} for i in range(12)]
    assert len(_merge_entity_first(entities, [], 8)) == 8


def test_open_question_requires_an_answer(monkeypatch):
    monkeypatch.setattr(audit, "get_proposal", lambda _: {"status": "PENDING", "action_type": "open_question"})
    resolve = Mock()
    monkeypatch.setattr(audit, "_resolve_proposal", resolve)
    assert audit.accept_proposal("proposal", reply_text="  ") is None
    resolve.assert_not_called()


def test_agenda_keeps_failed_window_until_success(tmp_jarvis_db):
    first = datetime(2026, 9, 1, 12, 0)
    start = agenda._window_start(first)
    assert start == first - timedelta(days=agenda.JARVIS_AGENDA_INGESTION_WINDOW_DAYS)
    assert agenda._window_start(first + timedelta(days=14)) == start
    agenda._save_checkpoint(first + timedelta(days=14))
    assert agenda._window_start(first + timedelta(days=21)) == first + timedelta(days=14)


def test_inbox_stats_count_rows_beyond_recent_page(tmp_jarvis_db):
    from jarvis.api.router import inbox_stats_endpoint

    for i in range(18):
        _capture(f"entrada {i}")
    stats = inbox_stats_endpoint()
    assert stats["pending"] == 18
    assert stats["errors"] == 0


def test_telegram_capture_without_job_queue_saves_immediately(monkeypatch):
    from mybot import jarvis_handlers

    capture = Mock(return_value="12345678-0000")
    monkeypatch.setattr(jarvis_handlers, "capture_raw", capture)
    msg = SimpleNamespace(chat=SimpleNamespace(id=123), message_id=4, reply_text=AsyncMock())
    context = SimpleNamespace(job_queue=None, user_data={})

    asyncio.run(jarvis_handlers._start_clarification(
        SimpleNamespace(message=msg), context, "nota", "telegram:123:4", "¿Por qué?"
    ))
    capture.assert_called_once()
    assert "jarvis_clarification" not in context.user_data
    msg.reply_text.assert_awaited_once()


def test_disabling_passive_capture_keeps_proposal_sweeps(monkeypatch):
    from jarvis.worker import main as worker
    from jarvis.debug import service as debug

    class ImmediateThread:
        def __init__(self, target, **kwargs):
            self.target = target

        def is_alive(self):
            return False

        def start(self):
            self.target()

    monkeypatch.setattr(worker, "_passive_thread", None)
    monkeypatch.setattr(worker, "JARVIS_PASSIVE_CAPTURE_ENABLED", False)
    monkeypatch.setattr(worker.threading, "Thread", ImmediateThread)
    scan = Mock()
    expire_capture = Mock(return_value=0)
    expire_audit = Mock(return_value=0)
    monkeypatch.setattr(worker, "scan_and_propose", scan)
    monkeypatch.setattr(worker, "expire_stale_proposals", expire_capture)
    monkeypatch.setattr(worker, "expire_stale_audit_proposals", expire_audit)
    monkeypatch.setattr(debug, "get_debug_chat_id", lambda: None)

    worker._maybe_run_passive_capture()
    scan.assert_not_called()
    expire_capture.assert_called_once()
    expire_audit.assert_called_once()


def test_backend_startup_fails_if_jarvis_schema_does_not_initialize(monkeypatch):
    from app import main as app_main

    monkeypatch.setattr(app_main, "ensure_vault_mounted", Mock())
    monkeypatch.setattr(app_main, "init_db", Mock())
    monkeypatch.setattr(app_main, "obtener_hojas", Mock(return_value=[]))
    monkeypatch.setattr(app_main.semantic, "backfill_missing", Mock(return_value=0))
    monkeypatch.setattr(app_main, "_JARVIS_AVAILABLE", True)
    monkeypatch.setattr(app_main, "_jarvis_init_db", Mock(side_effect=OSError("schema rota")))

    async def start():
        async with app_main.lifespan(app_main.app):
            pass

    with pytest.raises(OSError, match="schema rota"):
        asyncio.run(start())


def test_repeated_question_remains_in_rag_history(monkeypatch):
    from jarvis.query import service as query_service

    monkeypatch.setattr(query_service, "ensure_conversation", Mock())
    monkeypatch.setattr(query_service, "add_message", Mock())
    monkeypatch.setattr(query_service, "autoname_if_untitled", Mock())
    monkeypatch.setattr(query_service, "retrieve", Mock(return_value=[]))
    monkeypatch.setattr(query_service, "get_recent_messages", Mock(return_value=[
        {"role": "user", "content": "misma pregunta"},
        {"role": "assistant", "content": "respuesta anterior"},
        {"role": "user", "content": "misma pregunta"},
    ]))
    monkeypatch.setattr(query_service, "_build_entity_sections", Mock(return_value=[]))
    build = Mock(return_value=[])
    monkeypatch.setattr(query_service, "_build_messages", build)
    monkeypatch.setattr(query_service, "call_reason", Mock(return_value="respuesta nueva"))

    query_service.query("misma pregunta", conversation_id="chat")
    assert build.call_args.args[2] == [
        {"role": "user", "content": "misma pregunta"},
        {"role": "assistant", "content": "respuesta anterior"},
    ]
