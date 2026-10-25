"""Bounded in-memory cache for identical LLM enrichment requests."""

from __future__ import annotations

import hashlib
import threading
import time
from collections import OrderedDict
from typing import Any


class LlmResponseCache:
    """Thread-safe LRU cache with TTL to avoid duplicate provider calls."""

    def __init__(self, *, max_entries: int = 128, ttl_seconds: float = 3600.0) -> None:
        self._max_entries = max(1, max_entries)
        self._ttl_seconds = max(1.0, ttl_seconds)
        self._lock = threading.Lock()
        self._store: OrderedDict[str, tuple[float, str]] = OrderedDict()

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    def get(self, key: str) -> str | None:
        now = time.monotonic()
        with self._lock:
            item = self._store.get(key)
            if item is None:
                return None
            expires_at, value = item
            if expires_at <= now:
                del self._store[key]
                return None
            self._store.move_to_end(key)
            return value

    def set(self, key: str, value: str) -> None:
        expires_at = time.monotonic() + self._ttl_seconds
        with self._lock:
            if key in self._store:
                del self._store[key]
            self._store[key] = (expires_at, value)
            while len(self._store) > self._max_entries:
                self._store.popitem(last=False)


_CACHE = LlmResponseCache()


def cache_key(
    *,
    provider: str,
    model: str,
    messages: list[dict[str, str]],
) -> str:
    blob = "|".join(
        f"{row.get('role', '')}:{row.get('content', '')}" for row in messages
    )
    digest = hashlib.sha256(
        f"{provider}\0{model}\0{blob}".encode("utf-8")
    ).hexdigest()
    return digest


def get_cached_response(key: str) -> str | None:
    return _CACHE.get(key)


def set_cached_response(key: str, value: str) -> None:
    _CACHE.set(key, value)


def configure_cache(*, max_entries: int, ttl_seconds: float) -> None:
    """Apply cache bounds. Recreates the store only when limits change."""
    global _CACHE
    with _CACHE._lock:
        same = (
            _CACHE._max_entries == max(1, max_entries)
            and _CACHE._ttl_seconds == max(1.0, ttl_seconds)
        )
    if same:
        return
    _CACHE = LlmResponseCache(max_entries=max_entries, ttl_seconds=ttl_seconds)


def clear_cache() -> None:
    _CACHE.clear()


def cache_stats() -> dict[str, Any]:
    with _CACHE._lock:
        return {
            "entries": len(_CACHE._store),
            "max_entries": _CACHE._max_entries,
            "ttl_seconds": _CACHE._ttl_seconds,
        }
