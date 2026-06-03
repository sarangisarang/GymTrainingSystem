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

# Reihenfolge = Fallback-Reihenfolge. 2.5-flash / flash-latest haben im
# kostenlosen Kontingent zuverlässig Quota; die 2.0-Modelle laufen oft ins
# Limit (HTTP 429) und stehen daher als Fallback hinten.
GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
]

# Sentinel that separates the human-readable answer from the trailing
# machine-readable metadata block (confidence + cited sources). The model is
# instructed to emit it; the server strips it from the streamed prose and parses
# the JSON that follows. Chosen to be extremely unlikely in normal coach prose.
META_SENTINEL = "@@@META"

# Below this confidence (0-100) the answer is treated as "uncertain": the UI
# shows a fallback disclaimer instead of presenting it as a reliable statement.
LOW_CONFIDENCE_THRESHOLD = 50

SYSTEM_PROMPT = """Du bist ein erfahrener, persönlicher Fitness-Coach und Kraft-Trainer.
Du analysierst die Trainingsdaten des Athleten und gibst präzise, datenbasierte Empfehlungen.

Stil-Regeln:
- Antworte IMMER in DERSELBEN Sprache, in der der Athlet seine Frage stellt
  (z. B. Deutsch, Englisch, Georgisch). Erkenne die Sprache automatisch.
- Beziehe dich konkret auf die Trainingsdaten (Übungen, Gewichte, Datum)
- Sei direkt — keine generischen Tipps
- Erkenne Muster: Stagnation, Überlastung, Fortschritt
- Max 300 Wörter
- Nutze Emojis sparsam (💪 🎯 ⚠️ 📈)

Anti-Halluzinations-Regeln (WICHTIG):
- Verwende AUSSCHLIESSLICH die unten bereitgestellten Trainingsdaten. Erfinde KEINE Übungen, Gewichte, Daten oder Zahlen.
- Wenn du dich auf eine konkrete Trainingseinheit beziehst, zitiere sie mit ihrem Tag in eckigen Klammern, z. B. [T1].
- Reichen die Daten für eine fundierte Antwort nicht aus, sag das ehrlich und rate NICHT ins Blaue.
- Zukunftsempfehlungen sind erlaubt, müssen aber klar als Empfehlung gekennzeichnet sein — nicht als Tatsache.

Antwortformat:
- Zuerst deine Antwort (in der Sprache des Athleten, max 300 Wörter).
- Danach in einer NEUEN Zeile EXAKT folgender Block (und sonst nichts danach):
  @@@META{"confidence": <Ganzzahl 0-100, wie sicher die Antwort vollständig durch die Daten gedeckt ist>, "sources": [<die tatsächlich genutzten Tags, z. B. "T1", "T3">]}
- Erwähne den @@@META-Block NICHT in deiner Antwort und formatiere ihn NICHT mit Markdown."""

# Safe fallback returned when the athlete has no logged training data at all.
# We never call the model here — there is nothing to ground an answer in, so any
# specific advice would be a hallucination.
NO_DATA_FALLBACK = (
    "Ich habe noch keine aufgezeichneten Workouts von dir. 📋\n\n"
    "Sobald du dein Training protokollierst, kann ich deine Daten analysieren und "
    "dir konkrete, personalisierte Empfehlungen geben. Bis dahin gebe ich bewusst "
    "keine spezifischen Ratschläge ab, um nichts zu erfinden."
)


class CoachRequest(BaseModel):
    message: str


def _build_context(db: Session, user_id: str) -> tuple[str, dict[str, str]]:
    """Build the grounding context for the model.

    Returns the context text (with per-session ``[T#]`` citation tags) and a
    ``tag -> readable label`` map used to (a) validate the model's cited sources
    and (b) render them in the UI. An empty map means the athlete has no data.
    """
    workouts = (
        db.query(Workout)
        .filter(Workout.user_id == user_id)
        .order_by(Workout.date.desc())
        .limit(10)
        .all()
    )

    if not workouts:
        return "Der Athlet hat noch keine Workouts aufgezeichnet.", {}

    exercise_ids = {str(we.exercise_id) for w in workouts for we in w.workout_exercises}
    exercises = db.query(Exercise).filter(Exercise.id.in_(exercise_ids)).all()
    ex_map = {str(e.id): e for e in exercises}

    lines: list[str] = []
    tag_map: dict[str, str] = {}
    for idx, w in enumerate(workouts, start=1):
        tag = f"T{idx}"
        tag_map[tag] = str(w.date)
        sets_info: list[str] = []
        for we in sorted(w.workout_exercises, key=lambda x: x.order_index):
            ex = ex_map.get(str(we.exercise_id))
            name = ex.name if ex else "Unbekannte Übung"
            weight_str = f"{we.weight} kg" if we.weight else "Körpergewicht"
            sets_info.append(f"    • {name}: {we.sets}×{we.reps} @ {weight_str}")
        notes = f" — {w.notes}" if w.notes else ""
        lines.append(f"[{tag}] 📅 {w.date}{notes}\n" + "\n".join(sets_info))

    return "\n\n".join(lines), tag_map


def evaluate_response(
    meta_raw: str, tag_map: dict[str, str], has_data: bool
) -> dict:
    """Validate the model's self-reported metadata against the real data.

    This is the server-side guard: the model can *claim* a confidence and cite
    sources, but we only trust citations that correspond to training sessions
    that actually exist. Invalid citations (a hallucinated source) cap the
    confidence and raise a warning, regardless of what the model claimed.

    Returns a JSON-serialisable dict with ``confidence`` (0-100),
    ``sources`` (list of ``{tag, label}`` for *valid* citations),
    ``low_confidence`` (bool) and ``warnings`` (list of machine codes).
    """
    model_confidence: int | None = None
    claimed: list[str] = []

    cleaned = meta_raw.strip().strip("`").strip()
    if cleaned:
        try:
            data = json.loads(cleaned)
            raw_conf = data.get("confidence")
            if isinstance(raw_conf, (int, float)):
                model_confidence = int(raw_conf)
            for s in data.get("sources", []) or []:
                tag = str(s).upper().strip().lstrip("[").rstrip("]").strip()
                if tag:
                    claimed.append(tag)
        except (ValueError, TypeError):
            model_confidence = None

    valid = [t for t in dict.fromkeys(claimed) if t in tag_map]
    invalid = [t for t in dict.fromkeys(claimed) if t not in tag_map]

    # Base confidence: trust the model's number when present, otherwise a neutral
    # default that already reflects whether we have any data to stand on.
    if model_confidence is not None:
        confidence = max(0, min(100, model_confidence))
    else:
        confidence = 50 if has_data else 20

    warnings: list[str] = []

    if not has_data:
        confidence = min(confidence, 25)
        warnings.append("no_data")

    if invalid:
        # The model cited a session that does not exist → it is fabricating.
        confidence = min(confidence, 30)
        warnings.append("invalid_sources")

    if has_data and model_confidence is None:
        # No parseable self-assessment — we cannot fully trust the answer.
        confidence = min(confidence, 40)
        warnings.append("no_self_assessment")

    return {
        "confidence": confidence,
        "sources": [{"tag": t, "label": tag_map[t]} for t in valid],
        "low_confidence": confidence < LOW_CONFIDENCE_THRESHOLD,
        "warnings": warnings,
    }


def _sse(text: str) -> str:
    return f"data: {text}\n\n"


def _meta_event(result: dict) -> str:
    return f"data: {META_SENTINEL}{json.dumps(result, ensure_ascii=False)}\n\n"


async def _stream_gemini(
    message: str, context: str, tag_map: dict[str, str]
) -> AsyncIterator[str]:
    has_data = bool(tag_map)

    # No data → safe fallback, no model call (nothing to ground an answer in).
    if not has_data:
        yield _sse(NO_DATA_FALLBACK)
        yield _meta_event(evaluate_response("", tag_map, has_data=False))
        yield _sse("[DONE]")
        return

    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        yield _sse("⚠️ GEMINI_API_KEY nicht gesetzt.")
        yield _sse("[DONE]")
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
            yield _sse(f"⚠️ Alle Modelle nicht verfügbar: {last_error}")
            yield _sse("[DONE]")
            return

        # Stream the prose, intercepting the trailing @@@META block. We hold back
        # the last few characters so a sentinel split across chunks is detected
        # before any of it leaks into the visible answer.
        pending = ""        # prose buffered but not yet flushed to the client
        meta_raw = ""        # captured metadata after the sentinel
        in_meta = False
        keep = len(META_SENTINEL) - 1

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
            except Exception:
                continue

            for part in parts:
                text = part.get("text", "")
                if not text:
                    continue

                if in_meta:
                    meta_raw += text
                    continue

                pending += text
                idx = pending.find(META_SENTINEL)
                if idx != -1:
                    prose = pending[:idx]
                    if prose:
                        yield _sse(prose)
                    meta_raw = pending[idx + len(META_SENTINEL):]
                    pending = ""
                    in_meta = True
                    continue

                if len(pending) > keep:
                    flush = pending[:-keep] if keep else pending
                    if flush:
                        yield _sse(flush)
                        pending = pending[len(flush):]

        if not in_meta and pending:
            yield _sse(pending)

    result = evaluate_response(meta_raw, tag_map, has_data=True)
    yield _meta_event(result)
    yield _sse("[DONE]")


@router.post("/coach")
async def ai_coach(
    body: CoachRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Nachricht darf nicht leer sein.")

    context, tag_map = _build_context(db, str(current_user.id))

    # Only the model path requires the API key. With no training data we return a
    # safe fallback without ever calling Gemini, so don't block that path.
    if tag_map and not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(
            status_code=503,
            detail="KI-Coach ist nicht konfiguriert. GEMINI_API_KEY fehlt.",
        )

    return StreamingResponse(
        _stream_gemini(body.message, context, tag_map),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
