"""
Regresión — evaluate_for_capture() distingue entre veredicto negativo legítimo
y falla del modelo (Ollama caído / JSON inválido), y expone el estado vía
get_eval_health().

Causa raíz: ambos casos devolvían None sin ninguna señal visible; fallas
repetidas del modelo quedaban silenciosas.
"""
from unittest.mock import patch

from jarvis.captures import passive


def _reset_eval_counters():
    passive._eval_consecutive_failures = 0
    passive._eval_last_error = None


class TestEvaluateForCaptureHealth:

    def setup_method(self):
        _reset_eval_counters()

    def teardown_method(self):
        _reset_eval_counters()

    def test_veredicto_negativo_no_incrementa_fallas(self):
        """worth_capturing=false → None, pero consecutive_failures queda en 0."""
        mock_response = '{"worth_capturing": false, "content": null, "question": null}'
        with patch("jarvis.llm.client.call_llm", return_value=mock_response):
            result = passive.evaluate_for_capture("hoy estuvo lindo el día")
        assert result is None
        health = passive.get_eval_health()
        assert health["consecutive_failures"] == 0
        assert health["last_error"] is None

    def test_excepcion_del_modelo_incrementa_fallas(self):
        """Ollama caído → None + consecutive_failures incrementa."""
        with patch("jarvis.llm.client.call_llm", side_effect=ConnectionError("Connection refused")):
            result = passive.evaluate_for_capture("decidimos pagar anual")
        assert result is None
        health = passive.get_eval_health()
        assert health["consecutive_failures"] == 1
        assert "Connection refused" in health["last_error"]

    def test_json_invalido_incrementa_fallas(self):
        """Modelo devuelve basura sin JSON → consecutive_failures incrementa."""
        with patch("jarvis.llm.client.call_llm", return_value="esto no es json en absoluto"):
            result = passive.evaluate_for_capture("decidimos pagar anual")
        assert result is None
        health = passive.get_eval_health()
        assert health["consecutive_failures"] == 1
        assert "JSON no encontrado" in health["last_error"]

    def test_fallas_consecutivas_se_acumulan(self):
        """Múltiples fallas seguidas → contador crece."""
        with patch("jarvis.llm.client.call_llm", side_effect=ConnectionError("refused")):
            passive.evaluate_for_capture("texto 1")
            passive.evaluate_for_capture("texto 2")
            passive.evaluate_for_capture("texto 3")
        health = passive.get_eval_health()
        assert health["consecutive_failures"] == 3

    def test_exito_resetea_contador(self):
        """Después de fallas, un veredicto exitoso resetea el contador."""
        with patch("jarvis.llm.client.call_llm", side_effect=ConnectionError("refused")):
            passive.evaluate_for_capture("texto 1")
            passive.evaluate_for_capture("texto 2")
        assert passive.get_eval_health()["consecutive_failures"] == 2

        mock_response = '{"worth_capturing": false, "content": null, "question": null}'
        with patch("jarvis.llm.client.call_llm", return_value=mock_response):
            passive.evaluate_for_capture("hoy hizo calor")
        health = passive.get_eval_health()
        assert health["consecutive_failures"] == 0
        assert health["last_error"] is None

    def test_texto_vacio_no_afecta_contador(self):
        """Texto vacío es un early return, no una falla del modelo."""
        passive._eval_consecutive_failures = 5
        passive._eval_last_error = "error previo"
        result = passive.evaluate_for_capture("   ")
        assert result is None
        assert passive._eval_consecutive_failures == 5
