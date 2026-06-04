"""Tests for the RAG knowledge base (Issue #32).

Run against Chroma's deterministic hash embedding (no model download) and an
in-memory ephemeral client, so the test is fast and offline-safe.
"""
import importlib

import pytest


@pytest.fixture()
def knowledge_store(monkeypatch):
    monkeypatch.setenv("CHROMA_EMBED_MODE", "hash")
    monkeypatch.delenv("CHROMA_DB_PATH", raising=False)
    monkeypatch.delenv("CHROMA_DISABLED", raising=False)

    # Fresh in-memory client for this test so collections start empty.
    from data_base_sql import vector_store
    vector_store._client = None

    from data_base_sql import knowledge_store as ks
    importlib.reload(ks)
    return ks


def test_index_knowledge_populates_collection(knowledge_store):
    count = knowledge_store.index_knowledge()
    # The curated base has well over 20 entries.
    assert count >= 20


def test_search_returns_relevant_snippet(knowledge_store):
    knowledge_store.index_knowledge()
    hits = knowledge_store.search_knowledge("Wie viel Protein brauche ich für Muskelaufbau?", limit=3)
    assert hits, "expected at least one knowledge hit"
    # The protein entry should surface for a protein question.
    assert any("Protein" in h["document"] for h in hits)


def test_search_lazily_indexes(knowledge_store):
    # Without an explicit index_knowledge() call, search should still work
    # because it indexes lazily on first use.
    hits = knowledge_store.search_knowledge("Grundübungen Kniebeuge", limit=2)
    assert hits


def test_empty_query_returns_empty(knowledge_store):
    assert knowledge_store.search_knowledge("   ") == []
