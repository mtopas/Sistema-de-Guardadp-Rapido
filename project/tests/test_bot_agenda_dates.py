"""Date formats accepted by /dia."""

import sys
from datetime import date
from pathlib import Path

import pytest

_MYBOT_DIR = Path(__file__).resolve().parent.parent / "mybot"
if str(_MYBOT_DIR) not in sys.path:
    sys.path.insert(0, str(_MYBOT_DIR))

import agenda_handlers  # noqa: E402


class FixedDate(date):
    @classmethod
    def today(cls):
        return cls(2026, 9, 25)


def test_dia_acepta_dia_del_mes_y_fecha_orden_local(monkeypatch):
    monkeypatch.setattr(agenda_handlers, "date", FixedDate)
    assert agenda_handlers._parse_fecha_simple("03") == "2026-09-03"
    assert agenda_handlers._parse_fecha_simple("03-10-2025") == "2025-10-03"
    assert agenda_handlers._parse_fecha_simple("2026-10-03") == "2026-10-03"
    with pytest.raises(ValueError):
        agenda_handlers._parse_fecha_simple("31-02-2026")
