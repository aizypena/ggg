#!/usr/bin/env bash
#
# P5.12 — End-to-end live-propagation verification (issue #81).
#
# Boots the local docker-compose Postgres + Redis, applies migrations, then runs
# the real Phase 5 wiring (subscriber reconcile → Redis → SSE) and asserts an
# on-chain event propagates to the UI feed without a refresh. Optionally boots
# the web server to exercise the real SSE HTTP endpoint, and optionally polls a
# live Testnet contract.
#
# Usage:
#   scripts/verify-live-propagation.sh                 # legs A+B (Postgres + Redis)
#   scripts/verify-live-propagation.sh --with-web      # + leg C (real SSE over HTTP)
#   scripts/verify-live-propagation.sh --onchain --contract-id C... # + leg D (Testnet poll)
#   scripts/verify-live-propagation.sh --keep          # leave Docker running afterwards
#
# Env: reads apps/web/.env if present; otherwise writes .env.verify with
# docker-local DATABASE_URL/REDIS_URL + Testnet RPC/Horizon + throwaway secrets.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WITH_WEB=0; KEEP=0; ONCHAIN=""; CONTRACT_ID="${CONTRACT_ID:-}"
for arg in "$@"; do
  case "$arg" in
    --with-web) WITH_WEB=1 ;;
    --keep) KEEP=1 ;;
    --onchain) ONCHAIN="--onchain" ;;
    --contract-id=*) CONTRACT_ID="${arg#*=}" ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

c() { printf '\033[%sm%s\033[0m\n' "$1" "$2"; }
info() { c "1;36" "▶ $*"; }
ok()   { c "1;32" "✓ $*"; }
die()  { c "1;31" "✗ $*"; exit 1; }

# Isolated stack so we never collide with (or stop) a dev compose project or
# anything else already bound to 5432/6379. Ports are overridable.
PROJECT="ggg-verify"
PG_PORT="${VERIFY_PG_PORT:-55432}"
REDIS_PORT="${VERIFY_REDIS_PORT:-56379}"
COMPOSE_FILE=".verify-compose.yml"

WEB_PID=""
cleanup() {
  [ -n "$WEB_PID" ] && kill "$WEB_PID" 2>/dev/null || true
  if [ "$KEEP" -eq 0 ]; then
    info "Tearing down isolated Docker stack ($PROJECT)"
    docker compose -p "$PROJECT" -f "$COMPOSE_FILE" down -v >/dev/null 2>&1 || true
    rm -f "$COMPOSE_FILE"
  else
    c "1;33" "↳ --keep set: stack '$PROJECT' left running (pg :$PG_PORT, redis :$REDIS_PORT)"
  fi
}
trap cleanup EXIT

# ── 1. preflight ─────────────────────────────────────────────────────────────
info "Preflight"
command -v docker  >/dev/null || die "docker not found"
command -v node    >/dev/null || die "node not found"
command -v pnpm    >/dev/null || die "pnpm not found"
docker info >/dev/null 2>&1 || die "Docker daemon not running"
ok "docker / node $(node -v) / pnpm $(pnpm -v)"

# ── 2. environment ───────────────────────────────────────────────────────────
# Same variable names as the app (apps/web/.env.example). Prefer a real .env;
# otherwise synthesize .env.verify so the run is self-contained.
ENV_FILE="apps/web/.env"
if [ ! -f "$ENV_FILE" ]; then
  ENV_FILE=".env.verify"
  if [ ! -f "$ENV_FILE" ]; then
    info "No apps/web/.env — writing $ENV_FILE (docker-local + Testnet defaults)"
    SECRET="verify-secret-$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))')"
    cat > "$ENV_FILE" <<EOF
NODE_ENV=development
APP_URL=http://localhost:3000
SESSION_SECRET=${SECRET}
CSRF_SECRET=${SECRET}
DATABASE_URL=postgresql://ggg:ggg@localhost:5432/ggg
REDIS_URL=redis://localhost:6379
ADMIN_USERNAME=admin
ADMIN_PASSWORD=verify-admin-pw
STELLAR_NETWORK=testnet
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
HORIZON_URL=https://horizon-testnet.stellar.org
NETWORK_PASSPHRASE=Test SDF Network ; September 2015
POLL_INTERVAL_MS=5000
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=ggg-uploads
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
EOF
  fi
fi
# Load literally (don't `source`): values like NETWORK_PASSPHRASE contain spaces
# and ';', which the shell would otherwise try to execute.
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in ''|\#*) continue ;; esac
  export "${line%%=*}=${line#*=}"
done < "$ENV_FILE"
# Subscriber needs POLL_INTERVAL_MS present even with a real .env.
export POLL_INTERVAL_MS="${POLL_INTERVAL_MS:-5000}"
# Always point DB/cache at THIS run's isolated stack, regardless of what the env
# file said — the verification owns disposable data and must never touch a dev DB.
export DATABASE_URL="postgresql://ggg:ggg@localhost:${PG_PORT}/ggg"
export REDIS_URL="redis://localhost:${REDIS_PORT}"
ok "env loaded from $ENV_FILE (DB/cache forced to isolated stack)"

# ── 3. boot Docker (isolated postgres + redis) ───────────────────────────────
# Mirrors docker-compose.yml's postgres:17 + redis:7, but on dedicated host
# ports under a separate compose project so it can't clash with the dev stack.
cat > "$COMPOSE_FILE" <<EOF
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: ggg
      POSTGRES_PASSWORD: ggg
      POSTGRES_DB: ggg
    ports: ["${PG_PORT}:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ggg -d ggg"]
      interval: 3s
      timeout: 5s
      retries: 20
  redis:
    image: redis:7
    ports: ["${REDIS_PORT}:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 3s
      timeout: 5s
      retries: 20
EOF
info "Starting isolated docker stack '$PROJECT' (pg :$PG_PORT, redis :$REDIS_PORT)"
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d >/dev/null
for svc in postgres redis; do
  printf "  waiting for %s" "$svc"
  status=starting
  for _ in $(seq 1 40); do
    cid="$(docker compose -p "$PROJECT" -f "$COMPOSE_FILE" ps -q $svc 2>/dev/null)"
    status="$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo starting)"
    [ "$status" = "healthy" ] && { printf " healthy\n"; break; }
    printf "."; sleep 2
  done
  [ "$status" = "healthy" ] || die "$svc did not become healthy"
done
ok "postgres + redis healthy"

# ── 4. prisma generate + migrate ─────────────────────────────────────────────
info "prisma generate + migrate deploy"
pnpm --filter web exec prisma generate >/dev/null
pnpm --filter web exec prisma migrate deploy
ok "schema applied (incl. SubscriberCursor + ContractEvent unique)"

# ── 5. optional: boot the web server for the real SSE HTTP leg ───────────────
WEB_FLAG=""
if [ "$WITH_WEB" -eq 1 ]; then
  # `next dev` (not build) on purpose: it compiles routes on demand, so the SSE
  # route's isolated module graph (api/db/redis) builds without dragging in the
  # full app (the contract-client workspace + argon2 client-bundle paths that a
  # production `next build` compiles eagerly).
  info "Starting web (next dev) for SSE-over-HTTP leg C"
  pnpm --filter web exec next dev >/tmp/verify-web.log 2>&1 &
  WEB_PID=$!
  printf "  waiting for http://localhost:3000"
  for _ in $(seq 1 60); do
    if curl -fsS -o /dev/null "http://localhost:3000/api/tournaments/warmup/events?fallback=poll" 2>/dev/null; then
      printf " up\n"; READY=1; break
    fi
    printf "."; sleep 1
  done
  [ "${READY:-0}" = "1" ] || { tail -25 /tmp/verify-web.log; die "web server did not come up"; }
  # Warm the *streaming* subscribe path too: ioredis raises a one-shot
  # "Connection in subscriber mode" ready-check race on the very first
  # duplicate()+subscribe() per process. A throwaway SSE connection absorbs it
  # so the assertion connection (and the first real user, after auto-reconnect)
  # subscribes cleanly.
  curl -N -sS --max-time 3 "http://localhost:3000/api/tournaments/warmup/events" >/dev/null 2>&1 || true
  WEB_FLAG="--web-url=http://localhost:3000"
  ok "web server up + SSE route warmed (logs: /tmp/verify-web.log)"
fi

# ── 6. run the assertion core ────────────────────────────────────────────────
ONCHAIN_FLAG=""
[ -n "$ONCHAIN" ] && ONCHAIN_FLAG="$ONCHAIN"
[ -n "$CONTRACT_ID" ] && export CONTRACT_ID
info "Running propagation checker"
pnpm --filter subscriber exec tsx scripts/verify-propagation.ts $WEB_FLAG $ONCHAIN_FLAG

ok "verification finished"
