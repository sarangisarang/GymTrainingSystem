from __future__ import annotations

import json
import os
from typing import AsyncIterator

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from data_base_sql.database import get_db
from data_base_sql.models import Exercise, Workout
from fastAPI_functions.security import get_current_user

router = APIRouter(prefix="/ai", tags=["AI Coach"])

GEMINI_MODELS = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-2.5-flash",
    "gemini-flash-latest",
]

SYSTEM_PROMPT = """Du bist ein erfahrener, persönlicher Fitness-Coach und Kraft-Trainer.
Du analysierst die Trainingsdaten des Athleten und gibst präzise, datenbasierte Empfehlungen.

Regeln:
- Antworte IMMER in DERSELBEN Sprache, in der der Athlet seine Frage stellt
  (z. B. Deutsch, Englisch, Georgisch). Erkenne die Sprache automatisch.
- Beziehe dich konkret auf die Trainingsdaten (Übungen, Gewichte, Datum)
- Sei direkt — keine generischen Tipps
- Erkenne Muster: Stagnation, Überlastung, Fortschritt
- Max 300 Wörter
- Nutze Emojis sparsam (💪 🎯 ⚠️ 📈)"""


class CoachRequest(BaseModel):
    message: str


def _build_context(db: Session, user_id: str) -> str:
    workouts = (
        db.query(Workout)
        .filter(Workout.user_id == user_id)
        .order_by(Workout.date.desc())
        .limit(10)
        .all()
    )

    if not workouts:
        return "Der Athlet hat noch keine Workouts aufgezeichnet."

    exercise_ids = {str(we.exercise_id) for w in workouts for we in w.workout_exercises}
    exercises = db.query(Exercise).filter(Exercise.id.in_(exercise_ids)).all()
    ex_map = {str(e.id): e for e in exercises}

    lines: list[str] = []
    for w in workouts:
        sets_info: list[str] = []
        for we in sorted(w.workout_exercises, key=lambda x: x.order_index):
            ex = ex_map.get(str(we.exercise_id))
            name = ex.name if ex else "Unbekannte Übung"
            weight_str = f"{we.weight} kg" if we.weight else "Körpergewicht"
            sets_info.append(f"    • {name}: {we.sets}×{we.reps} @ {weight_str}")
        notes = f" — {w.notes}" if w.notes else ""
        lines.append(f"📅 {w.date}{notes}\n" + "\n".join(sets_info))

    return "\n\n".join(lines)


async def _try_model(api_key: str, model: str, payload: dict) -> httpx.Response | None:
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:streamGenerateContent?key={api_key}&alt=sse"
    )
    client = httpx.AsyncClient(timeout=60)
    response = await client.send(
        client.build_request("POST", url, json=payload, headers={"Content-Type": "application/json"}),
        stream=True,
    )
    if response.status_code in (200, 503):
        return response
    await response.aclose()
    await client.aclose()
    return None


async def _stream_gemini(message: str, context: str) -> AsyncIterator[str]:
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        yield "data: ⚠️ GEMINI_API_KEY nicht gesetzt.\n\n"
        yield "data: [DONE]\n\n"
        return

    full_prompt = (
        f"{SYSTEM_PROMPT}\n\n"
        f"Trainingsdaten des Athleten (letzte 10 Einheiten):\n\n{context}\n\n"
        f"Frage: {message}"
    )
    payload = {
        "contents": [{"parts": [{"text": full_prompt}]}],
        "generationConfig": {"maxOutputTokens": 1024, "temperature": 0.7},
    }

    async with httpx.AsyncClient(timeout=60) as client:
        response = None
        last_error = ""

        for model in GEMINI_MODELS:
            url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/"
                f"{model}:streamGenerateContent?key={api_key}&alt=sse"
            )
            try:
                response = await client.send(
                    client.build_request(
                        "POST", url, json=payload,
                        headers={"Content-Type": "application/json"},
                    ),
                    stream=True,
                )
                if response.status_code == 200:
                    break
                body = await response.aread()
                try:
                    last_error = json.loads(body).get("error", {}).get("message", "")
                except Exception:
                    last_error = body.decode()[:200]
                await response.aclose()
                response = None
            except Exception as e:
                last_error = str(e)
                response = None

        if response is None:
            yield f"data: ⚠️ Alle Modelle nicht verfügbar: {last_error}\n\n"
            yield "data: [DONE]\n\n"
            return

        async for line in response.aiter_lines():
            if not line.startswith("data:"):
                continue
            raw = line[5:].strip()
            if not raw or raw == "[DONE]":
                continue
            try:
                chunk = json.loads(raw)
                parts = (
                    chunk.get("candidates", [{}])[0]
                    .get("content", {})
                    .get("parts", [])
                )
                for part in parts:
                    text = part.get("text", "")
                    if text:
                        yield f"data: {text}\n\n"
            except Exception:
                continue

    yield "data: [DONE]\n\n"


@router.post("/coach")
async def ai_coach(
    body: CoachRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Nachricht darf nicht leer sein.")

    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(
            status_code=503,
            detail="KI-Coach ist nicht konfiguriert. GEMINI_API_KEY fehlt.",
        )

    context = _build_context(db, str(current_user.id))

    return StreamingResponse(
        _stream_gemini(body.message, context),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
