"""Tests de rutas HTTP de /habitos* usando TestClient de FastAPI."""
import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client(tmp_app_db):
    return TestClient(app)


@pytest.mark.integration
def test_post_habito_y_lo_lista(client):
    response = client.post("/habitos", json={"nombre": "Leer"})
    assert response.status_code == 200
    creado = response.json()
    assert creado["nombre"] == "Leer"
    assert creado["activo"] == 1

    listado = client.get("/habitos")
    assert listado.status_code == 200
    nombres = [h["nombre"] for h in listado.json()]
    assert "Leer" in nombres


@pytest.mark.integration
def test_put_registro_valor_valido_actualiza(client):
    habito = client.post("/habitos", json={"nombre": "Meditar"}).json()
    response = client.put(
        f"/habitos/{habito['id']}/registro",
        json={"fecha": "2026-09-23", "valor": 1.0},
    )
    assert response.status_code == 200
    assert response.json()["valor"] == 1.0


@pytest.mark.integration
def test_put_registro_valor_invalido_da_422_no_500(client):
    """La validacion de 'valor debe ser 0.5 o 1.0' vive en el Pydantic model
    (HabitoRegistroUpsert) y corta ANTES de llegar a habitos_registros_upsert()
    en crud.py -- confirma que el ValueError de la capa de crud es inalcanzable
    por esta ruta (la duda quedo abierta en la tanda 2, esto la cierra)."""
    habito = client.post("/habitos", json={"nombre": "Correr"}).json()
    response = client.put(
        f"/habitos/{habito['id']}/registro",
        json={"fecha": "2026-09-23", "valor": 0.3},
    )
    assert response.status_code == 422


@pytest.mark.integration
def test_patch_activo_false_setea_archivado_en(client):
    habito = client.post("/habitos", json={"nombre": "Estudiar"}).json()
    assert habito["archivado_en"] is None

    response = client.patch(f"/habitos/{habito['id']}", json={"activo": False})
    assert response.status_code == 200
    data = response.json()
    assert data["activo"] == 0
    assert data["archivado_en"] is not None


@pytest.mark.integration
def test_patch_habito_inexistente_da_404(client):
    response = client.patch("/habitos/999999", json={"activo": False})
    assert response.status_code == 404


@pytest.mark.integration
def test_delete_habito_inexistente_da_404(client):
    response = client.delete("/habitos/999999")
    assert response.status_code == 404


@pytest.mark.integration
def test_get_stats_habito_inexistente_da_404(client):
    response = client.get("/habitos/999999/stats")
    assert response.status_code == 404


@pytest.mark.integration
def test_get_pendientes_hoy_incluye_habito_diario_activo(client):
    client.post("/habitos", json={"nombre": "Tomar agua", "frecuencia_tipo": "diario"})
    response = client.get("/habitos/pendientes-hoy")
    assert response.status_code == 200
    nombres = [h["nombre"] for h in response.json()]
    assert "Tomar agua" in nombres
