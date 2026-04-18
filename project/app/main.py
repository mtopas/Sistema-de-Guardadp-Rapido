# entrypoints (FastAPI)

import shutil
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from bs4 import BeautifulSoup
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import DEBUG
from app.db.crud import (
    actualizar_apuntes,
    actualizar_icono,
    categoria_existe,
    crear_categoria,
    crear_hoja,
    eliminar_categoria,
    eliminar_hoja,
    obtener_categorias,
    obtener_hoja_por_id,
    obtener_hojas,
)
from app.db.database import init_db
from app.models.categoria import CategoriaCreate
from app.models.hoja import HojaCreate, HojaPatch

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
def crear_hoja_endpoint(hoja: HojaCreate):
    if not hoja.contenido.strip():
        raise HTTPException(status_code=400, detail="El contenido no puede estar vacío")
    if not categoria_existe(hoja.categoria_id):
        raise HTTPException(status_code=400, detail="Categoría no encontrada")
    crear_hoja(
        hoja.contenido,
        hoja.categoria_id,
        tipo=hoja.tipo,
        apuntes=hoja.apuntes,
        lugar=hoja.lugar,
        latitud=hoja.latitud,
        longitud=hoja.longitud,
        fecha_recordatorio=hoja.fecha_recordatorio,
        icono=hoja.icono,
    )
    return {"mensaje": "Hoja guardada"}


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
    if "apuntes" in data.model_fields_set:
        actualizar_apuntes(hoja_id, data.apuntes)
    if "icono" in data.model_fields_set:
        actualizar_icono(hoja_id, data.icono)
    return {"mensaje": "Hoja actualizada"}


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

@app.get("/preview")
async def fetch_preview(url: str = Query(...)):
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
