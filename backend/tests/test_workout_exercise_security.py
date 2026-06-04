"""Regression tests for the workout-exercise ownership + numeric-validation fix.

Covers three issues found in review:
  #1  PUT /workout-exercises/{id} must not let a user re-parent their exercise
      row into another user's workout (authorization boundary).
  #2  sets/reps/weight must be validated (sets ≥ 1, reps ≥ 1, weight ≥ 0).
  #5  duration_seconds on the status PATCH must be ≥ 0.

Each test registers its own isolated user(s); the `client` fixture (conftest.py)
points the app at a shared in-memory SQLite DB.
"""
from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _register(client: TestClient) -> str:
    """Register + log in a fresh user, returning their JWT."""
    email = f"we_sec_{uuid.uuid4().hex[:10]}@example.com"
    password = "TestPass123!"
    client.post("/auth/register", json={"name": "Tester", "email": email, "password": password})
    r = client.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _make_exercise(client: TestClient, token: str, name: str) -> str:
    r = client.post(
        "/exercises/",
        json={"name": name, "muscle_group": "Chest", "description": "test fixture"},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _make_workout(client: TestClient, token: str) -> str:
    r = client.post(
        "/workouts/",
        json={"workout_date": "2026-06-01", "notes": "test", "exercises": []},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _add_we(client: TestClient, token: str, workout_id: str, exercise_id: str, **overrides) -> dict:
    body = {
        "workout_id": workout_id,
        "exercise_id": exercise_id,
        "sets": 3,
        "reps": 10,
        "weight": 50,
        "order_index": 0,
    }
    body.update(overrides)
    r = client.post("/workout-exercises/", json=body, headers=_auth(token))
    assert r.status_code == 200, r.text
    return r.json()


# ── #1 authorization ─────────────────────────────────────────────────────────


def test_cannot_move_workout_exercise_into_another_users_workout(client: TestClient):
    """User A must not re-parent their exercise into User B's workout → 403,
    and the row must stay put."""
    token_a = _register(client)
    token_b = _register(client)

    exercise_id = _make_exercise(client, token_a, "Bench Sec")
    workout_a = _make_workout(client, token_a)
    workout_b = _make_workout(client, token_b)

    we = _add_we(client, token_a, workout_a, exercise_id)

    r = client.put(
        f"/workout-exercises/{we['id']}",
        json={
            "workout_id": workout_b,  # ← someone else's workout
            "exercise_id": exercise_id,
            "sets": 4,
            "reps": 8,
            "weight": 60,
            "order_index": 0,
        },
        headers=_auth(token_a),
    )
    assert r.status_code == 403, r.text

    # The exercise must NOT have moved.
    check = client.get(f"/workout-exercises/{we['id']}", headers=_auth(token_a))
    assert check.status_code == 200, check.text
    assert check.json()["workout_id"] == workout_a


def test_update_within_own_workout_still_works(client: TestClient):
    """The ownership guard must not break a legitimate same-workout update."""
    token = _register(client)
    exercise_id = _make_exercise(client, token, "Bench OK")
    workout = _make_workout(client, token)
    we = _add_we(client, token, workout, exercise_id)

    r = client.put(
        f"/workout-exercises/{we['id']}",
        json={
            "workout_id": workout,
            "exercise_id": exercise_id,
            "sets": 5,
            "reps": 5,
            "weight": 80,
            "order_index": 0,
        },
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["sets"] == 5
    assert r.json()["reps"] == 5


# ── #2 numeric validation (sets / reps / weight) ─────────────────────────────


def test_create_workout_exercise_rejects_negative_sets(client: TestClient):
    token = _register(client)
    exercise_id = _make_exercise(client, token, "Bench NegSets")
    workout = _make_workout(client, token)
    r = client.post(
        "/workout-exercises/",
        json={"workout_id": workout, "exercise_id": exercise_id, "sets": -1, "reps": 10},
        headers=_auth(token),
    )
    assert r.status_code == 422, r.text


def test_create_workout_exercise_rejects_zero_sets(client: TestClient):
    """sets must be ≥ 1, not merely ≥ 0 — a set count of 0 is meaningless."""
    token = _register(client)
    exercise_id = _make_exercise(client, token, "Bench ZeroSets")
    workout = _make_workout(client, token)
    r = client.post(
        "/workout-exercises/",
        json={"workout_id": workout, "exercise_id": exercise_id, "sets": 0, "reps": 10},
        headers=_auth(token),
    )
    assert r.status_code == 422, r.text


def test_create_workout_exercise_rejects_negative_reps(client: TestClient):
    token = _register(client)
    exercise_id = _make_exercise(client, token, "Bench NegReps")
    workout = _make_workout(client, token)
    r = client.post(
        "/workout-exercises/",
        json={"workout_id": workout, "exercise_id": exercise_id, "sets": 3, "reps": -1},
        headers=_auth(token),
    )
    assert r.status_code == 422, r.text


def test_create_workout_exercise_rejects_negative_weight(client: TestClient):
    token = _register(client)
    exercise_id = _make_exercise(client, token, "Bench NegWeight")
    workout = _make_workout(client, token)
    r = client.post(
        "/workout-exercises/",
        json={"workout_id": workout, "exercise_id": exercise_id, "sets": 3, "reps": 10, "weight": -1},
        headers=_auth(token),
    )
    assert r.status_code == 422, r.text


def test_embedded_workout_exercise_rejects_negative_sets(client: TestClient):
    """Same constraint must hold on the nested create path (POST /workouts/)."""
    token = _register(client)
    exercise_id = _make_exercise(client, token, "Bench Embedded")
    r = client.post(
        "/workouts/",
        json={
            "workout_date": "2026-06-01",
            "notes": "bad",
            "exercises": [{"exercise_id": exercise_id, "sets": -1, "reps": 10, "order_index": 0}],
        },
        headers=_auth(token),
    )
    assert r.status_code == 422, r.text


# ── #5 duration_seconds validation ───────────────────────────────────────────


def test_status_update_rejects_negative_duration(client: TestClient):
    token = _register(client)
    workout = _make_workout(client, token)
    r = client.patch(
        f"/workouts/{workout}/status",
        json={"status": "COMPLETED", "duration_seconds": -1},
        headers=_auth(token),
    )
    assert r.status_code == 422, r.text


def test_status_update_accepts_valid_duration(client: TestClient):
    """A non-negative duration must still go through."""
    token = _register(client)
    workout = _make_workout(client, token)
    r = client.patch(
        f"/workouts/{workout}/status",
        json={"status": "COMPLETED", "duration_seconds": 1800},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["duration_seconds"] == 1800
