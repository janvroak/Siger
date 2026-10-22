"""verify_numbers: every figure in an insight must come from a tool result.

Numbers are taken from the tool results (including those inside text, such
as "Assignment 2" or a date) and from the question itself. A number in the
insight matches if it equals one of them up to the precision it is written
with, so "47%" matches 46.9 but "52%" does not.
"""

import math
import re
from typing import Any

_NUMBER = re.compile(r"(?<![\w.])(\d+(?:\.\d+)?)(?![\w])")


def numbers_in_text(text: str) -> list[str]:
    return _NUMBER.findall(text)


def allowed_numbers(results: list[Any], question: str = "") -> list[float]:
    found: list[float] = [float(n) for n in numbers_in_text(question)]

    def walk(value: Any) -> None:
        if isinstance(value, bool) or value is None:
            return
        if isinstance(value, int | float):
            if not math.isnan(value):
                found.append(float(value))
        elif isinstance(value, str):
            found.extend(float(n) for n in numbers_in_text(value))
        elif isinstance(value, dict):
            for item in value.values():
                walk(item)
        elif isinstance(value, list):
            for item in value:
                walk(item)

    for result in results:
        walk(result)
    return found


def unsupported_numbers(insight: str, allowed: list[float]) -> list[str]:
    """Figures in the insight that no tool result supports."""
    missing = []
    for written in numbers_in_text(insight):
        decimals = len(written.split(".")[1]) if "." in written else 0
        tolerance = 0.5 * 10**-decimals + 1e-9
        value = float(written)
        if not any(abs(value - candidate) <= tolerance for candidate in allowed):
            missing.append(written)
    return list(dict.fromkeys(missing))
