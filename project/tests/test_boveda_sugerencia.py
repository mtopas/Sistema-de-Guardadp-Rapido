"""Regresión T5-D (#11b): sugerencia de categoría por IA, bajo demanda.

Reusa el clasificador y el umbral del triage de Inbox de Jarvis, SIEMPRE con el
modelo local (el contenido no sale a un modelo externo), y solo sugiere -- nunca
mueve. Degrada sin error si no hay contenido suficiente o si Ollama no responde.
"""
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db import crud
from jarvis.config import JARVIS_INBOX_TRIAGE_MIN_CONTENT_CHARS
from jarvis.ingestion import inbox_triage
from jarvis.llm import client as llm_client


@pytest.fixture
def client(tmp_app_db, tmp_vault, tmp_jarvis_db):
    return TestClient(app)


# ── Umbral de contenido (compartido con el triage) ──────────────────────────

def test_contenido_insuficiente_solo_link():
    assert inbox_triage.contenido_suficiente_para_sugerir("https://ejemplo.com/una/ruta") is False


def test_contenido_insuficiente_texto_corto():
    assert inbox_triage.contenido_suficiente_para_sugerir("una nota corta") is False


def test_contenido_suficiente_texto_largo():
    largo = "palabra " * (JARVIS_INBOX_TRIAGE_MIN_CONTENT_CHARS // 4)
    assert inbox_triage.contenido_suficiente_para_sugerir(largo) is True


# ── sugerir_destino_para_hoja ───────────────────────────────────────────────

def test_sugerencia_solo_link_no_sugiere(monkeypatch):
    llamado = Mock()
    monkeypatch.setattr(llm_client, "call_llm", llamado)
    res = inbox_triage.sugerir_destino_para_hoja("https://ejemplo.com")
    assert res["suficiente"] is False
    assert res["destino"] is None
    llamado.assert_not_called()  # ni siquiera llama al modelo


def test_sugerencia_contenido_suficiente_devuelve_destino(monkeypatch):
    largo = "detalle importante del tema " * 20
    monkeypatch.setattr(llm_client, "call_llm", Mock(return_value=inbox_triage._DEST_OPTIONS[2]))
    res = inbox_triage.sugerir_destino_para_hoja(largo)
    assert res["suficiente"] is True
    assert res["destino"] == inbox_triage._DEST_OPTIONS[2]


def test_sugerencia_ollama_caido_degrada_sin_error(monkeypatch):
    largo = "detalle importante del tema " * 20
    def boom(*a, **k):
        raise ConnectionError("Ollama no responde")
    monkeypatch.setattr(llm_client, "call_llm", boom)
    res = inbox_triage.sugerir_destino_para_hoja(largo)
    assert res["suficiente"] is True
    assert res["destino"] is None  # degrada, no lanza


def test_sugerencia_no_se_devuelve_none(monkeypatch):
    largo = "detalle importante del tema " * 20
    monkeypatch.setattr(llm_client, "call_llm", Mock(return_value="NO_SE"))
    res = inbox_triage.sugerir_destino_para_hoja(largo)
    assert res["suficiente"] is True
    assert res["destino"] is None


def test_clasificador_local_usa_modelo_local(monkeypatch):
    """local_only=True fuerza JARVIS_LOCAL_MODEL (el contenido no va al externo)."""
    captura = Mock(return_value=inbox_triage._DEST_OPTIONS[0])
    monkeypatch.setattr(llm_client, "call_llm", captura)
    dest = inbox_triage.classify_destination_from_content("texto con señal clara", local_only=True)
    assert dest == inbox_triage._DEST_OPTIONS[0]
    assert captura.call_args.kwargs["model"] == llm_client.JARVIS_LOCAL_MODEL


# ── Endpoint GET /hojas/{id}/sugerir-categoria ──────────────────────────────

def test_endpoint_mapea_destino_a_categoria(client, monkeypatch):
    cat_destino = crud.crear_categoria(nombre="Salud")
    ruta_destino = next(c["ruta"] for c in crud.obtener_categorias() if c["id"] == cat_destino)
    inbox = crud.crear_categoria(nombre="Inbox")
    hid = crud.crear_hoja(contenido="Nota", categoria_id=inbox, tipo="texto",
                          apuntes="<p>cuerpo con detalle suficiente</p>")

    monkeypatch.setattr(
        inbox_triage, "sugerir_destino_para_hoja",
        lambda contenido: {"suficiente": True, "destino": ruta_destino},
    )
    r = client.get(f"/hojas/{hid}/sugerir-categoria")
    assert r.status_code == 200
    data = r.json()
    assert data["categoria_id"] == cat_destino
    assert data["categoria_nombre"] == "Salud"


def test_endpoint_sin_descripcion(client, monkeypatch):
    inbox = crud.crear_categoria(nombre="Inbox")
    hid = crud.crear_hoja(contenido="Link", categoria_id=inbox, tipo="link")
    monkeypatch.setattr(
        inbox_triage, "sugerir_destino_para_hoja",
        lambda contenido: {"suficiente": False, "destino": None, "motivo": "falta descripción o resumen para sugerir"},
    )
    r = client.get(f"/hojas/{hid}/sugerir-categoria")
    assert r.status_code == 200
    data = r.json()
    assert data["suficiente"] is False
    assert data["categoria_id"] is None


def test_endpoint_jarvis_caido_no_rompe(client, monkeypatch):
    inbox = crud.crear_categoria(nombre="Inbox")
    hid = crud.crear_hoja(contenido="Nota", categoria_id=inbox, tipo="texto",
                          apuntes="<p>cuerpo</p>")
    def boom(contenido):
        raise RuntimeError("jarvis no disponible")
    monkeypatch.setattr(inbox_triage, "sugerir_destino_para_hoja", boom)
    r = client.get(f"/hojas/{hid}/sugerir-categoria")
    assert r.status_code == 200
    assert r.json()["error"] == "no_disponible"


def test_endpoint_hoja_inexistente_da_404(client):
    r = client.get("/hojas/99999/sugerir-categoria")
    assert r.status_code == 404
