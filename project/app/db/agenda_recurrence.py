"""Finite, materialized recurrence shared by Agenda events and tasks."""

import calendar
from datetime import date, datetime, timedelta

REC_DAILY_DAYS = 60
REC_WEEKLY_WEEKS = 12
REC_MONTHLY_OCCURRENCES = 12


def event_template(titulo, descripcion, fecha_inicio, fecha_fin, todo_el_dia):
    duration = (
        (datetime.fromisoformat(fecha_fin) - datetime.fromisoformat(fecha_inicio)).total_seconds()
        if fecha_fin else None
    )
    return {
        "titulo": titulo, "descripcion": descripcion,
        "hora_inicio": fecha_inicio[10:], "duracion_segundos": duration,
        "todo_el_dia": bool(todo_el_dia),
    }


def task_template(titulo, descripcion, hora_opcional, hora_bloque, duracion_estimada):
    return {
        "titulo": titulo, "descripcion": descripcion,
        "hora_opcional": hora_opcional, "hora_bloque": hora_bloque,
        "duracion_estimada": duracion_estimada,
    }


def recurring_dates(
    start: str, rule: dict, extend_from: date | None = None,
    after: date | None = None,
) -> list[str]:
    """Return dates after the original and, optionally, after an existing horizon."""
    base = date.fromisoformat(start[:10])
    frequency = rule.get("frecuencia", "semanal")
    if frequency not in {"diario", "semanal", "mensual"}:
        raise ValueError(f"Frecuencia de recurrencia inválida: {frequency}")
    days = rule.get("dias") or [base.weekday()]
    until = date.fromisoformat(rule["hasta"]) if rule.get("hasta") else None

    dates = []
    if frequency == "mensual":
        current = base
        count = REC_MONTHLY_OCCURRENCES
        if extend_from and extend_from > base:
            months_elapsed = (extend_from.year - base.year) * 12 + extend_from.month - base.month
            count = max(count, months_elapsed + REC_MONTHLY_OCCURRENCES)
        for _ in range(count):
            month, year = current.month + 1, current.year
            if month > 12:
                month, year = 1, year + 1
            day = min(base.day, calendar.monthrange(year, month)[1])
            current = date(year, month, day)
            if until and current > until:
                break
            if after is None or current > after:
                dates.append(current.isoformat())
    else:
        window = timedelta(days=REC_DAILY_DAYS) if frequency == "diario" else timedelta(weeks=REC_WEEKLY_WEEKS)
        end = max(base, extend_from or base) + window
        if until:
            end = min(end, until)
        current = max(base, after or base) + timedelta(days=1)
        while current <= end:
            if frequency == "diario" or current.weekday() in days:
                dates.append(current.isoformat())
            current += timedelta(days=1)
    return dates
