---
name: webapp-testing
description: Testing toolkit for PromoControl (Angular 21 frontend + CodeIgniter 4 backend). Supports PHPUnit for backend tests, Jasmine/Karma for Angular unit/integration tests, and Playwright for E2E testing. All commands run via Docker containers.
license: Complete terms in LICENSE.txt
---

# PromoControl Testing Toolkit

Test local web applications using Docker-based testing frameworks. PromoControl uses a multi-tier testing approach:

1. **Backend (PHP)**: PHPUnit tests via Docker
2. **Frontend (Angular)**: Jasmine/Karma tests via Docker
3. **End-to-End**: Playwright for full workflow validation

All commands assume Docker containers are running. The host has Node 15 (insufficient for modern Angular tooling), so all frontend commands must run in the Docker container.

## Technology Stack

**Backend Testing**:
- PHPUnit (CodeIgniter 4 standard)
- Test database seeders for fixtures
- Docker: `docker exec promo_php [command]`

**Frontend Testing**:
- Jasmine test framework
- Karma test runner
- Angular testing utilities
- Docker: `docker exec promo_frontend ng test` or `docker exec promo_frontend npm test`

**E2E Testing**:
- Playwright (if browser-based E2E needed)
- Test data via CI4 seeders
- Docker: Run Playwright scripts against running containers

**Test Data**:
- CI4 seeders: `database/seeds/`
- Database state reset between test runs
- Avoid mocking when integration test data is available

## Backend Testing (PHPUnit)

Run PHPUnit tests via the `promo_php` container:

```bash
# Run all tests
docker exec promo_php vendor/bin/phpunit

# Run specific test file
docker exec promo_php vendor/bin/phpunit tests/unit/AuthTest.php

# Run with coverage
docker exec promo_php vendor/bin/phpunit --coverage-html=coverage/
```

### Backend Test Scenarios for PromoControl

Based on `docs/10-test-scenarios.md`:

**Authentication**:
- Login with valid credentials
- JWT token generation and refresh
- Role-based access control (Admin, Manager, Staff)
- Token expiration handling

**Budget Management**:
- Create movement (cost line)
- Balance validation (SUM query on all movements)
- Pool management and limits
- Prevent overspending

**Promotion Features**:
- Eligibility filtering (by category, tier, discount rule)
- Fee formula calculation (base + percentage rules)
- Approval workflow

**Sales Operations**:
- Create sales transaction
- Cancel with void movement
- Mark as transferred status
- Audit trail logging

**Bottom Line Reconciliation**:
- Excel import (parse file, validate data)
- Backup current state
- Rollback to previous state
- Difference reporting

## Frontend Testing (Angular/Jasmine)

Run Angular tests via the `promo_frontend` container:

```bash
# Run all tests (watch mode)
docker exec promo_frontend ng test

# Run tests once (CI mode)
docker exec promo_frontend ng test --watch=false --browsers=ChromeHeadless

# Run specific test file
docker exec promo_frontend ng test --include='**/login.component.spec.ts'

# With coverage
docker exec promo_frontend ng test --code-coverage
```

### Frontend Test Patterns

**Component Tests**:
```typescript
// Use Angular's testing utilities
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DebugElement } from '@angular/core';

describe('BudgetCard', () => {
  let component: BudgetCardComponent;
  let fixture: ComponentFixture<BudgetCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BudgetCardComponent, /* Material imports */],
    }).compileComponents();

    fixture = TestBed.createComponent(BudgetCardComponent);
    component = fixture.componentInstance;
  });

  it('displays budget data', () => {
    component.budget = { amount: 1000, spent: 250 };
    fixture.detectChanges();

    const element: DebugElement = fixture.debugElement;
    expect(element.query(By.css('.budget-amount')).nativeElement.textContent).toContain('1000');
  });
});
```

**Service Tests**:
```typescript
// Test API calls, state management, business logic
describe('BudgetService', () => {
  let service: BudgetService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [BudgetService],
    });
    service = TestBed.inject(BudgetService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('fetches budgets', () => {
    service.getBudgets().subscribe(data => {
      expect(data.length).toBe(2);
    });

    const req = httpMock.expectOne('/api/budgets');
    req.flush([{ id: 1, amount: 1000 }, { id: 2, amount: 2000 }]);
  });
});
```

## E2E Testing (Playwright)

For full workflow testing, use Playwright to validate frontend + backend interaction:

```bash
# Install Playwright (in container)
docker exec promo_frontend npm install -D @playwright/test

# Run E2E tests
docker exec promo_frontend npx playwright test

# Run with UI mode (for debugging)
docker exec promo_frontend npx playwright test --ui
```

### E2E Test Pattern

```typescript
import { test, expect } from '@playwright/test';

test('Complete budget workflow', async ({ page }) => {
  // Setup: seed database
  // await seedTestData();

  // Navigate to login
  await page.goto('http://localhost:4200/login');

  // Login
  await page.fill('input[placeholder="Email"]', 'user@test.com');
  await page.fill('input[type="password"]', 'password');
  await page.click('button:has-text("Login")');

  // Verify redirect to dashboard
  await expect(page).toHaveURL('http://localhost:4200/dashboard');

  // Create budget
  await page.click('button:has-text("Create Budget")');
  await page.fill('input[placeholder="Budget Name"]', 'Q2 Marketing');
  await page.fill('input[placeholder="Amount"]', '50000');
  await page.click('button:has-text("Save")');

  // Verify budget created
  await expect(page.locator('text=Q2 Marketing')).toBeVisible();
});
```

## Test Data Management

**Using CI4 Seeders**:

```bash
# Run seeders to populate test data
docker exec promo_php php spark db:seed TestDataSeeder

# Reset database before tests
docker exec promo_php php spark migrate:refresh --seeder=TestDataSeeder
```

**Fixture Structure**:
```
database/seeds/
├── TestDataSeeder.php       # Master seeder
├── UserSeeder.php           # User fixtures
├── BudgetSeeder.php         # Budget fixtures
└── PromotionSeeder.php      # Promotion fixtures
```

## Docker Development Workflow

1. **Start containers** (if not running):
   ```bash
   docker-compose up -d
   ```

2. **Run backend tests**:
   ```bash
   docker exec promo_php vendor/bin/phpunit
   ```

3. **Run frontend tests**:
   ```bash
   docker exec promo_frontend ng test --watch=false
   ```

4. **Check logs**:
   ```bash
   docker logs promo_php      # Backend logs
   docker logs promo_frontend # Frontend logs
   docker logs promo_mysql    # Database logs
   ```

## Common Test Selectors (Angular)

For Playwright E2E scripts, use these selector strategies:

```typescript
// By role (preferred for accessibility)
await page.click('button:has-text("Save")');
await page.fill('[aria-label="Budget Name"]', 'Q2 2026');

// By test ID (add data-testid="..." to components)
await page.click('[data-testid="submit-button"]');

// By placeholder
await page.fill('input[placeholder="Email"]', 'user@example.com');

// By label text
await page.click('text=Create Budget');
```

## Reference Files

- **docs/10-test-scenarios.md** - Detailed test scenarios and workflows
- **tests/unit/** - Backend PHPUnit tests
- **src/app/**/*.spec.ts** - Frontend Jasmine tests
- **e2e/** - End-to-end Playwright tests (if present)