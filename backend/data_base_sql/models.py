import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Date, DateTime, ForeignKey, Integer, Numeric, UniqueConstraint
from sqlalchemy.orm import relationship
from .database import Base


# -----------------------------------------------------------
# Hilfsfunktion: Erstellt eine UUID-Spalte als Primärschlüssel
# SQLite speichert UUID intern als BLOB oder TEXT.
# -----------------------------------------------------------
def UUID_PK():
    return Column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
        unique=True,
        nullable=False
    )


class User(Base):
    __tablename__ = "users"

    id = UUID_PK()
    email = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    workouts = relationship("Workout", back_populates="user")


class Exercise(Base):
    __tablename__ = "exercises"

    id = UUID_PK()
    name = Column(String, nullable=False)
    muscle_group = Column(String, nullable=False)
    description = Column(Text)
    image_url = Column(String, nullable=True)


class Workout(Base):
    __tablename__ = "workouts"

    id = UUID_PK()
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    date = Column(Date, nullable=False)
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="workouts")
    workout_exercises = relationship(
        "WorkoutExercise",
        back_populates="workout",
        cascade="all, delete",
        order_by="WorkoutExercise.order_index.asc()",
    )


class WorkoutExercise(Base):
    __tablename__ = "workout_exercises"

    id = UUID_PK()

    workout_id = Column(String(36), ForeignKey("workouts.id"), nullable=False)
    exercise_id = Column(String(36), ForeignKey("exercises.id"), nullable=False)

    sets = Column(Integer, nullable=False)
    reps = Column(Integer, nullable=False)
    weight = Column(Numeric(5, 2))
    rest_seconds = Column(Integer, nullable=False, default=30)
    rest_limit_seconds = Column(Integer, nullable=False, default=45)
    order_index = Column(Integer, nullable=False, default=0)

    workout = relationship("Workout", back_populates="workout_exercises")
    exercise = relationship("Exercise")


class UserExerciseMax(Base):
    __tablename__ = "user_exercise_maxes"
    __table_args__ = (UniqueConstraint("user_id", "exercise_id", name="uq_user_exercise_max"),)

    id = UUID_PK()
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    exercise_id = Column(String(36), ForeignKey("exercises.id"), nullable=False)
    one_rep_max = Column(Numeric(7, 2), nullable=False)
    training_max = Column(Numeric(7, 2), nullable=False)
    increment_step = Column(Numeric(5, 2), nullable=False, default=2.5)
    load_mode = Column(String(20), nullable=False, default="TOTAL")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")
    exercise = relationship("Exercise")


class TrainingProgram(Base):
    __tablename__ = "training_programs"

    id = UUID_PK()
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    goal = Column(String(30), nullable=False)
    training_days_per_week = Column(Integer, nullable=False, default=3)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    status = Column(String(20), nullable=False, default="ACTIVE")
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
    items = relationship("TrainingProgramItem", back_populates="program", cascade="all, delete")


class TrainingProgramItem(Base):
    __tablename__ = "training_program_items"

    id = UUID_PK()
    program_id = Column(String(36), ForeignKey("training_programs.id"), nullable=False)
    exercise_id = Column(String(36), ForeignKey("exercises.id"), nullable=False)
    week_number = Column(Integer, nullable=False)
    day_number = Column(Integer, nullable=False)
    sets = Column(Integer, nullable=False)
    reps = Column(Integer, nullable=False)
    percentage = Column(Numeric(5, 2), nullable=False)
    calculated_weight = Column(Numeric(7, 2), nullable=False)
    weight_per_hand = Column(Numeric(7, 2), nullable=True)
    total_weight = Column(Numeric(7, 2), nullable=True)
    rest_seconds = Column(Integer, nullable=False, default=90)
    concentric_seconds = Column(Integer, nullable=False, default=1)
    pause_seconds = Column(Integer, nullable=False, default=0)
    eccentric_seconds = Column(Integer, nullable=False, default=2)
    estimated_set_duration_seconds = Column(Integer, nullable=False, default=0)
    estimated_total_duration_seconds = Column(Integer, nullable=False, default=0)
    notes = Column(Text, nullable=True)

    program = relationship("TrainingProgram", back_populates="items")
    exercise = relationship("Exercise")
