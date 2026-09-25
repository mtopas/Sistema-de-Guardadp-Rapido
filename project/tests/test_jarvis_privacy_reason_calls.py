"""Privacy Gateway antes de las cuatro llamadas de razonamiento sobre memoria."""
from unittest.mock import Mock

import pytest

from jarvis.audit import service as audit
from jarvis.ingestion import inbox_triage
from jarvis.llm import client as llm_client
from jarvis.worker import consolidation


@pytest.fixture
def external_reason_model(monkeypatch):
    monkeypatch.setattr(llm_client, "JARVIS_REASON_MODEL", "openai/gpt-4o-mini")


@pytest.fixture(params=[
    {"local_only": 1, "content_processed": "LOCAL_ONLY_SENTINEL"},
    {"confidential": 1, "content_processed": "CONFIDENTIAL_SENTINEL"},
    {"content_processed": "password: secret-sentinel"},
    {"content_processed": "DNI: 12.345.678"},
])
def blocked_entry(request):
    return {"id": "blocked", "content_raw": "", **request.param}


def test_audit_block_never_sends_blocked_entry(
    tmp_jarvis_db, external_reason_model, blocked_entry, monkeypatch
):
    reason = Mock(return_value="[]")
    monkeypatch.setattr(audit, "call_reason", reason)

    assert audit._review_block([blocked_entry]) == []
    reason.assert_not_called()


def test_audit_block_sends_only_allowed_entries(
    tmp_jarvis_db, external_reason_model, blocked_entry, monkeypatch
):
    reason = Mock(return_value="[]")
    monkeypatch.setattr(audit, "call_reason", reason)
    monkeypatch.setattr(audit, "_current_tag_names", lambda entry_id: [])
    monkeypatch.setattr(audit, "_entry_entities_context", lambda entry_id: "(ninguna)")
    safe_entry = {"id": "safe", "content_processed": "PUBLIC_SENTINEL"}

    assert audit._review_block([safe_entry, blocked_entry]) == []
    prompt = reason.call_args.kwargs["messages"][1]["content"]
    assert "PUBLIC_SENTINEL" in prompt
    assert blocked_entry["content_processed"] not in prompt


def test_entity_summary_never_sends_blocked_entry(
    tmp_jarvis_db, external_reason_model, blocked_entry, monkeypatch
):
    reason = Mock(return_value="Resumen")
    monkeypatch.setattr(audit, "call_reason", reason)

    assert audit._synthesize_entity_summary("Entidad", [blocked_entry]) is None
    reason.assert_not_called()


def test_entity_summary_sends_only_allowed_entries(
    tmp_jarvis_db, external_reason_model, blocked_entry, monkeypatch
):
    reason = Mock(return_value="Resumen")
    monkeypatch.setattr(audit, "call_reason", reason)
    safe_entry = {"id": "safe", "content_processed": "PUBLIC_SENTINEL"}

    assert audit._synthesize_entity_summary("Entidad", [safe_entry, blocked_entry]) == "Resumen"
    prompt = reason.call_args.kwargs["messages"][1]["content"]
    assert "PUBLIC_SENTINEL" in prompt
    assert blocked_entry["content_processed"] not in prompt


def test_consolidation_pair_never_sends_blocked_entry(
    tmp_jarvis_db, external_reason_model, blocked_entry, monkeypatch
):
    reason = Mock(return_value='{"relation":"different"}')
    monkeypatch.setattr(consolidation, "call_reason", reason)
    safe_entry = {"id": "safe", "content_raw": "Texto público"}

    consolidation._resolve_pair(blocked_entry, safe_entry, 0.95, {})
    reason.assert_not_called()


def test_inbox_triage_never_sends_blocked_entry(
    tmp_jarvis_db, external_reason_model, blocked_entry, monkeypatch
):
    reason = Mock(return_value=inbox_triage._DEST_OPTIONS[0])
    monkeypatch.setattr(llm_client, "call_reason", reason)

    assert inbox_triage._classify_destination(blocked_entry) is None
    reason.assert_not_called()


def test_consolidation_fetches_privacy_flags(tmp_jarvis_db):
    from jarvis.db.database import get_connection

    conn = get_connection()
    try:
        with conn:
            conn.execute(
                """INSERT INTO memory_entries
                   (id, type, content_raw, source, source_id, local_only, confidential)
                   VALUES (?, 'RAW', 'Texto privado', 'desktop', ?, 1, 1)""",
                ("private-pair", "private-pair"),
            )
    finally:
        conn.close()

    entries = consolidation._fetch_active_entries()
    assert len(entries) == 1
    assert entries[0]["local_only"] == 1
    assert entries[0]["confidential"] == 1
