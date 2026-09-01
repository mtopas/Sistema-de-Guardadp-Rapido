"""
TaskManifest — blast radius explícito en código.

El worker de 0.1 SOLO puede hacer estas operaciones.
assert_allowed() lanza antes de cada operación, no después.
"""
from dataclasses import dataclass, field


@dataclass(frozen=True)
class TaskManifest:
    ALLOWED_OPERATIONS: frozenset = field(
        default_factory=lambda: frozenset({
            "read_inbox",
            "classify_entry",
            "write_vault",
            "update_entry_status",
            "generate_embedding",
            "store_embedding",
            "consolidate_memory",
            "extract_entities",
            "link_entities",
            "link_project",
            "link_tags",
            "notify_telegram",
            "read_conversations",
            "propose_capture",
            "audit_memory",
            "propose_audit_action",
        })
    )

    def assert_allowed(self, op: str) -> None:
        if op not in self.ALLOWED_OPERATIONS:
            raise PermissionError(
                f"[jarvis.worker] Operación no autorizada: '{op}'. "
                f"Permitidas: {sorted(self.ALLOWED_OPERATIONS)}"
            )


MANIFEST = TaskManifest()
