"""
Índice de embeddings en ChromaDB.

ChromaDB es un índice reconstruible, no la fuente de verdad — el vault
Markdown + SQLite lo son (spec §9, §18). Si esta colección se pierde,
puede reconstruirse re-embebiendo memory_entries.
"""
from jarvis.config import JARVIS_CHROMA_PATH

_COLLECTION_NAME = "jarvis_memory"
_client = None


def _get_client():
    global _client
    if _client is None:
        import chromadb

        JARVIS_CHROMA_PATH.mkdir(parents=True, exist_ok=True)
        _client = chromadb.PersistentClient(path=str(JARVIS_CHROMA_PATH))
    return _client


def get_collection():
    return _get_client().get_or_create_collection(_COLLECTION_NAME)


def upsert_embedding(
    entry_id: str,
    embedding: list[float],
    document: str,
    metadata: dict,
) -> None:
    """Inserta o actualiza el embedding de una memory_entry en ChromaDB."""
    collection = get_collection()
    collection.upsert(
        ids=[entry_id],
        embeddings=[embedding],
        documents=[document],
        metadatas=[metadata],
    )
