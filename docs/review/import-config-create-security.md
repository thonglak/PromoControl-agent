# Security Review: Import Config CREATE Feature

**Reviewer**: security-reviewer agent  
**Date**: 2026-04-02  
**Scope**: `POST /api/import-configs` — controller create(), service create(), route filters, validation  
**Severity counts**: CRITICAL: 0 | MAJOR: 3 | MINOR: 4

---

## Findings

---

#### [MAJOR] — Error message exposes internal details to client

- **File**: `backend/app/Controllers/ImportConfigController.php:139-142`
- **Issue**: The catch block returns `$e->getMessage()` directly to the client. The service at line 126 wraps the original exception message: `'สร้าง config ไม่สำเร็จ: ' . $e->getMessage()`. If the inner exception comes from a database error (e.g. constraint violation, connection failure), the raw DB error message — including table names, column names, and potentially SQL fragments — is leaked to the caller.
- **Risk**: Information disclosure. Attackers learn internal schema details (table/column names, constraint names) which aids further attacks such as SQL injection on other endpoints.
- **Recommendation**: Return a generic Thai error message to the client (e.g. `'สร้าง config ไม่สำเร็จ'`). Log the full `$e->getMessage()` server-side via `log_message('error', ...)` for debugging.

---

#### [MAJOR] — AccessLevelFilter not applied to import-configs routes

- **File**: `backend/app/Config/Routes.php:185-193`
- **Issue**: The import-configs route group uses `['filter' => 'role:admin,manager']` but does NOT include the `'access'` filter. Compare with the projects write routes at line 38 which use `['filter' => ['role:admin,manager', 'access']]`. This means a manager with `access_level = 'view'` on a specific project can still create/update/delete import configs for that project — the controller's `canAccessProject()` only checks if the project is in the user's `project_ids` list, not the access level.
- **Risk**: A manager who should have read-only access to a project can create, modify, and delete import configurations for that project, violating the principle of least privilege.
- **Recommendation**: Change the route filter to `['filter' => ['role:admin,manager', 'access']]` to enforce project-level access levels consistently.

---

#### [MAJOR] — Incomplete validation allows invalid/dangerous data through

- **File**: `backend/app/Controllers/ImportConfigController.php:303-333`
- **Issue**: `validatePayload()` only validates `config_name` (not empty) and `import_type` (enum). The following fields are NOT validated:
  1. **`target_table`** — accepts any string. While CI4 Query Builder parameterizes values, `target_table` could be used later as a table name in queries (which cannot be parameterized), creating a potential SQL injection vector if the value is ever used in `$db->table($targetTable)`.
  2. **`file_type`** — not validated (service defaults to `'xlsx'` at line 105). The DB ENUM constraint catches invalid values, but the raw DB error leaks back to the client (see finding #1).
  3. **`header_row` / `data_start_row`** — cast to `(int)` at service line 107-108, so `"abc"` becomes `0` and `-5` is accepted as-is. No validation for positive integers. A `header_row=0` or negative value could cause unexpected behavior in preview.
  4. **`columns[].data_type`** — not validated. The service accepts any string at line 400 (`$col['data_type'] ?? 'string'`). The DB ENUM constraint will reject invalid values, but again the raw error leaks.
  5. **`columns` array** — is optional (`isset` check at line 317). A config can be created with zero columns. Whether this is a security issue depends on business rules, but it could lead to broken import configs that fail at preview time.
- **Risk**: Invalid data bypasses app-level validation, relying on DB constraints as the only defense. DB constraint errors expose internal schema details (see finding #1). The `target_table` field is particularly dangerous if ever used as a dynamic table name.
- **Recommendation**: Add explicit validation for `target_table` (whitelist of allowed table names), `file_type` (enum: xlsx, xls, csv), `header_row`/`data_start_row` (positive integers >= 1), and `columns[].data_type` (enum: string, number, date, decimal). Consider requiring at least one column.

---

#### [MINOR] — Race condition on unique config_name check

- **File**: `backend/app/Services/ImportConfigService.php:430-443`
- **Issue**: `assertUniqueConfigName()` performs a SELECT to check uniqueness at the application level before the INSERT. Two concurrent requests with the same `config_name` + `project_id` could both pass the check, then one INSERT succeeds and the other hits the DB UNIQUE constraint (`addUniqueKey(['project_id', 'config_name'])` at migration line 35).
- **Risk**: Low. The DB-level UNIQUE constraint at migration line 35 prevents actual duplicates, so data integrity is preserved. However, the DB constraint error message leaks through the catch block (see finding #1) instead of returning the friendly Thai message from `assertUniqueConfigName()`.
- **Recommendation**: This is acceptable as defense-in-depth since the DB constraint exists. However, catch the duplicate key DB exception specifically and return the friendly error message instead of the raw DB error. Alternatively, use `INSERT ... ON DUPLICATE KEY` or a DB-level lock.

---

#### [MINOR] — is_default toggle not fully atomic with the INSERT

- **File**: `backend/app/Services/ImportConfigService.php:92-122`
- **Issue**: `clearDefault()` (line 97) and the config INSERT (line 100) are correctly wrapped in a single transaction (`transBegin`/`transCommit`). If either fails, `transRollback()` is called. This is properly implemented — the transaction ensures atomicity.
- **Risk**: None for data integrity. However, the `transBegin()`/`transCommit()` pattern (manual transaction) does not use `transStart()`/`transComplete()` which auto-rollbacks on failure. A missed rollback path could theoretically leave the connection in a broken transaction state, but the current try/catch handles this correctly.
- **Recommendation**: No action required. The current implementation is correct. Consider using `transStart()`/`transComplete()` for slightly cleaner code, but this is stylistic.

---

#### [MINOR] — created_by relies on request attribute set by JwtAuthFilter

- **File**: `backend/app/Controllers/ImportConfigController.php:131` and `backend/app/Filters/JwtAuthFilter.php:106`
- **Issue**: `$this->userId()` reads `$this->request->user_id` which is set by JwtAuthFilter from `$payload->sub` (the JWT subject claim) at filter line 106. Since JwtAuthFilter is applied globally to all `/api/*` routes via `Filters.php:100-102`, and the JWT is cryptographically verified with HS256 + `JWT_SECRET`, this value cannot be spoofed by the client without knowing the secret.
- **Risk**: None, assuming `JWT_SECRET` is strong and not leaked. The value is trustworthy.
- **Recommendation**: No action required. Verify that `JWT_SECRET` in `.env` is at least 32 characters of random data and not a default/weak value.

---

#### [MINOR] — XSS risk in config_name and field_label is mitigated by JSON API

- **File**: `backend/app/Services/ImportConfigService.php:84,399`
- **Issue**: `config_name` and `field_label` accept arbitrary strings without HTML sanitization. If these values contain `<script>` tags or other HTML, they are stored as-is in the database.
- **Risk**: Low. The API returns JSON responses (`setJSON()`), and Angular's default template binding (`{{ }}`) auto-escapes HTML. XSS would only be possible if the frontend uses `[innerHTML]` binding on these fields without sanitization, which is unlikely for config names/labels.
- **Recommendation**: No immediate action for the API layer. Ensure the Angular frontend does not use `[innerHTML]` or `bypassSecurityTrustHtml()` for these fields. Optionally, strip HTML tags on input as defense-in-depth.

---

## Summary

| Severity | Count | Key Issues |
|----------|-------|------------|
| CRITICAL | 0     | — |
| MAJOR    | 3     | Error message exposure, missing AccessLevelFilter, incomplete validation |
| MINOR    | 4     | Race condition (mitigated by DB), transaction style, created_by (safe), XSS (mitigated by JSON+Angular) |

### Auth Filter Chain Analysis

| Filter | Applied? | How |
|--------|----------|-----|
| JwtAuthFilter | Yes | Globally via `$filters['jwt_auth']['before'] = ['api/*']` in Filters.php:100 |
| RoleFilter | Yes | Via route config `'filter' => 'role:admin,manager'` in Routes.php:185 |
| AccessLevelFilter | **NO** | Missing from import-configs route group — should be added |

### Priority Fix Order

1. **Error message exposure** (MAJOR) — quick fix, high impact on info disclosure
2. **Add AccessLevelFilter** (MAJOR) — one-line route config change
3. **Validation completeness** (MAJOR) — add missing field validations in `validatePayload()`
