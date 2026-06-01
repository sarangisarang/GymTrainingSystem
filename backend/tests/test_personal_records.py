"""Tests for the PR-detection endpoint GET /workouts/{id}/new-prs (Issue #12).

Covers:
- Auth required
- 404 / 403
- Empty list when workout not COMPLETED
- First-ever workout for an exercise IS a PR (no prior history)
- Strictly-greater rule: equal weight is NOT a PR
- Multiple exercises in one workout, mixed PR + non-PR
- PLANNED / CANCELLED prior workouts ignored on the "prior max" side
- Same-day completion order tiebreak (older completed_at counts as prior)
"""
from __future__ import annotations

import time
from datetime import date, timedelta


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


def _log_workout(client, token: str, day_iso: str, items: list[dict]) -> str:
    r = client.post(
        "/workouts/",
        json={
            "workout_date": day_iso,
            "notes": "t",
            "exercises": [
                {"sets": 5, "reps": 5, "rest_seconds": 30, "rest_limit_seconds": 45, "order_index": i, **it}
                for i, it in enumerate(items)
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


# ── Auth + scope ─────────────────────────────────────────────────────────────


def test_new_prs_requires_auth(client):
    # Random UUID
    r = client.get("/workouts/00000000-0000-0000-0000-000000000000/new-prs")
    assert r.status_code == 401


def test_new_prs_404_for_unknown_workout(auth_client):
    client, token = auth_client
    r = client.get(
        "/workouts/00000000-0000-0000-0000-000000000000/new-prs",
        headers=_auth(token),
    )
    assert r.status_code == 404


def test_new_prs_403_for_other_users_workout(client):
    # Owner creates workout, attacker tries to read its PRs
    import uuid
    owner_email = f"owner_{uuid.uuid4().hex[:8]}@example.com"
    attacker_email = f"attacker_{uuid.uuid4().hex[:8]}@example.com"
    pw = "Pass1234!"
    client.post("/auth/register", json={"name": "Owner", "email": owner_email, "password": pw})
    client.post("/auth/register", json={"name": "Attacker", "email": attacker_email, "password": pw})
    owner_tok = client.post("/auth/login", json={"email": owner_email, "password": pw}).json()["access_token"]
    attacker_tok = client.post("/auth/login", json={"email": attacker_email, "password": pw}).json()["access_token"]

    ex = _make_exercise(client, owner_tok, "Bench Owner")
    wid = _log_workout(client, owner_tok, date.today().isoformat(), [{"exercise_id": ex, "weight": 100.0}])
    _complete(client, owner_tok, wid)

    r = client.get(f"/workouts/{wid}/new-prs", headers=_auth(attacker_tok))
    assert r.status_code == 403


# ── Status filtering ─────────────────────────────────────────────────────────


def test_new_prs_empty_for_planned_workout(auth_client):
    """A PLANNED workout (not yet COMPLETED) must return an empty list — confetti
    fires only when the user actually finishes."""
    client, token = auth_client
    ex = _make_exercise(client, token, "Bench Planned")
    wid = _log_workout(client, token, date.today().isoformat(), [{"exercise_id": ex, "weight": 100.0}])
    # Intentionally NOT completed
    r = client.get(f"/workouts/{wid}/new-prs", headers=_auth(token))
    assert r.status_code == 200
    assert r.json() == []


# ── PR semantics ─────────────────────────────────────────────────────────────


def test_first_ever_workout_for_exercise_is_a_pr(auth_client):
    """A user's first completed workout for an exercise has no prior history, so
    every weighted exercise counts as a PR (delta == weight, previous_max_kg is None)."""
    client, token = auth_client
    ex = _make_exercise(client, token, "Bench First")
    wid = _log_workout(client, token, date.today().isoformat(), [{"exercise_id": ex, "weight": 60.0}])
    _complete(client, token, wid)

    prs = client.get(f"/workouts/{wid}/new-prs", headers=_auth(token)).json()
    assert len(prs) == 1
    pr = prs[0]
    assert pr["exercise_id"] == ex
    assert pr["weight_kg"] == 60.0
    assert pr["previous_max_kg"] is None
    assert pr["delta_kg"] == 60.0
    assert pr["exercise_name"] == "Bench First"


def test_strictly_greater_only_equal_weight_is_not_a_pr(auth_client):
    """Repeating yesterday's max weight is NOT a PR. Only strict > counts."""
    client, token = auth_client
    ex = _make_exercise(client, token, "Bench Equal")
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    today = date.today().isoformat()

    first = _log_workout(client, token, yesterday, [{"exercise_id": ex, "weight": 80.0}])
    _complete(client, token, first)

    same = _log_workout(client, token, today, [{"exercise_id": ex, "weight": 80.0}])
    _complete(client, token, same)

    prs = client.get(f"/workouts/{same}/new-prs", headers=_auth(token)).json()
    assert prs == []


def test_strictly_greater_new_max_is_a_pr_with_delta(auth_client):
    """Beating yesterday's max by 5 kg yields a PR with delta == 5."""
    client, token = auth_client
    ex = _make_exercise(client, token, "Bench Beat")
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    today = date.today().isoformat()

    w1 = _log_workout(client, token, yesterday, [{"exercise_id": ex, "weight": 80.0}])
    _complete(client, token, w1)
    w2 = _log_workout(client, token, today, [{"exercise_id": ex, "weight": 85.0}])
    _complete(client, token, w2)

    prs = client.get(f"/workouts/{w2}/new-prs", headers=_auth(token)).json()
    assert len(prs) == 1
    assert prs[0]["weight_kg"] == 85.0
    assert prs[0]["previous_max_kg"] == 80.0
    assert prs[0]["delta_kg"] == 5.0


def test_multi_exercise_workout_mixed_prs(auth_client):
    """One workout, two exercises: bench beats prior, squat ties prior. Only
    bench shows up as PR."""
    client, token = auth_client
    bench = _make_exercise(client, token, "Bench Mixed")
    squat = _make_exercise(client, token, "Squat Mixed")
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    today = date.today().isoformat()

    w_prev = _log_workout(client, token, yesterday, [
        {"exercise_id": bench, "weight": 80.0},
        {"exercise_id": squat, "weight": 100.0},
    ])
    _complete(client, token, w_prev)
    w_today = _log_workout(client, token, today, [
        {"exercise_id": bench, "weight": 85.0},   # PR
        {"exercise_id": squat, "weight": 100.0},  # equal -> not a PR
    ])
    _complete(client, token, w_today)

    prs = client.get(f"/workouts/{w_today}/new-prs", headers=_auth(token)).json()
    ids = {p["exercise_id"] for p in prs}
    assert bench in ids
    assert squat not in ids
    assert len(prs) == 1


def test_prior_planned_workouts_dont_count_against_pr(auth_client):
    """A PLANNED workout (even with a higher weight) must NOT be considered
    'prior max'. Only COMPLETED workouts gate PRs."""
    client, token = auth_client
    ex = _make_exercise(client, token, "Bench Planned Ignored")
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    today = date.today().isoformat()

    # PLANNED workout with a huge weight — should NOT block PR detection
    _log_workout(client, token, yesterday, [{"exercise_id": ex, "weight": 999.0}])

    # Today's COMPLETED workout with a modest weight
    w_today = _log_workout(client, token, today, [{"exercise_id": ex, "weight": 60.0}])
    _complete(client, token, w_today)

    prs = client.get(f"/workouts/{w_today}/new-prs", headers=_auth(token)).json()
    assert len(prs) == 1
    assert prs[0]["weight_kg"] == 60.0
    assert prs[0]["previous_max_kg"] is None  # no completed prior


def test_same_day_order_uses_completed_at_tiebreak(auth_client):
    """Two completed workouts on the same date for the same exercise: the
    later-completed one sees the earlier one as prior."""
    client, token = auth_client
    ex = _make_exercise(client, token, "Bench SameDay")
    today = date.today().isoformat()

    first = _log_workout(client, token, today, [{"exercise_id": ex, "weight": 70.0}])
    _complete(client, token, first)
    time.sleep(0.01)  # ensure distinct completed_at timestamps
    second = _log_workout(client, token, today, [{"exercise_id": ex, "weight": 75.0}])
    _complete(client, token, second)

    # First workout is its own first occurrence -> PR
    prs1 = client.get(f"/workouts/{first}/new-prs", headers=_auth(token)).json()
    assert len(prs1) == 1
    assert prs1[0]["previous_max_kg"] is None

    # Second beats first
    prs2 = client.get(f"/workouts/{second}/new-prs", headers=_auth(token)).json()
    assert len(prs2) == 1
    assert prs2[0]["weight_kg"] == 75.0
    assert prs2[0]["previous_max_kg"] == 70.0


def test_zero_or_null_weight_is_not_a_pr(auth_client):
    """Bodyweight-style entries (weight None or 0) must not produce PRs —
    there is no measurable weight to PR on."""
    client, token = auth_client
    ex = _make_exercise(client, token, "Pullup")
    today = date.today().isoformat()
    wid = _log_workout(client, token, today, [{"exercise_id": ex, "weight": 0.0}])
    _complete(client, token, wid)

    prs = client.get(f"/workouts/{wid}/new-prs", headers=_auth(token)).json()
    assert prs == []


def test_prior_zero_weight_does_not_block_first_ever_pr(auth_client):
    """A historical bodyweight (weight=0) row must not be treated as the
    prior max — current 60kg should still show previous_max_kg=null, not 0."""
    client, token = auth_client
    ex = _make_exercise(client, token, "Bench Prior Zero")
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    today = date.today().isoformat()

    w0 = _log_workout(client, token, yesterday, [{"exercise_id": ex, "weight": 0.0}])
    _complete(client, token, w0)
    w1 = _log_workout(client, token, today, [{"exercise_id": ex, "weight": 60.0}])
    _complete(client, token, w1)

    prs = client.get(f"/workouts/{w1}/new-prs", headers=_auth(token)).json()
    assert len(prs) == 1
    assert prs[0]["weight_kg"] == 60.0
    assert prs[0]["previous_max_kg"] is None  # zero prior must NOT count
    assert prs[0]["delta_kg"] == 60.0


def test_idempotent_get_does_not_change_results(auth_client):
    """Calling /new-prs twice returns the same list both times — endpoint is a
    pure read, no state mutation."""
    client, token = auth_client
    ex = _make_exercise(client, token, "Bench Idem")
    wid = _log_workout(client, token, date.today().isoformat(), [{"exercise_id": ex, "weight": 100.0}])
    _complete(client, token, wid)

    first = client.get(f"/workouts/{wid}/new-prs", headers=_auth(token)).json()
    second = client.get(f"/workouts/{wid}/new-prs", headers=_auth(token)).json()
    assert first == second
    assert len(first) == 1
