import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from uuid import UUID

from .security import get_current_user
from data_base_sql.database import get_db
from data_base_sql.schemas import ExerciseCreate, ExerciseRead
from data_base_sql.crud import (
    create_exercise,
    get_exercise,
    get_exercises_filtered,
    update_exercise,
    delete_exercise,
    set_exercise_image,
)

router = APIRouter(
    prefix="/exercises",
    tags=["Exercises"],
    responses={404: {"description": "Exercise not found"}},
)

_MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB
_ALLOWED_MAGIC = {
    b"\xff\xd8\xff": "jpg",
    b"\x89PNG": "png",
    b"GIF8": "gif",
    b"RIFF": "webp",
    b"II*\x00": "tiff",
    b"MM\x00*": "tiff",
}


def _validate_image_bytes(data: bytes) -> None:
    if len(data) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (max 5 MB)")
    for magic in _ALLOWED_MAGIC:
        if data[:len(magic)] == magic:
            return
    raise HTTPException(status_code=400, detail="File is not a valid image")


@router.post("/{exercise_id}/image", response_model=ExerciseRead)
def upload_image(
    exercise_id: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    ex = get_exercise(db, exercise_id)
    if not ex:
        raise HTTPException(status_code=404, detail="Exercise not found")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files allowed")

    raw = file.file.read()
    _validate_image_bytes(raw)

    static_dir = os.path.join(os.path.dirname(__file__), "..", "static", "exercises")
    os.makedirs(static_dir, exist_ok=True)

    if ex.image_url:
        old_path = os.path.join(os.path.dirname(__file__), "..", ex.image_url.lstrip("/"))
        if os.path.isfile(old_path):
            os.remove(old_path)

    ext = os.path.splitext(file.filename or "")[1].lower() or ".png"
    filename = f"{uuid.uuid4()}{ext}"
    path = os.path.join(static_dir, filename)
    with open(path, "wb") as f:
        f.write(raw)

    return set_exercise_image(db, exercise_id, f"/static/exercises/{filename}")


@router.get("/", response_model=list[ExerciseRead])
def api_get_all_exercises(
    muscle_group: str | None = Query(default=None),
    search: str | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    return get_exercises_filtered(db, muscle_group=muscle_group, search=search, skip=skip, limit=limit)


@router.get("/{exercise_id}", response_model=ExerciseRead)
def api_get_exercise(exercise_id: UUID, db: Session = Depends(get_db)):
    ex = get_exercise(db, exercise_id)
    if not ex:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return ex


@router.post("/", response_model=ExerciseRead)
def api_create_exercise(
    data: ExerciseCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return create_exercise(db, data)


@router.put("/{exercise_id}", response_model=ExerciseRead)
def api_update_exercise(
    exercise_id: UUID,
    data: ExerciseCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    updated = update_exercise(db, exercise_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return updated


@router.delete("/{exercise_id}")
def api_delete_exercise(
    exercise_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    ex = get_exercise(db, exercise_id)
    if not ex:
        raise HTTPException(status_code=404, detail="Exercise not found")

    if ex.image_url:
        img_path = os.path.join(os.path.dirname(__file__), "..", ex.image_url.lstrip("/"))
        if os.path.isfile(img_path):
            os.remove(img_path)

    delete_exercise(db, exercise_id)
    return {"message": "Exercise deleted"}
