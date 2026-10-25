# Agents integration status

## Verified findings

> The original website-integration notes below were written before the chat integration. Current chat wiring is summarized here; older statements about there being no question endpoint are historical.

The repository contains three local, deterministic components described as agents:

| Component | Implementation | Verified behavior |
| --- | --- | --- |
| Agent 1 — decision analysis | `backend/app/services/decision/` via `analyze_decision` | Computes the existing geometric decision analysis and evidence catalog from seeded data. |
| Agent 2 — Narrator | `backend/app/services/narrator.py` via `narrate_truth_pack` | Produces deterministic English and Arabic narrative from the supplied truth pack; it does not call a model or fetch data. |
| Agent 3 — Verifier | `backend/app/services/verifier.py` via `verify_narrative_claims` | Validates evidence references and registered calculations only. Natural-language claim truth is always `not_assessed`. |

`build_match_intelligence_narrative` in `backend/app/services/match_intelligence.py` composes these components for `GET /api/v1/matches/{match_id}/events/{event_id}/decision-analysis/narrative`. It invokes the decision analysis, passes its real evidence catalog to the verifier, and passes the assembled truth pack to the Narrator. This is a working local composition, but there is no separately named Orchestrator service, background workflow, streaming protocol, or generic question-answering endpoint.

Optional **server-side** LLM enrichment for `GET .../event-intelligence` lives in `backend/app/services/llm/`. Providers include OpenAI-compatible HTTP APIs and Google Gemini (`LLM_PROVIDER=gemini` with `GEMINI_API_KEY` via the official `google-genai` SDK). It is disabled unless `LLM_ENABLED=true` and provider secrets are configured on the API host. This event-intelligence enrichment is separate from chat. All user-facing Ask-the-Analyst / Ask-the-Agent messages go through `rematch-frontend/src/services/orchestrator/orchestratorClient.ts` to the Azure Function `/api/orchestrate`; the obsolete backend `/api/v1/matches/{match_id}/ask` endpoint and service have been removed. No Gemini/OpenAI key or direct provider call is present in frontend runtime code. Keys must never appear in the frontend. See `docs/llm-provider.md`.

Microsoft Foundry material remains documentation and an OpenAPI export for an **external** agent that calls Rematch tools. That path is separate from in-process enrichment.

## Website integration

The Decision Explorer also has a free-form **Ask the Analyst** chat. Its only chat transport is `rematch-frontend/src/services/orchestrator/orchestratorClient.ts`, which calls the Azure Function `POST /api/orchestrate`; the Function obtains a Managed Identity token and calls Foundry server-side. The legacy backend `/api/v1/matches/{match_id}/ask` route was removed. The browser sends only the user's message and current match/event IDs, and has no provider credentials. Match scores and narrative data continue to come from the existing backend APIs; there is no local chat-answer fallback.

## Changed files

- `rematch-frontend/src/pages/DecisionExplorerPage.tsx`
- `rematch-frontend/src/components/decision/DecisionExplorerPanel.tsx`
- `rematch-frontend/src/i18n/strings.ts`
- `rematch-frontend/src/hooks/useDecisionNarrative.test.tsx`
- `rematch-frontend/src/pages/DecisionExplorerPage.test.tsx`
- `AGENTS_INTEGRATION_STATUS.md`

Existing Insights milestone files were inspected and left unchanged by this task.

## Validation

Verified in this workspace:

```text
backend/.venv/bin/pytest -q                         101 passed
rematch-frontend: npm test                           94 passed
rematch-frontend: npm run lint                       passed
rematch-frontend: npm run typecheck                  passed
rematch-frontend: npm run build                      passed
rematch-frontend: SMOKE_API_BASE_URL=… npm run smoke:decision
                                                        passed against a fresh local Phase 8 seed
```

The backend run reports one existing FastAPI/Starlette TestClient deprecation warning. The focused frontend tests cover explicit request enablement, loading/error retry behavior, the new action, backend-returned partial results, and the existing English/Arabic narrative behavior. Backend composition tests cover the composed endpoint, verifier output, and deterministic narration.

## Limitations and next required step

The backend decision narrative remains a deterministic Match Intelligence, Verifier, and Narrator composition. Chat is handled separately by the Foundry Orchestrator Function; no Foundry call or token is made from frontend runtime code.
