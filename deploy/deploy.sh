#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# deploy.sh — Production deploy script (CentOS 7 + Docker)
#
# ขั้นตอน:
#   1. ตรวจสภาพแวดล้อม (docker, .env.production)
#   2. git pull (ถ้าไม่ skip ด้วย --no-pull)
#   3. docker compose build (ถ้าไม่ skip ด้วย --no-build)
#   4. docker compose up -d (recreate containers ที่เปลี่ยนแปลง)
#   5. รอ MySQL พร้อม → run migrations
#   6. health check
#
# Usage:
#   ./deploy/deploy.sh                # full deploy
#   ./deploy/deploy.sh --no-pull      # ข้าม git pull (เช่น deploy code ที่ checkout เอง)
#   ./deploy/deploy.sh --no-build     # ข้าม build (เช่น deploy เฉพาะ config)
#   ./deploy/deploy.sh --no-migrate   # ข้าม migration
#   ./deploy/deploy.sh --rollback HASH  # rollback ไป commit hash ที่ระบุ
# ─────────────────────────────────────────────────────────────

set -euo pipefail

# ── Colors ───────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()    { echo -e "${BLUE}[deploy]${NC} $*"; }
warn()   { echo -e "${YELLOW}[warn]${NC} $*"; }
error()  { echo -e "${RED}[error]${NC} $*" >&2; }
success(){ echo -e "${GREEN}[ok]${NC} $*"; }

# ── Locate project root ─────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

ENV_FILE="$PROJECT_ROOT/deploy/.env.production"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.prod.yml"
COMPOSE_CMD="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE"

# ── Parse args ───────────────────────────────────────────────
DO_PULL=true
DO_BUILD=true
DO_MIGRATE=true
ROLLBACK_HASH=""

while [ $# -gt 0 ]; do
    case "$1" in
        --no-pull)    DO_PULL=false; shift ;;
        --no-build)   DO_BUILD=false; shift ;;
        --no-migrate) DO_MIGRATE=false; shift ;;
        --rollback)   ROLLBACK_HASH="$2"; shift 2 ;;
        -h|--help)
            sed -n '2,20p' "$0"; exit 0 ;;
        *) error "ไม่รู้จัก option: $1"; exit 2 ;;
    esac
done

# ─────────────────────────────────────────────────────────────
# 1. Pre-flight checks
# ─────────────────────────────────────────────────────────────

log "Pre-flight checks…"

if ! command -v docker >/dev/null 2>&1; then
    error "docker ไม่พบ — ติดตั้ง docker-ce ก่อน (https://docs.docker.com/engine/install/centos/)"
    exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
    error "docker compose v2 ไม่พบ — ติดตั้ง docker-compose-plugin"
    exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
    error "ไม่พบไฟล์ $ENV_FILE"
    error "คัดลอกจาก example: cp deploy/.env.production.example $ENV_FILE  แล้วแก้ค่าให้ตรง"
    exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
    error "ไม่พบไฟล์ $COMPOSE_FILE"
    exit 1
fi

success "ผ่าน pre-flight"

# ─────────────────────────────────────────────────────────────
# 2. Rollback (optional)
# ─────────────────────────────────────────────────────────────

if [ -n "$ROLLBACK_HASH" ]; then
    warn "กำลัง rollback ไปที่ commit $ROLLBACK_HASH"
    git fetch origin
    git checkout "$ROLLBACK_HASH"
    DO_PULL=false
fi

# ─────────────────────────────────────────────────────────────
# 3. Git pull
# ─────────────────────────────────────────────────────────────

if [ "$DO_PULL" = true ]; then
    log "Git pull…"
    BEFORE_HASH=$(git rev-parse HEAD)
    git pull --ff-only origin "$(git rev-parse --abbrev-ref HEAD)"
    AFTER_HASH=$(git rev-parse HEAD)

    if [ "$BEFORE_HASH" = "$AFTER_HASH" ]; then
        log "ไม่มี commit ใหม่ — code ล่าสุดอยู่แล้ว"
    else
        success "Pull เสร็จ ($BEFORE_HASH → $AFTER_HASH)"
    fi
fi

# ─────────────────────────────────────────────────────────────
# 4. Build images
# ─────────────────────────────────────────────────────────────

if [ "$DO_BUILD" = true ]; then
    log "Build images (อาจใช้เวลา 1-3 นาทีครั้งแรก)…"
    $COMPOSE_CMD build --pull
    success "Build เสร็จ"
fi

# ─────────────────────────────────────────────────────────────
# 5. Up containers
# ─────────────────────────────────────────────────────────────

log "Start / recreate containers…"
$COMPOSE_CMD up -d --remove-orphans
success "Containers up"

# ─────────────────────────────────────────────────────────────
# 6. Wait for MySQL ready
# ─────────────────────────────────────────────────────────────

log "รอ MySQL พร้อม…"
for i in $(seq 1 60); do
    if $COMPOSE_CMD exec -T promo_mysql_prod mysqladmin ping -h localhost --silent 2>/dev/null; then
        success "MySQL พร้อม (รอ ${i}s)"
        break
    fi
    if [ "$i" -eq 60 ]; then
        error "MySQL ไม่พร้อมหลังรอ 60s — ตรวจ: $COMPOSE_CMD logs promo_mysql_prod"
        exit 1
    fi
    sleep 1
done

# ─────────────────────────────────────────────────────────────
# 7. Run migrations
# ─────────────────────────────────────────────────────────────

if [ "$DO_MIGRATE" = true ]; then
    log "Run migrations…"
    $COMPOSE_CMD exec -T promo_php_prod php spark migrate --all
    success "Migrations เสร็จ"
fi

# ─────────────────────────────────────────────────────────────
# 8. Health check
# ─────────────────────────────────────────────────────────────

HTTP_PORT=$(grep -E '^HTTP_PORT=' "$ENV_FILE" | cut -d= -f2 || echo "8580")
HEALTH_URL="http://localhost:${HTTP_PORT:-8580}/"

log "Health check $HEALTH_URL …"
sleep 2
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" --max-time 10 || echo "000")

if [[ "$HTTP_CODE" =~ ^(200|301|302)$ ]]; then
    success "Health check ผ่าน (HTTP $HTTP_CODE)"
else
    warn "Health check คืน HTTP $HTTP_CODE — ตรวจ logs: $COMPOSE_CMD logs promo_nginx_prod"
fi

# ─────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────

CURRENT_HASH=$(git rev-parse --short HEAD)
echo ""
success "Deploy สำเร็จ — commit: $CURRENT_HASH"
echo ""
echo "Commands ที่ใช้บ่อย:"
echo "  ดู logs:    $COMPOSE_CMD logs -f"
echo "  restart:    $COMPOSE_CMD restart"
echo "  status:     $COMPOSE_CMD ps"
echo "  shell PHP:  $COMPOSE_CMD exec promo_php_prod sh"
echo "  shell DB:   $COMPOSE_CMD exec promo_mysql_prod mysql -u root -p"
