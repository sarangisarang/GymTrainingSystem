"""Chroma vector store for semantic search over exercises and workouts (Issue #27).

Two collections:
  - `exercises_knowledge`: one document per Exercise (public fitness knowledge).
  - `workouts`: one document per Workout, scoped to its user via metadata.

The whole module is defensive:
  - If `chromadb` cannot be imported (e.g. dependency missing in some env), all
    index/search calls become no-ops and search endpoints return [].
  - If the embedding model is unavailable (e.g. no network for ONNX download),
    calls log a warning and skip rather than 500.

Environment variables:
  CHROMA_DB_PATH        Directory for the persistent client. Empty/unset → in-memory
                        ephemeral client (useful for tests).
  CHROMA_EMBED_MODE     "default" (ONNX MiniLM, downloads ~25 MB on first use) or
                        "hash" (deterministic char-trigram embedding, no model
                        download, used in tests).
  CHROMA_DISABLED       "1" to skip all vector ops entirely (kill switch).

Storage layout on Render's ephemeral disk: `./chroma_db/` is wiped on every deploy,
so the bootstrap re-indexes all exercises on startup. Workouts are re-indexed
lazily when the user next creates/updates one (acceptable for a school demo;
production would use Chroma's HTTP server or pgvector).
"""
from __future__ import annotations

import hashlib
import logging
import os
import threading
from typing import Iterable, TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

_EXERCISES_COLLECTION = "exercises_knowledge"
_WORKOUTS_COLLECTION = "workouts"

_client = None
_client_lock = threading.Lock()


def _is_disabled() -> bool:
    return os.getenv("CHROMA_DISABLED", "").strip() == "1"


def _hash_embedding(text: str, dims: int = 64) -> list[float]:
    """Deterministic embedding for tests. Char-trigram counts hashed into `dims`
    buckets, then L2-normalised. Produces stable, semantically-shallow vectors:
    queries that share trigrams with stored docs rank higher, which is enough
    to exercise the indexing and search plumbing in tests without an ONNX model.
    """
    vec = [0.0] * dims
    text = text.lower()
    for i in range(len(text) - 2):
        trigram = text[i : i + 3]
        h = int(hashlib.md5(trigram.encode("utf-8")).hexdigest()[:8], 16)
        vec[h % dims] += 1.0
    norm = sum(v * v for v in vec) ** 0.5
    if norm == 0:
        return vec
    return [v / norm for v in vec]


def _make_hash_embedding_function():
    """Build a Chroma-protocol-compliant hash embedding function. Defined as a
    function so the chromadb import happens lazily (the module must work even
    if chromadb is missing or disabled)."""
    from chromadb.api.types import Documents, EmbeddingFunction, Embeddings

    class HashEmbeddingFunction(EmbeddingFunction[Documents]):
        def __init__(self) -> None:
            pass

        def __call__(self, input: Documents) -> Embeddings:  # noqa: A002
            return [_hash_embedding(text) for text in input]

        @staticmethod
        def name() -> str:
            return "hash"

        def get_config(self) -> dict:
            return {}

        @classmethod
        def build_from_config(cls, config: dict) -> "HashEmbeddingFunction":
            return cls()

    return HashEmbeddingFunction()


def _get_embedding_function():
    mode = os.getenv("CHROMA_EMBED_MODE", "default").lower()
    if mode == "hash":
        return _make_hash_embedding_function()
    try:
        from chromadb.utils import embedding_functions

        return embedding_functions.DefaultEmbeddingFunction()
    except Exception as exc:  # ImportError, runtime errors during model load
        logger.warning(
            "Chroma default embedding unavailable (%s); falling back to hash mode. "
            "Set CHROMA_EMBED_MODE=hash explicitly to silence this warning.",
            exc,
        )
        return _make_hash_embedding_function()


def _get_client():
    """Lazy singleton. Returns None if chromadb is missing or disabled."""
    global _client
    if _is_disabled():
        return None
    if _client is not None:
        return _client
    with _client_lock:
        if _client is not None:
            return _client
        try:
            import chromadb
            from chromadb.config import Settings

            path = os.getenv("CHROMA_DB_PATH", "").strip()
            # `allow_reset=True` is only meaningful in tests (so reset_for_tests
            # can fully wipe the in-memory client between cases). In prod it's
            # harmless because no caller invokes client.reset().
            settings = Settings(anonymized_telemetry=False, allow_reset=True)
            if path:
                _client = chromadb.PersistentClient(path=path, settings=settings)
            else:
                _client = chromadb.EphemeralClient(settings=settings)
            return _client
        except Exception as exc:  # ImportError or chroma init failure
            logger.warning("Chroma client init failed (%s); vector search disabled.", exc)
            return None


def _get_collection(name: str):
    client = _get_client()
    if client is None:
        return None
    try:
        return client.get_or_create_collection(
            name=name,
            embedding_function=_get_embedding_function(),
        )
    except Exception as exc:
        logger.warning("Chroma collection %s unavailable (%s); skipping.", name, exc)
        return None


def _exercise_document(exercise) -> str:
    parts = [exercise.name, exercise.muscle_group]
    if getattr(exercise, "description", None):
        parts.append(exercise.description)
    return " | ".join(p for p in parts if p)


def _workout_document(workout, exercise_names: Iterable[str]) -> str:
    parts: list[str] = []
    if getattr(workout, "notes", None):
        parts.append(workout.notes)
    names = [n for n in exercise_names if n]
    if names:
        parts.append("Übungen: " + ", ".join(names))
    if getattr(workout, "status", None):
        parts.append(f"Status: {workout.status}")
    return " | ".join(parts) if parts else "Workout"


def index_exercise(exercise) -> None:
    col = _get_collection(_EXERCISES_COLLECTION)
    if col is None:
        return
    try:
        col.upsert(
            ids=[str(exercise.id)],
            documents=[_exercise_document(exercise)],
            metadatas=[{
                "muscle_group": exercise.muscle_group or "",
                "name": exercise.name or "",
            }],
        )
    except Exception as exc:
        logger.warning("Chroma index_exercise(%s) failed: %s", exercise.id, exc)


def remove_exercise_from_index(exercise_id) -> None:
    col = _get_collection(_EXERCISES_COLLECTION)
    if col is None:
        return
    try:
        col.delete(ids=[str(exercise_id)])
    except Exception as exc:
        logger.warning("Chroma remove_exercise(%s) failed: %s", exercise_id, exc)


def index_workout(workout, db: "Session") -> None:
    """Build a textual representation of the workout (notes + exercise names)
    and upsert it into the workouts collection. The user_id is stored as
    metadata so search can filter to the owner.
    """
    col = _get_collection(_WORKOUTS_COLLECTION)
    if col is None:
        return
    try:
        from .models import Exercise, WorkoutExercise

        names = [
            row.name
            for row in db.query(Exercise.name)
            .join(WorkoutExercise, WorkoutExercise.exercise_id == Exercise.id)
            .filter(WorkoutExercise.workout_id == str(workout.id))
            .all()
        ]
        col.upsert(
            ids=[str(workout.id)],
            documents=[_workout_document(workout, names)],
            metadatas=[{
                "user_id": str(workout.user_id),
                "status": workout.status or "PLANNED",
                "date": workout.date.isoformat() if workout.date else "",
            }],
        )
    except Exception as exc:
        logger.warning("Chroma index_workout(%s) failed: %s", workout.id, exc)


def remove_workout_from_index(workout_id) -> None:
    col = _get_collection(_WORKOUTS_COLLECTION)
    if col is None:
        return
    try:
        col.delete(ids=[str(workout_id)])
    except Exception as exc:
        logger.warning("Chroma remove_workout(%s) failed: %s", workout_id, exc)


def remove_user_workouts_from_index(user_id) -> None:
    """Bulk-delete every workout owned by this user from the workouts
    collection. Used by the DSGVO account-delete flow (Issue #29). Relies on
    the same `user_id` metadata that `index_workout` writes, so it stays in
    sync without a SQL join.
    """
    col = _get_collection(_WORKOUTS_COLLECTION)
    if col is None:
        return
    try:
        col.delete(where={"user_id": str(user_id)})
    except Exception as exc:
        logger.warning(
            "Chroma remove_user_workouts(%s) failed: %s", user_id, exc
        )


def _format_results(raw) -> list[dict]:
    """Chroma returns nested lists (one per query). We always query with a single
    text, so flatten the first row and zip into dicts.
    """
    if not raw or not raw.get("ids") or not raw["ids"][0]:
        return []
    ids = raw["ids"][0]
    docs = (raw.get("documents") or [[]])[0]
    metas = (raw.get("metadatas") or [[]])[0]
    dists = (raw.get("distances") or [[]])[0]
    out: list[dict] = []
    for i, _id in enumerate(ids):
        out.append({
            "id": _id,
            "document": docs[i] if i < len(docs) else "",
            "metadata": metas[i] if i < len(metas) else {},
            "distance": dists[i] if i < len(dists) else None,
        })
    return out


def search_exercises(query: str, limit: int = 10) -> list[dict]:
    col = _get_collection(_EXERCISES_COLLECTION)
    if col is None or not query.strip():
        return []
    try:
        # n_results cannot exceed the collection size; chroma raises otherwise.
        count = col.count()
        if count == 0:
            return []
        raw = col.query(query_texts=[query], n_results=min(limit, count))
        return _format_results(raw)
    except Exception as exc:
        logger.warning("Chroma search_exercises failed: %s", exc)
        return []


def search_workouts(user_id, query: str, limit: int = 10) -> list[dict]:
    """User-scoped search. The `where` filter pins results to this user's
    workouts so one user cannot probe another user's history via the vector index.
    """
    col = _get_collection(_WORKOUTS_COLLECTION)
    if col is None or not query.strip():
        return []
    try:
        count = col.count()
        if count == 0:
            return []
        raw = col.query(
            query_texts=[query],
            n_results=min(limit, count),
            where={"user_id": str(user_id)},
        )
        return _format_results(raw)
    except Exception as exc:
        logger.warning("Chroma search_workouts failed: %s", exc)
        return []


def bootstrap_exercise_index(db: "Session") -> int:
    """Index every Exercise row currently in the DB. Idempotent (upsert). Called
    once on app startup so the exercises collection is warm even after a fresh
    Render deploy wiped the ephemeral chroma_db directory.

    Returns the number of exercises indexed (for logging).
    """
    if _get_client() is None:
        return 0
    try:
        from .models import Exercise

        exercises = db.query(Exercise).all()
        for ex in exercises:
            index_exercise(ex)
        return len(exercises)
    except Exception as exc:
        logger.warning("Chroma bootstrap_exercise_index failed: %s", exc)
        return 0


def reset_for_tests() -> None:
    """Wipe all Chroma state. Used by the autouse pytest fixture to isolate
    tests. Chroma's EphemeralClient shares its underlying system manager
    between client instances, so just dropping the Python reference is not
    enough; we explicitly call `client.reset()` first when possible.
    """
    global _client
    with _client_lock:
        if _client is not None:
            try:
                _client.reset()
            except Exception as exc:
                logger.debug("Chroma client.reset() failed (ignored): %s", exc)
        _client = None
