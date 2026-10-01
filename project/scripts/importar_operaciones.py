#!/usr/bin/env python3
"""
Importador de operaciones de broker al ledger de Finanzas (fin_transacciones_instrumento).

Uso (importar operaciones):
    python importar_operaciones.py ordenes.csv tenencias.xlsx mep.csv [--aplicar] [--api URL]

Uso (actualizar precios):
    python importar_operaciones.py --actualizar-precios tenencias.csv [--aplicar] [--api URL]

- Dry-run por defecto: muestra lo que haría sin escribir.
- --aplicar: ejecuta POST/PATCH contra la API.
- --api: URL base de la API (default http://192.168.137.10:8765).
"""
import argparse
import csv
import json
import re
import sys
import urllib.request
import urllib.error
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

def parse_decimal(val: str) -> float:
    """Parse a number that may use comma as decimal separator."""
    val = val.strip()
    if not val or val == "-1":
        return -1.0
    val = val.replace(".", "").replace(",", ".")
    if val.count(".") > 1:
        parts = val.rsplit(".", 1)
        val = parts[0].replace(".", "") + "." + parts[1]
    return float(val)


def parse_decimal_safe(val: str) -> Optional[float]:
    """Parse decimal, return None if empty/invalid."""
    val = val.strip()
    if not val or val == "-1":
        return None
    val = val.replace(".", "").replace(",", ".")
    if val.count(".") > 1:
        parts = val.rsplit(".", 1)
        val = parts[0].replace(".", "") + "." + parts[1]
    return float(val)


def detect_encoding(path: str) -> str:
    with open(path, "rb") as f:
        raw = f.read(4096)
    try:
        raw.decode("utf-8")
        return "utf-8"
    except UnicodeDecodeError:
        return "latin-1"


# ---------------------------------------------------------------------------
# Parsers
# ---------------------------------------------------------------------------

ESTADOS_IGNORAR = {"cancelada", "rechazada", "pendiente", "finalizada"}
OPERACIONES_IGNORAR = {"depósito", "deposito", "transferencia"}

TIPO_INSTRUMENTO_MAP = {
    "Acciones": "acciones",
    "Cedears": "cedears",
    "Bonos": "bonos",
}


def parse_ordenes(path: str) -> tuple[list[dict], list[dict]]:
    """
    Parse broker orders CSV.
    Returns (orders_to_load, skipped_orders).
    Each order dict has normalized fields.
    """
    enc = detect_encoding(path)
    orders = []
    skipped = []

    with open(path, encoding=enc, newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            operacion_raw = row["Operacion"].strip()
            estado = row["Estado"].strip().lower()
            id_orden = row["id Orden"].strip()
            ticker = row["Ticker"].strip()
            moneda_raw = row["Moneda"].strip()
            fecha = row["Fecha"].strip()
            hora = row["Hora"].strip()
            cantidad_operada = parse_decimal(row["Cantidad Operada"].strip())
            precio_operado = parse_decimal(row["Precio Operado"].strip())

            operacion_lower = operacion_raw.lower()
            operacion_base = operacion_lower.replace(" 24hs", "").replace(" 48hs", "").strip()

            if operacion_base in OPERACIONES_IGNORAR:
                skipped.append({
                    "id_orden": id_orden,
                    "operacion": operacion_raw,
                    "ticker": ticker,
                    "fecha": fecha,
                    "motivo": f"operación no es compra/venta ({operacion_raw})",
                })
                continue

            if estado in ESTADOS_IGNORAR:
                skipped.append({
                    "id_orden": id_orden,
                    "operacion": operacion_raw,
                    "ticker": ticker,
                    "fecha": fecha,
                    "estado": estado,
                    "motivo": f"estado: {estado}",
                })
                continue

            if estado != "ejecutada":
                skipped.append({
                    "id_orden": id_orden,
                    "operacion": operacion_raw,
                    "ticker": ticker,
                    "fecha": fecha,
                    "estado": estado,
                    "motivo": f"estado desconocido: {estado}",
                })
                continue

            if cantidad_operada <= 0 or precio_operado <= 0:
                skipped.append({
                    "id_orden": id_orden,
                    "operacion": operacion_raw,
                    "ticker": ticker,
                    "fecha": fecha,
                    "motivo": "cantidad/precio operado <= 0",
                })
                continue

            if not ticker:
                skipped.append({
                    "id_orden": id_orden,
                    "operacion": operacion_raw,
                    "fecha": fecha,
                    "motivo": "sin ticker",
                })
                continue

            tipo = "compra" if "compra" in operacion_base else "venta"

            moneda_api = "ARS" if moneda_raw.lower() in ("pesos", "ars") else "USD"

            orders.append({
                "id_orden": id_orden,
                "tipo": tipo,
                "ticker": ticker.upper().strip(),
                "fecha": fecha,
                "hora": hora,
                "cantidad": cantidad_operada,
                "precio": precio_operado,
                "moneda": moneda_api,
                "operacion_raw": operacion_raw,
            })

    orders.sort(key=lambda o: (o["fecha"], o["hora"]))
    return orders, skipped


MESES_ES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4,
    "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
    "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}


def parse_mep_historico(path: str) -> dict[str, float]:
    """Parse DolarMEP-historico.csv -> {YYYY-MM-DD: cotizacion}."""
    enc = detect_encoding(path)
    mep = {}
    with open(path, encoding=enc, newline="") as f:
        reader = csv.reader(f, delimiter=";")
        for row in reader:
            if len(row) < 2:
                continue
            fecha_str = row[0].strip()
            valor_str = row[1].strip()
            m = re.match(
                r"(?:\w+),?\s+(\d{1,2})\s+de\s+(\w+)\s+del?\s+(\d{4})",
                fecha_str,
            )
            if not m:
                continue
            dia = int(m.group(1))
            mes_nombre = m.group(2).lower()
            anio = int(m.group(3))
            mes = MESES_ES.get(mes_nombre)
            if not mes:
                continue
            valor = parse_decimal_safe(valor_str)
            if valor is None:
                continue
            key = f"{anio:04d}-{mes:02d}-{dia:02d}"
            mep[key] = valor
    return mep


def get_mep_for_date(mep_data: dict[str, float], fecha: str) -> tuple[float, str]:
    """
    Get MEP rate for a date. If exact date not available, use nearest prior date.
    Returns (rate, source_description).
    """
    if fecha in mep_data:
        return mep_data[fecha], f"MEP {fecha}"

    dt = datetime.strptime(fecha, "%Y-%m-%d")
    for delta in range(1, 10):
        prev = (dt - timedelta(days=delta)).strftime("%Y-%m-%d")
        if prev in mep_data:
            return mep_data[prev], f"MEP {prev} (último hábil antes de {fecha})"

    sorted_dates = sorted(mep_data.keys())
    if sorted_dates:
        closest = min(sorted_dates, key=lambda d: abs((datetime.strptime(d, "%Y-%m-%d") - dt).days))
        return mep_data[closest], f"MEP {closest} (más cercano a {fecha})"

    return 0.0, "sin cotización MEP disponible"


def parse_tenencias_xlsx(path: str) -> dict[str, dict]:
    """
    Parse tenencias XLSX using openpyxl.
    Falls back to subprocess with global Python if openpyxl not in venv.
    Returns {TICKER: {nominales, ppc, tipo, moneda, ...}}.
    """
    try:
        import openpyxl
        return _parse_tenencias_xlsx_direct(path)
    except ImportError:
        return _parse_tenencias_xlsx_subprocess(path)


def _parse_tenencias_xlsx_direct(path: str) -> dict[str, dict]:
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    return _build_tenencias_from_rows(rows)


def _parse_tenencias_xlsx_subprocess(path: str) -> dict[str, dict]:
    """Parse XLSX using zipfile + xml.etree (no external dependencies)."""
    import zipfile
    import xml.etree.ElementTree as ET

    try:
        zf = zipfile.ZipFile(path)
    except Exception as e:
        print(f"WARN: no se pudo abrir XLSX: {e}", file=sys.stderr)
        return {}

    ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

    shared_strings = []
    if "xl/sharedStrings.xml" in zf.namelist():
        ss_tree = ET.parse(zf.open("xl/sharedStrings.xml"))
        for si in ss_tree.findall(".//s:si", ns):
            parts = []
            for t in si.iter():
                if t.text:
                    parts.append(t.text)
            shared_strings.append("".join(parts))

    sheet_tree = ET.parse(zf.open("xl/worksheets/sheet1.xml"))
    rows_data = []
    for row_el in sheet_tree.findall(".//s:sheetData/s:row", ns):
        cells = []
        for c in row_el.findall("s:c", ns):
            v_el = c.find("s:v", ns)
            t = c.get("t", "")
            val = ""
            if v_el is not None and v_el.text:
                if t == "s":
                    idx = int(v_el.text)
                    val = shared_strings[idx] if idx < len(shared_strings) else ""
                else:
                    try:
                        val = float(v_el.text)
                    except ValueError:
                        val = v_el.text
            cells.append(val)
        rows_data.append(tuple(cells))

    zf.close()
    return _build_tenencias_from_rows(rows_data)


def _build_tenencias_from_rows(rows) -> dict[str, dict]:
    if not rows:
        return {}

    header = [str(c).strip() if c else "" for c in rows[0]]
    col = {name: i for i, name in enumerate(header)}

    tenencias = {}
    for row in rows[1:]:
        ticker = str(row[col.get("Ticker", 0)] if col.get("Ticker", 0) < len(row) else "").strip().upper()
        if not ticker:
            continue
        tipo_raw = str(row[col.get("Tipo de Instrumento", 1)] if col.get("Tipo de Instrumento", 1) < len(row) else "").strip()

        nom_idx = col.get("Nominales", 3)
        nominales = float(row[nom_idx]) if nom_idx < len(row) and row[nom_idx] else 0.0

        ppc_idx = col.get("Precio promedio de compra", 8)
        ppc_raw = row[ppc_idx] if ppc_idx < len(row) else None
        ppc = float(ppc_raw) if ppc_raw else 0.0

        mon_idx = col.get("Moneda", len(row) - 1)
        moneda = str(row[mon_idx] if mon_idx < len(row) else "").strip()

        dias_idx = col.get("Dias promedio de tenencia", col.get("Días promedio de tenencia", 14))
        dias_raw = row[dias_idx] if dias_idx < len(row) else None
        dias_tenencia = float(dias_raw) if dias_raw else 0.0

        tenencias[ticker] = {
            "nominales": nominales,
            "ppc": ppc,
            "tipo_broker": tipo_raw,
            "tipo_api": TIPO_INSTRUMENTO_MAP.get(tipo_raw, "acciones"),
            "moneda": "USD" if moneda.lower().startswith("d") else "ARS",
            "dias_tenencia": dias_tenencia,
        }

    return tenencias


def parse_tenencias_csv_fallback(path: str) -> dict[str, dict]:
    """Fallback: if XLSX can't be read, try CSV."""
    enc = detect_encoding(path)
    tenencias = {}
    with open(path, encoding=enc, newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            ticker = row.get("Ticker", "").strip().upper()
            if not ticker:
                continue
            tipo_raw = row.get("Tipo de Instrumento", "").strip()
            nominales = parse_decimal_safe(row.get("Nominales", "0")) or 0.0
            ppc = parse_decimal_safe(row.get("Precio promedio de compra", "0")) or 0.0
            moneda = row.get("Moneda", "").strip()
            dias_raw = row.get("Días promedio de tenencia", "0")
            dias = parse_decimal_safe(dias_raw) or 0.0

            tenencias[ticker] = {
                "nominales": nominales,
                "ppc": ppc,
                "tipo_broker": tipo_raw,
                "tipo_api": TIPO_INSTRUMENTO_MAP.get(tipo_raw, "acciones"),
                "moneda": "USD" if moneda.lower().startswith("d") else "ARS",
                "dias_tenencia": dias,
            }
    return tenencias


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

def api_get(base_url: str, path: str):
    url = f"{base_url}{path}"
    req = urllib.request.Request(url)
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read().decode())


def api_post(base_url: str, path: str, data: dict):
    url = f"{base_url}{path}"
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        resp = urllib.request.urlopen(req)
        return json.loads(resp.read().decode()), resp.status
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        return {"error": error_body, "status": e.code}, e.code


def api_patch(base_url: str, path: str, data: dict):
    url = f"{base_url}{path}"
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="PATCH")
    req.add_header("Content-Type", "application/json")
    try:
        resp = urllib.request.urlopen(req)
        return json.loads(resp.read().decode()), resp.status
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        return {"error": error_body, "status": e.code}, e.code


# ---------------------------------------------------------------------------
# Price update logic
# ---------------------------------------------------------------------------

def parse_tenencias_precios_csv(path: str) -> list[dict]:
    """
    Parse broker holdings CSV (MisInstrumentos) for current prices.
    Columns: Ticker, Precio (ARS per unit), Valor actual, Moneda.
    Delimiter ;, encoding Latin-1 or UTF-8.
    """
    enc = detect_encoding(path)
    items = []
    with open(path, encoding=enc, newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            ticker = (row.get("Ticker") or "").strip().upper()
            if not ticker:
                continue
            precio_str = (row.get("Precio") or "").strip()
            precio_ars = parse_decimal_safe(precio_str)
            moneda = (row.get("Moneda") or "").strip()
            valor_actual_str = (row.get("Valor actual") or "").strip()
            valor_actual = parse_decimal_safe(valor_actual_str)
            items.append({
                "ticker": ticker,
                "precio_ars": precio_ars,
                "moneda_csv": moneda,
                "valor_actual_csv": valor_actual,
            })
    return items


def build_price_plan(
    csv_items: list[dict],
    instruments: list[dict],
    mep_rate: float,
) -> tuple[list[dict], list[dict]]:
    """
    Match CSV tickers to API instruments and compute precio_actual in USD.
    Returns (matched, unmatched_instruments).
    matched: [{inst_id, ticker, precio_actual_old, precio_ars, precio_usd_new, mep_used}, ...]
    unmatched: instruments without a CSV row.
    """
    csv_by_ticker = {}
    for item in csv_items:
        csv_by_ticker[item["ticker"]] = item

    matched = []
    unmatched = []

    for inst in instruments:
        ticker = (inst.get("ticker") or "").upper().strip()
        csv_row = csv_by_ticker.pop(ticker, None)
        if csv_row is None:
            unmatched.append(inst)
            continue

        precio_ars = csv_row["precio_ars"]
        if precio_ars is None or precio_ars <= 0:
            unmatched.append(inst)
            continue

        precio_usd = precio_ars / mep_rate if mep_rate > 0 else 0.0

        matched.append({
            "inst_id": inst["id"],
            "ticker": ticker,
            "tipo": inst.get("tipo", ""),
            "cantidad": inst.get("cantidad", 0),
            "precio_actual_old": inst.get("precio_actual"),
            "precio_ars": precio_ars,
            "precio_usd_new": round(precio_usd, 6),
            "mep_used": mep_rate,
            "moneda_csv": csv_row["moneda_csv"],
            "valor_actual_csv": csv_row["valor_actual_csv"],
        })

    return matched, unmatched


def apply_prices(matched: list[dict], base_url: str, dry_run: bool = True):
    """PATCH precio_actual for each matched instrument. Idempotent."""
    results = []
    for item in matched:
        new_price = item["precio_usd_new"]
        old_price = item["precio_actual_old"]

        if old_price is not None and abs(old_price - new_price) < 1e-6:
            results.append({**item, "status": "unchanged"})
            continue

        if dry_run:
            results.append({**item, "status": "dry-run"})
            continue

        resp, status = api_patch(
            base_url,
            f"/fin/instrumentos/{item['inst_id']}",
            {"precio_actual": new_price},
        )
        if status in (200, 201):
            results.append({**item, "status": "updated"})
        else:
            results.append({**item, "status": f"error ({status})", "error": resp})

    return results


def cmd_actualizar_precios(args):
    """Entry point for --actualizar-precios mode."""
    tenencias_path = args.actualizar_precios
    base_url = args.api
    aplicar = args.aplicar

    print("=" * 70)
    print("ACTUALIZACIÓN DE PRECIOS DESDE TENENCIAS DEL BROKER")
    print("=" * 70)
    print(f"Modo: {'APLICAR' if aplicar else 'DRY-RUN (sin escritura)'}")
    print(f"API: {base_url}")
    print(f"Archivo: {tenencias_path}")
    print()

    csv_items = parse_tenencias_precios_csv(tenencias_path)
    print(f"  -> {len(csv_items)} filas en CSV")

    instruments = api_get(base_url, "/fin/instrumentos")
    print(f"  -> {len(instruments)} instrumentos en API")

    config = api_get(base_url, "/fin/config")
    mep_rate = float(config.get("dolar_mep") or config.get("dolar_oficial") or 0)
    print(f"  -> MEP vigente: {mep_rate}")

    if mep_rate <= 0:
        print("ERROR: no hay cotización MEP en fin_config. Abortando.")
        sys.exit(1)

    matched, unmatched = build_price_plan(csv_items, instruments, mep_rate)

    print(f"\n{'=' * 70}")
    print("PLAN DE ACTUALIZACIÓN")
    print("=" * 70)
    print(f"{'Ticker':<10} {'Tipo':<10} {'Cant':>10} {'P.ARS':>14} {'P.USD nuevo':>14} {'P.USD viejo':>14} {'Estado'}")
    print("-" * 90)

    results = apply_prices(matched, base_url, dry_run=not aplicar)

    for r in results:
        old_str = f"{r['precio_actual_old']:.6f}" if r['precio_actual_old'] is not None else "null"
        print(f"{r['ticker']:<10} {r['tipo']:<10} {r['cantidad']:>10.2f} {r['precio_ars']:>14.2f} {r['precio_usd_new']:>14.6f} {old_str:>14} {r['status']}")

    if unmatched:
        print(f"\n{'=' * 70}")
        print("INSTRUMENTOS SIN FILA EN CSV (no se tocan)")
        print("=" * 70)
        for inst in unmatched:
            print(f"  {inst.get('ticker', '?'):<10} tipo={inst.get('tipo', '?'):<10} cant={inst.get('cantidad', 0):.2f}")

    updated = sum(1 for r in results if r["status"] == "updated")
    unchanged = sum(1 for r in results if r["status"] == "unchanged")
    errors = sum(1 for r in results if r["status"].startswith("error"))

    print(f"\nResumen: {updated} actualizados, {unchanged} sin cambio, {errors} errores, {len(unmatched)} sin CSV")

    if not aplicar:
        print(f"\n{'=' * 70}")
        print("DRY-RUN completado. Para aplicar: agregar --aplicar")
        print("=" * 70)


# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------

def build_load_plan(
    orders: list[dict],
    tenencias: dict[str, dict],
    mep_data: dict[str, float],
    existing_transactions: list[dict],
) -> tuple[list[dict], list[dict], list[dict]]:
    """
    Build the load plan.
    Returns (to_load, duplicates, initial_loads_proposed).
    """
    existing_keys = set()
    for tx in existing_transactions:
        ticker = (tx.get("ticker") or "").upper().strip()
        key = (
            ticker,
            tx.get("fecha", "")[:10],
            round(tx.get("cantidad", 0), 4),
            round(tx.get("precio", 0), 4),
            tx.get("tipo", ""),
        )
        existing_keys.add(key)

    existing_notas = set()
    for tx in existing_transactions:
        nota = tx.get("nota") or ""
        m = re.search(r"Orden\s*#?\s*(\d+)", nota)
        if m:
            existing_notas.add(m.group(1))

    to_load = []
    duplicates = []
    seen_ordenes = set()

    for order in orders:
        id_orden = order["id_orden"]

        if id_orden in seen_ordenes:
            duplicates.append({**order, "motivo": f"id_orden {id_orden} duplicado en CSV"})
            continue
        seen_ordenes.add(id_orden)

        if id_orden in existing_notas:
            duplicates.append({**order, "motivo": f"Orden #{id_orden} ya en ledger (por nota)"})
            continue

        key = (
            order["ticker"],
            order["fecha"][:10],
            round(order["cantidad"], 4),
            round(order["precio"], 4),
            order["tipo"],
        )
        if key in existing_keys:
            duplicates.append({**order, "motivo": "duplicado por ticker+fecha+cantidad+precio+tipo"})
            continue

        tc = None
        tc_source = ""
        if order["moneda"] == "ARS":
            tc, tc_source = get_mep_for_date(mep_data, order["fecha"])
            if tc <= 0:
                tc = None
                tc_source = "SIN COTIZACIÓN"

        tenencia = tenencias.get(order["ticker"], {})
        tipo_inst = tenencia.get("tipo_api", "cedears")

        to_load.append({
            **order,
            "tipo_cambio": tc,
            "tc_source": tc_source,
            "instrumento_tipo": tipo_inst,
            "nombre": order["ticker"],
        })

    position = defaultdict(float)
    for tx in existing_transactions:
        ticker = (tx.get("ticker") or "").upper().strip()
        cant = tx.get("cantidad", 0)
        if tx.get("tipo") == "compra":
            position[ticker] += cant
        else:
            position[ticker] -= cant

    initial_loads = []
    for item in to_load:
        ticker = item["ticker"]
        cant = item["cantidad"]
        if item["tipo"] == "compra":
            position[ticker] += cant
        else:
            if position[ticker] < cant:
                needed = cant - position[ticker]
                tenencia = tenencias.get(ticker, {})
                ppc = tenencia.get("ppc", 0)
                first_date = datetime.strptime(item["fecha"], "%Y-%m-%d")
                est_date = (first_date - timedelta(days=1)).strftime("%Y-%m-%d")

                tc_init = None
                tc_init_source = ""
                moneda_init = tenencia.get("moneda", "ARS")
                if moneda_init == "ARS" or item["moneda"] == "ARS":
                    moneda_init = "ARS"
                    tc_init, tc_init_source = get_mep_for_date(mep_data, est_date)

                initial_loads.append({
                    "ticker": ticker,
                    "tipo": "compra",
                    "cantidad": needed,
                    "precio": ppc,
                    "fecha": est_date,
                    "moneda": moneda_init,
                    "tipo_cambio": tc_init,
                    "tc_source": tc_init_source,
                    "instrumento_tipo": item["instrumento_tipo"],
                    "nombre": ticker,
                    "nota": f"Carga inicial - fecha estimada - PPC del broker",
                    "es_carga_inicial": True,
                })
                position[ticker] += needed

            position[ticker] -= cant

    final_vs_tenencias = []
    all_tickers = set(position.keys()) | set(tenencias.keys())
    for ticker in sorted(all_tickers):
        ledger_qty = round(position.get(ticker, 0), 4)
        csv_qty = tenencias.get(ticker, {}).get("nominales", 0)
        diff = round(ledger_qty - csv_qty, 4)
        if abs(diff) > 0.001 and ticker not in [il["ticker"] for il in initial_loads]:
            if diff < 0:
                tenencia = tenencias.get(ticker, {})
                ppc = tenencia.get("ppc", 0)
                dias = tenencia.get("dias_tenencia", 0)
                est_date = (datetime.now() - timedelta(days=dias)).strftime("%Y-%m-%d") if dias > 0 else (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")

                first_order = None
                for item in to_load:
                    if item["ticker"] == ticker:
                        first_order = item
                        break
                if first_order:
                    est_date = (datetime.strptime(first_order["fecha"], "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")

                tc_init = None
                tc_init_source = ""
                moneda_init = tenencia.get("moneda", "ARS")
                if moneda_init == "ARS":
                    tc_init, tc_init_source = get_mep_for_date(mep_data, est_date)

                initial_loads.append({
                    "ticker": ticker,
                    "tipo": "compra",
                    "cantidad": abs(diff),
                    "precio": ppc,
                    "fecha": est_date,
                    "moneda": moneda_init,
                    "tipo_cambio": tc_init,
                    "tc_source": tc_init_source,
                    "instrumento_tipo": tenencia.get("tipo_api", "cedears"),
                    "nombre": ticker,
                    "nota": f"Carga inicial - fecha estimada ({est_date}) - PPC del broker",
                    "es_carga_inicial": True,
                })

    return to_load, duplicates, initial_loads


def reconcile(
    orders_loaded: list[dict],
    initial_loads: list[dict],
    existing_transactions: list[dict],
    tenencias: dict[str, dict],
) -> list[dict]:
    """Compare final positions vs tenencias CSV."""
    position = defaultdict(float)

    for tx in existing_transactions:
        ticker = (tx.get("ticker") or "").upper().strip()
        if tx.get("tipo") == "compra":
            position[ticker] += tx.get("cantidad", 0)
        else:
            position[ticker] -= tx.get("cantidad", 0)

    for item in initial_loads:
        if item["tipo"] == "compra":
            position[item["ticker"]] += item["cantidad"]
        else:
            position[item["ticker"]] -= item["cantidad"]

    for item in orders_loaded:
        if item["tipo"] == "compra":
            position[item["ticker"]] += item["cantidad"]
        else:
            position[item["ticker"]] -= item["cantidad"]

    result = []
    all_tickers = sorted(set(position.keys()) | set(tenencias.keys()))
    for ticker in all_tickers:
        ledger = round(position.get(ticker, 0), 4)
        csv_nom = tenencias.get(ticker, {}).get("nominales", 0)
        diff = round(ledger - csv_nom, 4)
        result.append({
            "ticker": ticker,
            "ledger": ledger,
            "tenencia_csv": csv_nom,
            "diff": diff,
            "ok": abs(diff) < 0.01,
        })
    return result


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Importar operaciones de broker al ledger de Finanzas")
    parser.add_argument("ordenes", nargs="?", help="Ruta al CSV de órdenes del broker")
    parser.add_argument("tenencias", nargs="?", help="Ruta al XLSX/CSV de tenencias actuales")
    parser.add_argument("mep", nargs="?", help="Ruta al CSV de dólar MEP histórico")
    parser.add_argument("--aplicar", action="store_true", help="Ejecutar las operaciones (default: dry-run)")
    parser.add_argument("--api", default="http://192.168.137.10:8765", help="URL base de la API")
    parser.add_argument("--actualizar-precios", metavar="CSV",
                        help="Actualizar precio_actual desde CSV de tenencias del broker (MisInstrumentos)")
    args = parser.parse_args()

    if args.actualizar_precios:
        cmd_actualizar_precios(args)
        return

    if not args.ordenes or not args.tenencias or not args.mep:
        parser.error("Se requieren ordenes, tenencias y mep para importar operaciones")

    print("=" * 70)
    print("IMPORTADOR DE OPERACIONES DE BROKER")
    print("=" * 70)
    print(f"Modo: {'APLICAR' if args.aplicar else 'DRY-RUN (sin escritura)'}")
    print(f"API: {args.api}")
    print()

    # 1. Parse sources
    print("Parseando órdenes...")
    orders, skipped = parse_ordenes(args.ordenes)
    print(f"  -> {len(orders)} ejecutadas, {len(skipped)} omitidas")

    print("Parseando dólar MEP histórico...")
    mep_data = parse_mep_historico(args.mep)
    print(f"  -> {len(mep_data)} cotizaciones")

    print("Parseando tenencias...")
    tenencias_path = Path(args.tenencias)
    if tenencias_path.suffix.lower() == ".xlsx":
        tenencias = parse_tenencias_xlsx(str(tenencias_path))
    else:
        tenencias = parse_tenencias_csv_fallback(str(tenencias_path))
    print(f"  -> {len(tenencias)} instrumentos")

    # 2. Read existing ledger
    print("Leyendo ledger existente...")
    existing = api_get(args.api, "/fin/transacciones")
    print(f"  -> {len(existing)} transacciones existentes")

    # 3. Build plan
    print("\nConstruyendo plan de carga...")
    to_load, duplicates, initial_loads = build_load_plan(orders, tenencias, mep_data, existing)

    # 4. Report
    print("\n" + "=" * 70)
    print("ÓRDENES A CARGAR")
    print("=" * 70)
    print(f"{'Fecha':<12} {'Ticker':<8} {'Op':<7} {'Cant':>10} {'Precio':>12} {'Moneda':<6} {'TC':>10} {'Fuente TC'}")
    print("-" * 90)
    for item in to_load:
        tc_str = f"{item['tipo_cambio']:.2f}" if item.get("tipo_cambio") else "-"
        print(f"{item['fecha']:<12} {item['ticker']:<8} {item['tipo']:<7} {item['cantidad']:>10.2f} {item['precio']:>12.2f} {item['moneda']:<6} {tc_str:>10} {item.get('tc_source', '')}")
    print(f"\nTotal: {len(to_load)} transacciones")

    if duplicates:
        print(f"\n{'=' * 70}")
        print("DUPLICADOS / YA EXISTENTES")
        print("=" * 70)
        for d in duplicates:
            print(f"  Orden #{d['id_orden']} {d['ticker']} {d['fecha']} — {d['motivo']}")

    if skipped:
        print(f"\n{'=' * 70}")
        print("ÓRDENES OMITIDAS")
        print("=" * 70)
        for s in skipped:
            print(f"  Orden #{s.get('id_orden', '?')} {s.get('ticker', '-')} {s.get('fecha', '-')} — {s['motivo']}")

    if initial_loads:
        print(f"\n{'=' * 70}")
        print("CARGAS INICIALES PROPUESTAS (requieren confirmación)")
        print("=" * 70)
        for il in initial_loads:
            tc_str = f"{il['tipo_cambio']:.2f}" if il.get("tipo_cambio") else "-"
            print(f"  {il['fecha']} {il['ticker']:<8} compra {il['cantidad']:>10.2f} @ {il['precio']:>12.2f} {il['moneda']} TC={tc_str} — {il.get('nota', '')}")

    # 5. Reconciliation
    recon = reconcile(to_load, initial_loads, existing, tenencias)
    print(f"\n{'=' * 70}")
    print("CONCILIACIÓN (ledger final vs tenencias)")
    print("=" * 70)
    print(f"{'Ticker':<8} {'Ledger':>12} {'Tenencia':>12} {'Diff':>12} {'Estado'}")
    print("-" * 60)
    for r in recon:
        estado = "OK" if r["ok"] else ("SOBRANTE" if r["diff"] > 0 else "FALTANTE")
        print(f"{r['ticker']:<8} {r['ledger']:>12.2f} {r['tenencia_csv']:>12.2f} {r['diff']:>12.2f} {estado}")

    if not args.aplicar:
        print(f"\n{'=' * 70}")
        print("DRY-RUN completado. Para aplicar: agregar --aplicar")
        print("=" * 70)
        return

    # 6. Apply
    print(f"\n{'=' * 70}")
    print("APLICANDO...")
    print("=" * 70)

    all_items = sorted(
        initial_loads + to_load,
        key=lambda x: (x["fecha"], x.get("hora", "00:00:00")),
    )

    ok_count = 0
    err_count = 0
    for item in all_items:
        nota_parts = []
        if item.get("es_carga_inicial"):
            nota_parts.append(item.get("nota", "Carga inicial"))
        else:
            nota_parts.append(f"Orden #{item['id_orden']}")
        if item.get("tc_source"):
            nota_parts.append(f"TC: {item['tc_source']}")
        nota = " | ".join(nota_parts)

        payload = {
            "tipo": item["tipo"],
            "instrumento_tipo": item["instrumento_tipo"],
            "ticker": item["ticker"],
            "nombre": item.get("nombre", item["ticker"]),
            "fecha": item["fecha"],
            "cantidad": item["cantidad"],
            "precio": item["precio"],
            "moneda": item["moneda"],
            "nota": nota,
        }
        if item.get("tipo_cambio"):
            payload["tipo_cambio"] = item["tipo_cambio"]

        result, status = api_post(args.api, "/fin/transacciones", payload)
        if status in (200, 201):
            ok_count += 1
            print(f"  OK {item['fecha']} {item['ticker']} {item['tipo']} {item['cantidad']}")
        else:
            err_count += 1
            print(f"  ERR {item['fecha']} {item['ticker']} {item['tipo']} -- {result}")

    print(f"\nResultado: {ok_count} OK, {err_count} errores")

    # 7. Verify
    print("\nVerificando posiciones finales...")
    final_instruments = api_get(args.api, "/fin/instrumentos")
    final_txs = api_get(args.api, "/fin/transacciones")
    print(f"  Instrumentos: {len(final_instruments)}")
    print(f"  Transacciones: {len(final_txs)}")

    for inst in final_instruments:
        ticker = inst.get("ticker", "").upper()
        ten = tenencias.get(ticker)
        if ten:
            diff = abs(inst.get("cantidad", 0) - ten["nominales"])
            status = "OK" if diff < 0.01 else f"DIFF={diff:.4f}"
            print(f"  {ticker}: cant={inst.get('cantidad', 0):.2f} vs CSV={ten['nominales']:.2f} -> {status}")


if __name__ == "__main__":
    main()
