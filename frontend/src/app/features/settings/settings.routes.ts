import { Routes } from '@angular/router';
import { NumberSeriesListComponent } from './pages/number-series-list.component';
import { DateFormatSettingsComponent } from './pages/date-format-settings.component';
import { FixErrorComponent } from './pages/fix-error.component';
import { ImportConfigListComponent } from '../import-settings/import-config-list/import-config-list.component';
import { ImportPreviewComponent } from '../import-settings/import-preview/import-preview.component';

export const SETTINGS_ROUTES: Routes = [
  { path: 'number-series', component: NumberSeriesListComponent },
  { path: 'date-format', component: DateFormatSettingsComponent },
  { path: 'fix-error', component: FixErrorComponent },
  { path: 'import-configs', component: ImportConfigListComponent },
  { path: 'import-preview', component: ImportPreviewComponent },
  { path: '', redirectTo: 'number-series', pathMatch: 'full' },
];
