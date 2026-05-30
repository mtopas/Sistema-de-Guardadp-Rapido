import os
import time
from datetime import date, datetime, timedelta
import json
from pathlib import Path
import re
import requests
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

from api_config import API_BASE as DEFAULT_API_BASE

# ──────────────────────────────────────────────────────────────
# Pasos conversacionales
# ──────────────────────────────────────────────────────────────
STEP_AGENDA_CHOOSE_LISTA       = "agenda_choose_lista"
STEP_AGENDA_CHOOSE_CALENDARIO  = "agenda_choose_calendario"
STEP_HABITO_NOTA               = "habito_nota"
STEP_AYER_VALOR                = "ayer_valor"
STEP_PLANIFICAR_NUEVA_TAREA    = "planificar_nueva_tarea"

HABITOS_CACHE_TTL = 60  # segundos

_CHECKIN_CONFIG_FILE = Path(__file__).parent / "checkin_config.json"


def _load_checkin_time() -> tuple[int, int]:
    """Returns (hour, minute) for nightly check-in, default 21:00."""
    try:
        data = json.loads(_CHECKIN_CONFIG_FILE.read_text())
        return data.get("hour", 21), data.get("minute", 0)
    except Exception:
        return 21, 0


def _save_checkin_time(hour: int, minute: int):
    try:
        _CHECKIN_CONFIG_FILE.write_text(json.dumps({"hour": hour, "minute": minute}))
    except Exception:
        pass

# ──────────────────────────────────────────────────────────────
# Texto de ayuda
# ──────────────────────────────────────────────────────────────
HELP_TEXT = """\
🤖 *SGR — comandos disponibles*

💰 *Finanzas*
/mov — nuevo movimiento (flujo guiado con botones)
/saldo — saldo de todas las cuentas + equivalente USD
/mes [YYYY-MM] — ingresos, gastos y tasa ahorro del mes
/ahorro — total ahorrado este mes + objetivos
/ultimo — últimos 5 movimientos (con botón para eliminar)
/dolar [valor] — ver o actualizar el tipo de cambio manual
/objetivo [nombre] — listar objetivos o ver progreso de uno
`$: gasto 4500 Super Coto uala` — captura rápida de movimiento

📅 *Agenda*
/hoy — eventos, tareas y hábitos de hoy
/dia <fecha> — igual a /hoy para otro día (hoy/mañana/viernes/2026-05-25)
/planificar — organiza el día: ve lo ocupado, los huecos libres y asigná tareas
/asignar <letra o nombre> <HH:MM> — asigna tarea del último /planificar a una hora
/tarea <texto> — nueva tarea; acepta fecha (mañana, viernes…)
/evento <texto> — nuevo evento; reconoce hora (14:30), fecha, duración (2h)
/pendientes — todas las tareas pendientes
/semana — resumen de los próximos 7 días
/bloquear <N> <HH:MM> — bloquea la tarea #N del último /hoy en esa hora
/revision — resumen de la semana pasada
/checkin [HH:MM] — ver o cambiar la hora del check-in nocturno

🌱 *Hábitos*
/habitos — hábitos de hoy con botones Total / Parcial
/hecho <nombre> — marca un hábito como total hoy (match por nombre)
/ayer <nombre> [total|parcial] — marca un hábito de ayer
/racha — rachas de todos los hábitos activos
/nota <nombre> <texto> — agrega nota al registro de hoy

📦 *Bóveda*
Enviá cualquier texto, foto o ubicación y te pide la categoría.
Prefijos rápidos: `t: comprar leche` (tarea) · `e: dentista 10:30` (evento)
/ultimas — últimas hojas guardadas (con botón para eliminar)
/buscar <texto> — buscar en la Bóveda
/rapido on|off — modo rápido (guarda en última categoría sin pedir)

ℹ️ *General*
/help — esta ayuda
/cancel — cancelar la acción en curso
"""

# ──────────────────────────────────────────────────────────────
# Helpers de fecha / hora
# ──────────────────────────────────────────────────────────────
_DIAS_ES = {
    "lunes": 0, "martes": 1, "miércoles": 2, "miercoles": 2,
    "jueves": 3, "viernes": 4, "sábado": 5, "sabado": 5, "domingo": 6,
}
_NOMBRES_DIA = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]
_MESES_ES    = ["ene", "feb", "mar", "abr", "may", "jun",
                "jul", "ago", "sep", "oct", "nov", "dic"]


def _today_iso() -> str:
    return date.today().isoformat()


def _fecha_display(iso: str) -> str:
    """'2026-05-21' → 'jue 21 may'"""
    d = date.fromisoformat(iso)
    return f"{_NOMBRES_DIA[d.weekday()]} {d.day} {_MESES_ES[d.month - 1]}"


def _hora_display(iso_dt: str) -> str:
    try:
        return iso_dt[11:16]
    except Exception:
        return ""


def _python_weekday_to_js(wd: int) -> int:
    """Python weekday (Mon=0) → JS/hábitos (Sun=0)."""
    return (wd + 1) % 7


def parse_duracion(text: str):
    """Extrae duración en horas del texto. Devuelve (horas_float, texto_limpio)."""
    m = re.search(r"\b(\d+(?:\.\d+)?)\s*h(?:s|oras?)?\b", text, re.IGNORECASE)
    if m:
        horas = float(m.group(1))
        text = text[: m.start()] + text[m.end() :]
        return horas, text.strip(" ,.-")
    return 1.0, text


def parse_fecha_hora(text: str):
    """
    Extrae fecha, hora y duración del texto libre.
    Returns: (fecha_iso, hora_str | None, duracion_horas, texto_limpio)
    """
    duracion, text = parse_duracion(text)

    hora = None
    fecha = None

    m = re.search(r"\b(\d{1,2}):(\d{2})\b", text)
    if m:
        hora = f"{int(m.group(1)):02d}:{m.group(2)}"
        text = text[: m.start()] + text[m.end() :]

    text_lower = text.lower()
    today = date.today()

    if re.search(r"ma[ñn]ana", text_lower):
        fecha = (today + timedelta(days=1)).isoformat()
        text = re.sub(r"ma[ñn]ana", "", text, flags=re.IGNORECASE)
    elif "hoy" in text_lower:
        fecha = today.isoformat()
        text = re.sub(r"\bhoy\b", "", text, flags=re.IGNORECASE)
    else:
        for day_name, py_wd in _DIAS_ES.items():
            if day_name in text_lower:
                days_ahead = py_wd - today.weekday()
                if days_ahead <= 0:
                    days_ahead += 7
                fecha = (today + timedelta(days=days_ahead)).isoformat()
                text = re.sub(day_name, "", text, flags=re.IGNORECASE)
                break

    if fecha is None:
        fecha = today.isoformat()

    return fecha, hora, duracion, text.strip(" ,.-")


def _parse_fecha_simple(text: str) -> str:
    """Convierte texto a fecha ISO. Para /dia. Default: hoy."""
    text = text.strip().lower()
    today = date.today()
    if not text or text == "hoy":
        return today.isoformat()
    if re.match(r"ma[ñn]ana", text):
        return (today + timedelta(days=1)).isoformat()
    if re.match(r"\d{4}-\d{2}-\d{2}", text):
        return text
    for day_name, py_wd in _DIAS_ES.items():
        if day_name in text:
            days_ahead = py_wd - today.weekday()
            if days_ahead <= 0:
                days_ahead += 7
            return (today + timedelta(days=days_ahead)).isoformat()
    return today.isoformat()


# ──────────────────────────────────────────────────────────────
# Hábitos: lógica de racha y schedule (port de habitosUtils.js)
# ──────────────────────────────────────────────────────────────

def _is_scheduled(habito: dict, d: date) -> bool:
    if not habito.get("activo", True):
        return False
    if habito.get("frecuencia_tipo") == "diario":
        return True
    dias_json = habito.get("dias_semana")
    if not dias_json:
        return False
    try:
        dias = json.loads(dias_json) if isinstance(dias_json, str) else dias_json
        return _python_weekday_to_js(d.weekday()) in dias
    except Exception:
        return False


def _is_scheduled_today(habito: dict) -> bool:
    return _is_scheduled(habito, date.today())


def _calc_racha(habito: dict, registros_map: dict) -> int:
    """Port de calcStreak de habitosUtils.js."""
    today = date.today()
    streak = 0
    d = today
    creado_en = (habito.get("creado_en") or "")[:10]

    for _ in range(366):
        iso = d.isoformat()
        if creado_en and iso < creado_en:
            break
        key = f"{habito['id']}-{iso}"

        if _is_scheduled(habito, d):
            reg = registros_map.get(key)
            if reg and reg.get("valor", 0) > 0:
                streak += 1
            elif iso == today.isoformat():
                pass  # hoy todavía puede completarse
            else:
                break  # día programado sin completar → racha rota

        d -= timedelta(days=1)

    return streak


def _fuzzy_match_habito(nombre: str, habitos: list):
    """Encuentra el hábito más parecido al nombre dado."""
    nombre_lower = nombre.lower()
    # Exacto
    for h in habitos:
        if h["nombre"].lower() == nombre_lower:
            return h
    # Contiene
    for h in habitos:
        if nombre_lower in h["nombre"].lower() or h["nombre"].lower() in nombre_lower:
            return h
    # Por palabras
    words = nombre_lower.split()
    for h in habitos:
        h_words = h["nombre"].lower().split()
        if any(w in h_words for w in words):
            return h
    return None


# ──────────────────────────────────────────────────────────────
# Cache de hábitos
# ──────────────────────────────────────────────────────────────

def _get_habitos_cached(bot_data: dict, api: str) -> list:
    cache = bot_data.get("habitos_cache", {})
    if time.time() - cache.get("ts", 0) < HABITOS_CACHE_TTL:
        return cache["data"]
    data = _get_habitos(api)
    bot_data["habitos_cache"] = {"ts": time.time(), "data": data}
    return data


def _invalidar_cache_habitos(bot_data: dict):
    bot_data.pop("habitos_cache", None)


# ──────────────────────────────────────────────────────────────
# Llamadas a la API
# ──────────────────────────────────────────────────────────────

def _get_listas(api_base: str):
    r = requests.get(f"{api_base}/agenda/listas", timeout=15)
    r.raise_for_status()
    return r.json()


def _get_calendarios(api_base: str):
    r = requests.get(f"{api_base}/agenda/calendarios", timeout=15)
    r.raise_for_status()
    return r.json()


def _get_tareas_pendientes(api_base: str):
    r = requests.get(f"{api_base}/agenda/tareas",
                     params={"pendientes": "true"}, timeout=15)
    r.raise_for_status()
    return r.json()


def _get_eventos_rango(api_base: str, desde: str, hasta: str):
    r = requests.get(f"{api_base}/agenda/eventos",
                     params={"desde": desde, "hasta": hasta}, timeout=15)
    r.raise_for_status()
    return r.json()


def _post_tarea(api_base: str, titulo: str, lista_id: int, fecha_opcional=None):
    body = {"titulo": titulo, "lista_id": lista_id}
    if fecha_opcional:
        body["fecha_opcional"] = fecha_opcional
    r = requests.post(f"{api_base}/agenda/tareas", json=body, timeout=15)
    r.raise_for_status()
    return r.json()


def _post_evento(api_base: str, titulo: str, fecha_inicio: str,
                 fecha_fin: str, calendario_id: int):
    body = {
        "titulo": titulo,
        "fecha_inicio": fecha_inicio,
        "fecha_fin": fecha_fin,
        "calendario_id": calendario_id,
    }
    r = requests.post(f"{api_base}/agenda/eventos", json=body, timeout=15)
    r.raise_for_status()
    return r.json()


def _patch_tarea(api_base: str, tarea_id: int, campos: dict):
    r = requests.patch(f"{api_base}/agenda/tareas/{tarea_id}", json=campos, timeout=15)
    r.raise_for_status()
    return r.json()


def _patch_tarea_completada(api_base: str, tarea_id: int):
    return _patch_tarea(api_base, tarea_id, {"completada": True})


def _patch_tarea_descompletar(api_base: str, tarea_id: int):
    return _patch_tarea(api_base, tarea_id, {"completada": False})


def _patch_tarea_bloque(api_base: str, tarea_id: int, hora_bloque: str, fecha: str):
    return _patch_tarea(api_base, tarea_id, {
        "hora_bloque": hora_bloque,
        "fecha_opcional": fecha,
    })


def _get_habitos(api_base: str):
    r = requests.get(f"{api_base}/habitos", timeout=15)
    r.raise_for_status()
    return r.json()


def _get_registros(api_base: str, desde: str, hasta: str):
    r = requests.get(f"{api_base}/habitos/registros",
                     params={"fecha_desde": desde, "fecha_hasta": hasta}, timeout=15)
    r.raise_for_status()
    return r.json()


def _get_registros_hoy(api_base: str, fecha: str):
    return _get_registros(api_base, fecha, fecha)


def _put_registro(api_base: str, habito_id: int, fecha: str, valor: float, nota: str = None):
    body = {"fecha": fecha, "valor": valor}
    if nota:
        body["nota"] = nota
    r = requests.put(f"{api_base}/habitos/{habito_id}/registro", json=body, timeout=15)
    r.raise_for_status()
    return r.json()


def _delete_registro_por_habito_fecha(api_base: str, habito_id: int, fecha: str):
    """Busca el registro del día y lo elimina."""
    registros = _get_registros(api_base, fecha, fecha)
    for reg in registros:
        if reg["habito_id"] == habito_id:
            r = requests.delete(f"{api_base}/habitos/registros/{reg['id']}", timeout=15)
            r.raise_for_status()
            return True
    return False


def _get_revision(api_base: str, desde: str, hasta: str):
    r = requests.get(f"{api_base}/agenda/revision",
                     params={"desde": desde, "hasta": hasta}, timeout=15)
    r.raise_for_status()
    return r.json()


# ──────────────────────────────────────────────────────────────
# Formateo de mensajes
# ──────────────────────────────────────────────────────────────

def _build_hoy(tareas: list, eventos: list, habitos: list = None, registros: list = None):
    """Returns (texto, InlineKeyboardMarkup | None)"""
    hoy = _today_iso()
    lines = [f"📅 *HOY — {_fecha_display(hoy)}*\n"]

    # Eventos
    if eventos:
        lines.append("🕐 *Eventos*")
        for e in eventos:
            hora = _hora_display(e.get("fecha_inicio", ""))
            hora_fin = _hora_display(e.get("fecha_fin", ""))
            rango = f"{hora}–{hora_fin}" if hora_fin and hora_fin != hora else hora
            lines.append(f"  • {rango}  {e['titulo']}" if rango else f"  • {e['titulo']}")
    else:
        lines.append("🕐 Sin eventos hoy")

    # Tareas
    lines.append("")
    pendientes = [t for t in tareas if not t.get("completada")]
    if pendientes:
        lines.append("📋 *Tareas pendientes*")
        for t in pendientes[:15]:
            fecha_t = t.get("fecha_opcional") or ""
            lista = t.get("lista_nombre") or ""
            sufijo_fecha = f"  _{fecha_t}_" if fecha_t and fecha_t != hoy else ""
            sufijo_lista = f" [{lista}]" if lista else ""
            lines.append(f"  • {t['titulo']}{sufijo_lista}{sufijo_fecha}")
    else:
        lines.append("📋 Sin tareas pendientes")

    # Hábitos
    if habitos and registros is not None:
        reg_map = {r["habito_id"]: r for r in registros}
        programados = [h for h in habitos if _is_scheduled_today(h)]
        if programados:
            lines.append("")
            lines.append("🌱 *Hábitos de hoy*")
            for h in programados:
                reg = reg_map.get(h["id"])
                valor = reg["valor"] if reg else None
                icon = "✅" if valor and valor >= 1.0 else ("⚡" if valor else "⬜")
                lines.append(f"  {icon} {h['nombre']}")

    # Botones de tareas (máx 10)
    botones = []
    for t in pendientes[:10]:
        titulo_short = t["titulo"][:28] + ("…" if len(t["titulo"]) > 28 else "")
        botones.append([InlineKeyboardButton(f"✓ {titulo_short}", callback_data=f"ta:{t['id']}")])

    markup = InlineKeyboardMarkup(botones) if botones else None
    return "\n".join(lines), markup


def _build_dia(fecha: str, tareas: list, eventos: list):
    """Igual que _build_hoy pero para cualquier día (sin sección hábitos)."""
    hoy = _today_iso()
    label = "HOY" if fecha == hoy else _fecha_display(fecha).upper()
    lines = [f"📅 *{label}*\n"]

    if eventos:
        lines.append("🕐 *Eventos*")
        for e in eventos:
            hora = _hora_display(e.get("fecha_inicio", ""))
            hora_fin = _hora_display(e.get("fecha_fin", ""))
            rango = f"{hora}–{hora_fin}" if hora_fin and hora_fin != hora else hora
            lines.append(f"  • {rango}  {e['titulo']}" if rango else f"  • {e['titulo']}")
    else:
        lines.append("🕐 Sin eventos")

    lines.append("")
    pendientes = [
        t for t in tareas
        if not t.get("completada") and (
            t.get("fecha_opcional") == fecha or not t.get("fecha_opcional")
        )
    ]
    if pendientes:
        lines.append("📋 *Tareas*")
        for t in pendientes[:15]:
            lista = t.get("lista_nombre") or ""
            sufijo = f" [{lista}]" if lista else ""
            lines.append(f"  • {t['titulo']}{sufijo}")
    else:
        lines.append("📋 Sin tareas")

    botones = []
    for t in pendientes[:10]:
        titulo_short = t["titulo"][:28] + ("…" if len(t["titulo"]) > 28 else "")
        botones.append([InlineKeyboardButton(f"✓ {titulo_short}", callback_data=f"ta:{t['id']}")])
    markup = InlineKeyboardMarkup(botones) if botones else None
    return "\n".join(lines), markup


def _build_semana(eventos: list, tareas: list) -> str:
    hoy = date.today()
    dias: dict[str, list] = {}
    for i in range(7):
        dias[(hoy + timedelta(days=i)).isoformat()] = []

    for e in eventos:
        fecha_e = (e.get("fecha_inicio") or "")[:10]
        if fecha_e in dias:
            hora = _hora_display(e.get("fecha_inicio", ""))
            label = f"🕐 {hora}  {e['titulo']}" if hora else f"🕐 {e['titulo']}"
            dias[fecha_e].append(label)

    for t in tareas:
        if t.get("completada"):
            continue
        fecha_t = t.get("fecha_opcional") or ""
        if fecha_t in dias:
            lista = t.get("lista_nombre") or ""
            sufijo = f" [{lista}]" if lista else ""
            dias[fecha_t].append(f"📋 {t['titulo']}{sufijo}")

    lines = ["📆 *Próximos 7 días*\n"]
    for iso, items in dias.items():
        d = date.fromisoformat(iso)
        label = "HOY" if d == hoy else _fecha_display(iso).upper()
        lines.append(f"*{label}*")
        lines.extend(f"  {item}" for item in items) if items else lines.append("  —")
    return "\n".join(lines)


def _build_habitos(habitos: list, registros: list):
    """Returns (texto, InlineKeyboardMarkup | None)"""
    hoy = _today_iso()
    reg_map = {r["habito_id"]: r for r in registros}
    programados = [h for h in habitos if _is_scheduled_today(h)]

    if not programados:
        return (f"🌱 *Hábitos — {_fecha_display(hoy)}*\n\n"
                "No hay hábitos programados para hoy."), None

    lines = [f"🌱 *Hábitos — {_fecha_display(hoy)}*\n"]
    for h in programados:
        reg = reg_map.get(h["id"])
        valor = reg["valor"] if reg else None
        icon = "✅" if valor and valor >= 1.0 else ("⚡" if valor else "⬜")
        nota_icon = " 📝" if reg and reg.get("nota") else ""
        lines.append(f"{icon} {h['nombre']}{nota_icon}")

    botones = []
    for h in programados:
        nombre_short = h["nombre"][:18] + ("…" if len(h["nombre"]) > 18 else "")
        reg = reg_map.get(h["id"])
        valor = reg["valor"] if reg else None
        if valor and valor >= 1.0:
            # Ya completado: solo botón deshacer
            botones.append([
                InlineKeyboardButton(f"↩ {nombre_short}", callback_data=f"hd:{h['id']}"),
            ])
        else:
            botones.append([
                InlineKeyboardButton(f"✓ {nombre_short}", callback_data=f"hc:{h['id']}"),
                InlineKeyboardButton(f"½ {nombre_short}", callback_data=f"hp:{h['id']}"),
            ])

    markup = InlineKeyboardMarkup(botones) if botones else None
    return "\n".join(lines), markup


def _build_racha(habitos: list, registros: list) -> str:
    """Construye el mensaje de rachas."""
    hoy = _today_iso()
    desde = (date.today() - timedelta(days=90)).isoformat()
    reg_map = {}
    for r in registros:
        key = f"{r['habito_id']}-{r['fecha']}"
        reg_map[key] = r

    activos = [h for h in habitos if h.get("activo", True)]
    if not activos:
        return "🌱 No hay hábitos activos."

    lines = [f"🔥 *Rachas — {_fecha_display(hoy)}*\n"]
    activos_ordenados = sorted(activos, key=lambda h: _calc_racha(h, reg_map), reverse=True)
    for h in activos_ordenados:
        racha = _calc_racha(h, reg_map)
        hoy_status = ""
        key_hoy = f"{h['id']}-{hoy}"
        reg_hoy = reg_map.get(key_hoy)
        if reg_hoy:
            hoy_status = " ✅" if reg_hoy["valor"] >= 1.0 else " ⚡"
        elif _is_scheduled_today(h):
            hoy_status = " ⬜"

        if racha >= 7:
            racha_str = f"🔥 {racha} días"
        elif racha >= 3:
            racha_str = f"🌱 {racha} días"
        elif racha > 0:
            racha_str = f"{racha} día{'s' if racha > 1 else ''}"
        else:
            racha_str = "sin racha"
        lines.append(f"  *{h['nombre']}* — {racha_str}{hoy_status}")

    return "\n".join(lines)


def _build_revision(resumen: dict) -> str:
    desde = resumen["desde"]
    hasta = resumen["hasta"]
    d_desde = date.fromisoformat(desde)
    d_hasta = date.fromisoformat(hasta)

    lines = [
        f"📊 *Revisión semanal*",
        f"_{_fecha_display(desde)} → {_fecha_display(hasta)}_\n",
    ]

    completadas = resumen["completadas"]
    incompletas = resumen["incompletas"]
    total_tareas = completadas + incompletas
    pct_tareas = round(completadas / total_tareas * 100) if total_tareas else 0

    lines.append(f"📋 *Tareas:* {completadas}/{total_tareas} completadas ({pct_tareas}%)")
    if resumen["vencidas"]:
        lines.append(f"⚠️ *Vencidas pendientes:* {resumen['vencidas']}")
    lines.append(f"🕐 *Eventos:* {resumen['total_eventos']}")

    if resumen.get("por_calendario"):
        lines.append("\n*Tiempo por calendario:*")
        for cal in resumen["por_calendario"]:
            h = cal["minutos"] // 60
            m = cal["minutos"] % 60
            dur = f"{h}h {m}m" if h else f"{m}m"
            lines.append(f"  • {cal['nombre']}: {dur}")

    return "\n".join(lines)


def _time_to_minutes(t: str) -> int:
    """'HH:MM' → minutos desde medianoche."""
    try:
        h, m = map(int, t.split(":"))
        return h * 60 + m
    except Exception:
        return 0


def _minutes_to_time(m: int) -> str:
    """Minutos desde medianoche → 'HH:MM'."""
    return f"{m // 60:02d}:{m % 60:02d}"


def _dur_str(minutos: int) -> str:
    h = minutos // 60
    m = minutos % 60
    if h and m:
        return f"{h}h {m}m"
    return f"{h}h" if h else f"{m}m"


def _calc_slots_libres(eventos_hoy: list, tareas_bloqueadas: list,
                       inicio_h: int = 6, fin_h: int = 23) -> list:
    """
    Devuelve lista de slots libres [{desde, hasta, minutos}] en el rango dado,
    excluyendo los bloques ocupados por eventos y tareas con hora_bloque.
    Solo muestra slots de al menos 15 minutos.
    """
    ocupados = []

    for e in eventos_hoy:
        h_i = _hora_display(e.get("fecha_inicio", ""))
        h_f = _hora_display(e.get("fecha_fin", ""))
        if h_i and h_f:
            a, b = _time_to_minutes(h_i), _time_to_minutes(h_f)
            if b > a:
                ocupados.append((a, b))

    for t in tareas_bloqueadas:
        hora = t.get("hora_bloque")
        if hora:
            a = _time_to_minutes(hora)
            dur = t.get("duracion_estimada") or 30
            ocupados.append((a, a + dur))

    ocupados.sort()
    merged = []
    for start, end in ocupados:
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append([start, end])

    inicio_min = inicio_h * 60
    fin_min = fin_h * 60
    slots = []
    cursor = inicio_min

    for occ_s, occ_e in merged:
        if occ_s > cursor:
            dur = occ_s - cursor
            if dur >= 15:
                slots.append({
                    "desde": _minutes_to_time(cursor),
                    "hasta": _minutes_to_time(occ_s),
                    "minutos": dur,
                })
        cursor = max(cursor, occ_e)

    if cursor < fin_min:
        dur = fin_min - cursor
        if dur >= 15:
            slots.append({
                "desde": _minutes_to_time(cursor),
                "hasta": _minutes_to_time(fin_min),
                "minutos": dur,
            })

    return slots


_LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _build_planificar(eventos_hoy: list, tareas_hoy: list, tareas_sin_bloque: list):
    """Returns (texto, InlineKeyboardMarkup | None)"""
    hoy = _today_iso()
    lines = [f"🗓 *Planificá el día — {_fecha_display(hoy)}*\n"]

    # Bloques ocupados ordenados
    bloques = []
    for e in eventos_hoy:
        h_i = _hora_display(e.get("fecha_inicio", ""))
        h_f = _hora_display(e.get("fecha_fin", ""))
        if h_i:
            bloques.append((h_i, h_f or "?", e["titulo"], "evento"))
    for t in tareas_hoy:
        hora = t.get("hora_bloque")
        if hora:
            dur = t.get("duracion_estimada") or 30
            h_f = _minutes_to_time(_time_to_minutes(hora) + dur)
            bloques.append((hora, h_f, t["titulo"], "tarea"))
    bloques.sort(key=lambda b: b[0])

    if bloques:
        lines.append("⏰ *Ocupado*")
        for h_i, h_f, titulo, tipo in bloques:
            icon = "📅" if tipo == "evento" else "📋"
            rango = f"{h_i}–{h_f}" if h_f != "?" else h_i
            lines.append(f"  {icon} {rango}  {titulo}")
    else:
        lines.append("⏰ Sin nada agendado todavía")

    # Slots libres
    tareas_bloqueadas = [t for t in tareas_hoy if t.get("hora_bloque")]
    slots = _calc_slots_libres(eventos_hoy, tareas_bloqueadas)

    lines.append("")
    if slots:
        lines.append("🕓 *Tiempo libre*")
        for i, s in enumerate(slots, 1):
            lines.append(f"  {i}. {s['desde']}–{s['hasta']}  ({_dur_str(s['minutos'])})")
    else:
        lines.append("🕓 Sin tiempo libre disponible")

    # Tareas sin asignar
    lines.append("")
    if tareas_sin_bloque:
        lines.append("📋 *Sin hora asignada*")
        for i, t in enumerate(tareas_sin_bloque[:10]):
            lista = t.get("lista_nombre") or ""
            sufijo = f" [{lista}]" if lista else ""
            lines.append(f"  {_LETRAS[i]}. {t['titulo']}{sufijo}")
        lines.append("")
        lines.append("_Tap un hueco libre para asignar una tarea, o usá /asignar A 10:30_")
    else:
        lines.append("📋 Todas las tareas tienen hora asignada")

    # Botones: uno por slot libre (máx 5)
    botones = [
        [InlineKeyboardButton(
            f"📌 {s['desde']} ({_dur_str(s['minutos'])} libre)",
            callback_data=f"pl:{s['desde']}",
        )]
        for s in slots[:5]
    ]

    markup = InlineKeyboardMarkup(botones) if botones else None
    return "\n".join(lines), markup


# ──────────────────────────────────────────────────────────────
# Handlers de comandos
# ──────────────────────────────────────────────────────────────

async def cmd_hoy(update: Update, context: ContextTypes.DEFAULT_TYPE):
    api = context.bot_data.get("api_base", DEFAULT_API_BASE)
    try:
        hoy = _today_iso()
        tareas   = _get_tareas_pendientes(api)
        eventos  = _get_eventos_rango(api, hoy, hoy)
        habitos  = _get_habitos_cached(context.bot_data, api)
        registros = _get_registros_hoy(api, hoy)
    except Exception as e:
        await update.message.reply_text(f"No pude conectar con la API: {e}")
        return

    # Guardar tareas para /bloquear
    context.user_data["last_hoy_tareas"] = [t for t in tareas if not t.get("completada")]

    text, markup = _build_hoy(tareas, eventos, habitos, registros)
    await update.message.reply_text(text, parse_mode="Markdown", reply_markup=markup)


async def cmd_dia(update: Update, context: ContextTypes.DEFAULT_TYPE):
    api = context.bot_data.get("api_base", DEFAULT_API_BASE)
    raw = " ".join(context.args).strip() if context.args else ""
    fecha = _parse_fecha_simple(raw)

    try:
        tareas  = _get_tareas_pendientes(api)
        eventos = _get_eventos_rango(api, fecha, fecha)
    except Exception as e:
        await update.message.reply_text(f"No pude conectar con la API: {e}")
        return

    text, markup = _build_dia(fecha, tareas, eventos)
    await update.message.reply_text(text, parse_mode="Markdown", reply_markup=markup)


async def cmd_tarea(update: Update, context: ContextTypes.DEFAULT_TYPE):
    api = context.bot_data.get("api_base", DEFAULT_API_BASE)
    raw = " ".join(context.args).strip() if context.args else ""

    if not raw:
        await update.message.reply_text(
            "Uso: /tarea <texto>\nEjemplos:\n"
            "  /tarea Comprar leche\n"
            "  /tarea Estudiar para mañana\n"
            "  /tarea Reunión el viernes"
        )
        return

    fecha, _, _, titulo = parse_fecha_hora(raw)
    if not titulo:
        titulo = raw.strip()

    try:
        listas = _get_listas(api)
    except Exception as e:
        await update.message.reply_text(f"No pude cargar las listas: {e}")
        return

    if not listas:
        await update.message.reply_text("No hay listas creadas. Creá una desde la app.")
        return

    hoy = _today_iso()
    fecha_mostrar = f" para _{_fecha_display(fecha)}_" if fecha != hoy else ""

    if len(listas) == 1:
        try:
            _post_tarea(api, titulo, listas[0]["id"], fecha_opcional=fecha if fecha != hoy else None)
            await update.message.reply_text(
                f"Tarea creada en *{listas[0]['nombre']}*{fecha_mostrar} ✓",
                parse_mode="Markdown"
            )
        except Exception as e:
            await update.message.reply_text(f"No pude crear la tarea: {e}")
        return

    ud = context.user_data
    ud["agenda_draft_tarea"] = titulo
    ud["agenda_tarea_fecha"] = fecha if fecha != hoy else None
    ud["agenda_listas_cache"] = listas
    ud["step"] = STEP_AGENDA_CHOOSE_LISTA
    lines = ["¿En qué lista la agrego?"]
    for i, l in enumerate(listas, 1):
        lines.append(f"{i}. {l['nombre']}")
    await update.message.reply_text("\n".join(lines))


async def cmd_evento(update: Update, context: ContextTypes.DEFAULT_TYPE):
    api = context.bot_data.get("api_base", DEFAULT_API_BASE)
    raw = " ".join(context.args).strip() if context.args else ""

    if not raw:
        await update.message.reply_text(
            "Uso: /evento <texto>\nEjemplos:\n"
            "  /evento Dentista 10:30\n"
            "  /evento Reunión mañana 15:00 2h\n"
            "  /evento Cumpleaños viernes"
        )
        return

    fecha, hora, duracion, titulo = parse_fecha_hora(raw)
    if not titulo:
        titulo = raw.strip()

    hora = hora or "09:00"
    dt_inicio = f"{fecha}T{hora}:00"
    fin_dt = datetime.strptime(dt_inicio, "%Y-%m-%dT%H:%M:%S") + timedelta(hours=duracion)
    dt_fin = fin_dt.strftime("%Y-%m-%dT%H:%M:%S")

    try:
        calendarios = _get_calendarios(api)
    except Exception as e:
        await update.message.reply_text(f"No pude cargar los calendarios: {e}")
        return

    if not calendarios:
        await update.message.reply_text("No hay calendarios. Creá uno desde la app.")
        return

    # Si hay varios calendarios, pedir selección con inline keyboard
    if len(calendarios) > 1:
        ud = context.user_data
        ud["agenda_draft_evento"] = {
            "titulo": titulo, "dt_inicio": dt_inicio, "dt_fin": dt_fin,
            "fecha": fecha, "hora": hora, "fin_hora": fin_dt.strftime("%H:%M"),
        }
        botones = [
            [InlineKeyboardButton(c["nombre"], callback_data=f"ce:{c['id']}")]
            for c in calendarios
        ]
        await update.message.reply_text(
            f"*{titulo}*\n{_fecha_display(fecha)}  {hora} – {fin_dt.strftime('%H:%M')}\n\n¿En qué calendario?",
            parse_mode="Markdown",
            reply_markup=InlineKeyboardMarkup(botones),
        )
        return

    # Un solo calendario: crear directamente
    cal = calendarios[0]
    try:
        _post_evento(api, titulo, dt_inicio, dt_fin, cal["id"])
        dur_str = f" ({int(duracion)}h)" if duracion != 1.0 else ""
        await update.message.reply_text(
            f"Evento creado ✓\n"
            f"*{titulo}*\n"
            f"{_fecha_display(fecha)}  {hora} – {fin_dt.strftime('%H:%M')}{dur_str}\n"
            f"_{cal['nombre']}_",
            parse_mode="Markdown",
        )
    except Exception as e:
        await update.message.reply_text(f"No pude crear el evento: {e}")


async def cmd_semana(update: Update, context: ContextTypes.DEFAULT_TYPE):
    api = context.bot_data.get("api_base", DEFAULT_API_BASE)
    try:
        hoy  = _today_iso()
        hasta = (date.today() + timedelta(days=6)).isoformat()
        eventos = _get_eventos_rango(api, hoy, hasta)
        tareas  = _get_tareas_pendientes(api)
    except Exception as e:
        await update.message.reply_text(f"No pude conectar con la API: {e}")
        return
    await update.message.reply_text(_build_semana(eventos, tareas), parse_mode="Markdown")


async def cmd_pendientes(update: Update, context: ContextTypes.DEFAULT_TYPE):
    api = context.bot_data.get("api_base", DEFAULT_API_BASE)
    lista_filter = ' '.join(context.args).lower().strip() if context.args else None
    try:
        tareas = _get_tareas_pendientes(api)
    except Exception as e:
        await update.message.reply_text(f"No pude conectar con la API: {e}")
        return

    pendientes = [t for t in tareas if not t.get("completada")]
    if lista_filter:
        pendientes = [t for t in pendientes if lista_filter in (t.get('lista_nombre', '') or '').lower()]
    if not pendientes:
        await update.message.reply_text("No hay tareas pendientes. 🎉")
        return

    lines = [f"📋 *Pendientes ({len(pendientes)})*\n"]
    for t in pendientes:
        fecha_t = t.get("fecha_opcional")
        lista   = t.get("lista_nombre") or ""
        sufijo_f = f"  _{fecha_t}_" if fecha_t else ""
        sufijo_l = f" [{lista}]" if lista else ""
        lines.append(f"• {t['titulo']}{sufijo_l}{sufijo_f}")

    botones = []
    for t in pendientes[:10]:
        titulo_short = t["titulo"][:28] + ("…" if len(t["titulo"]) > 28 else "")
        botones.append([InlineKeyboardButton(f"✓ {titulo_short}", callback_data=f"ta:{t['id']}")])
    markup = InlineKeyboardMarkup(botones) if botones else None
    await update.message.reply_text(
        "\n".join(lines), parse_mode="Markdown", reply_markup=markup
    )


async def cmd_habitos(update: Update, context: ContextTypes.DEFAULT_TYPE):
    api = context.bot_data.get("api_base", DEFAULT_API_BASE)
    try:
        habitos   = _get_habitos_cached(context.bot_data, api)
        registros = _get_registros_hoy(api, _today_iso())
    except Exception as e:
        await update.message.reply_text(f"No pude conectar con la API: {e}")
        return
    text, markup = _build_habitos(habitos, registros)
    await update.message.reply_text(text, parse_mode="Markdown", reply_markup=markup)


async def cmd_racha(update: Update, context: ContextTypes.DEFAULT_TYPE):
    api = context.bot_data.get("api_base", DEFAULT_API_BASE)
    try:
        habitos   = _get_habitos_cached(context.bot_data, api)
        desde90   = (date.today() - timedelta(days=90)).isoformat()
        registros = _get_registros(api, desde90, _today_iso())
    except Exception as e:
        await update.message.reply_text(f"No pude conectar con la API: {e}")
        return
    await update.message.reply_text(_build_racha(habitos, registros), parse_mode="Markdown")


async def cmd_hecho(update: Update, context: ContextTypes.DEFAULT_TYPE):
    api = context.bot_data.get("api_base", DEFAULT_API_BASE)
    nombre = " ".join(context.args).strip() if context.args else ""

    if not nombre:
        await update.message.reply_text("Uso: /hecho <nombre del hábito>\nEjemplo: /hecho meditar")
        return

    try:
        habitos = _get_habitos_cached(context.bot_data, api)
    except Exception as e:
        await update.message.reply_text(f"No pude cargar los hábitos: {e}")
        return

    h = _fuzzy_match_habito(nombre, [x for x in habitos if x.get("activo", True)])
    if not h:
        await update.message.reply_text(f"No encontré ningún hábito que coincida con \"{nombre}\".")
        return

    try:
        _put_registro(api, h["id"], _today_iso(), 1.0)
        await update.message.reply_text(f"✅ *{h['nombre']}* marcado como total hoy.", parse_mode="Markdown")
    except Exception as e:
        await update.message.reply_text(f"No pude marcar el hábito: {e}")


async def cmd_ayer(update: Update, context: ContextTypes.DEFAULT_TYPE):
    api = context.bot_data.get("api_base", DEFAULT_API_BASE)
    args = context.args or []
    ayer = (date.today() - timedelta(days=1)).isoformat()

    # Detectar si el último arg es total/parcial
    valor = 1.0
    nombre_parts = list(args)
    if nombre_parts and nombre_parts[-1].lower() in ("total", "completo"):
        nombre_parts.pop()
    elif nombre_parts and nombre_parts[-1].lower() in ("parcial", "medio", "0.5"):
        valor = 0.5
        nombre_parts.pop()

    nombre = " ".join(nombre_parts).strip()
    if not nombre:
        await update.message.reply_text(
            "Uso: /ayer <nombre> [total|parcial]\nEjemplo: /ayer correr parcial"
        )
        return

    try:
        habitos = _get_habitos_cached(context.bot_data, api)
    except Exception as e:
        await update.message.reply_text(f"No pude cargar los hábitos: {e}")
        return

    h = _fuzzy_match_habito(nombre, [x for x in habitos if x.get("activo", True)])
    if not h:
        await update.message.reply_text(f"No encontré ningún hábito que coincida con \"{nombre}\".")
        return

    tipo = "total" if valor == 1.0 else "parcial"
    try:
        _put_registro(api, h["id"], ayer, valor)
        await update.message.reply_text(
            f"{'✅' if valor == 1.0 else '⚡'} *{h['nombre']}* marcado como {tipo} para ayer ({_fecha_display(ayer)}).",
            parse_mode="Markdown"
        )
    except Exception as e:
        await update.message.reply_text(f"No pude marcar el hábito: {e}")


async def cmd_nota(update: Update, context: ContextTypes.DEFAULT_TYPE):
    api = context.bot_data.get("api_base", DEFAULT_API_BASE)
    args = context.args or []

    if len(args) < 2:
        await update.message.reply_text(
            "Uso: /nota <nombre_hábito> <texto de la nota>\n"
            "Ejemplo: /nota meditar 10 minutos en silencio total"
        )
        return

    try:
        habitos = _get_habitos_cached(context.bot_data, api)
    except Exception as e:
        await update.message.reply_text(f"No pude cargar los hábitos: {e}")
        return

    # Intentar match con 1, 2, 3... palabras como nombre
    h = None
    nota_start = len(args)
    for n_words in range(min(4, len(args)), 0, -1):
        candidato = " ".join(args[:n_words])
        h = _fuzzy_match_habito(candidato, [x for x in habitos if x.get("activo", True)])
        if h:
            nota_start = n_words
            break

    if not h:
        await update.message.reply_text(f"No encontré el hábito. Revisá el nombre.")
        return

    nota = " ".join(args[nota_start:]).strip()
    if not nota:
        await update.message.reply_text("La nota no puede estar vacía.")
        return

    hoy = _today_iso()
    try:
        # Obtener valor actual si existe, o upsert con 1.0 si no hay registro
        registros = _get_registros_hoy(api, hoy)
        reg_map = {r["habito_id"]: r for r in registros}
        reg = reg_map.get(h["id"])
        valor = reg["valor"] if reg else 1.0
        _put_registro(api, h["id"], hoy, valor, nota=nota)
        await update.message.reply_text(
            f"📝 Nota guardada en *{h['nombre']}*: _{nota}_", parse_mode="Markdown"
        )
    except Exception as e:
        await update.message.reply_text(f"No pude guardar la nota: {e}")


async def cmd_bloquear(update: Update, context: ContextTypes.DEFAULT_TYPE):
    api = context.bot_data.get("api_base", DEFAULT_API_BASE)
    args = context.args or []

    if len(args) < 2:
        await update.message.reply_text(
            "Uso: /bloquear <N> <HH:MM>\n"
            "Bloquea la tarea #N del último /hoy en esa hora.\n"
            "Ejemplo: /bloquear 2 14:30"
        )
        return

    try:
        n = int(args[0])
        hora = args[1]
        if not re.match(r"^\d{1,2}:\d{2}$", hora):
            raise ValueError
        hora = f"{int(hora.split(':')[0]):02d}:{hora.split(':')[1]}"
    except (ValueError, IndexError):
        await update.message.reply_text("El formato debe ser: /bloquear <número> <HH:MM>")
        return

    tareas = context.user_data.get("last_hoy_tareas", [])
    if not tareas:
        await update.message.reply_text("Primero usá /hoy para ver las tareas del día.")
        return
    if n < 1 or n > len(tareas):
        await update.message.reply_text(f"El número debe estar entre 1 y {len(tareas)}.")
        return

    tarea = tareas[n - 1]
    hoy = _today_iso()
    try:
        _patch_tarea_bloque(api, tarea["id"], hora, hoy)
        await update.message.reply_text(
            f"⏰ *{tarea['titulo']}* bloqueada a las {hora}.", parse_mode="Markdown"
        )
    except Exception as e:
        await update.message.reply_text(f"No pude bloquear la tarea: {e}")


async def cmd_planificar(update: Update, context: ContextTypes.DEFAULT_TYPE):
    api = context.bot_data.get("api_base", DEFAULT_API_BASE)
    try:
        hoy      = _today_iso()
        tareas   = _get_tareas_pendientes(api)
        eventos  = _get_eventos_rango(api, hoy, hoy)
    except Exception as e:
        await update.message.reply_text(f"No pude conectar con la API: {e}")
        return

    tareas_sin_bloque = [t for t in tareas if not t.get("hora_bloque")]
    # Guardar en user_data para /asignar y callbacks
    context.user_data["planificar_tareas"]  = tareas_sin_bloque
    context.user_data["planificar_eventos"] = eventos
    context.user_data["planificar_tareas_todas"] = tareas

    text, markup = _build_planificar(eventos, tareas, tareas_sin_bloque)
    await update.message.reply_text(text, parse_mode="Markdown", reply_markup=markup)


async def cmd_asignar(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    /asignar A 10:30  →  asigna tarea A del último /planificar a las 10:30
    /asignar 2 10:30  →  asigna por número del último /hoy
    /asignar comprar 10:30  →  fuzzy match entre pendientes
    """
    api  = context.bot_data.get("api_base", DEFAULT_API_BASE)
    args = context.args or []

    if len(args) < 2:
        await update.message.reply_text(
            "Uso: /asignar <letra, número o nombre> <HH:MM>\n"
            "Ejemplo: /asignar A 10:30  /asignar 2 14:00  /asignar estudiar 16:00"
        )
        return

    hora_raw = args[-1]
    if not re.match(r"^\d{1,2}:\d{2}$", hora_raw):
        await update.message.reply_text("El formato de hora debe ser HH:MM")
        return
    hora = f"{int(hora_raw.split(':')[0]):02d}:{hora_raw.split(':')[1]}"
    identificador = " ".join(args[:-1]).strip()

    tarea = None

    # Letra del último /planificar
    if len(identificador) == 1 and identificador.upper() in _LETRAS:
        idx = _LETRAS.index(identificador.upper())
        planificar_tareas = context.user_data.get("planificar_tareas", [])
        if idx < len(planificar_tareas):
            tarea = planificar_tareas[idx]

    # Número del último /hoy
    if not tarea and identificador.isdigit():
        n = int(identificador) - 1
        last = context.user_data.get("last_hoy_tareas", [])
        if 0 <= n < len(last):
            tarea = last[n]

    # Fuzzy match entre pendientes
    if not tarea:
        try:
            todas = _get_tareas_pendientes(api)
        except Exception as e:
            await update.message.reply_text(f"No pude cargar las tareas: {e}")
            return
        id_lower = identificador.lower()
        for t in todas:
            if id_lower in t["titulo"].lower():
                tarea = t
                break

    if not tarea:
        await update.message.reply_text(f"No encontré ninguna tarea que coincida con \"{identificador}\".")
        return

    hoy = _today_iso()
    try:
        _patch_tarea_bloque(api, tarea["id"], hora, hoy)
        await update.message.reply_text(
            f"⏰ *{tarea['titulo']}* agendada a las {hora}.\n"
            f"Usá /planificar para ver el día actualizado.",
            parse_mode="Markdown",
        )
    except Exception as e:
        await update.message.reply_text(f"No pude asignar la tarea: {e}")


async def cmd_revision(update: Update, context: ContextTypes.DEFAULT_TYPE):
    api = context.bot_data.get("api_base", DEFAULT_API_BASE)
    hoy   = date.today()
    lunes = hoy - timedelta(days=hoy.weekday() + 7)  # lunes de la semana pasada
    dom   = lunes + timedelta(days=6)
    desde = lunes.isoformat()
    hasta = dom.isoformat()

    try:
        resumen = _get_revision(api, desde, hasta)
    except Exception as e:
        await update.message.reply_text(f"No pude obtener la revisión: {e}")
        return

    await update.message.reply_text(_build_revision(resumen), parse_mode="Markdown")


# ──────────────────────────────────────────────────────────────
# Handler de pasos conversacionales
# ──────────────────────────────────────────────────────────────

async def handle_agenda_step(update: Update, context: ContextTypes.DEFAULT_TYPE,
                              texto: str) -> bool:
    """Devuelve True si el mensaje fue manejado por un paso de Agenda."""
    ud  = context.user_data
    step = ud.get("step")

    if step == STEP_AGENDA_CHOOSE_LISTA:
        api    = context.bot_data.get("api_base", DEFAULT_API_BASE)
        listas = ud.get("agenda_listas_cache", [])

        if not texto.isdigit():
            await update.message.reply_text("Respondé con el número de la lista.")
            return True

        choice = int(texto)
        if choice < 1 or choice > len(listas):
            await update.message.reply_text("Número fuera de rango. Intentá de nuevo.")
            return True

        lista  = listas[choice - 1]
        titulo = ud.get("agenda_draft_tarea", "")
        fecha  = ud.get("agenda_tarea_fecha")
        hoy    = _today_iso()
        fecha_mostrar = f" para _{_fecha_display(fecha)}_" if fecha else ""
        try:
            _post_tarea(api, titulo, lista["id"], fecha_opcional=fecha)
            await update.message.reply_text(
                f"Tarea creada en *{lista['nombre']}*{fecha_mostrar} ✓",
                parse_mode="Markdown"
            )
        except Exception as e:
            await update.message.reply_text(f"No pude crear la tarea: {e}")
        # Si vino de /planificar, también asignar hora_bloque
        hora_bloque = ud.get("agenda_draft_hora_bloque")
        if hora_bloque:
            try:
                r = requests.get(f"{api}/agenda/tareas", params={"pendientes": "true"}, timeout=15)
                r.raise_for_status()
                todas = r.json()
                match = next((t for t in todas if t["titulo"].strip() == titulo.strip()), None)
                if match:
                    _patch_tarea_bloque(api, match["id"], hora_bloque, _today_iso())
            except Exception:
                pass
        ud.clear()
        return True

    if step == STEP_HABITO_NOTA:
        api      = context.bot_data.get("api_base", DEFAULT_API_BASE)
        hab_id   = ud.get("habito_nota_id")
        fecha    = ud.get("habito_nota_fecha", _today_iso())
        nombre   = ud.get("habito_nota_nombre", "hábito")
        for k in ("step", "habito_nota_id", "habito_nota_fecha", "habito_nota_nombre"):
            ud.pop(k, None)

        if texto.lower().strip() in ("no", "skip", "n", "-", "nope", "nop"):
            await update.message.reply_text("Ok, sin nota. 👍")
            return True

        try:
            registros = _get_registros(api, fecha, fecha)
            reg_map   = {r["habito_id"]: r for r in registros}
            reg       = reg_map.get(hab_id)
            valor     = reg["valor"] if reg else 1.0
            _put_registro(api, hab_id, fecha, valor, nota=texto.strip())
            await update.message.reply_text(
                f"📝 Nota guardada en *{nombre}*: _{texto.strip()}_", parse_mode="Markdown"
            )
        except Exception as e:
            await update.message.reply_text(f"No pude guardar la nota: {e}")
        return True

    if step == STEP_PLANIFICAR_NUEVA_TAREA:
        api   = context.bot_data.get("api_base", DEFAULT_API_BASE)
        hora  = ud.get("planificar_slot_hora", "")
        titulo = texto.strip()
        if not titulo:
            await update.message.reply_text("El título no puede estar vacío.")
            return True
        try:
            listas = _get_listas(api)
        except Exception as e:
            await update.message.reply_text(f"No pude cargar las listas: {e}")
            ud.clear()
            return True

        if not listas:
            await update.message.reply_text("No hay listas creadas. Creá una desde la app.")
            ud.clear()
            return True

        if len(listas) == 1:
            try:
                t = _post_tarea(api, titulo, listas[0]["id"], fecha_opcional=_today_iso())
                _patch_tarea_bloque(api, t["id"], hora, _today_iso())
                await update.message.reply_text(
                    f"✅ *{titulo}* creada y agendada a las {hora}.\n"
                    f"Usá /planificar para ver el día actualizado.",
                    parse_mode="Markdown",
                )
            except Exception as e:
                await update.message.reply_text(f"No pude crear la tarea: {e}")
            ud.clear()
            return True

        # Múltiples listas: pedir selección
        ud["agenda_draft_tarea"]       = titulo
        ud["agenda_tarea_fecha"]       = _today_iso()
        ud["agenda_draft_hora_bloque"] = hora
        ud["agenda_listas_cache"]      = listas
        ud["step"]                     = STEP_AGENDA_CHOOSE_LISTA
        lines = ["¿En qué lista la agrego?"]
        for i, l in enumerate(listas, 1):
            lines.append(f"{i}. {l['nombre']}")
        await update.message.reply_text("\n".join(lines))
        return True

    return False


# ──────────────────────────────────────────────────────────────
# Quick-capture por prefijo (llamado desde bot.py handle_message)
# ──────────────────────────────────────────────────────────────

async def handle_quick_capture(update: Update, context: ContextTypes.DEFAULT_TYPE,
                                texto: str) -> bool:
    """
    Detecta prefijos t: / tarea: → crea tarea, e: / evento: → crea evento.
    Devuelve True si fue manejado.
    """
    api = context.bot_data.get("api_base", DEFAULT_API_BASE)

    lower = texto.lower()
    if lower.startswith("t:") or lower.startswith("tarea:"):
        sep = texto.index(":") + 1
        raw = texto[sep:].strip()
        if not raw:
            return False
        fecha, _, _, titulo = parse_fecha_hora(raw)
        if not titulo:
            titulo = raw
        hoy = _today_iso()
        try:
            listas = _get_listas(api)
            if not listas:
                await update.message.reply_text("No hay listas creadas.")
                return True
            lista = listas[0]
            _post_tarea(api, titulo, lista["id"], fecha_opcional=fecha if fecha != hoy else None)
            fecha_str = f" para _{_fecha_display(fecha)}_" if fecha != hoy else ""
            await update.message.reply_text(
                f"Tarea creada en *{lista['nombre']}*{fecha_str} ✓",
                parse_mode="Markdown"
            )
        except Exception as e:
            await update.message.reply_text(f"No pude crear la tarea: {e}")
        return True

    if lower.startswith("e:") or lower.startswith("evento:"):
        sep = texto.index(":") + 1
        raw = texto[sep:].strip()
        if not raw:
            return False
        fecha, hora, duracion, titulo = parse_fecha_hora(raw)
        if not titulo:
            titulo = raw
        hora = hora or "09:00"
        dt_inicio = f"{fecha}T{hora}:00"
        fin_dt = datetime.strptime(dt_inicio, "%Y-%m-%dT%H:%M:%S") + timedelta(hours=duracion)
        dt_fin = fin_dt.strftime("%Y-%m-%dT%H:%M:%S")
        try:
            calendarios = _get_calendarios(api)
            cal_id = calendarios[0]["id"] if calendarios else 1
            cal_nombre = calendarios[0]["nombre"] if calendarios else "Personal"
            _post_evento(api, titulo, dt_inicio, dt_fin, cal_id)
            await update.message.reply_text(
                f"Evento creado ✓\n*{titulo}*\n{_fecha_display(fecha)}  {hora}–{fin_dt.strftime('%H:%M')}\n_{cal_nombre}_",
                parse_mode="Markdown",
            )
        except Exception as e:
            await update.message.reply_text(f"No pude crear el evento: {e}")
        return True

    return False


async def cmd_checkin(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    /checkin          → muestra la hora actual del check-in
    /checkin HH:MM    → cambia la hora del check-in nocturno
    """
    from datetime import time as dt_time
    args = context.args or []

    if not args:
        h, m = _load_checkin_time()
        await update.message.reply_text(
            f"🌙 Check-in nocturno configurado para las *{h:02d}:{m:02d}*.\n"
            f"Cambialo con `/checkin HH:MM`",
            parse_mode="Markdown",
        )
        return

    raw = args[0].strip()
    match = re.match(r'^(\d{1,2}):(\d{2})$', raw)
    if not match:
        await update.message.reply_text(
            "Formato inválido. Usá `/checkin HH:MM` (ej: `/checkin 22:00`)",
            parse_mode="Markdown",
        )
        return

    hour   = int(match.group(1))
    minute = int(match.group(2))
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        await update.message.reply_text("Hora inválida. Hora entre 0–23, minutos entre 0–59.")
        return

    _save_checkin_time(hour, minute)

    if context.job_queue:
        for job in context.job_queue.get_jobs_by_name("check_in_noche"):
            job.schedule_removal()
        context.job_queue.run_daily(
            check_in_noche,
            time=dt_time(hour, minute, 0),
            name="check_in_noche",
        )

    await update.message.reply_text(
        f"✅ Check-in nocturno reprogramado para las *{hour:02d}:{minute:02d}*.",
        parse_mode="Markdown",
    )


# ──────────────────────────────────────────────────────────────
# Check-in nocturno (llamado por job_queue)
# ──────────────────────────────────────────────────────────────

async def check_in_noche(context: ContextTypes.DEFAULT_TYPE):
    chat_id = context.bot_data.get("chat_id")
    if not chat_id:
        return
    api = context.bot_data.get("api_base", DEFAULT_API_BASE)
    try:
        habitos   = _get_habitos_cached(context.bot_data, api)
        hoy       = _today_iso()
        registros = _get_registros_hoy(api, hoy)
        reg_map   = {r["habito_id"]: r for r in registros}
        pendientes = [
            h for h in habitos
            if _is_scheduled_today(h) and h["id"] not in reg_map
        ]
    except Exception:
        return

    if not pendientes:
        return

    nombres = ", ".join(h["nombre"] for h in pendientes[:5])
    text = f"🌙 *Check-in de la noche*\n\nTe falta completar: _{nombres}_"
    botones = []
    for h in pendientes[:5]:
        nombre_short = h["nombre"][:18] + ("…" if len(h["nombre"]) > 18 else "")
        botones.append([
            InlineKeyboardButton(f"✓ {nombre_short}", callback_data=f"hc:{h['id']}"),
            InlineKeyboardButton(f"½ {nombre_short}", callback_data=f"hp:{h['id']}"),
        ])
    markup = InlineKeyboardMarkup(botones)
    await context.bot.send_message(
        chat_id=chat_id, text=text, parse_mode="Markdown", reply_markup=markup
    )


# ──────────────────────────────────────────────────────────────
# Callback handler (botones inline)
# ──────────────────────────────────────────────────────────────

async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    api  = context.bot_data.get("api_base", DEFAULT_API_BASE)
    data = query.data or ""

    # ── Completar tarea ──────────────────────────────────────
    if data.startswith("ta:"):
        tarea_id = int(data[3:])
        try:
            t = _patch_tarea_completada(api, tarea_id)
            hoy    = _today_iso()
            tareas = _get_tareas_pendientes(api)
            eventos = _get_eventos_rango(api, hoy, hoy)
            habitos = _get_habitos_cached(context.bot_data, api)
            registros = _get_registros_hoy(api, hoy)
            text, markup = _build_hoy(tareas, eventos, habitos, registros)
            try:
                await query.edit_message_text(text, parse_mode="Markdown", reply_markup=markup)
            except Exception:
                pass
            await query.message.reply_text(
                f"✓ *{t['titulo']}* completada", parse_mode="Markdown"
            )
        except Exception as e:
            await query.message.reply_text(f"No pude completar la tarea: {e}")

    # ── Descompletar tarea ───────────────────────────────────
    elif data.startswith("tu:"):
        tarea_id = int(data[3:])
        try:
            t = _patch_tarea_descompletar(api, tarea_id)
            await query.message.reply_text(
                f"↩ *{t['titulo']}* desmarcada", parse_mode="Markdown"
            )
        except Exception as e:
            await query.message.reply_text(f"No pude desmarcar la tarea: {e}")

    # ── Hábito total ─────────────────────────────────────────
    elif data.startswith("hc:"):
        habito_id = int(data[3:])
        try:
            _put_registro(api, habito_id, _today_iso(), 1.0)
            _invalidar_cache_habitos(context.bot_data)
            habitos   = _get_habitos_cached(context.bot_data, api)
            registros = _get_registros_hoy(api, _today_iso())
            text, markup = _build_habitos(habitos, registros)
            try:
                await query.edit_message_text(text, parse_mode="Markdown", reply_markup=markup)
            except Exception:
                pass
            hab    = next((h for h in habitos if h["id"] == habito_id), None)
            nombre = hab["nombre"] if hab else "hábito"
            context.user_data["habito_nota_id"]     = habito_id
            context.user_data["habito_nota_fecha"]  = _today_iso()
            context.user_data["habito_nota_nombre"] = nombre
            context.user_data["step"]               = STEP_HABITO_NOTA
            await query.message.reply_text(
                f"¿Querés agregar una nota a *{nombre}*? Respondé con texto o escribí *no* para saltar.",
                parse_mode="Markdown",
            )
        except Exception as e:
            await query.message.reply_text(f"No pude registrar el hábito: {e}")

    # ── Hábito parcial ───────────────────────────────────────
    elif data.startswith("hp:"):
        habito_id = int(data[3:])
        try:
            _put_registro(api, habito_id, _today_iso(), 0.5)
            _invalidar_cache_habitos(context.bot_data)
            habitos   = _get_habitos_cached(context.bot_data, api)
            registros = _get_registros_hoy(api, _today_iso())
            text, markup = _build_habitos(habitos, registros)
            try:
                await query.edit_message_text(text, parse_mode="Markdown", reply_markup=markup)
            except Exception:
                pass
            hab    = next((h for h in habitos if h["id"] == habito_id), None)
            nombre = hab["nombre"] if hab else "hábito"
            context.user_data["habito_nota_id"]     = habito_id
            context.user_data["habito_nota_fecha"]  = _today_iso()
            context.user_data["habito_nota_nombre"] = nombre
            context.user_data["step"]               = STEP_HABITO_NOTA
            await query.message.reply_text(
                f"¿Querés agregar una nota a *{nombre}*? Respondé con texto o escribí *no* para saltar.",
                parse_mode="Markdown",
            )
        except Exception as e:
            await query.message.reply_text(f"No pude registrar el hábito: {e}")

    # ── Deshacer hábito ──────────────────────────────────────
    elif data.startswith("hd:"):
        habito_id = int(data[3:])
        hoy = _today_iso()
        try:
            _delete_registro_por_habito_fecha(api, habito_id, hoy)
            _invalidar_cache_habitos(context.bot_data)
            habitos   = _get_habitos_cached(context.bot_data, api)
            registros = _get_registros_hoy(api, hoy)
            text, markup = _build_habitos(habitos, registros)
            try:
                await query.edit_message_text(text, parse_mode="Markdown", reply_markup=markup)
            except Exception:
                pass
        except Exception as e:
            await query.message.reply_text(f"No pude deshacer el hábito: {e}")

    # ── Planificar: slot libre seleccionado ─────────────────
    elif data.startswith("pl:"):
        hora = data[3:]
        tareas_sin_bloque = context.user_data.get("planificar_tareas", [])
        if not tareas_sin_bloque:
            await query.message.reply_text("Usá /planificar primero para ver las tareas sin asignar.")
            return
        lines = [f"📌 *¿Qué agendás a las {hora}?*\n"]
        botones = []
        for i, t in enumerate(tareas_sin_bloque[:10]):
            lines.append(f"  {_LETRAS[i]}. {t['titulo']}")
            titulo_short = t["titulo"][:28] + ("…" if len(t["titulo"]) > 28 else "")
            botones.append([InlineKeyboardButton(
                f"{_LETRAS[i]}. {titulo_short}",
                callback_data=f"pa:{t['id']}:{hora}",
            )])
        botones.append([InlineKeyboardButton("✏️ Nueva tarea…", callback_data=f"pn:{hora}")])
        await query.edit_message_text(
            "\n".join(lines), parse_mode="Markdown",
            reply_markup=InlineKeyboardMarkup(botones),
        )

    # ── Planificar: asignar tarea existente a slot ───────────
    elif data.startswith("pa:"):
        _, tarea_id_str, hora = data.split(":", 2)
        tarea_id = int(tarea_id_str)
        hoy = _today_iso()
        try:
            t = _patch_tarea_bloque(api, tarea_id, hora, hoy)
            # Refrescar /planificar
            tareas   = _get_tareas_pendientes(api)
            eventos  = context.user_data.get("planificar_eventos") or _get_eventos_rango(api, hoy, hoy)
            tareas_sin_bloque = [x for x in tareas if not x.get("hora_bloque")]
            context.user_data["planificar_tareas"]      = tareas_sin_bloque
            context.user_data["planificar_tareas_todas"] = tareas
            text, markup = _build_planificar(eventos, tareas, tareas_sin_bloque)
            await query.edit_message_text(text, parse_mode="Markdown", reply_markup=markup)
            await query.message.reply_text(
                f"⏰ *{t['titulo']}* agendada a las {hora}.", parse_mode="Markdown"
            )
        except Exception as e:
            await query.message.reply_text(f"No pude asignar la tarea: {e}")

    # ── Planificar: nueva tarea en slot ──────────────────────
    elif data.startswith("pn:"):
        hora = data[3:]
        context.user_data["planificar_slot_hora"] = hora
        context.user_data["step"] = STEP_PLANIFICAR_NUEVA_TAREA
        await query.message.reply_text(
            f"¿Cómo se llama la nueva tarea para las *{hora}*?",
            parse_mode="Markdown",
        )

    # ── Crear evento en calendario seleccionado ──────────────
    elif data.startswith("ce:"):
        cal_id = int(data[3:])
        draft  = context.user_data.pop("agenda_draft_evento", None)
        if not draft:
            await query.message.reply_text("El borrador expiró. Usá /evento de nuevo.")
            return
        try:
            calendarios = _get_calendarios(api)
            cal_nombre  = next((c["nombre"] for c in calendarios if c["id"] == cal_id), "")
            _post_evento(api, draft["titulo"], draft["dt_inicio"], draft["dt_fin"], cal_id)
            await query.edit_message_text(
                f"Evento creado ✓\n*{draft['titulo']}*\n"
                f"{_fecha_display(draft['fecha'])}  {draft['hora']} – {draft['fin_hora']}\n"
                f"_{cal_nombre}_",
                parse_mode="Markdown",
            )
        except Exception as e:
            await query.message.reply_text(f"No pude crear el evento: {e}")
