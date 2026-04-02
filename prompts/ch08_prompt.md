# Ch8 Project: PromoControl Budget Engine — Phased Execution

## Prerequisites
- PromoControl from ch6 (working auth + master data)
- Copy agents: `backend.md`, `frontend.md`, `qa.md` from ch6
- New agent: `db-migrator.md` (ch8 specialist)
- New agent: `budget-engine.md` (ch8 validator)
- Copy skills from ch6: `frontend-design`, `webapp-testing`

## Step 1: ทดสอบ db-migrator แยก

```bash
claude --agent db-migrator
> Read docs/03-database-schema.md for budget tables.
> Create CodeIgniter 4 migrations for: promotion_item_master,
> fee_formulas, fee_rate_policies, budget_movements.
> Generate the migrations.
```

## Step 2: รวมเป็นทีมด้วย Agent Teams

```bash
tmux new -s budget
claude
```

### Prompt สร้างทีม:

```
Check if Agent Team is enabled, create team by Agent Teams not subagents.
Add Promotion Items & Budget Engine to PromoControl system.
This includes promotion formulas, fee calculations, and budget movements.

IMPORTANT RULES:
- Do NOT fix code yourself — ALWAYS use teammates
- REUSE existing teammates: if idle, send message instead of spawning new
- After every fix/build phase, use qa to run tests

=== PHASE 1: DATABASE MIGRATION (sequential) ===

Spawn db-migrator to:
- Create CodeIgniter 4 migrations for promotion tables:
  * promotion_item_master (code, name, category, value_mode, etc.)
  * promotion_item_house_models (eligibility junction)
  * promotion_item_units (eligibility junction)
  * fee_formulas (promotion_item_id, formula_type, etc.)
  * fee_rate_policies (conditions for fee calculation)
  * budget_movements (movement_type, budget_source_type, amount, status)
- Run all migrations
- Broadcast to all teammates when done

ALL other teammates must WAIT for db-migrator to finish.
Do NOT spawn backend or frontend until migration is complete.

=== PHASE 2: API + FRONTEND (parallel, after Phase 1) ===

After db-migrator broadcasts, spawn in parallel:

1. backend: Update docs/04-api-spec.md with promotion + budget endpoints first:
   - POST /api/promotion-items (create promotion)
   - GET /api/promotion-items (list with eligibility)
   - PUT /api/promotion-items/:id (update promotion)
   - DELETE /api/promotion-items/:id (delete promotion)
   - POST /api/budget-movements (record movement)
   - GET /api/budget/summary?project_id=&unit_id= (budget summary)
   - GET /api/budget/pool?project_id= (pool balance)
   Then implement all endpoints using BudgetMovementService.
   Message frontend when api-spec.md is updated.
   Use worktree isolation.

2. frontend: Wait for backend to update api-spec.md.
   Read docs/04-api-spec.md and docs/05-frontend-spec.md for exact paths.
   Build PromotionItemListComponent, PromotionFormDialog,
   BudgetSummaryPanel, BudgetMovementListComponent.
   Use Angular Material + Tailwind CSS.
   Use worktree isolation.

3. budget-engine (read-only validator): After backend finishes,
   validate BudgetMovementService calculations using budget-engine agent.
   Check: allocation logic, balance calculations, pool management,
   formula validations. Write validation report to docs/budget-validation.md

=== PHASE 3: MERGE + TEST (after Phase 2) ===

After backend + frontend finish:
1. Merge worktrees
2. Use qa to run all tests (integration + E2E)
3. If tests fail, use backend/frontend to fix, then qa again
4. Do NOT proceed until all tests pass

Report final results with:
- Number of new endpoints added
- Number of new components created
- Budget calculation validation results
- Test results (pass/fail count)
```

> **Key Point:** This is phased execution — Phase 1 must finish before Phase 2 starts.
> Budget calculations are critical — budget-engine validates after backend implementation.
> Same agents (backend, frontend, qa) + two new specialists (db-migrator, budget-engine).
> API spec contract continues from ch6.
> QA test gate continues from ch7.

## Step 3: สังเกต Phased Execution

สิ่งที่ควรเกิดขึ้น:
- Phase 1: db-migrator works alone, others idle
- db-migrator broadcasts "migration complete"
- Phase 2: backend updates api-spec.md → frontend starts after
- backend + frontend work in parallel
- budget-engine validates calculations after backend done
- Phase 3: Lead merges → qa runs tests → pass/fail

## Step 4: ตรวจผลลัพธ์

- `app/Database/Migrations/` — new promotion + budget tables
- `docs/04-api-spec.md` — updated with promotion + budget endpoints
- `app/Services/BudgetMovementService.php` — budget calculation engine
- `app/Controllers/PromotionItemController.php` + `BudgetController.php`
- `src/app/features/promotion/` — Angular promotion components
- `src/app/features/budget/` — Angular budget UI
- `docs/budget-validation.md` — budget calculation validation report
- `tests/` — integration + E2E tests pass

## Roster Update

```
After ch8: 9 agents total
  backend, frontend, qa          (from ch6)
  security-reviewer              (from ch7)
  performance-reviewer           (from ch7)
  test-reviewer                  (from ch7)
  db-migrator                    (NEW in ch8)
  budget-engine                  (NEW in ch8)
```
