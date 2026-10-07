"""Lectura de proyectos desde la sección activa de la Bóveda."""

from jarvis.db.database import get_connection
from jarvis.projects import service as projects_service


def test_read_vault_project_section_preserves_content_and_provenance(tmp_jarvis_db, tmp_path, monkeypatch):
    vault_root = tmp_path / "Boveda"
    section = vault_root / "01 - Proyectos"
    section.mkdir(parents=True)
    (section / "README.md").write_text("# documentación estructural", encoding="utf-8")
    note = section / "Proyecto SGR.md"
    note.write_text(
        "---\n"
        "id: proyecto-sgr\n"
        "tipo: texto\n"
        "actualizado_en: 2026-10-07T10:00:00-03:00\n"
        "origen: manual\n"
        "tags: [sgr, jarvis]\n"
        "---\n"
        "# Proyecto SGR\n\nContenido vigente del proyecto.\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(projects_service, "JARVIS_BOVEDA_PATH", vault_root)

    conn = get_connection()
    before = conn.execute("SELECT COUNT(*) FROM memory_projects").fetchone()[0]
    conn.close()
    result = projects_service.read_vault_project_section()
    conn = get_connection()
    after = conn.execute("SELECT COUNT(*) FROM memory_projects").fetchone()[0]
    conn.close()

    assert result["status"] == "available"
    assert result["source_path"] == "Bóveda/01 - Proyectos"
    assert len(result["notes"]) == 1
    assert result["notes"][0]["source_id"] == "proyecto-sgr"
    assert result["notes"][0]["source_path"] == "01 - Proyectos/Proyecto SGR.md"
    assert result["notes"][0]["title"] == "Proyecto SGR"
    assert "Contenido vigente" in result["notes"][0]["content"]
    assert result["notes"][0]["tags"] == ["sgr", "jarvis"]
    assert after == before


def test_read_vault_project_section_returns_empty_for_available_empty_section(tmp_path, monkeypatch):
    vault_root = tmp_path / "Boveda"
    (vault_root / "01 - Proyectos").mkdir(parents=True)
    monkeypatch.setattr(projects_service, "JARVIS_BOVEDA_PATH", vault_root)

    result = projects_service.read_vault_project_section()

    assert result["status"] == "empty"
    assert result["notes"] == []
    assert result["source"] == "vault"


def test_read_vault_project_section_falls_back_when_mount_is_unavailable(tmp_path, monkeypatch):
    monkeypatch.setattr(projects_service, "JARVIS_BOVEDA_PATH", tmp_path / "mount-caido")

    result = projects_service.read_vault_project_section()

    assert result["status"] == "unavailable"
    assert result["notes"] == []
    assert result["reason"]
    assert result["source_path"] == "Bóveda/01 - Proyectos"
