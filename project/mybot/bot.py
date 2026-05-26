from dotenv import load_dotenv
load_dotenv()

import json
import os
import re
import time as _time
from datetime import time as datetime_time
from pathlib import Path

import requests
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

import agenda_handlers as ah
import finanzas_handlers as fh


TOKEN    = os.environ.get("TELEGRAM_BOT_TOKEN", "")
API_BASE = os.getenv("API_BASE_URL", "http://127.0.0.1:8000")

# Archivo local para persistir el chat_id entre reinicios
_CHAT_ID_FILE  = Path(__file__).parent / "chat_id.json"
_RAPIDO_FILE   = Path(__file__).parent / "rapido.json"

STEP_NONE              = None
STEP_PHOTO_TITLE       = "photo_title"
STEP_CHOOSE_CATEGORY   = "choose_category"   # legacy; not used with inline keyboards
STEP_NEW_CATEGORY_NAME = "new_category_name"

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


# ──────────────────────────────────────────────────────────────
# Healthcheck
# ──────────────────────────────────────────────────────────────

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


def _detect_tipo(texto: str) -> str:
    """Returns 'link' if texto contains a URL, else 'texto'."""
    return "link" if URL_REGEX.search(texto) else "texto"


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


async def _save_draft(ud: dict, bot_data: dict, cat: dict, message) -> bool:
    draft   = ud.get("draft", "")
    tipo    = ud.get("tipo", "texto")
    apuntes = ud.get("apuntes")
    lugar   = ud.get("lugar")
    lat     = ud.get("latitud")
    lon     = ud.get("longitud")

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

    ud   = context.user_data
    step = ud.get("step")

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
        ok = await _save_draft(ud, context.bot_data, cat, msg)
        ud.clear()
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
        ud.clear()
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

    ud["step"]           = "choose_category_inline"
    ud["categorias_all"] = cats
    ud["cat_parent_id"]  = parent_id

    kb = _build_category_keyboard(cats, parent_id=parent_id, back_btn=(parent_id is not None))
    text = "¿A qué categoría lo guardamos?" if parent_id is None else "Elegí la subcategoría:"

    if edit_message:
        await edit_message.edit_text(text, reply_markup=kb)
    else:
        await message.reply_text(text, reply_markup=kb)


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
        ud.clear()
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
    cats  = ud.get("categorias_all") or []

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
            ud.clear()
            return True

        await query.edit_message_text(f"Guardando en [{cat['nombre']}]…")
        ok = await _save_draft(ud, context.bot_data, cat, query.message)
        ud.clear()
        return True

    # ── Go back to root level ──────────────────────────────
    if data == "bov_back":
        ud["cat_parent_id"] = None
        cats_all = ud.get("categorias_all") or _get_categories(context.bot_data)
        kb   = _build_category_keyboard(cats_all, parent_id=None, back_btn=False)
        await query.edit_message_text("¿A qué categoría lo guardamos?", reply_markup=kb)
        return True

    # ── Create new category ─────────────────────────────────
    if data == "bov_new_cat":
        parent_id = ud.get("cat_parent_id")
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
# Dispatcher de callbacks (Bóveda → Finanzas → Agenda)
# ──────────────────────────────────────────────────────────────

async def _dispatch_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    data  = query.data or ""

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
    if not TOKEN:
        raise SystemExit("Definí TELEGRAM_BOT_TOKEN en el entorno.")

    api_ok, cat_ok = _healthcheck()
    if not cat_ok:
        print("[bot] ⚠ Bóveda: /categorias no responde al arrancar. Verificá el backend.")

    app = ApplicationBuilder().token(TOKEN).build()
    app.bot_data["api_base"] = API_BASE

    # Cargar chat_id guardado
    saved_chat_id = _load_chat_id()
    if saved_chat_id:
        app.bot_data["chat_id"] = saved_chat_id
        print(f"[bot] chat_id cargado: {saved_chat_id}")

    # ── Comandos generales ────────────────────────────────────
    app.add_handler(CommandHandler(["start", "help"], cmd_help))
    app.add_handler(CommandHandler("cancel",  cmd_cancel))
    app.add_handler(CommandHandler("rapido",  cmd_rapido))
    app.add_handler(CommandHandler("ultimas", cmd_ultimas))
    app.add_handler(CommandHandler("buscar",  cmd_buscar))

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

    # ── Check-in nocturno (hora configurable) ────────────────
    if app.job_queue:
        _ci_h, _ci_m = ah._load_checkin_time()
        app.job_queue.run_daily(
            ah.check_in_noche,
            time=datetime_time(_ci_h, _ci_m, 0),
            name="check_in_noche",
        )
        print(f"[bot] Check-in nocturno programado para las {_ci_h:02d}:{_ci_m:02d}")

    app.run_polling()


if __name__ == "__main__":
    main()
