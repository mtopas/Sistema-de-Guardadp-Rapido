# entrypoints (FastAPI)

import re
import shutil
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from bs4 import BeautifulSoup
from typing import Any, Optional

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.config import DEBUG
from app.db.crud import (
    actualizar_apuntes,
    actualizar_icono,
    actualizar_link_preview,
    categoria_existe,
    crear_categoria,
    crear_hoja,
    eliminar_categoria,
    eliminar_hoja,
    obtener_categorias,
    obtener_hoja_por_id,
    obtener_hojas,
    # Finanzas
    fin_obtener_cuentas,
    fin_crear_cuenta,
    fin_actualizar_cuenta_saldo,
    fin_eliminar_cuenta,
    fin_buscar_cuenta_por_nombre,
    fin_obtener_categorias,
    fin_crear_categoria,
    fin_eliminar_categoria,
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
)
from app.db.database import init_db
from app.models.categoria import CategoriaCreate
from app.models.hoja import HojaCreate, HojaPatch


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


class FinCategoriaCreate(BaseModel):
    nombre: str
    color: Optional[str] = None
    tipo: str = "expense"


class FinMovimientoCreate(BaseModel):
    tipo: str
    monto: float
    moneda: str = "ARS"
    fecha: str
    descripcion: str
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

DIST_DIR    = Path("frontend/dist")
UPLOADS_DIR = Path("uploads")
UPLOADS_DIR.mkdir(exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(lifespan=lifespan)

# Allow Vite dev server to call the API during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve built frontend (production)
if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

# Serve uploaded images
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")


# --- Frontend ---

@app.get("/", include_in_schema=False)
def read_root():
    index = DIST_DIR / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return {"message": "Run 'npm run build' inside frontend/ to serve the UI here."}


# --- Categorias ---

@app.get("/categorias")
def listar_categorias():
    return obtener_categorias()


@app.post("/categorias")
def crear_categoria_endpoint(body: CategoriaCreate):
    nombre = body.nombre.strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre no puede estar vacío")
    cid = crear_categoria(nombre, padre_id=body.padre_id, icono=body.icono)
    if cid is None:
        raise HTTPException(status_code=400, detail="Ya existe una categoría con ese nombre")
    return {"id": cid, "nombre": nombre, "padre_id": body.padre_id, "icono": body.icono}


@app.delete("/categorias/{categoria_id}")
def eliminar_categoria_endpoint(categoria_id: int):
    if not eliminar_categoria(categoria_id):
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    return {"mensaje": "Categoría eliminada"}


# --- Hojas ---

@app.post("/hojas")
async def crear_hoja_endpoint(hoja: HojaCreate):
    if not hoja.contenido.strip():
        raise HTTPException(status_code=400, detail="El contenido no puede estar vacío")
    if not categoria_existe(hoja.categoria_id):
        raise HTTPException(status_code=400, detail="Categoría no encontrada")

    preview = None
    if hoja.tipo == "link":
        url_match = re.search(r"https?://\S+", hoja.contenido)
        if url_match:
            preview = await _fetch_link_preview(url_match.group(0))

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
    )
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


@app.get("/hojas")
def listar_hojas():
    return obtener_hojas()


@app.get("/hojas/{hoja_id}")
def obtener_hoja(hoja_id: int):
    hoja = obtener_hoja_por_id(hoja_id)
    if hoja is None:
        raise HTTPException(status_code=404, detail="Hoja no encontrada")
    return hoja


@app.patch("/hojas/{hoja_id}")
def actualizar_hoja_endpoint(hoja_id: int, data: HojaPatch):
    if obtener_hoja_por_id(hoja_id) is None:
        raise HTTPException(status_code=404, detail="Hoja no encontrada")
    fecha_actualizado = None
    if "apuntes" in data.model_fields_set:
        fecha_actualizado = actualizar_apuntes(hoja_id, data.apuntes)
    if "icono" in data.model_fields_set:
        fecha_actualizado = actualizar_icono(hoja_id, data.icono)
    return {"mensaje": "Hoja actualizada", "fecha_actualizado": fecha_actualizado}


@app.delete("/hojas/{hoja_id}")
def eliminar_hoja_endpoint(hoja_id: int):
    if not eliminar_hoja(hoja_id):
        raise HTTPException(status_code=404, detail="Hoja no encontrada")
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

        if DEBUG:
            print(f"preview: {url} → title={title}")

        return {"title": title, "description": description, "image": image, "favicon": favicon}
    except Exception as e:
        if DEBUG:
            print(f"preview error: {e}")
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
    return {"id": cid, "name": body.nombre, "tipo": body.tipo,
            "color": body.color, "initials": body.initials,
            "ars": body.saldo_ars, "usd": body.saldo_usd}


@app.patch("/fin/cuentas/{cuenta_id}/saldo")
def actualizar_saldo_cuenta(cuenta_id: int, body: FinCuentaSaldoUpdate):
    result = fin_actualizar_cuenta_saldo(cuenta_id, body.saldo_ars, body.saldo_usd)
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
def listar_fin_categorias():
    return fin_obtener_categorias()


@app.post("/fin/categorias")
def crear_fin_categoria(body: FinCategoriaCreate):
    cid = fin_crear_categoria(body.nombre, body.color, body.tipo)
    if cid is None:
        raise HTTPException(status_code=400, detail="Ya existe una categoría con ese nombre")
    return {"id": cid, "name": body.nombre, "color": body.color, "tipo": body.tipo}


@app.delete("/fin/categorias/{cat_id}")
def eliminar_fin_categoria(cat_id: int):
    if not fin_eliminar_categoria(cat_id):
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    return {"mensaje": "Categoría eliminada"}


# ---------------------------------------------------------------------------
# Finanzas — Movimientos
# ---------------------------------------------------------------------------

@app.get("/fin/movimientos")
def listar_fin_movimientos(mes: Optional[str] = Query(None)):
    return fin_obtener_movimientos(mes)


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
    return fin_actualizar_config(updates)


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

@app.get("/fin/emergencia")
def obtener_fin_emergencia():
    return {"saldo": fin_obtener_emergencia_saldo()}


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
    result = fin_actualizar_instrumento(inst_id, campos)
    if result is None:
        raise HTTPException(status_code=404, detail="Instrumento no encontrado")
    return result


@app.delete("/fin/instrumentos/{inst_id}")
def eliminar_fin_instrumento_endpoint(inst_id: int):
    if not fin_eliminar_instrumento(inst_id):
        raise HTTPException(status_code=404, detail="Instrumento no encontrado")
    return {"mensaje": "Instrumento eliminado"}


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
