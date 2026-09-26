import sys
from pathlib import Path

import pytest

from app.db import crud
from app.db.database import get_connection
from fastapi.testclient import TestClient
from app.main import app

_MYBOT_DIR = Path(__file__).resolve().parent.parent / 'mybot'
if str(_MYBOT_DIR) not in sys.path:
    sys.path.insert(0, str(_MYBOT_DIR))
import finanzas_handlers as fh  # noqa: E402


def test_bot_gasto_ui_negativo_suma_al_objetivo():
    mov = {'tipo': 'expense', 'monto': -1000, 'categoria_nombre': 'Viaje', 'descripcion': 'Aporte'}
    # Antes: -1000 se presentaba como retiro; ahora es +1000 de ahorro.
    assert fh._contribucion_categoria(fh._normalize_mov(mov), 'Viaje') == 1000
    assert fh._contribucion_categoria(fh._normalize_mov({**mov, 'monto': 1000}), 'Viaje') == 1000


@pytest.mark.integration
def test_venta_retroactiva_no_puede_superar_posicion_en_su_fecha(tmp_app_db):
    inst = crud.fin_crear_instrumento('acciones', 'Acción', ticker='ABC')
    iid = inst['id']
    crud.fin_crear_transaccion_instrumento(iid, 'compra', '2026-01-01', 10, 100, moneda='USD')
    crud.fin_crear_transaccion_instrumento(iid, 'compra', '2026-03-01', 10, 100, moneda='USD')
    # Antes: guardaba venta de 15, calculaba solo 10 y dejaba cantidad 10.
    with pytest.raises(ValueError, match='posición disponible'):
        crud.fin_crear_transaccion_instrumento(iid, 'venta', '2026-02-01', 15, 110, moneda='USD')
    assert len(crud.fin_obtener_transacciones_instrumento(iid)) == 2
    assert next(i for i in crud.fin_obtener_instrumentos() if i['id'] == iid)['cantidad'] == 20


@pytest.mark.integration
def test_ppc_compra_ars_congela_cotizacion_al_guardar(tmp_app_db):
    crud.fin_actualizar_config({'dolar_mep': 1200})
    iid = crud.fin_crear_instrumento('acciones', 'Acción', ticker='ABC')['id']
    primera = crud.fin_crear_transaccion_instrumento(iid, 'compra', '2026-01-01', 10, 120000, moneda='ARS')
    assert primera['tipo_cambio'] == 1200
    crud.fin_actualizar_config({'dolar_mep': 1500})
    crud.fin_crear_transaccion_instrumento(iid, 'compra', '2026-02-01', 1, 100, moneda='USD')
    inst = next(i for i in crud.fin_obtener_instrumentos() if i['id'] == iid)
    # Antes: 900 USD de costo (800 + 100); ahora 1100 USD (1000 + 100).
    assert inst['costo_usd'] == 1100
    assert inst['cantidad'] == 11
    assert inst['costo_usd'] / inst['cantidad'] == 100
    conn = get_connection()
    try:
        assert conn.execute('SELECT tipo_cambio FROM fin_transacciones_instrumento WHERE id = ?', (primera['id'],)).fetchone()[0] == 1200
    finally:
        conn.close()


def test_bot_totales_convierten_monedas_y_exigen_cotizacion():
    movs = [
        {'tipo': 'income', 'monto': 100, 'moneda': 'USD', 'fecha': '2026-09-10'},
        {'tipo': 'expense', 'monto': -10000, 'moneda': 'ARS', 'fecha': '2026-09-11'},
    ]
    # Antes: ingreso ARS 100 y balance ARS -9900. Ahora 120000 y 110000.
    msg = fh._build_mes(movs, '2026-09', {'dolar_mep': 1200})
    assert '$120.000' in msg or '$120,000' in msg
    assert '$110.000' in msg or '$110,000' in msg
    assert 'cotización' in fh._build_mes(movs, '2026-09')


@pytest.mark.integration
def test_resumen_api_consolida_ars_y_usd(tmp_app_db):
    cuenta_id = crud.fin_crear_cuenta('Cuenta')
    crud.fin_actualizar_config({'dolar_mep': 1200})
    crud.fin_crear_movimiento('2026-09-10', 100, 'income', 'Ingreso', cuenta_id=cuenta_id, moneda='USD')
    crud.fin_crear_movimiento('2026-09-11', -10000, 'expense', 'Gasto', cuenta_id=cuenta_id, moneda='ARS')
    response = TestClient(app).get('/fin/movimientos/resumen?mes=2026-09')
    assert response.status_code == 200
    assert response.json()['moneda'] == 'ARS'
    assert response.json()['ingresos'] == 120000
    assert response.json()['gastos'] == 10000
    assert response.json()['balance'] == 110000


@pytest.mark.integration
def test_saldo_inicial_negativo_persiste_y_recalcula(tmp_app_db):
    cid = crud.fin_crear_cuenta('Descubierto', saldo_ars=-5000, saldo_usd=-20)
    cuenta = next(c for c in crud.fin_obtener_cuentas() if c['id'] == cid)
    assert (cuenta['ars'], cuenta['usd']) == (-5000, -20)
    crud.fin_recalcular_saldos_cuentas()
    cuenta = next(c for c in crud.fin_obtener_cuentas() if c['id'] == cid)
    assert (cuenta['ars'], cuenta['usd']) == (-5000, -20)


@pytest.mark.integration
def test_categoria_y_objetivo_no_duplican_nombres_reservados(tmp_app_db):
    assert crud.fin_crear_categoria('Comida') is not None
    assert crud.fin_crear_categoria(' comida ') is None
    assert crud.fin_crear_categoria('fire') is None
    assert crud.fin_crear_objetivo(' FIRE ', 1000) is None
    assert crud.fin_crear_objetivo('Viaje', 1000) is not None
    assert crud.fin_crear_objetivo(' viaje ', 2000) is None


@pytest.mark.integration
def test_cuenta_con_movimientos_no_desaparece_si_falla_delete(tmp_app_db):
    cid = crud.fin_crear_cuenta('Banco')
    crud.fin_crear_movimiento('2026-09-10', 100, 'expense', 'Compra', cuenta_id=cid)
    response = TestClient(app).delete(f'/fin/cuentas/{cid}')
    assert response.status_code == 409
    assert any(c['id'] == cid for c in crud.fin_obtener_cuentas())


@pytest.mark.integration
def test_import_csv_fallido_revierte_movimientos_y_saldos(tmp_app_db):
    cid = crud.fin_crear_cuenta('Banco')
    filas = [
        {'fecha': '2026-09-01', 'tipo': 'expense', 'monto': -100, 'descripcion': 'Compra', 'cuenta_nombre': 'Banco'},
        {'fecha': '2026-09-02', 'tipo': 'expense', 'monto': -200, 'descripcion': 'Compra', 'cuenta_nombre': 'Desconocida'},
    ]
    response = TestClient(app).post('/fin/import/csv', json={'filas': filas})
    assert response.status_code == 400
    assert crud.fin_obtener_movimientos() == []
    assert next(c for c in crud.fin_obtener_cuentas() if c['id'] == cid)['ars'] == 0
