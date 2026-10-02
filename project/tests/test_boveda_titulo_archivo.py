"""Regresión T3-A (#12 + #13): el título autogenerado de una nota rápida se
convierte en el nombre del archivo `.md` en la Bóveda. El backend tiene que
garantizar un nombre seguro para Windows y sin colisiones, sea cual sea el
título que mande el frontend (que solo produce texto legible, no sanea)."""
import os
from pathlib import Path

import pytest

from app.db import crud


def _carpeta_categoria(cat_id: int) -> Path:
    cats = crud.obtener_categorias()
    ruta = next(c["ruta"] for c in cats if c["id"] == cat_id)
    return Path(os.environ["VAULT_ROOT"]) / ruta


@pytest.mark.integration
def test_titulo_con_caracteres_invalidos_genera_archivo_seguro(tmp_app_db, tmp_vault):
    cat_id = crud.crear_categoria(nombre="Prueba")
    # Caracteres prohibidos en nombres de archivo de Windows: <>:"/\|?*
    crud.crear_hoja(contenido='Reunión: ¿qué? <algo> "x" | y', categoria_id=cat_id)

    archivos = list(_carpeta_categoria(cat_id).glob("*.md"))
    assert len(archivos) == 1
    nombre = archivos[0].name
    assert not any(ch in nombre for ch in '<>:"/\\|?*')
    # El contenido original (título) se preserva en la fila aunque el archivo se sanee.
    hojas = crud.obtener_hojas()
    assert hojas[0]["contenido"] == 'Reunión: ¿qué? <algo> "x" | y'


@pytest.mark.integration
def test_titulos_colisionando_generan_nombres_unicos(tmp_app_db, tmp_vault):
    cat_id = crud.crear_categoria(nombre="Prueba")
    crud.crear_hoja(contenido="Nota repetida", categoria_id=cat_id)
    crud.crear_hoja(contenido="Nota repetida", categoria_id=cat_id)
    crud.crear_hoja(contenido="Nota repetida", categoria_id=cat_id)

    archivos = sorted(p.name for p in _carpeta_categoria(cat_id).glob("*.md"))
    assert len(archivos) == 3
    assert len(set(archivos)) == 3  # sin colisiones


@pytest.mark.integration
def test_titulo_largo_no_rompe_el_nombre(tmp_app_db, tmp_vault):
    cat_id = crud.crear_categoria(nombre="Prueba")
    crud.crear_hoja(contenido="A" * 300, categoria_id=cat_id)

    archivos = list(_carpeta_categoria(cat_id).glob("*.md"))
    assert len(archivos) == 1
    # sanitize_nombre topa en 80 caracteres el stem.
    assert len(archivos[0].stem) <= 80


@pytest.mark.integration
def test_texto_en_apuntes_persiste_como_cuerpo(tmp_app_db, tmp_vault):
    """El nuevo modelo manda el cuerpo en `apuntes`; debe persistir y releerse."""
    cat_id = crud.crear_categoria(nombre="Prueba")
    hid = crud.crear_hoja(
        contenido="Comprar pan",
        categoria_id=cat_id,
        tipo="texto",
        apuntes="<p>Comprar pan<br>y leche</p>",
    )
    hoja = crud.obtener_hoja_por_id(hid)
    assert hoja is not None
    assert "Comprar pan" in (hoja["apuntes"] or "")
    assert "leche" in (hoja["apuntes"] or "")
