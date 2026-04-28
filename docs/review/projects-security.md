# Projects CRUD — Security Review

**Reviewer**: security-reviewer agent
**Date**: 2026-04-02
**Scope**: ProjectController, ProjectModel, ProjectService, Routes (projects), JwtAuthFilter, RoleFilter, AccessLevelFilter

## Summary

Reviewed 7 files covering the Projects CRUD feature. Found **2 CRITICAL**, **3 MAJOR**, and **2 MINOR** issues. The most severe problems are: (1) the DELETE endpoint performs a hard cascade delete instead of soft-delete as specified, permanently destroying data; (2) the DELETE endpoint skips project-access checks, allowing any admin to delete any project without `canAccessProject()` verification. Budget derivation in `show()` also ignores movement status, which could misrepresent budget figures.

---

## Findings

### CRITICAL #1: DELETE performs hard cascade delete instead of soft-delete

- **Location**: `backend/app/Controllers/ProjectController.php:209`, `backend/app/Models/ProjectModel.php:95-122`
- **Description**: The `delete()` action calls `deleteProjectCascade()` which performs `DELETE FROM projects WHERE id = $projectId` along with cascade-deleting all related data across 10 tables (number_series, user_projects, unit_budget_allocations, budget_movements, bottom_line_mapping_columns, bottom_line_mapping_presets, bottom_lines, project_units, house_models, projects). The API spec at `docs/07-master-data.md:49` explicitly states: "Delete project (soft-delete, only if no units)". Additionally, the model has `$useSoftDeletes = false` (line 13).
- **Impact**: Permanent, irrecoverable data loss. An admin delete action destroys all budget movements, unit allocations, bottom-line data, and house models for the project. This violates the spec and removes audit trail data that should be preserved. Even the `hasSalesTransactions()` guard only checks sales_transactions — a project with budget_movements, units, and bottom-lines but no sales can still be fully wiped.
- **Recommendation**:
  1. Enable CI4 soft deletes: set `$useSoftDeletes = true` and add a `deleted_at` column to the `projects` table.
  2. Replace `deleteProjectCascade()` with a status update to `status = 'deleted'` or use CI4's built-in `$model->delete($id)` with soft deletes enabled.
  3. Add a guard: reject delete if project has units (per spec: "only if no units").
  4. If hard delete is ever needed (e.g., admin purge), make it a separate privileged endpoint with confirmation.

---

### CRITICAL #2: DELETE endpoint missing canAccessProject() check

- **Location**: `backend/app/Controllers/ProjectController.php:195-215`
- **Description**: The `delete()` method does NOT call `canAccessProject($id)` before proceeding. Compare with `show()` (line 77), `update()` (line 156), and `units()` (line 221) which all call `canAccessProject()`. The route filter only checks `role:admin`, so any user with admin role can delete ANY project in the system, even projects they shouldn't have access to.
- **Impact**: In a multi-project deployment, an admin assigned to Project A could delete Project B and all its data. This breaks project-level isolation. Combined with CRITICAL #1 (hard delete), this is especially dangerous.
- **Recommendation**: Add `canAccessProject($id)` check at the start of `delete()`, consistent with all other mutation endpoints:
  ```php
  if (! $this->canAccessProject($id)) {
      return $this->notFound();
  }
  ```

---

### MAJOR #1: budget_used query in show() does not filter by movement status

- **Location**: `backend/app/Controllers/ProjectController.php:89-90`
- **Description**: The `show()` endpoint calculates `budget_used` as:
  ```php
  $budgetUsed = (float) ($this->db()->table('budget_movements')
      ->selectSum('amount')->where('project_id', $id)->get()->getRow()->amount ?? 0);
  ```
  This sums ALL budget movements regardless of status. Per the project rules in `CLAUDE.md` and confirmed in `BudgetMovementService` (line 13) and `DashboardService` (line 13): balances must be derived from `SUM(movements WHERE status='approved')`. Pending, rejected, and voided movements should be excluded.
- **Impact**: The project detail view could display inflated or incorrect budget figures, including pending/rejected/voided movements. This could lead to incorrect business decisions about remaining budget.
- **Recommendation**: Add `->where('status', 'approved')` to the budget_used query:
  ```php
  $budgetUsed = (float) ($this->db()->table('budget_movements')
      ->selectSum('amount')
      ->where('project_id', $id)
      ->where('status', 'approved')
      ->get()->getRow()->amount ?? 0);
  ```

---

### MAJOR #2: AccessLevelFilter not applied to project write routes

- **Location**: `backend/app/Config/Routes.php:38-44`
- **Description**: The project POST/PUT routes (lines 38-41) use `['filter' => 'role:admin,manager']` and the DELETE route (lines 42-44) uses `['filter' => 'role:admin']`. Neither applies the `access` (AccessLevelFilter) filter. This means a manager with `access_level='view'` on a specific project can still create new projects or update any project they have access to, even though they should be restricted to read-only operations. The dev rules at `docs/09-development-rules.md:163` state: "Write operations (POST/PUT/DELETE) must check `access_level` of the current project — reject if `view`".
- **Impact**: A user granted view-only access to a project can still modify it via POST/PUT endpoints, violating the intended access control model.
- **Recommendation**: Add the `access` filter to write routes:
  ```php
  $routes->group('projects', ['filter' => ['role:admin,manager', 'access']], static function (...) {
      $routes->post('/', ...);
      $routes->put('(:num)', ...);
  });
  ```
  Note: For POST (create), AccessLevelFilter may not resolve a project_id (new project), which is acceptable — the filter already handles this case by passing through when project_id is null. But PUT and DELETE should definitely be covered.

---

### MAJOR #3: Error message in create() exposes exception details

- **Location**: `backend/app/Controllers/ProjectController.php:140`
- **Description**: The catch block in `create()` returns the raw exception message to the client:
  ```php
  return $this->response->setStatusCode(500)->setJSON([
      'error' => 'เกิดข้อผิดพลาดในการสร้างโครงการ: ' . $e->getMessage()
  ]);
  ```
  The `$e->getMessage()` could contain database error details (table names, column names, constraint violations, SQL fragments) depending on what `numberSeriesService->createDefaultSeries()` throws.
- **Impact**: Information disclosure — an attacker could trigger errors to learn about internal database schema, table names, and constraint details, which aids further attacks (e.g., SQL injection attempts on other endpoints).
- **Recommendation**: Log the full exception server-side and return a generic error to the client:
  ```php
  log_message('error', '[ProjectController::create] ' . $e->getMessage());
  return $this->response->setStatusCode(500)->setJSON([
      'error' => 'เกิดข้อผิดพลาดในการสร้างโครงการ'
  ]);
  ```

---

### MINOR #1: No length validation on code and name fields

- **Location**: `backend/app/Controllers/ProjectController.php:251-276`
- **Description**: The `validateCreate()` method checks that `code` is non-empty and matches a regex pattern `[A-Za-z0-9\-_]+`, and that `name` is non-empty. However, there is no maximum length check on either field. If the database column has a limit (e.g., VARCHAR(50)), the database will either truncate silently or throw an error. Similarly, `validateUpdate()` (line 278) does not check length for `name`.
- **Impact**: Low — the database will likely enforce its own length limit and return an error. However, this could result in unclear error messages or data truncation depending on MySQL strict mode settings.
- **Recommendation**: Add length checks matching the database column definitions (e.g., `strlen($code) > 50`).

---

### MINOR #2: pool_budget_amount validated with max(0,...) but no upper bound

- **Location**: `backend/app/Controllers/ProjectController.php:123` (create), `backend/app/Controllers/ProjectController.php:178` (update)
- **Description**: Both `create()` and `update()` use `max(0, (float) $body['pool_budget_amount'])` to prevent negative values. This is good. However, there is no upper-bound validation, meaning a user could set an arbitrarily large budget amount (e.g., 999999999999).
- **Impact**: Low — this is more of a business logic concern than a security vulnerability. An extremely large value could cause display issues or unexpected behavior in budget calculations.
- **Recommendation**: Consider adding a reasonable upper bound based on business requirements.

---

## Positive Observations

1. **JWT authentication is globally applied**: `JwtAuthFilter` is configured in `Filters.php:100-102` for all `api/*` routes via the `$filters` array. Exempt routes are properly defined inside the filter class.
2. **Query Builder used consistently**: All database queries use CI4 Query Builder with parameterized values — no raw SQL or string concatenation in queries. This effectively prevents SQL injection.
3. **Role-based routing is well-structured**: Routes correctly separate read (all authenticated), write (admin+manager), and delete (admin-only) operations.
4. **Project isolation in read paths**: `index()`, `show()`, `units()`, and `houseModels()` all properly check `canAccessProject()` or filter by `project_ids`.
5. **Code injection prevention**: The project code regex (`/^[A-Za-z0-9\-_]+$/`) prevents special characters.
6. **Duplicate code check**: `isCodeDuplicate()` prevents duplicate project codes at the application level.
7. **JWT secret validation**: `JwtAuthFilter` checks for empty `JWT_SECRET` and fails closed (returns 401).
8. **Token not logged**: Comment and code in `JwtAuthFilter:77` explicitly avoids logging token values.
