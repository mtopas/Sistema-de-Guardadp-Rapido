from datetime import date
from types import SimpleNamespace
from unittest.mock import Mock

from jarvis.query import service


class FakeDate:
    @classmethod
    def today(cls):
        return date(2026, 10, 7)


def _run_query(monkeypatch, question, tool_result):
    executor = Mock()
    executor.execute.return_value = tool_result
    monkeypatch.setattr(service, "DEFAULT_EXECUTOR", executor)
    monkeypatch.setattr(service, "date", FakeDate)
    monkeypatch.setattr(service, "ensure_conversation", Mock())
    monkeypatch.setattr(service, "add_message", Mock())
    monkeypatch.setattr(service, "autoname_if_untitled", Mock())
    monkeypatch.setattr(service, "get_recent_messages", Mock(return_value=[]))
    monkeypatch.setattr(service, "retrieve", Mock(return_value=[]))
    monkeypatch.setattr(service, "call_reason", Mock(return_value="respuesta"))
    result = service.query(question, conversation_id="chat")
    return result, executor


def test_pregunta_agenda_ejecuta_tool_con_rango_y_pasa_eventos_al_prompt(monkeypatch):
    build = Mock(return_value=[])
    monkeypatch.setattr(service, "_build_messages", build)
    tool_result = SimpleNamespace(ok=True, data={"eventos": [{"titulo": "Reunión", "fecha": "2026-10-08"}]})

    _run_query(monkeypatch, "¿Qué tengo mañana en la agenda?", tool_result)

    executor = service.DEFAULT_EXECUTOR
    executor.execute.assert_called_once_with(
        "agenda.list_events", "1.0.0", {"desde": "2026-10-08", "hasta": "2026-10-08"}
    )
    assert build.call_args.kwargs["agenda_events"] == [{"titulo": "Reunión", "fecha": "2026-10-08"}]


def test_pregunta_no_agenda_no_ejecuta_tool(monkeypatch):
    result, executor = _run_query(
        monkeypatch,
        "¿Qué recordás sobre mi mudanza?",
        SimpleNamespace(ok=True, data={"eventos": []}),
    )

    executor.execute.assert_not_called()
    assert result["context_count"] == 0


def test_pregunta_generica_que_tengo_pendiente_no_ejecuta_tool(monkeypatch):
    _, executor = _run_query(
        monkeypatch,
        "¿Qué tengo pendiente de mi proyecto?",
        SimpleNamespace(ok=True, data={"eventos": []}),
    )

    executor.execute.assert_not_called()


def test_pregunta_temporal_que_tengo_hoy_sin_marcador_ejecuta_tool(monkeypatch):
    _, executor = _run_query(
        monkeypatch,
        "¿Qué tengo hoy?",
        SimpleNamespace(ok=True, data={"eventos": []}),
    )

    executor.execute.assert_called_once_with(
        "agenda.list_events", "1.0.0", {"desde": "2026-10-07", "hasta": "2026-10-07"}
    )


def test_agenda_vacia_pasa_contexto_explicito_sin_inventar(monkeypatch):
    build = Mock(return_value=[])
    monkeypatch.setattr(service, "_build_messages", build)

    _run_query(
        monkeypatch,
        "¿Qué eventos tengo hoy?",
        SimpleNamespace(ok=True, data={"eventos": []}),
    )

    assert build.call_args.kwargs["agenda_events"] == []
    assert build.call_args.kwargs["agenda_error"] is None


def test_error_de_agenda_pasa_error_explicito_y_no_usa_rag(monkeypatch):
    build = Mock(return_value=[])
    monkeypatch.setattr(service, "_build_messages", build)

    _run_query(
        monkeypatch,
        "Mostrame mi calendario de esta semana",
        SimpleNamespace(ok=False, data=None, error={"message": "API caída"}),
    )

    service.retrieve.assert_not_called()
    assert build.call_args.kwargs["agenda_error"] == "API caída"
    assert build.call_args.kwargs["agenda_events"] is None


def test_eventos_vivos_entran_en_el_prompt_y_error_pide_no_inventar():
    messages = service._build_messages(
        "¿Qué tengo mañana?",
        [],
        [],
        had_blocked=False,
        agenda_events=[{"titulo": "Reunión", "fecha": "2026-10-08"}],
    )
    prompt = "\n".join(message["content"] for message in messages)
    assert "Reunión" in prompt
    assert "eventos vivos" in prompt

    error_messages = service._build_messages(
        "¿Qué tengo mañana?",
        [],
        [],
        had_blocked=False,
        agenda_error="API caída",
    )
    error_prompt = "\n".join(message["content"] for message in error_messages)
    assert "API caída" in error_prompt
    assert "no inventes eventos" in error_prompt
