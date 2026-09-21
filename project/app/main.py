# entrypoints (FastAPI)

import os
import re
import shutil
import sqlite3
import tempfile
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from bs4 import BeautifulSoup
from typing import Any, List, Optional

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, field_validator, model_validator

from app.config import DEBUG, DB_PATH, VAULT_ROOT
from app.paths import data_root, dist_directory, uploads_directory
from app.vault.guard import ensure_vault_mounted
from app.db.crud import (
    actualizar_apuntes,
    actualizar_icono,
    actualizar_hoja,
    actualizar_link_preview,
    actualizar_categoria,
    buscar_hojas,
    categoria_existe,
    crear_categoria,
    crear_hoja,
    eliminar_categoria,
    eliminar_hoja,
    obtener_categorias,
    obtener_hoja_por_id,
    obtener_hojas,
    obtener_hojas_recientes,
    # Finanzas
    fin_obtener_cuentas,
    fin_crear_cuenta,
    fin_editar_cuenta,
    fin_recalcular_saldos_cuentas,
    fin_eliminar_cuenta,
    fin_buscar_cuenta_por_nombre,
    fin_obtener_categorias,
    fin_crear_categoria,
    fin_eliminar_categoria,
    fin_contar_movimientos_categoria,
    FIN_CATEGORIAS_RESERVADAS,
    fin_buscar_categoria_por_nombre,
    fin_obtener_movimientos,
    fin_crear_movimiento,
    fin_eliminar_movimiento,
    fin_obtener_config,
    fin_actualizar_config,
    fin_obtener_notas,
    fin_crear_nota,
    fin_eliminar_nota,
    fin_obtener_emergencia_saldo,
    # Instrumentos
    fin_obtener_instrumentos,
    fin_crear_instrumento,
    fin_actualizar_instrumento,
    fin_eliminar_instrumento,
    # Objetivos
    fin_obtener_objetivos,
    fin_crear_objetivo,
    fin_actualizar_objetivo,
    fin_eliminar_objetivo,
    # FIRE filas
    fin_obtener_fire_filas,
    fin_upsert_fire_fila,
    # Movimiento PATCH
    fin_actualizar_movimiento,
    # Inflación
    fin_obtener_inflacion,
    fin_upsert_inflacion,
    # Nuevas
    fin_actualizar_categoria,
    fin_obtener_movimientos_duplicados,
    fin_export_csv_data,
    fin_import_movimientos,
    fin_bulk_update_movimientos,
    fin_bulk_delete_movimientos,
    fin_obtener_transacciones_instrumento,
    fin_obtener_transacciones_global,
    fin_crear_transaccion_instrumento,
    fin_actualizar_transaccion_instrumento,
    fin_crear_transaccion_unificada,
    fin_eliminar_transaccion_instrumento,
    fin_instrumento_tiene_transacciones,
    # Agenda
    agenda_obtener_calendarios,
    agenda_crear_calendario,
    agenda_actualizar_calendario,
    agenda_eliminar_calendario,
    agenda_obtener_eventos,
    agenda_crear_evento,
    agenda_actualizar_evento,
    agenda_eliminar_evento,
    agenda_obtener_listas,
    agenda_crear_lista,
    agenda_actualizar_lista,
    agenda_eliminar_lista,
    agenda_obtener_tareas,
    agenda_crear_tarea,
    agenda_actualizar_tarea,
    agenda_eliminar_tarea,
    agenda_obtener_horario_facultad,
    agenda_crear_horario_facultad,
    agenda_actualizar_horario_facultad,
    agenda_eliminar_horario_facultad,
    agenda_crear_horario_facultad_excepcion,
    agenda_resumen_semana,
    agenda_buscar,
    # Hábitos
    habitos_obtener,
    habitos_crear,
    habitos_actualizar,
    habitos_eliminar,
    habitos_pendientes_hoy,
    habitos_stats,
    habitos_registros_obtener,
    habitos_registros_upsert,
    habitos_registros_batch_upsert,
    habitos_registros_eliminar,
)
from app.db.database import init_db
from app import semantic
from app.models.categoria import CategoriaCreate, CategoriaPatch
from app.models.hoja import HojaCreate, HojaPatch

# Integración Jarvis — graceful si el paquete no está instalado
try:
    from jarvis.api.router import router as _jarvis_router
    from jarvis.db.database import init_db as _jarvis_init_db
    _JARVIS_AVAILABLE = True
except ImportError:
    _JARVIS_AVAILABLE = False


# --- Pydantic models for Finanzas ---

class FinCuentaCreate(BaseModel):
    nombre: str
    tipo: str = "wallet"
    color: Optional[str] = None
    initials: Optional[str] = None
    saldo_ars: float = 0
    saldo_usd: float = 0


class FinCuentaSaldoUpdate(BaseModel):
    saldo_ars: float = 0
    saldo_usd: float = 0


class FinCuentaUpdate(BaseModel):
    nombre: str
    tipo: str = "wallet"
    color: Optional[str] = None
    initials: Optional[str] = None


class FinCategoriaCreate(BaseModel):
    nombre: str
    color: Optional[str] = None
    tipo: str = "expense"


class FinMovimientoCreate(BaseModel):
    tipo: str
    monto: float
    moneda: str = "ARS"
    fecha: str
    descripcion: str = ""
    icono: Optional[str] = None
    cuenta_id: Optional[Any] = None
    cuenta_nombre: Optional[str] = None
    categoria_nombre: Optional[str] = None
    cuotas: Optional[int] = None
    nota: Optional[str] = None
    audit: Optional[bool] = False
    # Legacy fields sent by the frontend — ignored server-side
    type: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    datetime: Optional[str] = None
    date: Optional[str] = None
    desc: Optional[str] = None
    cat: Optional[str] = None
    method: Optional[str] = None
    cuentaId: Optional[Any] = None
    categoria_id: Optional[Any] = None


class FinNotaCreate(BaseModel):
    contenido: str


class FinMovimientoPatch(BaseModel):
    fecha: Optional[str] = None
    monto: Optional[float] = None
    tipo: Optional[str] = None
    descripcion: Optional[str] = None
    cuenta_nombre: Optional[str] = None
    cuenta_id: Optional[Any] = None
    cuotas: Optional[Any] = None
    categoria_nombre: Optional[str] = None
    categoria_id: Optional[Any] = None
    moneda: Optional[str] = None
    nota: Optional[str] = None
    audit: Optional[bool] = None


class FinInstrumentoCreate(BaseModel):
    tipo: str
    nombre: str
    ticker: Optional[str] = None
    sociedad: Optional[str] = None
    cantidad: float = 0
    costo_usd: Optional[float] = None
    tipo_cambio: Optional[float] = None
    precio_actual: Optional[float] = None
    entidad: Optional[str] = None
    capital_ars: Optional[float] = None
    tna: Optional[float] = None
    fecha_inicio: Optional[str] = None
    fecha_vencimiento: Optional[str] = None


class FinInstrumentoPatch(BaseModel):
    ticker: Optional[str] = None
    sociedad: Optional[str] = None
    nombre: Optional[str] = None
    cantidad: Optional[float] = None
    costo_usd: Optional[float] = None
    tipo_cambio: Optional[float] = None
    precio_actual: Optional[float] = None
    entidad: Optional[str] = None
    capital_ars: Optional[float] = None
    tna: Optional[float] = None
    fecha_inicio: Optional[str] = None
    fecha_vencimiento: Optional[str] = None


class FinObjetivoCreate(BaseModel):
    nombre: str
    meta: float
    moneda: str = "ARS"
    fecha_limite: Optional[str] = None
    cuota_mensual: Optional[float] = None


class FinObjetivoPatch(BaseModel):
    nombre: Optional[str] = None
    meta: Optional[float] = None
    moneda: Optional[str] = None
    fecha_limite: Optional[str] = None
    cuota_mensual: Optional[float] = None


class FinFireFilaUpsert(BaseModel):
    ahorrado_override: Optional[float] = None


class FinInflacionUpsert(BaseModel):
    inflacion: Optional[float] = None


class FinCategoriaPatch(BaseModel):
    nombre: Optional[str] = None
    color:  Optional[str] = None
    tipo:   Optional[str] = None


class FinMovimientoBulkUpdate(BaseModel):
    updates: List[dict]


class FinMovimientoBulkDelete(BaseModel):
    ids: List[int]


class FinTransaccionCreate(BaseModel):
    tipo:        str
    fecha:       str
    cantidad:    float
    precio:      float
    nota:        Optional[str] = None
    moneda:      str = "ARS"
    tipo_cambio: Optional[float] = None


class FinTransaccionCreateUnified(BaseModel):
    tipo:             str
    instrumento_tipo: str
    ticker:           str
    nombre:           str
    fecha:            str
    cantidad:         float
    precio:           float
    nota:             Optional[str] = None
    moneda:           str = "ARS"
    tipo_cambio:      Optional[float] = None


class FinTransaccionPatch(BaseModel):
    tipo:        Optional[str]   = None
    fecha:       Optional[str]   = None
    cantidad:    Optional[float] = None
    precio:      Optional[float] = None
    nota:        Optional[str]   = None
    moneda:      Optional[str]   = None
    tipo_cambio: Optional[float] = None


class FinImportRow(BaseModel):
    tipo:             str
    monto:            float
    fecha:            str
    descripcion:      str
    categoria_nombre: Optional[str] = None
    cuenta_nombre:    Optional[str] = None
    moneda:           str = "ARS"
    nota:             Optional[str] = None
    cuotas:           Optional[int] = None


class FinImportCSV(BaseModel):
    filas: List[FinImportRow]

DIST_DIR    = dist_directory()
UPLOADS_DIR = uploads_directory()

# index.html must not be cached long-term (Vite hashes change each build).
_INDEX_NO_CACHE = {"Cache-Control": "no-cache, no-store, must-revalidate"}
# Hashed bundles under /assets are immutable.
_ASSET_IMMUTABLE = {"Cache-Control": "public, max-age=31536000, immutable"}
# SW + manifest: revalidate so deploys can replace them.
_PWA_REVALIDATE = {"Cache-Control": "no-cache"}


def _dist_file(path: Path, media_type: str | None = None, headers: dict | None = None) -> FileResponse:
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Not Found")
    return FileResponse(str(path), media_type=media_type, headers=headers or {})


def _spa_index() -> FileResponse:
    return _dist_file(DIST_DIR / "index.html", media_type="text/html", headers=_INDEX_NO_CACHE)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Riesgo 1 de Cerebro/decisiones/2026-09-11-share-smb-boveda-homelab.md: primero
    # que cualquier otra cosa, antes de tocar app.db -- un mount CIFS caído bind-montea
    # una carpeta vacía sin error, así que sin este chequeo el backend arrancaría
    # silenciosamente contra un vault vacío.
    ensure_vault_mounted(VAULT_ROOT, label="VAULT_ROOT")
    init_db()
    # Backfill: indexar hojas que faltan en ChromaDB (best-effort, falla si Ollama no está)
    try:
        hojas  = obtener_hojas()
        count  = semantic.backfill_missing(hojas)
        if count:
            print(f"[semantic] {count} hojas indexadas al arrancar")
    except Exception as _exc:
        print(f"[semantic] backfill omitido: {_exc}")
    # Jarvis — inicializa jarvis.db si el paquete está instalado
    if _JARVIS_AVAILABLE:
        try:
            _jarvis_init_db()
            print("[jarvis] jarvis.db inicializada")
        except Exception as _exc:
            print(f"[jarvis] init_db omitida: {_exc}")
    yield


app = FastAPI(lifespan=lifespan)

# Orígenes de confianza del frontend -- una sola lista, reusada tanto por CORS
# como por la detección de origen (app vs telegram) de POST /hojas (Milestone 2).
FRONTEND_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]

# Allow Vite dev server to call the API during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Jarvis API — montada si el paquete está disponible
if _JARVIS_AVAILABLE:
    app.include_router(_jarvis_router, prefix="/jarvis")

# Serve built frontend (production)
if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

# Serve uploaded images
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

# Adjuntos del vault Bóveda (D:\Boveda\_adjuntos) -- fotos de hojas ya migradas
# al vault (Milestone 2); se crea si todavía no existe (primer arranque).
_ADJUNTOS_DIR = VAULT_ROOT / "_adjuntos"
_ADJUNTOS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/adjuntos", StaticFiles(directory=_ADJUNTOS_DIR), name="adjuntos")


# --- Frontend ---

@app.get("/", include_in_schema=False)
def read_root():
    if (DIST_DIR / "index.html").is_file():
        return _spa_index()
    return {"message": "Run 'npm run build' inside frontend/ to serve the UI here."}


@app.get("/index.html", include_in_schema=False)
def serve_index_html():
    """Workbox precache pide /index.html con Accept */* — no pasar por spa_fallback."""
    return _spa_index()


@app.get("/sw.js", include_in_schema=False)
def serve_sw_js():
    return _dist_file(DIST_DIR / "sw.js", media_type="application/javascript", headers=_PWA_REVALIDATE)


@app.get("/registerSW.js", include_in_schema=False)
def serve_register_sw_js():
    return _dist_file(
        DIST_DIR / "registerSW.js",
        media_type="application/javascript",
        headers=_PWA_REVALIDATE,
    )


@app.get("/manifest.webmanifest", include_in_schema=False)
def serve_webmanifest():
    return _dist_file(
        DIST_DIR / "manifest.webmanifest",
        media_type="application/manifest+json",
        headers=_PWA_REVALIDATE,
    )


@app.get("/workbox-{filename}", include_in_schema=False)
def serve_workbox_js(filename: str):
    if ".." in filename or "/" in filename:
        raise HTTPException(status_code=404, detail="Not Found")
    return _dist_file(
        DIST_DIR / f"workbox-{filename}",
        media_type="application/javascript",
        headers=_ASSET_IMMUTABLE,
    )


@app.get("/icon-192.png", include_in_schema=False)
def serve_icon_192():
    return _dist_file(DIST_DIR / "icon-192.png", media_type="image/png", headers=_ASSET_IMMUTABLE)


@app.get("/icon-512.png", include_in_schema=False)
def serve_icon_512():
    return _dist_file(DIST_DIR / "icon-512.png", media_type="image/png", headers=_ASSET_IMMUTABLE)


@app.get("/meta")
def api_meta():
    """Diagnóstico: qué SQLite usa esta instancia de la API (bot vs UI deben coincidir)."""
    from app.db.database import get_connection

    conn = get_connection()
    cur = conn.cursor()

    def _count(table: str) -> int:
        cur.execute(f"SELECT COUNT(*) FROM {table}")
        return int(cur.fetchone()[0])

    counts = {
        "hojas": _count("hojas"),
        "fin_movimientos": _count("fin_movimientos"),
        "fin_notas": _count("fin_notas"),
    }
    conn.close()
    return {
        "db_path": DB_PATH,
        "data_root": str(data_root()),
        "counts": counts,
    }


# --- Categorias ---

@app.get("/categorias")
def listar_categorias():
    return obtener_categorias()


@app.post("/categorias")
def crear_categoria_endpoint(body: CategoriaCreate):
    nombre = body.nombre.strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre no puede estar vacío")
    cid = crear_categoria(nombre, padre_id=body.padre_id, icono=body.icono, color=body.color)
    if cid is None:
        raise HTTPException(status_code=400, detail="Ya existe una categoría con ese nombre")
    created = next((c for c in obtener_categorias() if c["id"] == cid), None)
    if created:
        return created
    return {"id": cid, "nombre": nombre, "padre_id": body.padre_id, "icono": body.icono, "color": body.color}


@app.patch("/categorias/{categoria_id}")
def actualizar_categoria_endpoint(categoria_id: int, body: CategoriaPatch):
    campos = body.model_dump(exclude_unset=True)
    if "icono" in body.model_fields_set and body.icono is None:
        campos["icono"] = None
    result = actualizar_categoria(categoria_id, campos)
    if result is None:
        raise HTTPException(status_code=404, detail="Categoría no encontrada o nombre duplicado")
    return result


@app.delete("/categorias/{categoria_id}")
def eliminar_categoria_endpoint(categoria_id: int, forzar: bool = Query(False)):
    resultado = eliminar_categoria(categoria_id, forzar=forzar)
    if resultado == "no_encontrada":
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    if resultado == "estructural":
        raise HTTPException(
            status_code=409,
            detail="Carpeta estructural del árbol PARA -- no se puede eliminar."
        )
    if resultado == "tiene_hojas":
        raise HTTPException(
            status_code=409,
            detail="La categoría tiene hojas. Usá ?forzar=true para eliminar de todos modos."
        )
    return {"mensaje": "Categoría eliminada"}


# --- Hojas ---

def _detectar_origen(request: Request) -> str:
    """app | telegram, sin tocar el contrato de POST /hojas (ni bot.py ni el
    frontend mandan un campo explícito). Compara el header `Origin` contra la
    misma lista de orígenes de confianza que ya usa CORSMiddleware -- no una
    regla nueva implícita. Se agrega también el propio origen de la request
    (scheme://netloc) para no confundir con `telegram` al `.exe` empaquetado,
    donde frontend y API comparten origen fuera de los puertos de dev de Vite.
    python-requests (el bot) no manda `Origin`; el fetch del navegador sí."""
    origin = request.headers.get("origin")
    if not origin:
        return "telegram"
    self_origin = f"{request.url.scheme}://{request.url.netloc}"
    if origin in FRONTEND_ORIGINS or origin == self_origin:
        return "app"
    return "telegram"


@app.post("/hojas")
async def crear_hoja_endpoint(hoja: HojaCreate, background_tasks: BackgroundTasks, request: Request):
    if not hoja.contenido.strip():
        raise HTTPException(status_code=400, detail="El contenido no puede estar vacío")
    if not categoria_existe(hoja.categoria_id):
        raise HTTPException(status_code=400, detail="Categoría no encontrada")

    preview = None
    if hoja.tipo == "link":
        url_match = re.search(r"https?://\S+", hoja.contenido)
        if url_match:
            preview = await _fetch_link_preview(url_match.group(0))

    try:
        hid = crear_hoja(
            hoja.contenido,
            hoja.categoria_id,
            tipo=hoja.tipo,
            apuntes=hoja.apuntes,
            lugar=hoja.lugar,
            latitud=hoja.latitud,
            longitud=hoja.longitud,
            fecha_recordatorio=hoja.fecha_recordatorio,
            icono=hoja.icono,
            link_preview=preview,
            origen=_detectar_origen(request),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    # Indexar en background — no bloquea la respuesta
    cat = next((c["nombre"] for c in obtener_categorias() if c["id"] == hoja.categoria_id), "")
    background_tasks.add_task(semantic.index_hoja, hid, hoja.contenido, cat, hoja.tipo)
    return {"mensaje": "Hoja guardada", "id": hid, "link_preview": preview}


@app.post("/hojas/{hoja_id}/preview")
async def refrescar_preview(hoja_id: int):
    hoja = obtener_hoja_por_id(hoja_id)
    if hoja is None:
        raise HTTPException(status_code=404, detail="Hoja no encontrada")
    if hoja["tipo"] != "link":
        raise HTTPException(status_code=400, detail="La hoja no es un link")
    url_match = re.search(r"https?://\S+", hoja["contenido"] or "")
    if not url_match:
        raise HTTPException(status_code=400, detail="No se encontró URL en la hoja")
    preview = await _fetch_link_preview(url_match.group(0))
    actualizar_link_preview(hoja_id, preview)
    return {"link_preview": preview}


@app.get("/hojas/recientes")
def listar_hojas_recientes(limit: int = Query(20, ge=1, le=100)):
    return obtener_hojas_recientes(limit)


@app.get("/hojas/buscar-semantico")
def buscar_hojas_semantico(q: str = Query(..., min_length=1), top_k: int = Query(5, ge=1, le=20)):
    """
    Búsqueda semántica sobre hojas via embeddings + ChromaDB.
    Devuelve hits enriquecidos con los datos completos de la hoja desde SQLite.
    """
    hits = semantic.search_hojas(q, top_k=top_k)
    if not hits:
        return []
    resultados = []
    for hit in hits:
        hoja = obtener_hoja_por_id(hit["hoja_id"])
        if hoja:
            resultados.append({**hoja, "score": hit["score"]})
    return resultados


@app.post("/hojas/reindexar")
def reindexar_hojas(background_tasks: BackgroundTasks):
    """Dispara re-indexado completo de todas las hojas (best-effort, en background)."""
    hojas = obtener_hojas()
    background_tasks.add_task(_reindexar_todo, hojas)
    return {"mensaje": f"Reindexado iniciado para {len(hojas)} hojas"}


def _reindexar_todo(hojas: list):
    count = 0
    for h in hojas:
        ok = semantic.index_hoja(
            h["id"], h.get("contenido") or "",
            h.get("categoria_nombre") or "", h.get("tipo") or "texto",
        )
        if ok:
            count += 1
    print(f"[semantic] reindexar_todo: {count}/{len(hojas)} hojas indexadas")


@app.get("/hojas")
def listar_hojas(
    q:            Optional[str] = Query(None),
    tipo:         Optional[str] = Query(None),
    categoria_id: Optional[int] = Query(None),
):
    if q or tipo or categoria_id:
        return buscar_hojas(q=q, tipo=tipo, categoria_id=categoria_id)
    return obtener_hojas()


@app.get("/hojas/{hoja_id}")
def obtener_hoja(hoja_id: int):
    hoja = obtener_hoja_por_id(hoja_id)
    if hoja is None:
        raise HTTPException(status_code=404, detail="Hoja no encontrada")
    return hoja


@app.patch("/hojas/{hoja_id}")
def actualizar_hoja_endpoint(hoja_id: int, data: HojaPatch, background_tasks: BackgroundTasks):
    campos = {k: v for k, v in data.model_dump().items() if k in data.model_fields_set}
    # Delegate specific fields to legacy functions for backward compat, rest to generic
    if not campos:
        raise HTTPException(status_code=400, detail="Sin campos para actualizar")
    result = actualizar_hoja(hoja_id, campos)
    if result is None:
        raise HTTPException(status_code=404, detail="Hoja no encontrada")
    # Re-indexar con el contenido actualizado (fetch completo para obtener categoria)
    hoja = obtener_hoja_por_id(hoja_id)
    if hoja:
        background_tasks.add_task(
            semantic.index_hoja, hoja_id,
            hoja.get("contenido", ""),
            hoja.get("categoria_nombre", ""),
            hoja.get("tipo", "texto"),
        )
    return {"mensaje": "Hoja actualizada", "fecha_actualizado": result.get("fecha_actualizado")}


@app.delete("/hojas/{hoja_id}")
def eliminar_hoja_endpoint(hoja_id: int, background_tasks: BackgroundTasks):
    contenido = eliminar_hoja(hoja_id)
    if contenido is None:
        raise HTTPException(status_code=404, detail="Hoja no encontrada")
    # Delete orphan upload file if this was a foto hoja
    if contenido and contenido.startswith("/uploads/"):
        archivo = UPLOADS_DIR / Path(contenido).name
        if archivo.exists():
            archivo.unlink(missing_ok=True)
            if DEBUG:
                print(f"eliminar_hoja: archivo borrado {archivo}")
    background_tasks.add_task(semantic.delete_hoja, hoja_id)
    return {"mensaje": "Hoja eliminada"}


# --- File upload ---

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    ext = Path(file.filename).suffix if file.filename else ".jpg"
    if ext.lower() not in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"}:
        ext = ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    dest = UPLOADS_DIR / filename
    with dest.open("wb") as out:
        shutil.copyfileobj(file.file, out)
    if DEBUG:
        print(f"upload: saved {filename}")
    return {"url": f"/uploads/{filename}"}


# --- Link preview ---

async def _fetch_link_preview(url: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=6, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
        soup = BeautifulSoup(r.text, "html.parser")

        def meta(prop, name=None):
            tag = soup.find("meta", property=prop)
            if not tag and name:
                tag = soup.find("meta", attrs={"name": name})
            return tag["content"].strip() if tag and tag.get("content") else None

        title       = meta("og:title")       or (soup.title.string.strip() if soup.title else None)
        description = meta("og:description", "description")
        image       = meta("og:image")
        parsed      = httpx.URL(url)
        favicon     = f"{parsed.scheme}://{parsed.host}/favicon.ico"

        result = {"title": title, "description": description, "image": image, "favicon": favicon}
        if DEBUG:
            try:
                print(f"preview: {url} -> title={title}")
            except Exception:
                pass
        return result
    except Exception as e:
        if DEBUG:
            try:
                print(f"preview error: {e}")
            except Exception:
                pass
        return {"title": None, "description": None, "image": None, "favicon": None}


@app.get("/preview")
async def fetch_preview(url: str = Query(...)):
    return await _fetch_link_preview(url)


# ---------------------------------------------------------------------------
# Finanzas — Cuentas
# ---------------------------------------------------------------------------

@app.get("/fin/cuentas")
def listar_fin_cuentas():
    return fin_obtener_cuentas()


@app.post("/fin/cuentas")
def crear_fin_cuenta(body: FinCuentaCreate):
    cid = fin_crear_cuenta(
        body.nombre, body.tipo, body.color, body.initials,
        body.saldo_ars, body.saldo_usd,
    )
    cuenta = next((c for c in fin_obtener_cuentas() if c["id"] == cid), None)
    if cuenta:
        return cuenta
    return {"id": cid, "name": body.nombre, "tipo": body.tipo,
            "color": body.color, "initials": body.initials,
            "ars": 0, "usd": 0}


@app.post("/fin/recalcular-saldos")
def recalcular_saldos_fin():
    """Recalcula saldo_ars/usd de todas las cuentas desde movimientos (reparación / alinear caché)."""
    fin_recalcular_saldos_cuentas()
    return fin_obtener_cuentas()


@app.patch("/fin/cuentas/{cuenta_id}/saldo")
def actualizar_saldo_cuenta(cuenta_id: int, body: FinCuentaSaldoUpdate):
    raise HTTPException(
        status_code=410,
        detail="Los saldos se calculan desde movimientos. Creá un movimiento de ajuste o POST /fin/recalcular-saldos.",
    )


@app.patch("/fin/cuentas/{cuenta_id}")
def editar_fin_cuenta(cuenta_id: int, body: FinCuentaUpdate):
    result = fin_editar_cuenta(cuenta_id, body.nombre, body.tipo, body.color, body.initials)
    if result is None:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    return result


@app.delete("/fin/cuentas/{cuenta_id}")
def eliminar_fin_cuenta(cuenta_id: int):
    if not fin_eliminar_cuenta(cuenta_id):
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    return {"mensaje": "Cuenta eliminada"}


# ---------------------------------------------------------------------------
# Finanzas — Categorías
# ---------------------------------------------------------------------------

@app.get("/fin/categorias")
def listar_fin_categorias(include_ocultas: bool = False):
    return fin_obtener_categorias(include_ocultas=include_ocultas)


@app.post("/fin/categorias")
def crear_fin_categoria(body: FinCategoriaCreate):
    cid = fin_crear_categoria(body.nombre, body.color, body.tipo)
    if cid is None:
        raise HTTPException(status_code=400, detail="Ya existe una categoría con ese nombre")
    return {"id": cid, "name": body.nombre, "color": body.color, "tipo": body.tipo}


@app.patch("/fin/categorias/{cat_id}")
def actualizar_fin_categoria(cat_id: int, body: FinCategoriaPatch):
    campos = {k: v for k, v in body.model_dump().items() if v is not None}
    result = fin_actualizar_categoria(cat_id, campos)
    if result is None:
        raise HTTPException(status_code=404, detail="Categoría no encontrada o nombre duplicado")
    return result


@app.delete("/fin/categorias/{cat_id}")
def eliminar_fin_categoria(cat_id: int):
    cats = fin_obtener_categorias()
    cat = next((c for c in cats if c["id"] == cat_id), None)
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    if cat.get("objetivo_id"):
        raise HTTPException(
            status_code=403,
            detail="Categoría vinculada a un objetivo de ahorro. Eliminá el objetivo desde la pestaña Ahorro.",
        )
    if cat["name"] in FIN_CATEGORIAS_RESERVADAS:
        raise HTTPException(status_code=403, detail="Esta categoría del sistema no se puede eliminar")
    if fin_contar_movimientos_categoria(cat_id) > 0:
        raise HTTPException(
            status_code=409,
            detail="Hay movimientos con esta categoría. Reasignalos antes de eliminar.",
        )
    if not fin_eliminar_categoria(cat_id):
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    return {"mensaje": "Categoría eliminada"}


# ---------------------------------------------------------------------------
# Finanzas — Movimientos
# ---------------------------------------------------------------------------

@app.get("/fin/movimientos/resumen")
def resumen_fin_movimientos(mes: Optional[str] = Query(None)):
    """Agregados server-side: ingresos, gastos, por_categoria. Excluye transferencias."""
    from app.db.database import get_connection
    from datetime import date as _date
    conn = get_connection()
    cursor = conn.cursor()
    m = mes or _date.today().strftime("%Y-%m")
    cursor.execute(
        """SELECT id, fecha, monto, tipo, descripcion, icono, cuenta_id, cuotas,
                  categoria_id, moneda, nota, audit
           FROM fin_movimientos WHERE fecha LIKE ?""",
        (f"{m}%",),
    )
    rows = cursor.fetchall()
    # get category names
    cursor.execute("SELECT id, nombre FROM fin_categorias")
    cat_map = {r[0]: r[1] for r in cursor.fetchall()}
    conn.close()

    ingresos = gastos = 0.0
    por_categoria: dict = {}
    for r in rows:
        cat_nombre = cat_map.get(r[8], "")
        if cat_nombre.lower() == "transferencia":
            continue
        monto = r[2] or 0.0
        tipo  = r[3]
        if tipo == "income":
            ingresos += monto
        else:
            gastos += abs(monto)
        cat_key = cat_nombre or "Sin categoría"
        por_categoria.setdefault(cat_key, {"categoria": cat_key, "ingresos": 0.0, "gastos": 0.0})
        if tipo == "income":
            por_categoria[cat_key]["ingresos"] += monto
        else:
            por_categoria[cat_key]["gastos"] += abs(monto)

    return {
        "mes":            m,
        "ingresos":       round(ingresos, 2),
        "gastos":         round(gastos, 2),
        "balance":        round(ingresos - gastos, 2),
        "tasa_ahorro":    round((ingresos - gastos) / ingresos * 100, 1) if ingresos > 0 else 0,
        "por_categoria":  sorted(por_categoria.values(), key=lambda x: x["gastos"], reverse=True),
    }


@app.get("/fin/movimientos/duplicados")
def listar_fin_movimientos_duplicados(ventana_horas: int = Query(24, ge=1, le=168)):
    return fin_obtener_movimientos_duplicados(ventana_horas)


@app.get("/fin/export/csv")
def exportar_fin_csv():
    import csv, io
    movs = fin_export_csv_data()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["fecha","tipo","monto","moneda","descripcion","categoria","cuenta","cuotas","nota"])
    for m in movs:
        writer.writerow([
            m.get("fecha",""), m.get("tipo",""), m.get("monto",""), m.get("moneda","ARS"),
            m.get("descripcion",""), m.get("categoria_nombre",""), m.get("cuenta_nombre",""),
            m.get("cuotas","") or "", m.get("nota","") or "",
        ])
    content = output.getvalue()
    from datetime import date as _d
    filename = f"movimientos-{_d.today()}.csv"
    return Response(
        content=content.encode("utf-8-sig"),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/fin/import/csv")
def importar_fin_csv(body: FinImportCSV):
    filas = [row.model_dump() for row in body.filas]
    created = fin_import_movimientos(filas)
    return {"importados": len(created), "movimientos": created}


@app.patch("/fin/movimientos/bulk")
def bulk_update_fin_movimientos(body: FinMovimientoBulkUpdate):
    result = fin_bulk_update_movimientos(body.updates)
    return {"actualizados": len(result), "movimientos": result}


@app.delete("/fin/movimientos/bulk")
def bulk_delete_fin_movimientos(body: FinMovimientoBulkDelete):
    count = fin_bulk_delete_movimientos(body.ids)
    return {"eliminados": count}


@app.get("/fin/movimientos")
def listar_fin_movimientos(
    mes:    Optional[str] = Query(None),
    limit:  Optional[int] = Query(None, ge=1, le=10000),
    offset: int           = Query(0, ge=0),
):
    movs = fin_obtener_movimientos(mes)
    if limit is not None:
        movs = movs[offset: offset + limit]
    elif offset:
        movs = movs[offset:]
    return movs


@app.post("/fin/movimientos")
def crear_fin_movimiento(body: FinMovimientoCreate):
    # Resolve cuenta_id from nombre if needed
    cuenta_id = None
    if isinstance(body.cuenta_id, int):
        cuenta_id = body.cuenta_id
    elif body.cuenta_nombre:
        cuenta_id = fin_buscar_cuenta_por_nombre(body.cuenta_nombre)

    # Resolve categoria_id from nombre
    categoria_id = None
    raw_cat_id = body.categoria_id
    if isinstance(raw_cat_id, int):
        categoria_id = raw_cat_id
    elif body.categoria_nombre:
        categoria_id = fin_buscar_categoria_por_nombre(body.categoria_nombre)
        if categoria_id is None:
            # Auto-create category on the fly
            tipo_cat = "income" if body.tipo == "income" else "expense"
            categoria_id = fin_crear_categoria(body.categoria_nombre, tipo=tipo_cat)

    return fin_crear_movimiento(
        fecha=body.fecha,
        monto=body.monto,
        tipo=body.tipo,
        descripcion=body.descripcion,
        icono=body.icono,
        cuenta_id=cuenta_id,
        cuotas=body.cuotas,
        categoria_id=categoria_id,
        moneda=body.moneda,
        nota=body.nota,
        audit=body.audit or False,
    )


@app.patch("/fin/movimientos/{mov_id}")
def actualizar_fin_movimiento(mov_id: int, body: FinMovimientoPatch):
    campos: dict = {}
    if body.fecha        is not None: campos["fecha"]       = body.fecha
    if body.monto        is not None: campos["monto"]       = body.monto
    if body.tipo         is not None: campos["tipo"]        = body.tipo
    if body.descripcion  is not None: campos["descripcion"] = body.descripcion
    if body.moneda       is not None: campos["moneda"]      = body.moneda
    if body.nota         is not None: campos["nota"]        = body.nota
    if body.audit        is not None: campos["audit"]       = int(body.audit)
    if body.cuotas       is not None:
        campos["cuotas"] = int(body.cuotas) if body.cuotas != "" else None

    # Resolve cuenta
    if isinstance(body.cuenta_id, int):
        campos["cuenta_id"] = body.cuenta_id
    elif body.cuenta_nombre:
        cid = fin_buscar_cuenta_por_nombre(body.cuenta_nombre)
        if cid:
            campos["cuenta_id"] = cid

    # Resolve categoría
    if isinstance(body.categoria_id, int):
        campos["categoria_id"] = body.categoria_id
    elif body.categoria_nombre:
        cat_id = fin_buscar_categoria_por_nombre(body.categoria_nombre)
        if cat_id is None:
            tipo_cat = "income" if body.tipo == "income" else "expense"
            cat_id = fin_crear_categoria(body.categoria_nombre, tipo=tipo_cat)
        if cat_id:
            campos["categoria_id"] = cat_id

    result = fin_actualizar_movimiento(mov_id, campos)
    if result is None:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
    return result


@app.delete("/fin/movimientos/{mov_id}")
def eliminar_fin_movimiento(mov_id: int):
    if not fin_eliminar_movimiento(mov_id):
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
    return {"mensaje": "Movimiento eliminado"}


# ---------------------------------------------------------------------------
# Finanzas — Config
# ---------------------------------------------------------------------------

@app.get("/fin/config")
def obtener_fin_config():
    return fin_obtener_config()


@app.put("/fin/config")
def actualizar_fin_config(updates: dict):
    # Auto-stamp when dolar_oficial is updated
    if "dolar_oficial" in updates:
        from datetime import datetime as _dt
        updates.setdefault("dolar_oficial_updated_at", _dt.now().isoformat())
    return fin_actualizar_config(updates)


@app.get("/fin/dolar/cotizacion")
def obtener_cotizacion_dolar():
    """Fetch dólar MEP + oficial compra from dolarapi.com; caches in fin_config for offline use."""
    from datetime import datetime as _dt
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.get("https://dolarapi.com/v1/dolares")
            resp.raise_for_status()
            items = resp.json()
        oficial = next((x for x in items if x.get("casa") == "oficial"), None)
        bolsa   = next((x for x in items if x.get("casa") == "bolsa"),   None)
        mep      = (bolsa.get("compra") or bolsa.get("venta"))  if bolsa   else None
        ofi_comp = oficial.get("compra")                        if oficial else None
        updates: dict = {"dolar_actualizado_at": _dt.now().isoformat()}
        if mep      is not None:
            updates["dolar_mep"]     = mep
            updates["dolar_default"] = mep  # pisa el fallback con el último valor real
        if ofi_comp is not None: updates["dolar_oficial_compra"] = ofi_comp
        fin_actualizar_config(updates)
    except Exception:
        pass  # return cached values if network fails
    return fin_obtener_config()


# ---------------------------------------------------------------------------
# Finanzas — Notas
# ---------------------------------------------------------------------------

@app.get("/fin/notas")
def listar_fin_notas():
    return fin_obtener_notas()


@app.post("/fin/notas")
def crear_fin_nota(body: FinNotaCreate):
    if not body.contenido.strip():
        raise HTTPException(status_code=400, detail="El contenido no puede estar vacío")
    return fin_crear_nota(body.contenido)


@app.delete("/fin/notas/{nota_id}")
def eliminar_fin_nota(nota_id: int):
    if not fin_eliminar_nota(nota_id):
        raise HTTPException(status_code=404, detail="Nota no encontrada")
    return {"mensaje": "Nota eliminada"}


# ---------------------------------------------------------------------------
# Finanzas — Fondo de emergencia
# ---------------------------------------------------------------------------

@app.get("/fin/emergencia", deprecated=True)
def obtener_fin_emergencia():
    """Deprecado — usar objetivo 'Fondo de Emergencia' en /fin/objetivos."""
    return {"saldo": fin_obtener_emergencia_saldo(), "_deprecated": True}


# ---------------------------------------------------------------------------
# Finanzas — Instrumentos (portafolio)
# ---------------------------------------------------------------------------

@app.get("/fin/instrumentos")
def listar_fin_instrumentos():
    return fin_obtener_instrumentos()


@app.post("/fin/instrumentos")
def crear_fin_instrumento(body: FinInstrumentoCreate):
    return fin_crear_instrumento(
        tipo=body.tipo,
        nombre=body.nombre,
        ticker=body.ticker,
        sociedad=body.sociedad,
        cantidad=body.cantidad,
        costo_usd=body.costo_usd,
        tipo_cambio=body.tipo_cambio,
        precio_actual=body.precio_actual,
        entidad=body.entidad,
        capital_ars=body.capital_ars,
        tna=body.tna,
        fecha_inicio=body.fecha_inicio,
        fecha_vencimiento=body.fecha_vencimiento,
    )


@app.patch("/fin/instrumentos/{inst_id}")
def actualizar_fin_instrumento(inst_id: int, body: FinInstrumentoPatch):
    campos = {k: v for k, v in body.model_dump().items() if v is not None}
    try:
        result = fin_actualizar_instrumento(inst_id, campos)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    if result is None:
        raise HTTPException(status_code=404, detail="Instrumento no encontrado")
    return result


@app.delete("/fin/instrumentos/{inst_id}")
def eliminar_fin_instrumento_endpoint(inst_id: int):
    if not fin_eliminar_instrumento(inst_id):
        raise HTTPException(status_code=404, detail="Instrumento no encontrado")
    return {"mensaje": "Instrumento eliminado"}


# ---------------------------------------------------------------------------
# Finanzas — Ledger transacciones por instrumento
# ---------------------------------------------------------------------------

@app.get("/fin/instrumentos/{inst_id}/transacciones")
def listar_transacciones_instrumento(inst_id: int):
    return fin_obtener_transacciones_instrumento(inst_id)


@app.post("/fin/instrumentos/{inst_id}/transacciones")
def crear_transaccion_instrumento(inst_id: int, body: FinTransaccionCreate):
    if body.tipo not in ("compra", "venta"):
        raise HTTPException(status_code=400, detail="tipo debe ser 'compra' o 'venta'")
    try:
        return fin_crear_transaccion_instrumento(
            instrumento_id=inst_id,
            tipo=body.tipo,
            fecha=body.fecha,
            cantidad=body.cantidad,
            precio=body.precio,
            nota=body.nota,
            moneda=body.moneda,
            tipo_cambio=body.tipo_cambio,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/fin/transacciones")
def listar_transacciones_global(
    ticker:    Optional[str] = Query(None),
    tipo_inst: Optional[str] = Query(None),
    desde:     Optional[str] = Query(None),
    hasta:     Optional[str] = Query(None),
    limit:     int           = Query(200, ge=1, le=2000),
    offset:    int           = Query(0, ge=0),
):
    return fin_obtener_transacciones_global(
        ticker=ticker,
        tipo_inst=tipo_inst,
        desde=desde,
        hasta=hasta,
        limit=limit,
        offset=offset,
    )


@app.post("/fin/transacciones")
def crear_transaccion_unificada(body: FinTransaccionCreateUnified):
    if body.tipo not in ("compra", "venta"):
        raise HTTPException(status_code=400, detail="tipo debe ser 'compra' o 'venta'")
    if body.instrumento_tipo not in ("acciones", "ons", "crypto"):
        raise HTTPException(
            status_code=400,
            detail="instrumento_tipo debe ser 'acciones', 'ons' o 'crypto'",
        )
    try:
        return fin_crear_transaccion_unificada(
            tipo=body.tipo,
            instrumento_tipo=body.instrumento_tipo,
            ticker=body.ticker,
            nombre=body.nombre,
            fecha=body.fecha,
            cantidad=body.cantidad,
            precio=body.precio,
            nota=body.nota,
            moneda=body.moneda,
            tipo_cambio=body.tipo_cambio,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.patch("/fin/transacciones/{trans_id}")
def actualizar_transaccion_instrumento(trans_id: int, body: FinTransaccionPatch):
    campos = {k: v for k, v in body.model_dump().items() if v is not None}
    if not campos:
        raise HTTPException(status_code=400, detail="Sin campos a actualizar")
    if "tipo" in campos and campos["tipo"] not in ("compra", "venta"):
        raise HTTPException(status_code=400, detail="tipo debe ser 'compra' o 'venta'")
    result = fin_actualizar_transaccion_instrumento(trans_id, campos)
    if result is None:
        raise HTTPException(status_code=404, detail="Transacción no encontrada")
    return result


@app.delete("/fin/transacciones/{trans_id}")
def eliminar_transaccion_instrumento(trans_id: int):
    if not fin_eliminar_transaccion_instrumento(trans_id):
        raise HTTPException(status_code=404, detail="Transacción no encontrada")
    return {"mensaje": "Transacción eliminada"}


# ---------------------------------------------------------------------------
# Finanzas — Objetivos de ahorro
# ---------------------------------------------------------------------------

@app.get("/fin/objetivos")
def listar_fin_objetivos():
    return fin_obtener_objetivos()


@app.post("/fin/objetivos")
def crear_fin_objetivo(body: FinObjetivoCreate):
    result = fin_crear_objetivo(
        nombre=body.nombre,
        meta=body.meta,
        moneda=body.moneda,
        fecha_limite=body.fecha_limite,
        cuota_mensual=body.cuota_mensual,
    )
    if result is None:
        raise HTTPException(status_code=400, detail="Ya existe un objetivo con ese nombre")
    return result


@app.patch("/fin/objetivos/{obj_id}")
def actualizar_fin_objetivo(obj_id: int, body: FinObjetivoPatch):
    campos = {k: v for k, v in body.model_dump().items() if v is not None}
    if "nombre" in campos:
        raise HTTPException(
            status_code=400,
            detail="El nombre del objetivo no se puede cambiar; coincide con su categoría de movimientos.",
        )
    result = fin_actualizar_objetivo(obj_id, campos)
    if result is None:
        raise HTTPException(status_code=404, detail="Objetivo no encontrado")
    return result


@app.delete("/fin/objetivos/{obj_id}")
def eliminar_fin_objetivo_endpoint(obj_id: int):
    if not fin_eliminar_objetivo(obj_id):
        raise HTTPException(status_code=404, detail="Objetivo no encontrado")
    return {"mensaje": "Objetivo eliminado"}


# ---------------------------------------------------------------------------
# Finanzas — FIRE filas (overrides de ahorrado por mes)
# ---------------------------------------------------------------------------

@app.get("/fin/fire-filas")
def obtener_fin_fire_filas():
    return fin_obtener_fire_filas()


@app.put("/fin/fire-filas/{mes}")
def upsert_fin_fire_fila(mes: str, body: FinFireFilaUpsert):
    fin_upsert_fire_fila(mes, body.ahorrado_override)
    return {"mes": mes, "ahorrado_override": body.ahorrado_override}


# ---------------------------------------------------------------------------
# Finanzas — Inflación mensual
# ---------------------------------------------------------------------------

@app.get("/fin/inflacion")
def obtener_fin_inflacion():
    return fin_obtener_inflacion()


@app.put("/fin/inflacion/{mes}")
def upsert_fin_inflacion(mes: str, body: FinInflacionUpsert):
    fin_upsert_inflacion(mes, body.inflacion)
    return {"mes": mes, "inflacion": body.inflacion}


# ---------------------------------------------------------------------------
# Agenda — Pydantic models
# ---------------------------------------------------------------------------

class AgendaCalendarioCreate(BaseModel):
    nombre: str
    color: str = "#2563eb"

class AgendaCalendarioPatch(BaseModel):
    nombre: Optional[str] = None
    color: Optional[str] = None
    activo: Optional[bool] = None

_HM_RE = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')

def _validate_hm(v: Optional[str], field: str) -> Optional[str]:
    if v is not None and not _HM_RE.match(v):
        raise ValueError(f"{field} debe ser HH:MM (ej. 09:30)")
    return v

class AgendaEventoCreate(BaseModel):
    titulo: str
    fecha_inicio: str
    descripcion: Optional[str] = None
    fecha_fin: Optional[str] = None
    todo_el_dia: bool = False
    se_repite: bool = False
    regla_repeticion: Optional[str] = None
    calendario_id: Optional[int] = None

    @model_validator(mode='after')
    def check_fechas(self):
        if self.fecha_fin and self.fecha_inicio and self.fecha_fin < self.fecha_inicio:
            raise ValueError("fecha_fin debe ser posterior a fecha_inicio")
        return self

class AgendaEventoPatch(BaseModel):
    titulo: Optional[str] = None
    descripcion: Optional[str] = None
    fecha_inicio: Optional[str] = None
    fecha_fin: Optional[str] = None
    todo_el_dia: Optional[bool] = None
    se_repite: Optional[bool] = None
    regla_repeticion: Optional[str] = None
    calendario_id: Optional[int] = None

class AgendaListaCreate(BaseModel):
    nombre: str
    color: str = "#7c3aed"

class AgendaListaPatch(BaseModel):
    nombre: Optional[str] = None
    color: Optional[str] = None
    pinned: Optional[bool] = None

class AgendaTareaCreate(BaseModel):
    titulo: str
    lista_id: Optional[int] = None
    descripcion: Optional[str] = None
    fecha_opcional: Optional[str] = None
    hora_opcional: Optional[str] = None
    hora_bloque: Optional[str] = None
    duracion_estimada: Optional[int] = None
    se_repite: bool = False
    regla_repeticion: Optional[str] = None

    @field_validator('hora_opcional', 'hora_bloque', mode='before')
    @classmethod
    def validate_horas(cls, v): return _validate_hm(v, 'hora')

class AgendaTareaPatch(BaseModel):
    titulo: Optional[str] = None
    descripcion: Optional[str] = None
    fecha_opcional: Optional[str] = None
    hora_opcional: Optional[str] = None
    hora_bloque: Optional[str] = None
    duracion_estimada: Optional[int] = None
    completada: Optional[bool] = None
    lista_id: Optional[int] = None

    @field_validator('hora_opcional', 'hora_bloque', mode='before')
    @classmethod
    def validate_horas(cls, v): return _validate_hm(v, 'hora')

class AgendaHorarioCreate(BaseModel):
    dia_semana: int
    hora_inicio: str
    hora_fin: str
    materia: str
    descripcion: Optional[str] = None
    color: Optional[str] = None

    @field_validator('hora_inicio', 'hora_fin', mode='before')
    @classmethod
    def validate_horas(cls, v): return _validate_hm(v, 'hora')

    @field_validator('dia_semana', mode='before')
    @classmethod
    def validate_dia(cls, v):
        if not (0 <= int(v) <= 6):
            raise ValueError("dia_semana debe ser 0 (Lun) a 6 (Dom)")
        return v

class AgendaHorarioPatch(BaseModel):
    dia_semana: Optional[int] = None
    hora_inicio: Optional[str] = None
    hora_fin: Optional[str] = None
    materia: Optional[str] = None
    descripcion: Optional[str] = None
    color: Optional[str] = None


class AgendaHorarioExcepcionCreate(BaseModel):
    fecha: str


# ---------------------------------------------------------------------------
# Agenda — Calendarios
# ---------------------------------------------------------------------------

@app.get("/agenda/calendarios")
def listar_agenda_calendarios():
    return agenda_obtener_calendarios()

@app.post("/agenda/calendarios")
def crear_agenda_calendario(body: AgendaCalendarioCreate):
    return agenda_crear_calendario(body.nombre, body.color)

@app.patch("/agenda/calendarios/{cal_id}")
def actualizar_agenda_calendario(cal_id: int, body: AgendaCalendarioPatch):
    campos = {k: v for k, v in body.model_dump().items() if v is not None}
    result = agenda_actualizar_calendario(cal_id, campos)
    if result is None:
        raise HTTPException(status_code=404, detail="Calendario no encontrado")
    return result

@app.delete("/agenda/calendarios/{cal_id}")
def eliminar_agenda_calendario(cal_id: int):
    if not agenda_eliminar_calendario(cal_id):
        raise HTTPException(status_code=404, detail="Calendario no encontrado")
    return {"mensaje": "Calendario eliminado"}


# ---------------------------------------------------------------------------
# Agenda — Eventos
# ---------------------------------------------------------------------------

@app.get("/agenda/eventos")
def listar_agenda_eventos(
    desde: Optional[str] = Query(None),
    hasta: Optional[str] = Query(None),
):
    if not desde:
        from datetime import date, timedelta
        today = date.today()
        desde = (today.replace(day=1) - timedelta(days=32)).strftime('%Y-%m-01')
    if not hasta:
        from datetime import date, timedelta
        today = date.today()
        hasta = (today.replace(day=1) + timedelta(days=62)).strftime('%Y-%m-28')
    return agenda_obtener_eventos(fecha_desde=desde, fecha_hasta=hasta)

@app.post("/agenda/eventos")
def crear_agenda_evento(body: AgendaEventoCreate):
    return agenda_crear_evento(
        titulo=body.titulo,
        fecha_inicio=body.fecha_inicio,
        descripcion=body.descripcion,
        fecha_fin=body.fecha_fin,
        todo_el_dia=body.todo_el_dia,
        se_repite=body.se_repite,
        regla_repeticion=body.regla_repeticion,
        calendario_id=body.calendario_id,
    )

@app.patch("/agenda/eventos/{evt_id}")
def actualizar_agenda_evento(evt_id: int, body: AgendaEventoPatch):
    campos = {k: v for k, v in body.model_dump().items() if v is not None}
    result = agenda_actualizar_evento(evt_id, campos)
    if result is None:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    return result

@app.delete("/agenda/eventos/{evt_id}")
def eliminar_agenda_evento_endpoint(evt_id: int):
    if not agenda_eliminar_evento(evt_id):
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    return {"mensaje": "Evento eliminado"}


@app.get("/agenda/export.ics")
def exportar_agenda_ics(
    desde: Optional[str] = Query(None),
    hasta: Optional[str] = Query(None),
):
    eventos = agenda_obtener_eventos(fecha_desde=desde, fecha_hasta=hasta)
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//SGR//Agenda//ES",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
    ]
    for e in eventos:
        uid = f"sgr-{e['id']}-{e['fecha_inicio'][:10].replace('-','')}@sgr"
        def _dt(s):
            if not s:
                return None
            s = s.replace("-", "").replace(":", "")
            if "T" in s:
                return s[:15]
            return s[:8]

        lines.append("BEGIN:VEVENT")
        lines.append(f"UID:{uid}")
        dtstart = _dt(e["fecha_inicio"])
        if e.get("todo_el_dia"):
            lines.append(f"DTSTART;VALUE=DATE:{dtstart}")
        else:
            lines.append(f"DTSTART:{dtstart}")
        if e.get("fecha_fin"):
            dtend = _dt(e["fecha_fin"])
            if e.get("todo_el_dia"):
                lines.append(f"DTEND;VALUE=DATE:{dtend}")
            else:
                lines.append(f"DTEND:{dtend}")
        lines.append(f"SUMMARY:{e['titulo'].replace(chr(10), ' ')}")
        if e.get("descripcion"):
            desc = e["descripcion"].replace(chr(10), "\\n")
            lines.append(f"DESCRIPTION:{desc}")
        lines.append("END:VEVENT")

    lines.append("END:VCALENDAR")
    content = "\r\n".join(lines) + "\r\n"
    return Response(
        content,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="agenda.ics"'},
    )


@app.get("/agenda/notificaciones/pending")
def agenda_notificaciones_pending(ventana_min: int = Query(15)):
    """Events starting within the next `ventana_min` minutes."""
    from datetime import datetime, timedelta
    now   = datetime.now()
    hasta = now + timedelta(minutes=ventana_min)
    eventos = agenda_obtener_eventos(
        fecha_desde=now.strftime('%Y-%m-%dT%H:%M'),
        fecha_hasta=hasta.strftime('%Y-%m-%dT%H:%M'),
    )
    return [e for e in eventos if not e.get("todo_el_dia")]


# ---------------------------------------------------------------------------
# Agenda — Listas de tareas
# ---------------------------------------------------------------------------

@app.get("/agenda/listas")
def listar_agenda_listas():
    return agenda_obtener_listas()

@app.post("/agenda/listas")
def crear_agenda_lista(body: AgendaListaCreate):
    return agenda_crear_lista(body.nombre, body.color)

@app.patch("/agenda/listas/{lista_id}")
def actualizar_agenda_lista(lista_id: int, body: AgendaListaPatch):
    campos = {k: v for k, v in body.model_dump().items() if v is not None}
    result = agenda_actualizar_lista(lista_id, campos)
    if result is None:
        raise HTTPException(status_code=404, detail="Lista no encontrada")
    return result

@app.delete("/agenda/listas/{lista_id}")
def eliminar_agenda_lista_endpoint(lista_id: int):
    if not agenda_eliminar_lista(lista_id):
        raise HTTPException(status_code=404, detail="Lista no encontrada")
    return {"mensaje": "Lista eliminada"}


# ---------------------------------------------------------------------------
# Agenda — Tareas
# ---------------------------------------------------------------------------

@app.get("/agenda/tareas")
def listar_agenda_tareas(
    lista_id: Optional[int] = Query(None),
    pendientes: bool = Query(False),
):
    return agenda_obtener_tareas(lista_id=lista_id, solo_pendientes=pendientes)

@app.post("/agenda/tareas")
def crear_agenda_tarea(body: AgendaTareaCreate):
    return agenda_crear_tarea(
        titulo=body.titulo,
        lista_id=body.lista_id,
        descripcion=body.descripcion,
        fecha_opcional=body.fecha_opcional,
        hora_opcional=body.hora_opcional,
        hora_bloque=body.hora_bloque,
        duracion_estimada=body.duracion_estimada,
        se_repite=body.se_repite,
        regla_repeticion=body.regla_repeticion,
    )

@app.patch("/agenda/tareas/{tarea_id}")
def actualizar_agenda_tarea(tarea_id: int, body: AgendaTareaPatch):
    campos = {k: v for k, v in body.model_dump().items() if v is not None}
    if body.completada is not None:
        campos["completada"] = int(body.completada)
    result = agenda_actualizar_tarea(tarea_id, campos)
    if result is None:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    return result

@app.delete("/agenda/tareas/{tarea_id}")
def eliminar_agenda_tarea_endpoint(tarea_id: int):
    if not agenda_eliminar_tarea(tarea_id):
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    return {"mensaje": "Tarea eliminada"}


# ---------------------------------------------------------------------------
# Agenda — Horario facultad
# ---------------------------------------------------------------------------

@app.get("/agenda/horario-facultad")
def listar_agenda_horario_facultad():
    return agenda_obtener_horario_facultad()

@app.post("/agenda/horario-facultad")
def crear_agenda_horario(body: AgendaHorarioCreate):
    return agenda_crear_horario_facultad(
        dia_semana=body.dia_semana,
        hora_inicio=body.hora_inicio,
        hora_fin=body.hora_fin,
        materia=body.materia,
        descripcion=body.descripcion,
        color=body.color,
    )

@app.patch("/agenda/horario-facultad/{hf_id}")
def actualizar_agenda_horario(hf_id: int, body: AgendaHorarioPatch):
    campos = {k: v for k, v in body.model_dump().items() if v is not None}
    result = agenda_actualizar_horario_facultad(hf_id, campos)
    if result is None:
        raise HTTPException(status_code=404, detail="Horario no encontrado")
    return result

@app.delete("/agenda/horario-facultad/{hf_id}")
def eliminar_agenda_horario(hf_id: int):
    if not agenda_eliminar_horario_facultad(hf_id):
        raise HTTPException(status_code=404, detail="Horario no encontrado")
    return {"mensaje": "Horario eliminado"}

@app.post("/agenda/horario-facultad/{hf_id}/excepciones")
def crear_agenda_horario_excepcion(hf_id: int, body: AgendaHorarioExcepcionCreate):
    result = agenda_crear_horario_facultad_excepcion(hf_id, body.fecha)
    if result is None:
        raise HTTPException(status_code=404, detail="Horario no encontrado")
    return result


@app.get("/agenda/buscar")
def buscar_agenda(q: str = Query(..., min_length=1)):
    return agenda_buscar(q)


@app.get("/agenda/revision")
def obtener_agenda_revision(
    desde: str = Query(...),
    hasta: str = Query(...),
):
    return agenda_resumen_semana(desde, hasta)


# ---------------------------------------------------------------------------
# Hábitos — Pydantic models
# ---------------------------------------------------------------------------

class HabitoCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    color: str = "#7c3aed"
    categoria: Optional[str] = None
    frecuencia_tipo: str = "diario"
    dias_semana: Optional[str] = None
    hora: Optional[str] = None

class HabitoPatch(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    color: Optional[str] = None
    categoria: Optional[str] = None
    frecuencia_tipo: Optional[str] = None
    dias_semana: Optional[str] = None
    hora: Optional[str] = None
    activo: Optional[bool] = None
    notificar: Optional[bool] = None
    minutos_antes: Optional[int] = None

class HabitoRegistroUpsert(BaseModel):
    fecha: str
    valor: float
    nota: Optional[str] = None

    @field_validator("valor")
    @classmethod
    def valor_valido(cls, v):
        if v not in (0.5, 1.0):
            raise ValueError("valor debe ser 0.5 o 1.0")
        return v

class HabitoRegistroBatchItem(BaseModel):
    habito_id: int
    fecha: str
    valor: float
    nota: Optional[str] = None

    @field_validator("valor")
    @classmethod
    def valor_valido(cls, v):
        if v not in (0.5, 1.0):
            raise ValueError("valor debe ser 0.5 o 1.0")
        return v

class HabitoRegistroBatch(BaseModel):
    registros: List[HabitoRegistroBatchItem]


# ---------------------------------------------------------------------------
# Hábitos — Routes
# ---------------------------------------------------------------------------

@app.get("/habitos")
def listar_habitos(request: Request):
    accept = request.headers.get("accept", "")
    if "text/html" in accept and "application/json" not in accept.split(",")[0]:
        if (DIST_DIR / "index.html").is_file():
            return _spa_index()
    return habitos_obtener()

@app.post("/habitos")
def crear_habito(body: HabitoCreate):
    return habitos_crear(
        nombre=body.nombre,
        descripcion=body.descripcion,
        color=body.color,
        categoria=body.categoria,
        frecuencia_tipo=body.frecuencia_tipo,
        dias_semana=body.dias_semana,
        hora=body.hora,
    )

@app.patch("/habitos/{habito_id}")
def actualizar_habito(habito_id: int, body: HabitoPatch):
    campos = {k: v for k, v in body.model_dump().items() if v is not None}
    if body.activo is not None:
        campos["activo"] = int(body.activo)
    if body.notificar is not None:
        campos["notificar"] = int(body.notificar)
    result = habitos_actualizar(habito_id, campos)
    if result is None:
        raise HTTPException(status_code=404, detail="Hábito no encontrado")
    return result

@app.delete("/habitos/{habito_id}")
def eliminar_habito_endpoint(habito_id: int):
    if not habitos_eliminar(habito_id):
        raise HTTPException(status_code=404, detail="Hábito no encontrado")
    return {"mensaje": "Hábito eliminado"}


@app.get("/habitos/pendientes-hoy")
def listar_habitos_pendientes_hoy(fecha: Optional[str] = Query(None)):
    from datetime import date as _date
    hoy = fecha or _date.today().isoformat()
    return habitos_pendientes_hoy(hoy)


@app.get("/habitos/{habito_id}/stats")
def get_habito_stats(habito_id: int):
    result = habitos_stats(habito_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Hábito no encontrado")
    return result


# ---------------------------------------------------------------------------
# Hábitos — Registros
# ---------------------------------------------------------------------------

@app.get("/habitos/registros")
def listar_habitos_registros(
    habito_id: Optional[int] = Query(None),
    fecha_desde: Optional[str] = Query(None),
    fecha_hasta: Optional[str] = Query(None),
):
    return habitos_registros_obtener(
        habito_id=habito_id,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
    )

@app.put("/habitos/{habito_id}/registro")
def upsert_habito_registro(habito_id: int, body: HabitoRegistroUpsert):
    return habitos_registros_upsert(
        habito_id=habito_id,
        fecha=body.fecha,
        valor=body.valor,
        nota=body.nota,
    )

@app.delete("/habitos/registros/{registro_id}")
def eliminar_habito_registro(registro_id: int):
    if not habitos_registros_eliminar(registro_id):
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    return {"mensaje": "Registro eliminado"}


@app.post("/habitos/registros/batch")
def batch_upsert_registros(body: HabitoRegistroBatch):
    items = [r.model_dump() for r in body.registros]
    return habitos_registros_batch_upsert(items)


# --- Sync homelab ↔ Windows ---

_SYNC_TOKEN = os.getenv("SGR_SYNC_TOKEN", "")


def _check_sync_token(request: Request) -> None:
    """Sin SGR_SYNC_TOKEN configurado, antes quedaba "fail open" (cualquiera
    que llegue a :8765 podía pegarle a /sync/import y reemplazar la DB
    canónica completa) -- ahora "fail closed": sin token configurado, los dos
    endpoints de sync se rechazan (2026-09-21, ver auditoría externa en
    Cerebro/PROXIMAMENTE.md). No afecta el resto del backend -- solo estos 2
    endpoints, a propósito, para no trabar toda la app si a alguien se le
    olvidó configurar la env var sin darse cuenta de por qué el resto dejó de
    andar."""
    if not _SYNC_TOKEN:
        raise HTTPException(
            status_code=503,
            detail="Sync deshabilitado: configurá SGR_SYNC_TOKEN en el servidor.",
        )
    if request.headers.get("X-Sync-Token") != _SYNC_TOKEN:
        raise HTTPException(status_code=401, detail="Token de sync inválido")


@app.get("/sync/export")
def sync_export(request: Request):
    """Backup SQLite online (sin parar el servidor). Usado por sgr-sync-pull.ps1."""
    _check_sync_token(request)
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        src = sqlite3.connect(DB_PATH)
        dst = sqlite3.connect(tmp_path)
        src.backup(dst)
        src.close()
        dst.close()
        with open(tmp_path, "rb") as f:
            data = f.read()
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
    return Response(
        content=data,
        media_type="application/octet-stream",
        headers={"Content-Disposition": 'attachment; filename="app.db"'},
    )


@app.post("/sync/import")
async def sync_import(request: Request, file: UploadFile = File(...)):
    """Reemplaza la DB canónica con el archivo subido. Usado por sgr-sync-push.ps1."""
    _check_sync_token(request)

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        tmp_path = tmp.name
        tmp.write(await file.read())

    try:
        # Validar integridad y tablas mínimas antes de tocar producción
        try:
            check = sqlite3.connect(tmp_path)
            result = check.execute("PRAGMA integrity_check").fetchone()
            if result[0] != "ok":
                raise HTTPException(status_code=400, detail="integrity_check falló en el archivo subido")
            tables = {r[0] for r in check.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
            check.close()
            required = {"fin_movimientos", "hojas", "habitos"}
            missing = required - tables
            if missing:
                raise HTTPException(status_code=400, detail=f"Tablas faltantes: {missing}")
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"DB inválida: {exc}")

        # Backup server-side con timestamp antes de sobrescribir
        bak_path = str(Path(DB_PATH).parent / f"app.db.bak.{int(time.time())}")
        try:
            prod = sqlite3.connect(DB_PATH)
            bak = sqlite3.connect(bak_path)
            prod.backup(bak)
            prod.close()
            bak.close()
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"No se pudo crear backup server-side: {exc}")

        # Reemplazar producción
        src = sqlite3.connect(tmp_path)
        dst = sqlite3.connect(DB_PATH)
        src.backup(dst)
        src.close()
        dst.close()

        return {"ok": True, "mensaje": "Base de datos importada", "backup": bak_path}
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


# --- SPA (UI empaquetada / producción; puerto por defecto :8765 vía SGR_PORT) ---

_SPA_API_PREFIXES = (
    "categorias",
    "hojas",
    "fin/",
    "agenda/",
    "habitos/",
    "meta",
    "preview",
    "upload",
    "assets/",
    "uploads/",
    "sync/",
)


def _wants_html(request: Request) -> bool:
    accept = request.headers.get("accept", "")
    return "text/html" in accept and "application/json" not in accept.split(",")[0]


@app.get("/{full_path:path}", include_in_schema=False)
def spa_fallback(full_path: str, request: Request):
    if not _wants_html(request):
        raise HTTPException(status_code=404, detail="Not Found")
    if any(full_path.startswith(p) for p in _SPA_API_PREFIXES):
        raise HTTPException(status_code=404, detail="Not Found")
    if not (DIST_DIR / "index.html").is_file():
        raise HTTPException(status_code=404, detail="Frontend no compilado")
    return _spa_index()
