"""Tests para jarvis/entities/service.py — extracción y vinculación de entidades."""
import json

import pytest

from jarvis.config import JARVIS_DEFAULT_USER
from jarvis.entities.service import (
    _find_or_create_entity,
    _has_alias,
    _is_unambiguous_alias_match,
    _parse_aliases,
)
from jarvis.db.database import get_connection


class TestParseAliases:
    """Parsing de aliases JSON."""

    def test_parse_empty_aliases(self):
        assert _parse_aliases(None) == []
        assert _parse_aliases("") == []

    def test_parse_valid_json_array(self):
        aliases_json = json.dumps(["Martín", "Marty"])
        assert _parse_aliases(aliases_json) == ["Martín", "Marty"]

    def test_parse_invalid_json_returns_empty(self):
        assert _parse_aliases("invalid json") == []
        assert _parse_aliases("{") == []


class TestHasAlias:
    """Búsqueda de alias case-insensitive."""

    def test_alias_found_exact_case(self):
        aliases_json = json.dumps(["Martín", "Martin"])
        assert _has_alias(aliases_json, "Martín") is True

    def test_alias_found_different_case(self):
        aliases_json = json.dumps(["Martín", "Martin"])
        assert _has_alias(aliases_json, "martin") is True

    def test_alias_not_found(self):
        aliases_json = json.dumps(["Martín", "Martin"])
        assert _has_alias(aliases_json, "José") is False

    def test_empty_aliases_no_match(self):
        assert _has_alias(None, "Martín") is False


class TestIsUnambiguousAliasMatch:
    """Fusión conservadora por prefijo de tokens."""

    def test_single_token_matches_first_token(self):
        # "Martín" es prefijo de "Martín López"
        assert _is_unambiguous_alias_match("Martín", "Martín López") is True

    def test_single_token_reverse_match(self):
        # "Martín López" contiene "Martín" como primer token
        assert _is_unambiguous_alias_match("Martín López", "Martín") is True

    def test_multiple_tokens_prefix_match(self):
        # "Martín López" es prefijo de "Martín López García"
        assert _is_unambiguous_alias_match("Martín López", "Martín López García") is True

    def test_no_match_different_first_token(self):
        # "José" no es "Martín"
        assert _is_unambiguous_alias_match("José", "Martín López") is False

    def test_no_match_if_first_token_different_with_descriptor(self):
        # "el Martín" (primer token "el") no matchea "Martín López" (primer token "martín")
        assert _is_unambiguous_alias_match("el Martín", "Martín López") is False

    def test_case_insensitive_match(self):
        assert _is_unambiguous_alias_match("martín", "MARTÍN LÓPEZ") is True

    def test_whitespace_trimmed(self):
        assert _is_unambiguous_alias_match("  Martín  ", "  Martín López  ") is True

    def test_short_name_not_matched(self):
        # Nombre muy corto (< 2 caracteres en el primer token) no se matchea
        assert _is_unambiguous_alias_match("A", "A López") is False

    def test_empty_name_not_matched(self):
        assert _is_unambiguous_alias_match("", "Martín López") is False

    def test_empty_existing_name_not_matched(self):
        assert _is_unambiguous_alias_match("Martín", "") is False


class TestFindOrCreateEntity:
    """Creación y fusión de entidades."""

    def test_create_new_entity(self, tmp_jarvis_db):
        """Crea una entidad nueva si no existe."""
        entity_id = _find_or_create_entity(
            "Martín López",
            "person",
            JARVIS_DEFAULT_USER,
            "2026-09-23T12:00:00Z",
        )
        assert entity_id is not None
        assert len(entity_id) == 36  # UUID

        # Verifica que se creó en la DB
        conn = get_connection()
        try:
            row = conn.execute(
                "SELECT name, aliases FROM memory_entities WHERE entity_id = ?",
                (entity_id,),
            ).fetchone()
            assert row is not None
            assert row["name"] == "Martín López"
            assert _parse_aliases(row["aliases"]) == []
        finally:
            conn.close()

    def test_exact_match_returns_existing(self, tmp_jarvis_db):
        """Match exacto (case-insensitive) devuelve la entidad existente."""
        # Crea la primera vez
        entity_id1 = _find_or_create_entity(
            "Martín López",
            "person",
            JARVIS_DEFAULT_USER,
            "2026-09-23T12:00:00Z",
        )
        # Busca con diferente caso (mismo nombre, tildes igual)
        entity_id2 = _find_or_create_entity(
            "MARTÍN LÓPEZ",
            "person",
            JARVIS_DEFAULT_USER,
            "2026-09-23T13:00:00Z",
        )
        assert entity_id1 == entity_id2

    def test_alias_match_returns_existing(self, tmp_jarvis_db):
        """Si el nombre está en aliases, devuelve la entidad existente."""
        # Crea entidad con alias
        conn = get_connection()
        entity_id1 = "test-entity-1"
        now = "2026-09-23T12:00:00Z"
        try:
            with conn:
                conn.execute(
                    """INSERT INTO memory_entities
                       (entity_id, name, aliases, entity_type, user_id, first_seen, last_seen)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (
                        entity_id1,
                        "Martín López",
                        json.dumps(["Marty"], ensure_ascii=False),
                        "person",
                        JARVIS_DEFAULT_USER,
                        now,
                        now,
                    ),
                )
        finally:
            conn.close()

        # Busca por alias
        entity_id2 = _find_or_create_entity(
            "Marty",
            "person",
            JARVIS_DEFAULT_USER,
            "2026-09-23T13:00:00Z",
        )
        assert entity_id1 == entity_id2

    def test_unambiguous_prefix_match_fuses(self, tmp_jarvis_db):
        """Prefijo único de tokens causa fusión y agrega alias."""
        # Crea "Martín López"
        entity_id1 = _find_or_create_entity(
            "Martín López",
            "person",
            JARVIS_DEFAULT_USER,
            "2026-09-23T12:00:00Z",
        )

        # Busca "Martín" (prefijo único)
        entity_id2 = _find_or_create_entity(
            "Martín",
            "person",
            JARVIS_DEFAULT_USER,
            "2026-09-23T13:00:00Z",
        )

        # Debe fusionarse con la misma entidad
        assert entity_id1 == entity_id2

        # Verifica que "Martín" se agregó como alias
        conn = get_connection()
        try:
            row = conn.execute(
                "SELECT aliases FROM memory_entities WHERE entity_id = ?",
                (entity_id1,),
            ).fetchone()
            aliases = _parse_aliases(row["aliases"])
            assert "Martín" in aliases
        finally:
            conn.close()

    def test_ambiguous_prefix_no_fuse(self, tmp_jarvis_db):
        """Con múltiples candidatos de prefijo, crea entidad nueva."""
        # Crea dos entidades con el mismo primer token
        entity_id1 = _find_or_create_entity(
            "Martín López",
            "person",
            JARVIS_DEFAULT_USER,
            "2026-09-23T12:00:00Z",
        )
        entity_id2 = _find_or_create_entity(
            "Martín Rodríguez",
            "person",
            JARVIS_DEFAULT_USER,
            "2026-09-23T12:30:00Z",
        )
        assert entity_id1 != entity_id2

        # Busca "Martín" (ambiguo: hay dos)
        entity_id3 = _find_or_create_entity(
            "Martín",
            "person",
            JARVIS_DEFAULT_USER,
            "2026-09-23T13:00:00Z",
        )

        # No debe fusionarse con ninguno, crea entidad nueva
        assert entity_id3 != entity_id1
        assert entity_id3 != entity_id2

    def test_first_token_mismatch_no_fuse(self, tmp_jarvis_db):
        """Si el primer token no coincide, no se fusiona."""
        # Crea "Martín López"
        entity_id1 = _find_or_create_entity(
            "Martín López",
            "person",
            JARVIS_DEFAULT_USER,
            "2026-09-23T12:00:00Z",
        )

        # Busca "el Martín" (primer token "el", no "martín")
        entity_id2 = _find_or_create_entity(
            "el Martín",
            "person",
            JARVIS_DEFAULT_USER,
            "2026-09-23T13:00:00Z",
        )

        # No debe fusionarse
        assert entity_id1 != entity_id2

    def test_canonical_name_never_replaced(self, tmp_jarvis_db):
        """El nombre canónico jamás se reemplaza, solo se agregan aliases."""
        # Crea "Martín López"
        entity_id1 = _find_or_create_entity(
            "Martín López",
            "person",
            JARVIS_DEFAULT_USER,
            "2026-09-23T12:00:00Z",
        )

        # Busca por prefijo "Martín López García" (más largo)
        entity_id2 = _find_or_create_entity(
            "Martín López García",
            "person",
            JARVIS_DEFAULT_USER,
            "2026-09-23T13:00:00Z",
        )

        # Se fusiona
        assert entity_id1 == entity_id2

        # Verifica que el nombre canónico sigue siendo "Martín López"
        conn = get_connection()
        try:
            row = conn.execute(
                "SELECT name, aliases FROM memory_entities WHERE entity_id = ?",
                (entity_id1,),
            ).fetchone()
            assert row["name"] == "Martín López"
            aliases = _parse_aliases(row["aliases"])
            assert "Martín López García" in aliases
        finally:
            conn.close()

    def test_separate_entity_types(self, tmp_jarvis_db):
        """Entidades de tipo distinto no se fusionan."""
        # Crea persona "Martín López"
        entity_id1 = _find_or_create_entity(
            "Martín López",
            "person",
            JARVIS_DEFAULT_USER,
            "2026-09-23T12:00:00Z",
        )

        # Busca organización "Martín López" (mismo nombre, distinto tipo)
        entity_id2 = _find_or_create_entity(
            "Martín López",
            "organization",
            JARVIS_DEFAULT_USER,
            "2026-09-23T13:00:00Z",
        )

        # Son entidades distintas
        assert entity_id1 != entity_id2

        # Verifica los tipos
        conn = get_connection()
        try:
            row1 = conn.execute(
                "SELECT entity_type FROM memory_entities WHERE entity_id = ?",
                (entity_id1,),
            ).fetchone()
            row2 = conn.execute(
                "SELECT entity_type FROM memory_entities WHERE entity_id = ?",
                (entity_id2,),
            ).fetchone()
            assert row1["entity_type"] == "person"
            assert row2["entity_type"] == "organization"
        finally:
            conn.close()

    def test_last_seen_updated_on_match(self, tmp_jarvis_db):
        """last_seen se actualiza cuando se vuelve a encontrar la entidad."""
        import datetime

        # Crea entidad
        entity_id = _find_or_create_entity(
            "Martín López",
            "person",
            JARVIS_DEFAULT_USER,
            "2026-09-23T12:00:00Z",
        )

        # Obtiene last_seen original
        conn = get_connection()
        try:
            row1 = conn.execute(
                "SELECT last_seen FROM memory_entities WHERE entity_id = ?",
                (entity_id,),
            ).fetchone()
            first_seen = row1["last_seen"]

            # Busca nuevamente con timestamp posterior
            _find_or_create_entity(
                "Martín López",
                "person",
                JARVIS_DEFAULT_USER,
                "2026-09-23T13:00:00Z",
            )

            # Verifica que last_seen se actualizó
            row2 = conn.execute(
                "SELECT last_seen FROM memory_entities WHERE entity_id = ?",
                (entity_id,),
            ).fetchone()
            assert row2["last_seen"] > first_seen
        finally:
            conn.close()
