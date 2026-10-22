# Critical fixes (build, tests, deploy readiness)

## Fixed
1. **JudgeModePage** uses `matchService.getMatches()` (returns `MatchSummary[]`), not `listMatches` / `res.items`.
2. **Tests** wrap UI in `PersonaProvider` via `renderWithProviders`.
3. **Vitest** excludes `e2e/**` and `*.spec.ts` (Playwright stays separate).
4. **Lint structure**: overlay types moved to `overlayTypes.ts`; persona types to `personaTypes.ts`.
5. **API client** sends `Authorization: Bearer` when `VITE_API_BEARER_TOKEN` is set; Insights fetch does the same.
6. **containerapp.yaml** `minReplicas: 1` to avoid cold-start gaps during review.
7. **Frontend container**: `rematch-frontend/Dockerfile` + `nginx.conf` (proxies `/api`).
8. **Repo hygiene**: removed nested `rematch-phases-ak.zip`, added `LICENSE` (MIT), README documents Judge Mode / persona / overlay / Foundry docs.
9. **Metrics** remain catalogue-only by design (no fabricated verifier latency).

## Still team-owned (not fakeable in-repo)
- Live Microsoft Foundry project + agents in Azure portal
- Public HTTPS URL for judges
- Demo video upload
