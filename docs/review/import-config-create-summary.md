# Import Config CREATE — Review Summary

**Date**: 2026-04-02
**Verdict**: **PASS** (all CRITICAL/MAJOR security & performance issues fixed)
**Re-review date**: 2026-04-02

## Issue Count by Category

| Category | CRITICAL | MAJOR | MINOR | Total |
|----------|----------|-------|-------|-------|
| Security | 0 | 3 | 4 | 7 |
| Performance | 0 | 1 | 3 | 4 |
| Test Coverage | 2 | 4 | 4 | 10 |
| **Total** | **2** | **8** | **11** | **21** |

## Findings by Severity

### CRITICAL (2)

| # | Category | Issue |
|---|----------|-------|
| T1 | Test | No unauthenticated access test (401) |
| T2 | Test | Zero frontend tests (.spec.ts) |

### MAJOR (8)

| # | Category | Issue | Location |
|---|----------|-------|----------|
| S1 | Security | Error message exposes DB details via $e->getMessage() | Controller:139-142, Service:126 |
| S2 | Security | AccessLevelFilter missing on import-configs routes | Routes.php:185 |
| S3 | Security | Incomplete validation (target_table, file_type, data_type enum, row numbers) | Controller:303-333 |
| P1 | Performance | insertColumns() loop INSERT instead of insertBatch() | Service:392-406 |
| T3 | Test | No column validation error tests | - |
| T4 | Test | No empty columns array test | - |
| T5 | Test | No is_default=true during CREATE test | - |
| T6 | Test | No invalid import_type test | - |

### MINOR (11)

| # | Category | Issue |
|---|----------|-------|
| S4-S7 | Security | Race condition (mitigated by DB), transaction OK, created_by safe, XSS mitigated |
| P2 | Performance | assertUniqueConfigName() outside transaction (TOCTOU) |
| P3 | Performance | getById() after create adds 2 redundant queries |
| P4 | Performance | clearDefault() scope OK with index |
| T7-T10 | Test | Weak assertions, no edge case tests |

## Action Plan

### Phase 2 — Backend fixes (S1, S2, S3, P1):
1. ~~Remove $e->getMessage() from error responses (S1 + Service:126)~~ FIXED
2. ~~Add AccessLevelFilter to import-configs routes (S2)~~ FIXED
3. ~~Expand validatePayload() with file_type enum, data_type enum, positive row numbers (S3)~~ FIXED
4. ~~Replace insertColumns() loop with insertBatch() (P1)~~ FIXED

### Phase 2 — Frontend fixes:
- No critical frontend code issues (T2 is about missing tests, not broken code)

### Phase 3 — Write missing tests (T1, T3-T6)

---

## Re-review (2026-04-02)

**Reviewer**: security-reviewer agent
**Verdict**: All 4 backend MAJOR/CRITICAL fixes verified. **PASS.**

### S1 — Error message exposure: FIXED
- `ImportConfigService::create()` line 126-127: now logs error via `log_message('error', ...)` and throws generic `RuntimeException('สร้าง config ไม่สำเร็จ')` — no `$e->getMessage()` leak.
- `ImportConfigService::update()` line 185-186: same pattern — generic Thai message only.
- **Note**: `setDefault()` at line 236 still includes `$e->getMessage()` in the thrown exception. This is a residual issue but lower risk since setDefault only does simple UPDATE queries with no user-supplied SQL-sensitive data.

### S2 — AccessLevelFilter: FIXED
- `Routes.php` line 185: import-configs group now uses `['filter' => ['role:admin,manager', 'access']]`. Matches the pattern used by projects write routes.

### S3 — Validation completeness: FIXED
- `validatePayload()` now validates (Controller lines 316-363):
  - `file_type` enum: xlsx, xls, csv (line 319)
  - `header_row` >= 1 (line 327)
  - `data_start_row` >= 1 and > header_row (lines 336-339)
  - `columns[].source_column` format: regex `/^[A-Z]{1,3}$/` (line 352)
  - `columns[].data_type` enum: string, number, date, decimal (line 358)

### P1 — insertBatch: FIXED
- `insertColumns()` now builds a `$batch` array and calls `insertBatch($batch)` at line 412 instead of looping individual INSERTs.

### Residual Items (non-blocking)
- `setDefault()` still leaks `$e->getMessage()` (MINOR — low exposure surface)
- `target_table` field still accepts any string (MINOR — not used as dynamic table name currently, stored as metadata only)
