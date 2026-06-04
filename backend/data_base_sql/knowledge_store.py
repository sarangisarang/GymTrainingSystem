"""RAG knowledge store for the KI-Coach (Issue #32).

Indexes the curated fitness knowledge base (knowledge_base.py) into its own
Chroma collection and retrieves the most relevant snippets for a user question.
The actual Chroma plumbing (client, embedding function, result formatting) is
reused from vector_store.py (Issue #27), so this module inherits the same
defensive behaviour: if chromadb or the embedding model is unavailable,
indexing and search simply become no-ops and the coach falls back to working
without retrieved knowledge.
"""
from __future__ import annotations

import logging

from data_base_sql.knowledge_base import KNOWLEDGE
from data_base_sql.vector_store import _format_results, _get_collection

logger = logging.getLogger(__name__)

_KNOWLEDGE_COLLECTION = "fitness_knowledge"


def index_knowledge() -> int:
    """Idempotently (re)index the curated knowledge base.

    Returns the number of documents in the collection afterwards, or 0 if the
    vector store is unavailable.
    """
    col = _get_collection(_KNOWLEDGE_COLLECTION)
    if col is None:
        return 0
    try:
        col.upsert(
            ids=[entry["id"] for entry in KNOWLEDGE],
            documents=[entry["text"] for entry in KNOWLEDGE],
            metadatas=[{"topic": entry["topic"]} for entry in KNOWLEDGE],
        )
        return col.count()
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("index_knowledge failed: %s", exc)
        return 0


def search_knowledge(query: str, limit: int = 3) -> list[dict]:
    """Return the most relevant knowledge snippets for `query` (possibly empty).

    The collection is lazily indexed on first use so the knowledge base is
    available even on Render's ephemeral disk, which is wiped on every deploy.
    """
    col = _get_collection(_KNOWLEDGE_COLLECTION)
    if col is None or not query.strip():
        return []
    try:
        if col.count() == 0:
            index_knowledge()
        count = col.count()
        if count == 0:
            return []
        raw = col.query(query_texts=[query], n_results=min(limit, count))
        return _format_results(raw)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("search_knowledge failed: %s", exc)
        return []
