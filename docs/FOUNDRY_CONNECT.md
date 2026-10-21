# Connect the local ReMatch API to Microsoft Foundry

This guide exposes the existing read-only match and decision routes plus one non-persisting claim evidence/reference validation operation through a temporary Cloudflare Quick Tunnel. The backend remains bound to `127.0.0.1:8000`. The API currently serves synthetic demo matches; this setup is for development, not production.

## 1. Start and protect the API

From PowerShell, create a random local token without printing it, then put the resulting value in `backend/.env` (create that ignored file from `.env.example` if needed):

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$token = [Convert]::ToBase64String($bytes)
Set-Clipboard -Value $token
# Paste the clipboard value into backend/.env, then clear it:
Set-Clipboard -Value ''
```

Set these lines in `backend/.env`:

```dotenv
REQUIRE_API_AUTH=true
API_BEARER_TOKEN=<your-random-token>
```

The server refuses to start if auth is required without a configured token or if the token is shorter than 32 characters. Local development stays unauthenticated by default when `REQUIRE_API_AUTH` is unset/false.

Start the backend from `backend`:

```powershell
cd backend
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m app.services.seed
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The health route must return `401` without a token and `200` with a valid bearer token:

```powershell
Invoke-WebRequest http://127.0.0.1:8000/api/v1/health -SkipHttpErrorCheck
$headers = @{ Authorization = "Bearer $token" }
Invoke-RestMethod http://127.0.0.1:8000/api/v1/health -Headers $headers
```

## 2. Install and start the temporary HTTPS tunnel

`cloudflared` is not installed in the project environment. If you choose to install it, run this manually in an elevated or ordinary PowerShell terminal as appropriate for your Windows setup:

```powershell
winget install -e --id Cloudflare.cloudflared
```

Alternatively, download the Windows executable from [Cloudflare's official downloads page](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/). Confirm `cloudflared --version` works in a new terminal.

From the repository root, run:

```powershell
.\scripts\start-rematch-tunnel.ps1
```

The script defaults to port `8000`. To use a backend on another local port, pass `-LocalPort` (for example, `.\scripts\start-rematch-tunnel.ps1 -LocalPort 8001`). The script checks the selected origin's `/api/v1/health` and requires an unauthenticated `401` response with a Bearer challenge before starting. It refuses to start if the API is unavailable or does not meet that authentication check, and forwards only to `http://127.0.0.1:<LocalPort>`. Press **Ctrl+C** to stop.

Cloudflare prints a temporary URL of the form:

```text
https://<random-subdomain>.trycloudflare.com
```

The random hostname changes when you restart the Quick Tunnel. Do not assume a fixed hostname. The tunnel creates a publicly reachable HTTPS URL while running; bearer auth is a development guard, not production-grade user authorization. Do not use real or sensitive match data.

## 3. Check HTTPS reachability

Replace `<random-subdomain>` with the exact URL printed by `cloudflared`:

```powershell
curl.exe -sS -o NUL -w "HTTP %{http_code}`n" https://<random-subdomain>.trycloudflare.com/docs
curl.exe -sS -o NUL -w "HTTP %{http_code}`n" https://<random-subdomain>.trycloudflare.com/openapi.json
```

`/docs` and `/openapi.json` are public while the tunnel runs. They expose API documentation only; `/api/v1` data routes require the bearer token. Keep the URL private during testing, stop the tunnel when finished, and do not put the token in a URL.

## 4. Import the OpenAPI tool into Foundry

The tool contract is [rematch-foundry-openapi.json](rematch-foundry-openapi.json). It is generated from the actual FastAPI app by `backend/scripts/export_foundry_openapi.py` and includes only:

- `GET /api/v1/matches` (to discover available match IDs)
- `GET /api/v1/matches/{match_id}`
- `GET /api/v1/matches/{match_id}/events` (to discover event IDs)
- `GET /api/v1/matches/{match_id}/events/{event_id}/decision-analysis`
- `GET /api/v1/matches/{match_id}/events/{event_id}/decision-analysis/narrative`
- `GET /api/v1/matches/{match_id}/events/{event_id}/decision-analysis/evidence`
- `POST /api/v1/matches/{match_id}/events/{event_id}/decision-analysis/verify`

The `GET .../decision-analysis/narrative` operation returns one analysis, evidence/reference validation results for its structured claims, and a deterministic English/Arabic narrative in one response. It uses the analysis's actual evidence catalog internally. Its `evidenceValidationStatus` reports reference/calculation checks only and `claimSupportStatus` remains `not_assessed`; it does not verify natural-language truth. The route is read-only and does not persist claims.

The `POST .../verify` operation accepts submitted claims and returns statuses based on whether their evidence references exist in the selected match/event catalog and whether registered calculation values are consistent. The legacy `status` mirrors `evidenceValidationStatus`; `claimSupportStatus` is always `not_assessed` because natural-language truth is not evaluated. Valid references and calculation IDs do not prove the statement true. In particular, `geometric_progression_v1` is not xG or a pass-success probability. Submitted claims are not persisted. It requires the same bearer authentication as the GET operations. No other POST or write operations are included. Before import, replace the `servers[0].url` placeholder in the JSON with the exact current `https://<random-subdomain>.trycloudflare.com` URL. Never add a token to the schema. If application routes or response models change, regenerate and revalidate the file:

```powershell
cd backend
.venv\Scripts\python.exe scripts\export_foundry_openapi.py
```

From the Microsoft Foundry project/agent UI, add a **Custom OpenAPI** tool, use the name `rematch_match_intelligence`, and this description:

> Read synthetic ReMatch match events, backend decision comparisons, and registered evidence. Validate submitted claim references when requested; this does not certify natural-language truth. Preserve returned scores and limitations.

Import/paste the updated JSON file. Select the connection-based **Custom keys** / API-key authentication option (the OpenAPI security scheme is a header named `Authorization`). Create a project connection with key `Authorization` and value `Bearer <the same local API_BEARER_TOKEN>`. Enter the token only in the Foundry connection secret field; never in the OpenAPI JSON or agent instructions. The `Bearer ` prefix and space are required.

Add the recommendations in [FOUNDRY_AGENT_INSTRUCTIONS.md](FOUNDRY_AGENT_INSTRUCTIONS.md) to this agent's instructions. Use the `gpt-4.1-mini` deployment only if OpenAPI tool use is supported for that model and project region. Microsoft Foundry UI labels and support can vary by portal experience; check the current tool support list if OpenAPI is unavailable.

After saving the tool, test in the Foundry playground: ask for available matches, choose an ID actually returned by `list_matches`, request events for that match, then call `get_decision_analysis_narrative` for a returned event ID. Confirm synthetic provenance, scoring method/version, returned values, bilingual narrative, evidence-validation statuses, `claimSupportStatus: not_assessed`, and limitations. Adding a tool to one agent does not connect it to other agents. This guide does not create or connect the Foundry agent; complete and verify those portal actions manually.

## Troubleshooting

| Symptom | Check |
|---|---|
| `401 Unauthorized` | Confirm the API `.env` has `REQUIRE_API_AUTH=true`, the server was restarted, and the Foundry `Authorization` connection value is `Bearer <token>` with the correct secret. |
| `403 Forbidden` | Check the Foundry connection access and any organization egress/network policies. The API itself returns `401` for invalid/missing bearer auth, not `403`. |
| `404 Not Found` | Verify the tunnel URL has no extra path prefix, the match/event IDs came from the API, and the event belongs to that match. |
| `422` | Check required path parameters and valid IDs. `insufficient_evidence` means the event lacks supported analysis inputs; it is not fixed by inventing data. |
| Timeout | Keep the API and tunnel terminal processes running, check the local health route, confirm the tunnel targets port `8000`, and retry with a new tunnel URL if it restarted. |
| Invalid OpenAPI schema | Re-export from the app, keep the version at `3.1.0`, replace only the server URL, and verify all path parameters and `operationId` values remain present. |
| Model/tool compatibility | Confirm the current Foundry model/region tool support matrix and that the tool is enabled for this agent. A model deployment name alone does not guarantee custom OpenAPI support. |

## Verified here

- The existing FastAPI app entry point is `backend/app/main.py`; its live `/openapi.json` returned HTTP 200 during inspection.
- The selected operations and response schemas are derived from that app's OpenAPI generation. The `POST .../verify` operation validates caller-submitted evidence references and registered calculation consistency; the composed narrative GET applies the same checks to Agent 1 structured claims. Neither establishes natural-language truth.
- Local development auth defaults off; required auth rejects requests without a valid bearer token and refuses startup without a configured token.
- No Foundry portal configuration was performed or verified. `cloudflared` was not installed in the inspected environment, and no tunnel URL has been generated.
