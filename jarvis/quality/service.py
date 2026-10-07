"""Ledger técnico y snapshots semanales de calidad de Jarvis.

El módulo trabaja únicamente con categorías y conteos. No lee ni persiste el
contenido de preguntas, respuestas o errores textuales para el reporte.
"""
from __future__ import annotations

import json
import logging
import sqlite3
import uuid
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from jarvis.db.database import get_connection

logger = logging.getLogger(__name__)

QUALITY_TIMEZONE = "America/Argentina/Buenos_Aires"
_TZ = ZoneInfo(QUALITY_TIMEZONE)
_UTC = timezone.utc
_CHANNELS = ("telegram", "desktop")
_ROUTES = ("rag", "agenda_live")
_RESULTS = ("success", "tool_error", "query_error")
_ERROR_CODES = (
    "agenda_tool_error",
    "tool_execution_error",
    "conversation_error",
    "retrieval_error",
    "llm_error",
    "response_persistence_error",
    "query_error",
)


class WeekNotClosedError(ValueError):
    """La semana solicitada todavía está abierta."""


def _as_date(value: date | str) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("week_start debe tener formato YYYY-MM-DD") from exc


def _week_window(
    week_start: date | str,
    *,
    now: datetime | None = None,
) -> tuple[date, date, datetime, datetime]:
    """Devuelve fechas locales y límites UTC semiabiertos de la semana."""
    start = _as_date(week_start)
    if start.weekday() != 0:
        raise ValueError("week_start debe ser un lunes")

    current = now or datetime.now(_UTC)
    if current.tzinfo is None:
        current = current.replace(tzinfo=_UTC)
    current_local = current.astimezone(_TZ)
    current_week_start = current_local.date() - timedelta(days=current_local.weekday())
    if start >= current_week_start:
        raise WeekNotClosedError("la semana solicitada todavía no está cerrada")

    end = start + timedelta(days=6)
    local_start = datetime.combine(start, time.min, tzinfo=_TZ)
    local_end = local_start + timedelta(days=7)
    return start, end, local_start.astimezone(_UTC), local_end.astimezone(_UTC)


def _parse_timestamp(value: str | datetime | None) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=_UTC)
    return parsed.astimezone(_UTC)


def _in_window(value: str | datetime | None, start_utc: datetime, end_utc: datetime) -> bool:
    parsed = _parse_timestamp(value)
    return parsed is not None and start_utc <= parsed < end_utc


def _local_day(value: str | datetime) -> str | None:
    parsed = _parse_timestamp(value)
    return parsed.astimezone(_TZ).date().isoformat() if parsed else None


def _safe_category(value: str | None, allowed: tuple[str, ...], fallback: str) -> str:
    return value if value in allowed else fallback


def record_query_telemetry(
    *,
    occurred_at: datetime,
    channel: str,
    conversation_id: str | None,
    route: str,
    result: str,
    duration_ms: float,
    context_retrieved: int = 0,
    context_sent: int = 0,
    tool_name: str | None = None,
    tool_ok: bool | None = None,
    error_code: str | None = None,
) -> None:
    """Escribe un evento permitido sin propagar fallos al flujo de Jarvis."""
    channel = _safe_category(channel, _CHANNELS, "desktop")
    route = _safe_category(route, _ROUTES, "rag")
    result = _safe_category(result, _RESULTS, "query_error")
    error_code = _safe_category(error_code, _ERROR_CODES, "query_error") if error_code else None
    duration_ms = max(0.0, float(duration_ms))
    context_retrieved = max(0, int(context_retrieved))
    context_sent = max(0, int(context_sent))
    if tool_ok is not None:
        tool_ok = bool(tool_ok)

    conn = None
    try:
        conn = get_connection()
        with conn:
            conn.execute(
                """INSERT INTO jarvis_query_telemetry
                   (id, occurred_at, channel, conversation_id, route, result,
                    duration_ms, context_retrieved, context_sent, tool_name,
                    tool_ok, error_code)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    str(uuid.uuid4()),
                    occurred_at.astimezone(_UTC).isoformat(),
                    channel,
                    conversation_id,
                    route,
                    result,
                    round(duration_ms, 3),
                    context_retrieved,
                    context_sent,
                    tool_name,
                    None if tool_ok is None else int(tool_ok),
                    error_code,
                ),
            )
    except Exception as exc:  # observabilidad nunca es dependencia funcional
        logger.warning(
            "[jarvis.quality] no se pudo persistir telemetría (%s)",
            type(exc).__name__,
        )
    finally:
        if conn is not None:
            conn.close()


def _empty_message_counts(start: date) -> dict[str, dict[str, dict[str, int]]]:
    return {
        (start + timedelta(days=offset)).isoformat(): {
            channel: {"user": 0, "assistant": 0} for channel in _CHANNELS
        }
        for offset in range(7)
    }


def _aggregate_week(
    conn: sqlite3.Connection,
    start: date,
    end: date,
    start_utc: datetime,
    end_utc: datetime,
) -> dict:
    messages_by_day = _empty_message_counts(start)
    message_rows = conn.execute(
        """SELECT cm.created_at, c.channel, cm.role
           FROM conversation_messages cm
           JOIN conversations c ON c.id = cm.conversation_id"""
    ).fetchall()
    for row in message_rows:
        if not _in_window(row["created_at"], start_utc, end_utc):
            continue
        day = _local_day(row["created_at"])
        channel = row["channel"] if row["channel"] in _CHANNELS else "desktop"
        role = row["role"] if row["role"] in ("user", "assistant") else None
        if day in messages_by_day and role:
            messages_by_day[day][channel][role] += 1

    telemetry_rows = conn.execute(
        """SELECT occurred_at, route, result, duration_ms,
                  context_retrieved, context_sent, tool_name, tool_ok, error_code
           FROM jarvis_query_telemetry"""
    ).fetchall()
    query_rows = [
        row for row in telemetry_rows
        if _in_window(row["occurred_at"], start_utc, end_utc)
    ]

    by_route = Counter(row["route"] for row in query_rows)
    by_result = Counter(row["result"] for row in query_rows)
    durations = [float(row["duration_ms"]) for row in query_rows]
    tool_calls = Counter(row["tool_name"] for row in query_rows if row["tool_name"])
    tool_failures = Counter(
        row["tool_name"] for row in query_rows
        if row["tool_name"] and row["tool_ok"] == 0
    )
    errors = Counter(row["error_code"] for row in query_rows if row["error_code"])
    context_retrieved = sum(int(row["context_retrieved"]) for row in query_rows)
    context_sent = sum(int(row["context_sent"]) for row in query_rows)

    total_messages = sum(
        count
        for day in messages_by_day.values()
        for channel in day.values()
        for count in channel.values()
    )
    tool_summary = {
        name: {"calls": tool_calls[name], "failures": tool_failures.get(name, 0)}
        for name in sorted(tool_calls)
    }
    no_context = sum(row["context_retrieved"] == 0 for row in query_rows)
    privacy_filtered = sum(
        row["context_retrieved"] > row["context_sent"] for row in query_rows
    )

    return {
        "week": {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "timezone": QUALITY_TIMEZONE,
        },
        "messages": {
            "total": total_messages,
            "by_day": messages_by_day,
        },
        "queries": {
            "total": len(query_rows),
            "by_route": {key: by_route[key] for key in sorted(by_route)},
            "by_result": {key: by_result[key] for key in sorted(by_result)},
            "duration_ms": {
                "average": round(sum(durations) / len(durations), 3) if durations else 0.0,
                "maximum": round(max(durations), 3) if durations else 0.0,
            },
            "context": {
                "retrieved": context_retrieved,
                "sent": context_sent,
            },
        },
        "tools": {
            "calls": sum(tool_calls.values()),
            "failures": sum(tool_failures.values()),
            "by_name": tool_summary,
        },
        "errors": {
            "by_code": {key: errors[key] for key in sorted(errors)},
        },
        "friction": {
            "queries_without_context": no_context,
            "queries_with_privacy_filtering": privacy_filtered,
            "tool_failures": sum(tool_failures.values()),
            "query_failures": sum(row["result"] == "query_error" for row in query_rows),
        },
    }


def create_weekly_snapshot(
    week_start: date | str,
    *,
    now: datetime | None = None,
) -> dict:
    """Genera o devuelve el snapshot write-once de una semana cerrada."""
    start, end, start_utc, end_utc = _week_window(week_start, now=now)
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT week_start, week_end, timezone, created_at, summary_json "
            "FROM jarvis_quality_snapshots WHERE week_start = ?",
            (start.isoformat(),),
        ).fetchone()
        if existing:
            return _snapshot_dict(existing)

        summary = _aggregate_week(conn, start, end, start_utc, end_utc)
        summary_json = json.dumps(summary, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        created_at = datetime.now(_UTC).isoformat()
        with conn:
            conn.execute(
                """INSERT OR IGNORE INTO jarvis_quality_snapshots
                   (week_start, week_end, timezone, schema_version, summary_json, created_at)
                   VALUES (?, ?, ?, 1, ?, ?)""",
                (start.isoformat(), end.isoformat(), QUALITY_TIMEZONE, summary_json, created_at),
            )
        row = conn.execute(
            "SELECT week_start, week_end, timezone, created_at, summary_json "
            "FROM jarvis_quality_snapshots WHERE week_start = ?",
            (start.isoformat(),),
        ).fetchone()
        return _snapshot_dict(row)
    finally:
        conn.close()


def get_weekly_snapshot(week_start: date | str) -> dict | None:
    start = _as_date(week_start)
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT week_start, week_end, timezone, created_at, summary_json "
            "FROM jarvis_quality_snapshots WHERE week_start = ?",
            (start.isoformat(),),
        ).fetchone()
        return _snapshot_dict(row) if row else None
    finally:
        conn.close()


def _snapshot_dict(row: sqlite3.Row) -> dict:
    return {
        "week_start": row["week_start"],
        "week_end": row["week_end"],
        "timezone": row["timezone"],
        "created_at": row["created_at"],
        "summary": json.loads(row["summary_json"]),
    }
