"""Regresión T5-C (#11a): recategorizar una hoja desde el selector inline usa el
PATCH existente (crud.actualizar_hoja con categoria_id nuevo), que debe mover el
.md de carpeta en la Bóveda y actualizar la fila SQL."""
import os
from pathlib import Path

import pytest

from app.db import crud


def _carpeta(cat_id: int) -> Path:
    cats = crud.obtener_categorias()
    ruta = next(c["ruta"] for c in cats if c["id"] == cat_id)
    return Path(os.environ["VAULT_ROOT"]) / ruta


@pytest.mark.integration
def test_mover_hoja_cambia_carpeta_y_fila(tmp_app_db, tmp_vault):
    origen = crud.crear_categoria(nombre="Inbox")
    destino = crud.crear_categoria(nombre="Salud")
    hid = crud.crear_hoja(contenido="Turno médico", categoria_id=origen, tipo="texto",
                          apuntes="<p>pedir turno</p>")

    # Antes: el archivo vive en la carpeta de origen.
    assert len(list(_carpeta(origen).glob("*.md"))) == 1
    assert len(list(_carpeta(destino).glob("*.md"))) == 0

    resultado = crud.actualizar_hoja(hid, {"categoria_id": destino})
    assert resultado is not None
    assert resultado["categoria_id"] == destino

    # Después: el archivo se movió de carpeta (no quedó duplicado en origen).
    assert len(list(_carpeta(origen).glob("*.md"))) == 0
    assert len(list(_carpeta(destino).glob("*.md"))) == 1

    # La fila refleja la categoría nueva.
    hoja = crud.obtener_hoja_por_id(hid)
    assert hoja["categoria_id"] == destino
    # El cuerpo se preserva al mover.
    assert "pedir turno" in (hoja["apuntes"] or "")
