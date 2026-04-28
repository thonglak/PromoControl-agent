# Projects CRUD — Performance Review

## Summary

The Projects CRUD implementation is generally well-structured with a single LEFT JOIN for the list endpoint (avoiding N+1) and proper transaction usage for creates and deletes. However, there are **2 MAJOR** and **4 MINOR** issues: the list endpoint lacks pagination and will degrade as projects grow; the show endpoint fires 3 separate queries that could be combined; sub-resource endpoints (`/units`, `/house-models`) also lack pagination; and the cascade delete performs 10 sequential DELETE statements that could leverage FK CASCADE. Index coverage is mostly adequate but has a gap on `projects.status`.

## Findings

### MAJOR #1: GET /api/projects — ไม่มี pagination (no limit/offset)

- **Location**: `backend/app/Models/ProjectModel.php:66` — `$builder->get()->getResultArray()`
- **Description**: `getProjectsWithUnitCount()` executes a `SELECT ... LEFT JOIN ... GROUP BY` and returns **all** matching rows with no `LIMIT`/`OFFSET`. For an admin user with no filters, this fetches every project in the system in a single query.
- **Impact**: At 100 projects this is fine. At 1,000+ projects with thousands of units, the `GROUP BY p.id` with `COUNT(pu.id)` becomes expensive (full table scan on `project_units`), and the JSON response payload grows linearly. Estimated: >500ms at 5K projects, unbounded memory for serialization.
- **Recommendation**:
  1. Add `limit`/`offset` (or cursor-based) pagination with a default page size (e.g., 20).
  2. Accept `page` and `per_page` query params in the controller.
  3. Return `{ data: [...], meta: { total, page, per_page } }` so the frontend can paginate.
  4. Consider a covering index on `project_units(project_id, id)` if COUNT performance matters at scale.

### MAJOR #2: GET /api/projects/{id} — 3 separate queries instead of 1

- **Location**: `backend/app/Controllers/ProjectController.php:81-91`
- **Description**: The `show()` method executes 3 independent queries sequentially:
  1. `$this->projectModel->find($id)` — SELECT from `projects`
  2. `$this->db()->table('project_units')->where('project_id', $id)->countAllResults()` — COUNT from `project_units`
  3. `$this->db()->table('budget_movements')->selectSum('amount')->where('project_id', $id)->get()` — SUM from `budget_movements`

  Each call also creates a new DB connection via the `db()` helper method (line 19: `\Config\Database::connect()`), though CI4 reuses the default connection by default.
- **Impact**: 3 round-trips to MySQL per request. The `budget_movements` SUM query scans all movements for the project without filtering by `status='approved'` — this may return incorrect totals (includes pending movements) and scans more rows than necessary.
- **Recommendation**:
  1. Combine into a single query using subqueries:
     ```sql
     SELECT p.*,
            (SELECT COUNT(*) FROM project_units WHERE project_id = p.id) AS unit_count,
            (SELECT COALESCE(SUM(amount), 0) FROM budget_movements
             WHERE project_id = p.id AND status = 'approved') AS budget_used
     FROM projects p WHERE p.id = ?
     ```
  2. Add `AND status = 'approved'` filter to the budget SUM — per CLAUDE.md rule #6, balances must be derived from movements, and only approved movements should count.
  3. The existing index `budget_movements(project_id)` covers the WHERE clause; adding `status` to a composite index `(project_id, status, amount)` would make this a covering index.

### MINOR #3: Sub-resource endpoints lack pagination

- **Location**: `backend/app/Controllers/ProjectController.php:225-231` (`units()`) and `backend/app/Controllers/ProjectController.php:241-247` (`houseModels()`)
- **Description**: Both `GET /api/projects/{id}/units` and `GET /api/projects/{id}/house-models` return all rows with no pagination. A large condo project can have 500–2,000+ units.
- **Impact**: At 1,000 units with ~20 columns each (including TEXT fields like `remark`), the JSON payload can reach 500KB–1MB. This increases API response time and frontend memory usage.
- **Recommendation**: Add pagination (limit/offset) or, if the frontend needs all units for a dropdown, add a lightweight endpoint that returns only `id` and `unit_code`.

### MINOR #4: Missing index on `projects.status`

- **Location**: `backend/app/Database/Migrations/2026-03-14-000003_CreateProjectsTable.php`
- **Description**: The `projects` table has indexes on `id` (PK) and `code` (UNIQUE) but no index on `status`. The list endpoint filters by `p.status` (line 59 of ProjectModel) via `$builder->where('p.status', $status)`.
- **Impact**: Low impact currently — projects table is small (likely <1,000 rows). MySQL will use a full table scan, which is fine for small tables. However, if status filtering is common, an index improves plan stability.
- **Recommendation**: Add an index on `projects(status)` or a composite `projects(status, project_type)` in a future migration. Low priority.

### MINOR #5: `deleteProjectCascade()` — 10 sequential DELETEs without FK CASCADE

- **Location**: `backend/app/Models/ProjectModel.php:96-122`
- **Description**: The cascade delete performs 10 separate DELETE statements in a transaction. The `bottom_line_mapping_columns` delete uses a subquery (lines 106-110). All related tables have FK constraints with `RESTRICT` on delete, meaning the manual cascade is necessary.
- **Impact**: 10 round-trips to MySQL per delete. The subquery DELETE for `bottom_line_mapping_columns` could be slow if the `bottom_line_mapping_presets` table is large (nested subquery). However, project deletion is a rare admin-only operation.
- **Recommendation**:
  1. Consider changing FK constraints from `RESTRICT` to `CASCADE` on delete for child tables (`number_series`, `user_projects`, `project_units`, etc.) — this would reduce the method to a single `DELETE FROM projects WHERE id = ?`.
  2. If `RESTRICT` is intentional (to prevent accidental cascades), the current approach is acceptable but could batch the DELETEs or at least replace the subquery with a JOIN delete.
  3. Low priority since this is a rare operation.

### MINOR #6: Response payload returns all columns including TEXT fields

- **Location**: `backend/app/Models/ProjectModel.php:38` — `p.*` in list query; `backend/app/Controllers/ProjectController.php:81` — `find($id)` returns all columns
- **Description**: Both the list and detail endpoints return all project columns via `SELECT p.*`, including `description` (TEXT) and `location` (VARCHAR 500). The list endpoint does not need these fields for a table/card view.
- **Impact**: Minor — TEXT fields add payload size. At 100 projects with 500-char descriptions, that's ~50KB of unnecessary data in the list response.
- **Recommendation**: Use explicit `->select('p.id, p.code, p.name, p.project_type, p.status, p.pool_budget_amount, p.created_at')` in the list query. Keep `p.*` for the detail endpoint where all fields are needed.

## Index Coverage Summary

| Table | Column(s) | Index Exists? | Used By |
|-------|-----------|---------------|---------|
| `projects.id` | PK | Yes | find(), show() |
| `projects.code` | UNIQUE | Yes | isCodeDuplicate() |
| `projects.status` | — | **No** | list filter |
| `project_units(project_id, unit_code)` | UNIQUE | Yes | units endpoint |
| `project_units(project_id, status)` | INDEX | Yes | unit filtering |
| `budget_movements.project_id` | INDEX | Yes | budget SUM in show() |
| `budget_movements(unit_id, budget_source_type, status)` | INDEX | Yes | budget calculations |
| `user_projects(user_id, project_id)` | UNIQUE | Yes | access control |
| `sales_transactions(project_id, status)` | INDEX | Yes | hasSalesTransactions() |

## Priority

1. **MAJOR #1** (pagination) — implement first, prevents unbounded growth
2. **MAJOR #2** (3-query show) — combine queries, fix missing `status='approved'` filter on budget SUM
3. MINOR #3–#6 — address opportunistically
