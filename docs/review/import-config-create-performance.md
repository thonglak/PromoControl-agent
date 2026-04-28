# Performance Review: Import Config CREATE Feature

**Reviewer**: performance-reviewer agent
**Date**: 2026-04-02
**Scope**: `POST /api/import-configs` — create config + column mappings

---

## Files Reviewed

- `backend/app/Controllers/ImportConfigController.php` (create method, lines 106-143)
- `backend/app/Services/ImportConfigService.php` (create, insertColumns, assertUniqueConfigName, clearDefault)
- `backend/app/Database/Migrations/2026-04-02-000001_CreateImportConfigTables.php`

---

## Findings

#### [MAJOR] — insertColumns() uses N individual INSERT queries instead of batch insert
- **File**: `backend/app/Services/ImportConfigService.php:392-406`
- **Issue**: `insertColumns()` iterates over the columns array and calls `$this->db->table('import_config_columns')->insert()` once per column inside a `foreach` loop. For a config with 20 columns, this fires 20 separate INSERT statements.
- **Impact**: O(n) INSERT queries per create request, where n = number of columns. A typical mapping with 15-25 columns produces 15-25 round-trips to MySQL. At ~0.5ms per insert on local Docker, that adds 7-12ms unnecessary latency. Under concurrent load this compounds due to transaction lock hold time.
- **Recommendation**: Replace the loop with `$this->db->table('import_config_columns')->insertBatch($batchData)` to issue a single `INSERT INTO ... VALUES (...), (...), (...)` statement. Build the `$batchData` array in the loop, then insert once.

#### [MINOR] — assertUniqueConfigName() is called outside the transaction, creating a TOCTOU race condition
- **File**: `backend/app/Services/ImportConfigService.php:87` (call site) and `430-443` (implementation)
- **Issue**: `assertUniqueConfigName()` is called at line 87, **before** `transBegin()` at line 92. The SELECT COUNT check and the subsequent INSERT are not atomic. Two concurrent requests with the same `config_name` could both pass the uniqueness check, then both attempt to insert.
- **Impact**: Low probability in practice (admin-only endpoint, few concurrent users), but the race window exists. The UNIQUE KEY `(project_id, config_name)` on the migration (line 35) will catch this at the DB level and throw a duplicate key exception, which is caught by the `try/catch` — so data integrity is preserved. However, the error message would be a raw DB error rather than the friendly Thai message.
- **Recommendation**: Move `assertUniqueConfigName()` inside the transaction block (after `transBegin()`), or rely solely on the DB UNIQUE constraint and catch the duplicate key exception to return a user-friendly message. The latter is more robust and eliminates the extra SELECT query entirely.

#### [MINOR] — getById() after create adds 2 extra SELECT queries to return the response
- **File**: `backend/app/Controllers/ImportConfigController.php:133`
- **Issue**: After `create()` returns the new ID, the controller immediately calls `getById($newId)` which executes: (1) SELECT on `import_configs` with JOIN to `users`, and (2) SELECT on `import_config_columns`. The data was just inserted — all values are already known.
- **Impact**: 2 extra queries per create request (~1-2ms). Low individual impact, but these are fully redundant queries.
- **Recommendation**: Return the inserted data directly from `create()` by assembling the response from the input data + `$configId` + `$now` timestamp, or have `create()` return the full record. This is a minor optimization and may not be worth the added code complexity — the current approach is cleaner and ensures the response matches exactly what's in the DB.

#### [MINOR] — clearDefault() UPDATE scope could be narrowed
- **File**: `backend/app/Services/ImportConfigService.php:413-425`
- **Issue**: `clearDefault()` runs `UPDATE import_configs SET is_default=0 WHERE project_id=? AND import_type=? AND is_default=1`. This is fine because the migration at line 36 defines an index on `(project_id, import_type, is_default)`, so MySQL uses the index for both the WHERE filter and the UPDATE target row lookup.
- **Impact**: Negligible. Typically only 0-1 rows match (only one default per project+type). The index covers the query well.
- **Recommendation**: No change needed. Index coverage is adequate.

---

## Index Coverage Assessment

| Query Pattern | Index Used | Status |
|---|---|---|
| `import_configs(project_id, config_name)` UNIQUE check | `UNIQUE KEY (project_id, config_name)` at migration line 35 | Covered |
| `import_configs(project_id, import_type, is_default)` clearDefault | `KEY (project_id, import_type, is_default)` at migration line 36 | Covered |
| `import_config_columns(import_config_id)` getColumns | `KEY (import_config_id)` at migration line 68 | Covered |
| `import_configs(id)` getById | Primary Key | Covered |

All query patterns have appropriate index coverage. No missing indexes found.

---

## Transaction Scope Analysis

The `create()` method at `ImportConfigService.php:81-130`:

1. `assertUniqueConfigName()` — called **outside** transaction (line 87) — uses same `$this->db` connection
2. `transBegin()` — line 92
3. `clearDefault()` — inside transaction (line 97) — same `$this->db` connection
4. `INSERT import_configs` — inside transaction (line 100)
5. `insertColumns()` — inside transaction (line 119) — same `$this->db` connection
6. `transCommit()` — line 122

All operations use the same `$this->db` connection instance (set in constructor), so `clearDefault()` and `insertColumns()` are correctly within the transaction boundary. However, `assertUniqueConfigName()` runs before `transBegin()`, creating the TOCTOU issue noted above.

---

## Query Count Summary (per create request)

| Step | Queries | Notes |
|---|---|---|
| assertUniqueConfigName | 1 SELECT | Could be eliminated via DB constraint |
| clearDefault (if is_default) | 1 UPDATE | Only when setting default |
| INSERT config | 1 INSERT | |
| insertColumns | N INSERTs | N = column count; should be 1 batch |
| getById (after create) | 2 SELECTs | config + columns; could be eliminated |
| **Total (worst case, 20 cols)** | **25 queries** | Could be reduced to **3-4** |

---

## Summary

| Severity | Count | Key Issue |
|---|---|---|
| CRITICAL | 0 | — |
| MAJOR | 1 | insertColumns() loop — N queries instead of 1 batch |
| MINOR | 3 | TOCTOU race, redundant getById, clearDefault scope |

**Overall**: The create flow is functionally correct and will perform adequately at current scale (admin-only, low concurrency). The primary optimization target is `insertColumns()` — switching to `insertBatch()` would reduce query count from ~25 to ~4 for a typical 20-column config. The other findings are low-priority refinements.
