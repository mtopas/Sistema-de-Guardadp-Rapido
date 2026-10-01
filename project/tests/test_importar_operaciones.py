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
    parse_tenencias_precios_csv,
    build_price_plan,
    apply_prices,
    normalize_excluir,
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


# ---------------------------------------------------------------------------
# Fixtures: price update
# ---------------------------------------------------------------------------

TENENCIAS_PRECIOS_HEADER = "Ticker;Tipo de Instrumento;Acciones;Nominales;Precio;Precio promedio de compra;Variacion porcentual;Ganancia;Valor actual;Moneda"

TENENCIAS_PRECIOS_ROWS_UTF8 = [
    "AAPL;Cedears;10;10;15500,00;14000,00;10,71;15000,00;155000,00;Pesos",
    "GOOGL;Cedears;5;5;9200,50;8500,00;8,24;3502,50;46002,50;Pesos",
    "SPY;Cedears;3;3;8100,00;7500,00;8,00;1800,00;24300,00;Pesos",
    "AO28;Bonos;100;100;1200,00;1100,00;9,09;10000,00;120000,00;Pesos",
    "NOENAPI;Cedears;2;2;5000,00;4500,00;11,11;1000,00;10000,00;Pesos",
]

TENENCIAS_PRECIOS_ROWS_LATIN1 = [
    "AAPL;Cedears;10;10;15500,00;14000,00;10,71;15000,00;155000,00;Pesos",
    "MSFT;Cedears;6;6;7800,00;7000,00;11,43;4800,00;46800,00;D\xf3lares",
]


def _write_tenencias_precios(path, rows, encoding="utf-8"):
    with open(path, "w", encoding=encoding, newline="") as f:
        f.write(TENENCIAS_PRECIOS_HEADER + "\n")
        for row in rows:
            f.write(row + "\n")


@pytest.fixture
def tenencias_precios_file(tmp_path):
    p = tmp_path / "tenencias.csv"
    _write_tenencias_precios(str(p), TENENCIAS_PRECIOS_ROWS_UTF8)
    return str(p)


@pytest.fixture
def tenencias_precios_latin1(tmp_path):
    p = tmp_path / "tenencias_latin1.csv"
    _write_tenencias_precios(str(p), TENENCIAS_PRECIOS_ROWS_LATIN1, encoding="latin-1")
    return str(p)


MOCK_INSTRUMENTS = [
    {"id": 1, "tipo": "cedears", "ticker": "AAPL", "cantidad": 10, "costo_usd": 100.0, "precio_actual": None},
    {"id": 2, "tipo": "cedears", "ticker": "GOOGL", "cantidad": 5, "costo_usd": 50.0, "precio_actual": None},
    {"id": 3, "tipo": "cedears", "ticker": "SPY", "cantidad": 3, "costo_usd": 30.0, "precio_actual": None},
    {"id": 4, "tipo": "bonos", "ticker": "AO28", "cantidad": 100, "costo_usd": 80.0, "precio_actual": None},
    {"id": 5, "tipo": "cedears", "ticker": "TZX26", "cantidad": 200000, "costo_usd": 500.0, "precio_actual": None},
]

MEP_RATE = 1548.10


# ---------------------------------------------------------------------------
# Tests: parse_tenencias_precios_csv
# ---------------------------------------------------------------------------

class TestParseTenenciasPrecios:
    def test_parse_utf8(self, tenencias_precios_file):
        items = parse_tenencias_precios_csv(tenencias_precios_file)
        assert len(items) == 5
        aapl = [i for i in items if i["ticker"] == "AAPL"][0]
        assert abs(aapl["precio_ars"] - 15500.0) < 0.01

    def test_parse_latin1(self, tenencias_precios_latin1):
        items = parse_tenencias_precios_csv(tenencias_precios_latin1)
        assert len(items) == 2
        msft = [i for i in items if i["ticker"] == "MSFT"][0]
        assert abs(msft["precio_ars"] - 7800.0) < 0.01

    def test_comma_decimal(self, tenencias_precios_file):
        items = parse_tenencias_precios_csv(tenencias_precios_file)
        googl = [i for i in items if i["ticker"] == "GOOGL"][0]
        assert abs(googl["precio_ars"] - 9200.50) < 0.01

    def test_valor_actual_parsed(self, tenencias_precios_file):
        items = parse_tenencias_precios_csv(tenencias_precios_file)
        aapl = [i for i in items if i["ticker"] == "AAPL"][0]
        assert abs(aapl["valor_actual_csv"] - 155000.0) < 0.01


# ---------------------------------------------------------------------------
# Tests: build_price_plan
# ---------------------------------------------------------------------------

class TestBuildPricePlan:
    def test_matching(self, tenencias_precios_file):
        csv_items = parse_tenencias_precios_csv(tenencias_precios_file)
        matched, unmatched = build_price_plan(csv_items, MOCK_INSTRUMENTS, MEP_RATE)
        matched_tickers = {m["ticker"] for m in matched}
        assert "AAPL" in matched_tickers
        assert "GOOGL" in matched_tickers
        assert "AO28" in matched_tickers

    def test_unmatched_instruments(self, tenencias_precios_file):
        csv_items = parse_tenencias_precios_csv(tenencias_precios_file)
        matched, unmatched = build_price_plan(csv_items, MOCK_INSTRUMENTS, MEP_RATE)
        unmatched_tickers = {u["ticker"] for u in unmatched}
        assert "TZX26" in unmatched_tickers

    def test_conversion_ars_to_usd(self, tenencias_precios_file):
        csv_items = parse_tenencias_precios_csv(tenencias_precios_file)
        matched, _ = build_price_plan(csv_items, MOCK_INSTRUMENTS, MEP_RATE)
        aapl = [m for m in matched if m["ticker"] == "AAPL"][0]
        expected_usd = 15500.0 / MEP_RATE
        assert abs(aapl["precio_usd_new"] - expected_usd) < 0.001

    def test_mep_stored(self, tenencias_precios_file):
        csv_items = parse_tenencias_precios_csv(tenencias_precios_file)
        matched, _ = build_price_plan(csv_items, MOCK_INSTRUMENTS, MEP_RATE)
        for m in matched:
            assert m["mep_used"] == MEP_RATE


# ---------------------------------------------------------------------------
# Tests: apply_prices
# ---------------------------------------------------------------------------

class TestApplyPrices:
    def _make_matched(self):
        return [
            {"inst_id": 1, "ticker": "AAPL", "tipo": "cedears", "cantidad": 10,
             "precio_actual_old": None, "precio_ars": 15500.0,
             "precio_usd_new": 10.012919, "mep_used": 1548.1,
             "moneda_csv": "Pesos", "valor_actual_csv": 155000.0},
            {"inst_id": 2, "ticker": "GOOGL", "tipo": "cedears", "cantidad": 5,
             "precio_actual_old": 5.0, "precio_ars": 9200.50,
             "precio_usd_new": 5.943285, "mep_used": 1548.1,
             "moneda_csv": "Pesos", "valor_actual_csv": 46002.5},
        ]

    def test_dry_run_no_writes(self):
        matched = self._make_matched()
        results = apply_prices(matched, "http://fake:8765", dry_run=True)
        assert all(r["status"] == "dry-run" for r in results)

    def test_idempotent_unchanged(self):
        matched = [
            {"inst_id": 1, "ticker": "AAPL", "tipo": "cedears", "cantidad": 10,
             "precio_actual_old": 10.012919, "precio_ars": 15500.0,
             "precio_usd_new": 10.012919, "mep_used": 1548.1,
             "moneda_csv": "Pesos", "valor_actual_csv": 155000.0},
        ]
        results = apply_prices(matched, "http://fake:8765", dry_run=False)
        assert results[0]["status"] == "unchanged"

    def test_position_without_csv_untouched(self, tenencias_precios_file):
        csv_items = parse_tenencias_precios_csv(tenencias_precios_file)
        matched, unmatched = build_price_plan(csv_items, MOCK_INSTRUMENTS, MEP_RATE)
        tzx26 = [u for u in unmatched if u["ticker"] == "TZX26"]
        assert len(tzx26) == 1
        assert tzx26[0]["precio_actual"] is None


# ---------------------------------------------------------------------------
# Tests: --excluir-tickers
# ---------------------------------------------------------------------------

ORDENES_ROWS_CON_EXCLUIDO = ORDENES_ROWS + [
    "Compra 24hs;Ejecutada;100010;TZX26;Pesos;2026-07-20;10:00:00;200000;1,5;300000;1,5;200000",
    "Venta 24hs;Ejecutada;100011;TZX26;Pesos;2026-08-20;10:00:00;200000;1,6;320000;1,6;200000",
]

TENENCIAS_PRECIOS_ROWS_CON_EXCLUIDO = TENENCIAS_PRECIOS_ROWS_UTF8 + [
    "TZX26;Cedears;200000;200000;1,60;1,50;6,67;20000,00;320000,00;Pesos",
]


@pytest.fixture
def ordenes_con_excluido(tmp_path):
    p = tmp_path / "ordenes_excluido.csv"
    _write_csv(str(p), ORDENES_HEADER, ORDENES_ROWS_CON_EXCLUIDO)
    return str(p)


@pytest.fixture
def tenencias_precios_con_excluido(tmp_path):
    p = tmp_path / "tenencias_excluido.csv"
    _write_tenencias_precios(str(p), TENENCIAS_PRECIOS_ROWS_CON_EXCLUIDO)
    return str(p)


class TestExcluirTickers:
    def test_normalize_excluir_none_empty(self):
        assert normalize_excluir(None) == set()
        assert normalize_excluir([]) == set()

    def test_normalize_excluir_upper_strip(self):
        assert normalize_excluir([" tzx26 ", "cres"]) == {"TZX26", "CRES"}

    def test_ordenes_excluye_ticker(self, ordenes_con_excluido):
        orders, skipped = parse_ordenes(ordenes_con_excluido, excluir=["TZX26"])
        tickers = [o["ticker"] for o in orders]
        assert "TZX26" not in tickers
        # las de TZX26 van a skipped con el motivo correcto
        tzx_skip = [s for s in skipped if s["ticker"].upper() == "TZX26"]
        assert len(tzx_skip) == 2
        assert all("excluido" in s["motivo"] for s in tzx_skip)

    def test_ordenes_sin_excluir_carga_ticker(self, ordenes_con_excluido):
        orders, _ = parse_ordenes(ordenes_con_excluido)
        tickers = [o["ticker"] for o in orders]
        assert "TZX26" in tickers

    def test_ordenes_excluir_case_insensitive(self, ordenes_con_excluido):
        orders, _ = parse_ordenes(ordenes_con_excluido, excluir=["tzx26"])
        assert "TZX26" not in [o["ticker"] for o in orders]

    def test_precios_excluye_ticker(self, tenencias_precios_con_excluido):
        items = parse_tenencias_precios_csv(tenencias_precios_con_excluido, excluir=["TZX26"])
        assert "TZX26" not in {i["ticker"] for i in items}
        # el resto sigue estando
        assert "AAPL" in {i["ticker"] for i in items}

    def test_precios_sin_excluir_incluye_ticker(self, tenencias_precios_con_excluido):
        items = parse_tenencias_precios_csv(tenencias_precios_con_excluido)
        assert "TZX26" in {i["ticker"] for i in items}

    def test_otros_tickers_no_se_tocan(self, ordenes_con_excluido):
        # CRES/TXAR-style: excluir TZX26 no debe afectar a AAPL/BOND1
        orders, _ = parse_ordenes(ordenes_con_excluido, excluir=["TZX26"])
        tickers = {o["ticker"] for o in orders}
        assert "AAPL" in tickers
        assert "BOND1" in tickers
