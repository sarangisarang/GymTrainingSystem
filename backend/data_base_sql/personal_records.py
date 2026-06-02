"""Personal-Record detection for Issue #12 (confetti trigger).

A "new PR" is set by workout W for exercise E iff:
  - W is COMPLETED
  - W contains at least one set of E with weight > 0
  - max(weight of E in W) > max(weight of E in every prior COMPLETED workout)

"Prior" is ordered by (date, completed_at, created_at) — same-day workouts
compare by completed_at, and if two workouts somehow share completed_at
(e.g. legacy rows with NULL completed_at falling back to midnight) the
creation timestamp breaks the tie temporally. The current workout never
counts as its own prior.

A first-ever set for an exercise IS a PR (previous_max_kg is None, delta is
the full weight). Equal-weight repeats are NOT PRs (strictly greater).
PLANNED / IN_PROGRESS / CANCELLED workouts are ignored on both sides.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from .models import Exercise, Workout, WorkoutExercise


def get_new_prs_for_workout(db: Session, user_id: UUID, workout_id: UUID) -> list[dict]:
    """Return the list of new PRs set by this workout (empty if none).

    Each entry: {exercise_id, exercise_name, weight_kg, previous_max_kg, delta_kg}.
    `previous_max_kg` is None for first-ever PRs; `delta_kg` is then the same as
    `weight_kg`.
    """
    workout = (
        db.query(Workout)
        .filter(Workout.id == str(workout_id), Workout.user_id == str(user_id))
        .first()
    )
    if workout is None or workout.status != "COMPLETED":
        return []

    # Per-exercise max weight in THIS workout (skip None / 0 weights).
    here_max: dict[str, Decimal] = {}
    for we in workout.workout_exercises:
        if we.weight is None:
            continue
        w = Decimal(str(we.weight))
        if w <= 0:
            continue
        prev = here_max.get(we.exercise_id)
        if prev is None or w > prev:
            here_max[we.exercise_id] = w

    if not here_max:
        return []

    # Per-exercise max weight in every PRIOR COMPLETED workout for this user.
    # "Prior" = (date, completed_at, id) strictly less than this workout's tuple.
    # We push the whole filter into SQL — one round-trip with GROUP BY MAX,
    # bounded by the indexable (user_id, status, date) prefix — instead of
    # the previous O(history) Python scan with lazy-loaded relationship N+1s.
    this_completed_at = workout.completed_at or datetime.combine(
        workout.date, datetime.min.time()
    )
    # created_at is a meaningful temporal tiebreaker; the previous use of
    # Workout.id was a lexicographic UUID compare and could re-order workouts
    # that happen to land on the same date AND completed_at.
    this_created_at = workout.created_at or this_completed_at
    prior_predicate = or_(
        Workout.date < workout.date,
        and_(
            Workout.date == workout.date,
            or_(
                Workout.completed_at < this_completed_at,
                and_(
                    Workout.completed_at == this_completed_at,
                    Workout.created_at < this_created_at,
                ),
            ),
        ),
    )
    prior_workout_ids = (
        select(Workout.id)
        .where(
            Workout.user_id == str(user_id),
            Workout.status == "COMPLETED",
            prior_predicate,
        )
    )
    max_rows = (
        db.query(
            WorkoutExercise.exercise_id,
            func.max(WorkoutExercise.weight).label("max_w"),
        )
        .filter(
            WorkoutExercise.workout_id.in_(prior_workout_ids),
            WorkoutExercise.exercise_id.in_(list(here_max.keys())),
            WorkoutExercise.weight.isnot(None),
            WorkoutExercise.weight > 0,
        )
        .group_by(WorkoutExercise.exercise_id)
        .all()
    )
    prior_max: dict[str, Decimal] = {
        row.exercise_id: Decimal(str(row.max_w)) for row in max_rows
    }

    # Build PR list — strictly greater than prior max, or first-ever for the
    # exercise (no prior at all).
    pr_exercise_ids = [
        eid for eid, w in here_max.items()
        if prior_max.get(eid) is None or w > prior_max[eid]
    ]
    if not pr_exercise_ids:
        return []

    # Resolve exercise names in one query.
    name_rows = db.query(Exercise.id, Exercise.name).filter(Exercise.id.in_(pr_exercise_ids)).all()
    name_map = {r.id: r.name for r in name_rows}

    out: list[dict] = []
    for eid in pr_exercise_ids:
        weight = float(here_max[eid])
        prev = prior_max.get(eid)
        prev_f = float(prev) if prev is not None else None
        out.append({
            "exercise_id": eid,
            "exercise_name": name_map.get(eid, "Unknown"),
            "weight_kg": round(weight, 2),
            "previous_max_kg": round(prev_f, 2) if prev_f is not None else None,
            "delta_kg": round(weight - (prev_f or 0.0), 2),
        })
    # Stable, useful ordering for the UI: largest delta first.
    out.sort(key=lambda x: x["delta_kg"], reverse=True)
    return out
