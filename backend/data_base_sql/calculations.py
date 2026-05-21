from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, Optional


@dataclass(frozen=True)
class GoalConfig:
    """Konfigurationswerte für eine Trainingslogik.

    Die Werte dienen bewusst als praxistaugliche Heuristik und nicht als
    sportwissenschaftlich exakte Labormessung. Sie reichen jedoch gut aus,
    um aus vorhandenen Workout-Daten konsistente Empfehlungen und Schätzungen
    im System abzuleiten.
    """

    goal: str
    rest_seconds: int
    concentric_seconds: int
    pause_seconds: int
    eccentric_seconds: int
    transition_seconds: int
    met_value: Decimal
    fat_share: Decimal


GOAL_CONFIGS: dict[str, GoalConfig] = {
    "strength": GoalConfig(
        goal="strength",
        rest_seconds=180,
        concentric_seconds=1,
        pause_seconds=0,
        eccentric_seconds=3,
        transition_seconds=45,
        met_value=Decimal("6.0"),
        fat_share=Decimal("0.22"),
    ),
    "hypertrophy": GoalConfig(
        goal="hypertrophy",
        rest_seconds=90,
        concentric_seconds=1,
        pause_seconds=1,
        eccentric_seconds=3,
        transition_seconds=40,
        met_value=Decimal("5.5"),
        fat_share=Decimal("0.27"),
    ),
    "endurance": GoalConfig(
        goal="endurance",
        rest_seconds=45,
        concentric_seconds=1,
        pause_seconds=0,
        eccentric_seconds=2,
        transition_seconds=30,
        met_value=Decimal("5.0"),
        fat_share=Decimal("0.32"),
    ),
}


_TWO_PLACES = Decimal("0.01")


def _to_decimal(value: Decimal | int | float | str | None, default: str = "0") -> Decimal:
    if value is None:
        return Decimal(default)
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _quantize(value: Decimal) -> Decimal:
    return value.quantize(_TWO_PLACES, rounding=ROUND_HALF_UP)


def get_goal_config(goal: str | None) -> GoalConfig:
    key = (goal or "hypertrophy").lower()
    return GOAL_CONFIGS.get(key, GOAL_CONFIGS["hypertrophy"])


def infer_goal_from_workout_entries(entries: Iterable) -> str:
    """Leitet ein realistisches Trainingsziel aus vorhandenen Satzdaten ab.

    Heuristik:
    - wenige Wiederholungen oder sehr lange Pausen => strength
    - viele Wiederholungen oder sehr kurze Pausen => endurance
    - sonst => hypertrophy
    """

    items = list(entries)
    if not items:
        return "hypertrophy"

    total_reps = sum(max(int(getattr(item, "reps", 0) or 0), 0) for item in items)
    avg_reps = total_reps / max(len(items), 1)
    avg_rest = sum(max(int(getattr(item, "rest_seconds", 0) or 0), 0) for item in items) / max(len(items), 1)

    if avg_reps <= 6 or avg_rest >= 120:
        return "strength"
    if avg_reps >= 13 or avg_rest <= 45:
        return "endurance"
    return "hypertrophy"


def build_program_item_metrics(goal: str, sets: int, reps: int) -> dict[str, int]:
    cfg = get_goal_config(goal)
    rep_seconds = cfg.concentric_seconds + cfg.pause_seconds + cfg.eccentric_seconds
    estimated_set_duration_seconds = max(int(reps), 0) * rep_seconds
    estimated_total_duration_seconds = (
        max(int(sets), 0) * estimated_set_duration_seconds
        + max(int(sets) - 1, 0) * cfg.rest_seconds
    )

    return {
        "rest_seconds": cfg.rest_seconds,
        "concentric_seconds": cfg.concentric_seconds,
        "pause_seconds": cfg.pause_seconds,
        "eccentric_seconds": cfg.eccentric_seconds,
        "estimated_set_duration_seconds": estimated_set_duration_seconds,
        "estimated_total_duration_seconds": estimated_total_duration_seconds,
    }


def calculate_workout_analysis(workout, body_weight_kg: Optional[Decimal | float | int | str] = None) -> dict:
    """Erzeugt eine auswertbare Trainingsanalyse aus einem Workout.

    Eingangsgrößen:
    - Übungsdaten mit Sätzen, Wiederholungen, Gewicht und Pausen
    - optionales Körpergewicht für Kalorien- und Fett-Schätzung

    Formeln:
    - Volumen = Gewicht × Wiederholungen × Sätze
    - Aktive Zeit = Wiederholungen × Tempo
    - Gesamtzeit = aktive Zeit + Pausen + Gerätewechsel
    - Kalorien ≈ MET × Körpergewicht × Stunden
    - Fett (g) ≈ (Kalorien × Fettanteil) / 9
    """

    items = sorted(list(getattr(workout, "workout_exercises", []) or []), key=lambda x: getattr(x, "order_index", 0) or 0)
    inferred_goal = infer_goal_from_workout_entries(items)
    cfg = get_goal_config(inferred_goal)
    rep_seconds = cfg.concentric_seconds + cfg.pause_seconds + cfg.eccentric_seconds

    total_exercises = len(items)
    total_sets = 0
    total_reps = 0
    total_volume_kg = Decimal("0")
    estimated_active_seconds = 0
    estimated_rest_seconds = 0

    for item in items:
        sets = max(int(getattr(item, "sets", 0) or 0), 0)
        reps = max(int(getattr(item, "reps", 0) or 0), 0)
        rest_seconds = max(int(getattr(item, "rest_seconds", cfg.rest_seconds) or cfg.rest_seconds), 0)
        weight = _to_decimal(getattr(item, "weight", None), default="0")

        total_sets += sets
        total_reps += sets * reps
        total_volume_kg += weight * Decimal(sets * reps)
        estimated_active_seconds += sets * reps * rep_seconds
        estimated_rest_seconds += max(sets - 1, 0) * rest_seconds

    transition_seconds = max(total_exercises - 1, 0) * cfg.transition_seconds
    estimated_total_seconds = estimated_active_seconds + estimated_rest_seconds + transition_seconds

    avg_weight_per_rep = Decimal("0")
    if total_reps > 0:
        avg_weight_per_rep = total_volume_kg / Decimal(total_reps)

    calories_kcal: Decimal | None = None
    fat_burned_grams: Decimal | None = None
    met_value: Decimal | None = None
    fat_energy_share: Decimal | None = None
    normalized_body_weight: Decimal | None = None

    if body_weight_kg is not None and str(body_weight_kg) != "":
        normalized_body_weight = _to_decimal(body_weight_kg)
        if normalized_body_weight > 0 and estimated_total_seconds > 0:
            density_modifier = Decimal("1.00")

            sets_per_hour = Decimal(total_sets) * Decimal("3600") / Decimal(estimated_total_seconds)
            if sets_per_hour >= Decimal("20"):
                density_modifier += Decimal("0.08")
            elif sets_per_hour <= Decimal("10"):
                density_modifier -= Decimal("0.08")

            if normalized_body_weight > 0 and avg_weight_per_rep > 0:
                relative_load = avg_weight_per_rep / normalized_body_weight
                if relative_load >= Decimal("0.75"):
                    density_modifier += Decimal("0.10")
                elif relative_load <= Decimal("0.25"):
                    density_modifier -= Decimal("0.05")

            met_value = cfg.met_value * density_modifier
            met_value = max(Decimal("3.5"), min(Decimal("8.0"), met_value))
            hours = Decimal(estimated_total_seconds) / Decimal("3600")
            calories_kcal = _quantize(met_value * normalized_body_weight * hours)

            fat_energy_share = cfg.fat_share
            if met_value >= Decimal("6.5"):
                fat_energy_share = max(Decimal("0.15"), fat_energy_share - Decimal("0.03"))
            elif met_value <= Decimal("4.5"):
                fat_energy_share = min(Decimal("0.40"), fat_energy_share + Decimal("0.03"))

            fat_burned_grams = _quantize((calories_kcal * fat_energy_share) / Decimal("9"))

    return {
        "goal": inferred_goal,
        "body_weight_kg": _quantize(normalized_body_weight) if normalized_body_weight is not None else None,
        "total_exercises": total_exercises,
        "total_sets": total_sets,
        "total_reps": total_reps,
        "total_volume_kg": _quantize(total_volume_kg),
        "average_weight_per_rep_kg": _quantize(avg_weight_per_rep),
        "recommended_rest_seconds": cfg.rest_seconds,
        "concentric_seconds": cfg.concentric_seconds,
        "pause_seconds": cfg.pause_seconds,
        "eccentric_seconds": cfg.eccentric_seconds,
        "estimated_active_seconds": estimated_active_seconds,
        "estimated_rest_seconds": estimated_rest_seconds,
        "estimated_transition_seconds": transition_seconds,
        "estimated_total_seconds": estimated_total_seconds,
        "met_value": _quantize(met_value) if met_value is not None else None,
        "estimated_calories_kcal": calories_kcal,
        "fat_energy_share": _quantize(fat_energy_share) if fat_energy_share is not None else None,
        "estimated_fat_burned_grams": fat_burned_grams,
    }
