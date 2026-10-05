"""Regresión (#12 + #13): el bot de Telegram guarda las notas de texto con el
mismo modelo título/cuerpo que la app.

- Una nota de TEXTO sale con el título autogenerado en `contenido` y el cuerpo
  en `apuntes` (HTML), no todo el texto apelmazado en `contenido`.
- Un link (puro o con comentario) pasa a "cuerpo único": la URL vive en el
  CUERPO (`apuntes`), no cruda en `contenido`, y la nota se guarda como `texto`
  (2026-10-05, título por IA).
- Una FOTO no se toca (título/caption en `contenido`, img en `apuntes`).

Si alguien revierte el cableado de _save_draft a `app.hoja_cuerpo`, estos tests
fallan de inmediato.
"""
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

_MYBOT_DIR = Path(__file__).resolve().parent.parent / "mybot"
if str(_MYBOT_DIR) not in sys.path:
    sys.path.insert(0, str(_MYBOT_DIR))

import bot  # noqa: E402


def _ok_response():
    resp = MagicMock()
    resp.status_code = 201
    resp.json.return_value = {"id": 1}
    return resp


async def _run_save(payload):
    """Invoca _save_draft con _post_hoja mockeado y devuelve sus kwargs."""
    cat = {"id": 7, "nombre": "Ideas"}
    message = MagicMock()
    message.reply_text = AsyncMock()
    with patch.object(bot, "_post_hoja", return_value=_ok_response()) as mock_post, \
         patch.object(bot, "_update_rapido_last_cat"):
        ok = await bot._save_draft({}, {}, cat, message, pending=payload)
    assert ok is True
    return mock_post.call_args


@pytest.mark.asyncio
class TestSaveDraftCuerpo:

    async def test_nota_texto_titulo_autogenerado_y_cuerpo_en_apuntes(self):
        payload = {"draft": "Comprar pan\ny más cosas", "tipo": "texto"}
        args, kwargs = await _run_save(payload)
        # contenido (primer posicional) = título autogenerado de la 1ra línea
        assert args[0] == "Comprar pan"
        assert kwargs["tipo"] == "texto"
        # cuerpo completo en apuntes, como HTML
        assert kwargs["apuntes"] == "<p>Comprar pan<br>y más cosas</p>"

    async def test_nota_texto_con_link_en_el_medio(self):
        payload = {"draft": "Ver esto https://ejemplo.com/post ahora", "tipo": "texto"}
        args, kwargs = await _run_save(payload)
        assert args[0] == "Ver esto ahora"
        assert "https://ejemplo.com/post" in kwargs["apuntes"]

    async def test_link_puro_pasa_a_cuerpo_unico(self):
        payload = {"draft": "https://ejemplo.com/articulo", "tipo": "link"}
        args, kwargs = await _run_save(payload)
        # La URL ya NO va cruda en contenido: la nota es texto y la URL vive en
        # el cuerpo (de ahí sale su preview); el título lo mejora la IA después.
        assert kwargs["tipo"] == "texto"
        assert "https://ejemplo.com/articulo" in kwargs["apuntes"]

    async def test_link_con_comentario_cuerpo_unico(self):
        payload = {
            "draft": "https://ejemplo.com/ocr\nHerramienta para escanear docs",
            "tipo": "link",
        }
        args, kwargs = await _run_save(payload)
        assert kwargs["tipo"] == "texto"
        # El comentario queda en el cuerpo junto con la URL.
        assert "Herramienta para escanear docs" in kwargs["apuntes"]
        assert "https://ejemplo.com/ocr" in kwargs["apuntes"]
        # El contenido (título provisional) ya no es la URL cruda.
        assert args[0] != "https://ejemplo.com/ocr"

    async def test_foto_no_se_toca(self):
        payload = {
            "draft": "Mi foto del asado",
            "tipo": "foto",
            "apuntes": '<img src="http://x/y.jpg" alt="Mi foto del asado">',
        }
        args, kwargs = await _run_save(payload)
        assert args[0] == "Mi foto del asado"
        assert kwargs["tipo"] == "foto"
        assert kwargs["apuntes"] == '<img src="http://x/y.jpg" alt="Mi foto del asado">'

    async def test_ubicacion_no_se_transforma(self):
        payload = {
            "draft": "📍 -34.60000, -58.40000",
            "tipo": "texto",
            "lugar": "-34.60000, -58.40000",
            "latitud": -34.6,
            "longitud": -58.4,
        }
        args, kwargs = await _run_save(payload)
        # El pin conserva su contenido y no genera apuntes de cuerpo.
        assert args[0] == "📍 -34.60000, -58.40000"
        assert not kwargs.get("apuntes")
