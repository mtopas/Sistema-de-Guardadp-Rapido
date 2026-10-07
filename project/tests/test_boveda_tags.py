import json

import pytest

from app.db import crud
from app.db.database import get_connection
from app.main import _autoetiquetar_hoja
from jarvis.captures import tags as capture_tags


@pytest.mark.integration
def test_hoja_persiste_tags_y_conserva_hashtags_manuales(tmp_app_db, tmp_vault):
    categoria_id = crud.crear_categoria("Tags")
    hoja_id = crud.crear_hoja(
        "Nota #manual",
        categoria_id,
        apuntes="<p>Cuerpo con #cuerpo</p>",
    )

    hoja = crud.obtener_hoja_por_id(hoja_id)
    assert hoja["tags"] == ["manual", "cuerpo"]

    conn = get_connection()
    raw = conn.execute("SELECT tags FROM hojas WHERE id = ?", (hoja_id,)).fetchone()[0]
    conn.close()
    assert json.loads(raw) == ["manual", "cuerpo"]


@pytest.mark.integration
def test_patch_de_contenido_hace_merge_aditivo_y_patch_tags_permite_remover(
    tmp_app_db, tmp_vault,
):
    categoria_id = crud.crear_categoria("Tags")
    hoja_id = crud.crear_hoja("Nota #manual", categoria_id)

    crud.actualizar_hoja(hoja_id, {"tags": ["manual", "ia"]})
    crud.actualizar_hoja(hoja_id, {"apuntes": "<p>Texto nuevo #nuevo</p>"})
    assert crud.obtener_hoja_por_id(hoja_id)["tags"] == ["manual", "ia", "nuevo"]

    crud.actualizar_hoja(hoja_id, {"tags": ["manual", "nuevo"]})
    assert crud.obtener_hoja_por_id(hoja_id)["tags"] == ["manual", "nuevo"]


def test_sugerencia_ia_solo_acepta_confianza_explicita_y_prefiere_catalogo(monkeypatch):
    monkeypatch.setattr(capture_tags, "list_tag_catalog", lambda: ["python", "trabajo"])
    monkeypatch.setattr(
        capture_tags,
        "call_classify",
        lambda *_: '{"tags": ["python", "nuevo"], "tags_confidence": 0.9}',
    )

    assert capture_tags.sugerir_tags_para_hoja("Una nota suficientemente larga sobre Python y trabajo") == ["python"]

    monkeypatch.setattr(
        capture_tags,
        "call_classify",
        lambda *_: '{"tags": ["ruido"], "tags_confidence": 0.5}',
    )
    assert capture_tags.sugerir_tags_para_hoja("Una nota suficientemente larga sobre Python y trabajo") == []


@pytest.mark.integration
def test_autoetiquetado_agrega_sin_reemplazar_tags_existentes(monkeypatch, tmp_app_db, tmp_vault):
    categoria_id = crud.crear_categoria("Tags")
    hoja_id = crud.crear_hoja("Nota #manual", categoria_id, apuntes="<p>Contenido largo y significativo para etiquetar.</p>")
    monkeypatch.setattr(
        capture_tags,
        "sugerir_tags_para_hoja",
        lambda *_: ["ia", "manual"],
    )

    _autoetiquetar_hoja(hoja_id)

    assert crud.obtener_hoja_por_id(hoja_id)["tags"] == ["manual", "ia"]
