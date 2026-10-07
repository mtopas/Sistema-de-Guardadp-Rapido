"""Contrato agregado del primer slice móvil web."""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client(tmp_app_db):
    return TestClient(app)


@pytest.mark.integration
def test_mobile_hoy_agrega_solo_datos_accionables(client):
    fecha = "2026-10-07"
    lista = client.post("/agenda/listas", json={"nombre": "Personal", "color": "#f97316"}).json()
    client.post("/agenda/eventos", json={
        "titulo": "Bloque tarde",
        "fecha_inicio": f"{fecha}T14:00:00",
        "fecha_fin": f"{fecha}T15:00:00",
    })
    client.post("/agenda/eventos", json={
        "titulo": "Bloque pasado",
        "fecha_inicio": f"{fecha}T09:00:00",
    })
    client.post("/agenda/tareas", json={
        "titulo": "Bloque de tarea",
        "fecha_opcional": fecha,
        "hora_bloque": "11:00",
        "lista_id": lista["id"],
    })
    for titulo, fecha_tarea in (
        ("Vencida", "2026-10-06"),
        ("Hoy", fecha),
        ("Mañana", "2026-10-08"),
        ("Sin fecha", None),
    ):
        client.post("/agenda/tareas", json={"titulo": titulo, "fecha_opcional": fecha_tarea})

    pendiente = client.post("/habitos", json={"nombre": "Leer", "frecuencia_tipo": "diario"}).json()
    completo = client.post("/habitos", json={"nombre": "Agua", "frecuencia_tipo": "diario"}).json()
    client.put(f"/habitos/{completo['id']}/registro", json={"fecha": fecha, "valor": 1})

    cuenta = client.post("/fin/cuentas", json={
        "nombre": "Billetera",
        "tipo": "wallet",
        "saldo_ars": -2500,
    })
    assert cuenta.status_code == 200

    response = client.get(f"/mobile/hoy?fecha={fecha}&hora=10:00")

    assert response.status_code == 200
    body = response.json()
    assert body["fecha"] == fecha
    assert body["proximo_bloque"]["titulo"] == "Bloque de tarea"
    assert body["proximo_bloque"]["hora"] == "11:00"
    assert [tarea["titulo"] for tarea in body["tareas"]] == ["Vencida", "Bloque de tarea", "Hoy"]
    assert body["tareas"][0]["vencida"] is True
    assert [habito["id"] for habito in body["habitos_pendientes"]] == [pendiente["id"]]
    assert body["alertas_financieras"] == [{
        "tipo": "saldo_negativo",
        "cuenta_id": cuenta.json()["id"],
        "cuenta": "Billetera",
        "moneda": "ARS",
        "monto": -2500.0,
    }]


@pytest.mark.integration
def test_mobile_hoy_normaliza_saldos_antes_de_alertar(client):
    residuo = client.post("/fin/cuentas", json={
        "nombre": "Brubank",
        "tipo": "bank",
        "saldo_ars": -1.8189894035458565e-11,
    }).json()
    centavo = client.post("/fin/cuentas", json={
        "nombre": "Cuenta con descubierto",
        "tipo": "bank",
        "saldo_ars": -0.01,
    }).json()

    response = client.get("/mobile/hoy?fecha=2026-10-07&hora=10:00")

    assert response.status_code == 200
    assert response.json()["alertas_financieras"] == [{
        "tipo": "saldo_negativo",
        "cuenta_id": centavo["id"],
        "cuenta": "Cuenta con descubierto",
        "moneda": "ARS",
        "monto": -0.01,
    }]
    assert residuo["ars"] == pytest.approx(-1.8189894035458565e-11)


@pytest.mark.integration
def test_mobile_hoy_valida_fecha_y_hora(client):
    response = client.get("/mobile/hoy?fecha=07-10-2026&hora=ahora")
    assert response.status_code == 422
    assert "YYYY-MM-DD" in response.json()["detail"]


@pytest.mark.integration
def test_mobile_hoy_vacio_conserva_contrato(client):
    response = client.get("/mobile/hoy?fecha=2026-10-07&hora=23:59")
    assert response.status_code == 200
    assert response.json() == {
        "fecha": "2026-10-07",
        "proximo_bloque": None,
        "tareas": [],
        "habitos_pendientes": [],
        "alertas_financieras": [],
    }
