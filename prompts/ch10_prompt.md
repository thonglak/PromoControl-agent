# Ch10 Project: PromoControl Incident Response — Competing Hypotheses

## Prerequisites
- PromoControl from ch6-8
- 4 investigator agents (new in ch10)
- `backend.md` + `qa.md` from ch6 (for fix phase)

## Step 1: ทดสอบ investigator แยก

```bash
claude --agent log-analyzer
> Investigate all middleware and logging in app/Filters/ and app/Services/.
> Check for synchronous I/O, excessive logging, or performance issues in budget calculations.

claude --agent code-auditor
> Check git log for recent commits that touch budget movement or allocation paths.
> Look for any changes that could affect calculation accuracy or performance.
```

## Step 2: รวมเป็นทีมด้วย Agent Teams

```bash
tmux new -s incident
claude
```

### Prompt สร้างทีม:

```
Check if Agent Team is enabled, create team by Agent Teams not subagents.

INCIDENT: PromoControl budget calculations showing incorrect remaining amounts.
Some units showing negative budgets when they shouldn't be possible.
Sales entries sometimes display wrong profit numbers. Issue detected after
promotion sales update. Budget summaries and approval workflows affected.
Error rate is about 5% of transactions.

Your job: find the root cause using the Competing Hypotheses pattern.

IMPORTANT RULES:
- REUSE existing teammates: send message if idle, don't spawn new
- Investigators are READ-ONLY — do NOT modify code during investigation
- After root cause found, ask me before fixing

=== PHASE 1: COMPETING HYPOTHESES (parallel) ===

Spawn 4 investigator teammates. Each investigates from a different
angle with their own hypothesis about budget calculation failures:

1. log-analyzer: Investigate all middleware and BudgetMovementService logging.
   Look for synchronous I/O, excessive logging, database transaction issues,
   or anything that could cause race conditions in budget updates.
   Write to docs/incident/hypothesis-logs.md

2. db-inspector: Investigate database layer.
   Check for missing indexes on budget_movements, N+1 queries in
   getBalance/getPoolBalance methods, lock contention, transaction isolation,
   slow SUM queries without proper indexing, uncommitted transactions.
   Write to docs/incident/hypothesis-database.md

3. promotion-validator: Investigate promotion formula calculations.
   Check fee_formula logic, eligibility matching, calculation rules,
   formula_type enum handling, edge cases in approved_amount calculation.
   Write to docs/incident/hypothesis-promotions.md

4. code-auditor: Investigate recent code changes.
   Use git log and git diff to find commits that changed budget movement
   or allocation logic. Look for recent changes to BudgetMovementService,
   fee formula implementation, or approval workflows.
   Write to docs/incident/hypothesis-code.md

After initial findings, investigators MUST:
- Read each other's findings
- Challenge hypotheses that lack evidence
- Corroborate hypotheses that have strong evidence
- Update their own findings based on cross-team discussion
- Converge on the most supported root cause

=== PHASE 2: ROOT CAUSE ANALYSIS ===

After investigators converge, synthesize into docs/incident/rca.md:
- Root cause with evidence from multiple investigators
- Contributing factors (e.g., race condition + missing index)
- At least 3 recommended fix options with trade-offs
- Impact assessment (which transactions affected, how to verify)

=== PHASE 3: HUMAN-IN-THE-LOOP — FIX DECISION ===

Present the fix options to me with pros/cons for each.
Ask me which approach to take (e.g., add transaction locking, improve indexing,
refactor calculation logic).
Do NOT decide for me — this is a business decision affecting data integrity.

=== PHASE 4: FIX + TEST ===

After I choose:
1. Use backend teammate to implement the fix (do NOT fix yourself)
2. Use qa teammate to run all tests (especially budget + promotion tests)
3. If tests fail, use backend to fix, then qa again
4. Do NOT finish until all tests pass
5. Add regression tests for this specific issue

Write post-incident report to docs/incident/post-mortem.md including:
- Timeline of the incident
- Root cause with technical details
- Fix applied with code changes
- Data remediation steps (if needed)
- Lessons learned
- Prevention recommendations (monitoring, tests, code review focus areas)
```

> **Key Concepts:**
> - Competing hypotheses: 4 investigators with different theories, cross-challenge
> - Anti-anchoring: prevents single agent from fixating on first theory
> - Root-cause agnostic: investigators find whatever is actually wrong
> - Budget critical: data integrity is business-critical
> - Human-in-the-loop: user decides fix approach (not AI)
> - Fix with existing agents: backend (ch6) fixes, qa (ch7) runs test gate
> - Promotion validator: new angle for budget-related incidents

## Step 3: สังเกต Scientific Debate

สิ่งที่ควรเกิดขึ้น:
- Round 1: ทุกคน report initial findings ตาม hypothesis ของตัวเอง
- Round 2: investigators อ่าน findings ของกันและกัน แล้ว challenge
  - ตัวอย่าง: "getBalance queries ใช้ดี ไม่ใช่ N+1 — ลองดู transaction logic"
  - ตัวอย่าง: "code-auditor เจอ commit ที่เปลี่ยน fee formula logic ไม่นานมานี้"
- Round 3: converge — hypotheses ที่มีหลักฐานน้อยถูกตัดออก เหลือ root cause
- Lead สรุป RCA → ถามผู้ใช้เลือก fix → backend แก้ → qa test → done

## Step 4: ตรวจผลลัพธ์

- `docs/incident/hypothesis-*.md` — 4 investigation reports with evidence
- `docs/incident/rca.md` — root cause analysis with fix options
- `docs/incident/post-mortem.md` — full post-incident report
- Fix applied + all tests pass + regression tests added

## Roster Update

```
After ch10: 17 agents total
  backend, frontend, qa          (from ch6)
  security-reviewer              (from ch7)
  performance-reviewer           (from ch7)
  test-reviewer                  (from ch7)
  db-migrator                    (from ch8)
  budget-engine                  (from ch8)
  writer-auth, writer-master-data (from ch9)
  writer-budget, doc-reviewer    (from ch9)
  log-analyzer                   (NEW in ch10)
  db-inspector                   (NEW in ch10)
  promotion-validator            (NEW in ch10)
  code-auditor                   (NEW in ch10)
```
