import pytest
from app.db import crud


@pytest.mark.integration
def test_crear_cuenta_y_movimiento_gasto_ars(tmp_app_db):
    cuenta_id = crud.fin_crear_cuenta(nombre="Cuenta de Prueba")
    crud.fin_crear_movimiento(fecha="2023-04-01", monto=100, tipo="expense", descripcion="Gasto de prueba", cuenta_id=cuenta_id)
    cuentas = crud.fin_obtener_cuentas()
    assert cuentas[0]["id"] == cuenta_id
    assert cuentas[0]["ars"] == -100.0


@pytest.mark.integration
def test_crear_cuenta_y_movimientos_ars_y_usd_no_se_mezclan(tmp_app_db):
    cuenta_id = crud.fin_crear_cuenta(nombre="Cuenta de Prueba")
    crud.fin_crear_movimiento(fecha="2023-04-01", monto=100, tipo="expense", descripcion="Gasto de prueba", cuenta_id=cuenta_id)
    crud.fin_crear_movimiento(fecha="2023-04-02", monto=300, tipo="income", descripcion="Ingreso de prueba", cuenta_id=cuenta_id)
    crud.fin_crear_movimiento(fecha="2023-04-03", monto=20, tipo="expense", descripcion="Gasto USD de prueba", cuenta_id=cuenta_id, moneda="USD")
    cuentas = crud.fin_obtener_cuentas()
    assert cuentas[0]["id"] == cuenta_id
    assert cuentas[0]["ars"] == 200.0  # -100 (gasto) + 300 (ingreso)
    assert cuentas[0]["usd"] == -20.0  # gasto USD, no toca el saldo ARS


@pytest.mark.integration
def test_recalcular_saldos_da_lo_mismo_que_el_incremental(tmp_app_db):
    cuenta_id = crud.fin_crear_cuenta(nombre="Cuenta de Prueba")
    crud.fin_crear_movimiento(fecha="2023-04-01", monto=100, tipo="expense", descripcion="Gasto de prueba", cuenta_id=cuenta_id)
    crud.fin_crear_movimiento(fecha="2023-04-02", monto=300, tipo="income", descripcion="Ingreso de prueba", cuenta_id=cuenta_id)
    crud.fin_crear_movimiento(fecha="2023-04-03", monto=20, tipo="expense", descripcion="Gasto USD de prueba", cuenta_id=cuenta_id, moneda="USD")
    antes = crud.fin_obtener_cuentas()[0]

    crud.fin_recalcular_saldos_cuentas()
    despues = crud.fin_obtener_cuentas()[0]

    assert despues["ars"] == antes["ars"] == 200.0
    assert despues["usd"] == antes["usd"] == -20.0


@pytest.mark.integration
def test_recalcular_saldos_es_idempotente(tmp_app_db):
    cuenta_id = crud.fin_crear_cuenta(nombre="Cuenta de Prueba")
    crud.fin_crear_movimiento(fecha="2023-04-01", monto=100, tipo="expense", descripcion="Gasto de prueba", cuenta_id=cuenta_id)
    crud.fin_crear_movimiento(fecha="2023-04-02", monto=300, tipo="income", descripcion="Ingreso de prueba", cuenta_id=cuenta_id)

    crud.fin_recalcular_saldos_cuentas()
    primera = crud.fin_obtener_cuentas()[0]
    crud.fin_recalcular_saldos_cuentas()
    segunda = crud.fin_obtener_cuentas()[0]

    assert primera["ars"] == segunda["ars"] == 200.0
    assert primera["usd"] == segunda["usd"] == 0.0


@pytest.mark.integration
def test_crear_objetivo_crea_categoria_homonima_visible(tmp_app_db):
    objetivo = crud.fin_crear_objetivo(nombre="Viaje", meta=100000)
    objetivo_id = objetivo["id"]

    categorias = crud.fin_obtener_categorias()
    viaje_categoria = next(
        (c for c in categorias if c["name"] == "Viaje" and c["objetivo_id"] == objetivo_id),
        None,
    )
    assert viaje_categoria is not None
    assert viaje_categoria["oculta"] is False


@pytest.mark.integration
def test_eliminar_objetivo_oculta_categoria_sin_borrarla(tmp_app_db):
    objetivo = crud.fin_crear_objetivo(nombre="Viaje", meta=100000)
    objetivo_id = objetivo["id"]

    assert crud.fin_eliminar_objetivo(objetivo_id) is True

    # Sin include_ocultas, la categoría desaparece de la lista por default.
    categorias_default = crud.fin_obtener_categorias()
    assert next((c for c in categorias_default if c["name"] == "Viaje"), None) is None

    # Con include_ocultas=True sigue existiendo, ahora oculta y sin objetivo_id.
    categorias_todas = crud.fin_obtener_categorias(include_ocultas=True)
    viaje_oculta = next((c for c in categorias_todas if c["name"] == "Viaje"), None)
    assert viaje_oculta is not None
    assert viaje_oculta["oculta"] is True
    assert viaje_oculta["objetivo_id"] is None


@pytest.mark.integration
def test_eliminar_objetivo_inexistente_da_false_sin_excepcion(tmp_app_db):
    assert crud.fin_eliminar_objetivo(999999) is False
