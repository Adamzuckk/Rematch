#!/usr/bin/env bash
# Start ReMatch API + frontend (API mode) for local development.
# Usage:
#   ./scripts/run-local.sh
#   REMATCH_API_PORT=8001 ./scripts/run-local.sh
#   ./scripts/run-local.sh --skip-setup   # skip sync / migrate / seed
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/rematch-frontend"

API_HOST="${REMATCH_API_HOST:-127.0.0.1}"
API_PORT="${REMATCH_API_PORT:-8000}"
FE_HOST="${REMATCH_FE_HOST:-127.0.0.1}"
FE_PORT="${REMATCH_FE_PORT:-5173}"
SKIP_SETUP=0

for arg in "$@"; do
  case "$arg" in
    --skip-setup) SKIP_SETUP=1 ;;
    -h|--help)
      sed -n '2,8p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

log() { printf '==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

port_in_use() {
  local host="$1" port="$2"
  if command -v ss >/dev/null 2>&1; then
    ss -tlnH "sport = :$port" 2>/dev/null | grep -q .
    return $?
  fi
  (echo >/dev/tcp/"$host"/"$port") >/dev/null 2>&1
}

wait_http() {
  local url="$1" label="$2" attempts="${3:-40}"
  local i
  for ((i = 1; i <= attempts; i++)); do
    if curl -fsS --connect-timeout 1 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  die "$label did not become ready at $url"
}

need_cmd curl
need_cmd uv
need_cmd npm
need_cmd node

[[ -d "$BACKEND" ]] || die "backend directory not found: $BACKEND"
[[ -d "$FRONTEND" ]] || die "frontend directory not found: $FRONTEND"

if port_in_use "$API_HOST" "$API_PORT"; then
  if curl -fsS --connect-timeout 1 "http://${API_HOST}:${API_PORT}/api/v1/health" >/dev/null 2>&1; then
    die "ReMatch API already running on http://${API_HOST}:${API_PORT} — stop it first, or set REMATCH_API_PORT"
  fi
  die "port ${API_PORT} is already in use — set REMATCH_API_PORT to a free port (e.g. 8001)"
fi

if port_in_use "$FE_HOST" "$FE_PORT"; then
  die "port ${FE_PORT} is already in use — set REMATCH_FE_PORT to a free port (e.g. 5174)"
fi

API_PID=""
FE_PID=""
LOG_DIR="${TMPDIR:-/tmp}/rematch-local"
mkdir -p "$LOG_DIR"
API_LOG="$LOG_DIR/api.log"
FE_LOG="$LOG_DIR/frontend.log"

cleanup() {
  local code=$?
  trap - EXIT INT TERM
  if [[ -n "$FE_PID" ]] && kill -0 "$FE_PID" 2>/dev/null; then
    kill "$FE_PID" 2>/dev/null || true
    wait "$FE_PID" 2>/dev/null || true
  fi
  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
  exit "$code"
}
trap cleanup EXIT INT TERM

if [[ "$SKIP_SETUP" -eq 0 ]]; then
  log "Syncing backend dependencies"
  (cd "$BACKEND" && uv sync --locked --all-extras)

  if [[ ! -f "$BACKEND/.env" ]]; then
    log "Creating backend/.env from .env.example"
    cp "$BACKEND/.env.example" "$BACKEND/.env"
  fi

  log "Running migrations"
  (cd "$BACKEND" && uv run alembic upgrade head)

  log "Seeding synthetic catalogue (idempotent)"
  (cd "$BACKEND" && uv run rematch-seed)

  if [[ ! -d "$FRONTEND/node_modules" ]]; then
    log "Installing frontend dependencies"
    (cd "$FRONTEND" && npm ci)
  fi
fi

log "Starting API on http://${API_HOST}:${API_PORT}"
(
  cd "$BACKEND"
  uv run uvicorn app.main:app --reload --host "$API_HOST" --port "$API_PORT"
) >"$API_LOG" 2>&1 &
API_PID=$!

wait_http "http://${API_HOST}:${API_PORT}/api/v1/health" "API"

log "Starting frontend (API mode) on http://${FE_HOST}:${FE_PORT}"
(
  cd "$FRONTEND"
  export VITE_MATCH_DATA_SOURCE=api
  export VITE_API_BASE_URL="http://${API_HOST}:${API_PORT}"
  npm run dev:api -- --host "$FE_HOST" --port "$FE_PORT" --strictPort
) >"$FE_LOG" 2>&1 &
FE_PID=$!

wait_http "http://${FE_HOST}:${FE_PORT}/" "frontend"

cat <<EOF

ReMatch is running locally.

  Frontend:  http://${FE_HOST}:${FE_PORT}/
  API:       http://${API_HOST}:${API_PORT}/
  API docs:  http://${API_HOST}:${API_PORT}/docs
  Health:    http://${API_HOST}:${API_PORT}/api/v1/health

  Decision sample:
  http://${FE_HOST}:${FE_PORT}/matches/m-p8-harbor-eastbridge-002/decisions/m-p8-harbor-eastbridge-002-evt-001-pass

  Logs: $API_LOG
        $FE_LOG

Press Ctrl+C to stop both processes.
EOF

wait "$API_PID" "$FE_PID"
