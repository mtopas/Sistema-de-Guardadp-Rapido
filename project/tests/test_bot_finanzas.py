"""
Tests para la capa clásica del bot de Telegram (`project/mybot/`) — Ollama local
(`llama3.2:3b`), NO Jarvis.

Cubre tres fixes de `Testeos-Ollama.md` (pruebas 2, 3, 7, 8):

  - `_fuzzy_match` (finanzas_handlers.py): match exacto, ambiguo, sin match, umbral mínimo
    de confianza (ya no devuelve "el primer item que comparte cualquier palabra suelta").
  - `_resolve_cuenta_fuzzy` (intent_router.py): aplica ese mismo fuzzy sobre `datos.cuenta`
    extraído por el LLM antes de mostrar la confirmación o ejecutar — antes llegaba crudo
    ("ula aya" en vez de "Uala").
  - `_gather_finanzas` (assistant.py): `objetivos_de_ahorro` solo viaja en el contexto si
    la pregunta los menciona, para que el LLM no sume meta + saldo como si la meta fuera
    plata disponible.

`mybot/` no está en el pythonpath de `project/pytest.ini` (solo `project/` vía
`pythonpath = .`), así que este archivo agrega `project/mybot` a `sys.path` explícitamente,
mismo patrón que usa `mybot/api_config.py` para resolver `project/`.

Todas las llamadas HTTP (`requests.get` dentro de `finanzas_handlers.py`/`assistant.py`) se
mockean — no dependen de que la API de SGR ni Ollama estén corriendo.
"""
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

_MYBOT_DIR = Path(__file__).resolve().parent.parent / "mybot"
if str(_MYBOT_DIR) not in sys.path:
    sys.path.insert(0, str(_MYBOT_DIR))

import assistant  # noqa: E402
import finanzas_handlers as fh  # noqa: E402
import intent_router as ir  # noqa: E402


def _resp(data):
    r = MagicMock()
    r.json.return_value = data
    r.raise_for_status.return_value = None
    return r


CUENTAS = [
    {"id": 1, "nombre": "Uala", "tipo": "wallet", "saldo_ars": 417237.59, "saldo_usd": 0.0},
    {"id": 2, "nombre": "Banco Galicia", "tipo": "bank", "saldo_ars": 0.0, "saldo_usd": 0.0},
    {"id": 3, "nombre": "Brubank", "tipo": "bank", "saldo_ars": 14300.0, "saldo_usd": 0.0},
]

OBJETIVOS = [
    {"id": 1, "nombre": "Brasil - Caro", "meta": 1_080_000, "moneda": "ARS", "fecha_limite": "2026-12-01"},
    {"id": 2, "nombre": "Fondo de emergencia", "meta": 500_000, "moneda": "ARS"},
    {"id": 3, "nombre": "Viaje Europa", "meta": 800_000, "moneda": "ARS"},
    {"id": 4, "nombre": "Viaje Asia", "meta": 600_000, "moneda": "ARS"},
]


# ──────────────────────────────────────────────────────────────────────────
# Fix 3 — _fuzzy_match (finanzas_handlers.py)
# ──────────────────────────────────────────────────────────────────────────

class TestFuzzyMatch:
    def test_match_exacto(self):
        item = fh._fuzzy_match("Uala", CUENTAS)
        assert item is not None and item["nombre"] == "Uala"

    def test_match_exacto_case_insensitive(self):
        item = fh._fuzzy_match("uala", CUENTAS)
        assert item["nombre"] == "Uala"

    def test_substring_razonable(self):
        # "galicia" (7) substring de "banco galicia" (13), ratio de longitud aceptable.
        item = fh._fuzzy_match("galicia", CUENTAS)
        assert item["nombre"] == "Banco Galicia"

    def test_substring_objetivo_homonimo(self):
        # Caso real: /objetivo emergencia -> Fondo de emergencia.
        item = fh._fuzzy_match("emergencia", OBJETIVOS)
        assert item["nombre"] == "Fondo de emergencia"

    def test_sin_match(self):
        assert fh._fuzzy_match("Mercado Pago", CUENTAS) is None

    def test_nombre_vacio(self):
        assert fh._fuzzy_match("", CUENTAS) is None

    def test_umbral_minimo_no_matchea_por_palabra_suelta_sin_relacion(self):
        # Bug documentado en Testeos-Ollama.md prueba 7: "viaje" terminaba matcheando
        # "Brasil - Caro" sin ningún criterio de confianza. Con umbral mínimo, no matchea.
        assert fh._fuzzy_match("viaje", OBJETIVOS[:2]) is None

    def test_ambiguo_devuelve_sentinel_no_el_primero(self):
        # "viaje" matchea tanto "Viaje Europa" como "Viaje Asia": debe señalar ambigüedad
        # en vez de devolver silenciosamente el primero de la lista.
        result = fh._fuzzy_match("viaje", OBJETIVOS)
        assert result is fh.AMBIGUOUS_MATCH

    def test_texto_muy_deformado_no_fuerza_match_falso(self):
        # "ula aya" (typo del LLM por "Uala") — mejor ningún match que uno incorrecto.
        assert fh._fuzzy_match("ula aya", CUENTAS) is None


# ──────────────────────────────────────────────────────────────────────────
# Fix 1 — _resolve_cuenta_fuzzy (intent_router.py)
# ──────────────────────────────────────────────────────────────────────────

class TestResolveCuentaFuzzy:
    def test_matchea_cuenta_mal_escrita_contra_la_api(self):
        datos = {"monto": 4500, "cuenta": "uala"}
        with patch("finanzas_handlers.requests.get", return_value=_resp(CUENTAS)):
            ir._resolve_cuenta_fuzzy(datos)
        assert datos["cuenta"] == "Uala"

    def test_sin_match_quita_la_cuenta_en_vez_de_dejar_texto_crudo(self):
        # Antes del fix, "ula aya" (garbled por el LLM) llegaba tal cual al preview/POST.
        datos = {"monto": 4500, "cuenta": "ula aya"}
        with patch("finanzas_handlers.requests.get", return_value=_resp(CUENTAS)):
            ir._resolve_cuenta_fuzzy(datos)
        assert "cuenta" not in datos

    def test_ambiguo_tambien_quita_la_cuenta(self):
        cuentas_ambiguas = [
            {"id": 1, "nombre": "Viaje Europa Wallet", "saldo_ars": 0, "saldo_usd": 0},
            {"id": 2, "nombre": "Viaje Asia Wallet", "saldo_ars": 0, "saldo_usd": 0},
        ]
        datos = {"monto": 1000, "cuenta": "viaje"}
        with patch("finanzas_handlers.requests.get", return_value=_resp(cuentas_ambiguas)):
            ir._resolve_cuenta_fuzzy(datos)
        assert "cuenta" not in datos

    def test_sin_cuenta_en_datos_no_llama_a_la_api(self):
        datos = {"monto": 4500}
        with patch("finanzas_handlers.requests.get") as mock_get:
            ir._resolve_cuenta_fuzzy(datos)
        mock_get.assert_not_called()

    def test_error_de_red_no_rompe_y_deja_el_texto_crudo(self):
        datos = {"monto": 4500, "cuenta": "uala"}
        with patch("finanzas_handlers.requests.get", side_effect=Exception("boom")):
            ir._resolve_cuenta_fuzzy(datos)
        assert datos["cuenta"] == "uala"


# ──────────────────────────────────────────────────────────────────────────
# Fix 2 — _gather_finanzas (assistant.py)
# ──────────────────────────────────────────────────────────────────────────

_RESUMEN_VACIO = {"ingresos": 0, "gastos": 0, "balance": 0, "tasa_ahorro": 0, "por_categoria": []}


class TestGatherFinanzas:
    def _mocks(self):
        return patch.multiple(
            "finanzas_handlers",
            _get_cuentas=MagicMock(return_value=[
                {"id": 1, "nombre": "Uala", "tipo": "wallet", "saldo_ars": 431537.59, "saldo_usd": 0.0},
            ]),
            _get_config=MagicMock(return_value={"dolar_mep": "1350"}),
            _get_objetivos=MagicMock(return_value=OBJETIVOS[:2]),
        )

    def test_pregunta_de_saldo_simple_no_incluye_objetivos(self):
        with self._mocks(), patch("assistant.requests.get", return_value=_resp(_RESUMEN_VACIO)):
            contexto = assistant._gather_finanzas("http://fake", "¿Cuánta plata tengo?")
        assert "objetivos_de_ahorro" not in contexto

    def test_pregunta_sin_texto_no_incluye_objetivos(self):
        with self._mocks(), patch("assistant.requests.get", return_value=_resp(_RESUMEN_VACIO)):
            contexto = assistant._gather_finanzas("http://fake")
        assert "objetivos_de_ahorro" not in contexto

    def test_pregunta_que_menciona_objetivo_si_los_incluye(self):
        with self._mocks(), patch("assistant.requests.get", return_value=_resp(_RESUMEN_VACIO)):
            contexto = assistant._gather_finanzas("http://fake", "¿cuánto me falta para el objetivo?")
        assert "objetivos_de_ahorro" in contexto
        assert len(contexto["objetivos_de_ahorro"]) == 2

    def test_pregunta_que_menciona_ahorro_si_los_incluye(self):
        with self._mocks(), patch("assistant.requests.get", return_value=_resp(_RESUMEN_VACIO)):
            contexto = assistant._gather_finanzas("http://fake", "¿cuánto llevo ahorrado este año?")
        assert "objetivos_de_ahorro" in contexto
