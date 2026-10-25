# Server-side LLM provider (event intelligence)

Rematch keeps **verified match evidence and geometric scores** in the API. An optional external LLM may rewrite the bilingual **moment briefing** (`GET .../event-intelligence`) from that evidence only. Decision scores, claims, and the deterministic Narrator / Ask Agents composition remain local and evidence-bound. Fan and Analyst UX is unchanged; both surfaces consume the same briefing payload and `llmConnected` honesty flag.

## What is (and is not) connected

| Surface | Behavior |
|---------|----------|
| Deterministic event intelligence | Always runs first (templates + evidence tiers). |
| Optional LLM enrichment | Runs only when `LLM_ENABLED=true` and provider secrets are set on the **backend**. |
| Decision Explorer (Fan / Analyst) | Displays the event-intelligence briefing; Gemini/OpenAI enrich narrative wording when configured. |
| Ask Agents | Still the deterministic decision + Narrator + verifier composition — no free-form chat, no browser keys. |
| `llmConnected` in the JSON response | `true` **only** after a successful, schema- and grounding-validated provider response. Timeouts, HTTP errors, quota limits, and invalid model output fall back to deterministic text with `llmConnected=false`. |
| Frontend / Vite | **No** `GEMINI_API_KEY`, `LLM_API_KEY`, or provider URLs. The UI only displays `llmConnected` from the API. |
| Microsoft Foundry docs | Still describe Foundry as an **external** agent calling Rematch tools. That path is separate from this in-process enrichment. |

The model is never told to invent players, assists, xG, or official statistics. Grounding validation rejects unverified numbers and forbidden statistical phrases. Scorer/assist lines appear only when present on the match record.

## Supported providers

Set `LLM_PROVIDER` to one of:

| Value | Use when | Required env |
|-------|----------|--------------|
| `openai` (default) | OpenAI Chat Completions | `LLM_API_KEY`, `LLM_MODEL`; optional `LLM_BASE_URL` (default `https://api.openai.com/v1`) |
| `azure_openai` | Azure OpenAI / Foundry-hosted Azure deployments | `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` (resource endpoint), `LLM_AZURE_DEPLOYMENT`, optional `LLM_AZURE_API_VERSION` |
| `openai_compatible` | Gateways that speak OpenAI chat completions | `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` (must include the `/v1` prefix or end with `/chat/completions`) |
| `gemini` | Google Gemini Developer API via official `google-genai` SDK | `GEMINI_API_KEY` (**only** — never `LLM_API_KEY` for Gemini), optional `GEMINI_MODEL` |

Shared knobs:

| Variable | Default | Purpose |
|----------|---------|---------|
| `LLM_ENABLED` | `false` | Master switch |
| `LLM_TIMEOUT_SECONDS` | `20` | Outbound HTTP / SDK timeout |
| `LLM_MAX_TOKENS` | `1200` | Completion cap |
| `LLM_MAX_RETRIES` | `2` | Bounded retries for timeouts / 429 / 5xx |
| `LLM_CACHE_MAX_ENTRIES` | `128` | In-process cache size (`0` disables) |
| `LLM_CACHE_TTL_SECONDS` | `3600` | Cache TTL for identical prompts |

### Gemini

| Variable | Default | Purpose |
|----------|---------|---------|
| `GEMINI_API_KEY` | unset | Gemini Developer API key (SecretStr). Required when `LLM_PROVIDER=gemini` and enrichment is enabled. |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Currently supported Gemini model id. Override to another available model (e.g. `gemini-3.8-flash`) if your project prefers it. |

Copy placeholders from `backend/.env.example`. **Do not commit** `.env` or real keys. Never place Gemini credentials under `rematch-frontend/` or any `VITE_*` variable.

## Local setup

```bash
cd backend
cp .env.example .env
# Edit .env — for Gemini:
#   LLM_ENABLED=true
#   LLM_PROVIDER=gemini
#   GEMINI_API_KEY=<from Google AI Studio — never commit>
#   GEMINI_MODEL=gemini-3.5-flash-lite   # optional override
# Never commit this file.

uv sync --locked --extra dev
alembic upgrade head
rematch-seed
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The API **starts without** a Gemini key when `LLM_ENABLED=false` (default) and uses deterministic briefings.

Confirm honesty without a key: leave `LLM_ENABLED=false` and check that event-intelligence returns `"llmConnected": false`.

With a real key configured, call:

```http
GET /api/v1/matches/{matchId}/events/{eventId}/event-intelligence
```

Success: `llmConnected: true`, `analysisMethod: llm_grounded_event_intelligence_v1`.  
Provider failure: deterministic briefing retained, `llmConnected: false`, limitation mentions the failure class. Never claim Gemini is connected unless a real provider request succeeded and passed grounding validation.

## Deployment steps

1. Keep `GEMINI_API_KEY` / `LLM_API_KEY` (and Azure endpoint/deployment if used) in the host secret store — Container Apps secret, Key Vault reference, or platform env — **not** in the image, git, or frontend build.
2. Set `LLM_ENABLED=true` and `LLM_PROVIDER` only after the secret and provider fields are present; boot fails closed if enabled without the required key.
3. For Gemini on Azure Container Apps: add secret `gemini-api-key`, then env `GEMINI_API_KEY` as a secret reference, plus `LLM_ENABLED=true`, `LLM_PROVIDER=gemini`, optional `GEMINI_MODEL`.
4. Redeploy/restart the API so `get_settings()` picks up env.
5. Smoke-test `/api/v1/health` and one `event-intelligence` call; assert `llmConnected` matches reality.
6. If the provider is unavailable, leave enrichment disabled or rely on automatic deterministic fallback — the Decision Explorer and Ask Agents still work.

For Azure Container Apps packaging, see [AZURE_CONTAINER_APPS.md](./AZURE_CONTAINER_APPS.md). Add LLM/Gemini secrets the same way as `API_BEARER_TOKEN` (runtime secret references), and never bake keys into `Dockerfile` or `containerapp.yaml` plaintext.

## Tests

```bash
cd backend
.venv/bin/pytest tests/test_llm_enrichment.py tests/test_gemini_provider.py tests/test_event_intelligence.py -q
```

Provider HTTP / SDK calls are mocked; no live API key is required for CI. A separate optional smoke script can exercise a real Gemini call when `GEMINI_API_KEY` is present in the environment (see `backend/scripts/smoke_gemini.py`).

## Security checklist

- [ ] No `GEMINI_API_KEY` / `LLM_*` keys under `rematch-frontend/` or `VITE_*`
- [ ] `.env` gitignored; only `.env.example` committed
- [ ] Production uses secret references, not committed values
- [ ] UI copy treats `llmConnected === false` as disconnected (never assume a model is live)
- [ ] Logs and API errors never echo API keys
