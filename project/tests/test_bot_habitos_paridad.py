"""Tests de paridad de hábitos -- lado bot (project/mybot/agenda_handlers.py).

Consume tests/fixtures/habitos_paridad.json, el mismo fixture que usan
project/frontend/src/components/habitos/habitos.paridad.test.js (frontend) y
tests/test_habitos_paridad.py (backend), para confirmar que _is_scheduled() y
_calc_racha() del bot -- que el propio código dice ser un "port de calcStreak de
habitosUtils.js" -- devuelven lo mismo que las otras dos implementaciones ante
los mismos datos.

`mybot/` no está en el pythonpath de `project/pytest.ini` (solo `project/` vía
`pythonpath = .`), así que este archivo agrega `project/mybot` a sys.path
explícitamente -- mismo patrón que tests/test_bot_finanzas.py.

"today" está fijo a 2026-09-23 (mismo valor que usan los otros dos lados),
parcheando el atributo `date` del propio módulo agenda_handlers (importado ahí
a nivel de módulo con `from datetime import date, ...`, así que parchear
`datetime.date` global no alcanza -- hay que parchear el nombre ya vinculado en
el módulo, a diferencia de crud.py que reimporta `date` en cada llamada).
"""
import json
import sys
from datetime import date
from pathlib import Path

import pytest

_MYBOT_DIR = Path(__file__).resolve().parent.parent / "mybot"
if str(_MYBOT_DIR) not in sys.path:
    sys.path.insert(0, str(_MYBOT_DIR))

import agenda_handlers as ah  # noqa: E402

FIXTURES = json.loads(
    (Path(__file__).parent / "fixtures" / "habitos_paridad.json").read_text(encoding="utf-8")
)
TODAY = date.fromisoformat(FIXTURES["today"])


class _FrozenDate(date):
    @classmethod
    def today(cls):
        return cls(TODAY.year, TODAY.month, TODAY.day)


@pytest.fixture
def frozen_today(monkeypatch):
    monkeypatch.setattr(ah, "date", _FrozenDate)
    yield TODAY


def _build_registros_map(habito_id: int, registros: list) -> dict:
    return {f"{habito_id}-{r['fecha']}": r for r in registros}


class TestIsScheduledParidad:
    @pytest.mark.parametrize("case", FIXTURES["schedule_cases"], ids=lambda c: c["name"])
    def test_matches_fixture(self, case):
        habito = case["habito"]
        expected = case.get("expected_frontend_bot", case.get("expected"))
        for fecha, esperado in expected.items():
            d = date.fromisoformat(fecha)
            assert ah._is_scheduled(habito, d) == esperado, (
                f"{case['name']}: _is_scheduled(habito, {fecha!r}) esperaba {esperado}"
            )


class TestCalcRachaParidad:
    @pytest.mark.parametrize(
        "case",
        [c for c in FIXTURES["streak_cases"] if c["name"] != "DIVERGENCE_today_pending"],
        ids=lambda c: c["name"],
    )
    def test_matches_fixture(self, frozen_today, case):
        habito = {**case["habito"], "id": 1}
        regmap = _build_registros_map(1, case["registros"])

        racha = ah._calc_racha(habito, regmap)

        assert racha == case["expected"]["racha_actual"], case["name"]

    def test_calc_racha_DIVERGENCE_today_pending(self, frozen_today):
        """DIVERGENCIA REAL vs frontend/backend -- ver nota completa en el fixture.

        calcStreak (frontend) y streak_cur (backend, habitos_stats) rompen la
        racha en la primera iteración cuando HOY está programado y sin completar.
        _calc_racha (bot) tiene un caso explícito para "hoy": si hoy está
        programado pero sin completar, no rompe la racha, sigue contando hacia
        atrás -- pese a que el comentario en agenda_handlers.py dice "Port de
        calcStreak de habitosUtils.js". Con el mismo fixture exacto
        (2 días completos + hoy pendiente), frontend/backend dan 0 y el bot da 2
        (confirmado en test_habitos_paridad.py::TestHabitosStatsParidad::
        test_racha_actual_DIVERGENCE_today_pending_documents_backend_value, y en
        habitos.paridad.test.js del lado frontend).

        No se corrige acá -- el alcance de esta tarea es solo detectar
        divergencias, no decidir cuál de las tres implementaciones tiene razón.
        """
        case = next(c for c in FIXTURES["streak_cases"] if c["name"] == "DIVERGENCE_today_pending")
        habito = {**case["habito"], "id": 1}
        regmap = _build_registros_map(1, case["registros"])

        racha = ah._calc_racha(habito, regmap)

        assert racha == case["expected_bot"] == 2

    def test_inactive_habit_matches_expected_frontend_bot(self, frozen_today):
        """A diferencia del backend (ver test_habitos_paridad.py), el bot SÍ respeta 'activo'."""
        fixture = FIXTURES["inactive_habit_ignored_by_backend"]
        habito = {**fixture["habito"], "id": 1}
        regmap = _build_registros_map(1, fixture["registros"])

        racha = ah._calc_racha(habito, regmap)

        assert racha == fixture["expected_frontend_bot"]["racha_actual"] == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
