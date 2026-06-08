"""DSGVO/GDPR helpers for Issue #29: full data export and full account deletion.

The User model has NO SQLAlchemy cascade and NO `ondelete=CASCADE` on any FK
column referencing users.id. A naive `db.delete(user); db.commit()` therefore
orphans rows in eight other tables. The functions in this module do the cleanup
explicitly so adding cascade behaviour to the ORM stays a follow-up refactor
rather than a prerequisite.

Tables that get exported AND wiped on delete (everything user-owned):
  - workouts                    (FK user_id)
  - workout_exercises           (transitive via workouts.workout_id)
  - user_exercise_maxes         (FK user_id)
  - training_programs           (FK user_id)
  - training_program_items      (cascade ALREADY configured on TrainingProgram)
  - user_achievements           (FK user_id)
  - coach_clients               (FK coach_id OR athlete_id, both sides)
  - coach_handoffs              (FK athlete_id) — the athlete's own question +
                                the AI answer they escalated to a human coach (#26)

Tables that are NEITHER exported nor wiped on a personal request:
  - exercises                   global catalogue, contains no personal data
                                (DSGVO Art. 20 only covers personal data)

Vector-store side effects:
  - Drop every workout the deleted user owned (per-user metadata filter).
  - Personal exercises don't exist; the global exercises collection stays.
"""
from __future__ import annotations

import logging
from datetime import datetime, date
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import or_
from sqlalchemy.orm import Session

from .models import (
    CoachClient,
    CoachHandoff,
    TrainingProgram,
    TrainingProgramItem,
    User,
    UserAchievement,
    UserExerciseMax,
    Workout,
    WorkoutExercise,
)

logger = logging.getLogger(__name__)


def _serialise(value: Any) -> Any:
    """Convert SQLAlchemy-row values into JSON-safe primitives."""
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        # Preserve precision as a string so spreadsheets see "85.50" not 85.5
        return str(value)
    return value


def _row_to_dict(row, exclude: tuple[str, ...] = ()) -> dict[str, Any]:
    """Generic SQLAlchemy ORM row → dict, scrubbing private/internal columns."""
    out: dict[str, Any] = {}
    for column in row.__table__.columns:
        name = column.name
        if name in exclude:
            continue
        out[name] = _serialise(getattr(row, name))
    return out


def export_user_data(db: Session, user_id: UUID) -> dict[str, Any]:
    """Return a JSON-serialisable snapshot of everything we hold about this
    user. DSGVO Art. 15 (Auskunft) + Art. 20 (Datenübertragbarkeit).

    The `users` entry hides `password_hash` so the export can't be turned into
    a credential-leak vector if the file is left lying around.
    """
    uid = str(user_id)
    user = db.query(User).filter(User.id == uid).first()
    if user is None:
        return {}

    workouts = db.query(Workout).filter(Workout.user_id == uid).all()
    workout_ids = [w.id for w in workouts]
    workout_exercises = (
        db.query(WorkoutExercise)
        .filter(WorkoutExercise.workout_id.in_(workout_ids))
        .all()
        if workout_ids
        else []
    )
    maxes = db.query(UserExerciseMax).filter(UserExerciseMax.user_id == uid).all()
    programs = db.query(TrainingProgram).filter(TrainingProgram.user_id == uid).all()
    program_ids = [p.id for p in programs]
    program_items = (
        db.query(TrainingProgramItem)
        .filter(TrainingProgramItem.program_id.in_(program_ids))
        .all()
        if program_ids
        else []
    )
    achievements = db.query(UserAchievement).filter(UserAchievement.user_id == uid).all()
    coach_links = (
        db.query(CoachClient)
        .filter(or_(CoachClient.coach_id == uid, CoachClient.athlete_id == uid))
        .all()
    )
    # DSGVO Art. 15(4): the right of access "shall not adversely affect the
    # rights and freedoms of others". A raw dump of CoachClient rows would
    # include the OTHER party's user UUID in every link, leaking the identity
    # of athletes (in a coach's export) or coaches (in an athlete's export)
    # who never consented to being enumerated. Reduce each row to "your side
    # of the link", a placeholder for the counterparty, and the timestamp.
    coach_clients_safe: list[dict[str, Any]] = []
    for c in coach_links:
        role = "coach" if c.coach_id == uid else "athlete"
        coach_clients_safe.append({
            "id": c.id,
            "role": role,
            "counterparty": "<redacted>",
            "created_at": _serialise(c.created_at),
        })

    # Coach handoffs the user filed as an athlete (#26). The row references only
    # the athlete (no counterparty UUID stored), and question/ai_answer/confidence
    # are the user's own data, so the full row is exported without redaction.
    handoffs = (
        db.query(CoachHandoff).filter(CoachHandoff.athlete_id == uid).all()
    )

    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "schema_version": 1,
        "user": _row_to_dict(user, exclude=("password_hash",)),
        "workouts": [_row_to_dict(w) for w in workouts],
        "workout_exercises": [_row_to_dict(we) for we in workout_exercises],
        "user_exercise_maxes": [_row_to_dict(m) for m in maxes],
        "training_programs": [_row_to_dict(p) for p in programs],
        "training_program_items": [_row_to_dict(i) for i in program_items],
        "user_achievements": [_row_to_dict(a) for a in achievements],
        "coach_clients": coach_clients_safe,
        "coach_handoffs": [_row_to_dict(h) for h in handoffs],
    }


def delete_user_account(db: Session, user_id: UUID) -> bool:
    """Hard-delete the user and every row that references them. Returns False
    if the user does not exist.

    Order matters: children before parents to avoid FK violations on databases
    that enforce them. We delete in raw-SQL bulk style (`.delete(synchronize
    _session=False)`) instead of fetching + iterating so this stays cheap
    even for power users with hundreds of workouts.

    Vector-store cleanup is best-effort; if Chroma is unavailable, the SQL
    deletion still completes and the dangling vector docs are harmless (their
    workout_ids no longer resolve in SQL, so `_enrich_workout_hits` would
    silently drop them anyway).
    """
    uid = str(user_id)
    user = db.query(User).filter(User.id == uid).first()
    if user is None:
        return False

    # ── Step 1: workouts and their exercises ──────────────────────────────
    workout_ids_rows = db.query(Workout.id).filter(Workout.user_id == uid).all()
    workout_ids = [row[0] for row in workout_ids_rows]
    if workout_ids:
        db.query(WorkoutExercise).filter(
            WorkoutExercise.workout_id.in_(workout_ids)
        ).delete(synchronize_session=False)
        db.query(Workout).filter(Workout.user_id == uid).delete(
            synchronize_session=False
        )

    # ── Step 2: training programs (items cascade via the existing ORM rel) ─
    # The TrainingProgram model already has cascade="all, delete" to its
    # items, but only fires under iterative ORM delete. We delete items
    # explicitly first so the bulk-style program delete is safe.
    program_ids_rows = db.query(TrainingProgram.id).filter(
        TrainingProgram.user_id == uid
    ).all()
    program_ids = [row[0] for row in program_ids_rows]
    if program_ids:
        db.query(TrainingProgramItem).filter(
            TrainingProgramItem.program_id.in_(program_ids)
        ).delete(synchronize_session=False)
        db.query(TrainingProgram).filter(TrainingProgram.user_id == uid).delete(
            synchronize_session=False
        )

    # ── Step 3: simple per-user side tables ──────────────────────────────
    db.query(UserExerciseMax).filter(UserExerciseMax.user_id == uid).delete(
        synchronize_session=False
    )
    db.query(UserAchievement).filter(UserAchievement.user_id == uid).delete(
        synchronize_session=False
    )

    # ── Step 4: coach relationships on BOTH sides ────────────────────────
    db.query(CoachClient).filter(
        or_(CoachClient.coach_id == uid, CoachClient.athlete_id == uid)
    ).delete(synchronize_session=False)

    # ── Step 5: coach handoffs the user filed as an athlete (#26) ────────
    # coach_handoffs.athlete_id is a NOT-NULL FK to users.id. Leaving these
    # behind orphans them and, on a FK-enforcing backend (PostgreSQL in prod),
    # makes the Step 6 user-row delete raise IntegrityError — i.e. account
    # deletion would crash for any athlete who ever escalated an answer.
    db.query(CoachHandoff).filter(CoachHandoff.athlete_id == uid).delete(
        synchronize_session=False
    )

    # ── Step 6: the user row itself ──────────────────────────────────────
    db.query(User).filter(User.id == uid).delete(synchronize_session=False)

    db.commit()

    # ── Step 7: best-effort vector store cleanup ─────────────────────────
    # remove_user_workouts_from_index already wraps its Chroma call in
    # try/except, so the only failure modes the outer catch needs to absorb
    # are developer errors (the module being missing or its API renamed).
    # Catch ONLY those narrow cases here so a misnamed Chroma backend etc.
    # propagates instead of silently masking a refactor regression.
    try:
        from . import vector_store

        vector_store.remove_user_workouts_from_index(uid)
    except (ImportError, AttributeError) as exc:
        logger.error(
            "Vector cleanup wiring broken for deleted user %s — "
            "module/function missing: %s",
            uid,
            exc,
        )

    return True
