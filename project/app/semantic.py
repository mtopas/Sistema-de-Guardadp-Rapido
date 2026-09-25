"""
Capa semántica: embeddings via Ollama + ChromaDB para búsqueda de hojas.

Todas las operaciones son best-effort:
  - Si Ollama no está disponible, las funciones devuelven False/[] sin romper el CRUD.
  - El índice vive en database/chroma/ (junto con app.db).

Funciones públicas:
  index_hoja(hoja_id, contenido, categoria_nombre, tipo) -> bool
  delete_hoja(hoja_id) -> bool
  search_hojas(query, top_k=5) -> list[dict]
  backfill_missing(hojas) -> int
"""

from __future__ import annotations

import logging
import os
import hashlib
import html
import re
from pathlib import Path

import httpx

from app.config import DEBUG
from app.paths import database_directory

logger = logging.getLogger(__name__)

OLLAMA_BASE  = os.getenv("OLLAMA_BASE_URL",    "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL_EMBED", "nomic-embed-text")
COLLECTION   = "hojas"

# Instancias lazy — se crean en el primer uso
_chroma_client = None
_collection    = None


# ── Disponibilidad ─────────────────────────────────────────────────────────────

def _ollama_available() -> bool:
    try:
        r = httpx.get(f"{OLLAMA_BASE}/api/tags", timeout=3)
        return r.status_code == 200
    except Exception:
        return False


# ── ChromaDB ───────────────────────────────────────────────────────────────────

def _chroma_dir() -> Path:
    return database_directory() / "chroma"


def _get_collection():
    global _chroma_client, _collection
    if _collection is None:
        import chromadb
        _chroma_client = chromadb.PersistentClient(path=str(_chroma_dir()))
        # Sin función de embedding propia: pasamos vectores explícitamente
        _collection = _chroma_client.get_or_create_collection(
            name=COLLECTION,
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


# ── Embeddings ─────────────────────────────────────────────────────────────────

def embed_text(text: str) -> list[float] | None:
    """Genera embedding via Ollama. Devuelve None si no está disponible."""
    try:
        with httpx.Client(timeout=15) as client:
            r = client.post(
                f"{OLLAMA_BASE}/api/embeddings",
                json={"model": OLLAMA_MODEL, "prompt": text},
            )
            r.raise_for_status()
            vec = r.json().get("embedding", [])
            return vec if vec else None
    except Exception as exc:
        logger.warning("[semantic] embed_text: %s", exc)
        return None


def _texto_indexado(contenido: str, categoria_nombre: str, apuntes: str) -> str:
    cuerpo = html.unescape(re.sub(r"<[^>]+>", " ", apuntes or ""))
    cuerpo = re.sub(r"\s+", " ", cuerpo).strip()
    return f"{contenido or ''} [{categoria_nombre or ''}]\n{cuerpo}"


def _firma_hoja(contenido: str, categoria_nombre: str, tipo: str, apuntes: str) -> str:
    texto = _texto_indexado(contenido, categoria_nombre, apuntes)
    return hashlib.sha256(f"{tipo}\n{texto}".encode("utf-8")).hexdigest()


# ── Operaciones sobre el índice ────────────────────────────────────────────────

def index_hoja(hoja_id: int, contenido: str,
               categoria_nombre: str = "", tipo: str = "texto",
               apuntes: str = "") -> bool:
    """Indexa (o re-indexa) una hoja. Devuelve False si falla."""
    try:
        text = _texto_indexado(contenido, categoria_nombre, apuntes)
        vec = embed_text(text)
        if vec is None:
            return False
        col = _get_collection()
        col.upsert(
            ids=[str(hoja_id)],
            embeddings=[vec],
            metadatas=[{
                "categoria": categoria_nombre or "",
                "tipo":      tipo or "texto",
                "contenido": contenido[:300],
                "firma": _firma_hoja(contenido, categoria_nombre, tipo, apuntes),
            }],
        )
        if DEBUG:
            logger.debug("[semantic] indexed hoja %d", hoja_id)
        return True
    except Exception as exc:
        logger.warning("[semantic] index_hoja(%d): %s", hoja_id, exc)
        return False


def delete_hoja(hoja_id: int) -> bool:
    """Elimina una hoja del índice. Devuelve False si falla."""
    try:
        col = _get_collection()
        col.delete(ids=[str(hoja_id)])
        return True
    except Exception as exc:
        logger.warning("[semantic] delete_hoja(%d): %s", hoja_id, exc)
        return False


def search_hojas(query: str, top_k: int = 5) -> list[dict]:
    """
    Búsqueda semántica. Devuelve lista de dicts:
      {hoja_id, score, contenido, categoria, tipo}
    Devuelve [] si Ollama no está disponible o el índice está vacío.
    """
    try:
        vec = embed_text(query)
        if vec is None:
            return []
        col = _get_collection()
        total = col.count()
        if total == 0:
            return []
        results = col.query(
            query_embeddings=[vec],
            n_results=min(top_k, total),
            include=["metadatas", "distances"],
        )
        hits = []
        for i, doc_id in enumerate(results["ids"][0]):
            meta     = results["metadatas"][0][i]
            distance = results["distances"][0][i]
            hits.append({
                "hoja_id":  int(doc_id),
                "score":    round(1 - distance, 3),   # cosine distance → similarity
                "contenido": meta.get("contenido", ""),
                "categoria": meta.get("categoria", ""),
                "tipo":      meta.get("tipo", ""),
            })
        return hits
    except Exception as exc:
        logger.warning("[semantic] search_hojas: %s", exc)
        return []


def backfill_missing(hojas: list[dict], *, force: bool = False) -> int:
    """
    Indexa las hojas que no estén en ChromaDB.
    Devuelve la cantidad indexada (0 si Ollama no disponible).
    """
    try:
        col      = _get_collection()
        indexed = col.get(include=["metadatas"])
        existing = dict(zip(indexed["ids"], indexed["metadatas"]))
        valid_ids = {str(h["id"]) for h in hojas}
        stale = [doc_id for doc_id in existing if doc_id not in valid_ids]
        if stale:
            col.delete(ids=stale)
        if not _ollama_available():
            return 0
        missing = [
            h for h in hojas
            if force or (existing.get(str(h["id"])) or {}).get("firma") != _firma_hoja(
                h.get("contenido") or "", h.get("categoria_nombre") or "",
                h.get("tipo") or "texto", h.get("apuntes") or "",
            )
        ]
        count    = 0
        for h in missing:
            ok = index_hoja(
                h["id"],
                h.get("contenido") or "",
                h.get("categoria_nombre") or "",
                h.get("tipo") or "texto",
                h.get("apuntes") or "",
            )
            if ok:
                count += 1
        return count
    except Exception as exc:
        logger.warning("[semantic] backfill_missing: %s", exc)
        return 0
