"""Seeded deterministic PRNG — no global random, no time dependence."""

from __future__ import annotations

import hashlib
import struct
from typing import Sequence, TypeVar

T = TypeVar("T")


class SeededRNG:
    """xorshift64* style stream derived from a string/int seed.

    Same seed + same call sequence ⇒ identical outputs across processes.
    """

    def __init__(self, seed: str | int) -> None:
        if isinstance(seed, int):
            material = f"int:{seed}".encode()
        else:
            material = f"str:{seed}".encode()
        digest = hashlib.sha256(material).digest()
        self._state = struct.unpack(">Q", digest[:8])[0] or 0x9E3779B97F4A7C15

    def _next_u64(self) -> int:
        x = self._state
        x ^= (x >> 12) & 0xFFFFFFFFFFFFFFFF
        x ^= (x << 25) & 0xFFFFFFFFFFFFFFFF
        x ^= (x >> 27) & 0xFFFFFFFFFFFFFFFF
        self._state = x & 0xFFFFFFFFFFFFFFFF
        return (x * 0x2545F4914F6CDD1D) & 0xFFFFFFFFFFFFFFFF

    def random(self) -> float:
        """Uniform float in [0, 1)."""
        return (self._next_u64() >> 11) / float(1 << 53)

    def uniform(self, low: float, high: float) -> float:
        return low + (high - low) * self.random()

    def randint(self, low: int, high: int) -> int:
        """Inclusive integer range."""
        if high < low:
            raise ValueError("high must be >= low")
        span = high - low + 1
        return low + int(self._next_u64() % span)

    def choice(self, seq: Sequence[T]) -> T:
        if not seq:
            raise ValueError("choice from empty sequence")
        return seq[self.randint(0, len(seq) - 1)]

    def sample(self, seq: Sequence[T], k: int) -> list[T]:
        items = list(seq)
        if k > len(items):
            raise ValueError("sample larger than population")
        out: list[T] = []
        for _ in range(k):
            idx = self.randint(0, len(items) - 1)
            out.append(items.pop(idx))
        return out

    def shuffle(self, items: list[T]) -> None:
        for i in range(len(items) - 1, 0, -1):
            j = self.randint(0, i)
            items[i], items[j] = items[j], items[i]

    def gauss(self, mu: float, sigma: float) -> float:
        """Box-Muller; rejects extreme outliers for pitch stability."""
        u1 = max(self.random(), 1e-12)
        u2 = self.random()
        z = ((-2.0 * __import__("math").log(u1)) ** 0.5) * __import__("math").cos(
            2.0 * __import__("math").pi * u2
        )
        return mu + sigma * z

    def derived(self, label: str) -> "SeededRNG":
        """Child stream for independent sub-sequences."""
        return SeededRNG(f"{self._state}:{label}")
