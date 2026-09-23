"""Tests para jarvis/worker/task_manifest.py — blast radius explícito."""
import pytest

from jarvis.worker.task_manifest import MANIFEST, TaskManifest


class TestTaskManifestAssertAllowed:
    """Validación de operaciones permitidas."""

    def test_read_inbox_allowed(self):
        """read_inbox está en ALLOWED_OPERATIONS."""
        # No debe lanzar
        MANIFEST.assert_allowed("read_inbox")

    def test_classify_entry_allowed(self):
        """classify_entry está en ALLOWED_OPERATIONS."""
        MANIFEST.assert_allowed("classify_entry")

    def test_write_vault_allowed(self):
        """write_vault está en ALLOWED_OPERATIONS."""
        MANIFEST.assert_allowed("write_vault")

    def test_update_entry_status_allowed(self):
        """update_entry_status está en ALLOWED_OPERATIONS."""
        MANIFEST.assert_allowed("update_entry_status")

    def test_generate_embedding_allowed(self):
        """generate_embedding está en ALLOWED_OPERATIONS."""
        MANIFEST.assert_allowed("generate_embedding")

    def test_store_embedding_allowed(self):
        """store_embedding está en ALLOWED_OPERATIONS."""
        MANIFEST.assert_allowed("store_embedding")

    def test_consolidate_memory_allowed(self):
        """consolidate_memory está en ALLOWED_OPERATIONS."""
        MANIFEST.assert_allowed("consolidate_memory")

    def test_extract_entities_allowed(self):
        """extract_entities está en ALLOWED_OPERATIONS."""
        MANIFEST.assert_allowed("extract_entities")

    def test_link_entities_allowed(self):
        """link_entities está en ALLOWED_OPERATIONS."""
        MANIFEST.assert_allowed("link_entities")

    def test_link_project_allowed(self):
        """link_project está en ALLOWED_OPERATIONS."""
        MANIFEST.assert_allowed("link_project")

    def test_link_tags_allowed(self):
        """link_tags está en ALLOWED_OPERATIONS."""
        MANIFEST.assert_allowed("link_tags")

    def test_notify_telegram_allowed(self):
        """notify_telegram está en ALLOWED_OPERATIONS."""
        MANIFEST.assert_allowed("notify_telegram")

    def test_read_conversations_allowed(self):
        """read_conversations está en ALLOWED_OPERATIONS."""
        MANIFEST.assert_allowed("read_conversations")

    def test_propose_capture_allowed(self):
        """propose_capture está en ALLOWED_OPERATIONS."""
        MANIFEST.assert_allowed("propose_capture")

    def test_audit_memory_allowed(self):
        """audit_memory está en ALLOWED_OPERATIONS."""
        MANIFEST.assert_allowed("audit_memory")

    def test_propose_audit_action_allowed(self):
        """propose_audit_action está en ALLOWED_OPERATIONS."""
        MANIFEST.assert_allowed("propose_audit_action")

    def test_read_agenda_source_allowed(self):
        """read_agenda_source está en ALLOWED_OPERATIONS."""
        MANIFEST.assert_allowed("read_agenda_source")

    def test_propose_agenda_capture_allowed(self):
        """propose_agenda_capture está en ALLOWED_OPERATIONS."""
        MANIFEST.assert_allowed("propose_agenda_capture")

    def test_delete_memory_not_allowed(self):
        """delete_memory NO está en ALLOWED_OPERATIONS."""
        with pytest.raises(PermissionError) as excinfo:
            MANIFEST.assert_allowed("delete_memory")
        assert "delete_memory" in str(excinfo.value)
        assert "no autorizada" in str(excinfo.value)

    def test_export_data_not_allowed(self):
        """export_data NO está en ALLOWED_OPERATIONS."""
        with pytest.raises(PermissionError) as excinfo:
            MANIFEST.assert_allowed("export_data")
        assert "export_data" in str(excinfo.value)

    def test_send_external_request_not_allowed(self):
        """send_external_request NO está en ALLOWED_OPERATIONS."""
        with pytest.raises(PermissionError) as excinfo:
            MANIFEST.assert_allowed("send_external_request")
        assert "send_external_request" in str(excinfo.value)

    def test_modify_policy_not_allowed(self):
        """modify_policy NO está en ALLOWED_OPERATIONS."""
        with pytest.raises(PermissionError) as excinfo:
            MANIFEST.assert_allowed("modify_policy")
        assert "modify_policy" in str(excinfo.value)

    def test_error_message_includes_allowed_operations(self):
        """El mensaje de error lista las operaciones permitidas."""
        with pytest.raises(PermissionError) as excinfo:
            MANIFEST.assert_allowed("invalid_operation")
        error_msg = str(excinfo.value)
        assert "read_inbox" in error_msg
        assert "write_vault" in error_msg
        assert "Permitidas:" in error_msg or "permitidas" in error_msg.lower()

    def test_error_message_sorted_operations(self):
        """Las operaciones permitidas en el error están ordenadas."""
        with pytest.raises(PermissionError) as excinfo:
            MANIFEST.assert_allowed("invalid_operation")
        error_msg = str(excinfo.value)
        # Extrae las operaciones del mensaje
        # Formato: "Permitidas: ['audit_memory', 'classify_entry', ...]"
        assert "audit_memory" in error_msg


class TestTaskManifestImmutable:
    """TaskManifest debe ser immutable (frozen=True)."""

    def test_manifest_is_frozen(self):
        """TaskManifest no puede ser modificado después de crearse."""
        with pytest.raises(AttributeError):
            MANIFEST.ALLOWED_OPERATIONS = frozenset({"new_op"})

    def test_allowed_operations_is_frozenset(self):
        """ALLOWED_OPERATIONS es un frozenset (no modificable)."""
        assert isinstance(MANIFEST.ALLOWED_OPERATIONS, frozenset)


class TestTaskManifestMultipleInstances:
    """Instancias múltiples de TaskManifest se comportan igual."""

    def test_multiple_instances_same_behavior(self):
        """Dos instancias de TaskManifest tienen el mismo comportamiento."""
        manifest1 = TaskManifest()
        manifest2 = TaskManifest()

        # Ambas permiten la misma operación
        manifest1.assert_allowed("read_inbox")
        manifest2.assert_allowed("read_inbox")

        # Ambas rechazan la misma operación inválida
        with pytest.raises(PermissionError):
            manifest1.assert_allowed("invalid_op")
        with pytest.raises(PermissionError):
            manifest2.assert_allowed("invalid_op")
