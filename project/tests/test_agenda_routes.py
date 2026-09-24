"""Tests de rutas HTTP de /agenda/* usando TestClient de FastAPI."""
import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client(tmp_app_db):
    return TestClient(app)


@pytest.mark.integration
def test_get_agenda_eventos_empty(client):
    response = client.get("/agenda/eventos?desde=2026-09-01&hasta=2026-09-30")
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.integration
def test_post_agenda_evento_y_lo_lista(client):
    response = client.post(
        "/agenda/eventos",
        json={"titulo": "Reunion", "fecha_inicio": "2026-09-15T10:00:00"},
    )
    assert response.status_code == 200
    creado = response.json()
    assert creado["titulo"] == "Reunion"

    listado = client.get("/agenda/eventos?desde=2026-09-01&hasta=2026-09-30")
    assert listado.status_code == 200
    titulos = [e["titulo"] for e in listado.json()]
    assert "Reunion" in titulos


@pytest.mark.integration
def test_post_agenda_evento_fecha_fin_antes_de_inicio_da_422(client):
    """El model_validator de AgendaEventoCreate rechaza fecha_fin < fecha_inicio."""
    response = client.post(
        "/agenda/eventos",
        json={
            "titulo": "Evento invalido",
            "fecha_inicio": "2026-09-15T10:00:00",
            "fecha_fin": "2026-09-14T10:00:00",
        },
    )
    assert response.status_code == 422


@pytest.mark.integration
def test_patch_agenda_evento_inexistente_da_404(client):
    response = client.patch("/agenda/eventos/999999", json={"titulo": "Nuevo"})
    assert response.status_code == 404


@pytest.mark.integration
def test_delete_agenda_evento_inexistente_da_404(client):
    response = client.delete("/agenda/eventos/999999")
    assert response.status_code == 404


@pytest.mark.integration
def test_delete_agenda_evento_existente_lo_elimina(client):
    creado = client.post(
        "/agenda/eventos",
        json={"titulo": "Para borrar", "fecha_inicio": "2026-09-15T10:00:00"},
    ).json()
    response = client.delete(f"/agenda/eventos/{creado['id']}")
    assert response.status_code == 200

    listado = client.get("/agenda/eventos?desde=2026-09-01&hasta=2026-09-30")
    titulos = [e["titulo"] for e in listado.json()]
    assert "Para borrar" not in titulos


@pytest.mark.integration
def test_post_agenda_tarea_recurrente_genera_ocurrencias(client):
    """Ruta completa: POST /agenda/tareas con se_repite=true genera ocurrencias
    reales via _generar_fechas_recurrencia_tarea (probado a nivel unitario en
    test_agenda.py) -- esto confirma que el body llega bien mapeado desde HTTP."""
    response = client.post(
        "/agenda/tareas",
        json={
            "titulo": "Tarea semanal",
            "fecha_opcional": "2026-09-15",
            "se_repite": True,
            "regla_repeticion": '{"frecuencia": "semanal", "dias": []}',
        },
    )
    assert response.status_code == 200

    listado = client.get("/agenda/tareas")
    assert listado.status_code == 200
    tareas_serie = [t for t in listado.json() if t.get("titulo") == "Tarea semanal"]
    # La cabeza + al menos una ocurrencia generada (ventana semanal >= 1 semana)
    assert len(tareas_serie) > 1


@pytest.mark.integration
def test_get_agenda_revision_devuelve_dict(client):
    response = client.get("/agenda/revision?desde=2026-09-01&hasta=2026-09-07")
    assert response.status_code == 200
    assert isinstance(response.json(), dict)
