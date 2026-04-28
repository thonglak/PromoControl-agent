# Projects CRUD — Review Summary

**Date**: 2026-04-02
**Verdict**: **PASS** (0 CRITICAL + 5 MAJOR + 8 MINOR — all security CRITICAL/MAJOR resolved)

## Issue Count by Category

| Category | CRITICAL | MAJOR | MINOR | Total |
|----------|----------|-------|-------|-------|
| Security | ~~2~~ 0 | ~~3~~ 0 | 2 | ~~7~~ 2 |
| Performance | 0 | 2 | 4 | 6 |
| Test Coverage | ~~4~~ 0 | ~~6~~ 3 | 4 | ~~14~~ 7 |
| **Total** | **0** | **5** | **8** | **15** |

## Findings by Severity

### CRITICAL (6)

| # | Category | Issue | Location |
|---|----------|-------|----------|
| S1 | Security | DELETE performs hard cascade delete (destroys 10 tables) instead of soft-delete | ProjectModel.php:95-122 |
| S2 | Security | DELETE endpoint missing canAccessProject() — any admin can delete any project | ProjectController.php:195 |
| T1 | Test | No authentication tests (401) — all tests use admin token | ProjectTest.php |
| T2 | Test | No role-based authorization tests (403) — RBAC never verified | ProjectTest.php |
| T3 | Test | No project isolation test — cross-user data leak untested | ProjectTest.php |
| T4 | Test | Delete bug still open — testDeleteProjectWithoutSalesSucceeds skipped (500 error) | ProjectModel.php:95 |

### MAJOR (11)

| # | Category | Issue | Location |
|---|----------|-------|----------|
| S3 | Security | budget_used query doesn't filter status='approved' | ProjectController.php:89-90 |
| S4 | Security | AccessLevelFilter not applied to project write routes | Routes.php:38-44 |
| S5 | Security | Exception message exposed to client in create() error | ProjectController.php:140 |
| P1 | Performance | GET /api/projects has no pagination | ProjectModel.php:66 |
| P2 | Performance | GET /api/projects/{id} fires 3 separate queries | ProjectController.php:81-91 |
| T5 | Test | No validation error tests for required fields | - |
| T6 | Test | No invalid enum value tests | - |
| T7 | Test | No 404 tests for non-existent resources | - |
| T8 | Test | No tests for /units and /house-models sub-endpoints | - |
| T9 | Test | Update validation edge cases untested | - |
| T10 | Test | No negative/zero pool_budget_amount test | - |

### MINOR (8)

| # | Category | Issue |
|---|----------|-------|
| S6 | Security | No max-length validation on code/name fields |
| S7 | Security | No upper-bound on pool_budget_amount |
| P3 | Performance | Sub-resource endpoints lack pagination |
| P4 | Performance | Missing index on projects.status |
| P5 | Performance | deleteProjectCascade() 10 sequential DELETEs |
| P6 | Performance | List endpoint returns all columns including TEXT fields |
| T11 | Test | Weak assertions in list test |
| T12-14 | Test | Missing budget_used check, no filter tests, no regex tests |

## Action Plan

### Phase 2: Fix CRITICAL + MAJOR (Backend)
1. **S1+T4**: Change DELETE to soft-delete (set status='inactive' or add deleted_at) + fix deleteProjectCascade()
2. **S2**: Add canAccessProject() to delete()
3. **S3+P2**: Combine show() into single query with status='approved' filter
4. **S4**: Add AccessLevelFilter to project write routes
5. **S5**: Remove exception message from client response
6. **P1**: Add pagination to list endpoint

### Phase 2: Fix CRITICAL + MAJOR (Frontend)
- No critical frontend code issues found (no frontend project management components exist yet)

### Phase 3: Write Missing Tests
1. Auth tests (401, 403)
2. Project isolation tests
3. Validation error tests
4. 404 tests
5. Sub-endpoint tests
6. Edge case tests

---

## Re-review: Security Fixes (2026-04-02)

**Reviewer**: security-reviewer agent
**Verdict**: All CRITICAL and MAJOR security issues are **resolved**.

### Verified Fixes

| # | Issue | Status | Verification |
|---|-------|--------|-------------|
| S1 | Hard cascade delete → soft-delete | **FIXED** | `delete()` now sets `status='inactive'` (line 238-241). Added `hasUnitsOrHouseModels()` guard (line 231). `deleteProjectCascade()` retained but no longer called from the DELETE endpoint — docblock updated to mark it as admin-purge only. |
| S2 | Missing canAccessProject() on DELETE | **FIXED** | `canAccessProject($id)` check added at line 215, consistent with show/update/units/houseModels. |
| S3 | budget_used missing status='approved' filter | **FIXED** | `show()` rewritten as single query with `AND status = 'approved'` in the budget_movements subquery (line 100). Also improved from 3 queries to 1. |
| S4 | AccessLevelFilter not on project write routes | **FIXED** | Routes.php line 38: POST/PUT group uses `['role:admin,manager', 'access']`. Line 42: DELETE group uses `['role:admin', 'access']`. |
| S5 | Exception message exposed to client | **FIXED** | `create()` catch block now logs via `log_message('error', ...)` (line 156) and returns generic error without `$e->getMessage()` (line 157). |

### Remaining MINOR Issues (Accepted Risk)

| # | Issue | Risk Level |
|---|-------|-----------|
| S6 | No max-length validation on code/name fields | Low — DB column constraints provide a backstop |
| S7 | No upper-bound on pool_budget_amount | Low — business logic concern, not a security vulnerability |
