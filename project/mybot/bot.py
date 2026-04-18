from dotenv import load_dotenv
load_dotenv()

import os

import requests
from telegram import Update
from telegram.ext import ApplicationBuilder, ContextTypes, MessageHandler, filters

TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
API_BASE = os.environ.get("API_BASE_URL", "http://127.0.0.1:8000")

STEP_NONE = None
STEP_PHOTO_TITLE    = "photo_title"
STEP_CHOOSE_CATEGORY = "choose_category"
STEP_NEW_CATEGORY_NAME = "new_category_name"


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
    """Upload image bytes to the API and return the resulting URL."""
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
    """Save the current draft hoja. Returns True on success."""
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


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not update.message or not update.message.text:
        return

    texto = update.message.text.strip()
    ud    = context.user_data
    step  = ud.get("step")

    # ── Photo title ───────────────────────────────────────────────────────────
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

    # ── Creating a new category ───────────────────────────────────────────────
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

    # ── Choosing a category ───────────────────────────────────────────────────
    if step == STEP_CHOOSE_CATEGORY:
        if not texto.isdigit():
            await update.message.reply_text("Respondé solo con el número de la opción.")
            return
        choice    = int(texto)
        categorias = ud.get("categorias_cache") or _get_categories()
        n_create  = len(categorias) + 1
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

    # ── New text draft ────────────────────────────────────────────────────────
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

    ud   = context.user_data
    step = ud.get("step")

    # If mid-conversation, reject so state doesn't get confused
    if step is not None:
        await update.message.reply_text(
            "Tenés una acción pendiente. Completala primero o enviá un texto para cancelar."
        )
        return

    await update.message.reply_text("Subiendo imagen…")

    # Download the largest available size
    photo_obj = update.message.photo[-1]
    tg_file   = await context.bot.get_file(photo_obj.file_id)
    photo_bytes = await tg_file.download_as_bytearray()

    # Upload to the API
    try:
        url = _upload_photo(bytes(photo_bytes))
    except Exception as e:
        await update.message.reply_text(f"No se pudo subir la imagen: {e}")
        return

    # Store photo URL and ask for a title
    ud["photo_url"] = url
    ud["tipo"]      = "foto"
    ud["step"]      = STEP_PHOTO_TITLE
    await update.message.reply_text("Imagen subida. ¿Qué título le ponés?")


def main():
    if not TOKEN:
        raise SystemExit("Definí TELEGRAM_BOT_TOKEN en el entorno.")
    app = ApplicationBuilder().token(TOKEN).build()
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    app.add_handler(MessageHandler(filters.PHOTO, handle_photo))
    app.run_polling()


if __name__ == "__main__":
    main()
