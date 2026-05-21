from dotenv import load_dotenv
load_dotenv()

import json
import os
from datetime import time as datetime_time
from pathlib import Path

import requests
from telegram import Update
from telegram.ext import (
    ApplicationBuilder,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

import agenda_handlers as ah


TOKEN    = os.environ.get("TELEGRAM_BOT_TOKEN", "")
API_BASE = os.getenv("API_BASE_URL", "http://127.0.0.1:8000")

# Archivo local para persistir el chat_id entre reinicios
_CHAT_ID_FILE = Path(__file__).parent / "chat_id.json"

STEP_NONE              = None
STEP_PHOTO_TITLE       = "photo_title"
STEP_CHOOSE_CATEGORY   = "choose_category"
STEP_NEW_CATEGORY_NAME = "new_category_name"


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
# Healthcheck
# ──────────────────────────────────────────────────────────────

def _healthcheck():
    try:
        r = requests.get(f"{API_BASE}/habitos", timeout=10)
        r.raise_for_status()
        print(f"[bot] Healthcheck OK — API en {API_BASE}")
        return True
    except Exception as e:
        print(f"[bot] ADVERTENCIA: API no responde ({e}). Reintentando al recibir mensajes.")
        return False


# ──────────────────────────────────────────────────────────────
# Bóveda — helpers de API
# ──────────────────────────────────────────────────────────────

def _get_categories():
    r = requests.get(f"{API_BASE}/categorias", timeout=30)
    r.raise_for_status()
    return r.json()


def _post_categoria(nombre: str):
    return requests.post(
        f"{API_BASE}/categorias",
        json={"nombre": nombre},
        timeout=30,
    )


def _post_hoja(contenido: str, categoria_id: int, tipo: str = "texto", apuntes: str = None):
    body = {"contenido": contenido, "categoria_id": categoria_id, "tipo": tipo}
    if apuntes:
        body["apuntes"] = apuntes
    return requests.post(f"{API_BASE}/hojas", json=body, timeout=30)


def _upload_photo(photo_bytes: bytes, filename: str = "photo.jpg") -> str:
    r = requests.post(
        f"{API_BASE}/upload",
        files={"file": (filename, photo_bytes, "image/jpeg")},
        timeout=60,
    )
    r.raise_for_status()
    return r.json()["url"]


def _format_category_menu(categorias):
    lines = ["Elegí la categoría (respondé con el número):"]
    for i, c in enumerate(categorias, start=1):
        lines.append(f"{i}. {c['nombre']}")
    n_create = len(categorias) + 1
    lines.append(f"{n_create}. Crear categoría")
    return "\n".join(lines), n_create


async def _save_draft(update: Update, ud: dict) -> bool:
    draft   = ud.get("draft", "")
    tipo    = ud.get("tipo", "texto")
    apuntes = ud.get("apuntes")
    cat     = ud.get("_chosen_cat")
    r = _post_hoja(draft, cat["id"], tipo=tipo, apuntes=apuntes)
    if r.status_code != 200:
        try:
            detail = r.json().get("detail", r.text)
        except Exception:
            detail = r.text
        await update.message.reply_text(f"No se pudo guardar: {detail}")
        return False
    await update.message.reply_text(f"Guardado en [{cat['nombre']}] ✓")
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


# ──────────────────────────────────────────────────────────────
# Handler principal de texto
# ──────────────────────────────────────────────────────────────

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not update.message or not update.message.text:
        return

    _register_chat_id(context.bot_data, update.effective_chat.id)

    texto = update.message.text.strip()
    ud    = context.user_data
    step  = ud.get("step")

    # ── Pasos de Agenda tienen prioridad ─────────────────────
    if await ah.handle_agenda_step(update, context, texto):
        return

    # ── Quick capture por prefijo (t: / e:) ──────────────────
    if step is None:
        if await ah.handle_quick_capture(update, context, texto):
            return

    # ── Photo title ───────────────────────────────────────────
    if step == STEP_PHOTO_TITLE:
        if not texto:
            await update.message.reply_text("El título no puede estar vacío.")
            return
        photo_url = ud.get("photo_url", "")
        full_url  = f"{API_BASE}{photo_url}" if photo_url.startswith("/") else photo_url
        ud["draft"]   = texto
        ud["apuntes"] = f'<img src="{full_url}" alt="{texto}" style="max-width:100%;border-radius:8px;margin-top:8px;">'
        try:
            categorias = _get_categories()
        except Exception as e:
            await update.message.reply_text(f"No pude cargar categorías: {e}")
            return
        ud["categorias_cache"] = categorias
        ud["step"] = STEP_CHOOSE_CATEGORY
        menu, _ = _format_category_menu(categorias)
        await update.message.reply_text(menu)
        return

    # ── Crear categoría nueva ─────────────────────────────────
    if step == STEP_NEW_CATEGORY_NAME:
        if not texto:
            await update.message.reply_text("El nombre no puede estar vacío.")
            return
        r = _post_categoria(texto)
        if r.status_code != 200:
            try:
                detail = r.json().get("detail", r.text)
            except Exception:
                detail = r.text
            await update.message.reply_text(f"No se pudo crear la categoría: {detail}")
            return
        data = r.json()
        ud["_chosen_cat"] = {"id": data["id"], "nombre": data["nombre"]}
        await _save_draft(update, ud)
        ud.clear()
        return

    # ── Elegir categoría ──────────────────────────────────────
    if step == STEP_CHOOSE_CATEGORY:
        if not texto.isdigit():
            await update.message.reply_text("Respondé solo con el número de la opción.")
            return
        choice     = int(texto)
        categorias = ud.get("categorias_cache") or _get_categories()
        n_create   = len(categorias) + 1
        if choice < 1 or choice > n_create:
            await update.message.reply_text("Número fuera de rango. Probá de nuevo.")
            return
        if choice == n_create:
            ud["step"] = STEP_NEW_CATEGORY_NAME
            await update.message.reply_text("Escribí el nombre de la nueva categoría:")
            return
        cat = categorias[choice - 1]
        ud["_chosen_cat"] = cat
        await _save_draft(update, ud)
        ud.clear()
        return

    # ── Nuevo texto → Bóveda ──────────────────────────────────
    if not texto:
        await update.message.reply_text("Enviá un texto para guardar.")
        return
    try:
        categorias = _get_categories()
    except Exception as e:
        await update.message.reply_text(f"No pude cargar categorías: {e}")
        return
    ud["draft"]            = texto
    ud["tipo"]             = "texto"
    ud["categorias_cache"] = categorias
    ud["step"]             = STEP_CHOOSE_CATEGORY
    menu, _ = _format_category_menu(categorias)
    await update.message.reply_text(menu)


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
    await update.message.reply_text("Imagen subida. ¿Qué título le ponés?")


# ──────────────────────────────────────────────────────────────
# Arranque
# ──────────────────────────────────────────────────────────────

def main():
    if not TOKEN:
        raise SystemExit("Definí TELEGRAM_BOT_TOKEN en el entorno.")

    _healthcheck()

    app = ApplicationBuilder().token(TOKEN).build()
    app.bot_data["api_base"] = API_BASE

    # Cargar chat_id guardado
    saved_chat_id = _load_chat_id()
    if saved_chat_id:
        app.bot_data["chat_id"] = saved_chat_id
        print(f"[bot] chat_id cargado: {saved_chat_id}")

    # ── Comandos generales ────────────────────────────────────
    app.add_handler(CommandHandler(["start", "help"], cmd_help))
    app.add_handler(CommandHandler("cancel", cmd_cancel))

    # ── Comandos Agenda ───────────────────────────────────────
    app.add_handler(CommandHandler("hoy",       ah.cmd_hoy))
    app.add_handler(CommandHandler("dia",       ah.cmd_dia))
    app.add_handler(CommandHandler("tarea",     ah.cmd_tarea))
    app.add_handler(CommandHandler("evento",    ah.cmd_evento))
    app.add_handler(CommandHandler("semana",    ah.cmd_semana))
    app.add_handler(CommandHandler("pendientes", ah.cmd_pendientes))
    app.add_handler(CommandHandler("bloquear",  ah.cmd_bloquear))
    app.add_handler(CommandHandler("revision",  ah.cmd_revision))

    # ── Comandos Hábitos ──────────────────────────────────────
    app.add_handler(CommandHandler("habitos",   ah.cmd_habitos))
    app.add_handler(CommandHandler("hecho",     ah.cmd_hecho))
    app.add_handler(CommandHandler("ayer",      ah.cmd_ayer))
    app.add_handler(CommandHandler("racha",     ah.cmd_racha))
    app.add_handler(CommandHandler("nota",      ah.cmd_nota))

    # ── Callbacks de botones inline ───────────────────────────
    app.add_handler(CallbackQueryHandler(ah.handle_callback))

    # ── Texto libre y fotos → Bóveda ─────────────────────────
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    app.add_handler(MessageHandler(filters.PHOTO, handle_photo))

    # ── Check-in nocturno a las 21:00 ────────────────────────
    if app.job_queue:
        app.job_queue.run_daily(
            ah.check_in_noche,
            time=datetime_time(21, 0, 0),
            name="check_in_noche",
        )
        print("[bot] Check-in nocturno programado para las 21:00")

    app.run_polling()


if __name__ == "__main__":
    main()
