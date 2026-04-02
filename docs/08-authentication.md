# Authentication & Authorization (JWT)

## Purpose

ระบบ Authentication ใช้ JWT (JSON Web Token) สำหรับยืนยันตัวตนผู้ใช้งาน และควบคุมสิทธิ์การเข้าถึงตาม Role-based Access Control (RBAC)

---

## Technology

- Backend: CodeIgniter 4 + `firebase/php-jwt` library
- Frontend: Angular 21 + `HttpInterceptor` for auto-attach token
- Token format: JWT (HS256)
- Storage: `localStorage` (access token) + `httpOnly cookie` (refresh token)

---

## JWT Token Structure

### Access Token

- Algorithm: HS256
- Expiry: 60 minutes
- Payload:

```json
{
  "sub": 1,
  "email": "user@example.com",
  "name": "สมชาย ใจดี",
  "role": "sales",
  "project_ids": [1, 3, 5],
  "project_access": { "1": "edit", "3": "edit", "5": "view" },
  "iat": 1711000000,
  "exp": 1711003600
}
```

### Refresh Token

- Algorithm: HS256
- Expiry: 30 days
- Stored in `httpOnly` cookie (secure, SameSite=Strict)
- Used to obtain new access token without re-login

---

## User Roles

| Role        | Description                           | Permissions                                              |
|-------------|---------------------------------------|----------------------------------------------------------|
| `admin`     | System administrator                  | Full access to all modules, all projects                 |
| `manager`   | Project manager / budget approver     | View/approve budgets, view reports, manage promotions    |
| `sales`     | Sales staff                           | Sales entry, view own sales, view unit info              |
| `finance`   | Finance team                          | View reports, budget movements, read-only promotions     |
| `viewer`    | Read-only access                      | View dashboards and reports only                         |

---

## Permission Matrix

| Feature                    | admin | manager | sales | finance | viewer |
|----------------------------|-------|---------|-------|---------|--------|
| Project CRUD               | ✅    | ❌      | ❌    | ❌      | ❌     |
| House Model CRUD           | ✅    | ✅      | ❌    | ❌      | ❌     |
| Unit CRUD                  | ✅    | ✅      | ❌    | ❌      | ❌     |
| Promotion Item CRUD        | ✅    | ✅      | ❌    | ❌      | ❌     |
| Unit Promotion Setup       | ✅    | ✅      | ❌    | ❌      | ❌     |
| Sales Entry (create/edit)  | ✅    | ✅      | ✅    | ❌      | ❌     |
| Sales Entry (view all)     | ✅    | ✅      | ❌    | ✅      | ✅     |
| Sales Entry (view own)     | ✅    | ✅      | ✅    | ✅      | ✅     |
| Budget Transfer            | ✅    | ✅      | ❌    | ❌      | ❌     |
| Budget Approval            | ✅    | ✅      | ❌    | ❌      | ❌     |
| Special Budget Management  | ✅    | ✅      | ❌    | ❌      | ❌     |
| Budget Movement (view)     | ✅    | ✅      | ✅    | ✅      | ✅     |
| Bottom Line Import         | ✅    | ✅      | ❌    | ❌      | ❌     |
| Bottom Line History (view) | ✅    | ✅      | ❌    | ✅      | ✅     |
| Bottom Line Rollback       | ✅    | ❌      | ❌    | ❌      | ❌     |
| Mapping Presets            | ✅    | ✅      | ❌    | ❌      | ❌     |
| Reports                    | ✅    | ✅      | ❌    | ✅      | ✅     |
| User Management            | ✅    | ❌      | ❌    | ❌      | ❌     |
| Settings                   | ✅    | ❌      | ❌    | ❌      | ❌     |

---

## Project-level Access

- Users (except `admin`) are assigned to specific projects via `user_projects` table.
- แต่ละ assignment มี `access_level`:
  - `view` — ดูข้อมูลได้อย่างเดียว ไม่สามารถสร้าง/แก้ไข/ลบได้
  - `edit` — ดูและแก้ไขข้อมูลได้ตามสิทธิ์ของ role
- `admin` has access to all projects with `edit` level regardless of assignment.
- `project_ids` array in JWT payload determines accessible projects.
- JWT payload includes `project_access` map for access level per project.

### Access Level Rules

| Action                     | `view` | `edit` |
|----------------------------|--------|--------|
| ดูข้อมูลยูนิต / โปรโมชั่น     | ✅     | ✅     |
| ดู Dashboard / Reports       | ✅     | ✅     |
| ดู Budget Movements          | ✅     | ✅     |
| สร้าง/แก้ไข Sales Entry      | ❌     | ✅     |
| สร้าง/แก้ไข Unit / House Model| ❌     | ✅     |
| Budget Transfer / Approve    | ❌     | ✅     |
| Import Bottom Line           | ❌     | ✅     |
| จัดการ Promotion Items        | ❌     | ✅     |

> **หมายเหตุ:** `access_level` ทำงานร่วมกับ `role` — ต้องผ่านทั้ง role permission และ access level ถึงจะทำ action ได้ เช่น `sales` + `edit` สามารถสร้าง Sales Entry ได้ แต่ `sales` + `view` ไม่สามารถสร้างได้

---

## Data Model

### Table: `users`

| Column          | Type          | Description                              |
|-----------------|---------------|------------------------------------------|
| id              | BIGINT PK     | Auto-increment                           |
| email           | VARCHAR(255)  | Unique login email                       |
| password_hash   | VARCHAR(255)  | bcrypt hashed password                   |
| name            | VARCHAR(255)  | Display name (Thai/English)              |
| role            | ENUM          | `admin`, `manager`, `sales`, `finance`, `viewer` |
| phone           | VARCHAR(50)   | Contact phone number                     |
| avatar_url      | VARCHAR(500)  | Profile image URL                        |
| is_active       | BOOLEAN       | Account active flag (default: true)      |
| last_login_at   | DATETIME NULL | Last successful login timestamp          |
| created_at      | DATETIME      | Record creation timestamp                |
| updated_at      | DATETIME      | Record update timestamp                  |

### Table: `user_projects`

| Column       | Type        | Description                                      |
|--------------|-------------|--------------------------------------------------|
| id           | BIGINT PK   | Auto-increment                                   |
| user_id      | BIGINT FK   | References `users.id`                            |
| project_id   | BIGINT FK   | References `projects.id`                         |
| access_level | ENUM        | `view` = ดูได้อย่างเดียว, `edit` = แก้ไขได้ (default: `view`) |
| created_at   | DATETIME    | Assignment timestamp                             |
| updated_at   | DATETIME    | Record update timestamp                          |

UNIQUE(user_id, project_id)

### Table: `refresh_tokens`

| Column      | Type          | Description                      |
|-------------|---------------|----------------------------------|
| id          | BIGINT PK     | Auto-increment                   |
| user_id     | BIGINT FK     | References `users.id`            |
| token_hash  | VARCHAR(255)  | SHA-256 hash of refresh token    |
| expires_at  | DATETIME      | Token expiry timestamp           |
| revoked     | BOOLEAN       | Revoked flag (default: false)    |
| user_agent  | VARCHAR(500)  | Browser/device info              |
| ip_address  | VARCHAR(45)   | Client IP address                |
| created_at  | DATETIME      | Record creation timestamp        |

---

## API Endpoints

### Authentication

| Method | Path                      | Auth Required | Description                           |
|--------|---------------------------|---------------|---------------------------------------|
| GET    | /api/auth/check-setup     | ❌            | ตรวจว่ามี user ในระบบหรือยัง            |
| POST   | /api/auth/setup           | ❌            | สร้าง Admin คนแรก (ใช้ได้ครั้งเดียว)     |
| POST   | /api/auth/login           | ❌            | Login with email + password           |
| POST   | /api/auth/refresh         | ❌ (cookie)   | Refresh access token                  |
| POST   | /api/auth/logout          | ✅            | Logout (revoke refresh token)         |
| GET    | /api/auth/me              | ✅            | Get current user profile + permissions|
| PUT    | /api/auth/change-password | ✅            | Change own password                   |

### User Management (admin only)

| Method | Path                        | Description                |
|--------|-----------------------------|----------------------------|
| GET    | /api/users                  | List all users             |
| GET    | /api/users/{id}             | Get user detail            |
| POST   | /api/users                  | Create new user            |
| PUT    | /api/users/{id}             | Update user                |
| DELETE | /api/users/{id}             | Deactivate user (soft)     |
| PUT    | /api/users/{id}/projects    | Assign projects to user    |
| PUT    | /api/users/{id}/reset-password | Reset user password     |

### Request / Response Examples

**GET /api/auth/check-setup**

Response (200) — ยังไม่มี user ในระบบ:
```json
{
  "has_users": false
}
```

Response (200) — มี user แล้ว:
```json
{
  "has_users": true
}
```

**POST /api/auth/setup** — สร้าง Admin คนแรก

> ใช้ได้เฉพาะเมื่อ `users` table ว่างเปล่าเท่านั้น ถ้ามี user แล้วจะ return 403

Request:
```json
{
  "email": "admin@company.com",
  "password": "Admin@1234",
  "name": "ผู้ดูแลระบบ"
}
```

Response (201):
```json
{
  "message": "สร้างบัญชี Admin สำเร็จ กรุณาเข้าสู่ระบบ",
  "user": {
    "id": 1,
    "email": "admin@company.com",
    "name": "ผู้ดูแลระบบ",
    "role": "admin"
  }
}
```

Response (403) — มี user อยู่แล้ว:
```json
{
  "error": "setup_not_allowed",
  "message": "ระบบมีผู้ใช้งานแล้ว ไม่สามารถใช้ setup ได้"
}
```

**POST /api/auth/login**

Request:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Response (200):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "สมชาย ใจดี",
    "role": "sales",
    "projects": [
      { "id": 1, "code": "PJ-001", "name": "The Garden Residence", "access_level": "edit" },
      { "id": 3, "code": "PJ-003", "name": "Lake View Villa", "access_level": "edit" },
      { "id": 5, "code": "PJ-005", "name": "City Condo", "access_level": "view" }
    ]
  }
}
```

Response (401):
```json
{
  "error": "invalid_credentials",
  "message": "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
}
```

**POST /api/auth/refresh**

Response (200):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**GET /api/auth/me**

Response (200):
```json
{
  "id": 1,
  "email": "user@example.com",
  "name": "สมชาย ใจดี",
  "role": "sales",
  "phone": "081-234-5678",
  "avatar_url": "/uploads/avatars/1.jpg",
  "projects": [
    { "id": 1, "code": "PJ-001", "name": "The Garden Residence", "access_level": "edit" },
    { "id": 3, "code": "PJ-003", "name": "Lake View Villa", "access_level": "edit" },
    { "id": 5, "code": "PJ-005", "name": "City Condo", "access_level": "view" }
  ],
  "permissions": {
    "sales_entry": { "create": true, "view_own": true, "view_all": false },
    "budget": { "transfer": false, "approve": false, "view": true },
    "master_data": { "project": false, "unit": false, "promotion": false },
    "reports": false,
    "user_management": false,
    "settings": false
  }
}
```

---

## Backend Implementation

### JWT Secret

- Store in `.env` as `JWT_SECRET`
- Minimum 256-bit (32 characters) random string
- Never commit to version control

### Middleware: `JwtAuthFilter`

- Location: `app/Filters/JwtAuthFilter.php`
- Registered in `app/Config/Filters.php`
- Applied to all `/api/*` routes **except** `/api/auth/login` and `/api/auth/refresh`
- Validates:
  1. `Authorization: Bearer <token>` header exists
  2. Token signature is valid
  3. Token is not expired
  4. User `is_active = true`
- On failure: returns `401 Unauthorized`
- On success: sets `$request->user` with decoded payload

### Middleware: `RoleFilter`

- Location: `app/Filters/RoleFilter.php`
- Applied per-route via route config
- Checks `$request->user->role` against allowed roles
- On failure: returns `403 Forbidden`

### Service: `AuthService`

- Location: `app/Services/AuthService.php`
- Methods:
  - `checkSetup()` → ตรวจว่ามี user ในระบบหรือยัง
  - `setup(email, password, name)` → สร้าง admin คนแรก (ใช้ได้เมื่อ users table ว่างเท่านั้น)
  - `login(email, password)` → validates credentials, generates tokens
  - `refresh(refreshToken)` → validates refresh token, generates new access token
  - `logout(userId, refreshToken)` → revokes refresh token
  - `generateAccessToken(user)` → creates JWT with user payload (includes `project_access`)
  - `generateRefreshToken(user)` → creates and stores refresh token
  - `validateAccessToken(token)` → decodes and validates JWT
  - `hashPassword(password)` → bcrypt hash
  - `verifyPassword(password, hash)` → bcrypt verify

### Route Configuration

```php
// app/Config/Routes.php

// Public routes (no auth)
$routes->get('api/auth/check-setup', 'AuthController::checkSetup');
$routes->post('api/auth/setup', 'AuthController::setup');
$routes->post('api/auth/login', 'AuthController::login');
$routes->post('api/auth/refresh', 'AuthController::refresh');

// Authenticated routes
$routes->group('api', ['filter' => 'jwt_auth'], function ($routes) {
    // Auth
    $routes->get('auth/me', 'AuthController::me');
    $routes->post('auth/logout', 'AuthController::logout');
    $routes->put('auth/change-password', 'AuthController::changePassword');

    // User management (admin only)
    $routes->group('users', ['filter' => 'role:admin'], function ($routes) {
        $routes->get('/', 'UserController::index');
        $routes->get('(:num)', 'UserController::show/$1');
        $routes->post('/', 'UserController::create');
        $routes->put('(:num)', 'UserController::update/$1');
        $routes->delete('(:num)', 'UserController::delete/$1');
        $routes->put('(:num)/projects', 'UserController::assignProjects/$1');
        $routes->put('(:num)/reset-password', 'UserController::resetPassword/$1');
    });

    // Other routes with role-based access...
});
```

### Password Rules

- Minimum 8 characters
- Must contain at least 1 uppercase, 1 lowercase, 1 number
- bcrypt cost factor: 12
- No password history enforcement (v1)

---

## Frontend Implementation

### Angular Services

**AuthService** (`app/core/services/auth.service.ts`)
- `checkSetup(): Observable<{ has_users: boolean }>`
- `setup(email, password, name): Observable<SetupResponse>`
- `login(email, password): Observable<LoginResponse>`
- `logout(): void`
- `refreshToken(): Observable<TokenResponse>`
- `getCurrentUser(): Signal<User | null>`
- `isAuthenticated(): Signal<boolean>`
- `hasRole(role: string): boolean`
- `hasPermission(module: string, action: string): boolean`
- `getAccessToken(): string | null`

### HTTP Interceptor

**AuthInterceptor** (`app/core/interceptors/auth.interceptor.ts`)
- Attaches `Authorization: Bearer <token>` to all `/api/` requests (except login/refresh)
- On 401 response:
  1. Attempt token refresh via `/api/auth/refresh`
  2. If refresh succeeds → retry original request with new token
  3. If refresh fails → redirect to login page
- Queue concurrent requests during refresh to avoid multiple refresh calls

```typescript
// Registration in app.config.ts
provideHttpClient(
  withInterceptors([authInterceptor])
)
```

### Route Guards

**AuthGuard** (`app/core/guards/auth.guard.ts`)
- Protects all routes except `/login` and `/select-project`
- Checks `AuthService.isAuthenticated()`
- Redirects to `/login` if not authenticated

**ProjectGuard** (`app/core/guards/project.guard.ts`)
- Protects all routes except `/login` and `/select-project`
- Checks `ProjectService.selectedProject()` is not null
- Redirects to `/select-project` if no project selected

**RoleGuard** (`app/core/guards/role.guard.ts`)
- Checks user role against route `data.roles`
- Returns `403` page if role not allowed

**AccessLevelGuard** (`app/core/guards/access-level.guard.ts`)
- ตรวจสอบ `access_level` ของ user สำหรับโครงการที่เลือกอยู่
- ถ้า route ต้องการ `edit` access แต่ user มีแค่ `view` → redirect to dashboard พร้อมแสดง snackbar "ไม่มีสิทธิ์แก้ไขโครงการนี้"

```typescript
// Example route config
{
  path: 'users',
  component: UserListComponent,
  canActivate: [authGuard, projectGuard, roleGuard],
  data: { roles: ['admin'] }
},
{
  path: 'sales/create',
  component: SalesEntryComponent,
  canActivate: [authGuard, projectGuard, roleGuard, accessLevelGuard],
  data: { roles: ['admin', 'manager', 'sales'], requiredAccess: 'edit' }
}
```

### Auth State Management

- Use Angular signals for reactive auth state
- `currentUser = signal<User | null>(null)`
- `isAuthenticated = computed(() => !!currentUser())`
- Persist token in `localStorage`, validate on app init
- Clear state on logout

### Project State Management

**ProjectService** (`app/core/services/project.service.ts`)
- `selectedProject = signal<Project | null>(null)`
- `accessLevel = computed(() => selectedProject()?.access_level ?? null)`
- `canEdit = computed(() => accessLevel() === 'edit')`
- `selectProject(project: Project): void` → set signal + persist project_id in `sessionStorage`
- `clearProject(): void` → reset signal + clear `sessionStorage`
- On app init: restore selected project from `sessionStorage` (if still valid)
- On logout: clear project selection

---

## UI Screens

### Login Page

- Full-page layout (no sidebar, no topbar)
- Centered login card on gradient background (#F8FAFC → #E2E8F0)
- Company logo at top
- เมื่อเปิดหน้า Login ให้เรียก `GET /api/auth/check-setup` เพื่อตรวจสอบว่ามี user ในระบบหรือยัง
- ถ้ายังไม่มี user (`has_users = false`):
  - แสดงปุ่ม **"สร้าง Admin"** (`mat-flat-button color="accent"`) ใต้ฟอร์ม login
  - คลิกแล้วแสดง dialog สร้าง admin คนแรก: ชื่อ, Email, Password, ยืนยัน Password
  - เรียก `POST /api/auth/setup` → สร้าง admin สำเร็จ → แสดง snackbar แล้ว redirect กลับหน้า login
- ถ้ามี user แล้ว (`has_users = true`):
  - ซ่อนปุ่ม "สร้าง Admin"
  - แสดง login form ปกติ
- Fields:
  - Email (`mat-form-field` + `matInput` type=email, required)
  - Password (`mat-form-field` + `matInput` type=password, required, with show/hide toggle)
- Login button: `mat-flat-button color="primary"` full-width
- Error messages via `mat-error` + `MatSnackBarModule`
- Loading state: `MatProgressSpinnerModule` on button

### Project Selection Page (หน้าเลือกโครงการ)

- แสดงหลัง login สำเร็จ ก่อนเข้า Dashboard
- Full-page layout (no sidebar)
- Header: แสดงชื่อผู้ใช้ + ปุ่ม Logout
- แสดงเฉพาะโครงการที่ user มีสิทธิ์เข้าถึง (จาก `user_projects`)
- `admin` เห็นทุกโครงการ
- Layout: Grid cards (responsive — 3 columns desktop, 2 tablet, 1 mobile)
- แต่ละ card แสดง:
  - ชื่อโครงการ + รหัส
  - ประเภท (condo/house/townhouse/mixed) — status chip
  - สถานะ (active/inactive/completed) — status chip
  - ระดับสิทธิ์: badge แสดง `ดูอย่างเดียว` (สีเทา) หรือ `แก้ไขได้` (สีเขียว)
  - จำนวนยูนิตทั้งหมด
- คลิกเลือกโครงการ → เก็บ `selectedProjectId` + `access_level` ใน `ProjectService` (signal) → navigate to Dashboard
- ปุ่มเปลี่ยนโครงการอยู่ที่ sidebar header ตลอดเวลา (กลับมาหน้านี้ได้)
- ถ้า user มีสิทธิ์เข้าถึงโครงการเดียว → auto-select แล้วข้ามไป Dashboard เลย

### Top Navigation — User Menu

- Display user name + avatar in top-right corner
- Dropdown menu (`mat-menu`):
  - Profile (ข้อมูลส่วนตัว)
  - Change Password (เปลี่ยนรหัสผ่าน)
  - Divider
  - Logout (ออกจากระบบ)

### User Management Page (admin only)

- `mat-table` with columns: Name, Email, Role, Projects, Status, Last Login, Actions
- Create/Edit: `MatDialogModule` with form
- Project assignment: multi-select chips (`MatChipsModule`)
- Role selector: `mat-select`
- Status toggle: `mat-slide-toggle`
- Reset password action with confirmation dialog

### Change Password Dialog

- Current password (`mat-form-field` + `matInput` type=password)
- New password (`mat-form-field` + `matInput` type=password)
- Confirm new password (`mat-form-field` + `matInput` type=password)
- Password strength indicator (Tailwind progress bar)
- Validation: match check, min length, complexity

---

## Security Rules

1. **JWT Secret** must be stored in `.env` — never hardcoded or committed.
2. **Access token** expires in 60 minutes — frontend must handle refresh transparently.
3. **Refresh token** stored as `httpOnly` cookie — not accessible via JavaScript.
4. **Password** stored as bcrypt hash — never stored or logged in plain text.
5. **Failed login** attempts: lock account after 5 consecutive failures for 15 minutes.
6. **CORS**: configure allowed origins in CI4 `Cors` filter — only allow frontend origin.
7. **All API responses** must strip sensitive fields (password_hash, token_hash) from output.
8. **Audit trail**: log all login/logout events with timestamp, IP, user_agent.
9. **Project-scoped queries**: backend must always filter data by user's `project_ids` — never trust client-side filtering alone.
10. **Token revocation**: on password change, revoke all existing refresh tokens for that user.
11. **Initial setup**: `/api/auth/setup` endpoint ต้องตรวจสอบว่า `users` table ว่างเปล่าจริง — ถ้ามี user แม้แต่ 1 คนต้อง return 403 ทันที ไม่มีข้อยกเว้น
12. **Project-scoped access**: backend ต้องตรวจสอบทั้ง `role` และ `access_level` ก่อนอนุญาต write operations — ถ้า access_level = `view` ต้อง reject ทุก POST/PUT/DELETE
