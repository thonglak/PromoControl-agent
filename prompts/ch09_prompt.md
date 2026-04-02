# Ch9 Project: PromoControl API Documentation Sprint — Rolling Review

## Prerequisites
- PromoControl from ch6-8 (with budget endpoints from ch8)
- New agents: `writer-auth.md`, `writer-products.md` (master data), `writer-payment.md` (budget), `doc-reviewer.md`
- `docs/04-api-spec.md` exists from ch6+ch8
- `docs/style-guide.md` — documentation style guide (terminology, format, Thai UI descriptions)

## Step 1: ทดสอบ writer แยก

```bash
claude --agent writer-auth
> Document the POST /api/auth/login endpoint.
> Read docs/04-api-spec.md, docs/08-authentication.md and source code first.
> Write to docs/api/auth.md
```

## Step 2: รวมเป็นทีมด้วย Agent Teams

```bash
tmux new -s docs
claude
```

### Prompt สร้างทีม:

```
Check if Agent Team is enabled, create team by Agent Teams not subagents.
PromoControl API documentation sprint. The API has endpoints across
3 domains: auth/users, master-data (projects/models/units),
and budget (promotions/movements/summaries).
docs/04-api-spec.md has the endpoint definitions.

IMPORTANT RULES:
- ALL writers must read docs/style-guide.md FIRST before writing
- REUSE existing teammates: send message if idle, don't spawn new
- Writers message doc-reviewer when each file is ready
- doc-reviewer reviews against docs/style-guide.md (rolling review)

Spawn 4 teammates:

1. writer-auth: Document auth + user endpoints (5 endpoints).
   Write to docs/api/auth.md and docs/api/users.md.
   Read docs/style-guide.md first, then docs/04-api-spec.md,
   docs/08-authentication.md and source code.

2. writer-products: Document master data endpoints (projects, house-models, units).
   Write to docs/api/projects.md, docs/api/house-models.md, and docs/api/units.md.
   (9 endpoints total)

3. writer-payment: Document promotion + budget endpoints (from ch8).
   Write to docs/api/promotions.md and docs/api/budgets.md.
   (8 endpoints total)

4. doc-reviewer (Opus): Rolling review — check each doc as writers
   submit. Verify against docs/style-guide.md, docs/04-api-spec.md,
   source code, and business rules (docs/02-business-rules.md).
   Send feedback to writers if issues found.
   After all approved, create docs/api/index.md.

All writers work in parallel. doc-reviewer reviews as docs come in
(rolling review — don't wait for all writers to finish).
Writers revise based on feedback and re-submit.

=== FINAL STEP: INTERACTIVE API DOCS PAGE ===

After all docs approved, generate an interactive API documentation page
served by PromoControl at /api-docs (via Nginx).
The page should:
- Read all approved docs/api/*.md files
- Convert to a single-page HTML with sidebar navigation
- Group endpoints by domain (Auth, Master Data, Budget)
- Include request/response examples with syntax highlighting
- Show Thai UI field names alongside English code names
- Add authentication info (JWT header format)
- Save to public/api-docs.html (served as static file by Nginx)
- Style: clean, professional API docs (like Swagger/OpenAPI style)
- No external CDN dependencies — inline all CSS/JS

After HTML docs are ready, ask me if I want to run the ch7 review
pipeline to do a final quality check on the documentation.
```

> **Key Concepts:**
> - `docs/style-guide.md` as style source of truth — NOT CLAUDE.md (avoids polluting other agents' context)
> - Rolling review: doc-reviewer checks docs as they arrive, not after all done
> - API spec as content source of truth: writers read docs/04-api-spec.md for accuracy
> - Budget docs from ch8: writer-payment documents the new promotion + budget endpoints
> - Bilingual: show Thai labels for UI, English for code
> - Human-in-the-loop at end: ask user about running review pipeline

## Step 3: สังเกต Rolling Review

สิ่งที่ควรเกิดขึ้น:
- 3 writers start in parallel, each writing their domain
- writer-auth finishes first → messages doc-reviewer
- doc-reviewer reviews immediately (doesn't wait for others)
- doc-reviewer sends feedback → writer-auth revises → re-submits
- Meanwhile writer-products and writer-payment continue working
- Feedback loop continues until all docs approved
- doc-reviewer creates docs/api/index.md

## Step 4: ตรวจผลลัพธ์

- `docs/api/auth.md` — auth endpoints
- `docs/api/users.md` — user endpoints
- `docs/api/projects.md` — projects endpoints
- `docs/api/house-models.md` — house models endpoints
- `docs/api/units.md` — units endpoints
- `docs/api/promotions.md` — promotion items endpoints (from ch8)
- `docs/api/budgets.md` — budget movements endpoints (from ch8)
- `docs/api/index.md` — index page
- `public/api-docs.html` — interactive HTML docs page

## Roster Update

```
After ch9: 13 agents total
  backend, frontend, qa          (from ch6)
  security-reviewer              (from ch7)
  performance-reviewer           (from ch7)
  test-reviewer                  (from ch7)
  db-migrator                    (from ch8)
  budget-engine                  (from ch8)
  writer-auth                    (NEW in ch9)
  writer-products                (NEW in ch9 — master data docs)
  writer-payment                 (NEW in ch9 — budget docs)
  doc-reviewer                   (NEW in ch9)
```
