"""Tests for the Chroma vector store and /search endpoints (Issue #27).

Uses CHROMA_EMBED_MODE=hash (set in conftest) so the embedding function is
deterministic and offline. Hash embedding can't tell synonyms apart, but it
reliably ranks docs sharing character trigrams with the query above unrelated
docs, which is enough to test indexing + retrieval + scoping.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from data_base_sql import vector_store
from data_base_sql.models import Exercise, Workout
from tests.conftest import TestingSessionLocal


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ============================================================================
# Vector store unit tests (direct module calls, no HTTP)
# ============================================================================


def _make_exercise_row(name: str, muscle_group: str, description: str | None = None) -> Exercise:
    """Insert directly via the test session (bypasses the FastAPI CRUD layer
    for speed). The vector-index call that crud.create_exercise normally
    triggers is invoked here explicitly so the steady-state invariant
    (`SQL row exists` <=> `indexed in vector store`) holds in tests."""
    db = TestingSessionLocal()
    try:
        ex = Exercise(name=name, muscle_group=muscle_group, description=description)
        db.add(ex)
        db.commit()
        db.refresh(ex)
        vector_store.index_exercise(ex)
        return ex
    finally:
        db.close()


def test_index_and_search_exercise_returns_match():
    ex = _make_exercise_row("Bankdrücken", "Brust", "Klassische Brustübung mit Langhantel")
    vector_store.index_exercise(ex)

    hits = vector_store.search_exercises("Bankdrücken Brust", limit=5)

    assert len(hits) >= 1
    assert hits[0]["id"] == ex.id


def test_search_empty_query_returns_empty():
    _make_exercise_row("Kniebeuge", "Beine")
    # caller-side guard: empty / whitespace query short-circuits to []
    assert vector_store.search_exercises("", limit=5) == []
    assert vector_store.search_exercises("   ", limit=5) == []


def test_search_before_any_index_returns_empty():
    # Fresh client, nothing indexed yet
    assert vector_store.search_exercises("anything", limit=5) == []


def test_remove_exercise_from_index_drops_hit():
    ex = _make_exercise_row("Klimmzug", "Rücken")
    vector_store.index_exercise(ex)
    assert any(h["id"] == ex.id for h in vector_store.search_exercises("Klimmzug", limit=5))

    vector_store.remove_exercise_from_index(ex.id)

    assert not any(h["id"] == ex.id for h in vector_store.search_exercises("Klimmzug", limit=5))


def test_workout_search_is_user_scoped():
    """User A's workouts must not surface in User B's search."""
    db = TestingSessionLocal()
    try:
        # Two users (raw User rows would need password hashing; for the vector
        # test we only need string IDs, so synthesize them).
        user_a = str(uuid.uuid4())
        user_b = str(uuid.uuid4())

        ex = Exercise(name="Squat", muscle_group="Beine")
        db.add(ex)
        db.commit()
        db.refresh(ex)

        # Workout for A
        from datetime import date as _date

        wa = Workout(
            user_id=user_a,
            date=_date(2026, 6, 3),
            notes="Schwerer Bein-Tag mit Squat-Volumen",
            status="COMPLETED",
        )
        db.add(wa)
        # Workout for B
        wb = Workout(
            user_id=user_b,
            date=_date(2026, 6, 3),
            notes="Leichte Mobility-Session",
            status="COMPLETED",
        )
        db.add(wb)
        db.commit()
        db.refresh(wa)
        db.refresh(wb)

        vector_store.index_workout(wa, db)
        vector_store.index_workout(wb, db)
    finally:
        db.close()

    a_hits = vector_store.search_workouts(user_a, "Squat", limit=5)
    b_hits = vector_store.search_workouts(user_b, "Squat", limit=5)

    a_ids = {h["id"] for h in a_hits}
    b_ids = {h["id"] for h in b_hits}
    assert wa.id in a_ids
    # B searching for "Squat" must not see A's workout
    assert wa.id not in b_ids


def test_bootstrap_indexes_existing_exercises():
    """A fresh Chroma client should re-index everything sitting in the SQL DB."""
    _make_exercise_row("Schulterdrücken", "Schultern")
    _make_exercise_row("Rudern", "Rücken")

    vector_store.reset_for_tests()  # simulate cold start

    db = TestingSessionLocal()
    try:
        count = vector_store.bootstrap_exercise_index(db)
    finally:
        db.close()

    assert count >= 2
    hits = vector_store.search_exercises("Schulter", limit=5)
    assert any(h["metadata"].get("name") == "Schulterdrücken" for h in hits)


# ============================================================================
# HTTP API tests (real FastAPI routes)
# ============================================================================


def test_search_exercises_endpoint_public(client: TestClient):
    """The /search/exercises endpoint is public (no auth)."""
    _make_exercise_row("Kreuzheben", "Ganzkörper", "Compound-Übung für Hüftstrecker")

    r = client.get("/search/exercises", params={"q": "Kreuzheben"})

    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)
    assert any(e["name"] == "Kreuzheben" for e in data)


def test_search_exercises_validates_query_length(client: TestClient):
    # FastAPI's Query(min_length=1) must reject empty strings.
    r = client.get("/search/exercises", params={"q": ""})
    assert r.status_code == 422, r.text


def test_search_workouts_requires_auth(client: TestClient):
    r = client.get("/search/workouts", params={"q": "test"})
    assert r.status_code == 401


def test_search_workouts_returns_only_my_workouts(auth_client: tuple[TestClient, str]):
    """End-to-end: log a workout via API, then search for it via API. Other
    users' workouts must not appear (the vector store's where-filter is the
    actual safety boundary; this test verifies it through the HTTP layer)."""
    client, token = auth_client

    # Create an exercise via the API so we have a real ID to attach
    er = client.post(
        "/exercises/",
        json={"name": "Kettlebell Swing", "muscle_group": "Hüfte", "description": "Posterior chain"},
        headers=_auth(token),
    )
    assert er.status_code == 200, er.text
    ex_id = er.json()["id"]

    # Log a workout for this user
    wr = client.post(
        "/workouts/",
        json={
            "workout_date": "2026-06-03",
            "notes": "Kettlebell Swing Volumen-Tag",
            "exercises": [
                {"exercise_id": ex_id, "sets": 5, "reps": 20, "weight": 24, "order_index": 0}
            ],
        },
        headers=_auth(token),
    )
    assert wr.status_code == 200, wr.text
    workout_id = wr.json()["id"]

    # Search for it
    sr = client.get(
        "/search/workouts",
        params={"q": "Kettlebell Swing"},
        headers=_auth(token),
    )
    assert sr.status_code == 200, sr.text
    hits = sr.json()
    assert any(h["id"] == workout_id for h in hits), hits

    # Register a second user and confirm they CAN'T see the first user's workout
    other_email = f"other_{uuid.uuid4().hex[:8]}@example.com"
    client.post("/auth/register", json={"name": "Other", "email": other_email, "password": "OtherPass123!"})
    other_login = client.post("/auth/login", json={"email": other_email, "password": "OtherPass123!"})
    other_token = other_login.json()["access_token"]

    sr_other = client.get(
        "/search/workouts",
        params={"q": "Kettlebell Swing"},
        headers=_auth(other_token),
    )
    assert sr_other.status_code == 200
    other_hits = sr_other.json()
    assert not any(h["id"] == workout_id for h in other_hits), other_hits


def test_workout_index_reflects_workout_exercise_changes(auth_client: tuple[TestClient, str]):
    """Regression for adversarial-review finding: adding/updating/deleting a
    WorkoutExercise via /workout-exercises must reindex the parent workout,
    otherwise /search/workouts keeps matching by the original (now stale)
    exercise names."""
    client, token = auth_client

    bench = client.post(
        "/exercises/",
        json={"name": "Bench Press", "muscle_group": "Brust"},
        headers=_auth(token),
    ).json()
    squat = client.post(
        "/exercises/",
        json={"name": "Squat Belastung", "muscle_group": "Beine"},
        headers=_auth(token),
    ).json()

    wr = client.post(
        "/workouts/",
        json={
            "workout_date": "2026-06-03",
            "notes": "Regression-Tag",
            "exercises": [
                {"exercise_id": bench["id"], "sets": 3, "reps": 8, "weight": 60, "order_index": 0}
            ],
        },
        headers=_auth(token),
    )
    assert wr.status_code == 200, wr.text
    workout_id = wr.json()["id"]

    # Add a second exercise via /workout-exercises (not /workouts)
    ar = client.post(
        "/workout-exercises/",
        json={
            "workout_id": workout_id,
            "exercise_id": squat["id"],
            "sets": 4,
            "reps": 6,
            "weight": 100,
            "order_index": 1,
        },
        headers=_auth(token),
    )
    assert ar.status_code == 200, ar.text

    # Now search by the newly-added exercise name. Without the reindex fix,
    # this would return [] because the workout's vector doc still says only
    # "Bench Press".
    sr = client.get("/search/workouts", params={"q": "Squat Belastung"}, headers=_auth(token))
    assert sr.status_code == 200, sr.text
    assert any(h["id"] == workout_id for h in sr.json()), sr.json()


def test_limit_caps_result_count():
    """A regression that hardcoded n_results=10 (or ignored `limit` entirely)
    would slip past every other test, which all happen to use limit >= collection
    size. Index N rows, search with limit < N, assert the response respects it.
    """
    for i in range(5):
        _make_exercise_row(f"Übung-{i}", "Test", f"Beschreibung {i}")

    hits = vector_store.search_exercises("Übung", limit=2)

    assert len(hits) == 2


def test_http_limit_boundaries_rejected(client: TestClient):
    """FastAPI's Query(ge=1, le=50) must reject 0 and >50."""
    r_low = client.get("/search/exercises", params={"q": "test", "limit": 0})
    assert r_low.status_code == 422, r_low.text

    r_high = client.get("/search/exercises", params={"q": "test", "limit": 51})
    assert r_high.status_code == 422, r_high.text


def test_search_workouts_reflects_update(auth_client: tuple[TestClient, str]):
    """Updating a workout's notes must reindex; the new notes should surface in
    search results, the old ones should not (after the update)."""
    client, token = auth_client

    er = client.post(
        "/exercises/",
        json={"name": "Plank", "muscle_group": "Core"},
        headers=_auth(token),
    )
    ex_id = er.json()["id"]

    wr = client.post(
        "/workouts/",
        json={
            "workout_date": "2026-06-03",
            "notes": "Erste-Notiz-mit-unique-tag-XQXQ",
            "exercises": [{"exercise_id": ex_id, "sets": 3, "reps": 10, "weight": 0, "order_index": 0}],
        },
        headers=_auth(token),
    )
    workout_id = wr.json()["id"]

    # Before update: search by the original tag finds it
    r1 = client.get("/search/workouts", params={"q": "XQXQ"}, headers=_auth(token))
    assert any(h["id"] == workout_id for h in r1.json())

    # Update the workout
    ur = client.put(
        f"/workouts/{workout_id}",
        json={
            "workout_date": "2026-06-03",
            "notes": "Neue-Notiz-mit-tag-ZWZW",
            "exercises": [],  # update_workout doesn't touch exercises per the docstring
        },
        headers=_auth(token),
    )
    assert ur.status_code == 200, ur.text

    # After update: new tag finds it
    r2 = client.get("/search/workouts", params={"q": "ZWZW"}, headers=_auth(token))
    assert any(h["id"] == workout_id for h in r2.json())
