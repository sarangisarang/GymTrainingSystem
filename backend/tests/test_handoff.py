"""Human handoff (#26): escalate low-confidence AI answers to a human coach."""
from __future__ import annotations

import uuid


def _register(client, name: str) -> tuple[str, str]:
    """Register + login a fresh user; return (token, email)."""
    email = f"{name}_{uuid.uuid4().hex[:8]}@example.com"
    password = "TestPass123!"
    client.post("/auth/register", json={"name": name, "email": email, "password": password})
    r = client.post("/auth/login", json={"email": email, "password": password})
    return r.json()["access_token"], email


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_athlete_can_create_handoff(client):
    token, _ = _register(client, "athlete")
    r = client.post(
        "/handoff",
        json={"question": "Why am I plateauing?", "ai_answer": "Unsure.", "confidence": 30},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["question"] == "Why am I plateauing?"
    assert body["status"] == "PENDING"
    assert body["confidence"] == 30


def test_empty_question_rejected(client):
    token, _ = _register(client, "athlete")
    r = client.post("/handoff", json={"question": "   "}, headers=_auth(token))
    assert r.status_code == 400


def test_non_coach_cannot_list_handoffs(client):
    token, _ = _register(client, "athlete")
    r = client.get("/coach/handoffs", headers=_auth(token))
    assert r.status_code == 403


def test_coach_sees_linked_athlete_handoff_and_can_resolve(client):
    # Athlete escalates.
    athlete_token, athlete_email = _register(client, "athlete")
    client.post(
        "/handoff",
        json={"question": "Am I overtrained?", "confidence": 20},
        headers=_auth(athlete_token),
    )

    # Coach becomes a coach and links the athlete.
    coach_token, _ = _register(client, "coach")
    client.post("/coach/become-coach", headers=_auth(coach_token))
    invite = client.post(
        "/coach/athletes/invite",
        json={"athlete_email": athlete_email},
        headers=_auth(coach_token),
    )
    assert invite.status_code == 200, invite.text

    # Coach sees the pending handoff.
    listing = client.get("/coach/handoffs", headers=_auth(coach_token))
    assert listing.status_code == 200, listing.text
    handoffs = listing.json()
    assert len(handoffs) == 1
    assert handoffs[0]["question"] == "Am I overtrained?"
    assert handoffs[0]["athlete_email"] == athlete_email
    handoff_id = handoffs[0]["id"]

    # Coach resolves it → list becomes empty.
    res = client.post(f"/coach/handoffs/{handoff_id}/resolve", headers=_auth(coach_token))
    assert res.status_code == 200, res.text
    assert client.get("/coach/handoffs", headers=_auth(coach_token)).json() == []


def test_unlinked_coach_cannot_see_or_resolve(client):
    # Athlete escalates.
    athlete_token, athlete_email = _register(client, "athlete")
    client.post("/handoff", json={"question": "Form check?"}, headers=_auth(athlete_token))

    # A coach who has NOT linked this athlete.
    coach_token, _ = _register(client, "stranger")
    client.post("/coach/become-coach", headers=_auth(coach_token))
    assert client.get("/coach/handoffs", headers=_auth(coach_token)).json() == []

    # And cannot resolve a handoff that isn't from their athlete: link a real
    # coach to discover the id, then try to resolve as the stranger coach.
    real_coach_token, _ = _register(client, "realcoach")
    client.post("/coach/become-coach", headers=_auth(real_coach_token))
    client.post("/coach/athletes/invite", json={"athlete_email": athlete_email}, headers=_auth(real_coach_token))
    handoff_id = client.get("/coach/handoffs", headers=_auth(real_coach_token)).json()[0]["id"]

    forbidden = client.post(f"/coach/handoffs/{handoff_id}/resolve", headers=_auth(coach_token))
    assert forbidden.status_code == 403


def test_resolve_missing_handoff_returns_404(client):
    coach_token, _ = _register(client, "coach")
    client.post("/coach/become-coach", headers=_auth(coach_token))
    r = client.post(f"/coach/handoffs/{uuid.uuid4()}/resolve", headers=_auth(coach_token))
    assert r.status_code == 404
