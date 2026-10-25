# Deploying ReMatch to Azure Container Apps

This guide packages the existing FastAPI backend for an Azure Container Apps Consumption deployment. The API remains protected by its existing bearer authentication. The synthetic Phase 4 and Phase 8 datasets are migrated and seeded when a container starts; no local `.env`, database, or test data file is copied into the image.

## Runtime design

- `backend/Dockerfile` installs the production dependencies from `backend/pyproject.toml`, runs as a non-root user, applies Alembic migrations, seeds the deterministic synthetic fixtures, and starts Uvicorn without `--reload`.
- The app listens on `0.0.0.0:${PORT:-8000}` inside the container. The Container App ingress targets port `8000` and redirects external traffic to HTTPS.
- `backend/containerapp.yaml` enables bearer auth, references the API token through an ACA secret, sets the Consumption workload resources to 0.5 vCPU / 1 GiB, and configures scale-to-zero (`minReplicas: 0`, `maxReplicas: 1`).
- Probes use TCP on port 8000 because `/api/v1/health` is intentionally bearer-protected.
- The SQLite database lives at `/tmp/rematch/rematch.db`. It is ephemeral and rebuilt from the deterministic synthetic seed after a new container starts. This is suitable only for the current read-only demo API; it is not durable storage for real match data or future write features.
- No external Foundry call or new database service is introduced.

## Build and review locally

Run from the repository root. Docker is needed only for this image check; a local Docker installation is not required for an Azure remote build.

```powershell
docker build -t rematch-backend:preflight .\backend
docker run --rm -p 8000:8000 `
  -e REQUIRE_API_AUTH=true `
  -e API_BEARER_TOKEN='test-only-token-for-local-image-validation-0123456789' `
  rematch-backend:preflight
```

Use a test-only token for a local image smoke test. Do not put a real token in a Docker build argument, Dockerfile, image, command transcript, or repository file. Test `/openapi.json`, then check `/api/v1/health` without credentials for HTTP 401 and with the test token for HTTP 200. Test the composed narrative and decision-analysis endpoints using the synthetic IDs in `backend/tests/test_match_intelligence_integration.py`.

## Azure resource plan — review before creating anything

The local environment inspected for this project does not currently have Azure CLI available or an authenticated Azure account, so the subscription, existing registries/environments, supported region, and exact quote could not be checked. Do not run resource-creation commands until those details have been inspected and the owner has approved the selected resources and their cost.

The proposed minimal plan is:

| Resource | Why it is needed | Cost considerations |
|---|---|---|
| Resource group | Organizes the deployment | No direct resource-group charge |
| Azure Container Registry, Basic | Holds the private image for ACA to pull | A paid registry tier has a recurring charge; exact price varies by region |
| Container Apps managed environment, Consumption | Provides HTTPS ingress and scale-to-zero compute | Consumption has no app compute charge while scaled to zero; other selected features can add charges |
| Container App | Runs the API | First 180,000 vCPU-seconds, 360,000 GiB-seconds, and 2 million requests per subscription/month are included in the published Consumption grant; usage beyond that is billable |
| Log Analytics workspace (optional) | Retains console/system logs for troubleshooting | Ingestion and retention may be billable. Reuse an existing workspace if appropriate, or choose `--logs-destination none` to avoid creating one and accept that logs will not be retained there |

The Container Apps free grants are subscription-level allowances, not a zero-cost guarantee. ACR storage/builds, monitoring, outbound data, and usage beyond the grant may cost money. Check current regional prices and the subscription's remaining grant in the [Azure pricing calculator](https://azure.microsoft.com/pricing/calculator/) before approval. Azure documentation confirms Consumption scale-to-zero and its free grants ([Container Apps pricing](https://azure.microsoft.com/pricing/details/container-apps/), [billing](https://learn.microsoft.com/en-us/azure/container-apps/billing)).

`az containerapp up --source` may create a resource group, Container Apps environment, Log Analytics workspace, Container Registry, and Container App automatically. This guide avoids that implicit resource creation; enumerate and review every resource first. See Microsoft's [source deployment behavior](https://learn.microsoft.com/en-us/azure/container-apps/containerapp-up).

## Deployment sequence after approval

1. Install Azure CLI and the `containerapp` extension if approved, sign in, and inspect the account without printing subscription IDs:

   ```powershell
   az login
   az account list --query "[].{name:name,state:state,isDefault:isDefault}" --output table
   az account show --query "{name:name,state:state,isDefault:isDefault}" --output table
   az extension add --name containerapp --upgrade
   ```

   Select the intended subscription by its displayed name, then check for resources to reuse:

   ```powershell
   az account set --subscription "<approved-subscription-name>"
   az group list --query "[].name" --output table
   az acr list --query "[].{name:name,resourceGroup:resourceGroup,sku:sku.name}" --output table
   az containerapp env list --query "[].{name:name,resourceGroup:resourceGroup,location:location}" --output table
   ```

   Do not assume the subscription, resource names, or region. Confirm the region is supported and check whether an existing approved registry or environment can be reused.
2. Before running any create command, review this resource list and a current regional price estimate with the owner. Obtain explicit approval for the selected resources and cost. No cloud resource creation is authorized by the commands below alone.
3. After approval only, set names and the approved region, then create or reuse a resource group, a Basic ACR, and a Consumption Container Apps environment. The example environment command uses a Log Analytics destination for deployment troubleshooting, which may incur ingestion/retention charges:

   ```powershell
   $resourceGroup = "<approved-resource-group>"
   $location = "<approved-region>"
   $registryName = "<globally-unique-registry-name>"
   $environmentName = "<approved-container-apps-environment>"
   $appName = "<globally-unique-app-name>"

   az group create --name $resourceGroup --location $location
   az acr create --name $registryName --resource-group $resourceGroup --location $location --sku Basic --admin-enabled $false
   az containerapp env create --name $environmentName --resource-group $resourceGroup --location $location --logs-destination log-analytics
   ```

   To avoid Log Analytics storage charges, choose `--logs-destination none` instead and accept that persistent app logs are unavailable. This does not change the app's authentication behavior.
4. Build and push the reviewed image using ACR Tasks (no workstation Docker daemon required):

   ```powershell
   $imageTag = "reviewed"
   az acr build --registry $registryName --image "rematch-backend:$imageTag" .\backend
   $image = "$registryName.azurecr.io/rematch-backend:$imageTag"
   ```

5. Create the Container App with external ingress still disabled and `REQUIRE_API_AUTH=true`, but without `API_BEARER_TOKEN`. The backend will fail closed during startup. Assign a system-managed identity for registry pulls:

   ```powershell
   az containerapp create --name $appName --resource-group $resourceGroup --environment $environmentName `
     --image $image --registry-server "$registryName.azurecr.io" --registry-identity system --system-assigned `
     --cpu 0.5 --memory 1.0Gi --min-replicas 0 --max-replicas 1 `
     --env-vars APP_ENV=production REQUIRE_API_AUTH=true DATABASE_URL=sqlite:////tmp/rematch/rematch.db PORT=8000
   ```

   If Azure cannot create the ACR pull role assignment automatically, assign only the app identity's `AcrPull` role on this registry before continuing. In the Azure Portal, add ACA secret `api-bearer-token` using the local token, then configure container environment variable `API_BEARER_TOKEN` as a secret reference to it. Do not paste the token into chat, YAML, Docker build arguments, Git, logs, or a normal environment value. Keep ingress disabled until that secret reference is configured.

   Optional Gemini event-intelligence enrichment (server-side only): add ACA secret `gemini-api-key`, then set env `GEMINI_API_KEY` as a secret reference plus `LLM_ENABLED=true`, `LLM_PROVIDER=gemini`, and optional `GEMINI_MODEL=gemini-3.5-flash-lite`. Never put `GEMINI_API_KEY` in the frontend, image layers, or plaintext YAML. The API boots without Gemini when enrichment is left disabled.
6. Replace the image placeholder in `backend/containerapp.yaml` with `$image`, then apply the YAML to set external HTTPS ingress, scale limits, and TCP probes:

   ```powershell
   az containerapp update --name $appName --resource-group $resourceGroup --yaml .\backend\containerapp.yaml
   ```

   Verify external HTTPS ingress, target port 8000, and `minReplicas: 0` / `maxReplicas: 1`. Keep all probes on TCP port 8000; do not add an unauthenticated health route.
7. Test the assigned HTTPS URL: public `/openapi.json`; unauthenticated `/api/v1/health` must return 401 with a Bearer challenge; authenticated health, decision-analysis, and narrative calls must succeed. Use the real fixture IDs in the integration test and do not emit the token or Authorization header in logs.
8. Only after the real Azure URL is known, update `servers[0].url` in `docs/rematch-foundry-openapi.json` and rerun the OpenAPI contract tests. Then manually update/import the Foundry connection/tool with the Azure URL and store the bearer credential in its secret-backed connection. Do not reuse the temporary Cloudflare URL.

## Validation commands

From `backend`:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m pytest tests/test_local_dev_config.py tests/test_foundry_openapi_contract.py
```

For a local Docker image check, run the commands in **Build and review locally** and make HTTP requests from another terminal. No cloud deployment is considered complete until the public HTTPS tests above pass. Foundry is not considered connected until an actual tool call succeeds in the Foundry playground.

## Current blockers

- Azure CLI is not installed in the inspected environment, so no Azure session, subscription, region, or existing resource inventory could be confirmed.
- Docker is not installed, so the image could not be built or run locally.
- No Azure resources were created, and the OpenAPI server URL / Foundry connection remain unchanged.
