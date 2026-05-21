from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from data_base_sql.database import get_db
from data_base_sql.schemas import UserCreate, UserRead, LoginRequest, TokenResponse
from data_base_sql.crud import create_user, get_user_by_email, verify_password
from .security import create_access_token, get_current_user

router = APIRouter(prefix="/auth", tags=["Auth"])

@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, db: Session = Depends(get_db)):
    if get_user_by_email(db, data.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    return create_user(db, data)

@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = get_user_by_email(db, data.email)
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(subject=str(user.id))
    return TokenResponse(access_token=token)

@router.get("/me", response_model=UserRead)
def me(current_user=Depends(get_current_user)):
    return current_user
