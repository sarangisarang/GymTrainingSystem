from decimal import Decimal
from uuid import UUID
import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .security import get_current_user
from data_base_sql.database import get_db
from data_base_sql.schemas import (
    WorkoutCreate,
    WorkoutRead,
    WorkoutAnalysisRead,
    ExerciseHistoryEntry,
    ExercisePredictionRead,
    UserStatsRead,
)
from data_base_sql.crud import (
    create_workout,
    get_workout,
    get_workouts_paginated,
    update_workout,
    delete_workout,
    get_exercise_history,
    get_user_stats,
    predict_exercise_progress,
)
from data_base_sql.calculations import calculate_workout_analysis

router = APIRouter(
    prefix="/workouts",
    tags=["Workouts"],
)


@router.post("/", response_model=WorkoutRead)
def api_create_workout(
    data: WorkoutCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return create_workout(db, current_user.id, data)


@router.get("/stats/summary", response_model=UserStatsRead)
def api_get_stats(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return get_user_stats(db, current_user.id)


@router.get("/history/exercise/{exercise_id}", response_model=list[ExerciseHistoryEntry])
def api_get_exercise_history(
    exercise_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return get_exercise_history(db, current_user.id, exercise_id)


@router.get("/predict/{exercise_id}", response_model=ExercisePredictionRead)
def api_predict_exercise_progress(
    exercise_id: UUID,
    target_weight: Decimal = Query(..., gt=0, description="Target weight in kg"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Predict when the user will reach `target_weight` for this exercise based on history."""
    return predict_exercise_progress(db, current_user.id, exercise_id, target_weight)


@router.get("/", response_model=list[WorkoutRead])
def api_get_all_workouts(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    start_date: dt.date | None = Query(default=None),
    end_date: dt.date | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return get_workouts_paginated(db, current_user.id, skip=skip, limit=limit,
                                  start_date=start_date, end_date=end_date)


@router.get("/{workout_id}", response_model=WorkoutRead)
def api_get_workout(
    workout_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    workout = get_workout(db, workout_id)
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    if str(workout.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")
    return workout


@router.get("/{workout_id}/analysis", response_model=WorkoutAnalysisRead)
def api_get_workout_analysis(
    workout_id: UUID,
    body_weight_kg: Decimal | None = Query(default=None, gt=0),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    workout = get_workout(db, workout_id)
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    if str(workout.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")
    return calculate_workout_analysis(workout, body_weight_kg=body_weight_kg)


@router.put("/{workout_id}", response_model=WorkoutRead)
def api_update_workout(
    workout_id: UUID,
    data: WorkoutCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    workout = get_workout(db, workout_id)
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    if str(workout.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")
    return update_workout(db, workout_id, data)


@router.delete("/{workout_id}")
def api_delete_workout(
    workout_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    workout = get_workout(db, workout_id)
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    if str(workout.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")
    delete_workout(db, workout_id)
    return {"message": "Workout deleted"}
