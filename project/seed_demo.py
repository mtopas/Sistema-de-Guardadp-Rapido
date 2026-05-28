"""
seed_demo.py — Rellena la base de datos con datos de demo realistas.
Corre desde project/: python seed_demo.py

ADVERTENCIA: borra todos los datos existentes antes de insertar.
"""

import sqlite3
import random
import json
from datetime import date, timedelta, datetime
from pathlib import Path

DB_PATH = Path(__file__).parent / "database" / "app.db"

TODAY = date(2026, 5, 26)


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def clear_all(cursor):
    tables = [
        "habitos_registros", "habitos",
        "agenda_tareas", "agenda_eventos", "agenda_listas",
        "agenda_calendarios", "agenda_horario_facultad",
        "fin_movimientos", "fin_instrumentos", "fin_objetivos",
        "fin_fire_filas", "fin_inflacion", "fin_notas",
        "fin_config", "fin_categorias", "fin_cuentas",
        "hojas", "categorias",
    ]
    for t in tables:
        cursor.execute(f"DELETE FROM {t}")
        cursor.execute(f"DELETE FROM sqlite_sequence WHERE name='{t}'")
    print("Tablas limpiadas.")


# ─── BÓVEDA ──────────────────────────────────────────────────────────────────

def seed_boveda(cursor):
    # Categorías (árbol 3 niveles)
    cats = [
        # (id, nombre, padre_id, icono)
        (1,  "Desarrollo",        None, "💻"),
        (2,  "Python",            1,    "🐍"),
        (3,  "React",             1,    "⚛️"),
        (4,  "DevOps",            1,    "🐳"),
        (5,  "Lecturas",          None, "📚"),
        (6,  "Libros",            5,    "📖"),
        (7,  "Artículos",         5,    "🗞️"),
        (8,  "Universidad",       None, "🎓"),
        (9,  "Algoritmos",        8,    "🔢"),
        (10, "Redes",             8,    "🌐"),
        (11, "Finanzas personales", None, "💰"),
        (12, "Ideas",             None, "💡"),
        (13, "General",           None, "📁"),
    ]
    cursor.executemany(
        "INSERT INTO categorias (id, nombre, padre_id, icono) VALUES (?,?,?,?)", cats
    )

    hojas = [
        # Python
        ("FastAPI tips para producción", "2026-05-20", 2, "texto",
         "<p>Usar <code>lifespan</code> en lugar de <code>on_startup</code>/<code>on_shutdown</code> para manejar recursos. Siempre definir <code>response_model</code> explícito en los endpoints para evitar leaks de datos internos.</p><p>Middleware de logging: loguear request_id, tiempo de respuesta y status code en cada request.</p>"),

        ("async vs sync en FastAPI", "2026-05-15", 2, "texto",
         "<p>Los endpoints <code>async def</code> corren en el event loop — no bloquear con operaciones sync lentas. Los <code>def</code> normales corren en un threadpool.</p><p>SQLite con <code>check_same_thread=False</code> es suficiente para un usuario; para multi-user usar connection pooling o async driver.</p>"),

        ("https://docs.python.org/3/library/asyncio.html", "2026-04-10", 2, "link",
         "<p>Referencia principal de asyncio. Las secciones de Tasks y Coroutines son las más útiles para entender el modelo de concurrencia.</p>"),

        # React
        ("Zustand vs Redux Toolkit", "2026-05-18", 3, "texto",
         "<p>Zustand gana en simplicidad: sin boilerplate, sin providers, el store es solo una función. Redux Toolkit es mejor cuando el estado tiene lógica compleja o necesitás devtools poderosos.</p><p>Para apps medianas como SGR, Zustand es la elección correcta.</p>"),

        ("Memoización en React: cuándo sí, cuándo no", "2026-05-10", 3, "texto",
         "<p><code>useMemo</code> y <code>useCallback</code> tienen costo. Usarlos solo cuando el componente hijo es pesado de renderizar o cuando el cálculo es realmente costoso.</p><ul><li>useMemo: cálculos derivados de listas grandes</li><li>useCallback: funciones pasadas a componentes memoizados con React.memo</li></ul>"),

        ("https://react.dev/reference/react/useCallback", "2026-04-22", 3, "link", None),

        # DevOps
        ("Docker multi-stage build para Python", "2026-05-22", 4, "texto",
         "<p>Patrón: stage builder instala deps + compila; stage final copia solo lo necesario.</p><pre><code>FROM python:3.12-slim AS builder\nRUN pip install --user -r requirements.txt\n\nFROM python:3.12-slim\nCOPY --from=builder /root/.local /root/.local</code></pre>"),

        ("nginx como reverse proxy para FastAPI", "2026-05-01", 4, "texto",
         "<p>Configuración mínima para servir FastAPI detrás de nginx con WebSockets habilitados.</p>"),

        # Libros
        ("Atomic Habits — James Clear", "2026-03-15", 6, "texto",
         "<p>El sistema importa más que las metas. Las metas te llevan al resultado; el sistema te mantiene ahí.</p><p>Los 4 pasos: señal → antojo → respuesta → recompensa. Para romper un mal hábito, atacar la señal. Para construir uno bueno, hacer la respuesta más obvia.</p><p><strong>Frase clave:</strong> No buscás tener el hábito, buscás ser el tipo de persona que tiene ese hábito.</p>"),

        ("Deep Work — Cal Newport", "2026-02-20", 6, "texto",
         "<p>La capacidad de concentrarse sin distracción en tareas cognitivamente exigentes es cada vez más rara y cada vez más valiosa.</p><p>Técnicas útiles: time blocking, shutdown ritual, no redes en horario de trabajo profundo.</p>"),

        ("El inversor inteligente — Benjamin Graham", "2026-01-10", 6, "texto",
         "<p>Distinción central: especulador vs inversor. El inversor analiza, el especulador predice.</p><p>Mr. Market: el mercado es un socio bipolar que te ofrece precios todos los días. No tenés que aceptarlos.</p>"),

        # Artículos
        ("https://martinfowler.com/articles/patterns-of-distributed-systems/", "2026-05-05", 7, "link",
         "<p>Patrones de sistemas distribuidos. Muy útil para entender Raft, Paxos y otros protocolos de consenso antes de implementar cualquier cosa distribuida.</p>"),

        ("https://newsletter.pragmaticengineer.com/", "2026-04-30", 7, "link",
         "<p>Newsletter de The Pragmatic Engineer. Muy bueno para entender cómo trabajan los equipos de ingeniería en empresas grandes. Suscripto.</p>"),

        # Algoritmos
        ("Complejidad algorítmica — resumen", "2026-04-05", 9, "texto",
         "<p>Big O describe el peor caso. Las notaciones más comunes:</p><ul><li>O(1): acceso a array por índice</li><li>O(log n): búsqueda binaria</li><li>O(n): recorrido lineal</li><li>O(n log n): mergesort, quicksort promedio</li><li>O(n²): bubble sort, selección</li></ul>"),

        ("Dijkstra en Python", "2026-03-28", 9, "texto",
         "<p>Implementación con heapq para grafos con pesos no negativos. Complejidad O((V+E) log V).</p>"),

        # Ideas
        ("Idea: CLI para SGR", "2026-05-23", 12, "texto",
         "<p>Hacer una CLI en Python (typer o click) que permita capturar hojas y movimientos directamente desde la terminal, sin abrir el browser. Ideal para el flujo de trabajo en la terminal.</p>"),

        ("Idea: widget de escritorio", "2026-04-18", 12, "texto",
         "<p>Un widget en la barra de tareas de Windows que muestre el saldo actual y los hábitos pendientes del día. Podría ser un tray icon con Pystray.</p>"),

        # Finanzas
        ("Estrategia de ahorro en ARS", "2026-05-12", 11, "texto",
         "<p>Con inflación alta, el objetivo es que el dinero no quede en caja de ahorro más de lo necesario. Flujo:</p><ol><li>Sueldo entra → reservar para gastos fijos del mes</li><li>El resto → FCI money market para liquidez diaria</li><li>Excedente mes siguiente → instrumentos de más plazo (letras, ON)</li></ol>"),

        # General
        ("Contacto médico — Dra. González", "2026-03-01", 13, "texto",
         "<p>Clínica San Martín, consultorio 4B. Tel: 011-4523-1234. Turnos por WhatsApp. Cobertura OSDE 210.</p>"),
    ]

    for h in hojas:
        contenido, fecha, cat_id, tipo, apuntes = h
        cursor.execute(
            """INSERT INTO hojas (contenido, fecha, categoria_id, tipo, apuntes, fecha_actualizado)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (contenido, fecha, cat_id, tipo, apuntes, fecha)
        )

    print(f"Bóveda: {len(cats)} categorías, {len(hojas)} hojas.")


# ─── FINANZAS ────────────────────────────────────────────────────────────────

def seed_finanzas(cursor):
    # Cuentas
    cuentas = [
        # (nombre, tipo, color, initials, saldo_ars, saldo_usd)
        ("Uala",          "wallet", "#7c3aed", "UA", 85_420.50,  0),
        ("Mercado Pago",  "wallet", "#009ee3", "MP", 12_300.00,  0),
        ("Banco Galicia",  "bank",  "#e40018", "GA", 234_150.00, 0),
        ("Efectivo",      "cash",   "#059669", "EF", 25_000.00,  0),
        ("Wise (USD)",    "wallet", "#37b5f0", "WI", 0,          420.00),
    ]
    for c in cuentas:
        cursor.execute(
            "INSERT INTO fin_cuentas (nombre, tipo, color, initials, saldo_ars, saldo_usd) VALUES (?,?,?,?,?,?)", c
        )
    cursor.execute("SELECT id, nombre FROM fin_cuentas")
    cuentas_map = {r[1]: r[0] for r in cursor.fetchall()}

    # Categorías
    cats_fin = [
        ("Sueldo",          "#22c55e", "income"),
        ("Freelance",       "#86efac", "income"),
        ("Supermercado",    "#f59e0b", "expense"),
        ("Delivery",        "#fb923c", "expense"),
        ("Transporte",      "#60a5fa", "expense"),
        ("Salud",           "#f87171", "expense"),
        ("Servicios",       "#a78bfa", "expense"),
        ("Entretenimiento", "#f472b6", "expense"),
        ("Ropa",            "#34d399", "expense"),
        ("Educación",       "#fbbf24", "expense"),
        ("Restaurante",     "#fb7185", "expense"),
        ("Gimnasio",        "#4ade80", "expense"),
        ("Farmacia",        "#f9a8d4", "expense"),
        ("Suscripciones",   "#818cf8", "expense"),
        ("Transferencia",   "#94a3b8", "both"),
        ("Ahorro",          "#10b981", "both"),
        ("Emergencia",      "#ef4444", "both"),
    ]
    for c in cats_fin:
        cursor.execute(
            "INSERT OR IGNORE INTO fin_categorias (nombre, color, tipo) VALUES (?,?,?)", c
        )
    cursor.execute("SELECT id, nombre FROM fin_categorias")
    cats_map = {r[1]: r[0] for r in cursor.fetchall()}

    # Config
    configs = {
        "dolar_mep":               "1185.00",
        "dolar_oficial_compra":    "1050.00",
        "dolar_actualizado_at":    "2026-05-24T10:00:00",
        "dolar_oficial_updated_at":"2026-05-24T10:00:00",
        "fire_aumento_aporte":     "1.15",
        "fire_rentabilidad_anual": "7.00",
        "fire_fecha_nacimiento":   "2000-04-15",
        "fire_aporte_inicial":     "50000",
        "fire_saldo_inicial":      "2800000",
        "fire_inicio_mes":         "2026-01",
        "fire_meta_usd":           "300000",
        "tasa_ahorro_objetivo":    "35",
        "fondo_emergencia_meta":   "1500000",
        "mes_cierre":              "25",
        "dolar_default":           "mep",
    }
    for k, v in configs.items():
        cursor.execute("INSERT OR REPLACE INTO fin_config (clave, valor) VALUES (?,?)", (k, v))

    # Movimientos — 6 meses (diciembre 2025 a mayo 2026)
    random.seed(42)
    movs = []

    def mov(fecha, monto, tipo, desc, cuenta, cat, cuotas=None, nota=None):
        movs.append((
            fecha, monto, tipo, desc, None,
            cuentas_map.get(cuenta), cuotas,
            cats_map.get(cat), "ARS", nota, 0
        ))

    # Ingresos recurrentes
    for mes_offset in range(6):
        mes_date = date(2026, 5, 26) - timedelta(days=mes_offset * 30)
        mes_str = mes_date.strftime("%Y-%m")
        dia_cobro = f"{mes_str}-10"
        mov(dia_cobro, 820_000, "income", "Sueldo mayo", "Banco Galicia", "Sueldo")

    # Gastos supermercado (semanales últimos 3 meses)
    super_montos = [18_500, 21_200, 15_800, 23_400, 19_600, 17_900, 22_100, 20_500, 24_300, 16_700, 18_200, 21_800]
    super_cuentas = ["Uala", "Mercado Pago", "Banco Galicia", "Uala"]
    for i, monto in enumerate(super_montos):
        d = TODAY - timedelta(days=i * 7)
        mov(d.isoformat(), monto, "expense", "Supermercado Día", super_cuentas[i % 4], "Supermercado")

    # Delivery
    delivery_items = [
        ("Rappi — Pizza", 8_500), ("Pedidos Ya — Sushi", 12_400), ("McDonald's delivery", 6_200),
        ("Rappi — Hamburguesería", 9_800), ("Empanadas delivery", 5_400), ("Rappi — Comida china", 11_200),
        ("Burger King delivery", 7_600), ("Pedidos Ya — Pizza", 8_900),
    ]
    for i, (desc, monto) in enumerate(delivery_items):
        d = TODAY - timedelta(days=3 + i * 9)
        mov(d.isoformat(), monto, "expense", desc, "Mercado Pago", "Delivery")

    # Transporte
    for i in range(20):
        d = TODAY - timedelta(days=i * 4)
        monto = random.choice([1_200, 1_450, 1_800, 2_100])
        mov(d.isoformat(), monto, "expense", "SUBE — colectivo/subte", "Uala", "Transporte")

    # Servicios (mensuales)
    servicios = [
        ("Internet Fibertel", 18_500), ("Gas Metrogas", 12_300), ("Luz Edenor", 9_800),
        ("Agua AYSA", 5_400), ("Celular Personal", 14_200),
    ]
    for mes_offset in range(4):
        for nombre, monto in servicios:
            d = TODAY - timedelta(days=5 + mes_offset * 30)
            mov(d.isoformat(), monto, "expense", nombre, "Banco Galicia", "Servicios")

    # Suscripciones
    subs = [
        ("Spotify", 2_800), ("Netflix", 4_200), ("ChatGPT Plus", 8_900), ("GitHub Copilot", 7_200),
    ]
    for mes_offset in range(5):
        for nombre, monto in subs:
            d = TODAY - timedelta(days=2 + mes_offset * 30)
            mov(d.isoformat(), monto, "expense", nombre, "Mercado Pago", "Suscripciones")

    # Restaurantes
    rest_items = [
        ("Asado con amigos", 32_000), ("Cafetería — almuerzo", 8_400), ("Cena cumple", 45_000),
        ("Empanadas + birra", 15_200), ("Almuerzo trabajo", 9_600), ("Cumpleaños familiar", 52_000),
    ]
    for i, (desc, monto) in enumerate(rest_items):
        d = TODAY - timedelta(days=5 + i * 14)
        mov(d.isoformat(), monto, "expense", desc, random.choice(["Uala", "Efectivo"]), "Restaurante")

    # Salud
    mov((TODAY - timedelta(days=18)).isoformat(), 15_000, "expense", "Consulta médica clínica", "Uala", "Salud")
    mov((TODAY - timedelta(days=45)).isoformat(), 22_000, "expense", "Odontólogo", "Banco Galicia", "Salud")
    mov((TODAY - timedelta(days=60)).isoformat(), 8_500,  "expense", "Análisis de sangre", "Uala", "Salud")

    # Farmacia
    for i in range(6):
        d = TODAY - timedelta(days=10 + i * 15)
        mov(d.isoformat(), random.choice([4_200, 6_800, 3_500, 9_200]), "expense", "Farmacia del pueblo", "Efectivo", "Farmacia")

    # Gimnasio
    for mes_offset in range(5):
        d = TODAY - timedelta(days=1 + mes_offset * 30)
        mov(d.isoformat(), 12_000, "expense", "Cuota gimnasio", "Uala", "Gimnasio")

    # Educación
    mov((TODAY - timedelta(days=20)).isoformat(), 45_000, "expense", "Curso Python avanzado — Udemy", "Mercado Pago", "Educación")
    mov((TODAY - timedelta(days=50)).isoformat(), 28_000, "expense", "Libro: The Pragmatic Programmer", "Mercado Pago", "Educación")
    mov((TODAY - timedelta(days=90)).isoformat(), 120_000, "expense", "Notebook SSD upgrade", "Banco Galicia", "Educación", cuotas=3)

    # Ropa
    mov((TODAY - timedelta(days=25)).isoformat(), 65_000, "expense", "Zapatillas Nike", "Banco Galicia", "Ropa", cuotas=6)
    mov((TODAY - timedelta(days=55)).isoformat(), 38_500, "expense", "Campera", "Banco Galicia", "Ropa")

    # Freelance
    mov((TODAY - timedelta(days=35)).isoformat(), 150_000, "income", "Proyecto web freelance — cliente Pérez", "Wise (USD)", "Freelance")

    # Ahorro mensual
    for mes_offset in range(5):
        d = TODAY - timedelta(days=12 + mes_offset * 30)
        mov(d.isoformat(), 200_000, "expense", "Ahorro mes", "Banco Galicia", "Ahorro",
            nota="Transferencia a inversiones")

    # Transferencias internas
    mov((TODAY - timedelta(days=8)).isoformat(),  50_000, "expense", "Transferencia a Uala", "Banco Galicia", "Transferencia")
    mov((TODAY - timedelta(days=8)).isoformat(),  50_000, "income",  "Transferencia desde Galicia", "Uala", "Transferencia")

    cursor.executemany(
        """INSERT INTO fin_movimientos
           (fecha, monto, tipo, descripcion, icono, cuenta_id, cuotas, categoria_id, moneda, nota, audit)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        movs
    )

    # Instrumentos
    instrumentos = [
        # tipo, ticker, sociedad, nombre, cantidad, costo_usd, tipo_cambio, precio_actual, entidad, capital_ars, tna, fecha_inicio, fecha_vencimiento, fecha
        ("fci",       None,   "Balanz",  "FCI Money Market Balanz",    1_250_000, None, None, 1.00,    "Balanz",    1_250_000, None,   "2026-01-01", None,         "2026-01-01"),
        ("fci",       None,   "Galicia", "FCI Renta Fija Galicia",     850_000,   None, None, 1.08,    "Galicia",   918_000,   None,   "2026-02-15", None,         "2026-02-15"),
        ("plazo_fijo",None,   None,      "Plazo fijo Galicia 30 días", 500_000,   None, None, None,    "Galicia",   500_000,   98.0,   "2026-05-01", "2026-05-31", "2026-05-01"),
        ("acciones",  "GGAL", None,      "Grupo Financiero Galicia",   80,        None, None, 9_200,   "BYMA",      None,      None,   "2025-11-10", None,         "2025-11-10"),
        ("acciones",  "YPF",  None,      "YPF S.A.",                   50,        None, None, 28_500,  "BYMA",      None,      None,   "2025-12-20", None,         "2025-12-20"),
        ("crypto",    "BTC",  None,      "Bitcoin",                    0.012,     38_500, 1185, None,  "Lemon",     None,      None,   "2026-03-10", None,         "2026-03-10"),
    ]
    cursor.executemany(
        """INSERT INTO fin_instrumentos
           (tipo, ticker, sociedad, nombre, cantidad, costo_usd, tipo_cambio, precio_actual,
            entidad, capital_ars, tna, fecha_inicio, fecha_vencimiento, fecha)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        instrumentos
    )

    # Objetivos de ahorro
    objetivos = [
        # nombre, meta, moneda, fecha_limite, cuota_mensual, fecha_creacion
        ("Viaje a Europa",    4_500, "USD", "2027-06-01", 500,       "2026-01-15"),
        ("Auto",           8_000_000, "ARS", "2027-12-01", 350_000,  "2026-02-01"),
        ("Fondo de reserva", 600_000, "ARS", None,         50_000,   "2025-10-01"),
    ]
    cursor.executemany(
        "INSERT INTO fin_objetivos (nombre, meta, moneda, fecha_limite, cuota_mensual, fecha_creacion) VALUES (?,?,?,?,?,?)",
        objetivos
    )

    # Movimientos ahorro vinculados a objetivos
    ahorro_obj = [
        ("Viaje a Europa",   (TODAY - timedelta(days=12)).isoformat(),  200_000),
        ("Viaje a Europa",   (TODAY - timedelta(days=42)).isoformat(),  200_000),
        ("Viaje a Europa",   (TODAY - timedelta(days=72)).isoformat(),  180_000),
        ("Auto",             (TODAY - timedelta(days=12)).isoformat(),  350_000),
        ("Auto",             (TODAY - timedelta(days=42)).isoformat(),  350_000),
        ("Fondo de reserva", (TODAY - timedelta(days=12)).isoformat(),   50_000),
        ("Fondo de reserva", (TODAY - timedelta(days=42)).isoformat(),   50_000),
        ("Fondo de reserva", (TODAY - timedelta(days=72)).isoformat(),   50_000),
    ]
    for nombre_obj, fecha_mov, monto in ahorro_obj:
        cursor.execute(
            """INSERT INTO fin_movimientos
               (fecha, monto, tipo, descripcion, icono, cuenta_id, cuotas, categoria_id, moneda, nota, audit)
               VALUES (?, ?, 'expense', ?, NULL, ?, NULL, ?, 'ARS', NULL, 0)""",
            (fecha_mov, monto, nombre_obj, cuentas_map["Banco Galicia"], cats_map["Ahorro"])
        )

    # FIRE filas (overrides)
    for i in range(5):
        mes = (TODAY.replace(day=1) - timedelta(days=i * 30)).strftime("%Y-%m")
        override = random.choice([190_000, 210_000, 205_000, 195_000, 215_000])
        cursor.execute("INSERT OR REPLACE INTO fin_fire_filas (mes, ahorrado_override) VALUES (?,?)", (mes, override))

    # Inflación mensual (últimos 12 meses)
    inflacion_data = [
        ("2025-06", 4.6), ("2025-07", 4.0), ("2025-08", 4.2), ("2025-09", 3.5),
        ("2025-10", 2.4), ("2025-11", 2.4), ("2025-12", 2.7), ("2026-01", 2.3),
        ("2026-02", 2.4), ("2026-03", 3.7), ("2026-04", 3.0), ("2026-05", 2.8),
    ]
    cursor.executemany("INSERT OR REPLACE INTO fin_inflacion (mes, inflacion) VALUES (?,?)", inflacion_data)

    # Notas del dashboard
    notas = [
        ("Recordar renovar plazo fijo el 31/05. Evaluar si conviene letras o seguir en PF.",       TODAY.isoformat()),
        ("Cuota del auto en junio: $38.500. Descontar del presupuesto mensual.",                   (TODAY - timedelta(days=5)).isoformat()),
        ("Checar P&L de YPF — subió bastante. Pensar si tomar ganancias.",                        (TODAY - timedelta(days=10)).isoformat()),
    ]
    cursor.executemany("INSERT INTO fin_notas (contenido, fecha) VALUES (?,?)", notas)

    print(f"Finanzas: {len(cuentas)} cuentas, {len(cats_fin)} categorías, {len(movs) + len(ahorro_obj)} movimientos, {len(instrumentos)} instrumentos, {len(objetivos)} objetivos.")


# ─── AGENDA ──────────────────────────────────────────────────────────────────

def seed_agenda(cursor):
    now_str = datetime.now().isoformat()

    # Calendarios
    calendarios = [
        (1, "Personal",   "#2563eb", 1),
        (2, "Facultad",   "#7c3aed", 1),
        (3, "Salud",      "#dc2626", 1),
        (4, "Trabajo",    "#059669", 1),
    ]
    cursor.executemany("INSERT INTO agenda_calendarios (id, nombre, color, activo) VALUES (?,?,?,?)", calendarios)

    # Eventos
    def evento(titulo, desc, inicio, fin, todo_dia, cal_id, se_repite=0, regla=None):
        cursor.execute(
            """INSERT INTO agenda_eventos
               (titulo, descripcion, fecha_inicio, fecha_fin, todo_el_dia, se_repite, regla_repeticion, calendario_id, creado_en, actualizado_en)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (titulo, desc, inicio, fin, todo_dia, se_repite, regla, cal_id, now_str, now_str)
        )

    # Eventos pasados (mayo)
    evento("Parcial Redes",           "Parcial integrador — aula 302",
           "2026-05-15T10:00:00", "2026-05-15T12:00:00", 0, 2)
    evento("Cena cumple Sofía",        "Restaurante Lo de Chicho, Palermo",
           "2026-05-17T21:00:00", "2026-05-17T23:30:00", 0, 1)
    evento("Entrega TP Algoritmos",    "Subir al campus virtual antes de las 23:59",
           "2026-05-20T00:00:00", "2026-05-20T00:00:00", 1, 2)
    evento("Turno odontólogo",         "Dr. Martínez — Av. Cabildo 2450",
           "2026-05-22T15:30:00", "2026-05-22T16:30:00", 0, 3)

    # Eventos esta semana (25-31 mayo)
    evento("Stand-up diario",          "Daily del equipo de trabajo",
           f"{TODAY.isoformat()}T09:30:00", f"{TODAY.isoformat()}T09:50:00", 0, 4,
           se_repite=1, regla=json.dumps({"tipo": "semanal", "dias": [1,2,3,4,5]}))
    evento("Clase Redes",              "Profe: Ing. Rodríguez — Lab 201",
           "2026-05-27T17:00:00", "2026-05-27T19:00:00", 0, 2)
    evento("Clase Algoritmos",         "Profe: Lic. Gómez — Aula 115",
           "2026-05-28T14:00:00", "2026-05-28T16:00:00", 0, 2)
    evento("Review código con Marcos", "Revisar PR del módulo de notificaciones",
           "2026-05-27T11:00:00", "2026-05-27T12:00:00", 0, 4)
    evento("Gym — leg day",            None,
           "2026-05-28T07:00:00", "2026-05-28T08:30:00", 0, 1)
    evento("Asado casa de Lucas",      "Llevar algo para tomar",
           "2026-05-30T14:00:00", "2026-05-30T20:00:00", 0, 1)
    evento("Vencimiento tarjeta Galicia", "Pagar resumen — $142.300",
           "2026-05-31T00:00:00", "2026-05-31T00:00:00", 1, 1)

    # Eventos semana siguiente
    evento("Clase Redes",              "Profe: Ing. Rodríguez — Lab 201",
           "2026-06-03T17:00:00", "2026-06-03T19:00:00", 0, 2)
    evento("Clase Algoritmos",         "Profe: Lic. Gómez — Aula 115",
           "2026-06-04T14:00:00", "2026-06-04T16:00:00", 0, 2)
    evento("Turno médico clínica",     "Chequeo anual — Dr. Vega — Clínica San Martín",
           "2026-06-05T10:00:00", "2026-06-05T11:00:00", 0, 3)
    evento("Entrega proyecto final",   "Demo al product owner — preparar slides",
           "2026-06-05T15:00:00", "2026-06-05T17:00:00", 0, 4)
    evento("Cumpleaños papá",         "Cena familiar en casa",
           "2026-06-07T20:00:00", "2026-06-07T23:00:00", 0, 1)
    evento("1er parcial Algoritmos",   "Temas: grafos, árboles, DP",
           "2026-06-10T10:00:00", "2026-06-10T12:00:00", 0, 2)

    # Listas de tareas
    listas = [
        (1, "Tareas diarias", "#2563eb"),
        (2, "Facultad",       "#7c3aed"),
        (3, "Compras",        "#059669"),
        (4, "Trabajo",        "#f59e0b"),
        (5, "Personal",       "#db2777"),
    ]
    cursor.executemany("INSERT INTO agenda_listas (id, nombre, color) VALUES (?,?,?)", listas)

    def tarea(titulo, desc, fecha, hora, completada, lista_id, hora_bloque=None, duracion=None):
        cursor.execute(
            """INSERT INTO agenda_tareas
               (titulo, descripcion, fecha_opcional, hora_opcional, hora_bloque, duracion_estimada, completada, lista_id, creado_en, actualizado_en)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (titulo, desc, fecha, hora, hora_bloque, duracion, completada, lista_id, now_str, now_str)
        )

    # Tareas completadas
    tarea("Enviar TP de Redes",          "Subir PDF al campus",     "2026-05-20", None, 1, 2)
    tarea("Pagar servicio de internet",  None,                      "2026-05-22", None, 1, 1)
    tarea("Comprar yerba y azúcar",      None,                      "2026-05-23", None, 1, 3)
    tarea("Renovar gym",                 "Cuota mensual",           "2026-05-24", None, 1, 5)

    # Tareas pendientes hoy / próximos días
    tarea("Estudiar grafos para el parcial", "Cap 22-24 Cormen",  TODAY.isoformat(), "10:00", 0, 2, "10:00", 120)
    tarea("Responder emails del trabajo",    None,                TODAY.isoformat(), "09:00", 0, 4, "09:00", 30)
    tarea("Llamar a mamá",                  None,                TODAY.isoformat(), None,    0, 5)
    tarea("Actualizar CV",                  "Agregar proyecto SGR y experiencia freelance", (TODAY + timedelta(days=1)).isoformat(), None, 0, 5, None, 60)
    tarea("Preparar slides demo",           "Proyecto final trabajo — 5 slides máx", (TODAY + timedelta(days=2)).isoformat(), "14:00", 0, 4, "14:00", 90)
    tarea("Comprar regalo cumple papá",     None,                (TODAY + timedelta(days=4)).isoformat(), None, 0, 3)
    tarea("Leer cap. 5 Deep Work",          None,                (TODAY + timedelta(days=1)).isoformat(), "21:00", 0, 1, "21:00", 45)
    tarea("Resolver ejercicios DP",         "LeetCode: coin change, knapsack", (TODAY + timedelta(days=3)).isoformat(), "10:00", 0, 2, "10:00", 90)
    tarea("Comprar vino para asado",        None,                (TODAY + timedelta(days=4)).isoformat(), None, 0, 3)
    tarea("Pagar tarjeta Galicia",          "$142.300 — vence 31/05", "2026-05-31", None, 0, 1)
    tarea("Reunión 1:1 con el lead",        "Preparar puntos a discutir", (TODAY + timedelta(days=7)).isoformat(), "11:00", 0, 4, "11:00", 60)
    tarea("Rendir parcial Algoritmos",      "Llevar calculadora y libretas", "2026-06-10", "10:00", 0, 2)

    # Horario facultad (lunes=1, martes=2, miércoles=3, jueves=4, viernes=5)
    horario = [
        (3, "17:00", "19:00", "Redes",       "Lab 201 — Ing. Rodríguez"),
        (4, "14:00", "16:00", "Algoritmos",  "Aula 115 — Lic. Gómez"),
        (1, "19:00", "21:00", "Sistemas Operativos", "Aula 203 — Dr. Fernández"),
        (2, "10:00", "12:00", "Base de Datos", "Lab 305 — Lic. Torres"),
    ]
    cursor.executemany(
        "INSERT INTO agenda_horario_facultad (dia_semana, hora_inicio, hora_fin, materia, descripcion) VALUES (?,?,?,?,?)",
        horario
    )

    print("Agenda: 4 calendarios, 16 eventos, 5 listas, 16 tareas, 4 materias facultad.")


# ─── HÁBITOS ─────────────────────────────────────────────────────────────────

def seed_habitos(cursor):
    now_str = datetime.now().isoformat()

    habitos = [
        # nombre, desc, color, categoria, frec_tipo, dias_semana, hora, activo
        ("Leer 30 minutos",      "Lectura de libros o artículos técnicos",  "#f59e0b", "Desarrollo personal", "diario",   None,              "22:00", 1),
        ("Gimnasio",             "Entrenamiento de fuerza o cardio",        "#ef4444", "Salud",               "semanal",  "[1,2,4,5]",       "07:00", 1),
        ("Estudiar inglés",      "Duolingo o clase con profe",              "#3b82f6", "Educación",           "diario",   None,              "08:00", 1),
        ("Meditación",           "10-15 min con Headspace o libre",         "#8b5cf6", "Bienestar",           "diario",   None,              "07:30", 1),
        ("Journaling",           "Escribir 3 cosas del día + intención",    "#10b981", "Bienestar",           "diario",   None,              "21:30", 1),
        ("Correr",               "5k mínimo al aire libre",                 "#f97316", "Salud",               "semanal",  "[0,3,6]",         "06:30", 1),
        ("Sin redes sociales",   "No abrir Instagram/Twitter antes de las 12", "#06b6d4", "Productividad",   "diario",   None,              None,    1),
    ]
    cursor.executemany(
        """INSERT INTO habitos (nombre, descripcion, color, categoria, frecuencia_tipo, dias_semana, hora, activo, creado_en)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        [(h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], now_str) for h in habitos]
    )

    cursor.execute("SELECT id, nombre, frecuencia_tipo, dias_semana FROM habitos")
    habitos_db = cursor.fetchall()

    random.seed(99)

    def is_scheduled(hab_id, frec_tipo, dias_semana_json, d: date):
        if frec_tipo == "diario":
            return True
        dias = json.loads(dias_semana_json) if dias_semana_json else []
        return d.weekday() in [((d_ + 1) % 7) for d_ in dias]  # Python: 0=lun, JSON: 0=dom

    registros = []
    for hid, nombre, frec_tipo, dias_json in habitos_db:
        for days_ago in range(90):
            d = TODAY - timedelta(days=days_ago)
            if not is_scheduled(hid, frec_tipo, dias_json, d):
                continue

            # Probabilidades realistas según hábito
            if "Gimnasio" in nombre or "Correr" in nombre:
                p_total, p_parcial = 0.72, 0.05
            elif "Sin redes" in nombre:
                p_total, p_parcial = 0.55, 0.15
            elif "Meditación" in nombre:
                p_total, p_parcial = 0.65, 0.12
            elif "Journaling" in nombre:
                p_total, p_parcial = 0.70, 0.08
            else:
                p_total, p_parcial = 0.80, 0.08

            r = random.random()
            if r < p_total:
                valor = 1.0
            elif r < p_total + p_parcial:
                valor = 0.5
            else:
                continue

            nota = None
            if valor == 0.5 and random.random() < 0.3:
                notas_posibles = [
                    "Solo 15 min, pero algo es algo",
                    "Cansado pero lo hice",
                    "Medio día ocupado",
                    "Empecé tarde",
                ]
                nota = random.choice(notas_posibles)

            registros.append((hid, d.isoformat(), valor, nota, now_str))

    cursor.executemany(
        "INSERT OR IGNORE INTO habitos_registros (habito_id, fecha, valor, nota, creado_en) VALUES (?,?,?,?,?)",
        registros
    )

    print(f"Hábitos: {len(habitos)} hábitos, {len(registros)} registros (90 días).")


# ─── MAIN ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if not DB_PATH.exists():
        print(f"ERROR: No se encuentra la base en {DB_PATH}")
        print("Asegurate de haber iniciado el backend al menos una vez para que init_db() cree las tablas.")
        exit(1)

    conn = connect()
    cursor = conn.cursor()

    print("=== Seed demo SGR ===")
    clear_all(cursor)
    seed_boveda(cursor)
    seed_finanzas(cursor)
    seed_agenda(cursor)
    seed_habitos(cursor)

    conn.commit()
    conn.close()
    print("=== Listo. Reiniciá el backend para que sirva los datos frescos. ===")
