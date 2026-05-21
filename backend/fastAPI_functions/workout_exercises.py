from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID

from .security import get_current_user
from data_base_sql.database import get_db
from data_base_sql.schemas import WorkoutExerciseCreate, WorkoutExerciseRead
from data_base_sql.crud import (
    add_exercise_to_workout,
    update_workout_exercise,
    delete_workout_exercise,
    get_workout_exercise,
    get_workout_exercises_by_workout,
    get_workout,
)
from data_base_sql.models import WorkoutExercise, Workout

router = APIRouter(
    prefix="/workout-exercises",
    tags=["Workout Exercises"],
)


def _require_workout_ownership(db: Session, workout_id: UUID, current_user):
    workout = get_workout(db, workout_id)
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    if str(workout.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")
    return workout


@router.get("/", response_model=list[WorkoutExerciseRead])
def api_get_all_workout_exercises(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    items = (
        db.query(WorkoutExercise)
        .join(Workout, Workout.id == WorkoutExercise.workout_id)
        .filter(Workout.user_id == str(current_user.id))
        .all()
    )
    return items


@router.get("/by-workout/{workout_id}", response_model=list[WorkoutExerciseRead])
def api_get_exercises_by_workout(
    workout_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_workout_ownership(db, workout_id, current_user)
    return get_workout_exercises_by_workout(db, workout_id)


@router.get("/{we_id}", response_model=WorkoutExerciseRead)
def api_get_workout_exercise(
    we_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    we = get_workout_exercise(db, we_id)
    if not we:
        raise HTTPException(status_code=404, detail="Workout exercise not found")
    _require_workout_ownership(db, UUID(we.workout_id), current_user)
    return we


@router.post("/", response_model=WorkoutExerciseRead)
def api_add_exercise(
    data: WorkoutExerciseCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_workout_ownership(db, data.workout_id, current_user)
    return add_exercise_to_workout(db, data)


@router.put("/{we_id}", response_model=WorkoutExerciseRead)
def api_update_exercise(
    we_id: UUID,
    data: WorkoutExerciseCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    we = get_workout_exercise(db, we_id)
    if not we:
        raise HTTPException(status_code=404, detail="Workout exercise not found")
    _require_workout_ownership(db, UUID(we.workout_id), current_user)
    return update_workout_exercise(db, we_id, data)


@router.delete("/{we_id}")
def api_delete_exercise(
    we_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    we = get_workout_exercise(db, we_id)
    if not we:
        raise HTTPException(status_code=404, detail="Workout exercise not found")
    _require_workout_ownership(db, UUID(we.workout_id), current_user)
    delete_workout_exercise(db, we_id)
    return {"message": "Workout exercise deleted"}
