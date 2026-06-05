from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .security import get_current_user
from data_base_sql.database import get_db
from data_base_sql.schemas import (
    AthleteProgressRead,
    CoachInviteRequest,
    UserRead,
    WorkoutRead,
)
from data_base_sql.crud import (
    get_user_by_email,
    set_user_role,
    add_athlete_to_coach,
    remove_athlete_from_coach,
    get_coach_athletes,
    get_athlete_workouts_for_coach,
)

router = APIRouter(prefix="/coach", tags=["Coach Dashboard"])


def _require_coach(current_user):
    if current_user.role != "coach":
        raise HTTPException(status_code=403, detail="Coach role required.")


# ── Become a coach ───────────────────────────────────────────────────────────

@router.post("/become-coach", response_model=UserRead)
def become_coach(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return set_user_role(db, current_user.id, "coach")


# ── Invite / remove athletes ─────────────────────────────────────────────────

@router.post("/athletes/invite", response_model=AthleteProgressRead)
def invite_athlete(
    body: CoachInviteRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_coach(current_user)

    athlete = get_user_by_email(db, body.athlete_email)
    if not athlete:
        raise HTTPException(status_code=404, detail="User not found.")
    if str(athlete.id) == str(current_user.id):
        raise HTTPException(status_code=400, detail="Cannot add yourself.")

    add_athlete_to_coach(db, current_user.id, UUID(str(athlete.id)))

    athletes = get_coach_athletes(db, current_user.id)
    entry = next((a for a in athletes if a["athlete_id"] == str(athlete.id)), None)
    if not entry:
        raise HTTPException(status_code=500, detail="Failed to retrieve athlete after invite.")
    return entry


@router.delete("/athletes/{athlete_id}")
def remove_athlete(
    athlete_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_coach(current_user)
    remove_athlete_from_coach(db, current_user.id, athlete_id)
    return {"message": "Athlete removed."}


# ── Athlete overview ─────────────────────────────────────────────────────────

@router.get("/athletes", response_model=list[AthleteProgressRead])
def list_athletes(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_coach(current_user)
    return get_coach_athletes(db, current_user.id)


@router.get("/athletes/{athlete_id}/workouts", response_model=list[WorkoutRead])
def get_athlete_workouts(
    athlete_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_coach(current_user)
    workouts = get_athlete_workouts_for_coach(db, current_user.id, athlete_id)
    if workouts is None:
        raise HTTPException(status_code=403, detail="This athlete is not linked to you.")
    return workouts
