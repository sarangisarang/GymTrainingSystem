"""Semantic-search endpoints backed by the Chroma vector store (Issue #27).

`/search/exercises` is public (matches the existing `/exercises/` list behavior).
`/search/workouts` is auth-protected and scoped to the calling user; the user_id
filter is applied inside the vector store so cross-user leakage is impossible.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from .security import get_current_user
from data_base_sql.database import get_db
from data_base_sql.vector_store import (
    search_exercises,
    search_workouts,
)
from data_base_sql.models import Exercise, Workout

router = APIRouter(prefix="/search", tags=["Search"])


def _enrich_exercise_hits(db: Session, hits: list[dict]) -> list[dict]:
    """Vector hits carry the doc text and metadata. Front-end wants the full
    Exercise row (so it can render image_url, link to detail page, etc.). Fetch
    all matched exercises in one query and merge.
    """
    if not hits:
        return []
    ids = [h["id"] for h in hits]
    rows = {row.id: row for row in db.query(Exercise).filter(Exercise.id.in_(ids)).all()}
    out: list[dict] = []
    for h in hits:
        row = rows.get(h["id"])
        if row is None:
            continue
        out.append({
            "id": row.id,
            "name": row.name,
            "muscle_group": row.muscle_group,
            "description": row.description,
            "image_url": row.image_url,
            "distance": h.get("distance"),
        })
    return out


def _enrich_workout_hits(db: Session, hits: list[dict]) -> list[dict]:
    if not hits:
        return []
    ids = [h["id"] for h in hits]
    rows = {row.id: row for row in db.query(Workout).filter(Workout.id.in_(ids)).all()}
    out: list[dict] = []
    for h in hits:
        row = rows.get(h["id"])
        if row is None:
            continue
        out.append({
            "id": row.id,
            "date": row.date.isoformat() if row.date else None,
            "notes": row.notes,
            "status": row.status,
            "distance": h.get("distance"),
        })
    return out


@router.get("/exercises")
def api_search_exercises(
    q: str = Query(..., min_length=1, description="Natural-language search query"),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    hits = search_exercises(q, limit=limit)
    return _enrich_exercise_hits(db, hits)


@router.get("/workouts")
def api_search_workouts(
    q: str = Query(..., min_length=1, description="Natural-language search query"),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    hits = search_workouts(current_user.id, q, limit=limit)
    return _enrich_workout_hits(db, hits)
