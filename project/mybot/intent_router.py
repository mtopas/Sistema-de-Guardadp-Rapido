"""
Router de intención usando Ollama.

Flujo:
  1. route(mensaje) → RouteResult
  2. Si action in ("direct","confirm"): mostrar format_summary() con teclado de confirmación
  3. Si el usuario confirma: execute(result) → (ok, mensaje)
  4. Si action == "question": Capa 3 (assistant.py, pendiente)
  5. Si action == "fallback": el bot sigue con el flujo existente de prefijos/Bóveda

RouteResult.action:
  "direct"   — confianza alta, datos mínimos presentes
  "confirm"  — confianza media
  "question" — el usuario pregunta algo (consulta_*)
  "fallback" — Ollama no disponible, confianza baja o datos insuficientes
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import asdict, dataclass, field
from datetime import date, datetime

import requests

import llm_client
from api_config import API_BASE

logger = logging.getLogger(__name__)

# ── Config ─────────────────────────────────────────────────────────────────────
CONFIDENCE_HIGH   = float(os.environ.get("LLM_CONFIDENCE_THRESHOLD", "0.75"))
CONFIDENCE_MEDIUM = 0.5
_HEALTH_TTL       = 30  # segundos entre healthchecks

MODULES = {
    "finanzas", "agenda", "habitos", "boveda",
    "consulta_finanzas", "consulta_habitos", "consulta_agenda", "consulta_boveda",
    "desconocido",
}

# Campos mínimos por módulo para considerar el resultado ejecutable
_REQUIRED: dict[str, list[str]] = {
    "finanzas": ["monto"],
    "agenda":   ["titulo"],
    "habitos":  ["nombre_habito"],
}

# ── Prompt ─────────────────────────────────────────────────────────────────────

_PROMPT_TMPL = """\
Clasificá la intención del mensaje y extraé datos. Devolvé SOLO JSON válido, sin texto adicional.

Hoy es {fecha_hora}.

Módulos disponibles:
- finanzas          → registrar gasto, ingreso o transferencia de dinero
- agenda            → crear tarea o evento en el calendario
- habitos           → registrar completación de un hábito
- boveda            → guardar nota, link, idea o apunte
- consulta_finanzas → pregunta sobre gastos, saldos o ahorro
- consulta_habitos  → pregunta sobre progreso, rachas o estadísticas
- consulta_agenda   → pregunta sobre pendientes o calendario
- consulta_boveda   → buscar en notas guardadas
- desconocido       → no encaja en ningún módulo

Respuesta (todos los campos obligatorios):
{{"modulo": "<módulo>", "accion": "guardar" | "consultar", "datos": {{}}, "confianza": <0.0-1.0>, "es_pregunta": <true|false>}}

Campos en datos (solo los mencionados explícitamente en el mensaje):
- finanzas:      monto (número), descripcion, cuenta, tipo ("gasto"|"ingreso"|"transferencia"), categoria
- agenda tarea:  subtipo "tarea", titulo, fecha (YYYY-MM-DD), hora (HH:MM), lista
- agenda evento: subtipo "evento", titulo, fecha_inicio (YYYY-MM-DD), hora_inicio (HH:MM), duracion_min (número)
- habitos:       nombre_habito, valor ("total" o "parcial"), nota
- boveda:        contenido, url (si hay un link)
- consultas:     datos vacío {{}}

Confianza: 0.9 todos los datos clave claros; 0.7 módulo claro pero datos incompletos; <0.5 módulo incierto.

Ejemplos:
Mensaje: "gasté 1500 en el super con la Naranja X"
Respuesta: {{"modulo":"finanzas","accion":"guardar","datos":{{"monto":1500,"descripcion":"super","cuenta":"Naranja X","tipo":"gasto"}},"confianza":0.9,"es_pregunta":false}}

Mensaje: "recordame llamar al dentista el viernes"
Respuesta: {{"modulo":"agenda","accion":"guardar","datos":{{"subtipo":"tarea","titulo":"Llamar al dentista","fecha":"YYYY-MM-DD"}},"confianza":0.85,"es_pregunta":false}}

Mensaje: "corrí 40 minutos"
Respuesta: {{"modulo":"habitos","accion":"guardar","datos":{{"nombre_habito":"correr","valor":"total"}},"confianza":0.8,"es_pregunta":false}}

Mensaje: "¿cuánto gasté este mes?"
Respuesta: {{"modulo":"consulta_finanzas","accion":"consultar","datos":{{}},"confianza":0.95,"es_pregunta":true}}\
"""

# ── RouteResult ────────────────────────────────────────────────────────────────

@dataclass
class RouteResult:
    action:      str   # "direct" | "confirm" | "question" | "fallback"
    modulo:      str
    datos:       dict  = field(default_factory=dict)
    confianza:   float = 0.0
    es_pregunta: bool  = False


def result_to_dict(r: RouteResult) -> dict:
    return asdict(r)


def dict_to_result(d: dict) -> RouteResult:
    return RouteResult(**d)


# ── Availability cache ─────────────────────────────────────────────────────────

_avail:    bool | None = None
_avail_ts: float       = 0.0


def _check_available() -> bool:
    global _avail, _avail_ts
    now = time.monotonic()
    if _avail is not None and (now - _avail_ts) < _HEALTH_TTL:
        return _avail
    _avail    = llm_client.is_available()
    _avail_ts = now
    return _avail


# ── Router principal ───────────────────────────────────────────────────────────

def route(mensaje: str) -> RouteResult:
    """Clasifica la intención del mensaje. Siempre devuelve un RouteResult válido."""
    if not _check_available():
        logger.info("[router] Ollama no disponible — fallback")
        return RouteResult(action="fallback", modulo="desconocido")

    fecha_hora = datetime.now().strftime("%A %d/%m/%Y %H:%M")
    raw = llm_client.classify(_PROMPT_TMPL.format(fecha_hora=fecha_hora), mensaje)

    if not raw or "modulo" not in raw:
        logger.warning("[router] respuesta inválida: %s", raw)
        return RouteResult(action="fallback", modulo="desconocido")

    modulo    = raw.get("modulo", "desconocido")
    confianza = max(0.0, min(1.0, float(raw.get("confianza", 0.0))))
    es_preg   = bool(raw.get("es_pregunta", False))
    datos     = raw.get("datos") or {}

    if modulo not in MODULES:
        logger.warning("[router] módulo '%s' no reconocido", modulo)
        modulo = "desconocido"

    logger.info("[router] '%s…' → %s (%.2f) pregunta=%s", mensaje[:50], modulo, confianza, es_preg)

    # Consultas → modo pregunta (Capa 3)
    if es_preg or modulo.startswith("consulta_"):
        return RouteResult(action="question", modulo=modulo, datos=datos,
                           confianza=confianza, es_pregunta=True)

    if modulo in ("desconocido", "boveda") or confianza < CONFIDENCE_MEDIUM:
        return RouteResult(action="fallback", modulo=modulo, datos=datos, confianza=confianza)

    # Verificar campos mínimos
    required = _REQUIRED.get(modulo, [])
    if not all(k in datos and datos[k] is not None for k in required):
        logger.info("[router] faltan campos mínimos para '%s' → fallback", modulo)
        return RouteResult(action="fallback", modulo=modulo, datos=datos, confianza=confianza)

    action = "direct" if confianza >= CONFIDENCE_HIGH else "confirm"
    return RouteResult(action=action, modulo=modulo, datos=datos,
                       confianza=confianza, es_pregunta=False)


# ── Formato de confirmación ────────────────────────────────────────────────────

_TIPO_LABEL = {"gasto": "Gasto", "ingreso": "Ingreso", "transferencia": "Transferencia"}
_TIPO_ICON  = {"gasto": "💸",   "ingreso": "💰",       "transferencia": "💱"}


def format_summary(result: RouteResult) -> str:
    """Devuelve un mensaje Markdown para mostrar al usuario antes de confirmar."""
    d   = result.datos
    pct = int(result.confianza * 100)

    if result.modulo == "finanzas":
        tipo  = d.get("tipo", "gasto")
        icon  = _TIPO_ICON.get(tipo, "💱")
        label = _TIPO_LABEL.get(tipo, tipo.capitalize())
        lines = [f"🤖 *Entendí:* {icon} *{label}*"]
        if "monto"       in d: lines.append(f"• Monto: *${int(d['monto']):,}*".replace(",", "."))
        if "descripcion" in d: lines.append(f"• Descripción: {d['descripcion']}")
        if "cuenta"      in d: lines.append(f"• Cuenta: {d['cuenta']}")
        if "categoria"   in d: lines.append(f"• Categoría: {d['categoria']}")

    elif result.modulo == "agenda":
        subtipo = d.get("subtipo", "tarea")
        icon    = "📋" if subtipo == "tarea" else "📅"
        label   = "Tarea" if subtipo == "tarea" else "Evento"
        lines   = [f"🤖 *Entendí:* {icon} *Agenda — {label}*"]
        if "titulo"      in d: lines.append(f"• Título: {d['titulo']}")
        fecha = d.get("fecha") or d.get("fecha_inicio")
        if fecha:              lines.append(f"• Fecha: {fecha}")
        hora = d.get("hora") or d.get("hora_inicio")
        if hora:               lines.append(f"• Hora: {hora}")
        if "lista"       in d: lines.append(f"• Lista: {d['lista']}")

    elif result.modulo == "habitos":
        valor = d.get("valor", "total")
        icon  = "✅" if valor == "total" else "🟡"
        lines = [f"🤖 *Entendí:* {icon} *Hábito — {'Total' if valor == 'total' else 'Parcial'}*"]
        if "nombre_habito" in d: lines.append(f"• Hábito: {d['nombre_habito']}")
        if "nota"          in d: lines.append(f"• Nota: {d['nota']}")

    else:
        lines = [f"🤖 *Entendí:* módulo {result.modulo}"]

    lines.append(f"\n_Confianza: {pct}%_")
    return "\n".join(lines)


# ── Ejecución ──────────────────────────────────────────────────────────────────

def execute(result: RouteResult) -> tuple[bool, str]:
    """
    Llama a la API de SGR para guardar los datos del RouteResult.
    Devuelve (éxito: bool, mensaje para el usuario: str).
    """
    try:
        if result.modulo == "finanzas":
            return _execute_finanzas(result.datos)
        if result.modulo == "agenda":
            return _execute_agenda(result.datos)
        if result.modulo == "habitos":
            return _execute_habitos(result.datos)
        return False, f"Módulo '{result.modulo}' no tiene ejecución directa aún."
    except requests.RequestException as exc:
        logger.error("[router.execute] error de red: %s", exc)
        return False, "❌ No pude conectar con el servidor. ¿Está corriendo el backend?"
    except Exception as exc:
        logger.error("[router.execute] error inesperado: %s", exc, exc_info=True)
        return False, f"❌ Error inesperado: {exc}"


def _execute_finanzas(datos: dict) -> tuple[bool, str]:
    tipo_map = {"gasto": "expense", "ingreso": "income", "transferencia": "transfer"}
    tipo_api = tipo_map.get(datos.get("tipo", "gasto"), "expense")

    payload: dict = {
        "tipo":        tipo_api,
        "monto":       float(datos["monto"]),
        "descripcion": datos.get("descripcion", ""),
        "fecha":       date.today().isoformat(),
    }
    # La API acepta cuenta_nombre y categoria_nombre directamente
    if datos.get("cuenta"):
        payload["cuenta_nombre"] = datos["cuenta"]
    if datos.get("categoria"):
        payload["categoria_nombre"] = datos["categoria"]

    resp = requests.post(f"{API_BASE}/fin/movimientos", json=payload, timeout=10)
    resp.raise_for_status()

    tipo_label  = {"expense": "Gasto", "income": "Ingreso", "transfer": "Transferencia"}.get(tipo_api, "")
    monto_str   = f"${int(datos['monto']):,}".replace(",", ".")
    cuenta_str  = f" · {datos['cuenta']}" if datos.get("cuenta") else ""
    return True, f"✅ {tipo_label} {monto_str}{cuenta_str} guardado."


def _execute_agenda(datos: dict) -> tuple[bool, str]:
    subtipo = datos.get("subtipo", "tarea")

    if subtipo == "tarea":
        payload: dict = {"titulo": datos["titulo"], "completada": False}
        if datos.get("fecha"): payload["fecha_opcional"] = datos["fecha"]
        if datos.get("hora"):  payload["hora_opcional"]  = datos["hora"]

        if datos.get("lista"):
            try:
                rl = requests.get(f"{API_BASE}/agenda/listas", timeout=10)
                if rl.ok:
                    listas = rl.json()
                    match = next(
                        (l for l in listas if datos["lista"].lower() in l["nombre"].lower()),
                        None,
                    )
                    if match:
                        payload["lista_id"] = match["id"]
            except Exception:
                pass

        resp = requests.post(f"{API_BASE}/agenda/tareas", json=payload, timeout=10)
        resp.raise_for_status()
        fecha_str = f" para el {datos['fecha']}" if datos.get("fecha") else ""
        return True, f"✅ Tarea '{datos['titulo']}'{fecha_str} creada."

    else:  # evento
        fecha_inicio = datos.get("fecha_inicio", date.today().isoformat())
        hora_inicio  = datos.get("hora_inicio")
        if hora_inicio:
            fecha_inicio = f"{fecha_inicio}T{hora_inicio}:00"

        payload = {
            "titulo":      datos["titulo"],
            "fecha_inicio": fecha_inicio,
            "fecha_fin":    fecha_inicio,
            "todo_el_dia":  hora_inicio is None,
        }

        # Primer calendario disponible como default
        try:
            rc = requests.get(f"{API_BASE}/agenda/calendarios", timeout=10)
            if rc.ok:
                cals = rc.json()
                if cals:
                    payload["calendario_id"] = cals[0]["id"]
        except Exception:
            pass

        resp = requests.post(f"{API_BASE}/agenda/eventos", json=payload, timeout=10)
        resp.raise_for_status()
        return True, f"✅ Evento '{datos['titulo']}' creado."


def _execute_habitos(datos: dict) -> tuple[bool, str]:
    nombre = datos.get("nombre_habito", "").lower()

    r = requests.get(f"{API_BASE}/habitos", timeout=10)
    r.raise_for_status()
    habitos = [h for h in r.json() if h.get("activo", True)]

    habito = next(
        (h for h in habitos if nombre in h["nombre"].lower() or h["nombre"].lower() in nombre),
        None,
    )
    if not habito:
        nombres = ", ".join(h["nombre"] for h in habitos[:5])
        return False, f"❌ No encontré el hábito '{datos.get('nombre_habito')}'. Hábitos activos: {nombres}."

    valor = 1.0 if datos.get("valor", "total") == "total" else 0.5
    nota  = datos.get("nota") or ""

    resp = requests.put(
        f"{API_BASE}/habitos/{habito['id']}/registro",
        json={"fecha": date.today().isoformat(), "valor": valor, "nota": nota},
        timeout=10,
    )
    resp.raise_for_status()

    label = "completado ✅" if valor == 1.0 else "parcial 🟡"
    return True, f"✅ '{habito['nombre']}' marcado como {label}."
