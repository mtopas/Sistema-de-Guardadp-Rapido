import os
import re
from datetime import date, datetime

import requests
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

from api_config import API_BASE as DEFAULT_API_BASE

# ──────────────────────────────────────────────────────────────
# Seguridad — BOT_ALLOWED_CHAT_IDS
# ──────────────────────────────────────────────────────────────

def _get_allowed_ids() -> set:
    raw = os.getenv("BOT_ALLOWED_CHAT_IDS", "")
    ids = set()
    for part in raw.split(","):
        part = part.strip()
        if part.lstrip("-").isdigit():
            ids.add(int(part))
    return ids

_ALLOWED_CHAT_IDS = _get_allowed_ids()


def _is_allowed(chat_id: int) -> bool:
    """Sin ALLOWED configurado, todos pasan. Con lista, solo los incluidos."""
    return not _ALLOWED_CHAT_IDS or chat_id in _ALLOWED_CHAT_IDS


# ──────────────────────────────────────────────────────────────
# Pasos conversacionales
# ──────────────────────────────────────────────────────────────

STEP_FIN_MONTO    = "fin_monto"
STEP_FIN_DESC     = "fin_desc"
STEP_FIN_CAT_TEXT = "fin_cat_text"

# ──────────────────────────────────────────────────────────────
# Formateo
# ──────────────────────────────────────────────────────────────

def _fmt_ars(monto: float) -> str:
    if monto == int(monto):
        return f"${int(monto):,}".replace(",", ".")
    return f"${monto:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _fmt_pct(valor: float) -> str:
    return f"{valor:.1f}%"


def _tipo_display(tipo: str) -> str:
    return {"expense": "Gasto", "income": "Ingreso"}.get(tipo, tipo.capitalize())


def _tipo_icon(tipo: str) -> str:
    return {"expense": "💸", "income": "💰"}.get(tipo, "💱")


def _today_iso() -> str:
    return date.today().isoformat()


def _mes_actual() -> str:
    return date.today().strftime("%Y-%m")


def _meses_calendario_hasta(fecha_limite: str, ref: date | None = None) -> int | None:
    """Meses calendario inclusivos desde ref hasta el mes de fecha_limite."""
    if not fecha_limite:
        return None
    m = re.match(r"^(\d{4})-(\d{2})", str(fecha_limite))
    if not m:
        return None
    end_y, end_m = int(m.group(1)), int(m.group(2))
    ref = ref or date.today()
    months = (end_y - ref.year) * 12 + (end_m - ref.month) + 1
    return months if months > 0 else None


def _cuota_mensual_objetivo(obj: dict, ahorrado: float = 0.0) -> float | None:
    meses = _meses_calendario_hasta(obj.get("fecha_limite") or "")
    if not meses:
        return None
    meta = float(obj.get("meta") or 0)
    falta = max(0.0, meta - ahorrado)
    return falta / meses


# ──────────────────────────────────────────────────────────────
# Llamadas a la API (normaliza name/nombre, ars/saldo_ars, etc.)
# ──────────────────────────────────────────────────────────────

def _normalize_cuenta(c: dict) -> dict:
    """API SGR usa name/ars/usd; el bot histórico usaba nombre/saldo_*."""
    saldo_ars = c.get("saldo_ars")
    if saldo_ars is None:
        saldo_ars = c.get("ars", 0)
    saldo_usd = c.get("saldo_usd")
    if saldo_usd is None:
        saldo_usd = c.get("usd", 0)
    return {
        "id":     c["id"],
        "nombre": (c.get("nombre") or c.get("name") or "").strip(),
        "tipo":   c.get("tipo", "wallet"),
        "saldo_ars": float(saldo_ars or 0),
        "saldo_usd": float(saldo_usd or 0),
    }


def _normalize_categoria(c: dict) -> dict:
    return {
        "id":     c["id"],
        "nombre": (c.get("nombre") or c.get("name") or "").strip(),
        "tipo":   c.get("tipo", "expense"),
        "color":  c.get("color"),
        "oculta": bool(c.get("oculta")),
        "objetivo_id": c.get("objetivo_id"),
    }


def _get_cuentas(api: str) -> list:
    r = requests.get(f"{api}/fin/cuentas", timeout=15)
    r.raise_for_status()
    raw = r.json()
    if raw and isinstance(raw[0], dict) and raw[0].get("items"):
        flat = []
        for g in raw:
            flat.extend(g.get("items") or [])
        raw = flat
    return [_normalize_cuenta(c) for c in raw]


def _get_categorias(api: str) -> list:
    r = requests.get(f"{api}/fin/categorias", timeout=15)
    r.raise_for_status()
    return [
        _normalize_categoria(c) for c in r.json()
        if not c.get("oculta")
    ]


def _get_movimientos(api: str, mes: str = None) -> list:
    params = {"mes": mes} if mes else {}
    r = requests.get(f"{api}/fin/movimientos", params=params, timeout=15)
    r.raise_for_status()
    return r.json()


def _delete_movimiento(api: str, mov_id: int):
    r = requests.delete(f"{api}/fin/movimientos/{mov_id}", timeout=15)
    r.raise_for_status()


def _get_config(api: str) -> dict:
    r = requests.get(f"{api}/fin/config", timeout=15)
    r.raise_for_status()
    return r.json()


def _put_config(api: str, updates: dict) -> dict:
    r = requests.put(f"{api}/fin/config", json=updates, timeout=15)
    r.raise_for_status()
    return r.json()


def _get_objetivos(api: str) -> list:
    r = requests.get(f"{api}/fin/objetivos", timeout=15)
    r.raise_for_status()
    return r.json()


# ──────────────────────────────────────────────────────────────
# Normalización de movimientos (dual schema API/mock)
# ──────────────────────────────────────────────────────────────

def _normalize_mov(mov: dict) -> dict:
    return {
        "id":               mov.get("id"),
        "tipo":             mov.get("tipo") or mov.get("type", "expense"),
        "monto":            float(mov.get("monto") or mov.get("amount") or 0),
        "descripcion":      mov.get("descripcion") or mov.get("desc", ""),
        "categoria_nombre": mov.get("categoria_nombre") or mov.get("cat", ""),
        "cuenta_nombre":    mov.get("cuenta_nombre") or mov.get("method", ""),
        "fecha":            mov.get("fecha") or mov.get("date", ""),
    }


def _is_transfer(mv: dict) -> bool:
    return (mv.get("categoria_nombre") or "").lower() == "transferencia"


def _monto_abs(mv: dict) -> float:
    """Monto siempre positivo para totales (la DB puede tener gastos con signo −)."""
    return abs(float(mv.get("monto") or 0))


# ──────────────────────────────────────────────────────────────
# Fuzzy match
# ──────────────────────────────────────────────────────────────

def _fuzzy_match(nombre: str, items: list, key: str = "nombre"):
    nombre_lower = nombre.lower()
    for item in items:
        if item[key].lower() == nombre_lower:
            return item
    for item in items:
        if nombre_lower in item[key].lower() or item[key].lower() in nombre_lower:
            return item
    words = nombre_lower.split()
    for item in items:
        item_words = item[key].lower().split()
        if any(w in item_words for w in words):
            return item
    return None


# ──────────────────────────────────────────────────────────────
# Inline keyboards
# ──────────────────────────────────────────────────────────────

def _kb_tipo() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("💸 Gasto",   callback_data="ft:expense"),
        InlineKeyboardButton("💰 Ingreso", callback_data="ft:income"),
    ]])


def _kb_cuentas(cuentas: list) -> InlineKeyboardMarkup:
    rows = []
    for i in range(0, len(cuentas), 2):
        fila = [InlineKeyboardButton(cuentas[i]["nombre"], callback_data=f"fcc:{cuentas[i]['id']}")]
        if i + 1 < len(cuentas):
            fila.append(InlineKeyboardButton(cuentas[i + 1]["nombre"], callback_data=f"fcc:{cuentas[i + 1]['id']}"))
        rows.append(fila)
    rows.append([InlineKeyboardButton("✕ Cancelar", callback_data="fno")])
    return InlineKeyboardMarkup(rows)


def _categoria_aplica_tipo(cat: dict, tipo_mov: str) -> bool:
    if (cat.get("nombre") or "").strip().lower() == "transferencia":
        return False
    t = cat.get("tipo", "expense")
    if t == "both":
        return True
    return t == tipo_mov


def _filtrar_categorias_por_tipo(categorias: list, tipo_mov: str) -> list:
    return [c for c in categorias if _categoria_aplica_tipo(c, tipo_mov)]


def _ordenar_categorias_para_teclado(categorias: list) -> list:
    """Mismo criterio que la app (DatosRightPanel): tipo expense → income → both, luego A-Z."""
    tipo_order = {"expense": 0, "income": 1, "both": 2}
    return sorted(
        categorias,
        key=lambda c: (
            tipo_order.get(c.get("tipo", "expense"), 9),
            (c.get("nombre") or "").casefold(),
        ),
    )


def _post_categoria(api: str, nombre: str, tipo_mov: str) -> dict:
    """Crea categoría en la API o devuelve la existente si ya hay mismo nombre."""
    nombre = nombre.strip()
    tipo_cat = "income" if tipo_mov == "income" else "expense"
    r = requests.post(
        f"{api}/fin/categorias",
        json={"nombre": nombre, "tipo": tipo_cat},
        timeout=15,
    )
    if r.status_code == 400:
        cats = _get_categorias(api)
        hit = next((c for c in cats if c["nombre"].lower() == nombre.lower()), None)
        if hit:
            return hit
        r.raise_for_status()
    r.raise_for_status()
    return _normalize_categoria(r.json())


def _kb_categorias(categorias: list, tipo_mov: str = "expense") -> InlineKeyboardMarkup:
    rows = []
    visible = _ordenar_categorias_para_teclado(
        _filtrar_categorias_por_tipo(categorias, tipo_mov)
    )
    for i in range(0, len(visible), 2):
        fila = [InlineKeyboardButton(visible[i]["nombre"], callback_data=f"fcat:{visible[i]['id']}")]
        if i + 1 < len(visible):
            fila.append(InlineKeyboardButton(visible[i + 1]["nombre"], callback_data=f"fcat:{visible[i + 1]['id']}"))
        rows.append(fila)
    rows.append([InlineKeyboardButton("➕ Nueva categoría…", callback_data="fcat_text")])
    rows.append([InlineKeyboardButton("✕ Cancelar", callback_data="fno")])
    return InlineKeyboardMarkup(rows)


def _kb_confirmar() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("✓ Confirmar", callback_data="fok"),
        InlineKeyboardButton("✕ Cancelar",  callback_data="fno"),
    ]])


def _draft_preview(ud: dict) -> str:
    draft     = ud.get("fin_draft", {})
    tipo      = draft.get("tipo", "expense")
    monto     = float(draft.get("monto") or 0)
    desc      = draft.get("descripcion") or "—"
    cuenta    = draft.get("cuenta_nombre") or "—"
    cat       = draft.get("categoria_nombre") or "—"
    fecha     = draft.get("fecha") or _today_iso()
    return (
        f"{_tipo_icon(tipo)} *{_tipo_display(tipo)} {_fmt_ars(monto)}* — {desc}\n"
        f"Cuenta: {cuenta}  |  Categoría: {cat}\n"
        f"Fecha: {fecha}"
    )


# ──────────────────────────────────────────────────────────────
# Parser de captura natural ($:)
# ──────────────────────────────────────────────────────────────

def _parse_fecha_natural(token: str) -> str | None:
    """Convierte tokens de fecha a ISO YYYY-MM-DD. Devuelve None si no reconoce."""
    from datetime import date, timedelta
    hoy = date.today()
    low = token.lower()
    if low in ("ayer", "yesterday"):
        return (hoy - timedelta(days=1)).isoformat()
    if low in ("anteayer", "antayer"):
        return (hoy - timedelta(days=2)).isoformat()
    if low == "hoy":
        return hoy.isoformat()
    # DD/MM o DD-MM
    m = re.match(r"^(\d{1,2})[/\-](\d{1,2})$", token)
    if m:
        dd, mm = int(m.group(1)), int(m.group(2))
        try:
            return date(hoy.year, mm, dd).isoformat()
        except ValueError:
            return None
    # DD/MM/YYYY o DD-MM-YYYY
    m = re.match(r"^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$", token)
    if m:
        dd, mm, yyyy = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return date(yyyy, mm, dd).isoformat()
        except ValueError:
            return None
    return None


def _parse_natural(texto: str) -> dict | None:
    """
    '$: gasto 4500 Super Coto uala ayer'       → con fecha de ayer
    '$: gasto 4500 Spotify uala cuotas:3'      → con cuotas
    '$: ingreso 50000 sueldo galicia 15/06'    → con fecha específica
    El último token se analiza como fecha, cuenta_hint o ambos.
    """
    text = texto.strip()

    tipo = "expense"
    lower = text.lower()
    if re.match(r"^(ingreso|income)\b", lower):
        tipo = "income"
        text = re.sub(r"^(ingreso|income)\s*", "", text, flags=re.IGNORECASE).strip()
    else:
        text = re.sub(r"^(gasto|expense)\s*", "", text, flags=re.IGNORECASE).strip()

    # Extraer cuotas: cuotas:N o c:N (cualquier posición)
    cuotas = None
    cuotas_m = re.search(r"\b(?:cuotas?|c):(\d+)\b", text, flags=re.IGNORECASE)
    if cuotas_m:
        cuotas = int(cuotas_m.group(1))
        text = (text[:cuotas_m.start()] + text[cuotas_m.end():]).strip()

    m = re.match(r"^(\d+(?:[.,]\d+)?)\s*", text)
    if not m:
        return None
    monto = float(m.group(1).replace(",", "."))
    text  = text[m.end():].strip()

    words = text.split()

    # Detectar fecha en el último token
    fecha_override = None
    if words:
        fecha_candidate = _parse_fecha_natural(words[-1])
        if fecha_candidate:
            fecha_override = fecha_candidate
            words = words[:-1]

    # Detectar cuenta_hint en el nuevo último token
    if len(words) >= 2:
        cuenta_hint = words[-1]
        descripcion = " ".join(words[:-1])
    elif len(words) == 1:
        cuenta_hint = None
        descripcion = words[0]
    else:
        cuenta_hint = None
        descripcion = ""

    result = {"tipo": tipo, "monto": monto, "descripcion": descripcion, "cuenta_hint": cuenta_hint}
    if cuotas:
        result["cuotas"] = cuotas
    if fecha_override:
        result["fecha"] = fecha_override
    return result


# ──────────────────────────────────────────────────────────────
# Builders de mensajes
# ──────────────────────────────────────────────────────────────

def _build_saldo(cuentas: list, config: dict) -> str:
    dolar = float(config.get("dolar_oficial") or 0)
    lines = ["🏦 *Saldo por cuenta*\n"]
    total_ars = total_usd = 0.0
    for c in cuentas:
        s_ars = float(c.get("saldo_ars") or 0)
        s_usd = float(c.get("saldo_usd") or 0)
        total_ars += s_ars
        total_usd += s_usd
        partes = [f"*{c['nombre']}*"]
        if s_ars:
            partes.append(f"ARS {_fmt_ars(s_ars)}")
        if s_usd:
            partes.append(f"USD {s_usd:,.2f}")
        if not s_ars and not s_usd:
            partes.append("$0")
        lines.append("  " + "  |  ".join(partes))

    if not cuentas:
        return "🏦 Sin cuentas registradas."

    lines.append("")
    lines.append(f"*Total ARS:* {_fmt_ars(total_ars)}")
    if total_usd:
        lines.append(f"*Total USD:* {total_usd:,.2f}")
    if dolar:
        equiv_usd = total_usd + total_ars / dolar
        lines.append(f"*Equivalente USD* (@ {_fmt_ars(dolar)}): {equiv_usd:,.2f}")
    else:
        lines.append("_Dólar no configurado — usá /dolar para actualizar_")
    return "\n".join(lines)


def _build_mes(movimientos: list, mes: str) -> str:
    año, mn = int(mes[:4]), int(mes[5:7])
    meses_es = ["enero","febrero","marzo","abril","mayo","junio",
                "julio","agosto","septiembre","octubre","noviembre","diciembre"]
    mes_label = f"{meses_es[mn - 1]} {año}"

    ingresos = gastos = 0.0
    for m in movimientos:
        mv = _normalize_mov(m)
        if _is_transfer(mv):
            continue
        if mv["tipo"] == "income":
            ingresos += _monto_abs(mv)
        else:
            gastos += _monto_abs(mv)

    balance = ingresos - gastos
    tasa    = balance / ingresos * 100 if ingresos else 0.0
    signo   = "+" if balance >= 0 else ""

    lines = [
        f"📊 *Resumen — {mes_label}*\n",
        f"💰 Ingresos:     {_fmt_ars(ingresos)}",
        f"💸 Gastos:       {_fmt_ars(gastos)}",
        f"📈 Balance:      {signo}{_fmt_ars(balance)}",
        f"💚 Tasa ahorro:  {_fmt_pct(tasa)}",
    ]
    return "\n".join(lines)


def _movimiento_asignado_a_cajon(mv: dict, nombre_cat: str) -> bool:
    key = (nombre_cat or "").strip().lower()
    if not key:
        return False
    cat = (mv.get("categoria_nombre") or "").strip().lower()
    desc = (mv.get("descripcion") or "").strip().lower()
    return cat == key or desc == key


def _contribucion_categoria(mv: dict, nombre_cat: str) -> float:
    if not _movimiento_asignado_a_cajon(mv, nombre_cat):
        return 0.0
    if mv["tipo"] == "expense":
        return mv["monto"]
    return -mv["monto"]


def _contribucion_mes(movimientos: list, mes: str, nombre_cat: str) -> float:
    total = 0.0
    for m in movimientos:
        mv = _normalize_mov(m)
        if not (mv.get("fecha") or "").startswith(mes):
            continue
        total += _contribucion_categoria(mv, nombre_cat)
    return total


def _build_ahorro(movimientos: list, objetivos: list, mes: str, movs_all: list | None = None) -> str:
    mn = int(mes[5:7])
    meses_es = ["enero","febrero","marzo","abril","mayo","junio",
                "julio","agosto","septiembre","octubre","noviembre","diciembre"]
    mes_label = f"{meses_es[mn - 1]} {mes[:4]}"

    fire_mes = _contribucion_mes(movimientos, mes, "FIRE")
    lines = [
        f"💚 *Ahorro — {mes_label}*\n",
        f"🔥 *FIRE* este mes: *{_fmt_ars(fire_mes)}*",
    ]

    if objetivos:
        lines.append("")
        lines.append("*Objetivos (este mes / meta):*")
        for obj in objetivos[:8]:
            nombre = obj["nombre"]
            mes_obj = _contribucion_mes(movimientos, mes, nombre)
            meta   = float(obj.get("meta") or 0)
            moneda = obj.get("moneda", "ARS")
            ahorrado = 0.0
            if movs_all:
                for m in movs_all:
                    ahorrado += _contribucion_categoria(_normalize_mov(m), nombre)
            cuota  = _cuota_mensual_objetivo(obj, ahorrado)
            fmt_m  = _fmt_ars(meta) if moneda == "ARS" else f"USD {meta:,.0f}"
            cuota_str = f" — cuota {_fmt_ars(cuota)}/mes" if cuota else ""
            lines.append(f"  • *{nombre}*: {_fmt_ars(mes_obj)} (meta {fmt_m}){cuota_str}")
    else:
        lines.append("\n_Sin objetivos — creá uno desde la app._")

    legacy = sum(
        1 for m in movimientos
        if (_normalize_mov(m).get("categoria_nombre") or "").strip().lower() == "ahorro"
        and (_normalize_mov(m).get("fecha") or "").startswith(mes)
    )
    if legacy:
        lines.append(f"\n⚠️ {legacy} mov. con categoría *Ahorro* (vieja). Reasignalos a FIRE u objetivo.")

    return "\n".join(lines)


def _build_ultimo(movimientos: list) -> tuple:
    sorted_movs = sorted(movimientos, key=lambda m: m.get("fecha") or "", reverse=True)[:5]

    if not sorted_movs:
        return "📋 Sin movimientos registrados.", None

    lines   = ["📋 *Últimos movimientos*\n"]
    botones = []
    for i, m in enumerate(sorted_movs, 1):
        mv    = _normalize_mov(m)
        desc  = mv["descripcion"] or "—"
        cat   = mv["categoria_nombre"] or "—"
        cta   = mv["cuenta_nombre"] or "—"
        fecha = (mv["fecha"] or "")[:10]
        lines.append(f"{i}. {_tipo_icon(mv['tipo'])} *{_fmt_ars(mv['monto'])}* — {desc}")
        lines.append(f"   {cat} | {cta} | {fecha}")
        desc_short = desc[:22] + ("…" if len(desc) > 22 else "")
        botones.append([InlineKeyboardButton(f"🗑 #{i} {desc_short}", callback_data=f"fdel:{mv['id']}")])

    return "\n".join(lines), InlineKeyboardMarkup(botones)


def _build_objetivo(obj: dict, movs_all: list) -> str:
    meta   = float(obj.get("meta") or 0)
    moneda = obj.get("moneda", "ARS")
    vence  = obj.get("fecha_limite") or ""
    nombre = obj["nombre"]

    ahorrado = 0.0
    for m in movs_all:
        mv = _normalize_mov(m)
        ahorrado += _contribucion_categoria(mv, nombre)

    cuota  = _cuota_mensual_objetivo(obj, ahorrado)

    pct      = min(ahorrado / meta * 100, 100) if meta else 0
    faltante = max(0.0, meta - ahorrado)
    filled   = int(pct / 10)
    bar      = "█" * filled + "░" * (10 - filled)

    def fmt(v):
        return _fmt_ars(v) if moneda == "ARS" else f"USD {v:,.0f}"

    lines = [
        f"🎯 *{nombre}*",
        f"`{bar}` {_fmt_pct(pct)}",
        "",
        f"Ahorrado: *{fmt(ahorrado)}* de {fmt(meta)}",
        f"Faltante: {fmt(faltante)}",
    ]
    if cuota:
        lines.append(f"Cuota mensual: {fmt(cuota)}")
        if faltante > 0:
            meses = int(faltante / cuota + 0.5)
            lines.append(f"Meses aprox.: {meses}")
    if vence:
        lines.append(f"Fecha límite: {vence}")
    return "\n".join(lines)


# ──────────────────────────────────────────────────────────────
# Handlers de comandos
# ──────────────────────────────────────────────────────────────

async def cmd_mov(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update.effective_chat.id):
        return
    ud = context.user_data
    if ud.get("step"):
        await update.message.reply_text(
            "Tenés una acción pendiente. Completala o enviá /cancel para cancelar."
        )
        return
    ud["fin_draft"] = {"fecha": _today_iso()}
    await update.message.reply_text(
        "💳 *Nuevo movimiento*\n\n¿Qué tipo de movimiento es?",
        parse_mode="Markdown",
        reply_markup=_kb_tipo(),
    )


async def cmd_saldo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update.effective_chat.id):
        return
    api = context.bot_data.get("api_base", DEFAULT_API_BASE)
    try:
        cuentas = _get_cuentas(api)
        config  = _get_config(api)
    except Exception as e:
        await update.message.reply_text(f"No pude conectar con la API: {e}")
        return
    await update.message.reply_text(_build_saldo(cuentas, config), parse_mode="Markdown")


async def cmd_mes(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update.effective_chat.id):
        return
    api = context.bot_data.get("api_base", DEFAULT_API_BASE)
    mes = (context.args[0] if context.args else _mes_actual()).strip()
    if not re.match(r"^\d{4}-\d{2}$", mes):
        await update.message.reply_text("Formato: /mes [YYYY-MM]\nEjemplo: /mes 2026-04")
        return
    try:
        movs = _get_movimientos(api, mes)
    except Exception as e:
        await update.message.reply_text(f"No pude conectar con la API: {e}")
        return
    await update.message.reply_text(_build_mes(movs, mes), parse_mode="Markdown")


async def cmd_ahorro(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update.effective_chat.id):
        return
    api = context.bot_data.get("api_base", DEFAULT_API_BASE)
    mes = _mes_actual()
    try:
        movs      = _get_movimientos(api, mes)
        movs_all  = _get_movimientos(api)
        objetivos = _get_objetivos(api)
    except Exception as e:
        await update.message.reply_text(f"No pude conectar con la API: {e}")
        return
    await update.message.reply_text(_build_ahorro(movs, objetivos, mes, movs_all), parse_mode="Markdown")


async def cmd_ultimo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update.effective_chat.id):
        return
    api = context.bot_data.get("api_base", DEFAULT_API_BASE)
    try:
        movs = _get_movimientos(api)
    except Exception as e:
        await update.message.reply_text(f"No pude conectar con la API: {e}")
        return
    text, markup = _build_ultimo(movs)
    await update.message.reply_text(text, parse_mode="Markdown", reply_markup=markup)


async def cmd_dolar(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update.effective_chat.id):
        return
    api  = context.bot_data.get("api_base", DEFAULT_API_BASE)
    args = context.args or []

    if not args:
        try:
            config = _get_config(api)
            valor  = config.get("dolar_oficial") or "no configurado"
            await update.message.reply_text(
                f"💵 Dólar oficial actual: *{valor}*\nUsá `/dolar 1350.50` para actualizar.",
                parse_mode="Markdown",
            )
        except Exception as e:
            await update.message.reply_text(f"No pude obtener la config: {e}")
        return

    try:
        valor = float(args[0].replace(",", "."))
        if valor <= 0:
            raise ValueError
    except ValueError:
        await update.message.reply_text("El valor debe ser un número positivo. Ej: /dolar 1350.50")
        return

    try:
        _put_config(api, {"dolar_oficial": str(valor)})
        await update.message.reply_text(
            f"✅ Dólar oficial actualizado: *{_fmt_ars(valor)}*",
            parse_mode="Markdown",
        )
    except Exception as e:
        await update.message.reply_text(f"No pude actualizar: {e}")


async def cmd_objetivo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update.effective_chat.id):
        return
    api    = context.bot_data.get("api_base", DEFAULT_API_BASE)
    nombre = " ".join(context.args).strip() if context.args else ""

    try:
        objetivos = _get_objetivos(api)
    except Exception as e:
        await update.message.reply_text(f"No pude conectar con la API: {e}")
        return

    if not objetivos:
        await update.message.reply_text("No hay objetivos registrados. Creá uno desde la app.")
        return

    if not nombre:
        lines = ["🎯 *Objetivos de ahorro*\n"]
        for obj in objetivos:
            meta   = float(obj.get("meta") or 0)
            moneda = obj.get("moneda", "ARS")
            fmt_m  = _fmt_ars(meta) if moneda == "ARS" else f"USD {meta:,.0f}"
            lines.append(f"  • *{obj['nombre']}* — meta {fmt_m}")
        lines.append("\n_Usá /objetivo <nombre> para ver el progreso_")
        await update.message.reply_text("\n".join(lines), parse_mode="Markdown")
        return

    obj = _fuzzy_match(nombre, objetivos)
    if not obj:
        await update.message.reply_text(f"No encontré ningún objetivo que coincida con \"{nombre}\".")
        return

    try:
        movs_all = _get_movimientos(api)
    except Exception as e:
        await update.message.reply_text(f"No pude cargar movimientos: {e}")
        return

    await update.message.reply_text(_build_objetivo(obj, movs_all), parse_mode="Markdown")


# ──────────────────────────────────────────────────────────────
# Quick capture $: / fin:
# ──────────────────────────────────────────────────────────────

async def handle_fin_quick_capture(update: Update, context: ContextTypes.DEFAULT_TYPE,
                                    texto: str) -> bool:
    """Detecta '$:' o 'fin:' y lanza flujo de captura rápida. Devuelve True si manejado."""
    if not _is_allowed(update.effective_chat.id):
        return False
    lower = texto.lower()
    if not (lower.startswith("$:") or lower.startswith("fin:")):
        return False

    sep = texto.index(":") + 1
    raw = texto[sep:].strip()
    if not raw:
        return False

    api    = context.bot_data.get("api_base", DEFAULT_API_BASE)
    parsed = _parse_natural(raw)

    if not parsed:
        await update.message.reply_text(
            "No pude parsear el movimiento.\n"
            "Formato: `$: gasto 4500 Super Coto uala`\n"
            "         `$: ingreso 50000 sueldo galicia`",
            parse_mode="Markdown",
        )
        return True

    try:
        cuentas    = _get_cuentas(api)
        categorias = _get_categorias(api)
    except Exception as e:
        await update.message.reply_text(f"No pude cargar datos de la API: {e}")
        return True

    cuenta = _fuzzy_match(parsed["cuenta_hint"], cuentas) if parsed["cuenta_hint"] else None

    ud = context.user_data
    ud["fin_draft"] = {
        "fecha":         parsed.get("fecha") or _today_iso(),
        "tipo":          parsed["tipo"],
        "monto":         parsed["monto"],
        "descripcion":   parsed["descripcion"],
        "cuenta_id":     cuenta["id"]     if cuenta else None,
        "cuenta_nombre": cuenta["nombre"] if cuenta else None,
        "cuotas":        parsed.get("cuotas"),
    }

    tipo_icon  = _tipo_icon(parsed["tipo"])
    tipo_str   = _tipo_display(parsed["tipo"])
    cuenta_str = f" | {cuenta['nombre']}" if cuenta else " | _cuenta no detectada_"
    desc_str   = parsed["descripcion"] or "—"
    fecha_str  = ud["fin_draft"]["fecha"]
    extra_str  = f"\nFecha: {fecha_str}" + (f" | Cuotas: {parsed['cuotas']}" if parsed.get("cuotas") else "")

    if cuenta:
        # Cuenta detectada → pedir categoría
        await update.message.reply_text(
            f"{tipo_icon} *{tipo_str} {_fmt_ars(parsed['monto'])}* — {desc_str}{cuenta_str}\n\n¿Qué categoría?",
            parse_mode="Markdown",
            reply_markup=_kb_categorias(categorias, parsed["tipo"]),
        )
    else:
        # Sin cuenta → pedir cuenta primero
        await update.message.reply_text(
            f"{tipo_icon} *{tipo_str} {_fmt_ars(parsed['monto'])}* — {desc_str}\n\n¿En qué cuenta?",
            parse_mode="Markdown",
            reply_markup=_kb_cuentas(cuentas),
        )
    return True


# ──────────────────────────────────────────────────────────────
# Pasos conversacionales (llamado desde bot.py handle_message)
# ──────────────────────────────────────────────────────────────

async def handle_finanzas_step(update: Update, context: ContextTypes.DEFAULT_TYPE,
                                texto: str) -> bool:
    """Devuelve True si el mensaje fue manejado por un paso de Finanzas."""
    if not _is_allowed(update.effective_chat.id):
        return False

    ud   = context.user_data
    step = ud.get("step")

    # ── Monto ────────────────────────────────────────────────
    if step == STEP_FIN_MONTO:
        cleaned = texto.replace(",", ".").replace("$", "").strip()
        cleaned = re.sub(r"\.", "", cleaned, count=cleaned.count(".") - 1) if cleaned.count(".") > 1 else cleaned
        try:
            monto = float(cleaned)
            if monto <= 0:
                raise ValueError
        except (ValueError, TypeError):
            await update.message.reply_text("El monto debe ser un número positivo. Ej: 4500")
            return True

        ud["fin_draft"]["monto"] = monto
        ud["step"] = STEP_FIN_DESC
        await update.message.reply_text(
            f"Monto: *{_fmt_ars(monto)}* ✓\n\n"
            f"¿Descripción? (ej: Super Coto)\n"
            f"Escribí `-` para omitir.",
            parse_mode="Markdown",
        )
        return True

    # ── Descripción ──────────────────────────────────────────
    if step == STEP_FIN_DESC:
        desc = "" if texto.strip() in ("-", "skip", "–") else texto.strip()
        ud["fin_draft"]["descripcion"] = desc

        api = context.bot_data.get("api_base", DEFAULT_API_BASE)
        try:
            cuentas = _get_cuentas(api)
        except Exception as e:
            await update.message.reply_text(f"No pude cargar las cuentas: {e}")
            ud.clear()
            return True

        if not cuentas:
            await update.message.reply_text("No hay cuentas registradas. Creá una desde la app.")
            ud.clear()
            return True

        del ud["step"]
        desc_label = desc if desc else "—"
        await update.message.reply_text(
            f"Descripción: *{desc_label}* ✓\n\n¿En qué cuenta?",
            parse_mode="Markdown",
            reply_markup=_kb_cuentas(cuentas),
        )
        return True

    # ── Categoría libre ──────────────────────────────────────
    if step == STEP_FIN_CAT_TEXT:
        cat_nombre = texto.strip()
        if not cat_nombre:
            await update.message.reply_text("El nombre de la categoría no puede estar vacío.")
            return True

        api = context.bot_data.get("api_base", DEFAULT_API_BASE)
        tipo_mov = ud.get("fin_draft", {}).get("tipo", "expense")
        try:
            cat = _post_categoria(api, cat_nombre, tipo_mov)
        except Exception as e:
            await update.message.reply_text(f"No pude crear la categoría: {e}")
            return True

        ud["fin_draft"]["categoria_nombre"] = cat["nombre"]
        ud["fin_draft"]["categoria_id"]     = cat["id"]
        del ud["step"]

        await update.message.reply_text(
            _draft_preview(ud) + "\n\n¿Confirmar el movimiento?",
            parse_mode="Markdown",
            reply_markup=_kb_confirmar(),
        )
        return True

    return False


# ──────────────────────────────────────────────────────────────
# Callback handler (llamado desde bot.py dispatch_callback)
# ──────────────────────────────────────────────────────────────

async def handle_finanzas_callback(update: Update, context: ContextTypes.DEFAULT_TYPE,
                                    data: str) -> bool:
    """Devuelve True si el callback fue manejado por Finanzas. NO llama query.answer()."""
    if not _is_allowed(update.effective_chat.id):
        return False

    query = update.callback_query
    api   = context.bot_data.get("api_base", DEFAULT_API_BASE)
    ud    = context.user_data

    # ── Tipo seleccionado ────────────────────────────────────
    if data.startswith("ft:"):
        tipo = data[3:]
        ud.setdefault("fin_draft", {})["tipo"] = tipo
        ud.setdefault("fin_draft", {}).setdefault("fecha", _today_iso())
        ud["step"] = STEP_FIN_MONTO
        await query.edit_message_text(
            f"{_tipo_icon(tipo)} *{_tipo_display(tipo)}*\n\n"
            f"¿Cuánto fue? (solo el número, ej: 4500)",
            parse_mode="Markdown",
        )
        return True

    # ── Cuenta seleccionada ──────────────────────────────────
    if data.startswith("fcc:"):
        cuenta_id = int(data[4:])
        try:
            cuentas = _get_cuentas(api)
        except Exception as e:
            await query.message.reply_text(f"No pude cargar las cuentas: {e}")
            return True

        cuenta = next((c for c in cuentas if int(c["id"]) == cuenta_id), None)
        if not cuenta:
            await query.message.reply_text("Cuenta no encontrada.")
            return True

        ud.setdefault("fin_draft", {}).update({
            "cuenta_id":     cuenta_id,
            "cuenta_nombre": cuenta["nombre"],
        })

        try:
            categorias = _get_categorias(api)
        except Exception as e:
            await query.message.reply_text(f"No pude cargar las categorías: {e}")
            return True

        tipo_mov = ud.get("fin_draft", {}).get("tipo", "expense")
        await query.edit_message_text(
            f"Cuenta: *{cuenta['nombre']}* ✓\n\n¿Qué categoría?",
            parse_mode="Markdown",
            reply_markup=_kb_categorias(categorias, tipo_mov),
        )
        return True

    # ── Categoría seleccionada ───────────────────────────────
    if data.startswith("fcat:"):
        cat_id = int(data[5:])
        try:
            categorias = _get_categorias(api)
        except Exception as e:
            await query.message.reply_text(f"No pude cargar las categorías: {e}")
            return True

        cat = next((c for c in categorias if c["id"] == cat_id), None)
        if not cat:
            await query.message.reply_text("Categoría no encontrada.")
            return True

        ud.setdefault("fin_draft", {}).update({
            "categoria_id":     cat_id,
            "categoria_nombre": cat["nombre"],
        })

        await query.edit_message_text(
            _draft_preview(ud) + "\n\n¿Confirmar el movimiento?",
            parse_mode="Markdown",
            reply_markup=_kb_confirmar(),
        )
        return True

    # ── "Otra categoría…" → input de texto ──────────────────
    if data == "fcat_text":
        ud["step"] = STEP_FIN_CAT_TEXT
        await query.edit_message_text(
            "Escribí el nombre de la *nueva* categoría (se guarda en Finanzas → Datos):",
            parse_mode="Markdown",
        )
        return True

    # ── Confirmar movimiento ─────────────────────────────────
    if data == "fok":
        draft        = ud.get("fin_draft", {})
        tipo         = draft.get("tipo", "expense")
        monto        = draft.get("monto")
        descripcion  = draft.get("descripcion") or ""
        cuenta_id    = draft.get("cuenta_id")
        categoria_id = draft.get("categoria_id")
        cat_nombre   = draft.get("categoria_nombre")
        fecha        = draft.get("fecha") or _today_iso()

        if not monto or not cuenta_id:
            await query.message.reply_text("Datos incompletos. Usá /mov para empezar de nuevo.")
            ud.clear()
            return True

        body: dict = {
            "tipo":        tipo,
            "monto":       monto,
            "descripcion": descripcion,
            "fecha":       fecha,
            "cuenta_id":   cuenta_id,
        }
        if draft.get("cuotas"):
            body["cuotas"] = int(draft["cuotas"])
        if categoria_id:
            body["categoria_id"] = categoria_id
        elif cat_nombre:
            body["categoria_nombre"] = cat_nombre

        try:
            r = requests.post(f"{api}/fin/movimientos", json=body, timeout=15)
            r.raise_for_status()
        except Exception as e:
            await query.message.reply_text(f"No pude guardar el movimiento: {e}")
            ud.clear()
            return True

        preview = _draft_preview(ud)
        ud.clear()
        await query.edit_message_text(
            f"✅ Movimiento guardado\n\n{preview}",
            parse_mode="Markdown",
        )
        return True

    # ── Cancelar ─────────────────────────────────────────────
    if data == "fno":
        ud.pop("fin_draft", None)
        ud.pop("step", None)
        await query.edit_message_text("Movimiento cancelado.")
        return True

    # ── Eliminar movimiento ──────────────────────────────────
    if data.startswith("fdel:"):
        mov_id = int(data[5:])
        try:
            _delete_movimiento(api, mov_id)
        except Exception as e:
            await query.message.reply_text(f"No pude eliminar el movimiento: {e}")
            return True

        try:
            movs        = _get_movimientos(api)
            text, markup = _build_ultimo(movs)
            await query.edit_message_text(text, parse_mode="Markdown", reply_markup=markup)
        except Exception:
            pass
        await query.message.reply_text("🗑 Movimiento eliminado.")
        return True

    return False


# ──────────────────────────────────────────────────────────────
# Resumen semanal de finanzas (job_queue — lunes 9:00)
# ──────────────────────────────────────────────────────────────

async def resumen_semanal_finanzas(context):
    """Enviado automáticamente cada lunes a las 9:00. Solo ejecuta si hoy es lunes."""
    if datetime.today().weekday() != 0:  # 0 = lunes
        return
    chat_id = context.bot_data.get("chat_id")
    if not chat_id:
        return
    api = context.bot_data.get("api_base", "http://127.0.0.1:8765")
    try:
        mes = date.today().strftime("%Y-%m")
        movs = _get_movimientos(api, mes)
        texto = _build_mes(movs, mes)
        await context.bot.send_message(
            chat_id=chat_id,
            text=f"📊 *Resumen semanal de finanzas*\n\n{texto}",
            parse_mode="Markdown",
        )
    except Exception:
        pass
