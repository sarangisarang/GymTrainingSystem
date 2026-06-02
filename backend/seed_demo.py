#!/usr/bin/env python3
"""Idempotent demo seed for live demos / presentations (#28).

Creates ONE demo account, a handful of exercises, and two workouts (one
COMPLETED, one PLANNED) with realistic sets/reps/weights — so the app shows
real data instead of an empty state during a demo.

Idempotent: safe to run repeatedly. Existing user/exercises/workouts are
detected (by email, exercise name, and a "[seed]" marker in the workout notes)
and NOT duplicated. It only ever adds the demo data; it never deletes or resets
anything, so it is safe to point at any environment.

Usage:
    # local (start the backend first, e.g. `docker compose up` or uvicorn):
    python backend/seed_demo.py

    # against a deployed backend (e.g. Render):
    API_BASE=https://your-backend.onrender.com python backend/seed_demo.py
"""
from __future__ import annotations

import datetime as dt
import json
import os
import urllib.error
import urllib.request

API_BASE = os.getenv("API_BASE", "http://localhost:8000").rstrip("/")

DEMO_USER = {
    "email": os.getenv("SEED_EMAIL", "demo@gymtracker.app"),
    "password": os.getenv("SEED_PASSWORD", "Demo12345!"),
    "name": "Demo Athlete",
}

EXERCISES = [
    {"name": "Barbell Back Squat", "muscle_group": "Legs", "description": "Compound lower-body strength lift."},
    {"name": "Bench Press", "muscle_group": "Chest", "description": "Horizontal pressing for chest and triceps."},
    {"name": "Deadlift", "muscle_group": "Back", "description": "Full posterior-chain compound lift."},
    {"name": "Overhead Press", "muscle_group": "Shoulders", "description": "Standing vertical press."},
    {"name": "Bent-Over Row", "muscle_group": "Back", "description": "Horizontal pull for the upper back."},
    {"name": "Triceps Pushdown", "muscle_group": "Arms", "description": "Cable isolation for triceps."},
]

# Two demo workouts. `marker` lives in the notes so re-runs can detect them.
TODAY = dt.date.today()
WORKOUTS = [
    {
        "marker": "[seed] Push Day",
        "date": TODAY - dt.timedelta(days=2),
        "final_status": "COMPLETED",
        "duration_seconds": 58 * 60,
        "items": [
            {"exercise": "Bench Press", "sets": 4, "reps": 6, "weight": 70},
            {"exercise": "Overhead Press", "sets": 3, "reps": 8, "weight": 40},
            {"exercise": "Triceps Pushdown", "sets": 3, "reps": 12, "weight": 25},
        ],
    },
    {
        "marker": "[seed] Leg Day",
        "date": TODAY + dt.timedelta(days=1),
        "final_status": "PLANNED",
        "duration_seconds": None,
        "items": [
            {"exercise": "Barbell Back Squat", "sets": 5, "reps": 5, "weight": 90},
            {"exercise": "Deadlift", "sets": 3, "reps": 5, "weight": 110},
            {"exercise": "Bent-Over Row", "sets": 3, "reps": 10, "weight": 50},
        ],
    },
]


def _req(method: str, path: str, token: str | None = None, body: dict | None = None):
    url = f"{API_BASE}{path}"
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


def main() -> None:
    print(f"Seeding demo data against {API_BASE}")

    # 1) demo user (idempotent: 400/409 means it already exists)
    status, _ = _req("POST", "/auth/register", body=DEMO_USER)
    if status == 201:
        print(f"  + created demo user {DEMO_USER['email']}")
    elif status in (400, 409):
        print(f"  = demo user {DEMO_USER['email']} already exists")
    else:
        raise SystemExit(f"register failed (HTTP {status})")

    # 2) login
    status, payload = _req("POST", "/auth/login", body={"email": DEMO_USER["email"], "password": DEMO_USER["password"]})
    if status != 200 or not payload or "access_token" not in payload:
        raise SystemExit(f"login failed (HTTP {status}): {payload}")
    token = payload["access_token"]
    print("  = logged in")

    # 3) exercises (idempotent: match by name)
    _, existing = _req("GET", "/exercises/", token=token)
    by_name = {e["name"]: e["id"] for e in (existing or [])}
    for ex in EXERCISES:
        if ex["name"] in by_name:
            print(f"  = exercise exists: {ex['name']}")
            continue
        status, created = _req("POST", "/exercises/", token=token, body=ex)
        if status not in (200, 201):
            raise SystemExit(f"exercise create failed for {ex['name']} (HTTP {status}): {created}")
        by_name[ex["name"]] = created["id"]
        print(f"  + exercise: {ex['name']}")

    # 4) workouts (idempotent: detect by the [seed] marker in notes)
    _, my_workouts = _req("GET", "/workouts/", token=token)
    existing_notes = {(w.get("notes") or "") for w in (my_workouts or [])}

    for w in WORKOUTS:
        if any(w["marker"] in note for note in existing_notes):
            print(f"  = workout exists: {w['marker']}")
            continue
        body = {
            "workout_date": w["date"].isoformat(),
            "notes": w["marker"],
            "exercises": [
                {
                    "exercise_id": by_name[item["exercise"]],
                    "sets": item["sets"],
                    "reps": item["reps"],
                    "weight": item["weight"],
                    "order_index": idx,
                }
                for idx, item in enumerate(w["items"])
            ],
        }
        status, created = _req("POST", "/workouts/", token=token, body=body)
        if status not in (200, 201):
            raise SystemExit(f"workout create failed for {w['marker']} (HTTP {status}): {created}")
        wid = created["id"]
        print(f"  + workout: {w['marker']} ({len(w['items'])} exercises)")

        # set the final status (default PLANNED needs no patch)
        if w["final_status"] != "PLANNED":
            patch = {"status": w["final_status"]}
            if w["duration_seconds"] is not None:
                patch["duration_seconds"] = w["duration_seconds"]
            status, _ = _req("PATCH", f"/workouts/{wid}/status", token=token, body=patch)
            if status != 200:
                raise SystemExit(f"status update failed for {w['marker']} (HTTP {status})")
            print(f"    → status: {w['final_status']}")

    print("\nDone. Demo login:")
    print(f"  email:    {DEMO_USER['email']}")
    print(f"  password: {DEMO_USER['password']}")


if __name__ == "__main__":
    main()
