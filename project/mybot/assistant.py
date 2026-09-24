"""
Capa 3 — modo consulta: responde preguntas en lenguaje natural sobre datos de SGR.

Función pública:
  answer_question(pregunta, modulo, api_base) -> str (texto plano, sin Markdown)

Flujo:
  1. Reúne datos de la API de SGR según el módulo detectado
  2. Pre-agrega para no pasarle datos crudos al LLM
  3. Llama a llm_client.chat() con un prompt de síntesis
  4. Devuelve la respuesta como texto plano

Módulos soportados: finanzas, habitos, agenda (y sus variantes consulta_*)
consulta_boveda → "próximamente" (Capa 4 — RAG)
"""

from __future__ import annotations

import json
import logging
from datetime import date, timedelta

import requests

import llm_client
import embeddings as emb
from api_config import API_BASE as DEFAULT_API_BASE
import finanzas_handlers as fh
import agenda_handlers as ah

logger = logging.getLogger(__name__)

# ── Prompt de síntesis ─────────────────────────────────────────────────────────

_SYSTEM_TMPL = (
    "Sos el asistente personal del usuario. "
    "Respondé en español, tono directo y amigable. "
    "Máximo 4 oraciones cortas. "
    "No uses markdown, asteriscos, guiones bajos ni corchetes. "
    "Basate solo en los datos proporcionados, no inventes cifras. "
    "No hagas aritmética propia: usá total_gastos, total_ingresos y balance tal cual vienen en los datos. "
    "Los montos por categoría ya son positivos (son gastos). "
    "Si algo no está en los datos, decilo claramente. "
    "Fecha actual: {fecha}."
)


# ── Función pública ────────────────────────────────────────────────────────────

def answer_question(pregunta: str, modulo: str, api_base: str = DEFAULT_API_BASE) -> str:
    """
    Responde una pregunta del usuario usando datos de la API de SGR.
    Devuelve texto plano (sin Markdown de Telegram).
    """
    modulo_base = modulo.replace("consulta_", "")

    try:
        if modulo_base == "finanzas":
            contexto = _gather_finanzas(api_base, pregunta)
        elif modulo_base == "habitos":
            contexto = _gather_habitos(api_base)
        elif modulo_base == "agenda":
            contexto = _gather_agenda(api_base)
        elif modulo_base == "boveda":
            contexto = _gather_boveda(pregunta, api_base)
            if contexto is None:
                return (
                    "No encontré notas relevantes o el índice semántico no está disponible. "
                    "Probá /buscar <texto> para búsqueda por palabras."
                )
        else:
            return (
                "No puedo responder esa consulta todavía. "
                "Probá con: /saldo, /mes, /habitos, /hoy."
            )
    except requests.RequestException as exc:
        logger.warning("[assistant] API error para '%s': %s", modulo, exc)
        return "No pude acceder a los datos. ¿Está corriendo el backend?"
    except Exception as exc:
        logger.warning("[assistant] error para '%s': %s", modulo, exc, exc_info=True)
        return "Ocurrió un error al consultar los datos."

    return _synthesize(pregunta, contexto)


# ── Recopilación de contexto ───────────────────────────────────────────────────

# Preguntas que sí necesitan contexto de objetivos de ahorro — el resto (saldo simple,
# "cuánta plata tengo", etc.) no lo recibe, para que el LLM no confunda meta con disponible
# (ver Testeos-Ollama.md, prueba 2: sumó meta + saldo como si la meta fuera plata en cuenta).
_OBJETIVOS_KEYWORDS = (
    "objetivo", "objetivos",
    "meta", "metas",
    "ahorro", "ahorrado", "ahorrar",
    "cuanto falta", "cuánto falta",
)


def _pregunta_menciona_objetivos(pregunta: str) -> bool:
    p = (pregunta or "").lower()
    return any(kw in p for kw in _OBJETIVOS_KEYWORDS)


def _gather_finanzas(api: str, pregunta: str = "") -> dict:
    mes = date.today().strftime("%Y-%m")
    cuentas   = fh._get_cuentas(api)
    config    = fh._get_config(api)
    objetivos = fh._get_objetivos(api)

    # Misma lógica que GET /fin/movimientos/resumen (montos siempre positivos en totales)
    try:
        rr = requests.get(f"{api}/fin/movimientos/resumen", params={"mes": mes}, timeout=15)
        rr.raise_for_status()
        resumen = rr.json()
        ingresos = float(resumen.get("ingresos") or 0)
        gastos   = float(resumen.get("gastos") or 0)
        balance  = float(resumen.get("balance") or (ingresos - gastos))
        tasa     = float(resumen.get("tasa_ahorro") or 0)
        top_cats = [
            (c["categoria"], float(c.get("gastos") or 0))
            for c in (resumen.get("por_categoria") or [])
            if float(c.get("gastos") or 0) > 0
        ][:8]
    except requests.RequestException:
        movs_raw = fh._get_movimientos(api, mes)
        movs_all = [fh._normalize_mov(m) for m in movs_raw]
        movs     = [m for m in movs_all if not fh._is_transfer(m)]
        ingresos = sum(fh._monto_abs(m) for m in movs if m["tipo"] == "income")
        gastos   = sum(fh._monto_abs(m) for m in movs if m["tipo"] != "income")
        balance  = ingresos - gastos
        tasa     = round(balance / ingresos * 100, 1) if ingresos else 0.0
        cat_totales: dict[str, float] = {}
        for m in movs:
            if m["tipo"] != "income":
                cat = m["categoria_nombre"] or "Sin categoría"
                cat_totales[cat] = cat_totales.get(cat, 0) + fh._monto_abs(m)
        top_cats = sorted(cat_totales.items(), key=lambda x: x[1], reverse=True)[:8]

    # Saldos de cuentas (máx 6)
    saldos = [
        {
            "nombre": c["nombre"],
            "saldo_ars": round(c["saldo_ars"], 2),
            "saldo_usd": round(c["saldo_usd"], 2),
        }
        for c in cuentas[:6]
    ]

    # Tipo de cambio (MEP o manual)
    dolar = float(config.get("dolar_mep") or config.get("dolar_oficial") or 0)

    # Objetivos de ahorro (nombres + metas; progreso requiere histórico completo)
    objs = [
        {
            "nombre": obj["nombre"],
            "meta": float(obj.get("meta") or 0),
            "moneda": obj.get("moneda", "ARS"),
            "cuota_mensual": float(obj.get("cuota_mensual") or 0),
        }
        for obj in objetivos[:5]
    ]

    contexto = {
        "mes": mes,
        "total_ingresos": round(ingresos, 2),
        "total_gastos": round(gastos, 2),
        "balance": round(balance, 2),
        "tasa_ahorro_pct": tasa,
        "gastos_por_categoria": [{"categoria": c, "total": round(t, 2)} for c, t in top_cats],
        "cuentas": saldos,
        "dolar_mep": dolar if dolar else None,
    }
    if _pregunta_menciona_objetivos(pregunta):
        contexto["objetivos_de_ahorro"] = objs
    return contexto


def _gather_habitos(api: str) -> dict:
    hoy     = date.today()
    hoy_iso = hoy.isoformat()
    desde90 = (hoy - timedelta(days=90)).isoformat()

    habitos   = ah._get_habitos(api)
    registros = ah._get_registros(api, desde90, hoy_iso)

    # Mapa de registros: "{habito_id}-{fecha}" → registro
    reg_map: dict[str, dict] = {}
    for r in registros:
        reg_map[f"{r['habito_id']}-{r['fecha']}"] = r

    total_prog_hoy  = 0
    total_compl_hoy = 0.0
    hab_stats = []

    for h in habitos:
        if not h.get("activo", True):
            continue

        racha = ah._calc_racha(h, reg_map)

        # Estado de hoy
        estado_hoy = None
        if ah._is_scheduled_today(h):
            total_prog_hoy += 1
            reg_hoy = reg_map.get(f"{h['id']}-{hoy_iso}")
            valor   = reg_hoy.get("valor", 0) if reg_hoy else 0
            if valor >= 1.0:
                estado_hoy = "completado"
                total_compl_hoy += 1
            elif valor > 0:
                estado_hoy = "parcial"
                total_compl_hoy += 0.5
            else:
                estado_hoy = "pendiente"

        # % de los últimos 7 días
        dias_prog = sum(
            1 for i in range(7)
            if ah._is_scheduled(h, hoy - timedelta(days=i))
        )
        dias_compl = sum(
            1 for i in range(7)
            if ah._is_scheduled(h, hoy - timedelta(days=i))
            and reg_map.get(f"{h['id']}-{(hoy - timedelta(days=i)).isoformat()}", {}).get("valor", 0) > 0
        )
        pct_sem = round(dias_compl / dias_prog * 100) if dias_prog else None

        entry: dict = {"nombre": h["nombre"], "racha_dias": racha}
        if estado_hoy is not None:
            entry["hoy"] = estado_hoy
        if pct_sem is not None:
            entry["pct_ultimos_7_dias"] = pct_sem
        hab_stats.append(entry)

    hab_stats.sort(key=lambda h: h.get("racha_dias", 0), reverse=True)

    pct_hoy = round(total_compl_hoy / total_prog_hoy * 100) if total_prog_hoy else None

    dias_semana = ["lunes","martes","miércoles","jueves","viernes","sábado","domingo"]
    return {
        "fecha": hoy_iso,
        "dia_semana": dias_semana[hoy.weekday()],
        "progreso_hoy": {
            "completados": total_compl_hoy,
            "programados": total_prog_hoy,
            "pct": pct_hoy,
        },
        "habitos": hab_stats,
    }


def _gather_agenda(api: str) -> dict:
    hoy     = date.today()
    hoy_iso = hoy.isoformat()
    hasta   = (hoy + timedelta(days=6)).isoformat()

    tareas  = ah._get_tareas_pendientes(api)
    eventos = ah._get_eventos_rango(api, hoy_iso, hasta)

    # Eventos de hoy
    eventos_hoy = [
        {
            "titulo": e["titulo"],
            "hora_inicio": ah._hora_display(e.get("fecha_inicio", "")),
            "hora_fin":    ah._hora_display(e.get("fecha_fin", "")),
            "todo_el_dia": e.get("todo_el_dia", False),
        }
        for e in eventos
        if (e.get("fecha_inicio") or "")[:10] == hoy_iso
    ]

    # Tareas pendientes (máx 20, próximos 15 días)
    limite = (hoy + timedelta(days=15)).isoformat()
    pendientes = [
        {
            "titulo": t["titulo"],
            "fecha":  t.get("fecha_opcional"),
            "lista":  t.get("lista_nombre"),
        }
        for t in tareas
        if not t.get("completada")
        and (not t.get("fecha_opcional") or t["fecha_opcional"] <= limite)
    ][:20]

    # Próximos 7 días: eventos agrupados por fecha
    prox: dict[str, list[str]] = {}
    for e in eventos:
        fecha_e = (e.get("fecha_inicio") or "")[:10]
        if fecha_e > hoy_iso:
            prox.setdefault(fecha_e, []).append(e["titulo"])

    dias_semana = ["lunes","martes","miércoles","jueves","viernes","sábado","domingo"]
    return {
        "fecha_hoy":   hoy_iso,
        "dia_semana":  dias_semana[hoy.weekday()],
        "eventos_hoy": eventos_hoy,
        "tareas_pendientes_total": len([t for t in tareas if not t.get("completada")]),
        "tareas_pendientes": pendientes,
        "eventos_proximos_7_dias": dict(sorted(prox.items())),
    }


def _gather_boveda(pregunta: str, api: str) -> dict | None:
    """
    Busca hojas relevantes via RAG y devuelve el contexto para síntesis.
    Si la búsqueda semántica no encuentra nada (índice vacío, Ollama caído, o el hit
    simplemente no existe por similitud), cae a búsqueda por palabras clave (GET /hojas?q=)
    antes de rendirse — mismo contenido puede existir por texto exacto sin ser semánticamente
    cercano. Devuelve None solo si ninguna de las dos encuentra resultados.
    """
    hits = emb.search(pregunta, top_k=5, api_base=api)
    usa_keyword = False
    if not hits:
        hits = emb.search_keyword(pregunta, api_base=api)
        usa_keyword = True
        if not hits:
            return None
    notas = [
        {
            "titulo":    (h.get("contenido") or "")[:80],
            "categoria": h.get("categoria_nombre") or "",
            "tipo":      h.get("tipo") or "texto",
            "apuntes":   (h.get("apuntes") or "")[:200] if h.get("apuntes") else None,
            # La búsqueda por palabras clave no tiene score de relevancia semántica real;
            # se usa un valor fijo porque _synthesize() solo lo pasa como contexto al LLM,
            # no depende de que sea preciso.
            "relevancia": 1.0 if usa_keyword else h.get("score"),
        }
        for h in hits[:5]
    ]
    return {"pregunta": pregunta, "notas_encontradas": notas}


# ── Síntesis LLM ───────────────────────────────────────────────────────────────

def _synthesize(pregunta: str, contexto: dict) -> str:
    system = _SYSTEM_TMPL.format(fecha=date.today().strftime("%A %d/%m/%Y"))
    messages = [
        {
            "role": "user",
            "content": (
                f"Pregunta: {pregunta}\n\n"
                f"Datos:\n{json.dumps(contexto, ensure_ascii=False, indent=2)}"
            ),
        }
    ]
    respuesta = llm_client.chat(messages, system=system)
    if not respuesta:
        return (
            "No pude generar una respuesta. "
            "Probá con los comandos: /saldo, /mes, /habitos, /hoy."
        )
    return respuesta.strip()
