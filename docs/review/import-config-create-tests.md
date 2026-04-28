# Import Config CREATE — Test Coverage Review

**Reviewer**: QA Agent  
**Date**: 2026-04-02  
**Scope**: CREATE-specific test coverage in `ImportConfigServiceTest.php` + frontend spec files  
**Test file**: `backend/tests/Integration/ImportConfigServiceTest.php`

---

## Summary

The test suite covers 17 tests across CRUD, set-default, validation, and permissions. CREATE happy path and basic validation are covered, but several CREATE-specific gaps exist — particularly around column validation, auth edge cases, and the complete absence of frontend tests.

---

## Existing CREATE-Related Tests

| # | Test | What it covers |
|---|------|----------------|
| 1 | `testCreateConfigWithColumnsSucceeds` | Happy path: status 201, config_name, import_type, columns count, target_field values |
| 10 | `testCannotCreateDuplicateConfigNameInSameProject` | Duplicate name → 422, checks `error` key |
| 11 | `testConfigNameCanBeDuplicatedAcrossProjects` | Cross-project same name → 201 |
| 12 | `testRequiredFieldsValidated` | Missing config_name → 422, missing import_type → 422, missing project_id → 400 |
| 13 | `testManagerCanCrudConfigs` | Manager can POST → 201 |
| 14 | `testSalesCannotCreateConfig` | Sales POST → 403 |

---

## Findings

#### [CRITICAL] — No test for unauthenticated access (no token → 401)

- **File**: `backend/tests/Integration/ImportConfigServiceTest.php` (MISSING)
- **Issue**: No test sends a POST to `api/import-configs` without an Authorization header. The auth filter should return 401, but this is never verified.
- **Impact**: If the auth filter is accidentally removed from routes or misconfigured, no test would catch it. Unauthenticated users could create configs.
- **Recommendation**: Add `testUnauthenticatedCreateReturns401()` — POST without token, assert 401.

---

#### [CRITICAL] — No frontend tests exist at all

- **File**: `frontend/src/app/features/import-settings/*.spec.ts` (MISSING — 0 spec files)
- **Issue**: The `import-settings` feature has 6 component/service files and zero `.spec.ts` files:
  - `import-config-list.component.ts` — no spec
  - `import-config-api.service.ts` — no spec
  - `import-preview.component.ts` — no spec
  - `import-config-form-dialog.component.ts` — no spec
- **Impact**: No coverage for form validation, API call construction, error handling, or dialog flow. Bugs in the create form (e.g., missing required fields not highlighted, wrong payload shape) would go undetected.
- **Recommendation**: At minimum, add:
  1. `import-config-api.service.spec.ts` — mock HttpClient, verify POST payload shape and URL
  2. `import-config-form-dialog.component.spec.ts` — form validation, submit flow, error display

---

#### [MAJOR] — No test for invalid column data in CREATE payload

- **File**: `backend/tests/Integration/ImportConfigServiceTest.php` (MISSING)
- **Issue**: The controller validates `source_column` and `target_field` per column (lines 321-327 of controller), but no test sends columns with empty `source_column`, missing `target_field`, or invalid `data_type`.
- **Impact**: Column-level validation could silently break (e.g., after refactoring `validatePayload`) and invalid columns would be persisted to DB.
- **Recommendation**: Add `testCreateWithInvalidColumnDataReturns422()` — send columns with `source_column: ''` and missing `target_field`, assert 422 with per-column error keys like `columns.0.source_column`.

---

#### [MAJOR] — No test for creating config with empty columns array

- **File**: `backend/tests/Integration/ImportConfigServiceTest.php` (MISSING)
- **Issue**: The `createConfig` helper always falls back to `sampleColumns()` when columns is empty. No test sends `'columns' => []` to verify the expected behavior. The controller only validates columns "ถ้าส่งมา" (`if isset`), so `[]` passes validation — but should a config with 0 columns be allowed?
- **Impact**: If the business rule is "configs must have at least 1 column," there's no test enforcing it. If it's allowed, there's no test proving it works.
- **Recommendation**: Add `testCreateWithEmptyColumnsArray()` — clarify expected behavior and assert accordingly (201 if allowed, 422 if not).

---

#### [MAJOR] — No test for `is_default=true` during CREATE

- **File**: `backend/tests/Integration/ImportConfigServiceTest.php` (MISSING)
- **Issue**: `testSetDefaultUnsetsExistingDefault` tests the `PUT set-default` endpoint. But the `createConfig` helper accepts `isDefault`, and the CREATE endpoint presumably handles `is_default` in the payload. No test verifies:
  1. Creating with `is_default=true` actually persists `is_default=true`
  2. Creating a second config with `is_default=true` unsets the first one's default
- **Impact**: The `is_default` logic during CREATE (vs. the separate set-default endpoint) is untested. If the service handles them differently, bugs could hide.
- **Recommendation**: Add `testCreateWithIsDefaultTrueUnsetsExistingDefault()` — create config A with is_default=true, create config B with is_default=true (same project + import_type), verify A's is_default is now false.

---

#### [MAJOR] — No test for invalid `import_type` value

- **File**: `backend/tests/Integration/ImportConfigServiceTest.php` (MISSING)
- **Issue**: The controller validates import_type against `['bottom_line', 'unit', 'promotion', 'custom']` (line 312). No test sends `import_type='invalid'` or `import_type='budget'`.
- **Impact**: If the allowed types list is changed or the validation is removed, no test catches it.
- **Recommendation**: Add `testCreateWithInvalidImportTypeReturns422()` — send `import_type: 'invalid'`, assert 422 with `errors.import_type`.

---

#### [MINOR] — Weak assertion on duplicate name error response

- **File**: `backend/tests/Integration/ImportConfigServiceTest.php:374`
- **Issue**: `testCannotCreateDuplicateConfigNameInSameProject` only checks `assertArrayHasKey('error', $json)`. It doesn't verify the error message mentions "duplicate" or "ชื่อซ้ำ" — any 422 with an `error` key would pass.
- **Impact**: If the error changes to a generic message or the wrong validation triggers the 422, the test still passes.
- **Recommendation**: Add `assertStringContainsString` on the error message to confirm it's specifically about duplicate names.

---

#### [MINOR] — Weak assertion on required fields error — missing `errors.import_type` message check

- **File**: `backend/tests/Integration/ImportConfigServiceTest.php:419`
- **Issue**: For the missing `import_type` test, line 419 checks `assertArrayHasKey('import_type', $json['errors'])` but doesn't verify the error message value. The `config_name` test also only checks key presence.
- **Impact**: The validation could return the wrong message (e.g., swapped messages between fields) and the test would still pass.
- **Recommendation**: Assert the error message values match expected Thai strings from the controller.

---

#### [MINOR] — No edge case tests for boundary values

- **File**: `backend/tests/Integration/ImportConfigServiceTest.php` (MISSING)
- **Issue**: No tests for:
  - Very long `config_name` (e.g., 500+ characters) — does the DB column truncate or reject?
  - Special characters in `field_label` (e.g., HTML tags, SQL injection strings)
  - Large number of columns (e.g., 50+) — performance/limit concerns
  - `header_row` or `data_start_row` with 0 or negative values
- **Impact**: Low — these are edge cases, but DB column truncation or unexpected payloads could cause silent data loss.
- **Recommendation**: Add a single `testCreateEdgeCases()` covering at least the long name and negative row values.

---

#### [MINOR] — `testRequiredFieldsValidated` uses inconsistent status codes

- **File**: `backend/tests/Integration/ImportConfigServiceTest.php:396-430`
- **Issue**: Missing `config_name` → 422, missing `import_type` → 422, but missing `project_id` → 400. This reflects the actual controller behavior (project_id is checked before `validatePayload`), but the test doesn't assert the error body for the 400 case — just the status code.
- **Impact**: If the project_id error response format changes, no assertion catches it.
- **Recommendation**: Add JSON body assertions for the project_id=missing case (assert `error` key with expected message).

---

## Coverage Summary

| Area | Status | Notes |
|------|--------|-------|
| Happy path CREATE | Covered | Strong assertions on response structure |
| Duplicate name validation | Covered | Weak assertion on error message |
| Required fields (config_name, import_type, project_id) | Covered | Missing message value checks |
| Column validation (source_column, target_field) | **Not covered** | Controller has validation but no test |
| Empty columns array | **Not covered** | Business rule unclear |
| is_default during CREATE | **Not covered** | Only tested via set-default endpoint |
| Invalid import_type | **Not covered** | Controller validates, no test |
| Unauthenticated access | **Not covered** | Auth filter not verified |
| Permission: admin | Covered | Via setUp admin token |
| Permission: manager | Covered | testManagerCanCrudConfigs |
| Permission: sales blocked | Covered | testSalesCannotCreateConfig |
| Permission: finance/viewer on CREATE | **Not covered** | Only tested on edit/delete |
| Frontend: form dialog | **Not covered** | No spec files exist |
| Frontend: API service | **Not covered** | No spec files exist |
| Edge cases (long name, many columns) | **Not covered** | Low priority |

**Total CREATE-specific gaps**: 4 CRITICAL/MAJOR, 4 MINOR
