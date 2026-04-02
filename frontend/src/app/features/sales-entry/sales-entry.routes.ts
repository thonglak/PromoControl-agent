import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards/role.guard';

export const SALES_ENTRY_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./sales-entry.component').then(m => m.SalesEntryComponent),
    canActivate: [roleGuard],
    data: { roles: ['admin', 'manager', 'sales'] },
  },
  {
    path: 'list',
    loadComponent: () => import('./sales-list/sales-list.component').then(m => m.SalesListComponent),
    canActivate: [roleGuard],
    data: { roles: ['admin', 'manager', 'sales', 'finance', 'viewer'] },
  },
  {
    path: ':id',
    loadComponent: () => import('./sales-detail/sales-detail.component').then(m => m.SalesDetailComponent),
    canActivate: [roleGuard],
    data: { roles: ['admin', 'manager', 'sales', 'finance', 'viewer'] },
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./sales-entry.component').then(m => m.SalesEntryComponent),
    canActivate: [roleGuard],
    data: { roles: ['admin', 'manager'] },
  },
];
