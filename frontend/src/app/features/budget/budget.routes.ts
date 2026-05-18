import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards/role.guard';
import { BudgetMovementsComponent } from './budget-movements/budget-movements.component';
import { SpecialBudgetComponent } from './special-budget/special-budget.component';
import { UnitBudgetSettingsComponent } from './unit-budget-settings/unit-budget-settings.component';

export const BUDGET_ROUTES: Routes = [
  { path: 'movements', component: BudgetMovementsComponent, canActivate: [roleGuard], data: { roles: ['admin', 'manager'] } },
  { path: 'special',   component: SpecialBudgetComponent,   canActivate: [roleGuard], data: { roles: ['admin', 'manager'] } },
  { path: 'unit-settings',   component: UnitBudgetSettingsComponent, canActivate: [roleGuard], data: { roles: ['admin', 'manager'] } },
];
