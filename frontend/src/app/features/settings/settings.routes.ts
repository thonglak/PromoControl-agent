import { Routes } from '@angular/router';
import { NumberSeriesListComponent } from './pages/number-series-list.component';
import { DateFormatSettingsComponent } from './pages/date-format-settings.component';
import { SystemSettingsComponent } from './pages/system-settings.component';
import { ValueSourceListComponent } from './value-sources/value-source-list.component';
import { roleGuard } from '../../core/guards/role.guard';

export const SETTINGS_ROUTES: Routes = [
  { path: 'number-series', component: NumberSeriesListComponent },
  { path: 'date-format', component: DateFormatSettingsComponent },
  { path: 'system', component: SystemSettingsComponent },
  { path: 'value-sources', component: ValueSourceListComponent, canActivate: [roleGuard], data: { roles: ['admin'] } },
  { path: '', redirectTo: 'number-series', pathMatch: 'full' },
];
