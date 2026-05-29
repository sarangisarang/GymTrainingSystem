"""Gamification endpoints (Issue #11): badges, weekly challenge, leaderboard."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .security import get_current_user
from data_base_sql.database import get_db
from data_base_sql.schemas import (
    AchievementsRead,
    LeaderboardOptInRequest,
    LeaderboardRead,
    UserRead,
    WeeklyChallengeRead,
)
from data_base_sql.gamification import (
    evaluate_and_award_badges,
    get_leaderboard,
    get_weekly_challenge,
    set_leaderboard_opt_in,
)


router = APIRouter(tags=["Gamification"])


@router.get("/achievements/", response_model=AchievementsRead)
def api_get_achievements(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """All badges with earned status. Newly earned badges (this call) are
    returned separately so the frontend can show a toast."""
    return evaluate_and_award_badges(db, current_user.id)


@router.get("/achievements/weekly-challenge", response_model=WeeklyChallengeRead)
def api_get_weekly_challenge(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return get_weekly_challenge(db, current_user.id)


@router.patch("/achievements/leaderboard-opt-in", response_model=UserRead)
def api_set_leaderboard_opt_in(
    payload: LeaderboardOptInRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return set_leaderboard_opt_in(db, current_user.id, payload.opt_in)


@router.get("/leaderboard/", response_model=LeaderboardRead)
def api_get_leaderboard(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return get_leaderboard(db, current_user.id)
