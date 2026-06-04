"""Human handoff (#26): escalate a low-confidence AI-coach answer to a coach.

An athlete escalates from the AI-coach chat; the request appears on the
Coach-Dashboard of the coach(es) they are linked to, who can mark it resolved.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .security import get_current_user
from data_base_sql.database import get_db
from data_base_sql.schemas import HandoffCreate, HandoffRead
from data_base_sql.crud import create_handoff, get_coach_handoffs, resolve_handoff

router = APIRouter(tags=["Human Handoff"])


@router.post("/handoff", response_model=HandoffRead)
def request_handoff(
    body: HandoffCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Any authenticated athlete can escalate an answer to a human coach."""
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required.")
    return create_handoff(db, current_user.id, question, body.ai_answer, body.confidence)


@router.get("/coach/handoffs", response_model=list[HandoffRead])
def list_handoffs(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Pending handoffs from this coach's linked athletes."""
    if current_user.role != "coach":
        raise HTTPException(status_code=403, detail="Coach role required.")
    return get_coach_handoffs(db, current_user.id)


@router.post("/coach/handoffs/{handoff_id}/resolve")
def resolve(
    handoff_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role != "coach":
        raise HTTPException(status_code=403, detail="Coach role required.")
    result = resolve_handoff(db, current_user.id, handoff_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Handoff not found.")
    if result is False:
        raise HTTPException(status_code=403, detail="This handoff is not from your athlete.")
    return {"message": "Handoff resolved."}
