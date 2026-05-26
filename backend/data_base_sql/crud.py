from uuid import UUID
from datetime import datetime
from sqlalchemy.orm import Session
from .models import User, Exercise, Workout, WorkoutExercise, UserExerciseMax, TrainingProgram, TrainingProgramItem
from .calculations import build_program_item_metrics
from .schemas import UserCreate, ExerciseCreate, WorkoutCreate, WorkoutExerciseCreate, UserExerciseMaxCreate, TrainingProgramGenerateRequest, NextCycleRequest
from passlib.context import CryptContext
from fastapi import HTTPException
import hashlib


pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")



# ============================================================
# USERS CRUD
# ============================================================

def create_user(db: Session, user: UserCreate):
    if not user.password:
        raise HTTPException(status_code=400, detail="Password is required")

    # Hash the plain password directly (Argon2 has no 72-byte limit)
    hashed_pw = pwd_context.hash(user.password)

    db_user = User(
        email=user.email,
        name=user.name,
        password_hash=hashed_pw,
    )

    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def get_user_by_email(db: Session, email: str):
    return db.query(User).filter(User.email == email).first()


def verify_password(plain_password: str, password_hash: str) -> bool:
    """
    Verify password.

    Supports:
    1) New format: Argon2 hash of plain password
    2) Legacy format: Argon2 hash of sha256(plain_password)  (your old logic)
    """
    # 1) Try normal verify (new correct behavior)
    try:
        if pwd_context.verify(plain_password, password_hash):
            return True
    except Exception:
        pass

    # 2) Backward compatible: sha256 -> verify (old users)
    try:
        sha = hashlib.sha256(plain_password.encode("utf-8")).hexdigest()
        return pwd_context.verify(sha, password_hash)
    except Exception:
        return False


def get_user(db: Session, user_id: UUID):
    return db.query(User).filter(User.id == str(user_id)).first()


def get_all_users(db: Session):
    return db.query(User).all()


def update_user(db: Session, user_id: UUID, data: UserCreate):
    user = get_user(db, user_id)
    if not user:
        return None

    user.email = data.email
    user.name = data.name

    # Hash the plain password directly (do NOT truncate)
    if data.password:
        user.password_hash = pwd_context.hash(data.password)

    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, user_id: UUID):
    user = get_user(db, user_id)
    if not user:
        return False

    db.delete(user)
    db.commit()
    return True

# ============================================================
# EXERCISES CRUD
# ============================================================

def create_exercise(db: Session, data: ExerciseCreate):
    """
    Legt eine neue Übung in der Datenbank an.
    """
    new_ex = Exercise(
        name=data.name,
        muscle_group=data.muscle_group,
        description=data.description
    )
    db.add(new_ex)
    db.commit()
    db.refresh(new_ex)
    return new_ex

def set_exercise_image(db: Session, exercise_id: UUID, image_url: str):
    """Update exercise image_url and return updated exercise."""
    ex = db.query(Exercise).filter(Exercise.id == str(exercise_id)).first()
    if not ex:
        return None
    ex.image_url = image_url
    db.commit()
    db.refresh(ex)
    return ex

def get_exercise(db: Session, exercise_id: UUID):
    """ Holt eine bestimmte Übung anhand ihrer ID. """
    return db.query(Exercise).filter(Exercise.id == str(exercise_id)).first()



def get_all_exercises(db: Session):
    """ Gibt alle Übungen zurück. """
    return db.query(Exercise).all()



def update_exercise(db: Session, exercise_id: UUID, data: ExerciseCreate):
    """
    Aktualisiert eine bestehende Übung.

    Setzt:
    - Name
    - Muskelgruppe
    - Beschreibung
    """
    exercise = get_exercise(db, exercise_id)
    if not exercise:
        return None

    exercise.name = data.name
    exercise.muscle_group = data.muscle_group
    exercise.description = data.description

    db.commit()
    db.refresh(exercise)
    return exercise



def delete_exercise(db: Session, exercise_id: UUID):
    """ Löscht eine Übung aus der Datenbank. """
    ex = get_exercise(db, exercise_id)
    if ex:
        db.delete(ex)
        db.commit()
        return True
    return False



# ============================================================
# WORKOUT CRUD
# ============================================================

def create_workout(db: Session, user_id: UUID, data: WorkoutCreate):
    workout = Workout(
        user_id=str(user_id),
        date=data.workout_date,
        notes=data.notes,
        created_at=datetime.utcnow()
    )

    db.add(workout)
    db.flush()  # Workout.id wird generiert

    for item in data.exercises:
        we = WorkoutExercise(
            workout_id=str(workout.id),
            exercise_id=str(item.exercise_id),
            sets=item.sets,
            reps=item.reps,
            weight=item.weight,
            rest_seconds=item.rest_seconds,
            rest_limit_seconds=item.rest_limit_seconds,
            order_index=item.order_index,
        )
        db.add(we)

    db.commit()
    db.refresh(workout)
    return workout

def get_all_workouts_by_user(db: Session, user_id: UUID):
    return (
        db.query(Workout)
        .filter(Workout.user_id == str(user_id))
        .order_by(Workout.date.desc())
        .all()
    )



def get_workout(db: Session, workout_id: UUID):
    """ Holt ein Workout anhand der ID. """
    return db.query(Workout).filter(Workout.id == str(workout_id)).first()



def get_all_workouts(db: Session):
    """ Gibt alle Workouts sortiert nach Datum zurück. """
    return db.query(Workout).order_by(Workout.date.desc()).all()



def update_workout(db: Session, workout_id: UUID, data: WorkoutCreate):
    """
    Aktualisiert grundlegende Workout-Daten.

    Wichtig:
    - Diese Funktion ändert NICHT die WorkoutExercises!
    """
    workout = get_workout(db, workout_id)
    if not workout:
        return None

    # Schema uses `workout_date`, DB model uses `date`
    workout.date = data.workout_date
    workout.notes = data.notes

    db.commit()
    db.refresh(workout)
    return workout



def delete_workout(db: Session, workout_id: UUID):
    """
    Löscht ein Workout sowie alle verknüpften WorkoutExercises
    dank Cascade-Delete.
    """
    workout = get_workout(db, workout_id)
    if workout:
        db.delete(workout)
        db.commit()
        return True
    return False



# ============================================================
# WORKOUT_EXERCISES CRUD
# ============================================================

def add_exercise_to_workout(db: Session, data: WorkoutExerciseCreate):
    """
    Fügt eine Übung zu einem bestehenden Workout hinzu.
    """
    new_we = WorkoutExercise(
        workout_id=str(data.workout_id),
        exercise_id=str(data.exercise_id),
        sets=data.sets,
        reps=data.reps,
        weight=data.weight,
        rest_seconds=data.rest_seconds,
        rest_limit_seconds=data.rest_limit_seconds,
        order_index=data.order_index,
    )
    db.add(new_we)
    db.commit()
    db.refresh(new_we)
    return new_we



def get_workout_exercise(db: Session, we_id: UUID):
    return db.query(WorkoutExercise).filter(WorkoutExercise.id == str(we_id)).first()



def get_workout_exercises_by_workout(db: Session, workout_id: UUID):
    return (
        db.query(WorkoutExercise)
        .filter(WorkoutExercise.workout_id == str(workout_id))
        .all()
    )


def update_workout_exercise(db: Session, we_id: UUID, data: WorkoutExerciseCreate):
    """
    Aktualisiert einen WorkoutExercise-Eintrag:
    - Übung ändern
    - Sets ändern
    - Wiederholungen ändern
    - Gewicht ändern
    """
    we = db.query(WorkoutExercise).filter(WorkoutExercise.id == str(we_id)).first()
    if not we:
        return None

    we.workout_id = str(data.workout_id)
    we.exercise_id = str(data.exercise_id)
    we.sets = data.sets
    we.reps = data.reps
    we.weight = data.weight
    we.rest_seconds = data.rest_seconds
    we.rest_limit_seconds = data.rest_limit_seconds
    we.order_index = data.order_index

    db.commit()
    db.refresh(we)
    return we



def delete_workout_exercise(db: Session, we_id: UUID):
    """ Löscht eine Übung aus einem Workout. """
    we = db.query(WorkoutExercise).filter(WorkoutExercise.id == str(we_id)).first()
    if we:
        db.delete(we)
        db.commit()
        return True
    return False


# ============================================================
# STRENGTH MAXES + PROGRAM GENERATION
# ============================================================

from decimal import Decimal, ROUND_HALF_UP
from datetime import timedelta


def _to_decimal(value) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _round_to_step(value: Decimal, step: Decimal) -> Decimal:
    if step <= 0:
        return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    rounded = (value / step).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * step
    return rounded.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _goal_templates(goal: str):
    goal = (goal or "strength").lower()
    templates = {
        "strength": [
            {"week": 1, "sets": 5, "reps": 5, "percentage": Decimal("0.70"), "notes": "Foundation week"},
            {"week": 2, "sets": 5, "reps": 5, "percentage": Decimal("0.75"), "notes": "Progressive overload"},
            {"week": 3, "sets": 5, "reps": 3, "percentage": Decimal("0.80"), "notes": "Heavier week"},
            {"week": 4, "sets": 3, "reps": 8, "percentage": Decimal("0.60"), "notes": "Deload / recovery"},
        ],
        "hypertrophy": [
            {"week": 1, "sets": 4, "reps": 12, "percentage": Decimal("0.60"), "notes": "Volume base"},
            {"week": 2, "sets": 4, "reps": 10, "percentage": Decimal("0.67"), "notes": "Volume progression"},
            {"week": 3, "sets": 4, "reps": 8, "percentage": Decimal("0.72"), "notes": "Higher tension"},
            {"week": 4, "sets": 3, "reps": 12, "percentage": Decimal("0.55"), "notes": "Deload / recovery"},
        ],
        "endurance": [
            {"week": 1, "sets": 3, "reps": 15, "percentage": Decimal("0.50"), "notes": "Work capacity"},
            {"week": 2, "sets": 3, "reps": 15, "percentage": Decimal("0.55"), "notes": "Slight progression"},
            {"week": 3, "sets": 4, "reps": 12, "percentage": Decimal("0.60"), "notes": "Peak week"},
            {"week": 4, "sets": 2, "reps": 20, "percentage": Decimal("0.45"), "notes": "Deload / recovery"},
        ],
    }
    return templates.get(goal, templates["strength"])


def create_or_update_user_exercise_max(db: Session, user_id: UUID, data: UserExerciseMaxCreate):
    record = (
        db.query(UserExerciseMax)
        .filter(
            UserExerciseMax.user_id == str(user_id),
            UserExerciseMax.exercise_id == str(data.exercise_id),
        )
        .first()
    )

    one_rep_max = _to_decimal(data.one_rep_max).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    training_max = (one_rep_max * Decimal("0.90")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    increment_step = _to_decimal(data.increment_step).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    if record:
        record.one_rep_max = one_rep_max
        record.training_max = training_max
        record.increment_step = increment_step
        record.load_mode = data.load_mode
    else:
        record = UserExerciseMax(
            user_id=str(user_id),
            exercise_id=str(data.exercise_id),
            one_rep_max=one_rep_max,
            training_max=training_max,
            increment_step=increment_step,
            load_mode=data.load_mode,
        )
        db.add(record)

    db.commit()
    db.refresh(record)
    return record


def get_user_exercise_maxes(db: Session, user_id: UUID):
    return (
        db.query(UserExerciseMax)
        .filter(UserExerciseMax.user_id == str(user_id))
        .order_by(UserExerciseMax.updated_at.desc())
        .all()
    )


def _load_selected_maxes(db: Session, user_id: UUID, exercise_ids: list[UUID] | None = None):
    query = db.query(UserExerciseMax).filter(UserExerciseMax.user_id == str(user_id))
    if exercise_ids:
        query = query.filter(UserExerciseMax.exercise_id.in_([str(x) for x in exercise_ids]))
    return query.all()


def generate_training_program(db: Session, user_id: UUID, request: TrainingProgramGenerateRequest):
    selected_maxes = _load_selected_maxes(db, user_id, request.exercise_ids)
    if not selected_maxes:
        raise HTTPException(status_code=400, detail="Please save at least one max value first.")

    templates = _goal_templates(request.goal)
    start_date = request.start_date
    end_date = start_date + timedelta(days=27)

    program = TrainingProgram(
        user_id=str(user_id),
        goal=request.goal,
        training_days_per_week=request.training_days_per_week,
        start_date=start_date,
        end_date=end_date,
        status="ACTIVE",
    )
    db.add(program)
    db.flush()

    ordered_maxes = sorted(selected_maxes, key=lambda x: str(x.exercise_id))

    for index, max_record in enumerate(ordered_maxes):
        day_number = (index % request.training_days_per_week) + 1
        for template in templates:
            calc = _round_to_step(_to_decimal(max_record.training_max) * template["percentage"], _to_decimal(max_record.increment_step))
            if max_record.load_mode == "PER_HAND":
                weight_per_hand = calc
                total_weight = (calc * Decimal("2")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            else:
                weight_per_hand = None
                total_weight = calc

            metrics = build_program_item_metrics(request.goal, template["sets"], template["reps"])
            item = TrainingProgramItem(
                program_id=str(program.id),
                exercise_id=str(max_record.exercise_id),
                week_number=template["week"],
                day_number=day_number,
                sets=template["sets"],
                reps=template["reps"],
                percentage=(template["percentage"] * Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
                calculated_weight=calc,
                weight_per_hand=weight_per_hand,
                total_weight=total_weight,
                rest_seconds=metrics["rest_seconds"],
                concentric_seconds=metrics["concentric_seconds"],
                pause_seconds=metrics["pause_seconds"],
                eccentric_seconds=metrics["eccentric_seconds"],
                estimated_set_duration_seconds=metrics["estimated_set_duration_seconds"],
                estimated_total_duration_seconds=metrics["estimated_total_duration_seconds"],
                notes=template["notes"],
            )
            db.add(item)

    db.commit()
    db.refresh(program)
    return program


def get_training_programs_by_user(db: Session, user_id: UUID):
    programs = (
        db.query(TrainingProgram)
        .filter(TrainingProgram.user_id == str(user_id))
        .order_by(TrainingProgram.created_at.desc())
        .all()
    )
    return programs


def get_training_program(db: Session, program_id: UUID):
    return db.query(TrainingProgram).filter(TrainingProgram.id == str(program_id)).first()


# ============================================================
# PROGRESS TRACKING
# ============================================================

from datetime import date as date_type


def get_exercise_history(db: Session, user_id: UUID, exercise_id: UUID) -> list[dict]:
    """Returns chronological history of sets/reps/weight for one exercise by one user."""
    rows = (
        db.query(Workout.date, WorkoutExercise.sets, WorkoutExercise.reps, WorkoutExercise.weight)
        .join(WorkoutExercise, WorkoutExercise.workout_id == Workout.id)
        .filter(
            Workout.user_id == str(user_id),
            WorkoutExercise.exercise_id == str(exercise_id),
        )
        .order_by(Workout.date.asc())
        .all()
    )
    result = []
    for row in rows:
        w = Decimal(str(row.weight)) if row.weight else Decimal("0")
        volume = w * Decimal(row.sets * row.reps)
        result.append({
            "date": str(row.date),
            "sets": row.sets,
            "reps": row.reps,
            "weight": str(row.weight) if row.weight else None,
            "volume_kg": str(volume.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
        })
    return result


def predict_exercise_progress(
    db: Session,
    user_id: UUID,
    exercise_id: UUID,
    target_weight: Decimal,
) -> dict:
    """
    Linear regression on this user's weight history for one exercise.

    Models weight = intercept + slope * days_since_first_session and projects when
    `target_weight` will be reached. The weekly slope is classified into one of three
    semantic buckets via `reason`:

      slope > +0.1 kg/week   -> "steady_progress"
      slope in [-0.1, +0.1]  -> "plateau"        (essentially flat)
      slope <  -0.1 kg/week  -> "regression"     (getting weaker — different fix)

    `already_achieved` is independent and true when the last logged weight already
    meets or exceeds the target.

    Implemented with the Python standard library (no numpy dependency).
    """
    rows = (
        db.query(Workout.date, WorkoutExercise.weight)
        .join(WorkoutExercise, WorkoutExercise.workout_id == Workout.id)
        .filter(
            Workout.user_id == str(user_id),
            WorkoutExercise.exercise_id == str(exercise_id),
            WorkoutExercise.weight.isnot(None),
        )
        .order_by(Workout.date.asc())
        .all()
    )

    points = [
        (row.date, float(row.weight))
        for row in rows
        if row.weight is not None and float(row.weight) > 0
    ]
    if len(points) < 3:
        raise HTTPException(
            status_code=422,
            detail="Need at least 3 weighted sessions for this exercise to predict.",
        )

    first_date = points[0][0]
    xs = [(d - first_date).days for d, _ in points]
    ys = [w for _, w in points]
    n = len(xs)

    # Least-squares linear regression (closed form)
    sum_x = sum(xs)
    sum_y = sum(ys)
    sum_xx = sum(x * x for x in xs)
    sum_xy = sum(x * y for x, y in zip(xs, ys))
    denom = n * sum_xx - sum_x * sum_x
    if denom == 0:
        # All sessions on the same day -> cannot infer a slope.
        raise HTTPException(
            status_code=422,
            detail="Sessions need to span more than one day to predict progress.",
        )

    slope_per_day = (n * sum_xy - sum_x * sum_y) / denom
    intercept = (sum_y - slope_per_day * sum_x) / n
    slope_per_week = slope_per_day * 7

    target = float(target_weight)
    current_weight = ys[-1]
    already_achieved = current_weight >= target

    if slope_per_week > 0.1:
        reason = "steady_progress"
    elif slope_per_week < -0.1:
        reason = "regression"
    else:
        reason = "plateau"

    weeks_to_target = None
    predicted_date = None
    if not already_achieved and slope_per_day > 0:
        target_days = (target - intercept) / slope_per_day
        weeks_to_target = round((target_days - xs[-1]) / 7, 2)
        predicted_date = (first_date + timedelta(days=int(round(target_days)))).isoformat()

    return {
        "sessions": n,
        "current_weight": round(current_weight, 2),
        "target_weight": round(target, 2),
        "slope_kg_per_week": round(slope_per_week, 3),
        "weeks_to_target": weeks_to_target,
        "predicted_date": predicted_date,
        "reason": reason,
        "already_achieved": already_achieved,
    }


def get_user_stats(db: Session, user_id: UUID) -> dict:
    """Returns summary stats: total workouts, streak, volume this week, workouts this week."""
    from datetime import date as d_type, timedelta

    all_workouts = (
        db.query(Workout.date)
        .filter(Workout.user_id == str(user_id))
        .order_by(Workout.date.desc())
        .all()
    )

    total_workouts = len(all_workouts)
    unique_dates = sorted({row.date for row in all_workouts}, reverse=True)

    # Streak: consecutive days going back from today
    today = d_type.today()
    current_streak = 0
    best_streak = 0
    check = today
    date_set = set(unique_dates)
    # Allow today or yesterday as starting point
    if check not in date_set and (check - timedelta(days=1)) in date_set:
        check = check - timedelta(days=1)
    while check in date_set:
        current_streak += 1
        check = check - timedelta(days=1)

    # Best streak (full scan)
    streak = 0
    for i, d in enumerate(sorted(unique_dates)):
        if i == 0:
            streak = 1
        else:
            prev = sorted(unique_dates)[i - 1]
            if (d - prev).days == 1:
                streak += 1
            else:
                streak = 1
        best_streak = max(best_streak, streak)

    # This week (Mon–Sun)
    week_start = today - timedelta(days=today.weekday())
    workouts_this_week = sum(1 for d in unique_dates if week_start <= d <= today)

    # Total volume
    rows = (
        db.query(WorkoutExercise.sets, WorkoutExercise.reps, WorkoutExercise.weight)
        .join(Workout, Workout.id == WorkoutExercise.workout_id)
        .filter(Workout.user_id == str(user_id))
        .all()
    )
    total_volume = Decimal("0")
    for r in rows:
        if r.weight:
            total_volume += Decimal(str(r.weight)) * Decimal(r.sets * r.reps)

    # Favorite muscle group
    muscle_rows = (
        db.query(Exercise.muscle_group)
        .join(WorkoutExercise, WorkoutExercise.exercise_id == Exercise.id)
        .join(Workout, Workout.id == WorkoutExercise.workout_id)
        .filter(Workout.user_id == str(user_id))
        .all()
    )
    muscle_counts: dict[str, int] = {}
    for r in muscle_rows:
        muscle_counts[r.muscle_group] = muscle_counts.get(r.muscle_group, 0) + 1
    favorite_muscle = max(muscle_counts, key=muscle_counts.get) if muscle_counts else None

    return {
        "total_workouts": total_workouts,
        "current_streak": current_streak,
        "best_streak": best_streak,
        "workouts_this_week": workouts_this_week,
        "total_volume_kg": str(total_volume.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
        "favorite_muscle_group": favorite_muscle,
    }


# ============================================================
# PROFILE MANAGEMENT
# ============================================================

def update_user_name(db: Session, user_id: UUID, name: str | None):
    user = get_user(db, user_id)
    if not user:
        return None
    user.name = name
    db.commit()
    db.refresh(user)
    return user


def change_user_password(db: Session, user_id: UUID, new_password: str):
    user = get_user(db, user_id)
    if not user:
        return None
    user.password_hash = pwd_context.hash(new_password)
    db.commit()
    return user


# ============================================================
# PAGINATED / FILTERED QUERIES
# ============================================================

def get_workouts_paginated(
    db: Session,
    user_id: UUID,
    skip: int = 0,
    limit: int = 20,
    start_date=None,
    end_date=None,
):
    query = db.query(Workout).filter(Workout.user_id == str(user_id))
    if start_date:
        query = query.filter(Workout.date >= start_date)
    if end_date:
        query = query.filter(Workout.date <= end_date)
    return query.order_by(Workout.date.desc()).offset(skip).limit(limit).all()


def get_exercises_filtered(
    db: Session,
    muscle_group: str | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = 100,
):
    query = db.query(Exercise)
    if muscle_group:
        query = query.filter(Exercise.muscle_group == muscle_group)
    if search:
        query = query.filter(Exercise.name.ilike(f"%{search}%"))
    return query.order_by(Exercise.name.asc()).offset(skip).limit(limit).all()


def generate_next_cycle(db: Session, user_id: UUID, program_id: UUID, request: NextCycleRequest):
    program = get_training_program(db, program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    if str(program.user_id) != str(user_id):
        raise HTTPException(status_code=403, detail="You cannot access this program")

    adjustments = {str(item.exercise_id): item.result for item in request.adjustments}
    program_items = list(program.items or [])
    exercise_ids = sorted({str(item.exercise_id) for item in program_items})
    if not exercise_ids:
        raise HTTPException(status_code=400, detail="Program has no items")

    max_records = _load_selected_maxes(db, user_id, [UUID(ex_id) for ex_id in exercise_ids])
    max_by_exercise = {str(record.exercise_id): record for record in max_records}

    for exercise_id in exercise_ids:
        record = max_by_exercise.get(exercise_id)
        if not record:
            continue
        current_max = _to_decimal(record.one_rep_max)
        step = _to_decimal(record.increment_step)
        result = adjustments.get(exercise_id, "REPEAT")

        if result == "SUCCESS":
            new_max = current_max + step
        elif result == "FAIL":
            new_max = max(Decimal("0"), current_max - step)
        else:
            new_max = current_max

        payload = UserExerciseMaxCreate(
            exercise_id=UUID(exercise_id),
            one_rep_max=new_max,
            increment_step=record.increment_step,
            load_mode=record.load_mode,
        )
        create_or_update_user_exercise_max(db, user_id, payload)

    generate_request = TrainingProgramGenerateRequest(
        goal=request.goal or program.goal,
        start_date=request.start_date,
        training_days_per_week=request.training_days_per_week,
        exercise_ids=[UUID(ex_id) for ex_id in exercise_ids],
    )
    return generate_training_program(db, user_id, generate_request)
