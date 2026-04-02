# Ch6 Project: PromoControl — สร้าง Promotion System ด้วย 3 Teammates

## Step 0: ติดตั้ง Skills

```bash
# Clone Anthropic's official skills repo (ถ้ายังไม่มี)
git clone https://github.com/anthropics/skills.git /tmp/skills

# Copy skills ที่ใช้ในโปรเจกต์นี้
mkdir -p .claude/skills
cp -r /tmp/skills/skills/frontend-design .claude/skills/
cp -r /tmp/skills/skills/webapp-testing .claude/skills/
```

- `frontend-design` → ใช้กับ frontend agent (สร้าง UI ที่ production-grade)
- `webapp-testing` → ใช้กับ qa agent (Playwright helpers จัดการ server อัตโนมัติ)

## Step 1: ทดสอบแต่ละ Agent แยก

```bash
# ทดสอบ backend — สร้าง spec + types + API
claude --agent backend
> Read docs/04-api-spec.md and docs/03-database-schema.md first.
> Then create shared types in app/Config/Types.php for auth response.
> Implement the auth API endpoints (setup, login, refresh, logout, me).

# ทดสอบ frontend — สร้าง UI components
claude --agent frontend
> Read docs/04-api-spec.md and docs/05-frontend-spec.md first.
> Then build LoginPage and InitialSetupPage Angular components
> with API client service.

# ทดสอบ qa — เขียน tests
claude --agent qa
> Read docs/04-api-spec.md and write integration tests for the
> auth API endpoints (setup, login, refresh, logout).
```

## Step 2: รวมเป็นทีมด้วย Agent Teams

```bash
tmux new -s promocontrol
claude
```

### Prompt สร้างทีม:

```
Check if Agent Team is enabled, create team by Agent Teams not subagents.
Create an agent team to build PromoControl, a Promotion & Budget Management
System for real estate with authentication, master data, and budget engine.

Tech stack: CodeIgniter 4 + firebase/php-jwt + MySQL (backend),
Angular 21 + Angular Material 21 + Tailwind CSS 3 (frontend),
Docker Compose (5 services).

Spawn 3 teammates with Plan Approval:

1. backend: Write API spec to docs/04-api-spec.md first (exact paths,
   request/response shapes, example curl). Use CodeIgniter 4 with JWT auth.
   Read docs/03-database-schema.md, docs/08-authentication.md, docs/07-master-data.md.
   Implement AuthService with: setup, login, refresh, logout, me endpoints.
   Then implement ProjectController, HouseModelController, UnitController
   for master data CRUD. Create migrations per docs/03-database-schema.md.
   Use worktree isolation.
   IMPORTANT: Write api-spec.md FIRST, then message frontend AND qa
   that the contract is ready.

   API endpoints to include:
   Auth:
   - POST /api/auth/setup (initial admin setup)
   - POST /api/auth/login (email, password → user + JWT token)
   - POST /api/auth/refresh (refresh token)
   - POST /api/auth/logout (logout)
   - GET /api/auth/me (get current user from JWT)
   Projects:
   - GET /api/projects (list user's projects)
   - GET /api/projects/:id (project detail)
   - POST /api/projects (create project, auto-create number series)
   - PUT /api/projects/:id (update project)
   - DELETE /api/projects/:id (delete project)
   House Models:
   - GET /api/house-models?project_id= (list)
   - GET /api/house-models/:id (detail)
   - POST /api/house-models (create)
   - PUT /api/house-models/:id (update)
   - DELETE /api/house-models/:id (delete)
   Units:
   - GET /api/units?project_id=&house_model_id= (list)
   - GET /api/units/:id (detail)
   - POST /api/units (create)
   - PUT /api/units/:id (update)
   - DELETE /api/units/:id (delete)

2. frontend: Build Angular UI with these pages. Use worktree isolation.
   MUST read docs/04-api-spec.md, docs/05-frontend-spec.md for exact endpoint paths
   and UI specs before building. Wait for backend to message that spec is ready.

   Pages/Components:
   - LoginPage (public, Thai language)
   - InitialSetupPage (first-run admin setup)
   - DashboardPage (after auth)
   - ProjectListComponent + ProjectFormDialog (CRUD projects)
   - HouseModelListComponent + HouseModelFormDialog (CRUD house models)
   - UnitListComponent + UnitFormDialog (CRUD units)
   - Navigation with auth state (show Login or user name + Logout)
   - Use Angular Material 21 + Tailwind CSS 3

3. qa (Opus): Do NOT use worktree isolation — qa must test merged code.
   Write integration tests first (Phase A), then E2E tests (Phase B).
   Read docs/04-api-spec.md for endpoint paths — don't guess.
   Phase A: API integration tests (PHPUnit) — start after backend messages.
   Phase B: E2E tests (Playwright) — start ONLY after I (Lead) confirm
   worktrees are merged.

   E2E flows to test:
   - Initial setup (create admin user)
   - Login → Logout
   - Create project, house model, unit
   - Edit and delete master data
   - Project isolation (user can only access own projects)

IMPORTANT RULES:
- Do NOT fix code yourself — ALWAYS use teammates to fix
- REUSE existing teammates: if idle, send message instead of spawning new
- If qa tests fail, use backend/frontend to fix, then qa again

Coordination:
- backend writes docs/04-api-spec.md → messages frontend AND qa
- frontend reads api-spec.md for exact paths → builds Angular UI
- qa reads api-spec.md → writes API integration tests (Phase A)
- After backend + frontend done: I merge worktrees
- After merge: I tell qa to start E2E tests (Phase B)
- If tests fail → use backend/frontend to fix → qa again
- Do NOT finish until all tests pass
```

> **Key Point:** docs/04-api-spec.md เป็น single source of truth สำหรับ API contract
> ป้องกันปัญหา frontend เรียก path ไม่ตรงกับ backend
> QA แบ่งเป็น 2 phases — integration tests ก่อน merge, E2E หลัง merge
> Auth ครบ flow: setup → login → JWT → protected routes + project access control

## Step 3: สังเกต Coordination

สิ่งที่ควรเกิดขึ้น:
- backend อ่าน docs ก่อน เขียน docs/04-api-spec.md + migrations
- backend ส่ง message ถึง frontend + qa: "API spec ready"
- frontend อ่าน api-spec.md → สร้าง API client + auth pages + master data UI
- qa อ่าน api-spec.md → เขียน integration tests (รวม auth + master data)
- Lead merge worktrees หลัง backend + frontend เสร็จ
- Lead บอก qa ให้เริ่ม E2E tests หลัง merge
- qa รัน E2E: setup → login → create projects/models/units
- ถ้า tests fail → Lead ใช้ backend/frontend แก้ → qa อีกรอบ

## Step 4: ตรวจผลลัพธ์

- `docs/04-api-spec.md` — API contract (auth + master data endpoints)
- `app/Config/Types.php` — shared type definitions
- `app/Database/Migrations/` — database schema migrations
- `app/Services/AuthService.php` + `app/Services/ProjectService.php` etc. — backend logic
- `src/app/features/auth/` + `src/app/features/master-data/` — Angular UI components
- `tests/Feature/` — API integration tests (PHPUnit)
- `tests/e2e/` — E2E tests (Playwright)
- ทุก worktree merge สำเร็จ + tests ผ่าน
