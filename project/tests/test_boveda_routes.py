"""Tests de rutas HTTP de /categorias y /hojas usando TestClient de FastAPI.

Nota: no probamos POST /hojas via HTTP porque dispara una background task de
indexacion semantica (semantic.index_hoja) que corre sincronicamente bajo
TestClient y depende de infra externa (embeddings) fuera del alcance de este
sandbox -- para sembrar hojas de prueba usamos crud.crear_hoja() directo.
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db import crud
from app.db.database import get_connection


@pytest.fixture
def client(tmp_app_db, tmp_vault):
    return TestClient(app)


@pytest.mark.integration
def test_post_categoria_y_la_lista(client):
    response = client.post("/categorias", json={"nombre": "Proyectos Test"})
    assert response.status_code == 200
    creada = response.json()
    assert creada["nombre"] == "Proyectos Test"

    listado = client.get("/categorias")
    assert listado.status_code == 200
    nombres = [c["nombre"] for c in listado.json()]
    assert "Proyectos Test" in nombres


@pytest.mark.integration
def test_post_categoria_nombre_vacio_da_400(client):
    response = client.post("/categorias", json={"nombre": "   "})
    assert response.status_code == 400


@pytest.mark.integration
def test_post_categoria_duplicada_da_400(client):
    client.post("/categorias", json={"nombre": "Duplicada"})
    response = client.post("/categorias", json={"nombre": "Duplicada"})
    assert response.status_code == 400


@pytest.mark.integration
def test_delete_categoria_inexistente_da_404(client):
    response = client.delete("/categorias/999999")
    assert response.status_code == 404


@pytest.mark.integration
def test_delete_categoria_estructural_da_409(client, tmp_app_db):
    """Las categorias estructurales (raices del arbol PARA) no se crean via
    crear_categoria() -- se insertan directo para simular una real."""
    conn = get_connection()
    conn.execute(
        "INSERT INTO categorias (nombre, ruta, estructural) VALUES (?, ?, 1)",
        ("00 - Sin categorizar", "00 - Sin categorizar"),
    )
    conn.commit()
    cat_id = conn.execute(
        "SELECT id FROM categorias WHERE nombre = ?", ("00 - Sin categorizar",)
    ).fetchone()[0]
    conn.close()

    response = client.delete(f"/categorias/{cat_id}")
    assert response.status_code == 409


@pytest.mark.integration
def test_delete_categoria_con_hojas_da_409_sin_forzar(client):
    creada = client.post("/categorias", json={"nombre": "Con Hojas"}).json()
    crud.crear_hoja("Contenido de prueba", creada["id"], tipo="texto")

    response = client.delete(f"/categorias/{creada['id']}")
    assert response.status_code == 409


@pytest.mark.integration
def test_delete_categoria_con_hojas_forzado_mueve_a_basura(client, tmp_vault):
    """En producción real la categoría "05 - Basura" siempre existe con su
    carpeta física correspondiente (parte del árbol PARA estructural). Para
    simular ese estado acá hace falta tanto la fila en la DB como la carpeta
    real en el vault -- si falta la carpeta física, `sincronizar_vault_si_hace_falta()`
    (llamado dentro de crear_categoria()) purga la fila por considerarla
    huérfana antes de que eliminar_categoria() llegue a buscarla (esto casi se
    documentó como bug real por error, hasta confirmar que era un artefacto del
    setup del test, no del código de producción)."""
    (tmp_vault / "05 - Basura").mkdir(parents=True, exist_ok=True)
    conn = get_connection()
    conn.execute(
        "INSERT INTO categorias (nombre, ruta, estructural) VALUES (?, ?, 1)",
        ("05 - Basura", "05 - Basura"),
    )
    conn.commit()
    conn.close()

    creada = client.post("/categorias", json={"nombre": "Con Hojas Forzado"}).json()
    crud.crear_hoja("Contenido de prueba", creada["id"], tipo="texto")

    response = client.delete(f"/categorias/{creada['id']}?forzar=true")
    assert response.status_code == 200


@pytest.mark.integration
def test_get_hojas_recientes_vacio(client):
    response = client.get("/hojas/recientes")
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.integration
def test_get_hojas_recientes_con_datos(client):
    creada = client.post("/categorias", json={"nombre": "Recientes Test"}).json()
    crud.crear_hoja("Nota de prueba", creada["id"], tipo="texto")

    response = client.get("/hojas/recientes")
    assert response.status_code == 200
    assert len(response.json()) >= 1
