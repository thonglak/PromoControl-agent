# Agent Teams Kit — PromoControl Edition (20 Agents)

Copy `_claude/` to your project's `.claude/` directory:

```bash
cp -r _claude/ /path/to/your/project/.claude/
```

That's it. All agents, skills, and permissions are ready.

## Agent Roster

### Core Builders (Ch6)
Build a full-stack app from scratch with 3 teammates working in parallel, using API spec as contract.
| Agent | Model | Description |
|-------|-------|-------------|
| `backend` | Sonnet | CI4 API endpoints, services, database migrations |
| `frontend` | Sonnet | Angular 21 UI, components, pages |
| `qa` | Opus | PHPUnit + Angular tests + E2E tests |

### Code Reviewers (Ch7)
Review → auto-fix CRITICAL → ask user about HIGH issues → QA test gate → re-review until APPROVE.
| Agent | Model | Description |
|-------|-------|-------------|
| `security-reviewer` | Opus | JWT auth, role/access filters, OWASP |
| `performance-reviewer` | Opus | N+1 queries, MySQL indexes, budget SUM queries |
| `test-reviewer` | Opus | PHPUnit/Angular coverage, assertion quality |

### Database Specialist (Ch8)
Add features with phased execution — DB migration must finish before API + frontend can start.
| Agent | Model | Description |
|-------|-------|-------------|
| `db-migrator` | Sonnet | CI4 migrations, MySQL schema |

### Documentation (Ch9)
Write API docs in parallel with rolling review — reviewer checks each doc as it arrives.
| Agent | Model | Description |
|-------|-------|-------------|
| `writer-auth` | Sonnet | Auth + user API docs |
| `writer-products` | Sonnet | Master data API docs (projects, house-models, units) |
| `writer-payment` | Sonnet | Budget + promotion + sales API docs |
| `doc-reviewer` | Opus | Rolling review |

### Incident Investigators (Ch10)
Debug production issues with competing hypotheses — 4 investigators cross-challenge until root cause found.
| Agent | Model | Description |
|-------|-------|-------------|
| `log-analyzer` | Opus | CI4 logs, PHP error logs |
| `db-inspector` | Opus | MySQL queries, indexes, EXPLAIN |
| `network-investigator` | Opus | External service calls |
| `code-auditor` | Opus | Git history analysis |

### Cross-Repo (Ch11)
Extract a module into a standalone library across 2 repos, using CHANGELOG as contract.
| Agent | Model | Description |
|-------|-------|-------------|
| `library-extractor` | Sonnet | Extract Composer package |
| `consumer-updater` | Sonnet | Migrate to extracted library |

### PromoControl Specialists (NEW)
Domain-specific agents for PromoControl business logic.
| Agent | Model | Description |
|-------|-------|-------------|
| `budget-engine` | Opus | Budget movement validation, balance derivation |
| `promotion-validator` | Opus | Promotion eligibility, fee formulas |
| `bottom-line-importer` | Sonnet | Excel import pipeline |

## Prompts

Step-by-step prompts for each chapter — copy-paste ready:

| File | Chapter | What You'll Build |
|------|---------|-------------------|
| `ch06_prompt.md` | Ch6 | PromoControl infrastructure + auth + master data (3 teammates) |
| `ch07_prompt.md` | Ch7 | Code review pipeline with fix loop (6 agents) |
| `ch08_prompt.md` | Ch8 | Budget engine with phased execution |
| `ch09_prompt.md` | Ch9 | API documentation sprint with rolling review |
| `ch10_prompt.md` | Ch10 | Incident response — budget calculation debugging |
| `ch11_prompt.md` | Ch11 | Cross-repo budget module extraction |

## Skills Included
- `frontend-design` — Angular 21 + Material + Tailwind production UI (used by `frontend`)
- `webapp-testing` — PHPUnit/Angular/Playwright testing helpers (used by `qa`)

## Customization

Agents are designed to be **reusable across projects**. To adapt for your stack, change the body text:

```yaml
name: backend  # keep the same name
---
You are a backend developer (CodeIgniter 4, PHP, MySQL).  # change this line
```

The agent name, tools, model, and permissions stay the same — only the body describes your stack.
