"""Tests for GET /workouts/predict/{exercise_id} — the Predictive Strength Engine.

Each test uses an isolated, freshly registered user (see `auth_client` in conftest.py),
so test data does not cross-contaminate.
"""
from __future__ import annotations

from datetime import date, timedelta


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_exercise(client, token: str, name: str) -> str:
    r = client.post(
        "/exercises/",
        json={"name": name, "muscle_group": "Chest", "description": "test fixture"},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _log(client, token: str, exercise_id: str, day_iso: str, weight: float) -> None:
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


# ── happy path ───────────────────────────────────────────────────────────────


def test_predict_happy_path_recovers_known_slope(auth_client):
    """Inject six +5 kg/week sessions; regression should recover slope ≈ 5 kg/week."""
    client, token = auth_client
    ex = _make_exercise(client, token, "Bench Predict HP")
    for weeks_ago, weight in zip([5, 4, 3, 2, 1, 0], [60, 65, 70, 75, 80, 85]):
        day = (date.today() - timedelta(days=weeks_ago * 7)).isoformat()
        _log(client, token, ex, day, weight)

    r = client.get(f"/workouts/predict/{ex}?target_weight=100", headers=_auth(token))
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["sessions"] == 6
    assert p["current_weight"] == 85.0
    assert 4.5 <= p["slope_kg_per_week"] <= 5.5
    assert p["weeks_to_target"] is not None and 2.5 <= p["weeks_to_target"] <= 3.5
    assert p["predicted_date"] is not None
    assert p["reason"] == "steady_progress"
    assert p["already_achieved"] is False


# ── edge cases the issue and reviewer called out ─────────────────────────────


def test_predict_too_few_sessions_returns_422(auth_client):
    """Acceptance criterion: ≥ 3 sessions required; 2 sessions must be rejected."""
    client, token = auth_client
    ex = _make_exercise(client, token, "Bench Predict Few")
    for weeks_ago, w in zip([1, 0], [80, 85]):
        day = (date.today() - timedelta(days=weeks_ago * 7)).isoformat()
        _log(client, token, ex, day, w)

    r = client.get(f"/workouts/predict/{ex}?target_weight=100", headers=_auth(token))
    assert r.status_code == 422
    assert "3" in r.json()["detail"]


def test_predict_same_day_sessions_return_422_not_500(auth_client):
    """REGRESSION GUARD: ≥ 3 sessions but all on the same day.

    The least-squares denominator (n*Σx² − (Σx)²) is 0 when Var(x) = 0. Without the
    guard this would raise ZeroDivisionError → 500. The endpoint must return a clean
    422 with an explanatory message instead.
    """
    client, token = auth_client
    ex = _make_exercise(client, token, "Bench Predict SameDay")
    today = date.today().isoformat()
    for w in (60, 65, 70):
        _log(client, token, ex, today, w)

    r = client.get(f"/workouts/predict/{ex}?target_weight=100", headers=_auth(token))
    assert r.status_code == 422, r.text
    assert "day" in r.json()["detail"].lower()


def test_predict_already_achieved(auth_client):
    """Target ≤ current weight → already_achieved=true, weeks_to_target null."""
    client, token = auth_client
    ex = _make_exercise(client, token, "Bench Predict Done")
    for weeks_ago, w in zip([5, 4, 3, 2, 1, 0], [60, 65, 70, 75, 80, 85]):
        day = (date.today() - timedelta(days=weeks_ago * 7)).isoformat()
        _log(client, token, ex, day, w)

    r = client.get(f"/workouts/predict/{ex}?target_weight=50", headers=_auth(token))
    assert r.status_code == 200
    p = r.json()
    assert p["already_achieved"] is True
    assert p["weeks_to_target"] is None


def test_predict_plateau_flat_progress(auth_client):
    """Flat weights → reason='plateau', slope ≈ 0, no ETA."""
    client, token = auth_client
    ex = _make_exercise(client, token, "Bench Predict Plateau")
    for weeks_ago in [4, 3, 2, 1, 0]:
        day = (date.today() - timedelta(days=weeks_ago * 7)).isoformat()
        _log(client, token, ex, day, 70)

    r = client.get(f"/workouts/predict/{ex}?target_weight=100", headers=_auth(token))
    assert r.status_code == 200
    p = r.json()
    assert p["reason"] == "plateau"
    assert abs(p["slope_kg_per_week"]) <= 0.1
    assert p["weeks_to_target"] is None


def test_predict_regression_distinct_from_plateau(auth_client):
    """Decreasing weights → reason='regression' (NOT 'plateau'), no ETA.

    A user getting weaker is semantically different from one stagnating — the UI
    should surface a different warning (overtraining / recovery / form issues).
    """
    client, token = auth_client
    ex = _make_exercise(client, token, "Bench Predict Regress")
    # 5 sessions trending down by 1 kg/week → slope ≈ -1 kg/week
    for weeks_ago, w in zip([4, 3, 2, 1, 0], [85, 84, 83, 82, 81]):
        day = (date.today() - timedelta(days=weeks_ago * 7)).isoformat()
        _log(client, token, ex, day, w)

    r = client.get(f"/workouts/predict/{ex}?target_weight=100", headers=_auth(token))
    assert r.status_code == 200
    p = r.json()
    assert p["reason"] == "regression"
    assert p["slope_kg_per_week"] < -0.1
    assert p["weeks_to_target"] is None  # negative slope -> target unreachable


def test_predict_rejects_non_positive_target(auth_client):
    """Pydantic Query validation: target_weight must be > 0."""
    client, token = auth_client
    ex = _make_exercise(client, token, "Bench Predict Invalid")
    r = client.get(f"/workouts/predict/{ex}?target_weight=0", headers=_auth(token))
    assert r.status_code == 422
