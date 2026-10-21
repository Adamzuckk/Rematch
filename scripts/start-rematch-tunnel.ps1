param(
    [int]$LocalPort = 8000
)

$ErrorActionPreference = "Stop"

if ($LocalPort -lt 1 -or $LocalPort -gt 65535) {
    throw "LocalPort must be a valid TCP port between 1 and 65535; no tunnel was started."
}

$ApiBaseUrl = "http://127.0.0.1:$LocalPort"

$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflared) {
    throw "cloudflared is not installed or is not on PATH. See docs/FOUNDRY_CONNECT.md for the Windows install command."
}

$healthUrl = "$($ApiBaseUrl.TrimEnd('/'))/api/v1/health"
try {
    $response = Invoke-WebRequest -Uri $healthUrl -Method Get -TimeoutSec 5 -UseBasicParsing
    $statusCode = [int]$response.StatusCode
} catch {
    $response = $_.Exception.Response
    if (-not $response) {
        throw "ReMatch API did not respond at $healthUrl. Start the backend first; no tunnel was started."
    }
    $statusCode = [int]$response.StatusCode
}

if ($statusCode -ne 401) {
    throw "The API must require bearer authentication before it is exposed. Configure REQUIRE_API_AUTH=true and API_BEARER_TOKEN in backend/.env, restart the API, and retry. Received HTTP $statusCode; no tunnel was started."
}

$authChallenge = [string]$response.Headers["WWW-Authenticate"]
if ($authChallenge -notmatch '^\s*Bearer(?:\s|$)') {
    throw "The API health route did not return the expected Bearer authentication challenge; no tunnel was started."
}

Write-Host "Starting a temporary Cloudflare Quick Tunnel to $ApiBaseUrl."
Write-Host "Copy the https://<random-name>.trycloudflare.com URL printed below. Press Ctrl+C to stop the tunnel."
& $cloudflared.Source tunnel --protocol http2 --url $ApiBaseUrl
exit $LASTEXITCODE
