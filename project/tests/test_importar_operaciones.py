"""Tests for importar_operaciones.py parser and logic (synthetic fixtures only)."""
import csv
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from importar_operaciones import (
    parse_decimal,
    parse_decimal_safe,
    parse_ordenes,
    parse_mep_historico,
    get_mep_for_date,
    build_load_plan,
    reconcile,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

ORDENES_HEADER = "Operacion;Estado;id Orden;Ticker;Moneda;Fecha;Hora;Cantidad;Precio;Monto;Precio Operado;Cantidad Operada"

ORDENES_ROWS = [
    "Compra 24hs;Ejecutada;100001;AAPL;Pesos;2026-07-01;10:00:00;10;1000;10000;1005;10",
    "Compra 24hs;Ejecutada;100002;AAPL;Pesos;2026-07-15;11:00:00;5;1100;5500;1100;5",
    "Venta 24hs;Ejecutada;100003;AAPL;Pesos;2026-08-01;12:00:00;3;1200;3600;1200;3",
    "Compra 24hs;Cancelada;100004;MSFT;Pesos;2026-07-01;10:00:00;10;500;5000;-1;-1",
    "Compra 24hs;Rechazada;100005;MSFT;Pesos;2026-07-02;10:00:00;10;500;5000;-1;-1",
    "Depósito;Finalizada;100006;;Pesos;2026-07-01;09:00:00;-1;-1;50000;-1;-1",
    "Transferencia;Ejecutada;100007;;Pesos;2026-07-05;10:00:00;-1;-1;30000;-1;-1",
    "Compra 24hs;Ejecutada;100008;BOND1;Pesos;2026-06-15;14:00:00;1000;3,452;3452;3,452;1000",
    "Venta 24hs;Ejecutada;100009;AAPL;Pesos;2026-09-01;10:00:00;20;1300;26000;1300;20",
]

MEP_ROWS = [
    "Miércoles, 1 de julio del 2026;1500,50",
    "Jueves, 2 de julio del 2026;1502,30",
    "Viernes, 3 de julio del 2026;1498,00",
    "Lunes, 13 de julio del 2026;1510,00",
    "Martes, 14 de julio del 2026;1512,00",
    "Miércoles, 15 de julio del 2026;1515,00",
    "Viernes, 31 de julio del 2026;1520,00",
    "Sábado, 1 de agosto del 2026;1525,00",
    "Lunes, 31 de agosto del 2026;1530,00",
    "Martes, 1 de septiembre del 2026;1535,00",
    "Domingo, 14 de junio del 2026;1490,00",
    "Lunes, 15 de junio del 2026;1492,50",
]


def _write_csv(path, header, rows, encoding="utf-8"):
    with open(path, "w", encoding=encoding, newline="") as f:
        f.write(header + "\n")
        for row in rows:
            f.write(row + "\n")


def _write_mep(path, rows, encoding="utf-8"):
    with open(path, "w", encoding=encoding, newline="") as f:
        for row in rows:
            f.write(row + "\n")


@pytest.fixture
def ordenes_file(tmp_path):
    p = tmp_path / "ordenes.csv"
    _write_csv(str(p), ORDENES_HEADER, ORDENES_ROWS)
    return str(p)


@pytest.fixture
def ordenes_file_latin1(tmp_path):
    p = tmp_path / "ordenes_latin1.csv"
    _write_csv(str(p), ORDENES_HEADER, ORDENES_ROWS, encoding="latin-1")
    return str(p)


@pytest.fixture
def mep_file(tmp_path):
    p = tmp_path / "mep.csv"
    _write_mep(str(p), MEP_ROWS)
    return str(p)


# ---------------------------------------------------------------------------
# Tests: parse_decimal
# ---------------------------------------------------------------------------

class TestParseDecimal:
    def test_integer(self):
        assert parse_decimal("1000") == 1000.0

    def test_comma_decimal(self):
        assert abs(parse_decimal("3,452") - 3.452) < 0.001

    def test_dot_thousand_comma_decimal(self):
        assert abs(parse_decimal("1.449,87677") - 1449.87677) < 0.001

    def test_negative_one(self):
        assert parse_decimal("-1") == -1.0

    def test_large_number(self):
        assert abs(parse_decimal("132473,952") - 132473.952) < 0.01

    def test_mixed_separators(self):
        assert abs(parse_decimal("101.192") - 101192.0) < 1.0


class TestParseDecimalSafe:
    def test_empty(self):
        assert parse_decimal_safe("") is None

    def test_minus_one(self):
        assert parse_decimal_safe("-1") is None

    def test_valid(self):
        assert abs(parse_decimal_safe("1500,50") - 1500.50) < 0.01


# ---------------------------------------------------------------------------
# Tests: parse_ordenes
# ---------------------------------------------------------------------------

class TestParseOrdenes:
    def test_executed_orders_only(self, ordenes_file):
        orders, skipped = parse_ordenes(ordenes_file)
        tickers = [o["ticker"] for o in orders]
        assert "AAPL" in tickers
        assert "BOND1" in tickers
        for o in orders:
            assert o["tipo"] in ("compra", "venta")

    def test_cancelled_rejected_skipped(self, ordenes_file):
        orders, skipped = parse_ordenes(ordenes_file)
        skipped_ids = [s["id_orden"] for s in skipped]
        assert "100004" in skipped_ids  # cancelled
        assert "100005" in skipped_ids  # rejected

    def test_deposits_transfers_skipped(self, ordenes_file):
        orders, skipped = parse_ordenes(ordenes_file)
        skipped_ops = [s.get("operacion", "") for s in skipped]
        assert any("Depósito" in op or "Deposito" in op or "dep" in op.lower() for op in skipped_ops)
        assert any("Transferencia" in op or "transfer" in op.lower() for op in skipped_ops)

    def test_chronological_order(self, ordenes_file):
        orders, _ = parse_ordenes(ordenes_file)
        dates = [o["fecha"] for o in orders]
        assert dates == sorted(dates)

    def test_decimal_parsing_in_orders(self, ordenes_file):
        orders, _ = parse_ordenes(ordenes_file)
        bond = [o for o in orders if o["ticker"] == "BOND1"][0]
        assert abs(bond["precio"] - 3.452) < 0.001
        assert bond["cantidad"] == 1000

    def test_latin1_encoding(self, ordenes_file_latin1):
        orders, skipped = parse_ordenes(ordenes_file_latin1)
        assert len(orders) > 0

    def test_moneda_mapping(self, ordenes_file):
        orders, _ = parse_ordenes(ordenes_file)
        for o in orders:
            assert o["moneda"] == "ARS"

    def test_compra_venta_types(self, ordenes_file):
        orders, _ = parse_ordenes(ordenes_file)
        compras = [o for o in orders if o["tipo"] == "compra"]
        ventas = [o for o in orders if o["tipo"] == "venta"]
        assert len(compras) >= 2
        assert len(ventas) >= 1


# ---------------------------------------------------------------------------
# Tests: parse_mep_historico
# ---------------------------------------------------------------------------

class TestParseMEP:
    def test_parse_dates(self, mep_file):
        mep = parse_mep_historico(mep_file)
        assert "2026-07-01" in mep
        assert abs(mep["2026-07-01"] - 1500.50) < 0.01

    def test_comma_decimal(self, mep_file):
        mep = parse_mep_historico(mep_file)
        assert abs(mep["2026-07-02"] - 1502.30) < 0.01

    def test_get_exact_date(self, mep_file):
        mep = parse_mep_historico(mep_file)
        rate, source = get_mep_for_date(mep, "2026-07-01")
        assert abs(rate - 1500.50) < 0.01
        assert "2026-07-01" in source

    def test_get_nearest_prior(self, mep_file):
        mep = parse_mep_historico(mep_file)
        rate, source = get_mep_for_date(mep, "2026-07-04")
        assert abs(rate - 1498.00) < 0.01
        assert "último hábil" in source


# ---------------------------------------------------------------------------
# Tests: build_load_plan
# ---------------------------------------------------------------------------

class TestBuildLoadPlan:
    def _make_orders(self):
        return [
            {"id_orden": "1", "tipo": "compra", "ticker": "TEST", "fecha": "2026-07-01",
             "hora": "10:00:00", "cantidad": 10.0, "precio": 100.0, "moneda": "ARS",
             "operacion_raw": "Compra 24hs"},
            {"id_orden": "2", "tipo": "venta", "ticker": "TEST", "fecha": "2026-07-15",
             "hora": "11:00:00", "cantidad": 3.0, "precio": 110.0, "moneda": "ARS",
             "operacion_raw": "Venta 24hs"},
        ]

    def _make_tenencias(self):
        return {
            "TEST": {
                "nominales": 7.0, "ppc": 100.0, "tipo_broker": "Cedears",
                "tipo_api": "cedears", "moneda": "ARS", "dias_tenencia": 30,
            }
        }

    def _make_mep(self):
        return {"2026-07-01": 1500.0, "2026-07-15": 1510.0, "2026-06-30": 1499.0}

    def test_basic_load(self):
        orders = self._make_orders()
        to_load, dups, initials = build_load_plan(orders, self._make_tenencias(), self._make_mep(), [])
        assert len(to_load) == 2
        assert to_load[0]["tipo"] == "compra"
        assert to_load[1]["tipo"] == "venta"

    def test_idempotency_by_nota(self):
        orders = self._make_orders()
        existing = [{"ticker": "TEST", "fecha": "2026-07-01", "cantidad": 10.0,
                      "precio": 100.0, "tipo": "compra", "nota": "Orden #1"}]
        to_load, dups, _ = build_load_plan(orders, self._make_tenencias(), self._make_mep(), existing)
        assert len(to_load) == 1
        assert len(dups) == 1
        assert "Orden #1" in dups[0]["motivo"]

    def test_idempotency_by_key(self):
        orders = self._make_orders()
        existing = [{"ticker": "TEST", "fecha": "2026-07-01", "cantidad": 10.0,
                      "precio": 100.0, "tipo": "compra", "nota": "some other note"}]
        to_load, dups, _ = build_load_plan(orders, self._make_tenencias(), self._make_mep(), existing)
        assert len(to_load) == 1
        assert len(dups) == 1

    def test_tipo_cambio_assigned(self):
        orders = self._make_orders()
        to_load, _, _ = build_load_plan(orders, self._make_tenencias(), self._make_mep(), [])
        for item in to_load:
            assert item["tipo_cambio"] is not None
            assert item["tipo_cambio"] > 0

    def test_venta_sin_posicion_propone_carga_inicial(self):
        orders = [
            {"id_orden": "9", "tipo": "venta", "ticker": "SELL", "fecha": "2026-08-01",
             "hora": "10:00:00", "cantidad": 5.0, "precio": 200.0, "moneda": "ARS",
             "operacion_raw": "Venta 24hs"},
        ]
        tenencias = {
            "SELL": {
                "nominales": 0.0, "ppc": 150.0, "tipo_broker": "Cedears",
                "tipo_api": "cedears", "moneda": "ARS", "dias_tenencia": 60,
            }
        }
        mep = {"2026-07-31": 1500.0, "2026-08-01": 1510.0}
        to_load, _, initials = build_load_plan(orders, tenencias, mep, [])
        assert len(initials) >= 1
        init = [i for i in initials if i["ticker"] == "SELL"]
        assert len(init) == 1
        assert init[0]["cantidad"] == 5.0
        assert "fecha estimada" in init[0]["nota"].lower() or "carga inicial" in init[0]["nota"].lower()

    def test_no_duplicate_id_orden(self):
        orders = [
            {"id_orden": "1", "tipo": "compra", "ticker": "A", "fecha": "2026-07-01",
             "hora": "10:00:00", "cantidad": 10.0, "precio": 100.0, "moneda": "ARS",
             "operacion_raw": "Compra 24hs"},
            {"id_orden": "1", "tipo": "compra", "ticker": "A", "fecha": "2026-07-01",
             "hora": "10:00:00", "cantidad": 10.0, "precio": 100.0, "moneda": "ARS",
             "operacion_raw": "Compra 24hs"},
        ]
        to_load, dups, _ = build_load_plan(orders, {}, {"2026-07-01": 1500.0}, [])
        assert len(to_load) == 1
        assert len(dups) == 1


# ---------------------------------------------------------------------------
# Tests: reconcile
# ---------------------------------------------------------------------------

class TestReconcile:
    def test_exact_match(self):
        orders = [{"ticker": "X", "tipo": "compra", "cantidad": 10.0}]
        tenencias = {"X": {"nominales": 10.0}}
        result = reconcile(orders, [], [], tenencias)
        x_row = [r for r in result if r["ticker"] == "X"][0]
        assert x_row["ok"]

    def test_faltante(self):
        orders = [{"ticker": "X", "tipo": "compra", "cantidad": 5.0}]
        tenencias = {"X": {"nominales": 10.0}}
        result = reconcile(orders, [], [], tenencias)
        x_row = [r for r in result if r["ticker"] == "X"][0]
        assert not x_row["ok"]
        assert x_row["diff"] < 0

    def test_sobrante(self):
        orders = [{"ticker": "X", "tipo": "compra", "cantidad": 15.0}]
        tenencias = {"X": {"nominales": 10.0}}
        result = reconcile(orders, [], [], tenencias)
        x_row = [r for r in result if r["ticker"] == "X"][0]
        assert not x_row["ok"]
        assert x_row["diff"] > 0
