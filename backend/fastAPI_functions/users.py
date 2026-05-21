from fastapi import APIRouter, Depends, HTTPException
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
    delete_user,
    update_user_name,
    change_user_password,
    verify_password,
)

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
    if str(current_user.id) != str(user_id):
        raise HTTPException(status_code=403, detail="Access denied")
    success = delete_user(db, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted"}
