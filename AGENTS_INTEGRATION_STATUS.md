# Agents integration status

## Verified findings

The repository contains three local, deterministic components described as agents:

| Component | Implementation | Verified behavior |
| --- | --- | --- |
| Agent 1 — decision analysis | `backend/app/services/decision/` via `analyze_decision` | Computes the existing geometric decision analysis and evidence catalog from seeded data. |
| Agent 2 — Narrator | `backend/app/services/narrator.py` via `narrate_truth_pack` | Produces deterministic English and Arabic narrative from the supplied truth pack; it does not call a model or fetch data. |
| Agent 3 — Verifier | `backend/app/services/verifier.py` via `verify_narrative_claims` | Validates evidence references and registered calculations only. Natural-language claim truth is always `not_assessed`. |

`build_match_intelligence_narrative` in `backend/app/services/match_intelligence.py` composes these components for `GET /api/v1/matches/{match_id}/events/{event_id}/decision-analysis/narrative`. It invokes the decision analysis, passes its real evidence catalog to the verifier, and passes the assembled truth pack to the Narrator. This is a working local composition, but there is no separately named Orchestrator service, background workflow, streaming protocol, LLM call, or generic question-answering endpoint.

Microsoft Foundry material is documentation and an OpenAPI export only. No Foundry client, configured external agent, deployment, or remote execution is present or verified in this workspace.

## Website integration

The frontend already has the typed `MatchService.getDecisionNarrative` API boundary and `useDecisionNarrative` hook. The Decision Explorer now exposes it as an explicit **Ask the agents** action for the selected match event:

- The action requests only the existing composed narrative endpoint.
- It does not accept arbitrary questions or create a free-form chat surface because the backend has no such workflow.
- It shows loading only while that request is pending.
- It shows the backend-returned local narrative and evidence-validation results on success.
- It marks a result partial only when the returned analysis completeness is not `complete` or a returned evidence-validation status is not `verified`.
- It surfaces backend unavailability and request errors without mock fallback; errors can be retried.
- Static mock mode remains explicitly unavailable because it has no backend-composed narrative.

No browser credential handling was added. The website can call this workflow in the existing API mode when the API is safely reachable without exposing a privileged bearer token. A bearer-protected remote API needs a server-side authenticated proxy/session boundary before browser integration; placing `API_BEARER_TOKEN` in Vite configuration or browser code would be unsafe.

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

The current feature is an event-scoped deterministic composition, not conversational AI and not an externally hosted multi-agent runtime. There is no endpoint that accepts an arbitrary user question, no external-agent execution to monitor, and no named orchestrator to display.

If arbitrary authenticated remote access is required, the smallest safe next step is a backend-owned authenticated session/proxy endpoint that authorizes the user and invokes the existing composed workflow without ever sending the API bearer token to the browser. Any broader question-answering capability would first require a new backend contract defining allowed inputs, evidence grounding, response schema, limits, and failure semantics.
