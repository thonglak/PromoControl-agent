import { Routes } from '@angular/router';

import { LoginPageComponent } from './features/auth/login-page/login-page.component';
import { ProjectSelectionPageComponent } from './features/project-selection/project-selection-page.component';
import { AppLayoutComponent } from './layout/app-layout/app-layout.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { UserListComponent } from './features/users/user-list/user-list.component';
import { ProjectListComponent } from './features/master-data/projects/project-list/project-list.component';
import { HouseModelListComponent } from './features/master-data/house-models/house-model-list/house-model-list.component';
import { UnitListComponent } from './features/master-data/units/unit-list/unit-list.component';
import { PromotionItemListComponent } from './features/master-data/promotion-items/promotion-item-list/promotion-item-list.component';
import { BottomLineImportComponent } from './features/bottom-line/import/bottom-line-import.component';
import { BottomLineHistoryComponent } from './features/bottom-line/history/bottom-line-history.component';
import { BottomLineDetailComponent } from './features/bottom-line/detail/bottom-line-detail.component';
import { BottomLineMappingComponent } from './features/bottom-line/mappings/bottom-line-mapping.component';
import { ComingSoonComponent } from './shared/components/coming-soon/coming-soon.component';

import { FeeFormulaListComponent } from './features/fee-formula/formula-list/fee-formula-list.component';
import { FeeRatePolicyListComponent } from './features/fee-formula/policy-list/fee-rate-policy-list.component';
import { FeeFormulaTesterComponent } from './features/fee-formula/tester/fee-formula-tester.component';
import { ClearTransactionsComponent } from './features/dev-tools/clear-transactions/clear-transactions.component';

import { authGuard } from './core/guards/auth.guard';
import { projectGuard } from './core/guards/project.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [

  { path: 'login', component: LoginPageComponent },

  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: 'select-project', component: ProjectSelectionPageComponent },

      {
        path: '',
        canActivate: [projectGuard],
        component: AppLayoutComponent,
        children: [
          { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
          { path: 'dashboard', component: DashboardComponent },

          // ── Master Data ──────────────────────────────────────────
          { path: 'users',            component: UserListComponent,       canActivate: [roleGuard], data: { roles: ['admin'] } },
          { path: 'projects',         component: ProjectListComponent,    canActivate: [roleGuard], data: { roles: ['admin', 'manager'] } },
          { path: 'house-models',     component: HouseModelListComponent, canActivate: [roleGuard], data: { roles: ['admin', 'manager'] } },
          { path: 'units',            component: UnitListComponent,       canActivate: [roleGuard], data: { roles: ['admin', 'manager'] } },
          { path: 'promotion-items',  component: PromotionItemListComponent,     canActivate: [roleGuard], data: { roles: ['admin', 'manager'] } },

          // ── Bottom Line (ราคาต้นทุน) ────────────────────────────
          { path: 'bottom-line/import',  component: BottomLineImportComponent,  canActivate: [roleGuard], data: { roles: ['admin', 'manager'] } },
          { path: 'bottom-line/history', component: BottomLineHistoryComponent, canActivate: [roleGuard], data: { roles: ['admin', 'manager', 'finance', 'viewer'] } },
          { path: 'bottom-line/history/:importKey', component: BottomLineDetailComponent, canActivate: [roleGuard], data: { roles: ['admin', 'manager', 'finance', 'viewer'] } },
          { path: 'bottom-line/mapping', component: BottomLineMappingComponent, canActivate: [roleGuard], data: { roles: ['admin', 'manager'] } },

          // ── Sales Entry (lazy loaded) ────────────────────────────
          {
            path: 'sales',
            loadChildren: () => import('./features/sales-entry/sales-entry.routes').then(m => m.SALES_ENTRY_ROUTES),
          },

          // ── Sales & Promotions ───────────────────────────────────
          { path: 'unit-promotions',  component: ComingSoonComponent, canActivate: [roleGuard], data: { roles: ['admin', 'manager'] } },

          // ── Fee Formulas (สูตรคำนวณ) ────────────────────────────
          { path: 'fee-formulas',                      component: FeeFormulaListComponent,    canActivate: [roleGuard], data: { roles: ['admin', 'manager'] } },
          { path: 'fee-formulas/tester',               component: FeeFormulaTesterComponent,   canActivate: [roleGuard], data: { roles: ['admin', 'manager'] } },
          { path: 'fee-formulas/:formulaId/policies',  component: FeeRatePolicyListComponent,  canActivate: [roleGuard], data: { roles: ['admin', 'manager'] } },

          // ── Budget ───────────────────────────────────────────────
          {
            path: 'budget',
            loadChildren: () => import('./features/budget/budget.routes').then(m => m.BUDGET_ROUTES),
            canActivate: [roleGuard]
          },

          // ── Reports & Settings ───────────────────────────────────
          {
            path: 'reports',
            loadComponent: () => import('./features/reports/pages/reports-page.component').then(m => m.ReportsPageComponent),
            canActivate: [roleGuard],
            data: { roles: ['admin', 'manager', 'finance', 'viewer'] },
          },
          {
            path: 'settings',
            loadChildren: () => import('./features/settings/settings.routes').then(m => m.SETTINGS_ROUTES),
            canActivate: [roleGuard],
            data: { roles: ['admin', 'manager'] },
          },

          // ── Dev Tools (ทดสอบ) ────────────────────────────────────
          { path: 'dev/clear-transactions', component: ClearTransactionsComponent, canActivate: [roleGuard], data: { roles: ['admin'] } },
        ],
      },
    ],
  },

  { path: '**', redirectTo: 'login' },
];
