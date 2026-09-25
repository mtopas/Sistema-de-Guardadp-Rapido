"""Regresiones de la auditoría de Bóveda sobre un vault y DB temporales."""

import pytest
from app.db import crud
from app.db.database import get_connection, init_db
from app.vault import parser


@pytest.mark.integration
def test_patch_de_metadatos_conserva_cuerpo_y_frontmatter_manual(tmp_app_db, tmp_vault):
    cat_id = crud.crear_categoria("Pruebas")
    hoja_id = crud.crear_hoja("Título", cat_id, apuntes="<p>Apunte original</p>")
    conn = get_connection()
    ruta = conn.execute("SELECT ruta FROM hojas WHERE id = ?", (hoja_id,)).fetchone()[0]
    conn.close()
    path = tmp_vault / ruta
    data, _ = parser.split_frontmatter(path.read_text(encoding="utf-8"))
    data["tags"] = ["manual"]
    data["campo_ajeno"] = {"dato": "conservar"}
    cuerpo = "\nPrefacio escrito a mano.\n\n# Título\n\nApunte original\n\n[[Enlace interno]]\n"
    path.write_text(parser.build_frontmatter_text(data) + cuerpo, encoding="utf-8")

    crud.actualizar_hoja(hoja_id, {"icono": "Star"})
    actualizado, cuerpo_actual = parser.split_frontmatter(path.read_text(encoding="utf-8"))
    assert cuerpo_actual == cuerpo
    assert actualizado["tags"] == ["manual"]
    assert actualizado["campo_ajeno"] == {"dato": "conservar"}

    crud.actualizar_hoja(hoja_id, {"contenido": "Nuevo título"})
    _, cuerpo_renombrado = parser.split_frontmatter(path.read_text(encoding="utf-8"))
    assert "Prefacio escrito a mano." in cuerpo_renombrado
    assert "# Nuevo título" in cuerpo_renombrado
    assert "[[Enlace interno]]" in cuerpo_renombrado


@pytest.mark.integration
def test_frontmatter_temporalmente_invalido_no_cambia_id_sqlite(tmp_app_db, tmp_vault):
    cat_id = crud.crear_categoria("Pruebas")
    hoja_id = crud.crear_hoja("Título", cat_id)
    conn = get_connection()
    ruta = conn.execute("SELECT ruta FROM hojas WHERE id = ?", (hoja_id,)).fetchone()[0]
    conn.close()
    path = tmp_vault / ruta
    original = path.read_text(encoding="utf-8")
    path.write_text("---\nid: [\n---\n# Título\n", encoding="utf-8")

    assert [h["id"] for h in crud.obtener_hojas()] == [hoja_id]
    path.write_text(original, encoding="utf-8")
    assert [h["id"] for h in crud.obtener_hojas()] == [hoja_id]


@pytest.mark.integration
def test_borrar_mueve_a_basura_sin_resucitar_en_consultas(tmp_app_db, tmp_vault):
    cat_id = crud.crear_categoria("Pruebas")
    hoja_id = crud.crear_hoja("Borrar", cat_id)
    assert crud.eliminar_hoja(hoja_id) == "Borrar"
    assert (tmp_vault / "05 - Basura" / "Borrar.md").exists()
    assert crud.obtener_hojas() == []
    assert crud.obtener_hojas_recientes() == []
    assert crud.buscar_hojas(q="Borrar") == []
    assert crud.obtener_hoja_por_id(hoja_id) is None


@pytest.mark.integration
def test_rutas_de_hojas_anidadas_usadas_por_sync(tmp_app_db, tmp_vault):
    padre_id = crud.crear_categoria("Padre")
    cat_id = crud.crear_categoria("Hija", padre_id=padre_id)
    hoja_id = crud.crear_hoja("Anidada", cat_id)
    conn = get_connection()
    ruta = conn.execute("SELECT ruta FROM hojas WHERE id = ?", (hoja_id,)).fetchone()[0]
    conn.close()
    assert ruta == "Padre/Hija/Anidada.md"
    path = tmp_vault / ruta
    original = path.read_text(encoding="utf-8")
    path.write_text("---\nid: [\n---\n# Anidada\n", encoding="utf-8")
    assert [h["id"] for h in crud.obtener_hojas()] == [hoja_id]
    path.write_text(original, encoding="utf-8")
    assert [h["id"] for h in crud.obtener_hojas()] == [hoja_id]


@pytest.mark.integration
def test_borrar_categoria_forzado_crea_basura_y_oculta_hojas(tmp_app_db, tmp_vault):
    cat_id = crud.crear_categoria("Temporal")
    crud.crear_hoja("Nota", cat_id)
    assert crud.eliminar_categoria(cat_id, forzar=True) == "ok"
    assert (tmp_vault / "05 - Basura" / "Nota.md").exists()
    assert crud.obtener_hojas() == []
    assert crud.buscar_hojas(q="Nota") == []


@pytest.mark.integration
def test_indice_reconstruido_recupera_colores_y_preview(tmp_app_db, tmp_vault):
    cat_id = crud.crear_categoria("Pruebas", icono="⭐", color="#123456")
    crud.crear_hoja(
        "https://example.com", cat_id, tipo="link", color="#abcdef",
        link_preview={"title": "Ejemplo"},
    )
    tmp_app_db.unlink()
    init_db()
    categorias = crud.obtener_categorias()
    cat = next(c for c in categorias if c["nombre"] == "Pruebas")
    hoja = next(h for h in crud.obtener_hojas() if h["contenido"] == "https://example.com")
    assert cat["icono"] == "⭐"
    assert cat["color"] == "#123456"
    assert hoja["color"] == "#abcdef"
    assert hoja["link_preview"] == {"title": "Ejemplo"}


def test_chroma_reindexa_id_reutilizado_con_contenido_distinto(monkeypatch):
    from app import semantic

    class Collection:
        def __init__(self):
            self.upserts = []
            self.deleted = []

        def get(self, include):
            return {"ids": ["1", "99"], "metadatas": [
                {"firma": semantic._firma_hoja("Vieja", "Cat", "texto", "")},
                {"firma": "obsoleta"},
            ]}

        def delete(self, ids):
            self.deleted.extend(ids)

        def upsert(self, **kwargs):
            self.upserts.append(kwargs)

    col = Collection()
    monkeypatch.setattr(semantic, "_get_collection", lambda: col)
    monkeypatch.setattr(semantic, "_ollama_available", lambda: True)
    monkeypatch.setattr(semantic, "embed_text", lambda text: [0.1, 0.2])
    assert semantic.backfill_missing([{
        "id": 1, "contenido": "Nueva", "categoria_nombre": "Cat",
        "tipo": "texto", "apuntes": "<p>Dato del cuerpo</p>",
    }]) == 1
    assert col.deleted == ["99"]
    assert col.upserts[0]["ids"] == ["1"]
    assert "Dato del cuerpo" in semantic._texto_indexado("Nueva", "Cat", "<p>Dato del cuerpo</p>")
