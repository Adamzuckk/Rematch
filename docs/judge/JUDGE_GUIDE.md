# Judge testing guide (Rematch)

Synthetic data only. Backend calculates scores; UI and templates explain them.

## Quick path (Judge Mode)

1. Start backend + seed + frontend (see root README).
2. Open `/judge`.
3. Start the listed match → use **Play** on event replay (0.5x–2x).
4. Open a frame-backed event → **Decision Explorer** → **Pick Your Pass**.
5. Toggle **Fan / Analyst** in the top bar; open **Insights**.
6. Optional: download timed overlay JSON from the match page.

## Auth / CORS for public demos

- Local: `REQUIRE_API_AUTH=false` (default in development).
- Vite proxies `/api` → `http://127.0.0.1:8000` for same-origin.
- Production: set `CORS_ORIGINS` to the frontend origin; document any bearer token in the submission notes if `REQUIRE_API_AUTH=true`.

## What is out of scope in this build

- Live Premier League footage or trademarks.
- Invented xG / probabilities.
- Changing Foundry narrator/verifier contracts (owned separately).
