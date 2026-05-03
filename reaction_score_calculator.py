"""Pollen reaction score calculator.

This module is intentionally self-contained so it can be copied into a demo,
notebook, API route prototype, or CLI script without project dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class AllergenInput:
    """Input values for one allergen.

    upi is the Universal Pollen Index on a 0-5 scale.
    sensitivity is the user's personal sensitivity on a 1-5 scale.
    """

    name: str
    upi: float
    sensitivity: int


@dataclass(frozen=True)
class AllergenScore:
    name: str
    upi: float
    sensitivity: int
    raw_score: float
    weight: float
    weighted_score: float


@dataclass(frozen=True)
class ReactionScoreResult:
    score: int
    severity: str
    dominant_allergen: str | None
    composite: float
    allergen_scores: tuple[AllergenScore, ...]


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return min(maximum, max(minimum, value))


def _severity(score: int) -> str:
    if score <= 24:
        return "None"
    if score <= 49:
        return "Low"
    if score <= 74:
        return "Moderate"
    if score <= 89:
        return "High"
    return "Severe"


def _raw_score(upi: float, sensitivity: int) -> float:
    safe_upi = _clamp(upi, 0.0, 5.0)
    safe_sensitivity = int(_clamp(float(sensitivity), 1.0, 5.0))
    alpha = safe_sensitivity / 5
    power = 1 + alpha
    return (safe_upi / 5) ** power


def calculate_reaction_score(allergens: Iterable[AllergenInput]) -> ReactionScoreResult:
    """Calculate a personalized pollen reaction score.

    Algorithm:
    - raw = (upi / 5) ** (1 + sensitivity / 5)
    - dominant allergen, highest raw, receives weight 0.60
    - remaining allergens split the other 0.40 evenly
    - composite * 100 rounded to integer
    """

    inputs = tuple(allergens)
    if not inputs:
        return ReactionScoreResult(
            score=0,
            severity="None",
            dominant_allergen=None,
            composite=0.0,
            allergen_scores=(),
        )

    raw_scores = tuple(_raw_score(item.upi, item.sensitivity) for item in inputs)
    dominant_index = max(range(len(inputs)), key=lambda index: raw_scores[index])
    other_count = max(0, len(inputs) - 1)
    other_weight = 0.4 / other_count if other_count else 0.0

    allergen_scores: list[AllergenScore] = []
    composite = 0.0

    for index, item in enumerate(inputs):
        weight = 0.6 if index == dominant_index else other_weight
        weighted = raw_scores[index] * weight
        composite += weighted
        allergen_scores.append(
            AllergenScore(
                name=item.name,
                upi=_clamp(item.upi, 0.0, 5.0),
                sensitivity=int(_clamp(float(item.sensitivity), 1.0, 5.0)),
                raw_score=raw_scores[index],
                weight=weight,
                weighted_score=weighted,
            )
        )

    score = round(_clamp(composite * 100, 0.0, 100.0))

    return ReactionScoreResult(
        score=score,
        severity=_severity(score),
        dominant_allergen=inputs[dominant_index].name,
        composite=composite,
        allergen_scores=tuple(allergen_scores),
    )


if __name__ == "__main__":
    example = (
        AllergenInput("Tree", upi=4.2, sensitivity=5),
        AllergenInput("Grass", upi=2.1, sensitivity=3),
        AllergenInput("Weed/ragweed", upi=1.0, sensitivity=2),
    )
    print(calculate_reaction_score(example))
