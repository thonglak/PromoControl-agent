#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# deploy-prod.sh — Deploy wrapper สำหรับ host ที่ esbuild ติด seccomp
#   (CentOS 7 + libseccomp 2.3.1 บล็อก clone3 → ng build crash ในคอนเทนเนอร์)
#
# ทำให้ครบในคำสั่งเดียว:
#   1. git pull
#   2. build PHP image ปกติ (composer ไม่ติด seccomp)
#   3. build Angular dist ใน `docker run --security-opt seccomp=unconfined`
#   4. ประกอบ frontend image จาก dist (docker/frontend/Dockerfile.serve)
#   5. ส่งต่อให้ deploy.sh --no-pull --no-build (up + backup + migrate + health check)
#
# Usage:
#   ./deploy/deploy-prod.sh                 # full deploy ผ่าน workaround
#   ./deploy/deploy-prod.sh --no-migrate    # flag ใดๆ ส่งต่อให้ deploy.sh
#
# เมื่อ host แก้ libseccomp ≥ 2.4 แล้ว ใช้ ./deploy/deploy.sh ปกติได้เลย ไม่ต้องใช้ตัวนี้
# ดูที่มา: memory project_prod_esbuild_seccomp
# ─────────────────────────────────────────────────────────────

set -euo pipefail

# ครอบทั้งหมดใน main() เพื่อให้ bash parse จบก่อนรัน — กันสคริปต์เปลี่ยนระหว่าง git pull
main() {
    local SCRIPT_DIR PROJECT_ROOT ENV_FILE COMPOSE_FILE COMPOSE_CMD
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
    cd "$PROJECT_ROOT"

    ENV_FILE="$PROJECT_ROOT/deploy/.env.production"
    COMPOSE_FILE="$PROJECT_ROOT/docker-compose.prod.yml"
    COMPOSE_CMD="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE"

    local GREEN='\033[0;32m' BLUE='\033[0;34m' YELLOW='\033[1;33m' NC='\033[0m'
    log()  { echo -e "${BLUE}[deploy-prod]${NC} $*"; }
    ok()   { echo -e "${GREEN}[ok]${NC} $*"; }
    warn() { echo -e "${YELLOW}[warn]${NC} $*"; }

    # 1) Git pull
    log "Git pull…"
    git pull --ff-only origin "$(git rev-parse --abbrev-ref HEAD)" || warn "git pull ข้าม (อาจ detached/ไม่มี upstream)"

    # 2) Build PHP image ปกติ (composer ไม่ spawn thread → ไม่ติด seccomp)
    log "Build PHP image…"
    $COMPOSE_CMD build promo_php_prod
    ok "PHP image พร้อม"

    # 3) Build Angular dist ใน container ที่ปิด seccomp (docker run รองรับ --security-opt)
    log "Build Angular dist (seccomp unconfined, ~2 นาที)…"
    docker run --rm --security-opt seccomp=unconfined \
        -v "$PROJECT_ROOT/frontend":/app -w /app node:22-alpine \
        sh -c "npm ci --no-audit --no-fund && npx ng build --configuration=production"
    ok "dist พร้อม → frontend/dist/app/browser"

    # 4) ประกอบ frontend image จาก dist (ไม่มี RUN ที่ต้องสร้าง thread)
    log "Build frontend image (Dockerfile.serve)…"
    docker build -f docker/frontend/Dockerfile.serve -t promo_nginx:prod .
    ok "frontend image พร้อม"

    # 5) ส่งต่อ deploy.sh — ข้าม pull/build เพราะทำเองครบแล้ว
    log "→ deploy.sh (up + backup + migrate + health check)…"
    exec ./deploy/deploy.sh --no-pull --no-build "$@"
}

main "$@"
