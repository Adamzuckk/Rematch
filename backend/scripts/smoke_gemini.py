#!/usr/bin/env python3
"""Minimal live Gemini smoke test.

Runs only when GEMINI_API_KEY is set in the environment (or backend/.env).
Never prints the API key. Exits 0 on a successful generate_content call.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Allow `python scripts/smoke_gemini.py` from backend/
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")


def main() -> int:
    key = (os.environ.get("GEMINI_API_KEY") or "").strip()
    if not key:
        print("SKIP: GEMINI_API_KEY is not set — no live Gemini smoke test.")
        return 0

    model = (os.environ.get("GEMINI_MODEL") or "gemini-3.5-flash-lite").strip()
    # Import after env load; use settings path without enabling full enrichment.
    from google import genai
    from google.genai import types

    client = genai.Client(
        api_key=key,
        http_options=types.HttpOptions(timeout=20_000),
    )
    try:
        response = client.models.generate_content(
            model=model,
            contents='Reply with exactly: {"ok":true}',
            config=types.GenerateContentConfig(
                temperature=0,
                max_output_tokens=32,
                response_mime_type="application/json",
            ),
        )
    except Exception as exc:  # noqa: BLE001
        # Never include env or key material in the message.
        print(f"FAIL: Gemini smoke request error: {exc.__class__.__name__}")
        return 1
    finally:
        close = getattr(client, "close", None)
        if callable(close):
            try:
                close()
            except Exception:  # noqa: BLE001
                pass

    text = (getattr(response, "text", None) or "").strip()
    if not text:
        print("FAIL: Gemini returned empty content")
        return 1
    if "ok" not in text.lower():
        print("FAIL: Gemini response did not look like the expected JSON ack")
        return 1
    print(f"OK: Gemini smoke succeeded (model={model}, chars={len(text)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
