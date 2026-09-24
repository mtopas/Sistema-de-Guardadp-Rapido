"""Tests para jarvis/tools/ -- ToolSpec v1 + Tool Registry + Tool Executor.

Cubre el contrato completo (registro/duplicados/schema inválido/argumentos inválidos/timeout/
error de ejecución/trace_id/bloqueo de no-registrada/bloqueo de no-read-only), ver
Cerebro/decisiones-implementacion.md (2026-09-22) para la propuesta aprobada. Las llamadas HTTP
reales (requests.get dentro de jarvis/tools/builtin.py) se mockean -- estos tests no dependen de
que el backend de SGR esté corriendo.
"""
from unittest.mock import MagicMock, patch

import pytest
import requests

from jarvis.tools.builtin import (
    AGENDA_LIST_EVENTS,
    BOVEDA_LIST_RECENT_NOTES,
    HABITOS_LIST_PENDING_TODAY,
    register_builtin_tools,
)
from jarvis.tools.executor import ToolExecutor
from jarvis.tools.registry import ToolRegistry
from jarvis.tools.schema import validate_args
from jarvis.tools.spec import RiskLevel, ToolSpec, validate_spec


def _make_spec(**overrides) -> ToolSpec:
    defaults = dict(
        name="test.echo",
        version="1.0.0",
        description="Tool de prueba.",
        parameters={
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "minimum": 1, "maximum": 100},
                "q": {"type": "string"},
            },
            "required": [],
            "additionalProperties": False,
        },
        read_only=True,
        risk=RiskLevel.LOW,
        idempotent=True,
        requires_confirmation=False,
        timeout_seconds=5.0,
        category="test",
    )
    defaults.update(overrides)
    return ToolSpec(**defaults)


# ── ToolSpec / validate_spec ─────────────────────────────────────────────────

class TestValidateSpec:
    def test_spec_valida_no_tiene_errores(self):
        assert validate_spec(_make_spec()) == []

    def test_nombre_vacio_es_error(self):
        errors = validate_spec(_make_spec(name=""))
        assert any("name" in e for e in errors)

    def test_timeout_no_positivo_es_error(self):
        errors = validate_spec(_make_spec(timeout_seconds=0))
        assert any("timeout_seconds" in e for e in errors)

    def test_risk_debe_ser_risklevel(self):
        errors = validate_spec(_make_spec(risk="low"))  # str, no RiskLevel
        assert any("risk" in e for e in errors)

    def test_parameters_type_debe_ser_object(self):
        bad_params = {"type": "array", "properties": {}, "required": []}
        errors = validate_spec(_make_spec(parameters=bad_params))
        assert any("parameters.type" in e for e in errors)

    def test_parameters_no_dict_es_error(self):
        errors = validate_spec(_make_spec(parameters="no-es-un-dict"))
        assert any("parameters debe ser un dict" in e for e in errors)

    def test_property_con_type_invalido_es_error(self):
        bad_params = {
            "type": "object",
            "properties": {"x": {"type": "array"}},  # tipo no soportado por schema.py
            "required": [],
        }
        errors = validate_spec(_make_spec(parameters=bad_params))
        assert any("parameters.properties.x.type" in e for e in errors)

    def test_required_con_propiedad_inexistente_es_error(self):
        bad_params = {
            "type": "object",
            "properties": {},
            "required": ["nope"],
        }
        errors = validate_spec(_make_spec(parameters=bad_params))
        assert any("required incluye" in e for e in errors)


# ── validate_args (schema.py) ────────────────────────────────────────────────

class TestValidateArgs:
    def _params(self):
        return _make_spec().parameters

    def test_argumentos_vacios_validos(self):
        assert validate_args(self._params(), {}) == []

    def test_argumentos_validos(self):
        assert validate_args(self._params(), {"limit": 10, "q": "hola"}) == []

    def test_tipo_incorrecto_es_error(self):
        errors = validate_args(self._params(), {"limit": "no-es-int"})
        assert any("limit" in e and "tipo" in e for e in errors)

    def test_fuera_de_rango_es_error(self):
        errors = validate_args(self._params(), {"limit": 0})
        assert any(">= 1" in e for e in errors)
        errors = validate_args(self._params(), {"limit": 101})
        assert any("<= 100" in e for e in errors)

    def test_argumento_no_reconocido_es_error(self):
        errors = validate_args(self._params(), {"secreto": "x"})
        assert any("no reconocido" in e for e in errors)

    def test_argumento_requerido_faltante_es_error(self):
        params = {
            "type": "object",
            "properties": {"q": {"type": "string"}},
            "required": ["q"],
            "additionalProperties": False,
        }
        errors = validate_args(params, {})
        assert any("q" in e and "requerido" in e for e in errors)


# ── ToolRegistry ─────────────────────────────────────────────────────────────

class TestToolRegistry:
    def test_registro_valido(self):
        registry = ToolRegistry()
        handler = lambda args, trace_id: {"ok": True}
        registry.register(_make_spec(), handler)
        found = registry.get("test.echo", "1.0.0")
        assert found is not None
        assert found.spec.name == "test.echo"
        assert found.handler is handler
        assert [s.name for s in registry.list_tools()] == ["test.echo"]

    def test_rechaza_duplicado(self):
        registry = ToolRegistry()
        handler = lambda args, trace_id: {}
        registry.register(_make_spec(), handler)
        with pytest.raises(ValueError, match="ya registrada"):
            registry.register(_make_spec(), handler)

    def test_rechaza_spec_mal_formada(self):
        registry = ToolRegistry()
        handler = lambda args, trace_id: {}
        bad_spec = _make_spec(parameters={"type": "array"})
        with pytest.raises(ValueError, match="inválida"):
            registry.register(bad_spec, handler)

    def test_get_de_tool_no_registrada_devuelve_none(self):
        registry = ToolRegistry()
        assert registry.get("no.existe", "1.0.0") is None

    def test_registrar_no_concede_permisos_por_si_solo(self):
        # Registrar una tool que NO es read_only debe funcionar (el Registry solo valida
        # forma) -- el bloqueo de ejecución es responsabilidad del Executor, ver más abajo.
        registry = ToolRegistry()
        handler = lambda args, trace_id: {}
        write_spec = _make_spec(name="test.write", read_only=False)
        registry.register(write_spec, handler)
        assert registry.get("test.write", "1.0.0") is not None


# ── ToolExecutor ──────────────────────────────────────────────────────────────

class TestToolExecutor:
    def test_bloquea_tool_no_registrada(self):
        executor = ToolExecutor(ToolRegistry())
        result = executor.execute("no.existe", "1.0.0", {})
        assert result.ok is False
        assert result.error["code"] == "not_found"
        assert result.trace_id  # se generó igual, aun en el camino de error

    def test_bloquea_tool_no_read_only(self):
        registry = ToolRegistry()
        handler = MagicMock(return_value={"escrito": True})
        registry.register(_make_spec(name="test.write", read_only=False), handler)
        executor = ToolExecutor(registry)

        result = executor.execute("test.write", "1.0.0", {})

        assert result.ok is False
        assert result.error["code"] == "not_read_only"
        handler.assert_not_called()

    def test_bloquea_argumentos_invalidos(self):
        registry = ToolRegistry()
        handler = MagicMock(return_value={})
        registry.register(_make_spec(), handler)
        executor = ToolExecutor(registry)

        result = executor.execute("test.echo", "1.0.0", {"limit": "no-es-int"})

        assert result.ok is False
        assert result.error["code"] == "invalid_arguments"
        handler.assert_not_called()

    def test_ejecucion_exitosa_devuelve_data(self):
        registry = ToolRegistry()
        handler = MagicMock(return_value={"eventos": []})
        registry.register(_make_spec(), handler)
        executor = ToolExecutor(registry)

        result = executor.execute("test.echo", "1.0.0", {"limit": 5})

        assert result.ok is True
        assert result.data == {"eventos": []}
        assert result.error is None

    def test_trace_id_se_propaga_de_punta_a_punta(self):
        registry = ToolRegistry()
        captured = {}

        def handler(arguments, trace_id):
            captured["trace_id"] = trace_id
            return {"trace_id_visto": trace_id}

        registry.register(_make_spec(), handler)
        executor = ToolExecutor(registry)

        result = executor.execute("test.echo", "1.0.0", {})

        assert result.ok is True
        assert result.trace_id == captured["trace_id"]
        assert result.data["trace_id_visto"] == result.trace_id

    def test_timeout_del_handler_se_captura_como_error_estructurado(self):
        registry = ToolRegistry()
        handler = MagicMock(side_effect=requests.exceptions.Timeout("se colgó"))
        registry.register(_make_spec(), handler)
        executor = ToolExecutor(registry)

        result = executor.execute("test.echo", "1.0.0", {})

        assert result.ok is False
        assert result.error["code"] == "timeout"
        assert result.trace_id

    def test_error_http_del_handler_se_captura_como_error_estructurado(self):
        registry = ToolRegistry()
        handler = MagicMock(side_effect=requests.exceptions.HTTPError("500"))
        registry.register(_make_spec(), handler)
        executor = ToolExecutor(registry)

        result = executor.execute("test.echo", "1.0.0", {})

        assert result.ok is False
        assert result.error["code"] == "http_error"

    def test_excepcion_inesperada_no_se_propaga_cruda(self):
        registry = ToolRegistry()
        handler = MagicMock(side_effect=RuntimeError("boom"))
        registry.register(_make_spec(), handler)
        executor = ToolExecutor(registry)

        result = executor.execute("test.echo", "1.0.0", {})

        assert result.ok is False
        assert result.error["code"] == "execution_error"
        assert "boom" in result.error["message"]


# ── Tools built-in (Agenda / Hábitos / Bóveda) ────────────────────────────────

class TestBuiltinTools:
    def test_register_builtin_tools_registra_las_3(self):
        registry = ToolRegistry()
        register_builtin_tools(registry)
        names = {s.name for s in registry.list_tools()}
        assert names == {
            "agenda.list_events",
            "habitos.list_pending_today",
            "boveda.list_recent_notes",
        }

    def test_las_3_son_read_only_bajo_riesgo_e_idempotentes(self):
        for spec in (AGENDA_LIST_EVENTS, HABITOS_LIST_PENDING_TODAY, BOVEDA_LIST_RECENT_NOTES):
            assert spec.read_only is True
            assert spec.risk == RiskLevel.LOW
            assert spec.idempotent is True
            assert spec.requires_confirmation is False

    @patch("jarvis.tools.builtin.requests.get")
    def test_agenda_list_events_llama_al_endpoint_correcto(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.json.return_value = [{"id": 1, "titulo": "Reunión"}]
        mock_get.return_value = mock_resp

        registry = ToolRegistry()
        register_builtin_tools(registry)
        executor = ToolExecutor(registry)

        result = executor.execute(
            "agenda.list_events", "1.0.0", {"desde": "2026-09-01", "hasta": "2026-09-30"}
        )

        assert result.ok is True
        assert result.data == {"eventos": [{"id": 1, "titulo": "Reunión"}]}
        called_url = mock_get.call_args.args[0]
        assert called_url.endswith("/agenda/eventos")
        assert mock_get.call_args.kwargs["params"] == {
            "desde": "2026-09-01", "hasta": "2026-09-30",
        }
        mock_resp.raise_for_status.assert_called_once()

    @patch("jarvis.tools.builtin.requests.get")
    def test_habitos_list_pending_today_llama_al_endpoint_correcto(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.json.return_value = [{"id": 1, "nombre": "Leer"}]
        mock_get.return_value = mock_resp

        registry = ToolRegistry()
        register_builtin_tools(registry)
        executor = ToolExecutor(registry)

        result = executor.execute("habitos.list_pending_today", "1.0.0", {})

        assert result.ok is True
        assert result.data == {"habitos": [{"id": 1, "nombre": "Leer"}]}
        called_url = mock_get.call_args.args[0]
        assert called_url.endswith("/habitos/pendientes-hoy")

    @patch("jarvis.tools.builtin.requests.get")
    def test_boveda_list_recent_notes_llama_al_endpoint_correcto(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.json.return_value = [{"id": 1, "titulo": "Nota"}]
        mock_get.return_value = mock_resp

        registry = ToolRegistry()
        register_builtin_tools(registry)
        executor = ToolExecutor(registry)

        result = executor.execute("boveda.list_recent_notes", "1.0.0", {"limit": 5})

        assert result.ok is True
        assert result.data == {"hojas": [{"id": 1, "titulo": "Nota"}]}
        called_url = mock_get.call_args.args[0]
        assert called_url.endswith("/hojas/recientes")
        assert mock_get.call_args.kwargs["params"] == {"limit": 5}

    @patch("jarvis.tools.builtin.requests.get")
    def test_boveda_rechaza_limit_fuera_de_rango_antes_de_pegarle_a_la_red(self, mock_get):
        registry = ToolRegistry()
        register_builtin_tools(registry)
        executor = ToolExecutor(registry)

        result = executor.execute("boveda.list_recent_notes", "1.0.0", {"limit": 999})

        assert result.ok is False
        assert result.error["code"] == "invalid_arguments"
        mock_get.assert_not_called()

    @patch("jarvis.tools.builtin.requests.get")
    def test_backend_devuelve_error_http_se_propaga_estructurado(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.raise_for_status.side_effect = requests.exceptions.HTTPError(
            "500 Server Error"
        )
        mock_get.return_value = mock_resp

        registry = ToolRegistry()
        register_builtin_tools(registry)
        executor = ToolExecutor(registry)

        result = executor.execute("agenda.list_events", "1.0.0", {})

        assert result.ok is False
        assert result.error["code"] == "http_error"

    @patch("jarvis.tools.builtin.requests.get")
    def test_timeout_de_red_se_propaga_estructurado(self, mock_get):
        mock_get.side_effect = requests.exceptions.Timeout("timed out")

        registry = ToolRegistry()
        register_builtin_tools(registry)
        executor = ToolExecutor(registry)

        result = executor.execute("habitos.list_pending_today", "1.0.0", {"fecha": "2026-09-23"})

        assert result.ok is False
        assert result.error["code"] == "timeout"
        assert result.trace_id
