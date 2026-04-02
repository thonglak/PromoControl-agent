# Development Rules

## Business Logic Rules

1. Do not change profit calculation formulas.
2. Promotion category must be separate from budget source.
3. All budget usage must generate budget movement entries.
4. Budget balances must always derive from ledger movements.
5. Never overwrite balances directly.
6. Business logic must exist in service classes.
7. Controllers should only handle HTTP requests.

## Language Convention

| ประเภท | ภาษา | ตัวอย่าง |
|--------|------|----------|
| Code (variables, functions, classes) | English | `calculateProfit()`, `budgetRemaining`, `SalesEntryComponent` |
| Database (table names, columns) | English | `budget_movements`, `effective_category`, `base_price` |
| API paths & JSON keys | English | `/api/sales-transactions`, `"net_price"` |
| Git commits & branch names | English | `feat/sales-entry`, `fix: budget calculation` |
| Business logic comments | ไทย | `// คำนวณกำไรจาก effective_category` |
| UI labels & placeholders | ไทย | `"ราคาขาย"`, `"งบประมาณคงเหลือ"` |
| Error messages (user-facing) | ไทย | `"ไม่สามารถลบยูนิตที่มีรายการขายได้"` |
| Validation messages | ไทย | `"กรุณากรอกรหัสโครงการ"` |
| Documentation & specs | ไทย | Business rules, use cases, test scenarios |

---

## Environment

| Service      | URL                        | Notes                        |
|--------------|----------------------------|------------------------------|
| App (nginx)  | http://localhost:8080      | Reverse proxy frontend + API |
| Frontend     | http://localhost:8080/     | Angular dev server via nginx |
| API          | http://localhost:8080/api/ | CodeIgniter 4 PHP-FPM        |
| phpMyAdmin   | http://localhost:8081      | MySQL GUI                    |
| MySQL        | localhost:3309             | User: promo_user / promo_pass|

> **Note:** Host machine has Node.js v15 — do NOT run `npm` or `ng` directly on the host.
> All Node commands must be run inside the `promo_frontend` container or via `docker run node:22-alpine`.

---

## Docker Compose — Start / Stop

```bash
# Start all services (detached)
docker compose up -d

# Stop all services
docker compose down

# Restart a single service
docker compose restart promo_frontend

# Force recreate a single service (after config change)
docker compose up -d --force-recreate promo_frontend

# View live logs
docker compose logs -f promo_frontend
docker compose logs -f promo_php

# Check container status
docker compose ps
```

---

## Frontend — Angular 21

### Dev server (via Docker Compose)
The `promo_frontend` container runs `ng serve` automatically on startup.
No manual command needed — just run `docker compose up -d`.

```bash
# Watch live build logs
docker compose logs -f promo_frontend

# Rebuild from scratch (clears node_modules cache)
docker compose rm -sf promo_frontend
docker compose up -d promo_frontend
```

### Production build (one-off, no Docker Compose)
Use this to verify the production bundle compiles with zero errors:

```bash
docker run --rm \
  -v /Volumes/TJ/mkt-v3/frontend:/app \
  -w /app \
  node:22-alpine \
  sh -c "npm install && npx ng build"
```

Output goes to `frontend/dist/app/`.

### Type-check only (no emit)
```bash
docker run --rm \
  -v /Volumes/TJ/mkt-v3/frontend:/app \
  -w /app \
  node:22-alpine \
  sh -c "npm install && npx tsc --noEmit -p tsconfig.app.json"
```

### Angular coding rules
- Use standalone components only (`standalone: true`)
- Use Angular 21 control flow: `@if`, `@for`, `@switch` — NOT `*ngIf`, `*ngFor`
- Use `track item` in `@for` — NOT `track $index`
- Use `signal()`, `computed()`, `effect()` for state
- Use `ReactiveFormsModule` or `FormsModule` for forms
- Icons: `<app-icon name="...">` — NOT `mat-icon` or `pi pi-*`
- CSS: Tailwind utility classes only — no inline styles, no component CSS unless necessary
- `allowedHosts: ["all"]` is set in `angular.json` — required for nginx proxy

---

## Backend — CodeIgniter 4

### Run database migrations
```bash
docker exec promo_php php /var/www/backend/spark migrate
```

### Rollback migrations
```bash
docker exec promo_php php /var/www/backend/spark migrate:rollback
```

### Run PHP unit tests
```bash
docker exec promo_php php /var/www/backend/vendor/bin/phpunit \
  --configuration /var/www/backend/phpunit.xml.dist
```

### Run PHP CS Fixer (code style)
```bash
docker exec promo_php php /var/www/backend/vendor/bin/php-cs-fixer fix \
  /var/www/backend/app --dry-run --diff
```

### Composer install / update
```bash
docker exec promo_php composer install --working-dir=/var/www/backend
docker exec promo_php composer update --working-dir=/var/www/backend
```

### Backend coding rules
- Business logic in `app/Services/` — controllers are HTTP-only
- Balance must always be derived from `SUM(budget_movements WHERE status='approved')`
- Never update balance columns directly
- `effective_category` drives all calculations — not `promotion_category`
- `budget_source_type` must be tracked separately from promotion category
- LSP errors in PHP files (Undefined type `CodeIgniter\...`) are false positives
  from missing CI4 stubs — they do NOT affect runtime

### Authentication rules
- JWT secret stored in `.env` as `JWT_SECRET` — never commit to version control
- Use `firebase/php-jwt` library for token encode/decode
- `JwtAuthFilter` applied to all `/api/*` routes except `/api/auth/login`, `/api/auth/refresh`, `/api/auth/check-setup`, `/api/auth/setup`
- `RoleFilter` applied per-route for role-based access control
- All API queries must filter by user's `project_ids` — never trust client-side filtering
- Write operations (POST/PUT/DELETE) must check `access_level` of the current project — reject if `view`
- `/api/auth/setup` ใช้ได้ครั้งเดียวเมื่อ users table ว่างเท่านั้น
- Passwords hashed with bcrypt (cost factor: 12)
- Failed login lockout: 5 attempts → 15-minute lock
- On password change: revoke all refresh tokens for that user
- Never log or return `password_hash` or `token_hash` in API responses

---

## Nginx — Routing

```
GET  /api/*  → PHP-FPM (promo_php:9000) via /var/www/backend/public
GET  /*      → Angular dev server (promo_frontend:4200)
```

Config: `docker/nginx/default.conf`

---

## Common Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| 502 Bad Gateway | `promo_frontend` container exited | `docker compose up -d promo_frontend` |
| ng serve exits immediately | Unsupported CLI flag passed | Use `--allowed-hosts all`, not `--disable-host-check` |
| CSS not updating | Tailwind JIT cache | Restart frontend container |
| API 404 | Wrong route prefix | All API routes must start with `/api/` |
| DB connection error | MySQL not ready | Wait ~10s after `docker compose up`, then retry |
| PHP changes not reflected | Opcache | `docker compose restart promo_php` |
