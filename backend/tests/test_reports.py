"""Tests for GET /reports/weekly and /reports/monthly — PDF report generator (Issue #8).

Verifies authentication, HTTP plumbing (status, content-type, content-disposition,
PDF magic bytes) and the underlying CRUD aggregator for in-period filtering and
new-PR detection.
"""
from __future__ import annotations

from datetime import date, timedelta
from uuid import UUID


from data_base_sql.crud import get_report_period_data


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_exercise(client, token: str, name: str) -> str:
    r = client.post(
        "/exercises/",
        json={"name": name, "muscle_group": "Chest", "description": "fixture"},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _log_workout(client, token: str, day_iso: str, exercise_id: str, weight: float) -> str:
    r = client.post(
        "/workouts/",
        json={
            "workout_date": day_iso,
            "notes": "test",
            "exercises": [
                {"exercise_id": exercise_id, "sets": 5, "reps": 5, "weight": weight, "order_index": 0}
            ],
        },
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _complete(client, token: str, workout_id: str) -> None:
    r = client.patch(
        f"/workouts/{workout_id}/status",
        json={"status": "COMPLETED", "duration_seconds": 2700},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text


# ── HTTP/PDF plumbing ────────────────────────────────────────────────────────


def test_weekly_requires_auth(client):
    r = client.get("/reports/weekly")
    assert r.status_code == 401


def test_monthly_requires_auth(client):
    r = client.get("/reports/monthly")
    assert r.status_code == 401


def test_weekly_empty_history_still_returns_valid_pdf(auth_client):
    """A user with no workouts must still be able to download a (mostly empty) PDF."""
    client, token = auth_client
    r = client.get("/reports/weekly", headers=_auth(token))
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("application/pdf")
    disp = r.headers.get("content-disposition", "")
    assert "attachment" in disp.lower()
    assert ".pdf" in disp.lower()
    assert r.content[:5] == b"%PDF-"
    assert len(r.content) > 500  # not just a stub


def test_monthly_with_completed_workout_returns_pdf(auth_client):
    """End-to-end: a completed workout in the current month → PDF download."""
    client, token = auth_client
    ex = _make_exercise(client, token, "Squat Monthly")
    today = date.today()
    workout_id = _log_workout(client, token, today.isoformat(), ex, 100.0)
    _complete(client, token, workout_id)

    r = client.get("/reports/monthly", headers=_auth(token))
    assert r.status_code == 200
    assert r.content.startswith(b"%PDF-")
    # filename should embed year + month
    assert f"{today.year}-{today.month:02d}" in r.headers.get("content-disposition", "")


# ── CRUD aggregator semantics ───────────────────────────────────────────────


def test_report_data_only_counts_completed_in_window(auth_client):
    """Sanity: PLANNED workouts and workouts outside the window are excluded."""
    client, token = auth_client
    ex = _make_exercise(client, token, "Bench Window")
    today = date.today()
    inside = today
    outside = today - timedelta(days=30)

    inside_id = _log_workout(client, token, inside.isoformat(), ex, 80.0)
    _complete(client, token, inside_id)

    # Outside the window, completed — must be excluded by date filter
    outside_id = _log_workout(client, token, outside.isoformat(), ex, 999.0)
    _complete(client, token, outside_id)

    # Inside the window but PLANNED — must be excluded by status filter
    _log_workout(client, token, inside.isoformat(), ex, 555.0)

    # Resolve user_id from the JWT-authenticated /users/me endpoint
    me = client.get("/users/me", headers=_auth(token)).json()
    user_id = UUID(me["id"])

    from tests.conftest import TestingSessionLocal
    db = TestingSessionLocal()
    try:
        start = today - timedelta(days=today.weekday())
        end = start + timedelta(days=6)
        data = get_report_period_data(db, user_id, start, end)
    finally:
        db.close()

    assert data["completed_count"] == 1
    # 80 kg * 5 sets * 5 reps = 2000 kg — only the in-window completed workout
    assert data["total_volume_kg"] == 2000.0


def test_report_data_detects_new_pr(auth_client):
    """A weight higher than any prior completed weight in the window is a new PR."""
    client, token = auth_client
    ex = _make_exercise(client, token, "Deadlift PR")
    today = date.today()
    last_week = today - timedelta(days=10)

    # Prior PR before the window: 100 kg
    prev_id = _log_workout(client, token, last_week.isoformat(), ex, 100.0)
    _complete(client, token, prev_id)

    # New PR inside the window: 110 kg
    new_id = _log_workout(client, token, today.isoformat(), ex, 110.0)
    _complete(client, token, new_id)

    me = client.get("/users/me", headers=_auth(token)).json()
    user_id = UUID(me["id"])

    from tests.conftest import TestingSessionLocal
    db = TestingSessionLocal()
    try:
        start = today - timedelta(days=today.weekday())
        end = start + timedelta(days=6)
        data = get_report_period_data(db, user_id, start, end)
    finally:
        db.close()

    prs = data["new_prs"]
    assert len(prs) == 1
    assert prs[0]["weight_kg"] == 110.0
    assert prs[0]["previous_kg"] == 100.0
