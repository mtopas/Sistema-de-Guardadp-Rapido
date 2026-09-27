"""Tests de rutas HTTP de /agenda/* usando TestClient de FastAPI."""
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.database import get_connection, init_db


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


@pytest.mark.integration
def test_evento_recurrente_editar_y_borrar_una_ocurrencia(client):
    head = client.post("/agenda/eventos", json={
        "titulo": "Clase", "fecha_inicio": "2026-09-23T18:00:00",
        "fecha_fin": "2026-09-23T19:00:00", "se_repite": True,
        "regla_repeticion": '{"frecuencia":"semanal","dias":[]}',
    }).json()
    events = client.get("/agenda/eventos?desde=2026-09-23&hasta=2026-10-14").json()
    assert len(events) == 4
    assert len({e["id"] for e in events}) == 4
    child = events[1]
    assert child["serie_id"] == head["id"]
    patched = client.patch(f"/agenda/eventos/{child['id']}", json={"titulo": "Clase especial", "fecha_fin": None})
    assert patched.status_code == 200
    assert patched.json()["fecha_fin"] is None
    assert client.delete(f"/agenda/eventos/{child['id']}").status_code == 200
    remaining = client.get("/agenda/eventos?desde=2026-09-23&hasta=2026-10-14").json()
    assert len(remaining) == 3
    assert all(e["titulo"] == "Clase" for e in remaining)


@pytest.mark.integration
def test_recurrencia_no_se_reprograma_mediante_patch_de_una_ocurrencia(client):
    head = client.post("/agenda/eventos", json={
        "titulo": "Clase", "fecha_inicio": "2026-09-23T18:00:00",
        "se_repite": True, "regla_repeticion": '{"frecuencia":"semanal"}',
    }).json()
    response = client.patch(f"/agenda/eventos/{head['id']}", json={"se_repite": False})
    assert response.status_code == 422
    assert len(client.get("/agenda/eventos?desde=2026-09-23&hasta=2026-10-07").json()) == 3


@pytest.mark.integration
def test_patch_tarea_permita_quitar_fecha_y_bloque(client):
    task = client.post("/agenda/tareas", json={
        "titulo": "Bloque", "fecha_opcional": "2026-09-25", "hora_bloque": "15:00"
    }).json()
    response = client.patch(f"/agenda/tareas/{task['id']}", json={
        "fecha_opcional": None, "hora_bloque": None
    })
    assert response.status_code == 200
    assert response.json()["fecha_opcional"] is None
    assert response.json()["hora_bloque"] is None


@pytest.mark.integration
def test_notificaciones_respetan_hora_local_de_ocurrencia(client):
    client.post("/agenda/eventos", json={
        "titulo": "Clase", "fecha_inicio": "2026-09-23T18:00:00",
        "se_repite": True,
        "regla_repeticion": '{"frecuencia":"diario"}',
    })
    early = client.get("/agenda/notificaciones/pending?ventana_min=15&ahora=2026-09-24T10:00:00")
    assert early.status_code == 200
    assert early.json() == []
    due = client.get("/agenda/notificaciones/pending?ventana_min=15&ahora=2026-09-24T17:50:00")
    assert [e["titulo"] for e in due.json()] == ["Clase"]


@pytest.mark.integration
def test_migracion_eventos_legacy_es_idempotente(tmp_app_db):
    conn = get_connection()
    cursor = conn.execute("""INSERT INTO agenda_eventos
        (titulo, fecha_inicio, se_repite, regla_repeticion, recurrencia_materializada)
        VALUES (?, ?, 1, ?, 0)""", ("Legacy", "2026-09-23T10:00:00", '{"frecuencia":"semanal"}'))
    head_id = cursor.lastrowid
    conn.commit()
    conn.close()
    init_db()
    conn = get_connection()
    first = conn.execute("SELECT COUNT(*) FROM agenda_eventos WHERE serie_id = ?", (head_id,)).fetchone()[0]
    conn.close()
    assert first >= 12
    init_db()
    conn = get_connection()
    second = conn.execute("SELECT COUNT(*) FROM agenda_eventos WHERE serie_id = ?", (head_id,)).fetchone()[0]
    conn.close()
    assert second == first


@pytest.mark.integration
@pytest.mark.parametrize("regla", [None, "{}"])
def test_migracion_legacy_sin_regla_no_inventa_ocurrencias(tmp_app_db, regla):
    conn = get_connection()
    cursor = conn.execute("""INSERT INTO agenda_eventos
        (titulo, fecha_inicio, se_repite, regla_repeticion, recurrencia_materializada)
        VALUES (?, ?, 1, ?, 0)""", ("Sin regla", "2026-09-23T10:00:00", regla))
    head_id = cursor.lastrowid
    conn.commit()
    conn.close()

    init_db()
    conn = get_connection()
    row = conn.execute("SELECT recurrencia_materializada FROM agenda_eventos WHERE id = ?", (head_id,)).fetchone()
    children = conn.execute("SELECT COUNT(*) FROM agenda_eventos WHERE serie_id = ?", (head_id,)).fetchone()[0]
    conn.close()
    assert row[0] == 1
    assert children == 0


@pytest.mark.integration
def test_serie_eventos_extiende_sin_resucitar_borradas_ni_depender_de_cabeza(client):
    head = client.post("/agenda/eventos", json={
        "titulo": "Clase", "fecha_inicio": "2026-09-23T10:00:00",
        "se_repite": True, "regla_repeticion": '{"frecuencia":"semanal"}',
    }).json()
    initial = client.get("/agenda/eventos?desde=2026-12-16&hasta=2026-12-16").json()
    assert len(initial) == 1
    assert client.delete(f"/agenda/eventos/{initial[0]['id']}").status_code == 200
    assert client.delete(f"/agenda/eventos/{head['id']}").status_code == 200

    extended = client.get("/agenda/eventos?desde=2026-12-16&hasta=2027-02-03").json()
    assert "2026-12-16" not in [event["fecha_inicio"][:10] for event in extended]
    assert "2027-02-03" in [event["fecha_inicio"][:10] for event in extended]
    assert all(event["serie_id"] == head["id"] for event in extended)
    repeated = client.get("/agenda/eventos?desde=2026-12-16&hasta=2027-02-03").json()
    assert [event["id"] for event in repeated] == [event["id"] for event in extended]

    surviving = extended[-1]
    assert client.delete(f"/agenda/series/evento/{head['id']}").status_code == 200
    assert client.get("/agenda/eventos?desde=2027-06-01&hasta=2027-07-01").json() == []
    init_db()
    assert client.get("/agenda/eventos?desde=2027-06-01&hasta=2027-07-01").json() == []
    assert client.get("/agenda/eventos?desde=2027-02-03&hasta=2027-02-03").json()[0]["id"] == surviving["id"]


@pytest.mark.integration
def test_serie_tareas_extiende_y_detenerla_persiste(client):
    start = date.today() - timedelta(days=120)
    head = client.post("/agenda/tareas", json={
        "titulo": "Caminar", "fecha_opcional": start.isoformat(),
        "se_repite": True, "regla_repeticion": '{"frecuencia":"diario"}',
    }).json()
    tasks = client.get("/agenda/tareas").json()
    today = date.today().isoformat()
    assert any(task["fecha_opcional"] == today and task["serie_id"] == head["id"] for task in tasks)
    future_day = (date.today() + timedelta(days=180)).isoformat()
    future = client.get(f"/agenda/tareas?hasta={future_day}").json()
    assert any(task["fecha_opcional"] == future_day and task["serie_id"] == head["id"] for task in future)
    last = max((task for task in future if task["serie_id"] == head["id"]), key=lambda task: task["fecha_opcional"])
    assert client.delete(f"/agenda/tareas/{last['id']}").status_code == 200
    assert all(task["id"] != last["id"] for task in client.get("/agenda/tareas").json())

    assert client.delete(f"/agenda/series/tarea/{head['id']}").status_code == 200
    init_db()
    after = client.get("/agenda/tareas").json()
    assert all(not task["serie_activa"] for task in after if task["id"] == head["id"] or task["serie_id"] == head["id"])
    assert all(task["id"] != last["id"] for task in after)


@pytest.mark.integration
def test_detener_serie_valida_tipo_y_existencia(client):
    """Cubre las ramas de error de DELETE /agenda/series/{tipo}/{serie_id}.

    Regresion: el endpoint llamaba a agenda_detener_serie sin importarlo desde
    app.db.crud, asi que cualquier request valida reventaba con NameError.
    """
    # Tipo de serie invalido -> 422, sin tocar la DB
    assert client.delete("/agenda/series/habito/1").status_code == 422

    # Serie inexistente -> 404 (la rama llega a crud, no a un NameError)
    assert client.delete("/agenda/series/evento/999999").status_code == 404
    assert client.delete("/agenda/series/tarea/999999").status_code == 404

    # Serie real: se detiene una sola vez; el segundo intento ya no la encuentra activa
    head = client.post("/agenda/eventos", json={
        "titulo": "Semanal", "fecha_inicio": "2026-09-23T10:00:00",
        "se_repite": True, "regla_repeticion": '{"frecuencia":"semanal"}',
    }).json()
    assert client.delete(f"/agenda/series/evento/{head['id']}").status_code == 200
    assert client.delete(f"/agenda/series/evento/{head['id']}").status_code == 404


@pytest.mark.integration
def test_reasignar_calendario_conserva_extension_y_eliminarlo_la_detiene(client):
    origin = client.post("/agenda/calendarios", json={"nombre": "Origen"}).json()
    destination = client.post("/agenda/calendarios", json={"nombre": "Destino"}).json()
    head = client.post("/agenda/eventos", json={
        "titulo": "Clase", "fecha_inicio": "2026-09-23T10:00:00",
        "calendario_id": origin["id"], "se_repite": True,
        "regla_repeticion": '{"frecuencia":"semanal"}',
    }).json()
    moved = client.patch(f"/agenda/calendarios/{origin['id']}/reasignar-eventos?destino_id={destination['id']}")
    assert moved.status_code == 200
    assert client.delete(f"/agenda/calendarios/{origin['id']}").status_code == 200
    future = client.get("/agenda/eventos?desde=2027-02-03&hasta=2027-02-03").json()
    assert len(future) == 1
    assert future[0]["serie_id"] == head["id"]
    assert future[0]["calendario_id"] == destination["id"]

    assert client.delete(f"/agenda/calendarios/{destination['id']}").status_code == 200
    init_db()
    assert client.get("/agenda/eventos?desde=2027-06-02&hasta=2027-06-02").json() == []


@pytest.mark.integration
def test_borrar_lista_no_reactiva_serie_si_cabeza_se_movio(client):
    first = client.post("/agenda/listas", json={"nombre": "Original"}).json()
    second = client.post("/agenda/listas", json={"nombre": "Otra"}).json()
    head = client.post("/agenda/tareas", json={
        "titulo": "Rutina", "fecha_opcional": "2026-09-23",
        "lista_id": first["id"], "se_repite": True,
        "regla_repeticion": '{"frecuencia":"diario"}',
    }).json()
    assert client.patch(f"/agenda/tareas/{head['id']}", json={"lista_id": second["id"]}).status_code == 200
    assert client.delete(f"/agenda/listas/{first['id']}").status_code == 200
    init_db()
    tasks = client.get("/agenda/tareas").json()
    assert len(tasks) == 1
    assert tasks[0]["id"] == head["id"]
    assert tasks[0]["serie_activa"] is False


@pytest.mark.integration
def test_borrar_todas_las_ocurrencias_detiene_la_serie(client):
    head = client.post("/agenda/eventos", json={
        "titulo": "Serie corta", "fecha_inicio": "2026-09-23T10:00:00",
        "se_repite": True,
        "regla_repeticion": '{"frecuencia":"semanal","hasta":"2026-10-07"}',
    }).json()
    events = client.get("/agenda/eventos?desde=2026-09-23&hasta=2026-10-07").json()
    assert len(events) == 3
    for event in events:
        assert client.delete(f"/agenda/eventos/{event['id']}").status_code == 200
    conn = get_connection()
    active = conn.execute("SELECT activa FROM agenda_series WHERE tipo = 'evento' AND serie_id = ?", (head["id"],)).fetchone()[0]
    conn.close()
    assert active == 0
    init_db()
    assert client.get("/agenda/eventos?desde=2026-09-23&hasta=2026-12-31").json() == []


@pytest.mark.integration
def test_revision_cuenta_ocurrencias_y_duracion_entre_dias(client):
    response = client.post("/agenda/eventos", json={
        "titulo": "Turno nocturno", "fecha_inicio": "2026-09-23T22:00:00",
        "fecha_fin": "2026-09-24T01:00:00", "se_repite": True,
        "regla_repeticion": '{"frecuencia":"semanal"}',
    })
    assert response.status_code == 200
    summary = client.get("/agenda/revision?desde=2026-09-23&hasta=2026-09-30").json()
    assert summary["total_eventos"] == 2
    assert sum(cal["minutos"] for cal in summary["por_calendario"]) == 360
