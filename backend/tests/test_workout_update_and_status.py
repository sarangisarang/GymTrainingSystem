"""Regression tests for the WorkoutUpdate contract (#3) and the workout status
lifecycle (#4).

  #3  PUT /workouts/{id} now binds a dedicated `WorkoutUpdate` schema that has no
      `exercises` field, so the request body no longer advertises something the
      endpoint silently ignores. Exercises are managed via /workout-exercises.
  #4  status is now a Literal (invalid → 422, not a route-level 400), and
      `completed_at` is cleared when a workout leaves the COMPLETED state.
"""
from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _register(client: TestClient) -> str:
    email = f"wu_{uuid.uuid4().hex[:10]}@example.com"
    password = "TestPass123!"
    client.post("/auth/register", json={"name": "Tester", "email": email, "password": password})
    r = client.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _make_exercise(client: TestClient, token: str, name: str) -> str:
    r = client.post(
        "/exercises/",
        json={"name": name, "muscle_group": "Chest", "description": "fixture"},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _make_workout_with_exercise(client: TestClient, token: str, exercise_id: str) -> dict:
    r = client.post(
        "/workouts/",
        json={
            "workout_date": "2026-06-01",
            "notes": "original",
            "exercises": [{"exercise_id": exercise_id, "sets": 3, "reps": 10, "order_index": 0}],
        },
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    return r.json()


# ── #3 WorkoutUpdate contract ────────────────────────────────────────────────


def test_update_workout_changes_date_and_notes(client: TestClient):
    token = _register(client)
    ex = _make_exercise(client, token, "Bench WU1")
    w = _make_workout_with_exercise(client, token, ex)

    r = client.put(
        f"/workouts/{w['id']}",
        json={"workout_date": "2026-07-15", "notes": "updated"},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["date"] == "2026-07-15"
    assert body["notes"] == "updated"


def test_update_workout_ignores_exercises_in_body(client: TestClient):
    """An `exercises` array in the PUT body is ignored (extra field), and the
    workout's existing exercises are left untouched — documenting that exercise
    management lives on /workout-exercises, not here."""
    token = _register(client)
    ex1 = _make_exercise(client, token, "Bench WU2a")
    ex2 = _make_exercise(client, token, "Bench WU2b")
    w = _make_workout_with_exercise(client, token, ex1)
    assert len(w["workout_exercises"]) == 1

    r = client.put(
        f"/workouts/{w['id']}",
        json={
            "workout_date": "2026-07-20",
            "notes": "still one exercise",
            "exercises": [
                {"exercise_id": ex2, "sets": 9, "reps": 9, "order_index": 0},
                {"exercise_id": ex1, "sets": 9, "reps": 9, "order_index": 1},
            ],
        },
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    # Exercises unchanged: still exactly the original one.
    body = r.json()
    assert len(body["workout_exercises"]) == 1
    assert body["workout_exercises"][0]["exercise_id"] == ex1


# ── #4 status lifecycle ──────────────────────────────────────────────────────


def test_status_rejects_invalid_value_422(client: TestClient):
    """Invalid status is now rejected by the Literal schema → 422 (was a
    route-level 400)."""
    token = _register(client)
    ex = _make_exercise(client, token, "Bench ST1")
    w = _make_workout_with_exercise(client, token, ex)

    r = client.patch(
        f"/workouts/{w['id']}/status",
        json={"status": "BOGUS"},
        headers=_auth(token),
    )
    assert r.status_code == 422, r.text


def test_completed_at_set_then_cleared_when_leaving_completed(client: TestClient):
    token = _register(client)
    ex = _make_exercise(client, token, "Bench ST2")
    w = _make_workout_with_exercise(client, token, ex)

    # → COMPLETED stamps completed_at
    r1 = client.patch(
        f"/workouts/{w['id']}/status",
        json={"status": "COMPLETED", "duration_seconds": 1200},
        headers=_auth(token),
    )
    assert r1.status_code == 200, r1.text
    assert r1.json()["completed_at"] is not None

    # → back to PLANNED clears it (no longer completed)
    r2 = client.patch(
        f"/workouts/{w['id']}/status",
        json={"status": "PLANNED"},
        headers=_auth(token),
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["status"] == "PLANNED"
    assert r2.json()["completed_at"] is None


def test_completed_at_stable_on_recomplete(client: TestClient):
    """Re-PATCHing an already-COMPLETED workout must NOT re-stamp completed_at
    (existing /new-prs ordering guard) — locked here so the #4 change doesn't
    regress it."""
    token = _register(client)
    ex = _make_exercise(client, token, "Bench ST3")
    w = _make_workout_with_exercise(client, token, ex)

    r1 = client.patch(
        f"/workouts/{w['id']}/status",
        json={"status": "COMPLETED"},
        headers=_auth(token),
    )
    first_stamp = r1.json()["completed_at"]
    assert first_stamp is not None

    r2 = client.patch(
        f"/workouts/{w['id']}/status",
        json={"status": "COMPLETED", "duration_seconds": 999},
        headers=_auth(token),
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["completed_at"] == first_stamp  # unchanged
