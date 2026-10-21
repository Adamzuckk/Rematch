$ErrorActionPreference = "Stop"

$scriptPath = (Resolve-Path (Join-Path $PSScriptRoot "..\start-rematch-tunnel.ps1")).Path
$source = Get-Content -LiteralPath $scriptPath -Raw
$defaultTarget = "http://127.0.0.1:8000"

if ($source -notmatch '(?is)param\s*\(\s*\[int\]\$LocalPort\s*=\s*8000\s*\)') {
    throw "Tunnel script must expose LocalPort with a default of 8000."
}
if ($source -notmatch '\$LocalPort\s+-lt\s+1\s+-or\s+\$LocalPort\s+-gt\s+65535') {
    throw "Tunnel script must reject invalid TCP port values."
}
if ($source -notmatch '\$ApiBaseUrl\s*=\s*"http://127\.0\.0\.1:\$LocalPort"') {
    throw "Tunnel script must build a loopback-only origin from LocalPort."
}
if ($source -notmatch '\$healthUrl\s*=\s*"\$\(\$ApiBaseUrl\.TrimEnd\(') {
    throw "Health/auth check must use the fixed local API origin."
}
if ($source -notmatch '&\s+\$cloudflared\.Source\s+tunnel\s+--protocol\s+http2\s+--url\s+\$ApiBaseUrl') {
    throw "Cloudflared must use HTTP/2 and receive the same fixed local API origin."
}
if ($source -notmatch '\$statusCode\s+-ne\s+401' -or $source -notmatch 'WWW-Authenticate') {
    throw "Tunnel must require the protected health route's 401 Bearer challenge."
}

$global:RematchTunnelTestHealthUri = $null
$global:RematchTunnelTestStatusCode = 200
$global:RematchTunnelTestAuthChallenge = $null
$global:RematchTunnelTestCloudflaredInvoked = $false

function global:Get-Command {
    [CmdletBinding()]
    param([string]$Name)

    if ($Name -eq "cloudflared") {
        return [pscustomobject]@{ Source = "MOCK_CLOUDFLARED_MUST_NOT_RUN" }
    }
    return $null
}

function global:Invoke-WebRequest {
    [CmdletBinding()]
    param(
        [string]$Uri,
        [string]$Method,
        [int]$TimeoutSec,
        [switch]$UseBasicParsing
    )

    $global:RematchTunnelTestHealthUri = $Uri
    return [pscustomobject]@{
        StatusCode = $global:RematchTunnelTestStatusCode
        Headers = @{ "WWW-Authenticate" = $global:RematchTunnelTestAuthChallenge }
    }
}

try {
    foreach ($scenario in @(
        @{ Port = 8000; StatusCode = 200; Challenge = $null; ExpectedError = "must require bearer authentication"; ExpectedTarget = $defaultTarget },
        @{ Port = 8001; StatusCode = 200; Challenge = $null; ExpectedError = "must require bearer authentication"; ExpectedTarget = "http://127.0.0.1:8001" },
        @{ Port = 8000; StatusCode = 401; Challenge = "Basic realm=`"api`""; ExpectedError = "Bearer authentication challenge"; ExpectedTarget = $defaultTarget }
    )) {
        $global:RematchTunnelTestHealthUri = $null
        $global:RematchTunnelTestStatusCode = $scenario.StatusCode
        $global:RematchTunnelTestAuthChallenge = $scenario.Challenge

        try {
            & $scriptPath -LocalPort $scenario.Port
            throw "Tunnel script unexpectedly accepted the authentication response for port $($scenario.Port)."
        } catch {
            if ($_.Exception.Message -notmatch $scenario.ExpectedError) {
                throw
            }
        }

        if ($global:RematchTunnelTestHealthUri -ne "$($scenario.ExpectedTarget)/api/v1/health") {
            throw "Health check did not use the selected loopback API URL for port $($scenario.Port)."
        }
        if ($global:RematchTunnelTestCloudflaredInvoked) {
            throw "Tunnel was invoked despite a failed authentication precheck."
        }
    }

    foreach ($invalidPort in @(0, 65536)) {
        $global:RematchTunnelTestHealthUri = $null
        try {
            & $scriptPath -LocalPort $invalidPort
            throw "Tunnel script unexpectedly accepted invalid port $invalidPort."
        } catch {
            if ($_.Exception.Message -notmatch "LocalPort must be a valid TCP port") {
                throw
            }
        }
        if ($global:RematchTunnelTestHealthUri) {
            throw "Invalid port $invalidPort reached the API health check."
        }
    }

    if ($source -notmatch '&\s+\$cloudflared\.Source\s+tunnel\s+--protocol\s+http2\s+--url\s+\$ApiBaseUrl') {
        throw "Cloudflared must use HTTP/2 and the same selected local API origin."
    }

    Write-Output "PASS: default port 8000, explicit port 8001, invalid ports, failed auth prechecks, and selected HTTP/2 tunnel target verified; no tunnel invocation."
} finally {
    Remove-Item Function:\global:Get-Command -ErrorAction SilentlyContinue
    Remove-Item Function:\global:Invoke-WebRequest -ErrorAction SilentlyContinue
    Remove-Variable RematchTunnelTestHealthUri -Scope Global -ErrorAction SilentlyContinue
    Remove-Variable RematchTunnelTestStatusCode -Scope Global -ErrorAction SilentlyContinue
    Remove-Variable RematchTunnelTestAuthChallenge -Scope Global -ErrorAction SilentlyContinue
}
