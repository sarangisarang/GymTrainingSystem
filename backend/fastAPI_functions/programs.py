from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from uuid import UUID

from data_base_sql.database import get_db
from data_base_sql.schemas import (
    UserExerciseMaxCreate,
    UserExerciseMaxRead,
    TrainingProgramGenerateRequest,
    TrainingProgramRead,
    NextCycleRequest,
)
from data_base_sql.crud import (
    create_or_update_user_exercise_max,
    get_user_exercise_maxes,
    generate_training_program,
    get_training_programs_by_user,
    get_training_program,
    generate_next_cycle,
)
from .security import get_current_user

router = APIRouter(prefix="/programs", tags=["Programs"])


@router.post("/maxes", response_model=UserExerciseMaxRead)
def api_save_max(
    data: UserExerciseMaxCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return create_or_update_user_exercise_max(db, current_user.id, data)


@router.get("/maxes", response_model=list[UserExerciseMaxRead])
def api_get_my_maxes(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return get_user_exercise_maxes(db, current_user.id)


@router.post("/generate", response_model=TrainingProgramRead)
def api_generate_program(
    data: TrainingProgramGenerateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return generate_training_program(db, current_user.id, data)


@router.get("/mine", response_model=list[TrainingProgramRead])
def api_get_my_programs(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return get_training_programs_by_user(db, current_user.id)


@router.get("/{program_id}", response_model=TrainingProgramRead)
def api_get_program(
    program_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    program = get_training_program(db, program_id)
    if not program or str(program.user_id) != str(current_user.id):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Program not found")
    return program


@router.post("/{program_id}/next-cycle", response_model=TrainingProgramRead)
def api_generate_next_cycle(
    program_id: UUID,
    data: NextCycleRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return generate_next_cycle(db, current_user.id, program_id, data)
