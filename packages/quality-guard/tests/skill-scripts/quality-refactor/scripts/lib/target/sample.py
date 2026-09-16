# quality-guard: off -- fixture with deliberate violations. See README.md.
# Pins Python-specific scanner behavior: indentation-based function
# extraction, elif/and/or complexity, and an unnamed Tuple hint. Never
# "fix" the violations here.
from typing import Tuple


class Ledger:
    def __init__(self, balance):
        self.balance = balance

    # Deliberate else branch plus an elif/and/or chain.
    def grade(self, score):
        if score >= 90 and score <= 100:
            return "A"
        elif score >= 70 or score >= 80:
            return "B"
        else:
            return "C"


# Unnamed tuple hint -- name the fields instead.
def split_point(pair: Tuple[int, int]) -> int:
    return pair[0] + pair[1]


# TODO: memoize this once the profiler complains.
def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)
