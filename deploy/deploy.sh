#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# deploy.sh — Production deploy script (CentOS 7 + Docker)
#
# ขั้นตอน:
#   1. ตรวจสภาพแวดล้อม (docker, .env.production)
#   2. git pull (ถ้าไม่ skip ด้วย --no-pull)
#   3. docker compose build (ถ้าไม่ skip ด้วย --no-build)
#   4. docker compose up -d (recreate containers ที่เปลี่ยนแปลง)
#   5. รอ MySQL พร้อม
#   6. แสดง migration status ก่อนรัน
#   7. backup DB (ถ้าไม่ skip ด้วย --no-backup)
#   8. run migrations + แสดง status หลังรัน
#   9. health check
#
# Usage:
#   ./deploy/deploy.sh                 # full deploy + backup + migrate
#   ./deploy/deploy.sh --no-pull       # ข้าม git pull (deploy code ที่ checkout เอง)
#   ./deploy/deploy.sh --no-build      # ข้าม build (deploy เฉพาะ config)
#   ./deploy/deploy.sh --no-migrate    # ข้าม migration (และข้าม backup ด้วย)
#   ./deploy/deploy.sh --no-backup     # ข้าม backup DB ก่อน migrate
#   ./deploy/deploy.sh --migrate-only  # รันเฉพาะ migration บน stack ที่ run อยู่
#   ./deploy/deploy.sh --rollback HASH # rollback ไป commit hash ที่ระบุ
#
# Backup retention: เก็บเฉพาะ 10 ไฟล์ล่าสุดใน deploy/backups/
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
BACKUP_DIR="$PROJECT_ROOT/deploy/backups"
BACKUP_RETENTION=10

# ── Parse args ───────────────────────────────────────────────
DO_PULL=true
DO_BUILD=true
DO_UP=true
DO_MIGRATE=true
DO_BACKUP=true
MIGRATE_ONLY=false
ROLLBACK_HASH=""

while [ $# -gt 0 ]; do
    case "$1" in
        --no-pull)      DO_PULL=false; shift ;;
        --no-build)     DO_BUILD=false; shift ;;
        --no-migrate)   DO_MIGRATE=false; shift ;;
        --no-backup)    DO_BACKUP=false; shift ;;
        --migrate-only) MIGRATE_ONLY=true; shift ;;
        --rollback)     ROLLBACK_HASH="$2"; shift 2 ;;
        -h|--help)
            sed -n '2,30p' "$0"; exit 0 ;;
        *) error "ไม่รู้จัก option: $1"; exit 2 ;;
    esac
done

# --migrate-only: รันเฉพาะ step migration บน stack ที่ run อยู่
if [ "$MIGRATE_ONLY" = true ]; then
    DO_PULL=false
    DO_BUILD=false
    DO_UP=false
fi

# --no-migrate ก็ไม่ต้อง backup (ไม่มีอะไรจะ migrate)
if [ "$DO_MIGRATE" = false ]; then
    DO_BACKUP=false
fi

# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

# รัน mysqldump ใน container แล้ว gzip เก็บที่ host
backup_db() {
    mkdir -p "$BACKUP_DIR"
    local ts backup_file size
    ts=$(date +%Y%m%d_%H%M%S)
    backup_file="$BACKUP_DIR/backup_${ts}.sql.gz"

    log "Backup DB ก่อน migrate → $backup_file"
    if $COMPOSE_CMD exec -T promo_mysql_prod sh -c \
        'exec mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers "$MYSQL_DATABASE"' \
        2>/dev/null | gzip > "$backup_file"; then
        size=$(du -h "$backup_file" | cut -f1)
        success "Backup เสร็จ ($size)"
    else
        rm -f "$backup_file"
        error "Backup ล้มเหลว — หยุด deploy เพื่อความปลอดภัย"
        error "ตรวจ: $COMPOSE_CMD logs promo_mysql_prod"
        error "หรือใช้ --no-backup ถ้ายอมรับความเสี่ยง"
        exit 1
    fi

    # Retention: เก็บเฉพาะ N ไฟล์ล่าสุด
    local old_count
    old_count=$(ls -1t "$BACKUP_DIR"/backup_*.sql.gz 2>/dev/null | tail -n +$((BACKUP_RETENTION + 1)) | wc -l || echo 0)
    if [ "$old_count" -gt 0 ]; then
        ls -1t "$BACKUP_DIR"/backup_*.sql.gz | tail -n +$((BACKUP_RETENTION + 1)) | xargs -r rm -f
        log "ลบ backup เก่า $old_count ไฟล์ (เก็บ $BACKUP_RETENTION ล่าสุด)"
    fi
}

run_migrations() {
    log "ตรวจ migration status ก่อนรัน…"
    $COMPOSE_CMD exec -T promo_php_prod php spark migrate:status || warn "อ่าน status ไม่สำเร็จ — รันต่อ"

    if [ "$DO_BACKUP" = true ]; then
        backup_db
    else
        warn "ข้าม backup — ถ้า migrate ล้ม ต้องกู้คืนเอง"
    fi

    log "Run migrations…"
    if ! $COMPOSE_CMD exec -T promo_php_prod php spark migrate --all; then
        error "Migration ล้มเหลว — โปรดตรวจ logs และพิจารณา rollback DB จาก backup ใน $BACKUP_DIR"
        exit 1
    fi
    success "Migrations เสร็จ"

    log "ตรวจ migration status หลังรัน…"
    $COMPOSE_CMD exec -T promo_php_prod php spark migrate:status || true
}

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

# migrate-only: ตรวจว่า container ยังรันอยู่
if [ "$MIGRATE_ONLY" = true ]; then
    if ! $COMPOSE_CMD ps --services --status running 2>/dev/null | grep -q '^promo_php_prod$'; then
        error "promo_php_prod ไม่ได้รันอยู่ — ใช้ deploy เต็มก่อน หรือ docker compose up -d"
        exit 1
    fi
    if ! $COMPOSE_CMD ps --services --status running 2>/dev/null | grep -q '^promo_mysql_prod$'; then
        error "promo_mysql_prod ไม่ได้รันอยู่"
        exit 1
    fi
    success "Stack กำลังรันอยู่ — เข้าสู่ migrate-only mode"
else
    success "ผ่าน pre-flight"
fi

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

if [ "$DO_UP" = true ]; then
    log "Start / recreate containers…"
    $COMPOSE_CMD up -d --remove-orphans
    success "Containers up"
fi

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
# 7. Run migrations (with status + backup)
# ─────────────────────────────────────────────────────────────

if [ "$DO_MIGRATE" = true ]; then
    run_migrations
else
    warn "ข้าม migration ตาม --no-migrate"
fi

# ─────────────────────────────────────────────────────────────
# 8. Health check
# ─────────────────────────────────────────────────────────────

if [ "$MIGRATE_ONLY" = false ]; then
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
fi

# ─────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────

CURRENT_HASH=$(git rev-parse --short HEAD)
echo ""
if [ "$MIGRATE_ONLY" = true ]; then
    success "Migrate-only เสร็จ — commit: $CURRENT_HASH"
else
    success "Deploy สำเร็จ — commit: $CURRENT_HASH"
fi
echo ""
echo "Commands ที่ใช้บ่อย:"
echo "  ดู logs:          $COMPOSE_CMD logs -f"
echo "  restart:          $COMPOSE_CMD restart"
echo "  status:           $COMPOSE_CMD ps"
echo "  shell PHP:        $COMPOSE_CMD exec promo_php_prod sh"
echo "  shell DB:         $COMPOSE_CMD exec promo_mysql_prod mysql -u root -p"
echo "  migrate-only:     ./deploy/deploy.sh --migrate-only"
echo "  migration status: $COMPOSE_CMD exec promo_php_prod php spark migrate:status"
echo "  list backups:     ls -lh $BACKUP_DIR/"
