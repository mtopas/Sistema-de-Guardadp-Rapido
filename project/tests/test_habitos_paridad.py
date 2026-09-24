"""Tests de paridad de hábitos -- lado backend (app/db/crud.py).

Consume tests/fixtures/habitos_paridad.json, el mismo fixture que usan
project/frontend/src/components/habitos/habitos.paridad.test.js (frontend) y
tests/test_bot_habitos_paridad.py (bot), para confirmar que _habito_is_scheduled()
y habitos_stats() (backend) devuelven los mismos racha_actual/racha_max/pct_mes que
isScheduled()/calcStreak()/calcMaxStreak()/calcMonthPct() (frontend) y
_is_scheduled()/_calc_racha() (bot) ante los mismos datos.

Esto NO reemplaza test_habitos.py (que cubre habitos_stats() en general) -- el
objetivo acá es específicamente la red de seguridad de paridad entre los tres
lados, no la cobertura funcional de cada uno por separado.

"today" está fijado a 2026-09-23 (mismo valor que usa habitos.test.js vía
vi.setSystemTime) parcheando el atributo `date` del módulo `datetime` global:
habitos_stats() hace `from datetime import date as _date` DENTRO de la función
(import local, re-ejecutado en cada llamada) en vez de usar el `date` importado a
nivel de módulo en crud.py -- por eso alcanza con parchear `datetime.date`, no hace
falta (ni funcionaría) parchear `app.db.crud.date`.
"""
import datetime as _datetime_module
import json
from datetime import date, timedelta
from pathlib import Path

import pytest

from app.db import crud
from app.db.database import get_connection, init_db

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
    """Congela datetime.date.today() a FIXTURES['today'] para habitos_stats()."""
    monkeypatch.setattr(_datetime_module, "date", _FrozenDate)
    yield TODAY


@pytest.fixture
def setup_db():
    init_db()
    yield


def _crear_habito(habito_fixture: dict) -> dict:
    """Crea un hábito y fuerza su creado_en/activo a los valores del fixture.

    crud.habitos_crear() no acepta creado_en como parámetro (siempre usa
    datetime.now()) y "activo" tampoco está en _HABITO_UPDATABLE -- se escriben
    directo por SQL después de crear, mismo approach que ya usan otros tests de
    integración de este archivo para preparar estado que el CRUD no expone.
    """
    creado = crud.habitos_crear(
        nombre=f"fixture-{habito_fixture.get('creado_en', 'x')}",
        frecuencia_tipo=habito_fixture["frecuencia_tipo"],
        dias_semana=habito_fixture.get("dias_semana"),
    )
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE habitos SET creado_en = ?, activo = ? WHERE id = ?",
        (
            habito_fixture.get("creado_en"),
            1 if habito_fixture.get("activo", True) else 0,
            creado["id"],
        ),
    )
    conn.commit()
    conn.close()
    # habitos_stats() vuelve a leer la fila de la DB, así que alcanza con el id;
    # el resto de este dict queda desactualizado a propósito (no se usa después).
    return creado


def _cargar_registros(habito_id: int, registros: list):
    """Inserta registros directo por SQL, sin pasar por crud.habitos_registros_upsert().

    Ese CRUD valida valor in (0.5, 1.0) y rechaza 0.0 -- pero el fixture
    'broken_by_explicit_zero' necesita justamente un valor=0.0 explícito para
    ejercitar la rama de lectura "programado con valor=0" de habitos_stats()
    (distinta, en el código, de "sin registro en absoluto" aunque el resultado
    práctico coincida: `reg_map.get(ds, 0)` ya default-ea a 0 si falta la fila).
    """
    conn = get_connection()
    cursor = conn.cursor()
    creado_en = "2026-01-01T00:00:00"
    for r in registros:
        cursor.execute(
            """INSERT INTO habitos_registros (habito_id, fecha, valor, nota, creado_en)
               VALUES (?, ?, ?, NULL, ?)
               ON CONFLICT(habito_id, fecha) DO UPDATE SET valor = excluded.valor""",
            (habito_id, r["fecha"], r["valor"], creado_en),
        )
    conn.commit()
    conn.close()


class TestHabitosIsScheduledParidad:
    """_habito_is_scheduled() (extraída de la clausura de habitos_stats) vs el fixture."""

    @pytest.mark.parametrize("case", FIXTURES["schedule_cases"], ids=lambda c: c["name"])
    def test_matches_fixture(self, case):
        habito = case["habito"]
        if "expected_backend" in case:
            expected = case["expected_backend"]
        else:
            expected = case["expected"]
        for fecha, esperado in expected.items():
            assert crud._habito_is_scheduled(habito, fecha) == esperado, (
                f"{case['name']}: _habito_is_scheduled(habito, {fecha!r}) "
                f"esperaba {esperado}"
            )

    def test_inactive_habit_diverges_from_expected_frontend_bot(self):
        """Documenta la divergencia: el backend, a diferencia de frontend/bot, no mira 'activo'."""
        case = next(c for c in FIXTURES["schedule_cases"] if c["name"] == "diario_inactivo")
        habito = case["habito"]
        assert habito["activo"] is False
        for fecha, esperado_frontend_bot in case["expected_frontend_bot"].items():
            backend_result = crud._habito_is_scheduled(habito, fecha)
            assert esperado_frontend_bot is False
            assert backend_result is True, (
                "Si esto falla, _habito_is_scheduled empezó a respetar 'activo' -- "
                "actualizar/eliminar este test junto con la nota de divergencia en "
                "tests/fixtures/habitos_paridad.json ('diario_inactivo')."
            )


class TestHabitosStatsParidad:
    """habitos_stats() (racha_actual/racha_max/pct_mes) vs el fixture."""

    @pytest.mark.parametrize("case", FIXTURES["streak_cases"], ids=lambda c: c["name"])
    def test_racha_actual_matches_fixture(self, setup_db, frozen_today, case):
        if case["name"] == "DIVERGENCE_today_pending":
            pytest.skip(
                "Divergencia real confirmada entre frontend/backend (racha=0) y bot "
                "(racha=2) cuando hoy está programado y sin completar -- ver "
                "'note' en el fixture ('DIVERGENCE_today_pending'). No se corrige "
                "acá (decisión del usuario pendiente); test_bot_habitos_paridad.py "
                "confirma el valor 2 del lado del bot para el mismo fixture."
            )
        habito = _crear_habito(case["habito"])
        _cargar_registros(habito["id"], case["registros"])

        stats = crud.habitos_stats(habito["id"])

        assert stats["racha_actual"] == case["expected"]["racha_actual"], case["name"]
        if "racha_max" in case["expected"]:
            assert stats["racha_max"] == case["expected"]["racha_max"], case["name"]

    def test_racha_actual_DIVERGENCE_today_pending_documents_backend_value(
        self, setup_db, frozen_today
    ):
        """No-skip: confirma en vivo el valor 0 que el backend calcula hoy (2026-09-24 hallazgo).

        Compañero de test_calc_racha_DIVERGENCE_today_pending en
        test_bot_habitos_paridad.py, que confirma 2 para el bot con el mismo fixture.
        """
        case = next(c for c in FIXTURES["streak_cases"] if c["name"] == "DIVERGENCE_today_pending")
        habito = _crear_habito(case["habito"])
        _cargar_registros(habito["id"], case["registros"])

        stats = crud.habitos_stats(habito["id"])

        assert stats["racha_actual"] == case["expected_backend"] == 0

    @pytest.mark.parametrize("case", FIXTURES["month_pct_cases"], ids=lambda c: c["name"])
    def test_pct_mes_matches_fixture(self, setup_db, frozen_today, case):
        assert case["year"] == TODAY.year and case["month"] == TODAY.month, (
            "habitos_stats() calcula pct_mes siempre para el mes de 'hoy' -- "
            "el fixture debe apuntar al mismo año/mes que FIXTURES['today']."
        )
        habito = _crear_habito(case["habito"])
        _cargar_registros(habito["id"], case["registros"])

        stats = crud.habitos_stats(habito["id"])

        assert stats["pct_mes"] == case["expected_pct_mes"], case["name"]

    def test_inactive_habit_activo_ignored_by_backend(self, setup_db, frozen_today):
        """DIVERGENCIA REAL: habitos_stats() ignora 'activo' por completo.

        Frontend (calcStreak/calcMaxStreak/calcMonthPct, vía isScheduled) y bot
        (_calc_racha, vía _is_scheduled) devuelven racha_actual=0, racha_max=0,
        pct_mes=0 para un hábito inactivo -- para ellos un hábito inactivo nunca
        está "programado". El backend no filtra por 'activo' en absoluto dentro de
        is_scheduled/_habito_is_scheduled, así que calcula las stats como si el
        hábito siguiera activo todos los días. Este test llama a la función real
        (no hardcodea el resultado a mano) para que si algún día se corrige el
        bug, el assert de abajo falle y avise -- en ese momento hay que actualizar
        este test y la nota en el fixture, no antes.
        """
        fixture = FIXTURES["inactive_habit_ignored_by_backend"]
        habito_fixture = fixture["habito"]
        assert habito_fixture["activo"] is False

        habito = _crear_habito(habito_fixture)
        _cargar_registros(habito["id"], fixture["registros"])

        stats = crud.habitos_stats(habito["id"])

        expected_frontend_bot = fixture["expected_frontend_bot"]
        assert stats["racha_actual"] != expected_frontend_bot["racha_actual"], (
            "El backend dejó de ignorar 'activo' (o el fixture cambió) -- si esto "
            "falla porque ahora COINCIDEN, la divergencia está resuelta: "
            "actualizar el fixture y este test para dejar de esperar la divergencia."
        )
        assert stats["racha_actual"] == 4
        assert stats["racha_max"] == 4
        assert stats["pct_mes"] == 17


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
