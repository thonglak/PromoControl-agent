# Ch11 Project: Cross-Repo Coordination — Extract Budget Module

## Prerequisites
- PromoControl from ch6-8 (with budget service code to extract)
- New agents: `library-extractor.md`, `consumer-updater.md`
- `security-reviewer.md` from ch7 (review extracted library)
- `qa.md` from ch6 (test gate for each repo)

## Setup: เตรียม 2 Repos

```bash
# promocontrol repo ควรมีอยู่แล้วจากบทที่ 6-8
# สร้าง library repo ใหม่ สำหรับ budget module
mkdir -p ~/projects/promocontrol-budget && cd ~/projects/promocontrol-budget && git init && composer init -y
```

## Step 1: ทดสอบ library-extractor แยก

```bash
claude --agent library-extractor
> Extract the BudgetMovementService and related classes from
> ~/projects/promocontrol/app/Services/ into a standalone
> Composer library at ~/projects/promocontrol-budget/
> Write CHANGELOG.md with exports and migration guide.
```

## Step 2: รวมเป็นทีมด้วย Agent Teams

```bash
tmux new -s cross-repo
claude
```

### Prompt สร้างทีม:

```
Check if Agent Team is enabled, create team by Agent Teams not subagents.
Extract the budget movement module from PromoControl into a standalone
PHP library, then update PromoControl to use it.

This is a CROSS-REPO task across 2 repositories:
- ~/projects/promocontrol-budget/ (new Composer library — extract budget here)
- ~/projects/promocontrol/ (existing app — migrate to use library)

IMPORTANT RULES:
- REUSE existing teammates: send message if idle, don't spawn new
- Do NOT fix code yourself — use teammates
- CHANGELOG.md is the contract (like api-spec.md in ch6)

=== PHASE 1: EXTRACT LIBRARY (sequential) ===

Spawn library-extractor to work in ~/projects/promocontrol-budget/:
- Read PromoControl's budget code: BudgetMovementService, related helpers,
  fee formula calculation logic, NumberSeriesService integration
- Extract into standalone Composer library with clean public API (namespaced)
- Write comprehensive unit tests for the library
- Write CHANGELOG.md with exports, classes, breaking changes, and migration guide
- BROADCAST when library is ready

consumer-updater must WAIT for this phase.

=== PHASE 2: UPDATE CONSUMER (after Phase 1) ===

After library-extractor broadcasts, spawn consumer-updater
to work in ~/projects/promocontrol/:
- Read CHANGELOG.md from ~/projects/promocontrol-budget/ for migration guide
- Install the library (composer require ~/projects/promocontrol-budget)
- Replace all internal BudgetMovementService imports with library imports
- Update service registration in Config files
- Delete old internal budget service directory
- Run build + tests

After consumer-updater finishes, use qa to run all tests
in ~/projects/promocontrol/. If tests fail, use consumer-updater
to fix, then qa again.

=== PHASE 3: SECURITY REVIEW (after Phase 2) ===

After PromoControl passes tests, spawn security-reviewer to review
the extracted budget library at ~/projects/promocontrol-budget/.
Focus on: budget calculation logic security, transaction handling,
approval workflow integrity, input validation, race condition prevention.
Write findings to ~/projects/promocontrol-budget/docs/security-review.md.

If CRITICAL findings, ask me which to fix now.
Use library-extractor to fix, then qa to retest both repos.

=== PHASE 4: SUMMARY ===

Report:
- Library: what's exported, version, test results, package info
- PromoControl: what changed, tests pass/fail, migration completeness
- Security review: findings summary, any deferred issues
```

> **Key Concepts:**
> - Cross-repo: teammates work in different repositories (budget service extraction)
> - CHANGELOG as contract: like api-spec.md from ch6
> - Phased execution from ch8: library first → consumer after
> - Security review from ch7: review the extracted budget library for calculation integrity
> - QA test gate from ch7: qa runs tests in each repo
> - Business-critical: budget logic must remain correct after extraction

## Step 3: สังเกต Cross-Repo Coordination

สิ่งที่ควรเกิดขึ้น:
- Phase 1: library-extractor works alone in promocontrol-budget/
- library-extractor broadcasts "Library ready. Read CHANGELOG.md"
- Phase 2: consumer-updater reads CHANGELOG.md, migrates PromoControl
- qa runs tests in PromoControl after migration
- Phase 3: security-reviewer checks the budget library integrity
- If CRITICAL: ask user → fix → qa again

## Step 4: ตรวจผลลัพธ์

- `~/projects/promocontrol-budget/` — standalone budget library with tests
- `~/projects/promocontrol-budget/CHANGELOG.md` — contract for consumers
- `~/projects/promocontrol-budget/docs/security-review.md` — security findings
- `~/projects/promocontrol/` — migrated to use library, old service deleted, tests pass
- composer.json in PromoControl references the new library

## Roster Update (Final)

```
After ch11: 19 agents total (all reusable)
  backend, frontend, qa          (from ch6)
  security-reviewer              (from ch7)
  performance-reviewer           (from ch7)
  test-reviewer                  (from ch7)
  db-migrator                    (from ch8)
  budget-engine                  (from ch8)
  writer-auth, writer-master-data (from ch9)
  writer-budget, doc-reviewer    (from ch9)
  log-analyzer, db-inspector     (from ch10)
  promotion-validator            (from ch10)
  code-auditor                   (from ch10)
  library-extractor              (NEW in ch11)
  consumer-updater               (NEW in ch11)
```
