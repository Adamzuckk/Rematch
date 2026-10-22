# Backend Deployment Readiness

## Scope and files reviewed

Work was limited to `Rematch-main`. This folder has no `.git`, so it is not a verified clone of GitHub `main`; no remote changes were fetched or inspected.

Files changed for this deployment preparation:

- `.github/workflows/rematch-AutoDeployTrigger-b387ca70-61ec-4d2d-84e8-ea1b6648070e.yml` — replaced the previous deployment logic with backend tests, OIDC, guarded identity/ACR setup, image build/push, targeted image/scale update, and deployment verification.
- `backend/containerapp.yaml` — set the requested image repository placeholder, system-assigned identity/registry binding, TCP probes on 8000, and 0–1 replica bounds while retaining the secret reference and ingress declarations.
- `.github/workflows/security.yml` — corrected the indentation of the checkout/setup action steps so the existing workflow structure is valid YAML by inspection. A YAML parser was unavailable, so syntax has not been independently validated.
- `BACKEND_DEPLOYMENT_READINESS.md` — updated this report.

Reviewed but not changed in this pass: `backend/Dockerfile`, `backend/app/main.py`, `backend/tests/test_health.py`, `backend/tests/test_local_dev_config.py`, and `.github/workflows/ci.yml`.

## Deployment design

- Azure app: `rematch`; resource group: `Rematch-RG`; ACR: `rematchbackend.azurecr.io`; container name: `bootstrap-container-pre-deployment` from the supplied prior confirmation. The exact current environment ID is not verified; workflow only requires a non-empty managed environment ID and never changes it.
- Dockerfile and build context: `backend/Dockerfile` and `backend/`.
- Image: `rematchbackend.azurecr.io/rematch-api:${{ github.sha }}`.
- Runtime: the Dockerfile sets `PORT=8000` and starts Uvicorn on `0.0.0.0:${PORT:-8000}`. Manifest ingress and all three TCP probes use 8000.
- Scale: workflow update sets `minReplicas=0`, `maxReplicas=1`; the manifest expresses the same bounds. This saves idle replica usage but introduces cold starts. SQLite is stored under `/tmp` and is ephemeral; the app's synthetic seed runs at startup. Do not treat SQLite contents as durable production data.
- Authentication: `REQUIRE_API_AUTH=true`; `API_BEARER_TOKEN` remains a reference to Azure Container Apps secret `api-bearer-token`. The workflow checks only the secret name and reference, never retrieves or prints its value. Local image smoke testing generates an ephemeral runner-only token.
- ACR auth: the Container App's system-assigned identity is granted `AcrPull`, then bound to `rematchbackend.azurecr.io` with identity auth. The GitHub OIDC principal pushes using `AcrPush`. The workflow checks ACR role-assignment mode is `rbac` and stops if it is not; legacy `AcrPull`/`AcrPush` are not effective for ABAC-enabled registries. It never enables ACR admin auth.
- Probes: the backend has `/healthz` and authenticated `/api/v1/health`, but the requested deployment uses TCP probes on 8000. The manifest defines TCP startup/liveness/readiness probes. The workflow preflight requires all three to already exist in Azure; it does not apply a partial YAML manifest or change probes/ingress. If live Azure settings differ, it stops before secret/image/app changes. Set or verify the TCP probes and ingress before the first run.
- Deployment update: `az containerapp update` targets the app, resource group, and explicit container name, updating only image plus requested replica bounds. It does not pass a minimal app manifest or set env vars/secrets/ingress. Separate identity/registry steps enable the app system identity, grant/check AcrPull, and bind that identity to this ACR.
- Workflow triggers on backend/workflow changes pushed to `main`, or manual dispatch; the deploy job additionally requires repository `Adamzuckk/Rematch` and ref `refs/heads/main`. Backend tests run before deployment. OIDC permissions are scoped to the deploy job.

## Health and authentication review

`backend/app/main.py` registers `/healthz` directly on the FastAPI application, outside the `/api/v1` router. It returns HTTP 204 with no body or secret/configuration data. The API router has a router-level authentication dependency. Existing tests assert that `/api/v1/health` rejects missing/wrong bearer tokens and that a valid token authorizes an API route; `/healthz` tests assert 204 and an empty body while auth is enabled. These code paths were inspected, but backend pytest could not be run in this environment.

## Required GitHub and Azure configuration

GitHub Actions **Secrets** consumed by the workflow (OIDC identifiers, not client credentials):

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

GitHub Actions **Variables**: none. No GitHub secret is needed for the API token. Store that token only as the Container Apps secret `api-bearer-token`; retain the container env reference `API_BEARER_TOKEN -> secretRef: api-bearer-token`.

The OIDC identity must have a federated credential for issuer `https://token.actions.githubusercontent.com`, audience `api://AzureADTokenExchange`, and subject `repo:Adamzuckk/Rematch:ref:refs/heads/main`. The deployment identity needs `AcrPush` scoped to the existing ACR, `Container Apps Contributor` scoped to the existing Container App, and permission to create role assignments on the ACR (for example, `User Access Administrator` scoped to that ACR) because the workflow grants `AcrPull` to the app identity when missing. Those permissions and ACR's role-assignment mode are not live-verified. `Container Apps Contributor` is a broad built-in role even at app scope; use a narrowly scoped custom role if your access policy requires one. Do not grant subscription-wide Owner for this workflow. The required legacy `AcrPull`/`AcrPush` model is incompatible with ACR's `rbac-abac` mode; do not switch ACR modes as an unreviewed fix.

## First-run setup steps (not executed)

1. In Microsoft Entra, select the existing app registration/service principal whose client ID will be `AZURE_CLIENT_ID`. Add a federated credential for GitHub Actions, repository `Adamzuckk/Rematch`, branch `main`. If there is no suitable existing identity, create/configure one only after confirming authorization; no identity was discovered in this local-only task.
2. In Azure IAM, grant that GitHub OIDC principal `AcrPush` on the existing registry and `Container Apps Contributor` on the existing app. To let the workflow grant the app identity `AcrPull`, grant `User Access Administrator` on the ACR to that OIDC principal, or pre-grant app `AcrPull` and revise the workflow to verify-only to avoid role-assignment permission in CI. In ACR Properties, verify Role assignment permissions mode is `RBAC Registry Permissions` (`rbac`); stop if it is ABAC mode rather than changing the registry mode casually.
3. In GitHub repository Settings → Secrets and variables → Actions → Secrets, add the three `AZURE_*` identifiers above. They are values from the selected Entra app, tenant, and subscription; no client secret/password is used. Confirm the federated subject exactly matches the repository and `main` branch.
4. In Azure Portal → Container Apps → `rematch` → Secrets, inspect whether `api-bearer-token` already exists. If present, do not replace it casually. If missing, create it with a securely generated token (at least 32 characters). In the existing container's environment variables, ensure `REQUIRE_API_AUTH=true` and `API_BEARER_TOKEN` references the secret by name; preserve all other variables.
5. In the existing Container App configuration, verify ingress is external, HTTPS-only (`allowInsecure=false`), and target port 8000. In the container health-probe settings, configure Startup, Liveness, and Readiness as TCP on port 8000. The workflow will stop before Azure changes if these preflight expectations or the existing auth secret/reference do not match. Confirm the environment shown is the intended existing environment; the exact name was not supplied as definitive and is not hardcoded.
6. Confirm ACR admin-user authentication remains disabled; the workflow uses OIDC for push and the Container App system identity for pull. The workflow does not enable admin credentials.
7. After reviewing and applying these local changes to the original repository's current `main`, push the reviewed commit normally. Because the workflow is push-triggered on `main`, that push starts backend tests and, if they pass, deployment. Alternatively use Actions → Deploy Rematch backend → Run workflow, selecting `main`. Do not run either trigger until the prerequisites and the first-run effects have been reviewed.

### Optional Azure CLI commands for system identity and AcrPull

Run these manually in Azure Cloud Shell only after confirming the active subscription and target resource IDs. They are not run by this report or the current session. The workflow performs the equivalent app identity/role/registry setup after its preflight.

```bash
az account set --subscription "Azure subscription 1"
az account show --query '{name:name,id:id}' --output table

az containerapp identity assign \
  --name rematch --resource-group Rematch-RG --system-assigned

APP_PRINCIPAL_ID=$(az containerapp show \
  --name rematch --resource-group Rematch-RG \
  --query identity.principalId --output tsv)
ACR_ID=$(az acr show --name rematchbackend --query id --output tsv)

PULL_ASSIGNMENT=$(az role assignment list --include-inherited \
  --assignee "$APP_PRINCIPAL_ID" --scope "$ACR_ID" --role AcrPull \
  --query '[0].id' --output tsv)
if [[ -z "$PULL_ASSIGNMENT" ]]; then
  az role assignment create \
    --assignee-object-id "$APP_PRINCIPAL_ID" \
    --assignee-principal-type ServicePrincipal \
    --role AcrPull --scope "$ACR_ID"
fi

az containerapp registry set \
  --name rematch --resource-group Rematch-RG \
  --server rematchbackend.azurecr.io --identity system
```

Do not put the API bearer token in shell history, workflow YAML, Docker build args, or logs. Use the Azure Portal secret form for initial secret creation/update.

## Validation and limitations

- Backend tests are configured in the workflow with Python 3.12 and `python -m pytest -q`; not run locally because the only installed interpreter is Python 3.10.5, below the project's `>=3.11,<3.15` requirement. No virtual environment or global package was installed.
- YAML validation was not possible: no PyYAML, Node YAML parser, `yq`, `yamllint`, or `actionlint` is available. Workflow YAML has only been reviewed by inspection; do not claim syntax validation passed.
- Bash workflow syntax, Docker build, Azure CLI, GitHub OIDC, RBAC, and live Container App behavior were not tested. No Azure command was executed.
- The workflow's preflight checks a non-empty environment ID, expected app/container/auth/secret reference, external HTTPS ingress on target port 8000, TCP probes on port 8000, and ACR role mode `rbac`. It does not compare the environment ID with one exact name because the provided environment name was qualified as “or similar.” Check the actual environment before triggering.
- `.github/workflows/security.yml` indentation was corrected by inspection, but its syntax and `pip-audit`/Trivy jobs were not run. `backend/containerapp.yaml` retains the existing `REPLACE_WITH_FRONTEND_ORIGIN` CORS placeholder; the workflow does not apply the manifest or alter the live CORS setting. Supply the real frontend origin before using that manifest as a whole-app declaration.
- This folder has no `.git`; `git status`, `git diff`, and `git diff --check` are unavailable. The public GitHub `main` branch was not fetched or modified. No commit, push, deploy, or Azure modification occurred.

## Safe GitHub connection procedure

Do not run `git init` in this ZIP-derived folder. Use a fresh direct clone of `https://github.com/Adamzuckk/Rematch.git` in a separately chosen destination, verify `origin` is only that URL, branch is `main`, and working tree is clean/current. Compare each changed file individually, manually reconcile against latest `origin/main`, and copy/apply only reviewed hunks (never `.git` or whole stale files). Review `git status --short` and complete diff, stage only the intended paths, inspect `git diff --cached`, run checks, then commit. Fetch `origin/main` again before any push; integrate newer commits without reset/force push. Use a normal push so non-fast-forward changes are rejected. Stop if GitHub access, branch protection, OIDC identity, Azure resource identity, or role state is unclear. No connection or transfer has been performed.
