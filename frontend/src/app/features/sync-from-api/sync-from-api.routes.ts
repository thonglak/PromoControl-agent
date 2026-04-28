import { Routes } from '@angular/router';
import { SyncFromApiListComponent } from './sync-from-api-list.component';
import { ExternalApiConfigListComponent } from './configs/external-api-config-list.component';
import { SnapshotDetailComponent } from './detail/snapshot-detail.component';
import { ApiDebugComponent } from './debug/api-debug.component';
import { ApiFieldMappingListComponent } from './mappings/api-field-mapping-list.component';

export const SYNC_FROM_API_ROUTES: Routes = [
  { path: '',         component: SyncFromApiListComponent,    pathMatch: 'full' },
  { path: 'configs',  component: ExternalApiConfigListComponent },
  { path: 'debug',    component: ApiDebugComponent },
  { path: 'mappings', component: ApiFieldMappingListComponent },
  {
    path: 'targets',
    loadComponent: () => import('./targets/sync-target-table-list.component')
      .then(m => m.SyncTargetTableListComponent),
    data: { title: 'ตั้งค่า Target Tables' },
  },
  { path: ':id',      component: SnapshotDetailComponent },
];
