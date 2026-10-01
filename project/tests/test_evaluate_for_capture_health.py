"""
Regresión — evaluate_for_capture() distingue entre veredicto negativo legítimo
y falla del modelo (Ollama caído / JSON inválido), y expone el estado vía
get_eval_health() persistido en DB (no solo en memoria del proceso).

Causa raíz original: ambos casos devolvían None sin ninguna señal visible;
fallas repetidas del modelo quedaban silenciosas.

Bug adicional (2026-09-30): get_eval_health() leía variables en memoria del
proceso, pero el endpoint /jarvis/health lo sirve el backend (proceso
separado del worker) — siempre reportaba 0 fallas. Fix: persistir en
jarvis_policies y leer de ahí.
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

    def test_veredicto_negativo_no_incrementa_fallas(self, tmp_jarvis_db):
        """worth_capturing=false → None, pero consecutive_failures queda en 0."""
        mock_response = '{"worth_capturing": false, "content": null, "question": null}'
        with patch("jarvis.llm.client.call_llm", return_value=mock_response):
            result = passive.evaluate_for_capture("hoy estuvo lindo el día")
        assert result is None
        health = passive.get_eval_health()
        assert health["consecutive_failures"] == 0
        assert health["last_error"] is None

    def test_excepcion_del_modelo_incrementa_fallas(self, tmp_jarvis_db):
        """Ollama caído → None + consecutive_failures incrementa y se persiste."""
        with patch("jarvis.llm.client.call_llm", side_effect=ConnectionError("Connection refused")):
            result = passive.evaluate_for_capture("decidimos pagar anual")
        assert result is None
        health = passive.get_eval_health()
        assert health["consecutive_failures"] == 1
        assert "Connection refused" in health["last_error"]

    def test_json_invalido_incrementa_fallas(self, tmp_jarvis_db):
        """Modelo devuelve basura sin JSON → consecutive_failures incrementa."""
        with patch("jarvis.llm.client.call_llm", return_value="esto no es json en absoluto"):
            result = passive.evaluate_for_capture("decidimos pagar anual")
        assert result is None
        health = passive.get_eval_health()
        assert health["consecutive_failures"] == 1
        assert "JSON no encontrado" in health["last_error"]

    def test_fallas_consecutivas_se_acumulan(self, tmp_jarvis_db):
        """Múltiples fallas seguidas → contador crece."""
        with patch("jarvis.llm.client.call_llm", side_effect=ConnectionError("refused")):
            passive.evaluate_for_capture("texto 1")
            passive.evaluate_for_capture("texto 2")
            passive.evaluate_for_capture("texto 3")
        health = passive.get_eval_health()
        assert health["consecutive_failures"] == 3

    def test_exito_resetea_contador(self, tmp_jarvis_db):
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

    def test_modelo_devuelve_json_multiple_toma_primero(self, tmp_jarvis_db):
        """Modelo devuelve dos JSON pegados (un veredicto por mensaje del
        usuario) → raw_decode parsea el primero sin fallar."""
        multi_json = (
            '{"worth_capturing": true, "content": "Leer 3 libros por año.", '
            '"question": "¿Guardo esto en tu memoria?"}'
            '{"worth_capturing": true, "content": "Pagar hosting anual.", '
            '"question": "¿Guardo esto en tu memoria?"}'
        )
        with patch("jarvis.llm.client.call_llm", return_value=multi_json):
            result = passive.evaluate_for_capture("leer 3 libros; pagar hosting anual")
        assert result is not None
        assert "libros" in result["content"].lower() or "leer" in result["content"].lower()
        health = passive.get_eval_health()
        assert health["consecutive_failures"] == 0

    def test_health_lee_de_db_no_de_memoria(self, tmp_jarvis_db):
        """get_eval_health() lee de DB: si otro proceso escribió ahí, lo ve.
        Regresión del bug donde el backend (proceso separado del worker)
        siempre reportaba 0 fallas."""
        import json
        import uuid
        from jarvis.db.database import get_connection

        conn = get_connection()
        try:
            with conn:
                conn.execute(
                    "INSERT INTO jarvis_policies (id, policy_type, value, created_at) VALUES (?, ?, ?, ?)",
                    (uuid.uuid4().hex, "passive_eval_health",
                     json.dumps({"consecutive_failures": 7, "last_error": "modelo inalcanzable"}),
                     "2026-09-30T20:00:00+00:00"),
                )
        finally:
            conn.close()

        assert passive._eval_consecutive_failures == 0
        health = passive.get_eval_health()
        assert health["consecutive_failures"] == 7
        assert health["last_error"] == "modelo inalcanzable"
