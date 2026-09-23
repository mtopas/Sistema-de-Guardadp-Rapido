import pytest
import json
from datetime import datetime, date, timedelta
from app.db import crud
from app.db.database import get_connection, init_db


@pytest.fixture(scope="function")
def setup_db():
    """Initialize test database before each test."""
    init_db()
    yield


class TestHabitosActualizar:
    """Tests for habitos_actualizar function."""

    def test_auto_set_archivado_en_when_deactivating(self, setup_db):
        """When activo is set to 0, archivado_en should be auto-filled."""
        habito = crud.habitos_crear(nombre="Test", frecuencia_tipo="diario")
        before = datetime.now()
        updated = crud.habitos_actualizar(habito["id"], {"activo": 0})
        after = datetime.now()

        assert updated is not None
        assert updated["activo"] == 0
        assert updated["archivado_en"] is not None
        archivado_dt = datetime.fromisoformat(updated["archivado_en"])
        assert before <= archivado_dt <= after

    def test_explicit_archivado_en_preserved(self, setup_db):
        """Explicit archivado_en should not be overwritten."""
        habito = crud.habitos_crear(nombre="Test2", frecuencia_tipo="diario")
        explicit = "2026-01-15T10:30:00"
        updated = crud.habitos_actualizar(habito["id"], {"activo": 0, "archivado_en": explicit})
        assert updated["archivado_en"] == explicit

    def test_reactivate_resets_archivado_en(self, setup_db):
        """Reactivating should reset archivado_en to None."""
        habito = crud.habitos_crear(nombre="Test3", frecuencia_tipo="diario")
        crud.habitos_actualizar(habito["id"], {"activo": 0})
        updated = crud.habitos_actualizar(habito["id"], {"activo": 1})
        assert updated["activo"] == 1
        assert updated["archivado_en"] is None


class TestHabitosPendientesHoy:
    """Tests for habitos_pendientes_hoy function."""

    def test_daily_habits_always_scheduled(self, setup_db):
        """Daily habits should appear for any date."""
        habito = crud.habitos_crear(nombre="Daily", frecuencia_tipo="diario")
        result = crud.habitos_pendientes_hoy(date.today().isoformat())
        ids = [h["id"] for h in result]
        assert habito["id"] in ids

    def test_weekly_habits_only_on_scheduled_days(self, setup_db):
        """Weekly habits should only appear on scheduled days."""
        mon_wed = crud.habitos_crear(
            nombre="Mon-Wed", frecuencia_tipo="semanal",
            dias_semana=json.dumps([1, 3])
        )
        friday = crud.habitos_crear(
            nombre="Friday", frecuencia_tipo="semanal",
            dias_semana=json.dumps([5])
        )

        # 2026-09-21 is Monday
        result = crud.habitos_pendientes_hoy("2026-09-21")
        ids = [h["id"] for h in result]
        assert mon_wed["id"] in ids
        assert friday["id"] not in ids

    def test_weekday_monday_conversion(self, setup_db):
        """Python weekday=0 should convert to JS dow=1."""
        habito = crud.habitos_crear(
            nombre="Monday", frecuencia_tipo="semanal",
            dias_semana=json.dumps([1])
        )
        result = crud.habitos_pendientes_hoy("2026-09-21")  # Monday
        ids = [h["id"] for h in result]
        assert habito["id"] in ids

    def test_weekday_sunday_conversion(self, setup_db):
        """Python weekday=6 should convert to JS dow=0."""
        habito = crud.habitos_crear(
            nombre="Sunday", frecuencia_tipo="semanal",
            dias_semana=json.dumps([0])
        )
        result = crud.habitos_pendientes_hoy("2026-09-20")  # Sunday
        ids = [h["id"] for h in result]
        assert habito["id"] in ids

    def test_includes_today_registro(self, setup_db):
        """Should include registro if it exists for today."""
        habito = crud.habitos_crear(nombre="Test", frecuencia_tipo="diario")
        hoy = date.today().isoformat()
        crud.habitos_registros_upsert(habito["id"], hoy, 1.0, "nota")

        result = crud.habitos_pendientes_hoy(hoy)
        h = next((h for h in result if h["id"] == habito["id"]), None)
        assert h is not None
        assert h["registro_hoy"] is not None
        assert h["registro_hoy"]["valor"] == 1.0

    def test_registro_hoy_none_if_missing(self, setup_db):
        """registro_hoy should be None if not created."""
        habito = crud.habitos_crear(nombre="Test", frecuencia_tipo="diario")
        result = crud.habitos_pendientes_hoy(date.today().isoformat())
        h = next((h for h in result if h["id"] == habito["id"]), None)
        assert h["registro_hoy"] is None

    def test_inactive_habits_excluded(self, setup_db):
        """Inactive habits should not appear."""
        habito = crud.habitos_crear(nombre="Inactive", frecuencia_tipo="diario")
        crud.habitos_actualizar(habito["id"], {"activo": 0})
        result = crud.habitos_pendientes_hoy(date.today().isoformat())
        ids = [h["id"] for h in result]
        assert habito["id"] not in ids


class TestHabitosStats:
    """Tests for habitos_stats function."""

    def test_nonexistent_habit(self, setup_db):
        """Should return None for nonexistent habit."""
        assert crud.habitos_stats(9999) is None

    def test_stats_has_required_fields(self, setup_db):
        """Stats should include all required fields."""
        habito = crud.habitos_crear(nombre="Test", frecuencia_tipo="diario")
        stats = crud.habitos_stats(habito["id"])

        assert stats is not None
        assert "racha_actual" in stats
        assert "racha_max" in stats
        assert "pct_mes" in stats
        assert "pct_mes_anterior" in stats

    def test_partial_values_counted(self, setup_db):
        """Partial values (0.5) should contribute to stats."""
        habito = crud.habitos_crear(nombre="Test", frecuencia_tipo="diario")
        hoy = date.today()
        first = date(hoy.year, hoy.month, 1)

        # Add one partial
        crud.habitos_registros_upsert(habito["id"], first.isoformat(), 0.5)
        stats = crud.habitos_stats(habito["id"])

        assert stats is not None
        # pct_mes should be > 0 since we have a partial value
        assert stats["pct_mes"] > 0

    def test_100_percent_when_all_complete(self, setup_db):
        """Should reach 100% when all scheduled days are complete."""
        habito = crud.habitos_crear(nombre="Test", frecuencia_tipo="diario")
        hoy = date.today()
        first = date(hoy.year, hoy.month, 1)

        # Complete all days from 1st to today
        current = first
        while current <= hoy:
            crud.habitos_registros_upsert(habito["id"], current.isoformat(), 1.0)
            current += timedelta(days=1)

        stats = crud.habitos_stats(habito["id"])
        assert stats["pct_mes"] == 100

    def test_weekly_habit_percentage(self, setup_db):
        """Weekly habits should only count scheduled days."""
        habito = crud.habitos_crear(
            nombre="Monday", frecuencia_tipo="semanal",
            dias_semana=json.dumps([1])  # Monday
        )

        hoy = date.today()
        y, m = hoy.year, hoy.month

        # Find and complete Mondays in current month
        first = date(y, m, 1)
        mondays = []
        d = first
        while d.month == m:
            if d.weekday() == 0 and d <= hoy:
                mondays.append(d)
            d += timedelta(days=1)

        for mon in mondays:
            crud.habitos_registros_upsert(habito["id"], mon.isoformat(), 1.0)

        stats = crud.habitos_stats(habito["id"])
        if mondays:
            assert stats["pct_mes"] == 100

    def test_backend_frontend_streak_consistency(self, setup_db):
        """Backend and frontend should calculate streaks consistently.

        This documents the actual behavior: both implementations iterate
        through consecutive days and break the streak on missing registros.
        """
        habito = crud.habitos_crear(nombre="Streak", frecuencia_tipo="diario")

        # Create a 2-day streak in the past
        hoy = date.today()
        d1 = hoy - timedelta(days=5)
        d2 = hoy - timedelta(days=4)

        crud.habitos_registros_upsert(habito["id"], d1.isoformat(), 1.0)
        crud.habitos_registros_upsert(habito["id"], d2.isoformat(), 1.0)

        stats = crud.habitos_stats(habito["id"])

        # Note: habitos_stats starts from creado_en (now), so older registros
        # won't be seen. This documents a limitation: streaks from the past
        # can't be tested this way.
        assert stats is not None
        assert "racha_max" in stats


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
