# Ch7 Project: PromoControl Code Review Pipeline — Review → Fix → Test → Re-Review

## Step 1: ทดสอบแต่ละ Reviewer แยก

```bash
# ทดสอบ security reviewer
claude --agent security-reviewer
> Review all files in app/ and src/ for security vulnerabilities.
> Focus on JWT auth, role-based access control, SQL injection, and secrets.
> Write findings to docs/review-security.md

# ทดสอบ performance reviewer
claude --agent performance-reviewer
> Review all backend files in app/Services/ and Controllers/ for performance issues.
> Focus on N+1 queries (budget SUM queries, project access checks),
> missing indexes, query efficiency. Write findings to docs/review-performance.md

# ทดสอบ test reviewer
claude --agent test-reviewer
> Review tests/ (PHPUnit + Playwright) for coverage gaps.
> Check auth tests, master data CRUD tests, integration coverage.
> Write findings to docs/review-tests.md
```

## Step 2: รวมเป็นทีมด้วย Agent Teams

```bash
tmux new -s review
claude
```

> **ต้อง copy agent definitions ของ ch6 มาด้วย:**
> `backend.md` + `frontend.md` + `qa.md` จาก ch6-project ใส่ใน `.claude/agents/` เดียวกัน
> รวมแล้ว 6 agents: 3 reviewers + 3 builders จาก ch6

### Prompt สร้างทีม:

```
Check if Agent Team is enabled, create team by Agent Teams not subagents.
Create an agent team to review the PromoControl PR.
The PR adds master data CRUD, authentication, and budget management
across 50+ files using CodeIgniter 4, Angular 21, and MySQL.

IMPORTANT RULES:
- Do NOT fix code yourself — ALWAYS use teammates to fix
- After every fix phase, use qa to run tests before proceeding
- If tests fail, use fixers to fix, then qa again
- REUSE existing teammates: if a teammate is idle, send it a
  message with the new task instead of spawning a new one.
  Only spawn a new teammate if that role doesn't exist yet.

=== PHASE 1: REVIEW ===

Spawn 3 reviewer teammates to work in parallel:

1. security-reviewer: Check for auth issues, input validation,
   secrets, OWASP top 10. Write to docs/review-security.md

2. performance-reviewer: Check for N+1 queries, missing pagination,
   memory leaks, caching gaps. Write to docs/review-performance.md

3. test-reviewer: Check test coverage, assertion quality, missing
   error path tests. Write to docs/review-tests.md

All reviewers are read-only — no worktrees needed, no file conflicts.
They can all run in parallel with zero coordination.

After all 3 finish, synthesize their findings into a single
docs/review-summary.md with:
- Overall verdict: APPROVE, REQUEST CHANGES, or BLOCK
- Combined findings sorted by severity

=== PHASE 2: AUTO-FIX CRITICAL ===

If there are CRITICAL findings, fix them automatically — no need
to ask me. Spawn backend and/or frontend teammates to fix CRITICAL
issues. Use worktree isolation. Merge worktrees after done.

Then spawn qa to run all tests (npm test + E2E).
If tests fail, spawn fixers to fix, then qa again.
Do NOT proceed to Phase 3 until all tests pass.

=== PHASE 3: HUMAN-IN-THE-LOOP FOR HIGH ISSUES ===

After CRITICAL are fixed and tests pass, present the remaining
HIGH findings to me as a numbered list with one-line summary each.
Ask me which ones I want to fix now vs defer to later.
After I choose, spawn backend and/or frontend to fix only
the ones I selected. Do NOT fix issues I didn't select.
Mark unselected issues as "deferred".

After fixes, spawn qa to run all tests again.
If tests fail, spawn fixers to fix, then qa again.

=== PHASE 4: RE-REVIEW ===

After all fixes applied and tests pass, re-run the 3 reviewers:
- security-reviewer → docs/review-security-v2.md
- performance-reviewer → docs/review-performance-v2.md
- test-reviewer → docs/review-tests-v2.md
Synthesize into docs/review-summary-v2.md.
APPROVE only if no CRITICAL findings remain.
Note deferred HIGH/MEDIUM issues — not blockers.
```

> **Key Concepts:**
> - 6 agents working together: 3 reviewers (read-only) + 3 builders (backend, frontend, qa) from ch6
> - Lead coordinates only — never fixes code himself
> - QA as test gate: after every fix phase, qa runs tests before proceeding
> - Human-in-the-loop: CRITICAL=auto-fix, HIGH=ask user, MEDIUM=defer

## Step 3: ตรวจผลลัพธ์ Review (Phase 1)

- `docs/review-security.md` — security findings
- `docs/review-performance.md` — performance findings
- `docs/review-tests.md` — test coverage findings
- `docs/review-summary.md` — Lead สรุปรวม + verdict

## Step 4: สังเกต Auto-Fix + Test Gate (Phase 2)

สิ่งที่ควรเกิดขึ้น:
- Lead spawn backend + frontend แก้ CRITICAL issues
- Lead merge worktrees
- Lead spawn qa รัน tests ← **test gate**
- ถ้า tests fail → Lead spawn fixers แก้ → qa อีกรอบ
- ถ้า tests pass → ไป Phase 3

## Step 5: Human-in-the-Loop (Phase 3)

สิ่งที่ควรเกิดขึ้น:
- Lead แสดง HIGH findings เป็น numbered list
- ผู้ใช้เลือก issues ที่จะแก้ (e.g., "1, 2, 4" หรือ "all security issues")
- Lead spawn fixers แก้เฉพาะที่เลือก
- Lead spawn qa รัน tests ← **test gate อีกรอบ**
- Issues ที่ไม่เลือก → deferred

## Step 6: Re-Review (Phase 4)

- `docs/review-summary-v2.md` — ควรเป็น APPROVE
- CRITICAL issues ทั้งหมดถูกแก้
- HIGH issues ที่เลือก ถูกแก้ + tests ผ่าน
- Deferred issues noted — ไม่ block merge

## สรุป: ทั้ง 6 Agents ทำงานร่วมกัน

```
3 Reviewers (read-only, ch7):
  security-reviewer, performance-reviewer, test-reviewer

3 Builders (from ch6):
  backend (fix security/perf issues)
  frontend (fix UI/test issues)
  qa (test gate after every fix)

Lead: coordinate ทุกอย่าง ไม่แตะ code
User: ตัดสินใจ HIGH issues (human-in-the-loop)
```
