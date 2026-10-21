# Shared helpers for project scripts. Sourced, not executed.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

log() { printf '\033[1m[dialed]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[31m[dialed] %s\033[0m\n' "$*" >&2; exit 1; }

# Node 22 LTS (D-02). Prefer PATH; fall back to a user-local install (~/.local/share/node22).
ensure_node() {
  if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" != "22" ]]; then
    if [[ -x "$HOME/.local/share/node22/bin/node" ]]; then
      export PATH="$HOME/.local/share/node22/bin:$PATH"
    else
      die "Node 22 LTS is required (found $(node --version 2>/dev/null || echo none)). Install it (e.g. nvm install 22)."
    fi
  fi
}

# Xcode tools without changing the global xcode-select (needs sudo).
ensure_xcode_env() {
  if [[ -z "${DEVELOPER_DIR:-}" && "$(xcode-select -p 2>/dev/null)" == "/Library/Developer/CommandLineTools" && -d /Applications/Xcode.app ]]; then
    export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
  fi
}

load_env() {
  [[ -f "$ROOT/.env" ]] || die ".env missing — run ./scripts/bootstrap first."
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
}

compose() {
  docker compose -p dialed -f "$ROOT/infra/docker-compose.yml" -f "$ROOT/infra/docker-compose.dev.yml" --env-file "$ROOT/.env" "$@"
}

tsx() { "$ROOT/node_modules/.bin/tsx" "$@"; }

wait_for_postgres() {
  for _ in $(seq 1 60); do
    # TCP check: the init-time temporary server listens on the socket only, so this waits for the real one.
    if compose exec -T postgres pg_isready -h 127.0.0.1 -U dialed -d dialed >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  die "Postgres did not become ready."
}

# Starts the API in the background on $1; sets API_PID and API_URL. Caller must `trap stop_api EXIT`.
start_api() {
  local port="$1"
  export API_URL="http://127.0.0.1:${port}"
  PORT="$port" HOST=127.0.0.1 LOG_LEVEL="${API_LOG_LEVEL:-warn}" tsx apps/api/src/server.ts >"${API_LOG:-/dev/null}" 2>&1 &
  API_PID=$!
  for _ in $(seq 1 60); do
    curl -sf "$API_URL/readyz" >/dev/null 2>&1 && return 0
    kill -0 "$API_PID" 2>/dev/null || die "API exited during start (see ${API_LOG:-its output})."
    sleep 0.5
  done
  die "API did not become ready on $API_URL."
}
stop_api() { [[ -n "${API_PID:-}" ]] && kill "$API_PID" 2>/dev/null || true; }
