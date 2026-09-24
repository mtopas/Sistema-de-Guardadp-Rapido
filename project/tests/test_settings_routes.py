"""Ajustes guardan cambios reales en una base de prueba aislada."""
import sqlite3
import zipfile
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import BackgroundTasks
from fastapi.testclient import TestClient

from app.config import SGR_VERSION
from app.main import app, descargar_respaldo
from app.db.database import get_connection


@pytest.fixture
def client(tmp_app_db, tmp_vault):
    return TestClient(app)


@pytest.mark.integration
def test_profile_persists_and_feedback_can_be_edited_and_deleted(client):
    assert client.put('/settings/profile', json={'nombre': '  Sol  '}).json() == {'nombre': 'Sol'}
    assert client.get('/settings/profile').json() == {'nombre': 'Sol'}

    created = client.post('/feedback', json={'contenido': 'Idea original'}).json()
    fid = created['id']
    updated = client.patch(f'/feedback/{fid}', json={'contenido': 'Idea corregida'})
    assert updated.status_code == 200
    assert updated.json()['contenido'] == 'Idea corregida'
    assert client.get('/feedback').json()[0]['contenido'] == 'Idea corregida'
    assert client.delete(f'/feedback/{fid}').status_code == 200
    assert client.get('/feedback').json() == []
    assert client.patch(f'/feedback/{fid}', json={'contenido': 'Otra'}).status_code == 404


@pytest.mark.integration
def test_status_reports_real_counts_and_remote_backup_is_forbidden(client, tmp_app_db):
    client.post('/feedback', json={'contenido': 'Primero'})
    status_file = tmp_app_db.parent / 'sync-status.json'
    status_file.write_text(
        '{"direction":"pull","ok":true,"at":"2026-09-24T12:00:00"}', encoding='utf-8-sig'
    )
    try:
        status = client.get('/settings/status').json()
        assert status['counts']['feedback'] == 1
        assert status['sync']['direction'] == 'pull'
        assert status['db_path']
        assert client.get('/settings/backup').status_code == 403
    finally:
        status_file.unlink(missing_ok=True)


@pytest.mark.integration
def test_status_reports_real_sgr_version_not_fastapi_default(client):
    """SGR_VERSION (app/config.py) debe llegar a /settings/status via FastAPI(version=...) --
    antes de esto la app quedaba con el default de FastAPI ('0.1.0' generico, sin relacion a SGR)."""
    assert app.version == SGR_VERSION
    status = client.get('/settings/status').json()
    assert status['version'] == SGR_VERSION


@pytest.mark.integration
def test_local_backup_contains_sqlite_snapshot_and_uploads(client, tmp_path, tmp_jarvis_db, monkeypatch):
    from app import main as main_module

    uploads = tmp_path / 'uploads'
    uploads.mkdir()
    (uploads / 'adjunto.txt').write_text('archivo de prueba', encoding='utf-8')
    monkeypatch.setattr(main_module, 'uploads_directory', lambda: uploads)
    client.put('/settings/profile', json={'nombre': 'Sol'})
    request = SimpleNamespace(client=SimpleNamespace(host='127.0.0.1'))
    response = descargar_respaldo(request, BackgroundTasks())
    archive_path = Path(response.path)
    try:
        with zipfile.ZipFile(archive_path) as archive:
            assert 'database/app.db' in archive.namelist()
            assert 'database/jarvis.db' in archive.namelist()
            assert archive.read('uploads/adjunto.txt') == b'archivo de prueba'
            db_copy = tmp_path / 'snapshot.db'
            db_copy.write_bytes(archive.read('database/app.db'))
        conn = sqlite3.connect(db_copy)
        assert conn.execute("SELECT valor FROM app_settings WHERE clave='display_name'").fetchone()[0] == 'Sol'
        conn.close()
    finally:
        archive_path.unlink(missing_ok=True)
