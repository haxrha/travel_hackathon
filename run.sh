#!/usr/bin/env bash
# WAYPORT — one-command local runner
# Usage: ./run.sh          # start everything
#        ./run.sh setup    # install + generate only
#        ./run.sh build    # production build
#        ./run.sh start    # production server
#        ./run.sh db       # prisma generate + push (needs DATABASE_URL)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PORT="${PORT:-3000}"
MODE="${1:-dev}"

banner() {
  echo ""
  echo "╔══════════════════════════════════════════╗"
  echo "║           WAYPORT Travel OS              ║"
  echo "╚══════════════════════════════════════════╝"
  echo ""
}

ensure_env() {
  if [[ ! -f .env.local ]]; then
    echo "→ Creating .env.local from .env.example"
    cp .env.example .env.local
    echo "  Fill in Clerk + DATABASE_URL (+ optional Tavily/Stay22/ElevenLabs) in .env.local"
  fi
}

ensure_deps() {
  if [[ ! -d node_modules ]] || [[ ! -x node_modules/.bin/next ]]; then
    echo "→ Installing dependencies…"
    npm install
  fi
}

ensure_prisma() {
  echo "→ Generating Prisma client…"
  ./node_modules/.bin/prisma generate >/dev/null
}

kill_port() {
  local pids
  pids="$(lsof -ti tcp:"$PORT" 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    echo "→ Freeing port $PORT (pids: $pids)"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 0.5
  fi
}

run_setup() {
  ensure_env
  ensure_deps
  ensure_prisma
  echo "✓ Setup complete"
}

run_db() {
  ensure_env
  ensure_deps
  ensure_prisma
  if [[ -z "${DATABASE_URL:-}" ]] && ! grep -qE '^DATABASE_URL=.+' .env.local 2>/dev/null; then
    echo "⚠ DATABASE_URL not set — skip migrate/push"
    return 0
  fi
  # Load DATABASE_URL for this shell if present in .env.local
  set -a
  # shellcheck disable=SC1091
  source <(grep -E '^(DATABASE_URL|DIRECT_URL)=' .env.local | sed 's/\r$//')
  set +a
  echo "→ Pushing schema to database…"
  ./node_modules/.bin/prisma db push
}

run_dev() {
  run_setup
  kill_port
  echo "→ Starting WAYPORT on http://localhost:$PORT"
  echo "  Landing:  http://localhost:$PORT/"
  echo "  App:      http://localhost:$PORT/app"
  echo "  Concierge http://localhost:$PORT/app/concierge"
  echo ""
  exec ./node_modules/.bin/next dev --port "$PORT"
}

run_build() {
  run_setup
  echo "→ Building production bundle…"
  ./node_modules/.bin/next build
}

run_start() {
  ensure_env
  ensure_deps
  ensure_prisma
  kill_port
  echo "→ Starting production server on http://localhost:$PORT"
  exec ./node_modules/.bin/next start --port "$PORT"
}

banner

case "$MODE" in
  setup) run_setup ;;
  db)    run_db ;;
  build) run_build ;;
  start) run_start ;;
  dev|"") run_dev ;;
  *)
    echo "Unknown mode: $MODE"
    echo "Usage: ./run.sh [dev|setup|db|build|start]"
    exit 1
    ;;
esac
