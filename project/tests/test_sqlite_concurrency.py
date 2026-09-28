"""Regresiones para los write-on-read compartidos por Bóveda y Agenda."""

import threading
import time

import pytest

from app.db import crud
from app.db.database import get_connection


def test_busy_timeout_da_margen_a_escritores_breves(tmp_app_db):
    conn = get_connection()
    try:
        assert conn.execute("PRAGMA busy_timeout").fetchone()[0] == 15000
    finally:
        conn.close()


def test_requests_paralelos_comparten_sync_y_bloquean_extension(
    tmp_app_db, monkeypatch,
):
    """Una ráfaga hace un solo scan y Agenda espera el mismo coordinador."""
    sync_empezo = threading.Event()
    liberar_sync = threading.Event()
    agenda_termino = threading.Event()
    llamadas_sync = []
    errores = []

    monkeypatch.setattr(crud, "_ultima_sincronizacion_vault", 0.0)

    def sync_lento(_root, _conn):
        llamadas_sync.append(1)
        sync_empezo.set()
        assert liberar_sync.wait(timeout=2)

    monkeypatch.setattr(crud.vault_sync, "sincronizar_vault", sync_lento)

    def correr_sync():
        try:
            crud.sincronizar_vault_si_hace_falta()
        except Exception as exc:  # pragma: no cover - se reporta en el assert
            errores.append(exc)

    def extender_agenda():
        conn = get_connection()
        try:
            crud._extender_series(conn, "evento", "2026-09-28")
            agenda_termino.set()
        except Exception as exc:  # pragma: no cover - se reporta en el assert
            errores.append(exc)
        finally:
            conn.close()

    primero = threading.Thread(target=correr_sync)
    primero.start()
    assert sync_empezo.wait(timeout=1)

    repetidos = [threading.Thread(target=correr_sync) for _ in range(3)]
    agenda = threading.Thread(target=extender_agenda)
    for thread in [*repetidos, agenda]:
        thread.start()

    time.sleep(0.05)
    assert not agenda_termino.is_set()
    liberar_sync.set()

    for thread in [primero, *repetidos, agenda]:
        thread.join(timeout=2)
        assert not thread.is_alive()

    assert errores == []
    assert len(llamadas_sync) == 1
    assert agenda_termino.is_set()


def test_sync_fallido_hace_rollback_y_libera_la_db(tmp_app_db, monkeypatch):
    monkeypatch.setattr(crud, "_ultima_sincronizacion_vault", 0.0)

    def sync_fallido(_root, conn):
        conn.execute(
            "INSERT INTO app_settings (clave, valor) VALUES ('sync_incompleto', '1')"
        )
        raise RuntimeError("fallo de lectura simulado")

    monkeypatch.setattr(crud.vault_sync, "sincronizar_vault", sync_fallido)

    with pytest.raises(RuntimeError, match="fallo de lectura simulado"):
        crud.sincronizar_vault_si_hace_falta()

    conn = get_connection()
    try:
        assert conn.execute(
            "SELECT valor FROM app_settings WHERE clave = 'sync_incompleto'"
        ).fetchone() is None
        conn.execute(
            "INSERT INTO app_settings (clave, valor) VALUES ('despues_del_fallo', 'ok')"
        )
        conn.commit()
    finally:
        conn.close()


@pytest.mark.parametrize(
    ("consulta", "args"),
    [
        (crud.agenda_obtener_eventos, (None, None)),
        (crud.agenda_obtener_tareas, (None, False, None)),
    ],
)
def test_consultas_agenda_cierran_conexion_si_falla_extension(
    monkeypatch, consulta, args,
):
    class ConexionRastreo:
        cerrada = False

        def close(self):
            self.cerrada = True

    conn = ConexionRastreo()
    monkeypatch.setattr(crud, "get_connection", lambda: conn)
    monkeypatch.setattr(
        crud, "_extender_series",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("boom")),
    )

    with pytest.raises(RuntimeError, match="boom"):
        consulta(*args)

    assert conn.cerrada
