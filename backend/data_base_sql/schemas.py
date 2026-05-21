from __future__ import annotations

from typing import Optional, List, Literal
from uuid import UUID
import datetime as dt
from decimal import Decimal

from pydantic import BaseModel, Field, ConfigDict, EmailStr


class ConfiguredModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=72)
    name: str | None = None


class UserRead(ConfiguredModel):
    id: UUID
    email: str
    name: Optional[str] = None
    created_at: dt.datetime


class ExerciseCreate(BaseModel):
    name: str
    muscle_group: str
    description: Optional[str] = None


class ExerciseRead(ConfiguredModel):
    id: UUID
    name: str
    muscle_group: str
    description: Optional[str] = None
    image_url: Optional[str] = None


class WorkoutExerciseInWorkoutCreate(BaseModel):
    exercise_id: UUID
    sets: int
    reps: int
    weight: Optional[Decimal] = None
    rest_seconds: int = Field(default=30, ge=0, le=3600)
    rest_limit_seconds: int = Field(default=45, ge=0, le=7200)
    order_index: int = Field(default=0, ge=0)


class WorkoutExerciseCreate(BaseModel):
    workout_id: UUID
    exercise_id: UUID
    sets: int
    reps: int
    weight: Optional[Decimal] = None
    rest_seconds: int = Field(default=30, ge=0, le=3600)
    rest_limit_seconds: int = Field(default=45, ge=0, le=7200)
    order_index: int = Field(default=0, ge=0)


class WorkoutExerciseRead(ConfiguredModel):
    id: UUID
    workout_id: UUID
    exercise_id: UUID
    sets: int
    reps: int
    weight: Optional[Decimal] = None
    rest_seconds: int
    rest_limit_seconds: int
    order_index: int


class WorkoutCreate(BaseModel):
    workout_date: dt.date
    notes: Optional[str] = None
    exercises: List[WorkoutExerciseInWorkoutCreate] = Field(default_factory=list)


class WorkoutRead(ConfiguredModel):
    id: UUID
    user_id: UUID
    date: dt.date
    notes: Optional[str] = None
    created_at: dt.datetime
    workout_exercises: List[WorkoutExerciseRead] = Field(default_factory=list)


class WorkoutAnalysisRead(BaseModel):
    goal: str
    body_weight_kg: Optional[Decimal] = None
    total_exercises: int
    total_sets: int
    total_reps: int
    total_volume_kg: Decimal
    average_weight_per_rep_kg: Decimal
    recommended_rest_seconds: int
    concentric_seconds: int
    pause_seconds: int
    eccentric_seconds: int
    estimated_active_seconds: int
    estimated_rest_seconds: int
    estimated_transition_seconds: int
    estimated_total_seconds: int
    met_value: Optional[Decimal] = None
    estimated_calories_kcal: Optional[Decimal] = None
    fat_energy_share: Optional[Decimal] = None
    estimated_fat_burned_grams: Optional[Decimal] = None


class UserExerciseMaxCreate(BaseModel):
    exercise_id: UUID
    one_rep_max: Decimal = Field(..., gt=0)
    increment_step: Decimal = Field(default=Decimal("2.5"), gt=0)
    load_mode: Literal["TOTAL", "PER_HAND"] = "TOTAL"


class UserExerciseMaxRead(ConfiguredModel):
    id: UUID
    user_id: UUID
    exercise_id: UUID
    one_rep_max: Decimal
    training_max: Decimal
    increment_step: Decimal
    load_mode: str
    created_at: dt.datetime
    updated_at: dt.datetime


class TrainingProgramGenerateRequest(BaseModel):
    goal: Literal["strength", "hypertrophy", "endurance"] = "strength"
    start_date: dt.date
    training_days_per_week: int = Field(default=3, ge=1, le=7)
    exercise_ids: List[UUID] = Field(default_factory=list)


class TrainingProgramItemRead(ConfiguredModel):
    id: UUID
    program_id: UUID
    exercise_id: UUID
    week_number: int
    day_number: int
    sets: int
    reps: int
    percentage: Decimal
    calculated_weight: Decimal
    weight_per_hand: Optional[Decimal] = None
    total_weight: Optional[Decimal] = None
    rest_seconds: int
    concentric_seconds: int
    pause_seconds: int
    eccentric_seconds: int
    estimated_set_duration_seconds: int
    estimated_total_duration_seconds: int
    notes: Optional[str] = None


class TrainingProgramRead(ConfiguredModel):
    id: UUID
    user_id: UUID
    goal: str
    training_days_per_week: int
    start_date: dt.date
    end_date: dt.date
    status: str
    created_at: dt.datetime
    items: List[TrainingProgramItemRead] = Field(default_factory=list)


class ExerciseHistoryEntry(BaseModel):
    date: str
    sets: int
    reps: int
    weight: Optional[str] = None
    volume_kg: str


class UserStatsRead(BaseModel):
    total_workouts: int
    current_streak: int
    best_streak: int
    workouts_this_week: int
    total_volume_kg: str
    favorite_muscle_group: Optional[str] = None


class UserUpdateRequest(BaseModel):
    name: str | None = None


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=8, max_length=72)


class NextCycleExerciseAdjustment(BaseModel):
    exercise_id: UUID
    result: Literal["SUCCESS", "REPEAT", "FAIL"]


class NextCycleRequest(BaseModel):
    start_date: dt.date
    goal: Optional[Literal["strength", "hypertrophy", "endurance"]] = None
    training_days_per_week: int = Field(default=3, ge=1, le=7)
    adjustments: List[NextCycleExerciseAdjustment] = Field(default_factory=list)
