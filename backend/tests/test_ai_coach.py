"""Tests for the AI Coach hallucination-prevention layer (issue #39).

Two concerns are covered:
  * ``evaluate_response`` — the pure server-side validator that decides the final
    confidence from the model's self-report and the *real* citation tags.
  * The ``POST /ai/coach`` no-data fallback — a user with no logged workouts must
    get a safe canned answer and never reach the model (nothing to ground on).
"""
from __future__ import annotations

import json

from fastAPI_functions.ai_coach import META_SENTINEL, evaluate_response


TAG_MAP = {"T1": "2026-05-31", "T2": "2026-05-28"}


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── evaluate_response: valid citations ───────────────────────────────────────
def test_valid_sources_keep_confidence_and_resolve_labels():
    meta = json.dumps({"confidence": 85, "sources": ["T1", "T2"]})
    result = evaluate_response(meta, TAG_MAP, has_data=True)

    assert result["confidence"] == 85
    assert result["low_confidence"] is False
    assert result["warnings"] == []
    assert result["sources"] == [
        {"tag": "T1", "label": "2026-05-31"},
        {"tag": "T2", "label": "2026-05-28"},
    ]


# ── evaluate_response: a hallucinated citation must cap confidence ────────────
def test_invalid_source_caps_confidence_and_warns():
    # T9 does not exist in the athlete's data → the model fabricated it.
    meta = json.dumps({"confidence": 99, "sources": ["T1", "T9"]})
    result = evaluate_response(meta, TAG_MAP, has_data=True)

    assert result["confidence"] <= 30
    assert result["low_confidence"] is True
    assert "invalid_sources" in result["warnings"]
    # Only the real citation is surfaced; the fabricated one is dropped.
    assert result["sources"] == [{"tag": "T1", "label": "2026-05-31"}]


# ── evaluate_response: no data at all ────────────────────────────────────────
def test_no_data_forces_low_confidence():
    result = evaluate_response("", {}, has_data=False)

    assert result["confidence"] <= 25
    assert result["low_confidence"] is True
    assert "no_data" in result["warnings"]
    assert result["sources"] == []


# ── evaluate_response: model gave no parseable self-assessment ───────────────
def test_unparseable_meta_is_not_trusted():
    result = evaluate_response("totally not json", TAG_MAP, has_data=True)

    assert result["confidence"] <= 40
    assert "no_self_assessment" in result["warnings"]
    assert result["sources"] == []


# ── evaluate_response: bracket/case-insensitive tag normalisation ────────────
def test_tags_are_normalised():
    meta = json.dumps({"confidence": 70, "sources": ["[t1]", " T2 "]})
    result = evaluate_response(meta, TAG_MAP, has_data=True)

    assert {s["tag"] for s in result["sources"]} == {"T1", "T2"}


# ── endpoint: no-data fallback never calls the model ─────────────────────────
def test_coach_no_data_returns_safe_fallback(auth_client):
    client, token = auth_client  # fresh user, zero workouts

    r = client.post("/ai/coach", json={"message": "Wie ist mein Fortschritt?"}, headers=_auth(token))
    assert r.status_code == 200, r.text

    body = r.text
    # Safe canned answer, not model-generated advice.
    assert "noch keine aufgezeichneten Workouts" in body

    # A metadata event must be present and flag the answer as uncertain.
    meta_line = next(
        line for line in body.splitlines() if line.startswith(f"data: {META_SENTINEL}")
    )
    meta = json.loads(meta_line[len(f"data: {META_SENTINEL}"):])
    assert meta["low_confidence"] is True
    assert "no_data" in meta["warnings"]
    assert meta["sources"] == []


# ── endpoint: empty message is rejected ──────────────────────────────────────
def test_coach_rejects_empty_message(auth_client):
    client, token = auth_client
    r = client.post("/ai/coach", json={"message": "   "}, headers=_auth(token))
    assert r.status_code == 400
