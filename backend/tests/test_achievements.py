"""Tests for the gamification feature (Issue #11).

Covers:
- Auth requirement on every endpoint
- Empty-history user gets the full catalog with `earned=False` and empty newly_earned
- Each individual badge criterion fires when met
- Newly-earned badges are returned only once (subsequent calls return empty newly_earned)
- Weekly challenge progress math
- Leaderboard opt-in flow + visibility
"""
from __future__ import annotations

from datetime import date, timedelta
from uuid import UUID


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_exercise(client, token: str, name: str) -> str:
    r = client.post(
        "/exercises/",
        json={"name": name, "muscle_group": "Chest", "description": "x"},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _log_workout(client, token: str, day_iso: str, exercise_id: str, weight: float) -> str:
    r = client.post(
        "/workouts/",
        json={
            "workout_date": day_iso,
            "notes": "t",
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


# ── Auth ────────────────────────────────────────────────────────────────────


def test_achievements_requires_auth(client):
    assert client.get("/achievements/").status_code == 401


def test_weekly_challenge_requires_auth(client):
    assert client.get("/achievements/weekly-challenge").status_code == 401


def test_leaderboard_requires_auth(client):
    assert client.get("/leaderboard/").status_code == 401


def test_opt_in_requires_auth(client):
    assert client.patch("/achievements/leaderboard-opt-in", json={"opt_in": True}).status_code == 401


# ── Catalog shape ───────────────────────────────────────────────────────────


def test_empty_user_sees_full_catalog_unearned(auth_client):
    client, token = auth_client
    r = client.get("/achievements/", headers=_auth(token))
    assert r.status_code == 200, r.text
    data = r.json()
    badge_ids = {b["id"] for b in data["badges"]}
    assert badge_ids == {"STREAK_7", "STREAK_30", "IRON_CONSISTENCY", "FIRST_100KG"}
    assert all(not b["earned"] for b in data["badges"])
    assert data["newly_earned"] == []


# ── Per-badge criteria ──────────────────────────────────────────────────────


def test_streak7_badge_awarded_after_7_consecutive_days(auth_client):
    client, token = auth_client
    ex = _make_exercise(client, token, "Bench Streak7")
    today = date.today()
    # 7 consecutive days — each workout must be COMPLETED to count
    for offset in range(7):
        d = (today - timedelta(days=offset)).isoformat()
        wid = _log_workout(client, token, d, ex, 50.0)
        _complete(client, token, wid)

    r = client.get("/achievements/", headers=_auth(token))
    data = r.json()
    earned = {b["id"] for b in data["badges"] if b["earned"]}
    assert "STREAK_7" in earned
    newly = {b["id"] for b in data["newly_earned"]}
    assert "STREAK_7" in newly


def test_streak7_not_awarded_with_gap(auth_client):
    """Six-day streak + skip day + one day must NOT count as a 7-day streak."""
    client, token = auth_client
    ex = _make_exercise(client, token, "Bench Gap")
    today = date.today()
    for offset in [0, 1, 2, 3, 4, 5, 7]:  # missing day 6
        d = (today - timedelta(days=offset)).isoformat()
        wid = _log_workout(client, token, d, ex, 50.0)
        _complete(client, token, wid)

    data = client.get("/achievements/", headers=_auth(token)).json()
    earned = {b["id"] for b in data["badges"] if b["earned"]}
    assert "STREAK_7" not in earned


def test_streak7_not_awarded_for_planned_only(auth_client):
    """7 consecutive PLANNED (not completed) days must NOT grant the streak."""
    client, token = auth_client
    ex = _make_exercise(client, token, "Bench Planned")
    today = date.today()
    for offset in range(7):
        d = (today - timedelta(days=offset)).isoformat()
        _log_workout(client, token, d, ex, 50.0)  # PLANNED, never completed

    data = client.get("/achievements/", headers=_auth(token)).json()
    earned = {b["id"] for b in data["badges"] if b["earned"]}
    assert "STREAK_7" not in earned


def test_first_100kg_badge_only_counts_completed(auth_client):
    """A 100 kg set in a PLANNED workout must NOT trigger the badge."""
    client, token = auth_client
    ex = _make_exercise(client, token, "Bench 100")
    today = date.today().isoformat()
    _log_workout(client, token, today, ex, 100.0)  # PLANNED, not completed

    data = client.get("/achievements/", headers=_auth(token)).json()
    earned = {b["id"] for b in data["badges"] if b["earned"]}
    assert "FIRST_100KG" not in earned

    # Now log + complete a 100 kg workout
    wid = _log_workout(client, token, today, ex, 100.0)
    _complete(client, token, wid)
    data = client.get("/achievements/", headers=_auth(token)).json()
    earned = {b["id"] for b in data["badges"] if b["earned"]}
    assert "FIRST_100KG" in earned


def test_iron_consistency_8_consecutive_weeks(auth_client):
    client, token = auth_client
    ex = _make_exercise(client, token, "Bench Iron")
    today = date.today()
    # One COMPLETED workout for each of the last 8 ISO weeks
    for weeks_ago in range(8):
        d = today - timedelta(days=weeks_ago * 7)
        wid = _log_workout(client, token, d.isoformat(), ex, 60.0)
        _complete(client, token, wid)

    data = client.get("/achievements/", headers=_auth(token)).json()
    earned = {b["id"] for b in data["badges"] if b["earned"]}
    assert "IRON_CONSISTENCY" in earned


def test_iron_consistency_not_with_only_7_weeks(auth_client):
    client, token = auth_client
    ex = _make_exercise(client, token, "Bench Iron7")
    today = date.today()
    for weeks_ago in range(7):
        d = today - timedelta(days=weeks_ago * 7)
        wid = _log_workout(client, token, d.isoformat(), ex, 60.0)
        _complete(client, token, wid)

    data = client.get("/achievements/", headers=_auth(token)).json()
    earned = {b["id"] for b in data["badges"] if b["earned"]}
    assert "IRON_CONSISTENCY" not in earned


# ── Idempotency ─────────────────────────────────────────────────────────────


def test_newly_earned_only_on_first_call(auth_client):
    """A second /achievements/ call must report newly_earned as empty even
    though the badge is still earned — toast should fire only once."""
    client, token = auth_client
    ex = _make_exercise(client, token, "Bench Once")
    today = date.today()
    for offset in range(7):
        d = (today - timedelta(days=offset)).isoformat()
        wid = _log_workout(client, token, d, ex, 50.0)
        _complete(client, token, wid)

    first = client.get("/achievements/", headers=_auth(token)).json()
    assert any(b["id"] == "STREAK_7" for b in first["newly_earned"])

    second = client.get("/achievements/", headers=_auth(token)).json()
    assert second["newly_earned"] == []
    assert any(b["id"] == "STREAK_7" and b["earned"] for b in second["badges"])


# ── Weekly challenge ────────────────────────────────────────────────────────


def test_weekly_challenge_progress_math(auth_client):
    """current_kg == sets * reps * weight summed across COMPLETED workouts this week."""
    client, token = auth_client
    ex = _make_exercise(client, token, "Bench WC")
    today = date.today()

    # In this week, COMPLETED → counts
    wid = _log_workout(client, token, today.isoformat(), ex, 50.0)
    _complete(client, token, wid)
    # In this week, PLANNED → must NOT count
    _log_workout(client, token, today.isoformat(), ex, 999.0)
    # Last week, COMPLETED → must NOT count (outside the window)
    old = (today - timedelta(days=10)).isoformat()
    wid_old = _log_workout(client, token, old, ex, 999.0)
    _complete(client, token, wid_old)

    r = client.get("/achievements/weekly-challenge", headers=_auth(token))
    assert r.status_code == 200
    data = r.json()
    # 50 kg * 5 sets * 5 reps = 1250 kg
    assert data["current_kg"] == 1250.0
    assert data["target_kg"] == 10_000.0
    assert data["completed"] is False
    assert 0 < data["progress"] < 1


def test_weekly_challenge_completed_flag(auth_client):
    client, token = auth_client
    ex = _make_exercise(client, token, "Bench WC2")
    today = date.today().isoformat()
    # 5 * 5 * 400 = 10_000 exactly → completed
    wid = _log_workout(client, token, today, ex, 400.0)
    _complete(client, token, wid)
    data = client.get("/achievements/weekly-challenge", headers=_auth(token)).json()
    assert data["completed"] is True
    assert data["current_kg"] == 10_000.0


# ── Leaderboard ─────────────────────────────────────────────────────────────


def test_leaderboard_default_excludes_non_opted_in(auth_client):
    client, token = auth_client
    r = client.get("/leaderboard/", headers=_auth(token))
    assert r.status_code == 200
    data = r.json()
    assert data["self_opted_in"] is False
    assert data["entries"] == []


def test_leaderboard_opt_in_flow(auth_client):
    client, token = auth_client
    ex = _make_exercise(client, token, "Bench LB")
    today = date.today()
    for offset in range(3):
        d = (today - timedelta(days=offset)).isoformat()
        wid = _log_workout(client, token, d, ex, 80.0)
        _complete(client, token, wid)

    r = client.patch("/achievements/leaderboard-opt-in", json={"opt_in": True}, headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["leaderboard_opt_in"] is True

    data = client.get("/leaderboard/", headers=_auth(token)).json()
    assert data["self_opted_in"] is True
    assert len(data["entries"]) == 1
    assert data["entries"][0]["rank"] == 1
    assert data["entries"][0]["is_self"] is True
    assert data["entries"][0]["best_streak"] == 3
