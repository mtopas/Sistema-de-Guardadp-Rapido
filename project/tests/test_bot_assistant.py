"""
Tests para `mybot/assistant.py::_gather_boveda` — fallback a búsqueda por palabras clave.

Contexto: `_gather_boveda` respondía preguntas de Bóveda por Telegram usando solo búsqueda
semántica (`embeddings.search`, vía GET /hojas/buscar-semantico). Si no había hits (índice
vacío, Ollama caído, o simplemente el contenido no es semánticamente cercano aunque exista
por texto exacto), el bot le devolvía al usuario un mensaje pidiéndole que use /buscar a
mano, en vez de intentarlo el sistema mismo. Ver Cerebro/PROXIMAMENTE.md, sección
"Diferido — Bóveda".

`mybot/` no está en el pythonpath de `project/pytest.ini` (solo `project/` vía
`pythonpath = .`), así que este archivo agrega `project/mybot` a `sys.path` explícitamente,
mismo patrón que `test_bot_finanzas.py`.

Todas las llamadas HTTP se mockean — no dependen de que la API de SGR ni Ollama estén
corriendo.
"""
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

_MYBOT_DIR = Path(__file__).resolve().parent.parent / "mybot"
if str(_MYBOT_DIR) not in sys.path:
    sys.path.insert(0, str(_MYBOT_DIR))

import assistant  # noqa: E402


HITS_SEMANTICOS = [
    {
        "id": 1,
        "contenido": "Notas de la reunión con el equipo de Finanzas",
        "categoria_nombre": "Trabajo",
        "tipo": "texto",
        "apuntes": "<p>Definimos el roadmap del Q3</p>",
        "score": 0.87,
    },
]

HITS_KEYWORD = [
    {
        "id": 2,
        "contenido": "Lista de compras para el viaje a Bariloche",
        "categoria_nombre": "Viajes",
        "tipo": "texto",
        "apuntes": None,
        # GET /hojas?q= no devuelve "score" — nunca hubo ranking semántico.
    },
]


class TestGatherBoveda:
    def test_usa_hits_semanticos_sin_llamar_al_fallback(self):
        with patch("assistant.emb.search", return_value=HITS_SEMANTICOS) as mock_search, \
             patch("assistant.emb.search_keyword") as mock_keyword:
            contexto = assistant._gather_boveda("¿qué hablamos de Finanzas?", "http://fake")

        mock_search.assert_called_once()
        mock_keyword.assert_not_called()
        assert contexto is not None
        assert contexto["pregunta"] == "¿qué hablamos de Finanzas?"
        nota = contexto["notas_encontradas"][0]
        assert nota["categoria"] == "Trabajo"
        assert nota["relevancia"] == 0.87

    def test_semantica_vacia_cae_a_busqueda_por_palabras_clave(self):
        with patch("assistant.emb.search", return_value=[]), \
             patch("assistant.emb.search_keyword", return_value=HITS_KEYWORD) as mock_keyword:
            contexto = assistant._gather_boveda("bariloche", "http://fake")

        mock_keyword.assert_called_once_with("bariloche", api_base="http://fake")
        assert contexto is not None
        nota = contexto["notas_encontradas"][0]
        assert nota["categoria"] == "Viajes"
        assert nota["titulo"].startswith("Lista de compras")
        # Sin score real de la búsqueda por keyword: valor fijo documentado, no None ni ausente.
        assert nota["relevancia"] == 1.0

    def test_ambas_vacias_devuelve_none(self):
        with patch("assistant.emb.search", return_value=[]), \
             patch("assistant.emb.search_keyword", return_value=[]) as mock_keyword:
            contexto = assistant._gather_boveda("algo que no existe", "http://fake")

        mock_keyword.assert_called_once()
        assert contexto is None
