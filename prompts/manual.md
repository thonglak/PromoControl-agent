# คู่มือการใช้งาน Agent Teams Kit — PromoControl Edition

## สารบัญ

1. [ภาพรวม](#1-ภาพรวม)
2. [ข้อกำหนดเบื้องต้น](#2-ข้อกำหนดเบื้องต้น)
3. [การติดตั้ง](#3-การติดตั้ง)
4. [โครงสร้างไฟล์](#4-โครงสร้างไฟล์)
5. [รู้จัก Agents ทั้ง 20 ตัว](#5-รู้จัก-agents-ทั้ง-20-ตัว)
6. [วิธีใช้งานทีละ Agent](#6-วิธีใช้งานทีละ-agent)
7. [วิธีใช้งานเป็นทีม (Agent Teams)](#7-วิธีใช้งานเป็นทีม)
8. [Chapter Prompts — เริ่มต้นอย่างรวดเร็ว](#8-chapter-prompts)
9. [Coordination Patterns](#9-coordination-patterns)
10. [Skills ที่แนบมา](#10-skills-ที่แนบมา)
11. [การปรับแต่ง](#11-การปรับแต่ง)
12. [คำสั่ง Docker ที่ใช้บ่อย](#12-คำสั่ง-docker-ที่ใช้บ่อย)
13. [แก้ปัญหาที่พบบ่อย](#13-แก้ปัญหาที่พบบ่อย)
14. [Best Practices](#14-best-practices)

---

## 1. ภาพรวม

Agent Teams Kit คือชุดเครื่องมือสำหรับพัฒนาระบบ **PromoControl** (Promotion & Budget Management System สำหรับอสังหาริมทรัพย์) ด้วย Claude Code Agent Teams

ระบบประกอบด้วย **20 agents** ที่ทำงานร่วมกันเป็นทีม โดยแต่ละตัวมีบทบาทเฉพาะทาง เช่น backend developer, frontend developer, QA, security reviewer ฯลฯ

**Tech Stack:**

| ส่วน | เทคโนโลยี |
|------|-----------|
| Backend | CodeIgniter 4 + firebase/php-jwt + MySQL |
| Frontend | Angular 21 + Angular Material 21 + Tailwind CSS 3 |
| Database | MySQL 8 (via Docker) |
| Infrastructure | Docker Compose (5 services) |

**หลักการสำคัญ:**
- แต่ละ agent มี **ownership** ชัดเจน — ไม่ก้าวก่ายไฟล์ของ agent อื่น
- ใช้ **docs/04-api-spec.md** เป็น single source of truth สำหรับ API contract
- **Lead** (คุณ) เป็นผู้ประสานงาน ไม่แก้ code เอง — ใช้ teammates แก้เสมอ
- ทุก phase ต้องผ่าน **QA test gate** ก่อนไปขั้นตอนถัดไป

---

## 2. ข้อกำหนดเบื้องต้น

### ซอฟต์แวร์ที่ต้องมี

- **Claude Code** — ต้องเปิดใช้งาน Agent Teams feature
- **Docker Desktop** — สำหรับรัน PromoControl services ทั้ง 5
- **tmux** (แนะนำ) — สำหรับ session management ขณะรัน Agent Teams
- **Git** — สำหรับ version control และ worktree isolation

### ตรวจสอบ Agent Teams

```bash
# ตรวจว่า Agent Teams เปิดอยู่
claude
> /agents
```

ถ้ายังไม่เปิด ให้ตั้งค่าใน Claude Code settings

### Docker Services ที่ต้องรัน

```bash
docker compose up -d
docker compose ps   # ตรวจว่าทั้ง 5 containers running
```

| Service | URL | หน้าที่ |
|---------|-----|---------|
| promo_nginx | http://localhost:8080 | Reverse proxy |
| promo_frontend | (internal :4200) | Angular dev server |
| promo_php | (internal :9000) | CodeIgniter 4 PHP-FPM |
| promo_mysql | localhost:3309 | MySQL database |
| promo_phpmyadmin | http://localhost:8081 | MySQL GUI |

---

## 3. การติดตั้ง

### วิธีที่ 1: Copy ทั้ง folder

```bash
# copy เข้า project ของคุณ
cp -r agent-teams-kit/_claude/ /path/to/your/project/.claude/
```

### วิธีที่ 2: Copy เฉพาะที่ต้องใช้

```bash
# copy เฉพาะ agents ที่ต้องการ
mkdir -p .claude/agents .claude/skills
cp agent-teams-kit/_claude/agents/backend.md .claude/agents/
cp agent-teams-kit/_claude/agents/frontend.md .claude/agents/
cp agent-teams-kit/_claude/agents/qa.md .claude/agents/

# copy skills
cp -r agent-teams-kit/_claude/skills/frontend-design .claude/skills/
cp -r agent-teams-kit/_claude/skills/webapp-testing .claude/skills/

# copy settings (permissions)
cp agent-teams-kit/_claude/settings.json .claude/
```

### ตรวจสอบการติดตั้ง

```bash
# ดู agents ที่ติดตั้งแล้ว
ls .claude/agents/

# ทดสอบเรียก agent
claude --agent backend
> echo "Hello from backend agent"
```

---

## 4. โครงสร้างไฟล์

```
agent-teams-kit/
├── _claude/
│   ├── settings.json              ← permissions (Read, Write, Bash, etc.)
│   ├── agents/                    ← agent definitions (20 ไฟล์)
│   │   ├── backend.md             ← CI4 backend developer
│   │   ├── frontend.md            ← Angular 21 frontend developer
│   │   ├── qa.md                  ← QA engineer (PHPUnit + Playwright)
│   │   ├── security-reviewer.md   ← JWT/RBAC security review
│   │   ├── performance-reviewer.md← N+1, MySQL indexes, budget queries
│   │   ├── test-reviewer.md       ← test coverage review
│   │   ├── db-migrator.md         ← CI4 database migrations
│   │   ├── writer-auth.md         ← API docs for auth
│   │   ├── writer-products.md     ← API docs for master data
│   │   ├── writer-payment.md      ← API docs for budget/promotion
│   │   ├── doc-reviewer.md        ← documentation quality review
│   │   ├── log-analyzer.md        ← CI4 log investigation
│   │   ├── db-inspector.md        ← MySQL query analysis
│   │   ├── network-investigator.md← external service calls
│   │   ├── code-auditor.md        ← git history analysis
│   │   ├── library-extractor.md   ← extract Composer package
│   │   ├── consumer-updater.md    ← migrate to extracted library
│   │   ├── budget-engine.md       ← budget calculation validator
│   │   ├── promotion-validator.md ← promotion/fee formula validator
│   │   └── bottom-line-importer.md← Excel import pipeline
│   └── skills/
│       ├── frontend-design/       ← Angular UI design skill
│       │   └── SKILL.md
│       └── webapp-testing/        ← testing helpers skill
│           ├── SKILL.md
│           ├── examples/
│           └── scripts/
├── docs/
│   └── style-guide.md             ← API documentation style guide
├── prompt.md                      ← main prompt (copy-paste เข้า claude)
├── ch06_prompt.md                 ← Ch6: Core Build (3 teammates)
├── ch07_prompt.md                 ← Ch7: Code Review Pipeline
├── ch08_prompt.md                 ← Ch8: Budget Engine
├── ch09_prompt.md                 ← Ch9: Documentation Sprint
├── ch10_prompt.md                 ← Ch10: Incident Response
├── ch11_prompt.md                 ← Ch11: Cross-Repo Extraction
├── README.md
└── manual.md                      ← ไฟล์นี้
```

---

## 5. รู้จัก Agents ทั้ง 20 ตัว

### กลุ่ม 1: Core Builders (Ch6) — สร้างแอปจากศูนย์

| Agent | Model | Isolation | หน้าที่ |
|-------|-------|-----------|---------|
| `backend` | Sonnet | worktree | สร้าง CI4 API, Services, Migrations, Filters |
| `frontend` | Sonnet | worktree | สร้าง Angular 21 components, pages, services |
| `qa` | Opus | ไม่มี | เขียน/รัน tests (PHPUnit + Playwright) |

**กฎสำคัญของ backend:**
- Business logic อยู่ใน `app/Services/` เท่านั้น — Controllers จัดการ HTTP อย่างเดียว
- Balance = `SUM(budget_movements WHERE status='approved')` — ห้ามอัพเดทตรง
- `effective_category` ใช้คำนวณ ไม่ใช่ `promotion_category`

**กฎสำคัญของ frontend:**
- Standalone components เท่านั้น (ไม่ใช้ NgModule)
- Control flow: `@if`, `@for`, `@switch` — ห้ามใช้ `*ngIf`, `*ngFor`
- State: `signal()`, `computed()`, `effect()`
- Icons: `<app-icon name="...">` — ห้ามใช้ `<mat-icon>`
- UI labels เป็นภาษาไทย, code เป็นภาษาอังกฤษ

**กฎสำคัญของ qa:**
- ห้ามใช้ worktree — ต้อง test merged code
- แบ่ง 2 phases: Phase A (integration) → Phase B (E2E หลัง merge)
- อ่าน `docs/10-test-scenarios.md` สำหรับ test cases

### กลุ่ม 2: Code Reviewers (Ch7) — ตรวจสอบคุณภาพ

| Agent | Model | หน้าที่ |
|-------|-------|---------|
| `security-reviewer` | Opus | JWT auth, RBAC, SQL injection, OWASP |
| `performance-reviewer` | Opus | N+1 queries, MySQL indexes, budget SUM queries |
| `test-reviewer` | Opus | PHPUnit/Angular coverage, assertion quality |

ทั้ง 3 ตัวเป็น **read-only** — ไม่แก้ code, แค่รายงาน findings

### กลุ่ม 3: Database Specialist (Ch8)

| Agent | Model | Isolation | หน้าที่ |
|-------|-------|-----------|---------|
| `db-migrator` | Sonnet | ไม่มี | สร้าง CI4 migrations, MySQL schema |

**คำสั่งที่ใช้:**
```bash
docker exec promo_php php /var/www/backend/spark migrate
docker exec promo_php php /var/www/backend/spark migrate:rollback
```

### กลุ่ม 4: Documentation (Ch9)

| Agent | Model | หน้าที่ |
|-------|-------|---------|
| `writer-auth` | Sonnet | เขียน docs สำหรับ auth/user APIs |
| `writer-products` | Sonnet | เขียน docs สำหรับ master data APIs (projects, house-models, units) |
| `writer-payment` | Sonnet | เขียน docs สำหรับ budget/promotion/sales APIs |
| `doc-reviewer` | Opus | Rolling review — ตรวจ docs ทันทีที่ writers ส่งมา |

ทุก writer ต้องอ่าน `docs/style-guide.md` ก่อนเขียน

### กลุ่ม 5: Incident Investigators (Ch10)

| Agent | Model | หน้าที่ |
|-------|-------|---------|
| `log-analyzer` | Opus | ตรวจ CI4 logs, PHP error logs, middleware |
| `db-inspector` | Opus | ตรวจ MySQL queries, EXPLAIN, indexes |
| `network-investigator` | Opus | ตรวจ external service calls, cURL |
| `code-auditor` | Opus | ตรวจ git history, recent changes |

ทั้ง 4 ตัวเป็น **read-only** ระหว่างสืบสวน — ใช้ Competing Hypotheses pattern

### กลุ่ม 6: Cross-Repo (Ch11)

| Agent | Model | Isolation | หน้าที่ |
|-------|-------|-----------|---------|
| `library-extractor` | Sonnet | worktree | แยก module ออกเป็น Composer package |
| `consumer-updater` | Sonnet | worktree | ย้าย project ให้ใช้ library ที่แยกออกมา |

### กลุ่ม 7: PromoControl Specialists (ใหม่)

| Agent | Model | หน้าที่ |
|-------|-------|---------|
| `budget-engine` | Opus | ตรวจสอบ budget calculations, balance derivation |
| `promotion-validator` | Opus | ตรวจสอบ eligibility, fee formulas, category logic |
| `bottom-line-importer` | Sonnet | Excel import pipeline (PhpSpreadsheet) |

**budget-engine** ตรวจสอบ:
- Balance = SUM(approved movements) ถูกต้องหรือไม่
- Movement types ครบหรือไม่ (ALLOCATE, USE, RETURN, ADJUST, SPECIAL_BUDGET_*)
- Atomic transaction ทำงานถูกต้องหรือไม่
- Voided movements ถูกตัดออกจาก SUM หรือไม่

**promotion-validator** ตรวจสอบ:
- Profit formula: `net_price = base_price - total_discount`
- Fee formula: `calculated_value = base_amount × effective_rate × buyer_share`
- effective_category ถูกใช้แทน promotion_category หรือไม่
- Eligibility 3 มิติ (house_model AND date AND unit) ถูกต้องหรือไม่

---

## 6. วิธีใช้งานทีละ Agent

### เรียก agent เดี่ยว

```bash
claude --agent <agent-name>
```

### ตัวอย่างการใช้งานแต่ละ agent

**backend — สร้าง API endpoint:**
```bash
claude --agent backend
> อ่าน docs/04-api-spec.md แล้วสร้าง API endpoint สำหรับ
> POST /api/promotion-items ตาม spec ที่กำหนด
> ใส่ business logic ใน PromotionItemService
```

**frontend — สร้าง Angular component:**
```bash
claude --agent frontend
> อ่าน docs/05-frontend-spec.md แล้วสร้าง ProjectListComponent
> ใช้ Angular Material table + Tailwind CSS
> UI labels เป็นภาษาไทย
```

**qa — เขียนและรัน tests:**
```bash
claude --agent qa
> อ่าน docs/10-test-scenarios.md แล้วเขียน integration tests
> สำหรับ budget movement API ด้วย PHPUnit
> ทดสอบว่า balance = SUM(approved movements)
```

**db-migrator — สร้าง migration:**
```bash
claude --agent db-migrator
> อ่าน docs/03-database-schema.md แล้วสร้าง migration
> สำหรับตาราง fee_rate_policies ตาม schema ที่กำหนด
```

**security-reviewer — ตรวจสอบความปลอดภัย:**
```bash
claude --agent security-reviewer
> ตรวจสอบ JWT implementation ใน app/Filters/JwtAuthFilter.php
> และ app/Services/AuthService.php
> เขียน findings ไปที่ docs/review-security.md
```

**budget-engine — ตรวจสอบ budget logic:**
```bash
claude --agent budget-engine
> ตรวจสอบ BudgetMovementService ว่า balance derivation
> ถูกต้องตาม business rules
> เขียน validation report ไปที่ docs/budget-validation.md
```

**promotion-validator — ตรวจสอบ promotion logic:**
```bash
claude --agent promotion-validator
> ตรวจสอบ PromotionCalculationService ว่า fee formula
> และ eligibility logic ถูกต้อง
> เขียน report ไปที่ docs/promotion-validation.md
```

**bottom-line-importer — สร้าง/แก้ไข import pipeline:**
```bash
claude --agent bottom-line-importer
> อ่าน docs/11-bottom-line.md แล้วสร้าง BottomLineImportService
> ที่รองรับ Excel upload, column mapping, backup, rollback
```

---

## 7. วิธีใช้งานเป็นทีม (Agent Teams)

### ขั้นตอนพื้นฐาน

**1. เปิด tmux session (แนะนำ):**
```bash
tmux new -s promocontrol
```

**2. เปิด Claude Code:**
```bash
claude
```

**3. วาง prompt สร้างทีม:**

copy-paste prompt จาก `prompt.md` หรือ `ch06_prompt.md` - `ch11_prompt.md`

### ตัวอย่าง: สร้างทีม 3 คนจาก prompt.md

```
Check if Agent Team is enabled, create team by Agent Teams not subagents.
Create an agent team to build PromoControl, a Promotion & Budget Management
System for real estate with authentication, master data management,
and budget engine.

Tech stack: CodeIgniter 4 + firebase/php-jwt + MySQL (backend),
Angular 21 + Angular Material 21 + Tailwind CSS 3 (frontend),
Docker Compose (5 services).

Spawn 3 teammates with plan approval:
...
```

### กฎสำคัญสำหรับ Lead (คุณ)

1. **ห้ามแก้ code เอง** — ใช้ teammates แก้เสมอ
2. **Reuse teammates** — ถ้า agent ว่างอยู่ ส่ง message แทนการ spawn ใหม่
3. **QA test gate** — หลังทุก fix phase ต้องให้ qa รัน tests ก่อนไปต่อ
4. **Merge worktrees** — หลัง backend + frontend เสร็จ ต้อง merge ก่อนให้ qa test E2E

### Flow การทำงานของทีม

```
backend เขียน API spec + migrations + services
    ↓ message "API spec ready"
frontend อ่าน spec → สร้าง Angular UI     ← ทำงานพร้อมกัน
qa อ่าน spec → เขียน integration tests    ← ทำงานพร้อมกัน
    ↓
Lead merge worktrees
    ↓
Lead บอก qa "worktrees merged, start E2E"
    ↓
qa รัน E2E tests
    ↓ ถ้า fail
Lead ใช้ backend/frontend แก้ → qa test อีกรอบ
    ↓ ถ้า pass
เสร็จ
```

---

## 8. Chapter Prompts

แต่ละ chapter มี prompt สำเร็จรูป — copy-paste ได้เลย

| Chapter | ไฟล์ | สิ่งที่สร้าง | Agents ที่ใช้ |
|---------|------|-------------|--------------|
| Ch6 | `ch06_prompt.md` | Infrastructure + Auth + Master Data | backend, frontend, qa |
| Ch7 | `ch07_prompt.md` | Code Review Pipeline | + security-reviewer, performance-reviewer, test-reviewer |
| Ch8 | `ch08_prompt.md` | Budget Engine (Phased) | + db-migrator, budget-engine |
| Ch9 | `ch09_prompt.md` | API Documentation Sprint | + writer-auth, writer-products, writer-payment, doc-reviewer |
| Ch10 | `ch10_prompt.md` | Incident Response | + log-analyzer, db-inspector, promotion-validator, code-auditor |
| Ch11 | `ch11_prompt.md` | Cross-Repo Module Extraction | + library-extractor, consumer-updater |

### ลำดับที่แนะนำ

**ทำตามลำดับ Ch6 → Ch7 → Ch8 → Ch9 → Ch10 → Ch11** เพราะแต่ละ chapter ต่อยอดจาก chapter ก่อนหน้า

- **Ch6** สร้างฐาน (auth + master data) — ต้องทำก่อนเสมอ
- **Ch7** review code จาก Ch6 — ตรวจคุณภาพก่อนไปต่อ
- **Ch8** เพิ่ม budget engine — ต่อยอดจาก Ch6
- **Ch9** เขียน API docs — document สิ่งที่สร้างใน Ch6+Ch8
- **Ch10** ซ้อม incident response — ใช้กับ code ที่สร้างแล้ว
- **Ch11** แยก module — ใช้กับ code ที่ stable แล้ว

### วิธีใช้ Chapter Prompt

แต่ละ chapter มี 4-5 steps:

**Step 0: ติดตั้ง Skills** — copy skills ที่จำเป็น (ทำครั้งเดียว)

**Step 1: ทดสอบ Agent เดี่ยว** — ทดสอบแต่ละ agent แยกก่อนรวมทีม
```bash
claude --agent backend
> (คำสั่งทดสอบ)
```

**Step 2: รวมเป็นทีม** — เปิด tmux แล้ว copy-paste prompt สร้างทีม
```bash
tmux new -s promocontrol
claude
> (วาง prompt จากไฟล์)
```

**Step 3: สังเกต Coordination** — ดูว่า agents ประสานงานกันถูกต้อง

**Step 4: ตรวจผลลัพธ์** — ตรวจไฟล์ที่สร้าง/แก้ไข

---

## 9. Coordination Patterns

Kit นี้ใช้ 5 patterns หลักในการประสานงานระหว่าง agents:

### Pattern 1: API Spec as Contract (Ch6)

```
backend → เขียน docs/04-api-spec.md → message ถึง frontend + qa
frontend → อ่าน spec → สร้าง API client ตาม spec
qa → อ่าน spec → เขียน tests ตาม spec
```

**ทำไมถึงสำคัญ:** ป้องกัน frontend เรียก path ไม่ตรงกับ backend

### Pattern 2: Review → Fix → Test → Re-Review (Ch7)

```
Phase 1: 3 reviewers ตรวจ code พร้อมกัน (read-only)
Phase 2: Auto-fix CRITICAL issues → qa test
Phase 3: ถาม user เรื่อง HIGH issues → fix ที่เลือก → qa test
Phase 4: Re-review → APPROVE
```

**Human-in-the-loop:** CRITICAL แก้อัตโนมัติ, HIGH ถามก่อน, MEDIUM เลื่อนออกไป

### Pattern 3: Phased Execution (Ch8)

```
Phase 1: db-migrator ทำ migration ก่อน (agents อื่นรอ)
Phase 2: backend + frontend ทำพร้อมกัน (หลัง migration เสร็จ)
Phase 3: merge + test
```

**ทำไมถึงสำคัญ:** Database schema ต้องเสร็จก่อน — ไม่งั้น backend/frontend จะ error

### Pattern 4: Rolling Review (Ch9)

```
3 writers เขียน docs พร้อมกัน
doc-reviewer ตรวจทันทีที่ writer ส่งมา (ไม่รอทุกคนเสร็จ)
writer แก้ตาม feedback → ส่งกลับ → doc-reviewer ตรวจอีกรอบ
```

**ข้อดี:** doc-reviewer ไม่ต้องรอ — เริ่มตรวจได้ทันที

### Pattern 5: Competing Hypotheses (Ch10)

```
4 investigators สืบสวนคนละมุม พร้อมกัน
    ↓
อ่าน findings ของกัน → challenge hypotheses
    ↓
Converge → เหลือ root cause ที่มีหลักฐานมากที่สุด
    ↓
ถาม user เลือก fix approach → backend แก้ → qa test
```

**Anti-anchoring:** ป้องกัน agent ตัวเดียวยึดติดกับทฤษฎีแรก

---

## 10. Skills ที่แนบมา

### frontend-design

**ใช้โดย:** `frontend` agent

**ครอบคลุม:**
- Angular 21 component patterns (standalone, signals, control flow)
- Corporate Navy Premium theme (#16324F primary, #C8A96B accent)
- Angular Material 21 M3 theme configuration
- Tailwind CSS 3 utility patterns
- Responsive layout (sidebar nav, topbar, KPI cards, data tables)
- Fonts: Inter + Noto Sans Thai
- Thai UI label conventions

### webapp-testing

**ใช้โดย:** `qa` agent

**ครอบคลุม:**
- PHPUnit สำหรับ CI4 backend testing
- Angular testing (Jasmine/Karma) สำหรับ component tests
- Playwright สำหรับ E2E testing
- Docker commands สำหรับรัน tests
- PromoControl-specific test scenarios (auth, budget, promotion, sales, bottom-line)
- CI4 seeder สำหรับ test data

---

## 11. การปรับแต่ง

### เปลี่ยน Tech Stack

Agent definitions แยก **configuration** (YAML frontmatter) ออกจาก **context** (body text) ถ้าจะปรับ tech stack ให้แก้แค่ body text:

```yaml
name: backend  # ชื่อเดิม — ไม่ต้องเปลี่ยน
---
You are a backend developer (Laravel, PHP, PostgreSQL).  # เปลี่ยนตรงนี้
```

YAML frontmatter (name, model, tools, permissions) ไม่ต้องเปลี่ยน

### เปลี่ยน Model

```yaml
model: opus    # ใช้สำหรับงานวิเคราะห์/review ที่ต้องการความแม่นยำ
model: sonnet  # ใช้สำหรับงาน build/implement ที่ต้องเขียน code
```

**แนวทาง:** ใช้ Opus สำหรับงานตรวจสอบ/วิเคราะห์ (reviewers, validators), ใช้ Sonnet สำหรับงานเขียน code (builders)

### เพิ่ม Agent ใหม่

สร้างไฟล์ `.md` ใน `.claude/agents/` ตาม format:

```yaml
---
name: my-agent
description: หน้าที่ของ agent ในหนึ่งบรรทัด
model: sonnet
tools: [Read, Write, Edit, Bash, Glob, Grep]
permissionMode: acceptEdits
isolation: worktree
---

คำอธิบายบทบาทของ agent

## Ownership
- ไฟล์/folder ที่ agent นี้ดูแล

## Rules
- กฎที่ต้องปฏิบัติ
```

### Worktree Isolation

- **ใช้ worktree:** agents ที่แก้ไข code (backend, frontend, bottom-line-importer)
- **ไม่ใช้ worktree:** agents ที่อ่านอย่างเดียว (reviewers, validators) หรือที่ต้อง test merged code (qa)

### Permission Modes

| Mode | ใช้กับ | พฤติกรรม |
|------|-------|----------|
| `acceptEdits` | Builders | สร้าง/แก้ไฟล์ได้เลย |
| `plan` | Validators | แค่วิเคราะห์และรายงาน ไม่แก้ code |

---

## 12. คำสั่ง Docker ที่ใช้บ่อย

### Backend (PHP/CI4)

```bash
# รัน migration
docker exec promo_php php /var/www/backend/spark migrate

# rollback migration
docker exec promo_php php /var/www/backend/spark migrate:rollback

# สร้าง migration ใหม่
docker exec promo_php php /var/www/backend/spark migrate:make CreateTableName

# รัน seeders
docker exec promo_php php /var/www/backend/spark db:seed DemoSeeder

# รัน PHPUnit tests
docker exec promo_php php /var/www/backend/vendor/bin/phpunit

# Composer install
docker exec promo_php composer install --working-dir=/var/www/backend

# PHP CS Fixer (ตรวจ code style)
docker exec promo_php php /var/www/backend/vendor/bin/php-cs-fixer fix \
  /var/www/backend/app --dry-run --diff
```

### Frontend (Angular)

```bash
# ดู build logs
docker compose logs -f promo_frontend

# rebuild จากศูนย์
docker compose rm -sf promo_frontend
docker compose up -d promo_frontend

# production build (ตรวจว่า compile ผ่าน)
docker run --rm \
  -v $(pwd)/frontend:/app \
  -w /app \
  node:22-alpine \
  sh -c "npm install && npx ng build"

# type-check only
docker run --rm \
  -v $(pwd)/frontend:/app \
  -w /app \
  node:22-alpine \
  sh -c "npm install && npx tsc --noEmit -p tsconfig.app.json"
```

### Database (MySQL)

```bash
# เข้า MySQL shell
docker exec -it promo_mysql mysql -u promo_user -ppromo_pass promo_db

# รัน SQL query
docker exec promo_mysql mysql -u promo_user -ppromo_pass promo_db \
  -e "SELECT COUNT(*) FROM budget_movements WHERE status='approved';"

# ตรวจ table structure
docker exec promo_mysql mysql -u promo_user -ppromo_pass promo_db \
  -e "SHOW CREATE TABLE budget_movements;"
```

### Docker Compose

```bash
docker compose up -d           # start ทุก services
docker compose down            # stop ทุก services
docker compose ps              # ดูสถานะ containers
docker compose logs -f         # ดู logs ทั้งหมด
docker compose restart promo_php   # restart เฉพาะ PHP
```

---

## 13. แก้ปัญหาที่พบบ่อย

### Agent ไม่ทำงาน

| ปัญหา | สาเหตุ | วิธีแก้ |
|-------|--------|---------|
| `agent not found` | ไม่มีไฟล์ใน .claude/agents/ | ตรวจสอบว่า copy ไฟล์แล้ว |
| Agent ไม่เห็น docs/ | worktree isolation | ตรวจว่า docs/ อยู่ใน repo |
| Agent แก้ไฟล์ผิด | ownership ไม่ชัด | ตรวจ Ownership section ใน agent file |

### Docker / Infrastructure

| ปัญหา | สาเหตุ | วิธีแก้ |
|-------|--------|---------|
| 502 Bad Gateway | container exited | `docker compose up -d promo_frontend` |
| ng serve exits | flag ผิด | ใช้ `--allowed-hosts all` |
| API 404 | route prefix ผิด | ทุก API route ต้องขึ้นต้นด้วย `/api/` |
| DB connection error | MySQL ยังไม่พร้อม | รอ 10 วินาทีหลัง `docker compose up` |
| PHP changes ไม่ update | Opcache | `docker compose restart promo_php` |
| npm/ng error บน host | Node version ผิด | ห้ามรัน npm/ng บน host — ใช้ Docker เท่านั้น |

### Agent Teams

| ปัญหา | สาเหตุ | วิธีแก้ |
|-------|--------|---------|
| Agents ทำงานชนกัน | ownership ซ้ำ | ตรวจว่าแต่ละ agent มี ownership แยกกัน |
| Worktree merge conflict | แก้ไฟล์เดียวกัน | ให้ backend แก้ก่อน แล้ว frontend ตามทีหลัง |
| qa test fail หลัง merge | code ไม่ compatible | ใช้ backend/frontend แก้ แล้ว qa test อีกรอบ |
| Agent spawn ซ้ำ | ไม่ reuse | ส่ง message ถึง agent ที่ว่าง แทน spawn ใหม่ |

---

## 14. Best Practices

### การเริ่มต้น

1. **ทดสอบ agent เดี่ยวก่อน** — ก่อนรวมทีม ให้ทดสอบแต่ละ agent แยกกันก่อนเสมอ
2. **อ่าน docs ก่อน code** — สั่งให้ agent อ่าน docs/ ก่อนลงมือสร้าง
3. **เริ่มจาก Ch6** — ทำตามลำดับ chapter เพื่อให้ได้พื้นฐานที่แข็งแรง

### การประสานงาน

4. **API Spec First** — backend เขียน spec ก่อนเสมอ แล้วค่อย message ทีม
5. **อย่าแก้ code เอง** — ใช้ teammates แก้ ถึงจะเห็นว่าง่าย
6. **Reuse agents** — ส่ง message ถึง agent ที่ว่าง แทนการ spawn ตัวใหม่
7. **QA test gate** — หลังทุก fix ต้องรัน tests ก่อนไปขั้นตอนถัดไป

### Business Logic

8. **อย่าแก้สูตร** — สูตรคำนวณกำไร, fee formula, budget balance ห้ามเปลี่ยน
9. **ใช้ effective_category** — ทุกการคำนวณต้องใช้ effective_category ไม่ใช่ promotion_category
10. **Budget ผ่าน movements** — ห้ามอัพเดท balance ตรง ต้องสร้าง movement เสมอ
11. **ใช้ validators** — หลัง implement budget/promotion logic ให้ budget-engine และ promotion-validator ตรวจสอบ

### ภาษา

12. **Code = English** — ชื่อตัวแปร, functions, classes, DB columns, API paths
13. **UI = ไทย** — labels, placeholders, error messages, validation messages
14. **Comments = ไทย** — business logic comments เป็นภาษาไทย

### การ Review

15. **ใช้ Ch7 pipeline** — หลังสร้าง feature ใหม่ ให้รัน review pipeline ทุกครั้ง
16. **CRITICAL = auto-fix** — ไม่ต้องถาม แก้เลย
17. **HIGH = ถาม user** — ให้ user ตัดสินใจว่าจะแก้ตอนนี้หรือเลื่อนออกไป
18. **Deferred issues** — จด issues ที่เลื่อนไว้ ไม่ใช่ลืม

---

## ภาคผนวก: Agent Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│  Agent Teams Kit — PromoControl Edition                     │
│  20 Agents | CI4 + Angular 21 + MySQL                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  BUILDERS          REVIEWERS         SPECIALISTS            │
│  ─────────         ─────────         ───────────            │
│  backend (S)       security (O)      budget-engine (O)      │
│  frontend (S)      performance (O)   promotion-validator (O)│
│  qa (O)            test (O)          bottom-line-importer(S)│
│                                                             │
│  DATABASE          DOCS              INVESTIGATORS          │
│  ────────          ────              ─────────────          │
│  db-migrator (S)   writer-auth (S)   log-analyzer (O)       │
│                    writer-prod (S)   db-inspector (O)       │
│  CROSS-REPO        writer-pay (S)    network-inv (O)        │
│  ──────────        doc-reviewer (O)  code-auditor (O)       │
│  lib-extractor(S)                                           │
│  consumer-upd (S)  (S)=Sonnet (O)=Opus                     │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Quick Commands:                                            │
│  claude --agent backend    # ทดสอบ agent เดี่ยว              │
│  tmux new -s promo         # เปิด session                   │
│  claude                    # เปิด Claude Code               │
│  > (วาง prompt จาก ch06)   # สร้างทีม                       │
└─────────────────────────────────────────────────────────────┘
```
