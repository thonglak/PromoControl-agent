import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards/role.guard';
import { BudgetMovementsComponent } from './budget-movements/budget-movements.component';
import { BudgetTransferComponent } from './budget-transfer/budget-transfer.component';
import { SpecialBudgetComponent } from './special-budget/special-budget.component';
import { UnitBudgetReturnComponent } from './unit-budget-return/unit-budget-return.component';

export const BUDGET_ROUTES: Routes = [
  { path: 'movements', component: BudgetMovementsComponent, canActivate: [roleGuard], data: { roles: ['admin', 'manager'] } },
  { path: 'transfer',  component: BudgetTransferComponent,  canActivate: [roleGuard], data: { roles: ['admin', 'manager'] } },
  { path: 'special',   component: SpecialBudgetComponent,   canActivate: [roleGuard], data: { roles: ['admin', 'manager'] } },
  { path: 'unit-return-pool', component: UnitBudgetReturnComponent, canActivate: [roleGuard], data: { roles: ['admin', 'manager'] } },
];
