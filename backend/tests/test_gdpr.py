"""Tests for the DSGVO/GDPR export and account-delete flows (Issue #29).

Covers:
- Auth required on both endpoints
- Export returns every owned table; password_hash is never leaked
- Export is scoped to the calling user; other users' rows do not bleed in
- Delete cascades through workouts, workout_exercises, user_exercise_maxes,
  training_programs, training_program_items, user_achievements, and
  coach_clients on BOTH coach and athlete sides
- Delete does not touch other users' data or the shared exercises catalogue
- After delete the JWT becomes useless (subsequent GET /me returns 401)
- The same email can be re-registered after a delete (no unique-key zombie)
"""
from __future__ import annotations

import json
import uuid
from datetime import date

from fastapi.testclient import TestClient

from data_base_sql.models import (
    CoachClient,
    Exercise,
    TrainingProgram,
    TrainingProgramItem,
    User,
    UserAchievement,
    UserExerciseMax,
    Workout,
    WorkoutExercise,
)
from tests.conftest import TestingSessionLocal


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _register_and_login(client: TestClient, name: str = "Other") -> tuple[str, str]:
    email = f"other_{uuid.uuid4().hex[:10]}@example.com"
    password = "OtherPass123!"
    client.post("/auth/register", json={"name": name, "email": email, "password": password})
    r = client.post("/auth/login", json={"email": email, "password": password})
    return email, r.json()["access_token"]


def _make_exercise(client: TestClient, token: str, name: str = "Bench") -> str:
    r = client.post(
        "/exercises/",
        json={"name": name, "muscle_group": "Chest", "description": "x"},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _log_workout(client: TestClient, token: str, day_iso: str, exercise_id: str) -> str:
    r = client.post(
        "/workouts/",
        json={
            "workout_date": day_iso,
            "notes": "test workout",
            "exercises": [
                {"exercise_id": exercise_id, "sets": 3, "reps": 8, "weight": 60, "order_index": 0}
            ],
        },
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ============================================================================
# Auth gates
# ============================================================================


def test_export_requires_auth(client: TestClient):
    r = client.get("/users/me/export")
    assert r.status_code == 401


def test_delete_me_requires_auth(client: TestClient):
    r = client.delete("/users/me")
    assert r.status_code == 401


# ============================================================================
# Export
# ============================================================================


def test_export_contains_full_user_payload(auth_client: tuple[TestClient, str]):
    client, token = auth_client
    ex_id = _make_exercise(client, token, "Squat")
    workout_id = _log_workout(client, token, "2026-06-04", ex_id)

    r = client.get("/users/me/export", headers=_auth(token))

    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("application/json")
    assert "attachment" in r.headers.get("content-disposition", "")

    payload = json.loads(r.content)
    assert payload["schema_version"] == 1
    assert "generated_at" in payload

    # User row present, password_hash redacted
    assert payload["user"]["id"]
    assert payload["user"]["email"]
    assert "password_hash" not in payload["user"], (
        "Export must never leak the user's password hash"
    )

    # Workout + child exercise present
    assert any(w["id"] == workout_id for w in payload["workouts"])
    assert len(payload["workout_exercises"]) >= 1
    assert all(
        we["workout_id"] == workout_id for we in payload["workout_exercises"]
    )

    # All collection keys present even when empty
    for key in (
        "user_exercise_maxes",
        "training_programs",
        "training_program_items",
        "user_achievements",
        "coach_clients",
    ):
        assert key in payload, f"missing top-level key {key}"

    # The workout payload must round-trip the seed data, otherwise the Art. 15
    # export is incomplete in a way the earlier "key exists" check wouldn't catch.
    seed_workout = next(w for w in payload["workouts"] if w["id"] == workout_id)
    assert seed_workout["notes"] == "test workout"
    assert seed_workout["status"] == "PLANNED"
    assert seed_workout["date"] == "2026-06-04"
    seed_we = next(we for we in payload["workout_exercises"] if we["workout_id"] == workout_id)
    assert seed_we["sets"] == 3
    assert seed_we["reps"] == 8
    # Decimal weights round-trip as strings (precision preserved for spreadsheets)
    assert seed_we["weight"] == "60.00"
    assert seed_we["order_index"] == 0


def test_export_scoped_to_caller(client: TestClient):
    """User A's workouts must not appear in User B's export."""
    email_a, token_a = _register_and_login(client, "A")
    email_b, token_b = _register_and_login(client, "B")

    ex_id = _make_exercise(client, token_a, "Press")
    a_workout = _log_workout(client, token_a, "2026-06-04", ex_id)

    r = client.get("/users/me/export", headers=_auth(token_b))
    assert r.status_code == 200
    payload = json.loads(r.content)

    assert payload["user"]["email"] == email_b
    assert all(w["id"] != a_workout for w in payload["workouts"]), payload["workouts"]


# ============================================================================
# Delete: cascade behavior
# ============================================================================


def test_delete_me_returns_204_and_invalidates_session(auth_client: tuple[TestClient, str]):
    client, token = auth_client

    r = client.delete("/users/me", headers=_auth(token))
    assert r.status_code == 204

    # Subsequent calls with the same JWT must fail because the user row is gone
    r2 = client.get("/users/me", headers=_auth(token))
    assert r2.status_code in (401, 404)


def test_delete_me_cascades_owned_tables(client: TestClient):
    """Drive every per-user table, then DELETE /me, then assert SQL is clean."""
    email, token = _register_and_login(client, "ToDelete")

    # Get the user id back so we can query SQL afterwards
    me = client.get("/users/me", headers=_auth(token)).json()
    user_id = me["id"]

    # Build a workout (creates Workout + WorkoutExercise)
    ex_id = _make_exercise(client, token, "DeadliftDel")
    _log_workout(client, token, "2026-06-04", ex_id)

    # Build training-program + items, exercise-max, achievement directly in SQL
    # (these endpoints exist via /programs etc., but raw inserts keep the test
    # focused on what cleanup must happen rather than on driving every CRUD path).
    db = TestingSessionLocal()
    try:
        db.add(UserExerciseMax(
            user_id=user_id, exercise_id=ex_id,
            one_rep_max=120, training_max=100, increment_step=2.5,
        ))
        prog = TrainingProgram(
            user_id=user_id, goal="STRENGTH", training_days_per_week=3,
            start_date=date(2026, 6, 1), end_date=date(2026, 6, 28), status="ACTIVE",
        )
        db.add(prog)
        db.flush()
        db.add(TrainingProgramItem(
            program_id=prog.id, exercise_id=ex_id, week_number=1, day_number=1,
            sets=3, reps=5, percentage=80, calculated_weight=80,
        ))
        db.add(UserAchievement(user_id=user_id, badge_id="STREAK_7"))

        # Coach link: this user is both coach and athlete in two rows so we
        # cover both FK directions in one go. The "other" side uses a real
        # second User so the FK constraint is happy.
        other = User(
            email=f"coach_partner_{uuid.uuid4().hex[:8]}@example.com",
            name="Partner",
            password_hash="x",
            role="coach",
        )
        db.add(other)
        db.flush()
        db.add(CoachClient(coach_id=other.id, athlete_id=user_id))
        db.add(CoachClient(coach_id=user_id, athlete_id=other.id))
        db.commit()
    finally:
        db.close()

    # Verify the seed actually landed
    db = TestingSessionLocal()
    try:
        assert db.query(Workout).filter(Workout.user_id == user_id).count() == 1
        assert db.query(UserExerciseMax).filter(UserExerciseMax.user_id == user_id).count() == 1
        assert db.query(TrainingProgram).filter(TrainingProgram.user_id == user_id).count() == 1
        assert db.query(TrainingProgramItem).count() >= 1
        assert db.query(UserAchievement).filter(UserAchievement.user_id == user_id).count() == 1
        from sqlalchemy import or_
        assert db.query(CoachClient).filter(
            or_(CoachClient.coach_id == user_id, CoachClient.athlete_id == user_id)
        ).count() == 2
    finally:
        db.close()

    # Act: delete
    r = client.delete("/users/me", headers=_auth(token))
    assert r.status_code == 204, r.text

    # Assert: every per-user row is gone
    db = TestingSessionLocal()
    try:
        assert db.query(User).filter(User.id == user_id).first() is None
        assert db.query(Workout).filter(Workout.user_id == user_id).count() == 0
        # No orphan WorkoutExercise rows whose parent workout no longer
        # exists. Earlier this asserted `count() >= 0`, which is true by SQL
        # definition and therefore caught nothing.
        we_orphans = (
            db.query(WorkoutExercise)
            .filter(~WorkoutExercise.workout_id.in_(
                db.query(Workout.id)
            ))
            .count()
        )
        assert we_orphans == 0
        assert db.query(UserExerciseMax).filter(UserExerciseMax.user_id == user_id).count() == 0
        assert db.query(TrainingProgram).filter(TrainingProgram.user_id == user_id).count() == 0
        # TrainingProgramItem rows for the deleted user's programs must be gone too
        from sqlalchemy import or_
        prog_items_orphans = (
            db.query(TrainingProgramItem)
            .filter(~TrainingProgramItem.program_id.in_(
                db.query(TrainingProgram.id)
            ))
            .count()
        )
        assert prog_items_orphans == 0
        assert db.query(UserAchievement).filter(UserAchievement.user_id == user_id).count() == 0
        assert db.query(CoachClient).filter(
            or_(CoachClient.coach_id == user_id, CoachClient.athlete_id == user_id)
        ).count() == 0
    finally:
        db.close()


def test_delete_me_does_not_touch_other_users_data(client: TestClient):
    """The other user's workouts and the shared exercises catalogue stay intact."""
    _, token_a = _register_and_login(client, "A")
    _, token_b = _register_and_login(client, "B")

    ex_b = _make_exercise(client, token_b, "BenchKeep")
    b_workout = _log_workout(client, token_b, "2026-06-04", ex_b)

    # A deletes their account
    r = client.delete("/users/me", headers=_auth(token_a))
    assert r.status_code == 204

    # B's workout and the exercise catalogue must still exist
    db = TestingSessionLocal()
    try:
        assert db.query(Workout).filter(Workout.id == b_workout).first() is not None
        assert db.query(Exercise).filter(Exercise.id == ex_b).first() is not None
    finally:
        db.close()

    # And B's own export still works
    rb = client.get("/users/me/export", headers=_auth(token_b))
    assert rb.status_code == 200
    assert any(w["id"] == b_workout for w in json.loads(rb.content)["workouts"])


def test_export_redacts_coach_counterparty(client: TestClient):
    """DSGVO Art. 15(4): an export must not enumerate other data subjects.
    coach_clients rows reference TWO users; we must ship only "your side" of
    the link and a placeholder for the counterparty."""
    _, token_a = _register_and_login(client, "Coach")
    _, token_b = _register_and_login(client, "Athlete")
    me_a = client.get("/users/me", headers=_auth(token_a)).json()
    me_b = client.get("/users/me", headers=_auth(token_b)).json()

    db = TestingSessionLocal()
    try:
        db.add(CoachClient(coach_id=me_a["id"], athlete_id=me_b["id"]))
        db.commit()
    finally:
        db.close()

    r = client.get("/users/me/export", headers=_auth(token_a))
    payload = json.loads(r.content)
    links = payload["coach_clients"]
    assert links, "seeded link should appear in coach's export"
    for link in links:
        assert link["role"] in ("coach", "athlete")
        assert link["counterparty"] == "<redacted>"
        # The athlete's UUID must never appear in the coach's export payload.
        flat = json.dumps(link)
        assert me_b["id"] not in flat, (
            f"counterparty UUID leaked into coach's export: {link}"
        )


def test_legacy_delete_by_id_also_cascades(auth_client: tuple[TestClient, str]):
    """The legacy DELETE /users/{user_id} endpoint must use the same cascading
    delete; otherwise a regression could re-introduce the orphan-row bug."""
    client, token = auth_client
    me = client.get("/users/me", headers=_auth(token)).json()

    ex_id = _make_exercise(client, token, "LegacyEx")
    _log_workout(client, token, "2026-06-04", ex_id)

    r = client.delete(f"/users/{me['id']}", headers=_auth(token))
    assert r.status_code == 200, r.text
    assert r.json().get("message") == "User deleted"

    db = TestingSessionLocal()
    try:
        assert db.query(User).filter(User.id == me["id"]).first() is None
        assert db.query(Workout).filter(Workout.user_id == me["id"]).count() == 0
    finally:
        db.close()


def test_legacy_delete_by_id_rejects_cross_user(client: TestClient):
    """A user must not be able to delete another user's account via the
    legacy by-id endpoint."""
    _, token_a = _register_and_login(client, "A")
    _, token_b = _register_and_login(client, "B")
    me_b = client.get("/users/me", headers=_auth(token_b)).json()

    r = client.delete(f"/users/{me_b['id']}", headers=_auth(token_a))
    assert r.status_code == 403, r.text


def test_delete_user_account_is_idempotent():
    """Calling delete_user_account twice must return True then False, never
    raise. This locks in the no-op contract that the HTTP path can't
    exercise directly (the JWT is invalidated after the first call)."""
    from data_base_sql.gdpr import delete_user_account
    from data_base_sql.crud import create_user
    from data_base_sql.schemas import UserCreate

    db = TestingSessionLocal()
    try:
        user = create_user(db, UserCreate(
            name="Idempotent",
            email=f"idem_{uuid.uuid4().hex[:8]}@example.com",
            password="IdempotentPass123!",
        ))
        uid = user.id

        first = delete_user_account(db, uid)
        second = delete_user_account(db, uid)

        assert first is True
        assert second is False
    finally:
        db.close()


def test_email_reusable_after_delete(client: TestClient):
    """A user re-registering with the same email after delete must succeed."""
    email, password = f"reuse_{uuid.uuid4().hex[:10]}@example.com", "ReusePass123!"
    client.post("/auth/register", json={"name": "First", "email": email, "password": password})
    login = client.post("/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]

    assert client.delete("/users/me", headers=_auth(token)).status_code == 204

    # Same email, fresh registration
    r = client.post(
        "/auth/register",
        json={"name": "Second", "email": email, "password": "DifferentPass456!"},
    )
    assert r.status_code in (200, 201), r.text
