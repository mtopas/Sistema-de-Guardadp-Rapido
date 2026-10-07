"""Regresiones de la revisión semanal de calidad de Jarvis."""
from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from jarvis.db.database import get_connection
from jarvis.quality import service as quality
from jarvis.query import service as query_service


def _fixed_now():
    return datetime(2026, 10, 7, 15, 0, tzinfo=timezone.utc)


def _insert_conversation(conn, conv_id, channel):
    conn.execute(
        """INSERT INTO conversations (id, channel, channel_id, started_at)
           VALUES (?, ?, ?, ?)""",
        (conv_id, channel, f"test:{conv_id}", "2026-09-28T00:00:00+00:00"),
    )


def test_snapshot_agrega_mensajes_por_dia_canal_y_consulta_sin_contenido(tmp_jarvis_db):
    conn = get_connection()
    try:
        _insert_conversation(conn, "conv-tg", "telegram")
        _insert_conversation(conn, "conv-web", "desktop")
        conn.executemany(
            """INSERT INTO conversation_messages
               (id, conversation_id, role, content, created_at)
               VALUES (?, ?, ?, ?, ?)""",
            [
                ("m-before-midnight", "conv-tg", "user", "PREGUNTA SECRETA", "2026-09-29T02:30:00+00:00"),
                ("m-after-midnight", "conv-web", "assistant", "RESPUESTA SECRETA", "2026-09-29T03:30:00+00:00"),
            ],
        )
        conn.execute(
            """INSERT INTO jarvis_query_telemetry
               (id, occurred_at, channel, conversation_id, route, result,
                duration_ms, context_retrieved, context_sent, tool_name, tool_ok, error_code)
               VALUES ('q1', '2026-09-29T03:00:00+00:00', 'telegram', 'conv-tg',
                       'rag', 'success', 10.0, 2, 1, NULL, NULL, NULL)"""
        )
        conn.execute(
            """INSERT INTO jarvis_query_telemetry
               (id, occurred_at, channel, conversation_id, route, result,
                duration_ms, context_retrieved, context_sent, tool_name, tool_ok, error_code)
               VALUES ('q2', '2026-09-29T03:30:00+00:00', 'telegram', 'conv-tg',
                       'agenda_live', 'tool_error', 20.0, 0, 0, 'agenda.list_events', 0,
                       'agenda_tool_error')"""
        )
        conn.commit()
    finally:
        conn.close()

    snapshot = quality.create_weekly_snapshot("2026-09-28", now=_fixed_now())
    summary = snapshot["summary"]
    assert summary["messages"]["by_day"]["2026-09-28"]["telegram"]["user"] == 1
    assert summary["messages"]["by_day"]["2026-09-29"]["desktop"]["assistant"] == 1
    assert summary["queries"]["by_route"] == {"agenda_live": 1, "rag": 1}
    assert summary["queries"]["by_result"] == {"success": 1, "tool_error": 1}
    assert summary["queries"]["duration_ms"] == {"average": 15.0, "maximum": 20.0}
    assert summary["tools"]["by_name"]["agenda.list_events"]["failures"] == 1
    assert summary["errors"]["by_code"] == {"agenda_tool_error": 1}
    assert "PREGUNTA SECRETA" not in str(snapshot)
    assert "RESPUESTA SECRETA" not in str(snapshot)


def test_los_limites_semanales_respetan_art_y_rechazan_semana_abierta(tmp_jarvis_db):
    conn = get_connection()
    try:
        _insert_conversation(conn, "conv-art", "telegram")
        conn.execute(
            """INSERT INTO conversation_messages
               (id, conversation_id, role, content, created_at)
               VALUES ('m-art', 'conv-art', 'user', 'sin exponer', '2026-09-29T02:30:00+00:00')"""
        )
        conn.commit()
    finally:
        conn.close()

    summary = quality.create_weekly_snapshot("2026-09-28", now=_fixed_now())["summary"]
    assert summary["messages"]["by_day"]["2026-09-28"]["telegram"]["user"] == 1
    with pytest.raises(quality.WeekNotClosedError):
        quality.create_weekly_snapshot("2026-10-05", now=_fixed_now())


def test_snapshot_es_write_once_y_devuelve_el_existente(tmp_jarvis_db):
    first = quality.create_weekly_snapshot("2026-09-28", now=_fixed_now())
    conn = get_connection()
    try:
        conn.execute(
            """INSERT INTO jarvis_query_telemetry
               (id, occurred_at, channel, route, result, duration_ms,
                context_retrieved, context_sent)
               VALUES ('late', '2026-09-29T03:00:00+00:00', 'desktop',
                       'rag', 'success', 999, 9, 9)"""
        )
        conn.commit()
    finally:
        conn.close()

    second = quality.create_weekly_snapshot("2026-09-28", now=_fixed_now())
    assert second == first
    assert second["summary"]["queries"]["total"] == 0


def _mock_query_dependencies(monkeypatch):
    monkeypatch.setattr(query_service, "ensure_conversation", Mock())
    monkeypatch.setattr(query_service, "add_message", Mock())
    monkeypatch.setattr(query_service, "autoname_if_untitled", Mock())
    monkeypatch.setattr(query_service, "get_recent_messages", Mock(return_value=[]))
    monkeypatch.setattr(query_service, "retrieve", Mock(return_value=[]))
    monkeypatch.setattr(query_service, "_build_entity_sections", Mock(return_value=""))
    monkeypatch.setattr(query_service, "call_reason", Mock(return_value="respuesta"))


def test_consulta_exitosa_registra_metadata_permitida_y_ruta_agenda(monkeypatch):
    _mock_query_dependencies(monkeypatch)
    record = Mock()
    monkeypatch.setattr(quality, "record_query_telemetry", record)
    executor = Mock()
    executor.execute.return_value = SimpleNamespace(ok=True, data={"eventos": []}, error=None)
    monkeypatch.setattr(query_service, "DEFAULT_EXECUTOR", executor)

    result = query_service.query(
        "¿Qué tengo hoy en la agenda?",
        conversation_id="chat",
        channel="telegram",
    )

    assert result["answer"] == "respuesta"
    kwargs = record.call_args.kwargs
    assert kwargs["channel"] == "telegram"
    assert kwargs["conversation_id"] == "chat"
    assert kwargs["route"] == "agenda_live"
    assert kwargs["result"] == "success"
    assert kwargs["tool_name"] == "agenda.list_events"
    assert kwargs["tool_ok"] is True
    assert "question" not in kwargs
    assert "answer" not in kwargs


def test_fallo_de_persistencia_de_telemetria_no_altera_respuesta(monkeypatch):
    _mock_query_dependencies(monkeypatch)
    monkeypatch.setattr(
        quality,
        "record_query_telemetry",
        Mock(side_effect=RuntimeError("telemetría rota")),
    )

    result = query_service.query("pregunta", conversation_id="chat")

    assert result["answer"] == "respuesta"
    assert result["context_count"] == 0


def test_error_de_consulta_registra_solo_codigo_categorizado(monkeypatch):
    _mock_query_dependencies(monkeypatch)
    record = Mock()
    monkeypatch.setattr(quality, "record_query_telemetry", record)
    monkeypatch.setattr(query_service, "call_reason", Mock(side_effect=RuntimeError("error crudo")))

    with pytest.raises(RuntimeError, match="error crudo"):
        query_service.query("pregunta", conversation_id="chat")

    kwargs = record.call_args.kwargs
    assert kwargs["result"] == "query_error"
    assert kwargs["error_code"] == "llm_error"
    assert "error crudo" not in str(kwargs)
