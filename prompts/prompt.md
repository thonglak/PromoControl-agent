Check if Agent Team is enabled, create team by Agent Teams not subagents.
Create an agent team to build PromoControl, a Promotion & Budget Management
System for real estate with authentication, master data management,
and budget engine.

Tech stack: CodeIgniter 4 + firebase/php-jwt + MySQL (backend),
Angular 21 + Angular Material 21 + Tailwind CSS 3 (frontend),
Docker Compose (5 services).

Spawn 3 teammates with plan approval:

1. backend: Write API spec to docs/04-api-spec.md first (exact paths,
   request/response shapes, example curl). Use CodeIgniter 4 with JWT auth.
   Read docs/03-database-schema.md, docs/08-authentication.md, docs/07-master-data.md.
   Set up database migrations, create AuthService and master data services
   (ProjectService, HouseModelService, UnitService), and implement all endpoints
   exactly as documented. Use worktree isolation.
   IMPORTANT: Write api-spec.md FIRST, then message frontend
   AND qa that the contract is ready.

   API endpoints to include:
   Auth:
   - POST /api/auth/setup (initial admin setup)
   - POST /api/auth/login (email, password → user + JWT token)
   - POST /api/auth/refresh (refresh token → new JWT)
   - POST /api/auth/logout (logout, revoke refresh token)
   - GET /api/auth/me (get current user from JWT)
   Projects:
   - GET /api/projects (list user's projects with filtering)
   - GET /api/projects/:id (project detail with budget summary)
   - POST /api/projects (create project, auto-create number series)
   - PUT /api/projects/:id (update project)
   - DELETE /api/projects/:id (soft delete project)
   House Models:
   - GET /api/house-models?project_id= (list with pagination)
   - GET /api/house-models/:id (house model detail)
   - POST /api/house-models (create)
   - PUT /api/house-models/:id (update)
   - DELETE /api/house-models/:id (soft delete)
   Units:
   - GET /api/units?project_id=&house_model_id= (list)
   - GET /api/units/:id (unit detail with budget summary)
   - POST /api/units (create unit)
   - PUT /api/units/:id (update unit)
   - DELETE /api/units/:id (soft delete unit)

2. frontend: Build Angular UI with these pages. Use worktree isolation.
   MUST read docs/04-api-spec.md and docs/05-frontend-spec.md for exact
   endpoint paths and UI specifications before building.
   Wait for backend to message that spec is ready.

   Pages/Components:
   - LoginPage (public, Thai UI)
   - InitialSetupPage (first-run admin setup)
   - DashboardPage (after auth — project selection)
   - ProjectListComponent + ProjectFormDialog (CRUD projects)
   - HouseModelListComponent + HouseModelFormDialog (CRUD house models)
   - UnitListComponent + UnitFormDialog (CRUD units)
   - Navigation with auth state (show Login or user name + Logout)
   - Use Angular Material 21 + Tailwind CSS 3, Thai language for UI labels

3. qa (Opus): Do NOT use worktree isolation — qa must test merged code.
   Write integration tests first (Phase A using PHPUnit),
   then E2E tests (Phase B using Playwright).
   Read docs/04-api-spec.md for endpoint paths — don't guess.
   Phase A: API integration tests — start after backend messages.
   Phase B: E2E tests — start ONLY after I (Lead) confirm worktrees
   are merged.

   E2E flows to test:
   - Initial setup: create first admin user
   - Login → Logout
   - Create project (verify auto-generated number series)
   - Create house model and units
   - Project isolation (user can only access own projects)
   - Edit and delete master data with proper authorization

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