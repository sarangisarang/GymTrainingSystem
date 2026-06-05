"""Gamification logic for Issue #11: badges, weekly challenge, leaderboard.

Badges are awarded automatically when `evaluate_and_award_badges` is called
(typically from the /achievements/ endpoint). Earned badges are persisted in
the `user_achievements` table; the second time a user qualifies, no new row is
written and no toast is shown.

Badge criteria (kept deliberately simple for V1):

  STREAK_7        : best_streak >= 7
  STREAK_30       : best_streak >= 30
  IRON_CONSISTENCY: 8 consecutive ISO weeks with at least one COMPLETED workout
  FIRST_100KG     : any COMPLETED set with weight >= 100 kg
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy.orm import Session

from .models import User, UserAchievement, Workout, WorkoutExercise


# ── Catalog ─────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class BadgeDef:
    id: str
    name: str
    description: str
    icon: str


BADGE_CATALOG: list[BadgeDef] = [
    BadgeDef("STREAK_7",  "7-Tage-Streak",     "7 Tage in Folge trainiert",                "🔥"),
    BadgeDef("STREAK_30", "30-Tage-Streak",    "30 Tage in Folge trainiert",               "🏆"),
    BadgeDef("IRON_CONSISTENCY", "Iron Consistency",
             "8 Wochen am Stück mindestens 1 Workout pro Woche", "⚒️"),
    BadgeDef("FIRST_100KG", "Erste 100 kg",   "Erstes Set mit mindestens 100 kg geloggt", "💯"),
]

BADGES_BY_ID: dict[str, BadgeDef] = {b.id: b for b in BADGE_CATALOG}


# ── Criteria ────────────────────────────────────────────────────────────────


def _best_streak_days(db: Session, user_id: UUID) -> int:
    """Longest run of consecutive distinct COMPLETED workout dates.

    Consistent with the rest of the app (Report, Dashboard, AI Coach):
    only COMPLETED workouts count toward a streak. PLANNED / IN_PROGRESS /
    CANCELLED do not — a streak badge is a promise about training *done*,
    not training *planned*.
    """
    rows = (
        db.query(Workout.date)
        .filter(
            Workout.user_id == str(user_id),
            Workout.status == "COMPLETED",
        )
        .all()
    )
    dates = sorted({r.date for r in rows})
    if not dates:
        return 0
    best = current = 1
    for i in range(1, len(dates)):
        if (dates[i] - dates[i - 1]).days == 1:
            current += 1
            best = max(best, current)
        else:
            current = 1
    return best


def _consecutive_completed_weeks(db: Session, user_id: UUID) -> int:
    """Max run of consecutive ISO weeks containing >=1 COMPLETED workout."""
    rows = (
        db.query(Workout.date)
        .filter(
            Workout.user_id == str(user_id),
            Workout.status == "COMPLETED",
        )
        .all()
    )
    weeks: set[tuple[int, int]] = set()
    for r in rows:
        iso = r.date.isocalendar()
        weeks.add((iso[0], iso[1]))
    if not weeks:
        return 0

    sorted_weeks = sorted(weeks)
    best = current = 1
    for i in range(1, len(sorted_weeks)):
        prev_y, prev_w = sorted_weeks[i - 1]
        cur_y, cur_w = sorted_weeks[i]
        prev_monday = date.fromisocalendar(prev_y, prev_w, 1)
        cur_monday = date.fromisocalendar(cur_y, cur_w, 1)
        if (cur_monday - prev_monday).days == 7:
            current += 1
            best = max(best, current)
        else:
            current = 1
    return best


def _has_completed_100kg_set(db: Session, user_id: UUID) -> bool:
    row = (
        db.query(WorkoutExercise.id)
        .join(Workout, Workout.id == WorkoutExercise.workout_id)
        .filter(
            Workout.user_id == str(user_id),
            Workout.status == "COMPLETED",
            WorkoutExercise.weight >= 100,
        )
        .first()
    )
    return row is not None


def _check(db: Session, user_id: UUID, badge_id: str) -> bool:
    if badge_id == "STREAK_7":
        return _best_streak_days(db, user_id) >= 7
    if badge_id == "STREAK_30":
        return _best_streak_days(db, user_id) >= 30
    if badge_id == "IRON_CONSISTENCY":
        return _consecutive_completed_weeks(db, user_id) >= 8
    if badge_id == "FIRST_100KG":
        return _has_completed_100kg_set(db, user_id)
    return False


# ── Award + read ────────────────────────────────────────────────────────────


def evaluate_and_award_badges(db: Session, user_id: UUID) -> dict:
    """Evaluate every catalog badge, persist newly-earned ones, return full state.

    Returns:
        {
            "badges": [BadgeRead-dict, ...],   # full catalog with earned/earned_at
            "newly_earned": [BadgeRead-dict],  # only what got awarded *this call*
        }
    """
    existing = {
        row.badge_id: row
        for row in db.query(UserAchievement).filter(UserAchievement.user_id == str(user_id)).all()
    }
    newly_ids: list[str] = []

    for badge in BADGE_CATALOG:
        if badge.id in existing:
            continue
        if _check(db, user_id, badge.id):
            row = UserAchievement(
                user_id=str(user_id),
                badge_id=badge.id,
                earned_at=datetime.utcnow(),
            )
            db.add(row)
            db.flush()
            existing[badge.id] = row
            newly_ids.append(badge.id)

    if newly_ids:
        db.commit()

    def _serialize(badge: BadgeDef) -> dict:
        row = existing.get(badge.id)
        return {
            "id": badge.id,
            "name": badge.name,
            "description": badge.description,
            "icon": badge.icon,
            "earned": row is not None,
            "earned_at": row.earned_at if row else None,
        }

    return {
        "badges": [_serialize(b) for b in BADGE_CATALOG],
        "newly_earned": [_serialize(BADGES_BY_ID[bid]) for bid in newly_ids],
    }


# ── Weekly challenge ────────────────────────────────────────────────────────


WEEKLY_TARGET_KG = 10_000.0


def get_weekly_challenge(db: Session, user_id: UUID) -> dict:
    """Static V1 challenge: hit 10,000 kg total volume across the current ISO week."""
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)

    rows = (
        db.query(WorkoutExercise.sets, WorkoutExercise.reps, WorkoutExercise.weight)
        .join(Workout, Workout.id == WorkoutExercise.workout_id)
        .filter(
            Workout.user_id == str(user_id),
            Workout.status == "COMPLETED",
            Workout.date >= monday,
            Workout.date <= sunday,
            WorkoutExercise.weight.isnot(None),
        )
        .all()
    )

    total = Decimal("0")
    for r in rows:
        total += Decimal(str(r.weight)) * Decimal(r.sets * r.reps)

    current = float(total)
    iso = today.isocalendar()
    return {
        "id": f"WEEKLY_VOLUME_10K_{iso.year}_W{iso.week:02d}",
        "label": "10.000 kg Gesamtvolumen diese Woche",
        "target_kg": WEEKLY_TARGET_KG,
        "current_kg": round(current, 2),
        "progress": round(min(current / WEEKLY_TARGET_KG, 2.0), 4) if WEEKLY_TARGET_KG else 0.0,
        "completed": current >= WEEKLY_TARGET_KG,
        "week": f"{iso.year}-W{iso.week:02d}",
    }


# ── Leaderboard ─────────────────────────────────────────────────────────────


def get_leaderboard(db: Session, current_user_id: UUID, limit: int = 10) -> dict:
    """Top opt-in users ranked by best_streak (tiebreak: total_volume_kg desc)."""
    opt_in_users = (
        db.query(User)
        .filter(User.leaderboard_opt_in.is_(True))
        .all()
    )

    self_user = db.query(User).filter(User.id == str(current_user_id)).first()
    self_opted_in = bool(self_user and self_user.leaderboard_opt_in)

    entries: list[dict] = []
    for u in opt_in_users:
        best = _best_streak_days(db, UUID(u.id))
        vol_rows = (
            db.query(WorkoutExercise.sets, WorkoutExercise.reps, WorkoutExercise.weight)
            .join(Workout, Workout.id == WorkoutExercise.workout_id)
            .filter(
                Workout.user_id == u.id,
                Workout.status == "COMPLETED",
                WorkoutExercise.weight.isnot(None),
            )
            .all()
        )
        vol = Decimal("0")
        for r in vol_rows:
            vol += Decimal(str(r.weight)) * Decimal(r.sets * r.reps)
        entries.append({
            "user_id": u.id,
            "name": u.name or u.email.split("@")[0],
            "best_streak": best,
            "total_volume_kg": float(vol),
        })

    entries.sort(key=lambda e: (-e["best_streak"], -e["total_volume_kg"]))
    top = entries[:limit]
    return {
        "metric": "best_streak",
        "entries": [
            {
                "rank": i + 1,
                "name": e["name"],
                "best_streak": e["best_streak"],
                "total_volume_kg": round(e["total_volume_kg"], 2),
                "is_self": e["user_id"] == str(current_user_id),
            }
            for i, e in enumerate(top)
        ],
        "self_opted_in": self_opted_in,
    }


def set_leaderboard_opt_in(db: Session, user_id: UUID, opt_in: bool) -> User:
    user = db.query(User).filter(User.id == str(user_id)).first()
    if user is None:
        raise ValueError("User not found")
    user.leaderboard_opt_in = bool(opt_in)
    db.commit()
    db.refresh(user)
    return user
