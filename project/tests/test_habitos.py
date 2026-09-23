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
    # Cleanup is handled by in-memory DB


class TestHabitosActualizar:
    """Tests for habitos_actualizar function."""

    def test_auto_set_archivado_en_when_deactivating(self, setup_db):
        """When activo is set to 0, archivado_en should be auto-filled with current datetime."""
        # Create a habit first
        habito = crud.habitos_crear(
            nombre="Test Habit",
            descripcion="Testing archivado_en",
            color="#7c3aed",
            frecuencia_tipo="diario",
        )
        hid = habito["id"]

        # Deactivate without explicit archivado_en
        before_update = datetime.now()
        updated = crud.habitos_actualizar(hid, {"activo": 0})
        after_update = datetime.now()

        assert updated is not None
        assert updated["activo"] == 0
        assert updated["archivado_en"] is not None

        # archivado_en should be a recent datetime string
        archivado_dt = datetime.fromisoformat(updated["archivado_en"])
        assert before_update <= archivado_dt <= after_update

    def test_explicit_archivado_en_not_overwritten(self, setup_db):
        """If archivado_en is provided explicitly, don't overwrite it."""
        habito = crud.habitos_crear(
            nombre="Test Habit 2",
            frecuencia_tipo="diario",
        )
        hid = habito["id"]

        explicit_fecha = "2026-01-15T10:30:00"
        updated = crud.habitos_actualizar(hid, {"activo": 0, "archivado_en": explicit_fecha})

        assert updated is not None
        assert updated["archivado_en"] == explicit_fecha

    def test_reset_archivado_en_when_reactivating(self, setup_db):
        """When activo is set to 1, archivado_en should be reset to None."""
        habito = crud.habitos_crear(
            nombre="Test Habit 3",
            frecuencia_tipo="diario",
        )
        hid = habito["id"]

        # First deactivate
        crud.habitos_actualizar(hid, {"activo": 0})

        # Then reactivate
        updated = crud.habitos_actualizar(hid, {"activo": 1})

        assert updated is not None
        assert updated["activo"] == 1
        assert updated["archivado_en"] is None

    def test_update_other_fields_without_activo_change(self, setup_db):
        """Updating other fields shouldn't affect archivado_en."""
        habito = crud.habitos_crear(
            nombre="Test Habit 4",
            descripcion="Original",
            frecuencia_tipo="diario",
        )
        hid = habito["id"]

        # Update descripcion only
        updated = crud.habitos_actualizar(hid, {"descripcion": "Updated"})

        assert updated is not None
        assert updated["descripcion"] == "Updated"
        assert updated["archivado_en"] is None  # No change


class TestHabitosPendientesHoy:
    """Tests for habitos_pendientes_hoy function."""

    def test_returns_diario_habits_on_any_date(self, setup_db):
        """Daily habits should be returned regardless of date."""
        habito = crud.habitos_crear(
            nombre="Daily Habit",
            frecuencia_tipo="diario",
        )

        fecha_hoy = date.today().isoformat()
        result = crud.habitos_pendientes_hoy(fecha_hoy)

        ids = [h["id"] for h in result]
        assert habito["id"] in ids

    def test_returns_only_scheduled_semanal_habits(self, setup_db):
        """Weekly habits should only be returned if today is in dias_semana."""
        # Create a weekly habit for Monday and Wednesday (JS convention: 1, 3)
        habito_mw = crud.habitos_crear(
            nombre="Mon-Wed Habit",
            frecuencia_tipo="semanal",
            dias_semana=json.dumps([1, 3]),  # Monday, Wednesday
        )

        # Create a weekly habit for Fridays only (JS convention: 5)
        habito_fri = crud.habitos_crear(
            nombre="Friday Habit",
            frecuencia_tipo="semanal",
            dias_semana=json.dumps([5]),
        )

        # Use a known date: 2026-09-21 is a Monday (JS dow = 1)
        fecha_hoy = "2026-09-21"
        result = crud.habitos_pendientes_hoy(fecha_hoy)

        result_ids = [h["id"] for h in result]
        # Monday should have the Mon-Wed habit, not the Friday habit
        assert habito_mw["id"] in result_ids
        assert habito_fri["id"] not in result_ids

    def test_weekday_conversion_monday(self, setup_db):
        """Test Monday conversion: Python weekday()=0 → JS dow=(0+1)%7=1."""
        habito = crud.habitos_crear(
            nombre="Monday Test",
            frecuencia_tipo="semanal",
            dias_semana=json.dumps([1]),  # Monday in JS
        )

        # 2026-09-21 is Monday
        # In Python: date(2026, 9, 21).weekday() = 0 (Monday)
        # Conversion: (0 + 1) % 7 = 1 ✓
        fecha_hoy = "2026-09-21"
        result = crud.habitos_pendientes_hoy(fecha_hoy)

        result_ids = [h["id"] for h in result]
        assert habito["id"] in result_ids

    def test_weekday_conversion_sunday(self, setup_db):
        """Test Sunday conversion: Python weekday()=6 → JS dow=(6+1)%7=0."""
        habito = crud.habitos_crear(
            nombre="Sunday Test",
            frecuencia_tipo="semanal",
            dias_semana=json.dumps([0]),  # Sunday in JS
        )

        # 2026-09-20 is Sunday
        # In Python: date(2026, 9, 20).weekday() = 6 (Sunday)
        # Conversion: (6 + 1) % 7 = 0 ✓
        fecha_hoy = "2026-09-20"
        result = crud.habitos_pendientes_hoy(fecha_hoy)

        result_ids = [h["id"] for h in result]
        assert habito["id"] in result_ids

    def test_includes_registro_if_exists(self, setup_db):
        """Should include today's registro if it exists."""
        habito = crud.habitos_crear(
            nombre="Habit with Registro",
            frecuencia_tipo="diario",
        )

        fecha_hoy = date.today().isoformat()
        # Create a registro for today
        crud.habitos_registros_upsert(habito["id"], fecha_hoy, 1.0, "Test nota")

        result = crud.habitos_pendientes_hoy(fecha_hoy)
        h = next((h for h in result if h["id"] == habito["id"]), None)

        assert h is not None
        assert h["registro_hoy"] is not None
        assert h["registro_hoy"]["valor"] == 1.0
        assert h["registro_hoy"]["nota"] == "Test nota"

    def test_registro_hoy_none_if_not_exists(self, setup_db):
        """Should have registro_hoy=None if no registro today."""
        habito = crud.habitos_crear(
            nombre="Habit without Registro",
            frecuencia_tipo="diario",
        )

        fecha_hoy = date.today().isoformat()
        result = crud.habitos_pendientes_hoy(fecha_hoy)
        h = next((h for h in result if h["id"] == habito["id"]), None)

        assert h is not None
        assert h["registro_hoy"] is None

    def test_ignores_inactive_habits(self, setup_db):
        """Should not return inactive habits."""
        habito = crud.habitos_crear(
            nombre="Inactive Habit",
            frecuencia_tipo="diario",
        )

        # Deactivate
        crud.habitos_actualizar(habito["id"], {"activo": 0})

        fecha_hoy = date.today().isoformat()
        result = crud.habitos_pendientes_hoy(fecha_hoy)

        result_ids = [h["id"] for h in result]
        assert habito["id"] not in result_ids


class TestHabitosStats:
    """Tests for habitos_stats function."""

    def test_returns_none_for_nonexistent_habit(self, setup_db):
        """Should return None if habit doesn't exist."""
        result = crud.habitos_stats(9999)
        assert result is None

    def test_current_streak_calculation(self, setup_db):
        """Should calculate current streak backwards from today."""
        habito = crud.habitos_crear(
            nombre="Streak Test",
            frecuencia_tipo="diario",
        )

        today = date.today()
        # Create a streak: yesterday, day before, and 3 days before
        for i in range(3):
            d = today - timedelta(days=i)
            crud.habitos_registros_upsert(habito["id"], d.isoformat(), 1.0)

        stats = crud.habitos_stats(habito["id"])

        assert stats is not None
        assert stats["racha_actual"] == 3

    def test_current_streak_breaks_on_gap(self, setup_db):
        """Streak should break on a missing scheduled day."""
        habito = crud.habitos_crear(
            nombre="Streak Break Test",
            frecuencia_tipo="diario",
        )

        today = date.today()
        # Create: yesterday, 3 days ago (gap on 2 days ago)
        d_yesterday = today - timedelta(days=1)
        d_3_ago = today - timedelta(days=3)

        crud.habitos_registros_upsert(habito["id"], d_yesterday.isoformat(), 1.0)
        crud.habitos_registros_upsert(habito["id"], d_3_ago.isoformat(), 1.0)

        stats = crud.habitos_stats(habito["id"])

        assert stats is not None
        # Current streak is just yesterday (1 day)
        assert stats["racha_actual"] == 1

    def test_max_streak_calculation(self, setup_db):
        """Should calculate max streak from all registros."""
        habito = crud.habitos_crear(
            nombre="Max Streak Test",
            frecuencia_tipo="diario",
        )

        # Create a streak of 5 days
        start_date = date(2026, 9, 15)
        for i in range(5):
            d = start_date + timedelta(days=i)
            crud.habitos_registros_upsert(habito["id"], d.isoformat(), 1.0)

        stats = crud.habitos_stats(habito["id"])

        assert stats is not None
        assert stats["racha_max"] >= 5

    def test_max_streak_edge_case_ongoing_not_completed_today(self, setup_db):
        """Edge case: ongoing streak but today scheduled and not completed.

        This tests the case where the habit was scheduled every day,
        completed days 20-22, but today (23) is scheduled and NOT completed.
        Expected: racha_max should be 3 (days 20-22), not 4.
        """
        habito = crud.habitos_crear(
            nombre="Edge Case Streak",
            frecuencia_tipo="diario",
            creado_en="2026-09-20T00:00:00",
        )

        # Complete days 20, 21, 22 but NOT 23
        crud.habitos_registros_upsert(habito["id"], "2026-09-20", 1.0)
        crud.habitos_registros_upsert(habito["id"], "2026-09-21", 1.0)
        crud.habitos_registros_upsert(habito["id"], "2026-09-22", 1.0)
        # 2026-09-23 intentionally not created

        stats = crud.habitos_stats(habito["id"])

        assert stats is not None
        # The condition in backend is "else: cur = 0" without "d < today"
        # This means on day 23 (today), if not completed, it WILL reset cur to 0
        # So the max seen before reset is 3
        assert stats["racha_max"] == 3

    def test_percentage_current_month(self, setup_db):
        """Should calculate % completion for current month up to today."""
        habito = crud.habitos_crear(
            nombre="Pct Test",
            frecuencia_tipo="diario",
        )

        today = date.today()
        # Complete half the days scheduled so far in this month
        first_of_month = date(today.year, today.month, 1)
        num_days_so_far = (today - first_of_month).days + 1
        for i in range(num_days_so_far // 2):
            d = first_of_month + timedelta(days=i)
            crud.habitos_registros_upsert(habito["id"], d.isoformat(), 1.0)

        stats = crud.habitos_stats(habito["id"])

        assert stats is not None
        assert 40 <= stats["pct_mes"] <= 60  # Approximately 50%

    def test_percentage_all_days_completed(self, setup_db):
        """Should return 100% if all scheduled days are completed."""
        habito = crud.habitos_crear(
            nombre="Perfect Pct",
            frecuencia_tipo="diario",
        )

        today = date.today()
        first_of_month = date(today.year, today.month, 1)
        num_days_so_far = (today - first_of_month).days + 1

        for i in range(num_days_so_far):
            d = first_of_month + timedelta(days=i)
            crud.habitos_registros_upsert(habito["id"], d.isoformat(), 1.0)

        stats = crud.habitos_stats(habito["id"])

        assert stats is not None
        assert stats["pct_mes"] == 100

    def test_percentage_weekly_habit(self, setup_db):
        """Should only count scheduled days for weekly habits."""
        habito = crud.habitos_crear(
            nombre="Weekly Pct",
            frecuencia_tipo="semanal",
            dias_semana=json.dumps([1]),  # Monday only
        )

        # Create registros for some Mondays in current month
        today = date.today()
        y, m = today.year, today.month

        # Find Mondays in this month
        first_of_month = date(y, m, 1)
        mondays = []
        d = first_of_month
        while d.month == m:
            if d.weekday() == 0:  # Monday in Python
                if d <= today:
                    mondays.append(d)
            d += timedelta(days=1)

        # Complete all found Mondays
        for mon in mondays:
            crud.habitos_registros_upsert(habito["id"], mon.isoformat(), 1.0)

        stats = crud.habitos_stats(habito["id"])

        assert stats is not None
        if mondays:
            assert stats["pct_mes"] == 100

    def test_partial_values_in_percentage(self, setup_db):
        """Partial values (0.5) should be counted in percentage calculation."""
        habito = crud.habitos_crear(
            nombre="Partial Pct",
            frecuencia_tipo="diario",
        )

        today = date.today()
        first_of_month = date(today.year, today.month, 1)

        # Complete 2 full + 3 partial = 3.5 valor
        # If 5 scheduled so far, pct = 3.5/5 = 70%
        for i in range(2):
            d = first_of_month + timedelta(days=i)
            crud.habitos_registros_upsert(habito["id"], d.isoformat(), 1.0)

        for i in range(2, 5):
            d = first_of_month + timedelta(days=i)
            if d <= today:
                crud.habitos_registros_upsert(habito["id"], d.isoformat(), 0.5)

        stats = crud.habitos_stats(habito["id"])

        assert stats is not None
        assert stats["pct_mes"] == 70

    def test_comparison_with_calcmaxstreak(self, setup_db):
        """
        This test documents backend vs frontend racha_max behavior.

        Frontend: calcMaxStreak line 116 uses "if (cur > maxStreak)"
        Backend: habitos_stats line 3073 uses "streak_max = max(streak_max, cur)"

        Both should give same result. If they differ, this will catch it.
        """
        habito = crud.habitos_crear(
            nombre="Backend Frontend Sync",
            frecuencia_tipo="diario",
            creado_en="2026-09-15T00:00:00",
        )

        # Create multiple streaks: 2 days, gap, 3 days, gap, 1 day
        streaks_data = [
            ("2026-09-15", 1.0),
            ("2026-09-16", 1.0),
            # gap 17
            ("2026-09-18", 1.0),
            ("2026-09-19", 1.0),
            ("2026-09-20", 1.0),
            # gap 21
            ("2026-09-22", 1.0),
        ]

        for fecha, valor in streaks_data:
            crud.habitos_registros_upsert(habito["id"], fecha, valor)

        stats = crud.habitos_stats(habito["id"])

        assert stats is not None
        # Max streak should be 3 (days 18-20)
        assert stats["racha_max"] == 3


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
