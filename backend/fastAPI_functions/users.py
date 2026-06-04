import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session
from uuid import UUID

from .security import get_current_user
from data_base_sql.database import get_db
from data_base_sql.schemas import UserCreate, UserRead, UserUpdateRequest, ChangePasswordRequest
from data_base_sql.crud import (
    create_user,
    get_user,
    get_all_users,
    update_user,
    update_user_name,
    change_user_password,
    verify_password,
)
from data_base_sql.gdpr import delete_user_account, export_user_data

router = APIRouter(
    prefix="/users",
    tags=["Users"],
    responses={404: {"description": "User not found"}},
)


@router.post("/", response_model=UserRead, status_code=201)
def api_create_user(data: UserCreate, db: Session = Depends(get_db)):
    return create_user(db, data)


@router.get("/me", response_model=UserRead)
def api_get_me(current_user=Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserRead)
def api_update_me(
    data: UserUpdateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    updated = update_user_name(db, current_user.id, data.name)
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return updated


@router.post("/me/change-password")
def api_change_password(
    data: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not verify_password(data.old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    change_user_password(db, current_user.id, data.new_password)
    return {"message": "Password updated successfully"}


@router.get("/me/export")
def api_export_me(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """DSGVO Art. 15 / Art. 20: download every row we hold about the calling
    user as a single JSON file. password_hash is excluded by the exporter so
    the downloaded artefact can't be reused for credential theft.
    """
    payload = export_user_data(db, current_user.id)
    body = json.dumps(payload, ensure_ascii=False, indent=2)
    stamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    filename = f"gymtracker-export-{stamp}.json"
    return Response(
        content=body,
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_me(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """DSGVO Art. 17 (Recht auf Löschung). Hard-deletes the calling user
    plus every row that references them (workouts, exercises within them,
    1RM-maxes, training programs+items, achievements, coach links) and best-
    effort wipes their workouts from the vector store.
    """
    ok = delete_user_account(db, current_user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="User not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/", response_model=list[UserRead])
def api_get_all_users(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return get_all_users(db)


@router.get("/{user_id}", response_model=UserRead)
def api_get_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    user = get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.put("/{user_id}", response_model=UserRead)
def api_update_user(
    user_id: UUID,
    data: UserCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if str(current_user.id) != str(user_id):
        raise HTTPException(status_code=403, detail="Access denied")
    updated = update_user(db, user_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return updated


@router.delete("/{user_id}")
def api_delete_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Legacy self-delete by id. Routes through the cascading
    delete_user_account so it cleans up the same seven tables as DELETE /me
    instead of orphaning rows (the prior implementation used a naive
    crud.delete_user that left workouts and friends dangling).
    """
    if str(current_user.id) != str(user_id):
        raise HTTPException(status_code=403, detail="Access denied")
    success = delete_user_account(db, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted"}
