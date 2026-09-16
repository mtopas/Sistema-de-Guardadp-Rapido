import json
import logging
import os
import re
import sys
import time as _time
from datetime import datetime, time as datetime_time, timezone
from pathlib import Path

import requests
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    TypeHandler,
    filters,
)
from telegram.request import HTTPXRequest

from api_config import API_BASE

# api_config ya insertó project/ en sys.path -- ver docstring de app/vault/guard.py
# (riesgo 1 de Cerebro/decisiones/2026-09-11-share-smb-boveda-homelab.md).
from app.config import VAULT_ROOT
from app.vault.guard import ensure_vault_mounted

import agenda_handlers as ah
import assistant
import dev_reporter as dr
import finanzas_handlers as fh
import intent_router as ir
import jarvis_handlers as jh
import llm_client

logger = logging.getLogger(__name__)


TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CONNECT_TIMEOUT = float(os.environ.get("TELEGRAM_CONNECT_TIMEOUT", "30"))
TELEGRAM_READ_TIMEOUT = float(os.environ.get("TELEGRAM_READ_TIMEOUT", "30"))
TELEGRAM_PROXY_URL = os.environ.get("TELEGRAM_PROXY_URL", "").strip() or None
# -1 = reintentar bootstrap indefinidamente (evita crash loop en Docker si Telegram tarda)
TELEGRAM_BOOTSTRAP_RETRIES = int(os.environ.get("TELEGRAM_BOOTSTRAP_RETRIES", "-1"))

# Archivo local para persistir el chat_id entre reinicios
_CHAT_ID_FILE  = Path(__file__).parent / "chat_id.json"
_RAPIDO_FILE   = Path(__file__).parent / "rapido.json"

STEP_NONE                   = None
STEP_PHOTO_TITLE            = "photo_title"
STEP_CHOOSE_CATEGORY        = "choose_category"   # legacy; not used with inline keyboards
STEP_CHOOSE_CATEGORY_INLINE = "choose_category_inline"
STEP_NEW_CATEGORY_NAME      = "new_category_name"

# Pasos explícitos y acotados de Agenda/Finanzas (ver ah.handle_agenda_step y
# fh.handle_finanzas_step). Mientras uno de estos está activo, la respuesta
# del usuario le pertenece a ESE flujo, no a un pendiente de Jarvis
# (aclaración/propuesta pasiva/auditoría) que pueda haber quedado abierto en
# paralelo -- bug real: /tarea con el picker de listas abierto + una
# aclaración de Jarvis pendiente en el mismo chat hacía que el "1" del
# usuario lo consumiera Jarvis en vez del picker, y la tarea nunca se creaba.
_AGENDA_FINANZAS_STEPS = frozenset({
    ah.STEP_AGENDA_CHOOSE_LISTA,
    ah.STEP_AGENDA_CHOOSE_CALENDARIO,
    ah.STEP_HABITO_NOTA,
    ah.STEP_AYER_VALOR,
    ah.STEP_PLANIFICAR_NUEVA_TAREA,
    ah.STEP_AGENDA_TAREA_PENDING,
    ah.STEP_AGENDA_EVENTO_PENDING,
    fh.STEP_FIN_MONTO,
    fh.STEP_FIN_DESC,
    fh.STEP_FIN_CAT_TEXT,
})

URL_REGEX = re.compile(r"https?://\S+", re.IGNORECASE)

# ──────────────────────────────────────────────────────────────
# Persistencia del chat_id
# ──────────────────────────────────────────────────────────────

def _load_chat_id() -> int | None:
    try:
        data = json.loads(_CHAT_ID_FILE.read_text())
        return data.get("chat_id")
    except Exception:
        return None


def _save_chat_id(chat_id: int):
    try:
        _CHAT_ID_FILE.write_text(json.dumps({"chat_id": chat_id}))
    except Exception:
        pass


def _register_chat_id(bot_data: dict, chat_id: int):
    if bot_data.get("chat_id") != chat_id:
        bot_data["chat_id"] = chat_id
        _save_chat_id(chat_id)


# ──────────────────────────────────────────────────────────────
# Modo rápido (última categoría usada)
# ──────────────────────────────────────────────────────────────

def _load_rapido() -> dict:
    """Returns {'activo': bool, 'cat_id': int|None, 'cat_nombre': str|None}."""
    try:
        return json.loads(_RAPIDO_FILE.read_text())
    except Exception:
        return {"activo": False, "cat_id": None, "cat_nombre": None}


def _save_rapido(data: dict):
    try:
        _RAPIDO_FILE.write_text(json.dumps(data))
    except Exception:
        pass


def _update_rapido_last_cat(cat_id: int, cat_nombre: str):
    r = _load_rapido()
    r["cat_id"]     = cat_id
    r["cat_nombre"] = cat_nombre
    _save_rapido(r)


def _clear_boveda_picker(ud: dict) -> None:
    """Cierra el menú inline activo sin borrar capturas de otros teclados ni finanzas/agenda.

    `boveda_pending` (draft por message_id del teclado) se conserva a propósito:
    en catch-up pueden quedar varios menús abiertos y cada uno debe seguir
    pudiendo guardar su propio contenido.
    """
    if ud.get("step") == STEP_CHOOSE_CATEGORY_INLINE:
        ud.pop("step", None)
    for k in ("draft", "tipo", "categorias_all", "cat_parent_id", "apuntes"):
        ud.pop(k, None)


def _boveda_payload_from_ud(ud: dict) -> dict:
    return {
        "draft": ud.get("draft", ""),
        "tipo": ud.get("tipo", "texto"),
        "apuntes": ud.get("apuntes"),
        "lugar": ud.get("lugar"),
        "latitud": ud.get("latitud"),
        "longitud": ud.get("longitud"),
        "link_preview": ud.get("link_preview"),
    }


def _truncate_line(line: str, max_len: int = 100) -> str:
    line = (line or "").strip()
    if len(line) <= max_len:
        return line
    return line[: max_len - 1] + "…"


def _first_two_lines(text: str, max_line: int = 100) -> str:
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    if not lines:
        return "—"
    return "\n".join(_truncate_line(ln, max_line) for ln in lines[:2])


def _fetch_link_preview(url: str) -> dict | None:
    try:
        r = requests.get(f"{API_BASE}/preview", params={"url": url}, timeout=12)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.debug("link preview falló (%s): %s", url, e)
        return None


def _boveda_snippet(payload: dict) -> str:
    """Resumen visible en el menú de categorías (2 líneas o título del link)."""
    draft = (payload.get("draft") or "").strip()
    tipo  = payload.get("tipo", "texto")

    if tipo == "link":
        url = _extract_url(draft) or draft
        preview = payload.get("link_preview")
        if preview is None and url:
            preview = _fetch_link_preview(url)
            if preview:
                payload["link_preview"] = preview
        title = (preview or {}).get("title") if preview else None
        if title and str(title).strip():
            return f"🔗 {_truncate_line(str(title).strip(), 120)}"
        return f"🔗 {_first_two_lines(url or draft)}"

    if tipo == "foto":
        return f"📷 {_first_two_lines(draft or 'Foto sin título')}"

    icon = {"texto": "📝"}.get(tipo, "📝")
    return f"{icon} {_first_two_lines(draft)}"


def _category_picker_text(payload: dict, parent_id: int | None) -> str:
    prompt = "Elegí la subcategoría:" if parent_id is not None else "¿A qué categoría lo guardamos?"
    return f"{_boveda_snippet(payload)}\n\n{prompt}"


def _store_boveda_pending(ud: dict, picker_message_id: int, payload: dict) -> None:
    ud.setdefault("boveda_pending", {})[picker_message_id] = payload


def _get_boveda_pending(ud: dict, picker_message_id: int) -> dict | None:
    pending = ud.get("boveda_pending") or {}
    return pending.get(picker_message_id)


def _finish_boveda_flow(ud: dict, picker_message_id: int | None = None) -> None:
    """Limpia el step de Bóveda; no borra otras capturas pendientes ni otros módulos."""
    if picker_message_id is not None:
        (ud.get("boveda_pending") or {}).pop(picker_message_id, None)
    ud.pop("boveda_creating", None)
    ud.pop("step", None)
    ud.pop("new_cat_parent_id", None)
    ud.pop("photo_url", None)
    for k in ("draft", "tipo", "categorias_all", "cat_parent_id", "apuntes",
              "lugar", "latitud", "longitud"):
        ud.pop(k, None)


# ──────────────────────────────────────────────────────────────
# Healthcheck
# ──────────────────────────────────────────────────────────────

def _log_api_meta():
    try:
        r = requests.get(f"{API_BASE}/meta", timeout=10)
        r.raise_for_status()
        meta = r.json()
        counts = meta.get("counts") or {}
        print(f"[bot] API: {API_BASE}")
        print(f"[bot] Base de datos del backend: {meta.get('db_path')}")
        print(
            "[bot] Registros en esa DB — hojas: {hojas}, movimientos: {mov}, notas fin: {notas}".format(
                hojas=counts.get("hojas", "?"),
                mov=counts.get("fin_movimientos", "?"),
                notas=counts.get("fin_notas", "?"),
            )
        )
        print(
            "[bot] Si no coinciden con la app en Windows, el bot apunta a OTRA API/DB "
            "(p. ej. backend Docker en el homelab vs uvicorn/.exe local)."
        )
    except Exception as e:
        print(f"[bot] No se pudo leer /meta ({e}). ¿Backend actualizado?")


def _healthcheck():
    delays = [1, 2, 4, 8]
    api_ok = False
    cat_ok = False

    for attempt, delay in enumerate(delays, start=1):
        try:
            r = requests.get(f"{API_BASE}/habitos", timeout=10)
            r.raise_for_status()
            print(f"[bot] Healthcheck OK — API en {API_BASE} (intento {attempt})")
            api_ok = True
            break
        except Exception as e:
            if attempt < len(delays):
                print(f"[bot] Healthcheck intento {attempt} fallido ({e}). Reintentando en {delay}s…")
                _time.sleep(delay)
            else:
                print(f"[bot] ADVERTENCIA: API no responde tras {attempt} intentos ({e}).")

    if api_ok:
        _log_api_meta()

    # Also verify /categorias specifically (Bóveda dependency)
    if api_ok:
        try:
            r = requests.get(f"{API_BASE}/categorias", timeout=10)
            r.raise_for_status()
            cats = r.json()
            print(f"[bot] Categorías disponibles: {len(cats)}")
            cat_ok = True
        except Exception as e:
            print(f"[bot] ADVERTENCIA: /categorias no responde al arrancar ({e}). Las capturas de Bóveda pueden fallar.")

    return api_ok, cat_ok


def _build_telegram_request() -> HTTPXRequest:
    kwargs = {
        "connect_timeout": TELEGRAM_CONNECT_TIMEOUT,
        "read_timeout": TELEGRAM_READ_TIMEOUT,
        "write_timeout": TELEGRAM_READ_TIMEOUT,
        "pool_timeout": TELEGRAM_READ_TIMEOUT,
    }
    if TELEGRAM_PROXY_URL:
        kwargs["proxy_url"] = TELEGRAM_PROXY_URL
        print(f"[bot] Telegram API vía proxy configurado")
    return HTTPXRequest(**kwargs)


def _log_telegram_connectivity():
    """Diagnóstico previo: el backend puede andar aunque Telegram no sea alcanzable."""
    try:
        r = requests.get("https://api.telegram.org", timeout=TELEGRAM_CONNECT_TIMEOUT)
        print(f"[bot] Conectividad Telegram OK (HTTP {r.status_code})")
        return True
    except Exception as e:
        print(
            f"[bot] ⚠ No se puede conectar a api.telegram.org ({e}). "
            "El bot reintentará al iniciar polling."
        )
        print(
            "[bot] Revisá: Internet en el gabinete (ping 8.8.8.8), DNS Docker, "
            "ICS Windows→Ubuntu, firewall saliente HTTPS. "
            "Si Telegram está bloqueado, definí TELEGRAM_PROXY_URL en .env."
        )
        return False


# ──────────────────────────────────────────────────────────────
# Bóveda — helpers de API con caché 60s
# ──────────────────────────────────────────────────────────────

_CAT_CACHE_TTL = 60  # seconds

def _get_categories(bot_data: dict | None = None) -> list:
    """Fetch categories with a 60s in-memory cache stored in bot_data."""
    now = _time.time()
    if bot_data is not None:
        cache      = bot_data.get("cat_cache")
        cache_ts   = bot_data.get("cat_cache_ts", 0)
        if cache is not None and (now - cache_ts) < _CAT_CACHE_TTL:
            return cache
    r = requests.get(f"{API_BASE}/categorias", timeout=30)
    r.raise_for_status()
    cats = r.json()
    if bot_data is not None:
        bot_data["cat_cache"]    = cats
        bot_data["cat_cache_ts"] = now
    return cats


def _invalidate_cat_cache(bot_data: dict | None):
    if bot_data:
        bot_data.pop("cat_cache", None)
        bot_data.pop("cat_cache_ts", None)


def _post_categoria(nombre: str, padre_id: int | None = None):
    body = {"nombre": nombre}
    if padre_id is not None:
        body["padre_id"] = padre_id
    return requests.post(f"{API_BASE}/categorias", json=body, timeout=30)


def _post_hoja(contenido: str, categoria_id: int, tipo: str = "texto",
               apuntes: str = None, lugar: str = None,
               latitud: float = None, longitud: float = None):
    body = {"contenido": contenido, "categoria_id": categoria_id, "tipo": tipo}
    if apuntes:   body["apuntes"]   = apuntes
    if lugar:     body["lugar"]     = lugar
    if latitud is not None:  body["latitud"]  = latitud
    if longitud is not None: body["longitud"] = longitud
    return requests.post(f"{API_BASE}/hojas", json=body, timeout=30)


def _upload_photo(photo_bytes: bytes, filename: str = "photo.jpg") -> str:
    r = requests.post(
        f"{API_BASE}/upload",
        files={"file": (filename, photo_bytes, "image/jpeg")},
        timeout=60,
    )
    r.raise_for_status()
    return r.json()["url"]


def _extract_url(texto: str) -> str | None:
    """Primera URL del texto, sin puntuación colgante típica de Telegram."""
    m = URL_REGEX.search(texto or "")
    if not m:
        return None
    url = m.group(0).rstrip(".,;:!?)\"'»")
    return url or None


def _detect_tipo(texto: str) -> str:
    """Returns 'link' if texto contains a URL, else 'texto'."""
    return "link" if URL_REGEX.search(texto) else "texto"


def _is_bare_link(texto: str) -> bool:
    """True si el mensaje es solo URL(s) — captura Bóveda, no consulta LLM."""
    t = (texto or "").strip()
    if not URL_REGEX.search(t):
        return False
    rest = URL_REGEX.sub("", t).strip()
    rest = re.sub(r"^[\s,.:;!?]+|[\s,.:;!?]+$", "", rest)
    return not rest


# ──────────────────────────────────────────────────────────────
# Inline keyboard builder for categories
# ──────────────────────────────────────────────────────────────

def _build_category_keyboard(categorias: list, parent_id: int | None = None,
                              back_btn: bool = False) -> InlineKeyboardMarkup:
    """
    Build an inline keyboard for category selection.
    Shows categories filtered by parent_id (None = root categories).
    Each button triggers bov_cat:{cat_id} callback.
    If a root category has children, prefix with 📂 and use bov_root:{cat_id}.
    """
    # All categories at this level
    level_cats = [c for c in categorias if c.get("padre_id") == parent_id]
    # Which ones have children?
    has_children = {c["id"] for c in categorias if c.get("padre_id") is not None}

    rows = []
    for c in level_cats:
        label = f"{c.get('icono', '') or ''} {c['nombre']}".strip()
        if c["id"] in has_children and parent_id is None:
            label = f"📂 {label}"
            rows.append([InlineKeyboardButton(label, callback_data=f"bov_root:{c['id']}")])
        else:
            rows.append([InlineKeyboardButton(label, callback_data=f"bov_cat:{c['id']}")])

    extra = []
    if back_btn:
        extra.append(InlineKeyboardButton("⬅ Volver", callback_data="bov_back"))
    extra.append(InlineKeyboardButton("➕ Nueva categoría", callback_data="bov_new_cat"))
    rows.append(extra)

    return InlineKeyboardMarkup(rows)


async def _save_draft(
    ud: dict,
    bot_data: dict,
    cat: dict,
    message,
    pending: dict | None = None,
) -> bool:
    src     = pending or ud
    draft   = (src.get("draft") or "").strip()
    tipo    = src.get("tipo", "texto")
    apuntes = src.get("apuntes")
    lugar   = src.get("lugar")
    lat     = src.get("latitud")
    lon     = src.get("longitud")

    if not draft:
        await message.reply_text(
            "No se pudo guardar: el contenido de esa captura se perdió. "
            "Reenviá el mensaje."
        )
        return False

    r = _post_hoja(draft, cat["id"], tipo=tipo, apuntes=apuntes,
                   lugar=lugar, latitud=lat, longitud=lon)
    if r.status_code not in (200, 201):
        try:
            detail = r.json().get("detail", r.text)
        except Exception:
            detail = r.text
        await message.reply_text(f"No se pudo guardar: {detail}")
        return False

    # Update rapid-mode last category
    _update_rapido_last_cat(cat["id"], cat["nombre"])

    tipo_label = {"link": "🔗", "foto": "📷", "texto": "📝"}.get(tipo, "📝")
    await message.reply_text(f"{tipo_label} Guardado en [{cat['nombre']}] ✓")
    return True


# ──────────────────────────────────────────────────────────────
# Comandos generales
# ──────────────────────────────────────────────────────────────

async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    _register_chat_id(context.bot_data, update.effective_chat.id)
    await update.message.reply_text(ah.HELP_TEXT, parse_mode="Markdown")


async def cmd_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data.clear()
    await update.message.reply_text("Acción cancelada.")


async def cmd_dev(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Modo dev: streams en vivo. /dev logs all|errors|context | off | test | tail"""
    chat_id = update.effective_chat.id
    _register_chat_id(context.bot_data, chat_id)

    if not dr.is_chat_allowed(chat_id):
        await update.message.reply_text("No autorizado para /dev.")
        return

    args = [a.lower() for a in (context.args or [])]

    if not args or args[0] == "status":
        await update.message.reply_text(dr.status_text(), parse_mode="Markdown")
        return
    if args[0] == "logs" and len(args) >= 2:
        mode_map = {"all": "all", "errors": "errors", "error": "errors", "context": "context"}
        mode = mode_map.get(args[1])
        if mode:
            await update.message.reply_text(
                dr.set_log_mode(chat_id, mode),
                parse_mode="Markdown",
            )
            logger.info("Modo dev logs %s por chat_id=%s", mode, chat_id)
            return
    if args[0] in ("on", "1", "true", "activar"):
        await update.message.reply_text(
            dr.set_log_mode(chat_id, "all"),
            parse_mode="Markdown",
        )
        logger.info("Modo dev activado (all) por chat_id=%s", chat_id)
        return
    if args[0] in ("off", "0", "false", "desactivar"):
        await update.message.reply_text(
            dr.set_log_mode(chat_id, "off"),
            parse_mode="Markdown",
        )
        logger.info("Modo dev desactivado por chat_id=%s", chat_id)
        return
    if args[0] == "test":
        if not dr.is_enabled():
            await update.message.reply_text(
                "Activá un stream: `/dev logs all`, `errors` o `context`.",
                parse_mode="Markdown",
            )
            return
        await dr.send_test(f"Prueba dev {datetime.now().isoformat(timespec='seconds')}")
        await update.message.reply_text("Mensaje de prueba enviado.")
        return
    if args[0] == "tail":
        await update.message.reply_text(dr.tail_text(), parse_mode="Markdown")
        return

    await update.message.reply_text(
        "Usá:\n"
        "`/dev logs all` — todos los logs\n"
        "`/dev logs errors` — solo errores\n"
        "`/dev logs context` — payload a la IA\n"
        "`/dev off` · `/dev test` · `/dev tail`",
        parse_mode="Markdown",
    )


async def cmd_rapido(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Toggle rapid mode: /rapido on | /rapido off"""
    _register_chat_id(context.bot_data, update.effective_chat.id)
    args = context.args
    r    = _load_rapido()

    if not args:
        estado = "ON ✅" if r["activo"] else "OFF ❌"
        cat    = r.get("cat_nombre") or "ninguna"
        await update.message.reply_text(
            f"Modo rápido: {estado}\nÚltima categoría: {cat}\n\n"
            "Usá `/rapido on` o `/rapido off` para cambiarlo.",
            parse_mode="Markdown",
        )
        return

    if args[0].lower() in ("on", "1", "true", "activar"):
        r["activo"] = True
        _save_rapido(r)
        cat = r.get("cat_nombre") or "ninguna aún (se fija al guardar)"
        await update.message.reply_text(
            f"Modo rápido *ON* ✅\nLas hojas se guardarán directo en: {cat}",
            parse_mode="Markdown",
        )
    elif args[0].lower() in ("off", "0", "false", "desactivar"):
        r["activo"] = False
        _save_rapido(r)
        await update.message.reply_text("Modo rápido *OFF* ❌ — el menú de categorías aparecerá normalmente.", parse_mode="Markdown")
    else:
        await update.message.reply_text("Usá `/rapido on` o `/rapido off`.", parse_mode="Markdown")


async def cmd_ultimas(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Show last 5 saved hojas with inline delete buttons."""
    _register_chat_id(context.bot_data, update.effective_chat.id)
    try:
        r = requests.get(f"{API_BASE}/hojas/recientes?limit=5", timeout=15)
        r.raise_for_status()
        hojas = r.json()
    except Exception as e:
        await update.message.reply_text(f"No pude cargar las últimas hojas: {e}")
        return

    if not hojas:
        await update.message.reply_text("No hay hojas guardadas aún.")
        return

    tipo_icon = {"link": "🔗", "foto": "📷", "texto": "📝"}
    lines = ["*Últimas hojas:*\n"]
    buttons = []
    for i, h in enumerate(hojas, 1):
        icon   = tipo_icon.get(h.get("tipo"), "📝")
        titulo = (h.get("contenido") or "")[:60].replace("\n", " ")
        cat    = h.get("categoria_nombre", "—")
        lines.append(f"{i}. {icon} *{titulo}* _[{cat}]_")
        buttons.append([InlineKeyboardButton(f"🗑 #{i} {titulo[:30]}", callback_data=f"bov_del:{h['id']}")])

    await update.message.reply_text(
        "\n".join(lines),
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup(buttons),
    )


async def cmd_pregunta(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Búsqueda semántica + respuesta LLM sobre la Bóveda: /pregunta <texto>"""
    _register_chat_id(context.bot_data, update.effective_chat.id)
    query = " ".join(context.args).strip() if context.args else ""
    if not query:
        await update.message.reply_text(
            "Usá /pregunta <texto> para consultar tu Bóveda.\n"
            "Ejemplo: /pregunta ¿qué sé sobre machine learning?"
        )
        return

    thinking_msg = await update.message.reply_text("🔍 Buscando en la Bóveda…")
    api = context.bot_data.get("api_base", API_BASE)
    respuesta = assistant.answer_question(query, "consulta_boveda", api)
    try:
        await thinking_msg.edit_text(respuesta)
    except Exception:
        await update.message.reply_text(respuesta)


async def cmd_buscar(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Search hojas: /buscar <palabra>"""
    _register_chat_id(context.bot_data, update.effective_chat.id)
    query = " ".join(context.args).strip()
    if not query:
        await update.message.reply_text("Usá `/buscar <palabra>` para buscar en la Bóveda.", parse_mode="Markdown")
        return

    try:
        import urllib.parse
        r = requests.get(f"{API_BASE}/hojas?q={urllib.parse.quote(query)}", timeout=15)
        r.raise_for_status()
        hojas = r.json()[:10]
    except Exception as e:
        await update.message.reply_text(f"Error al buscar: {e}")
        return

    if not hojas:
        await update.message.reply_text(f'No encontré nada para "{query}".')
        return

    tipo_icon = {"link": "🔗", "foto": "📷", "texto": "📝"}
    lines = [f'*Resultados para "{query}":*\n']
    for h in hojas:
        icon   = tipo_icon.get(h.get("tipo"), "📝")
        titulo = (h.get("contenido") or "")[:70].replace("\n", " ")
        cat    = h.get("categoria_nombre", "—")
        lines.append(f"• {icon} {titulo} _[{cat}]_")

    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


# ──────────────────────────────────────────────────────────────
# Handler principal de texto
# ──────────────────────────────────────────────────────────────

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not update.message:
        return

    msg = update.message
    _register_chat_id(context.bot_data, msg.chat.id)

    ud   = context.user_data
    step = ud.get("step")

    # Jarvis: aclaración pendiente tiene prioridad absoluta sobre texto libre
    # -- si no, la respuesta a "¿Por qué...?" se interpretaría como una hoja
    # nueva de la Bóveda. Pero si ya hay un paso explícito y acotado de
    # Agenda/Finanzas en curso (picker de listas, monto/descripción de un
    # movimiento, etc.), ESE paso tiene prioridad: el mensaje es la respuesta
    # a esa pregunta puntual, no a un pendiente de Jarvis que haya quedado
    # abierto en paralelo (ver _AGENDA_FINANZAS_STEPS).
    if step not in _AGENDA_FINANZAS_STEPS:
        if await jh.handle_pending_clarification(update, context):
            return
        if await jh.handle_pending_passive_proposal(update, context):
            return
        if await jh.handle_pending_audit_proposal(update, context):
            return

    # Extraer texto del forward si es un forward
    texto = None
    if msg.forward_origin and not msg.text:
        # Forwarded message — use caption or original text
        pass
    if msg.text:
        texto = msg.text.strip()
    elif msg.caption:
        texto = msg.caption.strip()

    if texto is None:
        return

    # Menú inline de Bóveda: no bloquea el LLM — texto nuevo = re-clasificar
    if step == STEP_CHOOSE_CATEGORY_INLINE:
        logger.info("[bot] Picker Bóveda abierto; nuevo texto → LLM")
        _clear_boveda_picker(ud)
        step = None

    # ── Pasos de Agenda tienen prioridad ─────────────────────
    if await ah.handle_agenda_step(update, context, texto):
        return

    # ── Pasos de Finanzas ─────────────────────────────────────
    if await fh.handle_finanzas_step(update, context, texto):
        return

    # ── Quick captures por prefijo ────────────────────────────
    if step is None:
        if await ah.handle_quick_capture(update, context, texto):
            return
        if await fh.handle_fin_quick_capture(update, context, texto):
            return

        # URL sola → Bóveda (el LLM suele clasificarla mal como consulta)
        if not _is_bare_link(texto):
            # ── LLM routing (texto libre sin prefijos) ─────────────
            rr = ir.route(texto)
            if rr.action in ("direct", "confirm"):
                _clear_boveda_picker(ud)
                summary = ir.format_summary(rr)
                kb = InlineKeyboardMarkup([[
                    InlineKeyboardButton("✅ Confirmar", callback_data="llm_ok"),
                    InlineKeyboardButton("✏️ Corregir",  callback_data="llm_edit"),
                    InlineKeyboardButton("❌ Cancelar",  callback_data="llm_cancel"),
                ]])
                ud["llm_pending"] = ir.result_to_dict(rr)
                await msg.reply_text(summary, reply_markup=kb, parse_mode="Markdown")
                return
            elif rr.action == "question":
                thinking_msg = await msg.reply_text("🔍 Consultando…")
                api = context.bot_data.get("api_base", API_BASE)
                respuesta = assistant.answer_question(texto, rr.modulo, api)
                try:
                    await thinking_msg.edit_text(respuesta)
                except Exception:
                    await msg.reply_text(respuesta)
                return
            # "fallback": continúa al flujo Bóveda normal

    # ── Crear categoría nueva ─────────────────────────────────
    if step == STEP_NEW_CATEGORY_NAME:
        if not texto:
            await msg.reply_text("El nombre no puede estar vacío.")
            return
        parent_id = ud.get("new_cat_parent_id")
        r = _post_categoria(texto, padre_id=parent_id)
        if r.status_code not in (200, 201):
            try:
                detail = r.json().get("detail", r.text)
            except Exception:
                detail = r.text
            await msg.reply_text(f"No se pudo crear la categoría: {detail}")
            return
        data = r.json()
        _invalidate_cat_cache(context.bot_data)
        cat = {"id": data["id"], "nombre": data["nombre"]}
        pending = ud.get("boveda_creating") or _boveda_payload_from_ud(ud)
        await _save_draft(ud, context.bot_data, cat, msg, pending=pending)
        _finish_boveda_flow(ud)
        return

    # ── Photo title ───────────────────────────────────────────
    if step == STEP_PHOTO_TITLE:
        if not texto:
            await msg.reply_text("El título no puede estar vacío.")
            return
        photo_url = ud.get("photo_url", "")
        full_url  = f"{API_BASE}{photo_url}" if photo_url.startswith("/") else photo_url
        ud["draft"]   = texto
        ud["apuntes"] = f'<img src="{full_url}" alt="{texto}" style="max-width:100%;border-radius:8px;margin-top:8px;">'
        await _show_category_menu(msg, context, ud)
        return

    # ── Nuevo texto → Bóveda ──────────────────────────────────
    if not texto:
        await msg.reply_text("Enviá un texto para guardar.")
        return

    # Detect tipo
    tipo = _detect_tipo(texto)
    ud["draft"] = texto
    ud["tipo"]  = tipo

    # Modo rápido: si activo y hay última categoría, guardar directo
    rapido = _load_rapido()
    if rapido.get("activo") and rapido.get("cat_id"):
        cat = {"id": rapido["cat_id"], "nombre": rapido["cat_nombre"]}
        await _save_draft(ud, context.bot_data, cat, msg)
        _finish_boveda_flow(ud)
        return

    await _show_category_menu(msg, context, ud)


async def _show_category_menu(message, context: ContextTypes.DEFAULT_TYPE, ud: dict,
                               parent_id: int | None = None, edit_message=None):
    """Send (or edit) the category picker keyboard."""
    try:
        cats = _get_categories(context.bot_data)
    except Exception as e:
        await message.reply_text(f"No pude cargar categorías: {e}")
        return

    ud["step"]           = STEP_CHOOSE_CATEGORY_INLINE
    ud["categorias_all"] = cats
    ud["cat_parent_id"]  = parent_id

    kb = _build_category_keyboard(cats, parent_id=parent_id, back_btn=(parent_id is not None))

    if edit_message:
        mid = edit_message.message_id
        # Al navegar subcategorías, conservar el contenido de ESE teclado.
        payload = _get_boveda_pending(ud, mid) or _boveda_payload_from_ud(ud)
        text = _category_picker_text(payload, parent_id)
        await edit_message.edit_text(text, reply_markup=kb)
        _store_boveda_pending(ud, mid, payload)
    else:
        payload = _boveda_payload_from_ud(ud)
        text = _category_picker_text(payload, parent_id)
        sent = await message.reply_text(text, reply_markup=kb)
        _store_boveda_pending(ud, sent.message_id, payload)


async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not update.message or not update.message.photo:
        return

    _register_chat_id(context.bot_data, update.effective_chat.id)

    ud   = context.user_data
    step = ud.get("step")

    if step is not None:
        await update.message.reply_text(
            "Tenés una acción pendiente. Completala primero o enviá /cancel para cancelar."
        )
        return

    await update.message.reply_text("Subiendo imagen…")

    photo_obj   = update.message.photo[-1]
    tg_file     = await context.bot.get_file(photo_obj.file_id)
    photo_bytes = await tg_file.download_as_bytearray()

    try:
        url = _upload_photo(bytes(photo_bytes))
    except Exception as e:
        await update.message.reply_text(f"No se pudo subir la imagen: {e}")
        return

    ud["photo_url"] = url
    ud["tipo"]      = "foto"
    ud["step"]      = STEP_PHOTO_TITLE

    # If caption provided, use it as title automatically
    caption = update.message.caption or ""
    if caption.strip():
        full_url = f"{API_BASE}{url}" if url.startswith("/") else url
        ud["draft"]   = caption.strip()
        ud["apuntes"] = f'<img src="{full_url}" alt="{caption.strip()}" style="max-width:100%;border-radius:8px;margin-top:8px;">'
        await _show_category_menu(update.message, context, ud)
    else:
        await update.message.reply_text("Imagen subida. ¿Qué título le ponés?")


async def handle_location(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Save a location as a hoja with lugar + lat/lon."""
    if not update.message or not update.message.location:
        return

    _register_chat_id(context.bot_data, update.effective_chat.id)

    ud   = context.user_data
    step = ud.get("step")

    if step is not None:
        await update.message.reply_text(
            "Tenés una acción pendiente. Completala primero o enviá /cancel."
        )
        return

    loc   = update.message.location
    lat   = loc.latitude
    lon   = loc.longitude
    lugar = f"{lat:.5f}, {lon:.5f}"

    ud["draft"]    = f"📍 {lugar}"
    ud["tipo"]     = "texto"
    ud["lugar"]    = lugar
    ud["latitud"]  = lat
    ud["longitud"] = lon

    await _show_category_menu(update.message, context, ud)


async def handle_forward(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle forwarded messages → capture to Bóveda."""
    if not update.message:
        return
    msg = update.message
    if not msg.forward_origin:
        return

    _register_chat_id(context.bot_data, msg.chat.id)

    ud   = context.user_data
    step = ud.get("step")

    if step is not None:
        await msg.reply_text("Tenés una acción pendiente. Completala o enviá /cancel.")
        return

    # Extract text content from the forwarded message
    texto = (msg.text or msg.caption or "").strip()
    if not texto:
        await msg.reply_text("No encontré texto en el mensaje reenviado.")
        return

    tipo = _detect_tipo(texto)
    ud["draft"] = texto
    ud["tipo"]  = tipo

    rapido = _load_rapido()
    if rapido.get("activo") and rapido.get("cat_id"):
        cat = {"id": rapido["cat_id"], "nombre": rapido["cat_nombre"]}
        await _save_draft(ud, context.bot_data, cat, msg)
        _finish_boveda_flow(ud)
        return

    await _show_category_menu(msg, context, ud)


# ──────────────────────────────────────────────────────────────
# Callbacks de botones inline — Bóveda
# ──────────────────────────────────────────────────────────────

async def _handle_boveda_callback(update: Update, context: ContextTypes.DEFAULT_TYPE, data: str) -> bool:
    """Handle bov_* callback_data. Returns True if handled."""
    if not data.startswith("bov_"):
        return False

    query = update.callback_query
    await query.answer()
    ud    = context.user_data
    mid   = query.message.message_id if query.message else None
    cats  = ud.get("categorias_all") or []
    if not cats and mid is not None:
        # Catch-up / varios teclados: categorias_all puede haberse pisado.
        try:
            cats = _get_categories(context.bot_data)
            ud["categorias_all"] = cats
        except Exception:
            cats = []

    # ── Browse into a root category (has subcategories) ────
    if data.startswith("bov_root:"):
        root_id = int(data.split(":", 1)[1])
        await _show_category_menu(query.message, context, ud, parent_id=root_id, edit_message=query.message)
        return True

    # ── Select a leaf category → save ──────────────────────
    if data.startswith("bov_cat:"):
        cat_id = int(data.split(":", 1)[1])
        cat    = next((c for c in cats if c["id"] == cat_id), None)
        if cat is None:
            # Fallback: fetch fresh
            try:
                fresh = _get_categories(context.bot_data)
                cat   = next((c for c in fresh if c["id"] == cat_id), None)
            except Exception:
                pass
        if cat is None:
            await query.edit_message_text("Categoría no encontrada. Intentá de nuevo.")
            _finish_boveda_flow(ud, picker_message_id=mid)
            return True

        pending = _get_boveda_pending(ud, mid) if mid is not None else None
        if not pending or not str(pending.get("draft") or "").strip():
            # Fallback legacy (un solo draft compartido)
            if str(ud.get("draft") or "").strip():
                pending = _boveda_payload_from_ud(ud)
            else:
                await query.edit_message_text(
                    "Esa captura ya no tiene contenido asociado "
                    "(otro mensaje la pisó antes de elegir categoría). "
                    "Reenviá el texto para guardarla."
                )
                _finish_boveda_flow(ud, picker_message_id=mid)
                return True

        try:
            await query.edit_message_text(f"Guardando en [{cat['nombre']}]…")
        except Exception:
            pass
        await _save_draft(ud, context.bot_data, cat, query.message, pending=pending)
        _finish_boveda_flow(ud, picker_message_id=mid)
        return True

    # ── Go back to root level ──────────────────────────────
    if data == "bov_back":
        ud["cat_parent_id"] = None
        cats_all = ud.get("categorias_all") or _get_categories(context.bot_data)
        kb   = _build_category_keyboard(cats_all, parent_id=None, back_btn=False)
        pending = _get_boveda_pending(ud, mid) or _boveda_payload_from_ud(ud)
        text = _category_picker_text(pending, parent_id=None)
        await query.edit_message_text(text, reply_markup=kb)
        if mid is not None:
            _store_boveda_pending(ud, mid, pending)
        return True

    # ── Create new category ─────────────────────────────────
    if data == "bov_new_cat":
        parent_id = ud.get("cat_parent_id")
        if mid is not None:
            pending = _get_boveda_pending(ud, mid) or _boveda_payload_from_ud(ud)
            ud["boveda_creating"] = pending
        ud["step"]             = STEP_NEW_CATEGORY_NAME
        ud["new_cat_parent_id"] = parent_id
        hint = " (subcategoría)" if parent_id else ""
        await query.edit_message_text(f"Escribí el nombre de la nueva categoría{hint}:")
        return True

    # ── Delete a hoja (from /ultimas) ──────────────────────
    if data.startswith("bov_del:"):
        hoja_id = int(data.split(":", 1)[1])
        try:
            r = requests.delete(f"{API_BASE}/hojas/{hoja_id}", timeout=15)
            if r.status_code == 200:
                await query.edit_message_text("🗑 Hoja eliminada.")
            else:
                await query.edit_message_text("No se pudo eliminar la hoja.")
        except Exception as e:
            await query.edit_message_text(f"Error: {e}")
        return True

    return False


# ──────────────────────────────────────────────────────────────
# Callbacks LLM (llm_ok / llm_edit / llm_cancel)
# ──────────────────────────────────────────────────────────────

async def _handle_llm_callback(update: Update, context: ContextTypes.DEFAULT_TYPE, data: str) -> bool:
    """Maneja confirmaciones del router LLM. Devuelve True si fue manejado."""
    if not data.startswith("llm_"):
        return False

    query = update.callback_query
    await query.answer()
    ud      = context.user_data
    pending = ud.get("llm_pending")

    if data == "llm_cancel":
        ud.pop("llm_pending", None)
        await query.edit_message_text("❌ Cancelado.")
        return True

    if data == "llm_ok":
        if not pending:
            await query.edit_message_text("No hay nada pendiente.")
            return True
        rr = ir.dict_to_result(pending)
        ud.pop("llm_pending", None)
        await query.edit_message_text("⏳ Guardando…")
        ok, msg_text = ir.execute(rr)
        await query.edit_message_text(msg_text)
        logger.info("[llm_ok] módulo=%s ok=%s", rr.modulo, ok)
        return True

    if data == "llm_edit":
        if not pending:
            await query.edit_message_text("No hay nada pendiente.")
            return True
        rr = ir.dict_to_result(pending)
        ud.pop("llm_pending", None)
        cmd_hint = {
            "finanzas": "/mov",
            "agenda":   "/tarea o /evento",
            "habitos":  "/habitos",
        }.get(rr.modulo, "el comando correspondiente")
        await query.edit_message_text(
            f"✏️ Usá {cmd_hint} para ingresar los datos manualmente."
        )
        return True

    return False


# ──────────────────────────────────────────────────────────────
# Dispatcher de callbacks (LLM → Bóveda → Finanzas → Agenda)
# ──────────────────────────────────────────────────────────────

async def _global_error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    err = context.error
    logger.exception("Error no manejado en el bot", exc_info=err)
    hint = ""
    if update and getattr(update, "effective_chat", None):
        hint = f"chat_id={update.effective_chat.id}"
    await dr.notify_exception(err, where="handler PTB", update_hint=hint)


def _msg_date_utc(msg) -> datetime | None:
    """Fecha del mensaje en UTC (Telegram a veces la manda naive)."""
    if msg is None or getattr(msg, "date", None) is None:
        return None
    d = msg.date
    if d.tzinfo is None:
        return d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc)


def _is_offline_user_message(update: Update, boot_time: datetime | None) -> bool:
    """True si el update es un mensaje de usuario enviado antes de que el bot arrancara."""
    if boot_time is None or update.callback_query is not None:
        return False
    msg = update.effective_message
    msg_date = _msg_date_utc(msg)
    if msg_date is None:
        return False
    # Solo mensajes "de usuario" (texto, foto, ubicación, forward, comandos).
    if not (update.message or update.edited_message or update.channel_post):
        return False
    return msg_date < boot_time


async def _catchup_after(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Grupo 1: corre después de los handlers normales.
    - Marca cada mensaje atrasado con «✓ recibido (offline)».
    - Cuenta updates pendientes y avisa cuando terminó el catch-up.
    """
    bd = context.bot_data
    boot = bd.get("boot_time")

    if _is_offline_user_message(update, boot):
        msg = update.effective_message
        try:
            await msg.reply_text("✓ recibido (offline)")
        except Exception as e:
            logger.warning("catchup: no pude marcar mensaje offline (%s)", e)

    if not bd.get("catchup_active"):
        return

    rem = bd.get("catchup_remaining")
    if not isinstance(rem, int) or rem <= 0:
        bd["catchup_active"] = False
        return

    rem -= 1
    bd["catchup_remaining"] = rem
    print(f"[bot] Catch-up: quedan {rem} update(s)…", flush=True)

    if rem > 0:
        return

    bd["catchup_active"] = False
    print("[bot] Catch-up terminado.", flush=True)
    chat_id = bd.get("chat_id")
    if not chat_id:
        return
    try:
        await context.bot.send_message(chat_id, "Listo. Ya estoy al día.")
    except Exception as e:
        logger.warning("catchup: no pude avisar fin de cola (%s)", e)


async def _post_init(application) -> None:
    dr.install(application)

    boot = datetime.now(timezone.utc)
    application.bot_data["boot_time"] = boot

    pending = 0
    try:
        info = await application.bot.get_webhook_info()
        pending = int(info.pending_update_count or 0)
    except Exception as e:
        print(f"[bot] Catch-up: no se pudo leer pending_update_count ({e})", flush=True)

    application.bot_data["catchup_remaining"] = pending
    application.bot_data["catchup_active"] = pending > 0

    if pending <= 0:
        print("[bot] Catch-up: cola vacía al arrancar (drop_pending_updates=False).", flush=True)
        return

    print(
        f"[bot] Catch-up: {pending} update(s) pendientes en cola de Telegram "
        "(se procesan uno a uno; no se descartan).",
        flush=True,
    )
    chat_id = application.bot_data.get("chat_id")
    if not chat_id:
        print(
            "[bot] Catch-up: hay pendientes pero no hay chat_id guardado; "
            "no puedo avisar «Volví».",
            flush=True,
        )
        return
    try:
        await application.bot.send_message(
            chat_id,
            f"Volví. Procesando {pending} mensaje(s) pendiente(s)…",
        )
    except Exception as e:
        print(f"[bot] Catch-up: no pude avisar al chat ({e})", flush=True)


async def _dispatch_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    data  = query.data or ""

    if await _handle_llm_callback(update, context, data):
        return
    if await _handle_boveda_callback(update, context, data):
        return
    if await fh.handle_finanzas_callback(update, context, data):
        await query.answer()
        return
    await ah.handle_callback(update, context)


# ──────────────────────────────────────────────────────────────
# Arranque
# ──────────────────────────────────────────────────────────────

def main():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stdout,
        force=True,
    )
    print("[bot] Iniciando bot SGR…", flush=True)

    # Riesgo 1 de Cerebro/decisiones/2026-09-11-share-smb-boveda-homelab.md -- antes de
    # cualquier otra cosa, ver docstring de app/vault/guard.py.
    ensure_vault_mounted(VAULT_ROOT, label="VAULT_ROOT")

    if not TOKEN:
        raise SystemExit("Definí TELEGRAM_BOT_TOKEN en el entorno.")

    jh.jarvis_init()

    api_ok, cat_ok = _healthcheck()
    if not cat_ok:
        print("[bot] ⚠ Bóveda: /categorias no responde al arrancar. Verificá el backend.")

    if llm_client.is_available():
        print(f"[bot] Ollama OK ({llm_client.OLLAMA_BASE_URL}, modelo {llm_client.MODEL_CLASSIFY})")
        if llm_client.warmup():
            print(f"[bot] Modelo precargado (timeout inferencia {llm_client.TIMEOUT}s)")
        else:
            print(
                f"[bot] ⚠ Warmup Ollama falló — la primera clasificación puede tardar "
                f">{llm_client.TIMEOUT}s y caer a Bóveda. Subí OLLAMA_TIMEOUT / OLLAMA_WARMUP_TIMEOUT."
            )
    else:
        print(
            f"[bot] ⚠ Ollama NO disponible en {llm_client.OLLAMA_BASE_URL}. "
            "Texto libre sin prefijos cae a Bóveda. "
            "Homelab: OLLAMA_BASE_URL=http://192.168.137.1:11434 y Ollama en Windows escuchando en 0.0.0.0."
        )

    _log_telegram_connectivity()

    app = (
        ApplicationBuilder()
        .token(TOKEN)
        .request(_build_telegram_request())
        .post_init(_post_init)
        .build()
    )
    app.bot_data["api_base"] = API_BASE
    app.add_error_handler(_global_error_handler)

    # Cargar chat_id guardado
    saved_chat_id = _load_chat_id()
    if saved_chat_id:
        app.bot_data["chat_id"] = saved_chat_id
        print(f"[bot] chat_id cargado: {saved_chat_id}")

    # ── Comandos Jarvis ───────────────────────────────────────
    app.add_handler(CommandHandler("j",  jh.cmd_j))
    app.add_handler(CommandHandler("jq", jh.cmd_jq))
    app.add_handler(CommandHandler("jdebug",    jh.cmd_jdebug))
    app.add_handler(CommandHandler("jdebugon",  jh.cmd_jdebugon))
    app.add_handler(CommandHandler("jdebugoff", jh.cmd_jdebugoff))

    # ── Comandos generales ────────────────────────────────────
    app.add_handler(CommandHandler(["start", "help"], cmd_help))
    app.add_handler(CommandHandler("cancel",  cmd_cancel))
    app.add_handler(CommandHandler("dev",     cmd_dev))
    app.add_handler(CommandHandler("rapido",  cmd_rapido))
    app.add_handler(CommandHandler("ultimas", cmd_ultimas))
    app.add_handler(CommandHandler("buscar",   cmd_buscar))
    app.add_handler(CommandHandler("pregunta", cmd_pregunta))

    # ── Comandos Agenda ───────────────────────────────────────
    app.add_handler(CommandHandler("hoy",        ah.cmd_hoy))
    app.add_handler(CommandHandler("dia",        ah.cmd_dia))
    app.add_handler(CommandHandler("planificar", ah.cmd_planificar))
    app.add_handler(CommandHandler("asignar",    ah.cmd_asignar))
    app.add_handler(CommandHandler("tarea",      ah.cmd_tarea))
    app.add_handler(CommandHandler("evento",     ah.cmd_evento))
    app.add_handler(CommandHandler("semana",     ah.cmd_semana))
    app.add_handler(CommandHandler("pendientes", ah.cmd_pendientes))
    app.add_handler(CommandHandler("bloquear",   ah.cmd_bloquear))
    app.add_handler(CommandHandler("revision",   ah.cmd_revision))
    app.add_handler(CommandHandler("checkin",    ah.cmd_checkin))

    # ── Comandos Finanzas ─────────────────────────────────────
    app.add_handler(CommandHandler("mov",      fh.cmd_mov))
    app.add_handler(CommandHandler("saldo",    fh.cmd_saldo))
    app.add_handler(CommandHandler("mes",      fh.cmd_mes))
    app.add_handler(CommandHandler("ahorro",   fh.cmd_ahorro))
    app.add_handler(CommandHandler("ultimo",   fh.cmd_ultimo))
    app.add_handler(CommandHandler("dolar",    fh.cmd_dolar))
    app.add_handler(CommandHandler("objetivo", fh.cmd_objetivo))

    # ── Comandos Hábitos ──────────────────────────────────────
    app.add_handler(CommandHandler("habitos",  ah.cmd_habitos))
    app.add_handler(CommandHandler("hecho",    ah.cmd_hecho))
    app.add_handler(CommandHandler("ayer",     ah.cmd_ayer))
    app.add_handler(CommandHandler("racha",    ah.cmd_racha))
    app.add_handler(CommandHandler("nota",     ah.cmd_nota))

    # ── Comandos Notificaciones ───────────────────────────────
    app.add_handler(CommandHandler("notif",          ah.cmd_notif))
    app.add_handler(CommandHandler("notif_habitos",  ah.cmd_notif_habitos))
    app.add_handler(CommandHandler("notif_finanzas", ah.cmd_notif_finanzas))

    # ── Callbacks de botones inline ───────────────────────────
    app.add_handler(CallbackQueryHandler(_dispatch_callback))

    # ── Mensajes (texto, foto, ubicación, forwards) ───────────
    # Forward handler must come before generic text to avoid double handling
    app.add_handler(MessageHandler(
        filters.FORWARDED & (filters.TEXT | filters.CAPTION),
        handle_forward,
    ))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    app.add_handler(MessageHandler(filters.PHOTO, handle_photo))
    app.add_handler(MessageHandler(filters.LOCATION, handle_location))

    # Catch-up: marca mensajes offline y cierra el aviso «Listo» (después de handlers)
    app.add_handler(TypeHandler(Update, _catchup_after), group=1)

    # ── Check-in nocturno (hora configurable) ────────────────
    if app.job_queue:
        _ci_h, _ci_m = ah._load_checkin_time()
        app.job_queue.run_daily(
            ah.check_in_noche,
            time=datetime_time(_ci_h, _ci_m, 0),
            name="check_in_noche",
        )
        print(f"[bot] Check-in nocturno programado para las {_ci_h:02d}:{_ci_m:02d}")

        # ── Resumen semanal de finanzas — lunes 9:00 ─────────
        app.job_queue.run_daily(
            fh.resumen_semanal_finanzas,
            time=datetime_time(9, 0, 0),
            name="resumen_semanal_finanzas",
        )
        print("[bot] Resumen semanal de finanzas programado para lunes 09:00")

    print(
        f"[bot] Iniciando polling (bootstrap_retries={TELEGRAM_BOOTSTRAP_RETRIES}, "
        f"connect_timeout={TELEGRAM_CONNECT_TIMEOUT}s, drop_pending_updates=False)…"
    )
    # False explícito: al volver, Telegram entrega la cola (~24h) en orden.
    app.run_polling(
        bootstrap_retries=TELEGRAM_BOOTSTRAP_RETRIES,
        drop_pending_updates=False,
    )


if __name__ == "__main__":
    main()
