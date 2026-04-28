# Projects CRUD — Test Coverage Review

## Summary

`ProjectTest.php` มี 8 test cases ครอบคลุม happy path ของ CRUD เบื้องต้น แต่ยังขาด **error path**, **auth/role tests**, **project isolation**, และ **sub-endpoint tests** (`/units`, `/house-models`) ทั้งหมด DELETE test ถูก skip เนื่องจาก bug (500 error) ฝั่ง Frontend ไม่มี spec file เลย

**สรุป coverage:**
- Happy paths: 5/7 endpoints tested (ขาด `/units`, `/house-models`)
- Error paths: 1/8+ tested (duplicate code เท่านั้น)
- Auth/Role tests: 0 tests
- Project isolation: 0 tests
- Frontend: 0 spec files

## Existing Tests

| # | Test Method | Status | Covers |
|---|-----------|--------|--------|
| 1 | `testListProjectsEmptyInitially` | ✅ PASS | GET /api/projects — empty list |
| 2 | `testCreateProjectSucceeds` | ✅ PASS | POST /api/projects — valid data, checks status 201 + JSON body |
| 3 | `testCreateProjectDuplicateCodeReturns422` | ✅ PASS | POST /api/projects — duplicate code validation |
| 4 | `testShowProjectDetail` | ✅ PASS | GET /api/projects/:id — checks code, unit_count key |
| 5 | `testUpdateProjectSucceeds` | ✅ PASS | PUT /api/projects/:id — name + status update |
| 6 | `testDeleteProjectWithoutSalesSucceeds` | ⚠️ SKIPPED | DELETE /api/projects/:id — bug: returns 500 instead of 200 |
| 7 | `testDeleteProjectWithSalesTransactionsReturnsError` | ✅ PASS | DELETE /api/projects/:id — rejects when sales exist (400) |
| 8 | `testListProjectsAfterCreate` | ✅ PASS | GET /api/projects — list after create shows ≥1 |

**Assertion quality notes:**
- `testCreateProjectSucceeds` — Good: checks message, data, code, name, type, status
- `testShowProjectDetail` — Moderate: checks code + unit_count key but not budget_used
- `testListProjectsAfterCreate` — Weak: only checks count ≥1, doesn't verify specific project data
- `testDeleteProjectWithSalesTransactionsReturnsError` — Moderate: checks 400 + error key, but not error message content

## Missing Tests

### CRITICAL #1: No authentication tests (401 Unauthorized)
- **Type**: integration
- **Description**: ไม่มี test ที่เรียก API โดยไม่ส่ง token — ทุก test ใช้ admin token เสมอ
- **Test scenario**: `GET /api/projects` without Authorization header → expect 401
- **Impact**: Auth filter อาจ bypass ได้โดยไม่มีใครรู้ ทุก endpoint ต้องทดสอบ unauthenticated access

### CRITICAL #2: No role-based authorization tests (403 Forbidden)
- **Type**: integration
- **Description**: Routes กำหนด `role:admin,manager` สำหรับ POST/PUT และ `role:admin` สำหรับ DELETE แต่ไม่มี test ยืนยันว่า role อื่นถูก reject
- **Test scenario**:
  - Login as `sales` role → POST /api/projects → expect 403
  - Login as `sales` role → PUT /api/projects/:id → expect 403
  - Login as `manager` role → DELETE /api/projects/:id → expect 403
  - Login as `viewer` role → POST/PUT/DELETE → expect 403
- **Impact**: Role escalation — sales user อาจสร้าง/แก้ไข/ลบโครงการได้ โดยไม่มี test ตรวจจับ

### CRITICAL #3: No project isolation test (User A vs User B)
- **Type**: integration
- **Description**: `canAccessProject()` ตรวจ `project_ids` จาก request แต่ไม่มี test ว่า non-admin user ไม่เห็น project ของคนอื่น ทุก test ใช้ admin ซึ่ง bypass check ทั้งหมด
- **Test scenario**:
  - Admin สร้าง Project A, assign ให้ User X
  - Admin สร้าง Project B, assign ให้ User Y
  - Login as User X → GET /api/projects/:projectB_id → expect 404
  - Login as User X → GET /api/projects → expect ไม่เห็น Project B
- **Impact**: Data leak — user อาจเห็นข้อมูลโครงการที่ไม่ได้รับสิทธิ์

### CRITICAL #4: Delete endpoint bug not resolved (test skipped)
- **Type**: integration
- **Description**: `testDeleteProjectWithoutSalesSucceeds` ถูก markTestSkipped เนื่องจาก `deleteProjectCascade()` returns 500 — นี่คือ bug จริงที่ยังไม่ได้แก้ ไม่ใช่แค่ test issue
- **Test scenario**: DELETE /api/projects/:id (no sales) → expect 200
- **Impact**: ผู้ใช้ไม่สามารถลบโครงการได้เลย แม้ไม่มี sales transactions — core feature เสีย

### MAJOR #5: No validation error tests for required fields
- **Type**: integration
- **Description**: Controller `validateCreate()` ตรวจ code, name, project_type แต่มี test เฉพาะ duplicate code — ไม่มี test สำหรับ missing fields
- **Test scenario**:
  - POST without `code` → expect 422 with errors.code
  - POST without `name` → expect 422 with errors.name
  - POST without `project_type` → expect 422 with errors.project_type
  - POST with `code` = "PJ @#$" (special chars) → expect 422 (regex validation)
  - POST with empty string code → expect 422
- **Impact**: Validation regression — required field checks อาจถูกลบโดยไม่มีใครรู้

### MAJOR #6: No invalid enum value tests
- **Type**: integration
- **Description**: `project_type` ต้องเป็น `condo|house|townhouse|mixed`, `status` ต้องเป็น `active|inactive|completed` — ไม่มี test ส่งค่าผิด
- **Test scenario**:
  - POST with `project_type` = "apartment" → expect 422
  - PUT with `status` = "deleted" → expect 422
- **Impact**: Invalid data อาจเข้า DB ได้ถ้า validation ถูกแก้ไขผิด

### MAJOR #7: No 404 tests for non-existent resources
- **Type**: integration
- **Description**: `show()`, `update()`, `delete()` ทั้งหมด return 404 เมื่อไม่พบ project แต่ไม่มี test ยืนยัน
- **Test scenario**:
  - GET /api/projects/99999 → expect 404 with `{"error": "ไม่พบโครงการ"}`
  - PUT /api/projects/99999 → expect 404
  - DELETE /api/projects/99999 → expect 404
- **Impact**: Error handling regression — อาจ return 500 แทน 404

### MAJOR #8: No tests for /units and /house-models sub-endpoints
- **Type**: integration
- **Description**: `GET /api/projects/:id/units` และ `GET /api/projects/:id/house-models` ไม่มี test เลย
- **Test scenario**:
  - Create project + create units → GET /api/projects/:id/units → expect 200 with unit data
  - Create project + create house_model → GET /api/projects/:id/house-models → expect 200
  - GET /api/projects/99999/units → expect 404 (unauthorized project)
- **Impact**: Sub-endpoint regression ไม่มี safety net

### MAJOR #9: Update validation edge cases not tested
- **Type**: integration
- **Description**: `validateUpdate()` ตรวจ empty name, invalid project_type, invalid status แต่ไม่มี test
- **Test scenario**:
  - PUT with `name` = "" → expect 422
  - PUT with `project_type` = "invalid" → expect 422
  - PUT with `status` = "invalid" → expect 422
- **Impact**: Update validation อาจเสียโดยไม่มี test ตรวจจับ

### MAJOR #10: No negative/zero pool_budget_amount test
- **Type**: integration
- **Description**: Controller ใช้ `max(0, ...)` สำหรับ pool_budget_amount แต่ไม่มี test ยืนยัน behavior
- **Test scenario**:
  - POST with `pool_budget_amount` = -500000 → expect stored as 0 (clamped)
  - POST with `pool_budget_amount` = 0 → expect 201, stored as 0
  - PUT with `pool_budget_amount` = -100 → expect stored as 0
- **Impact**: Budget calculation อาจผิดถ้า negative value เข้า DB

### MINOR #11: Weak assertion in testListProjectsAfterCreate
- **Type**: integration
- **Description**: ใช้ `assertGreaterThanOrEqual(1, ...)` แทนที่จะตรวจ exact count และ data content
- **Test scenario**: ควร assert `assertCount(1, ...)` และตรวจ `$json['data'][0]['code'] === 'PJ-LST'`
- **Impact**: Test อาจ pass แม้ list endpoint return ข้อมูลผิด

### MINOR #12: testShowProjectDetail ไม่ตรวจ budget_used
- **Type**: integration
- **Description**: Controller คืน `budget_used` ใน response แต่ test ไม่ assert ค่านี้
- **Test scenario**: ควรเพิ่ม `$this->assertArrayHasKey('budget_used', $json['data'])`
- **Impact**: budget_used field อาจหายไปโดยไม่มีใครรู้

### MINOR #13: No test for search/filter parameters on list
- **Type**: integration
- **Description**: `index()` รับ `search`, `status`, `project_type` query params แต่ไม่มี test
- **Test scenario**:
  - Create 2 projects (house + condo) → GET /api/projects?project_type=house → expect 1 result
  - GET /api/projects?search=Garden → expect matching result
  - GET /api/projects?status=completed → expect 0 (all are active)
- **Impact**: Filter/search regression

### MINOR #14: No test for code format regex validation
- **Type**: integration
- **Description**: `validateCreate()` ใช้ regex `/^[A-Za-z0-9\-_]+$/` สำหรับ code แต่ไม่มี test
- **Test scenario**:
  - POST with `code` = "PJ 001" (space) → expect 422
  - POST with `code` = "PJ@001" (special char) → expect 422
  - POST with `code` = "PJ-001_A" (valid) → expect 201
- **Impact**: Code format validation อาจถูกเปลี่ยนโดยไม่ตั้งใจ

## Frontend Test Coverage

### CRITICAL #15: No frontend test files exist
- **Type**: unit / integration
- **Description**: ไม่พบ `.spec.ts` file ใดเลยใน:
  - `frontend/src/app/features/project/`
  - `frontend/src/app/features/project-management/`
  - `frontend/src/app/features/project-selection/`
- **Test scenario**: ควรมี spec files สำหรับ:
  - `project-selection-page.component.spec.ts` — test project list rendering, search/filter, click navigation
  - Project form component spec — test form validation, submit, error display
  - Service spec — test API call mocking via HttpClientTestingModule
- **Impact**: Frontend regression ทั้งหมดไม่มี safety net — UI อาจเสียโดยไม่มี test ตรวจจับ

## Test Infrastructure Notes

- **BaseIntegrationTest** มีแค่ `setupAdminAndLogin()` — ต้องเพิ่ม helper สำหรับ login ด้วย role อื่น (manager, sales, viewer) เพื่อทดสอบ RBAC
- **cleanDatabase()** truncate ตารางครบถ้วนดี แต่ลำดับอาจมีปัญหาถ้าเพิ่มตารางใหม่
- **No test data factory** — ทุก test สร้าง data เอง ซ้ำซ้อน ควรพิจารณา shared helper/factory

## Priority Recommendation

1. **ทำก่อน (CRITICAL):** Auth tests (#1, #2), Project isolation (#3), Fix delete bug (#4)
2. **ทำต่อ (MAJOR):** Validation tests (#5, #6, #7), Sub-endpoint tests (#8), Update validation (#9), Budget edge case (#10)
3. **ปรับปรุง (MINOR):** Strengthen assertions (#11, #12), Filter tests (#13), Regex tests (#14)
4. **Frontend:** สร้าง spec files (#15) — อย่างน้อย component + service specs
